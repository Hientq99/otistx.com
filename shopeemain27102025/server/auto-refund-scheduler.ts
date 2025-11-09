/**
 * AUTO-REFUND SCHEDULER - OPTIMIZED VERSION
 * ========================================
 * 
 * Background scheduler tự động kiểm tra và hoàn tiền các session hết hạn
 * TỐI ƯU HÓA: Chạy mỗi 2 phút, giảm database load, tăng performance
 * Không phụ thuộc vào frontend, hoạt động 24/7
 */

import { storage } from './storage';

// Import refund functions
import { processOtissimV1Refund, processOtissimV2Refund, processOtissimV3Refund, processTiktokRentalRefund } from './refund-handlers';

// Import Shopee v2 global queue functions
import { removeFromShopeeV2GlobalQueue } from './shopee-v2-global-queue';

// OPTIMIZATION CONSTANTS v4 - BALANCED UX & EGRESS
const CHECK_INTERVAL_MS = 120000; // 2 phút - Tần suất cao hơn cho hoàn tiền nhanh
const BATCH_SIZE = 500; // 🚨 CRITICAL FIX: Match Phone LIMIT (250+250=500) to prevent missing sessions
const LOG_EVERY_N_CHECKS = 48; // Chỉ log mỗi 24 giờ (48 * 30min)
const MAX_CONCURRENT_REFUNDS = 2; // Giảm concurrent để save connections
const SMART_POLLING_THRESHOLD = 5; // Tăng threshold để skip queries aggressively

let schedulerInterval: NodeJS.Timeout | null = null;
let isRunning = false;
let lastCheckTime = new Date(0); // Initialize to epoch to force full scan on first run
let nextCheckTime = new Date();
let totalChecks = 0;
let lastResult = { phoneRentals: 0, tiktokRentals: 0, timestamp: new Date().toISOString() };
let lastExpiredCount = 0; // Cache để tránh query không cần thiết

// FIXED CACHE LOGIC: TTL-based cache per architect recommendation
interface ProcessedSession {
  sessionId: string;
  timestamp: number;
  reason: 'refunded' | 'verified_existing_refund';
}

const processedSessionsCache = new Map<string, ProcessedSession>(); // TTL-based cache
const PROCESSED_CACHE_TTL = 20 * 60 * 1000; // 20 minutes TTL - Cân bằng cache và accuracy
const CACHE_CLEANUP_INTERVAL = 30 * 60 * 1000; // Clean up every 30 minutes để giảm operations
let lastCleanupTime = Date.now();

// CLEANUP EXPIRED CACHE ENTRIES FUNCTION
function cleanupExpiredCacheEntries(): void {
  if (Date.now() - lastCleanupTime > CACHE_CLEANUP_INTERVAL) {
    const now = Date.now();
    for (const [sessionId, session] of Array.from(processedSessionsCache.entries())) {
      if (now - session.timestamp > PROCESSED_CACHE_TTL) {
        processedSessionsCache.delete(sessionId);
      }
    }
    lastCleanupTime = now;
  }
}

/**
 * Kiểm tra và hoàn tiền phone rental sessions hết hạn - OPTIMIZED
 */
async function checkAndRefundExpiredPhoneRentals(): Promise<number> {
  try {
    // INCREMENTAL OPTIMIZATION: Chỉ lấy sessions expired kể từ lần check trước
    // Fallback to full scan nếu là lần đầu chạy (lastCheckTime too old)
    const timeSinceLastCheck = Date.now() - lastCheckTime.getTime();
    // AGGRESSIVE SMART POLLING: Skip database query more aggressively
    if (totalChecks > 0 && lastExpiredCount === 0 && timeSinceLastCheck < 1800000) { // 30 minutes
      const shouldLogSkip = totalChecks % (LOG_EVERY_N_CHECKS * 4) === 0;
      if (shouldLogSkip) {
        console.log(`[AUTO-REFUND] 🚀 SMART SKIP: No expired sessions, skipping query for 1h`);
      }
      return 0;
    }
    
    // OPTIMIZED INCREMENTAL: Much longer threshold để giảm full scans
    const useIncrementalCheck = totalChecks > 0 && timeSinceLastCheck < 7200000; // 2 hours threshold
    
    let allExpiredSessions;
    if (useIncrementalCheck) {
      // INCREMENTAL: Chỉ check sessions expired since last check
      allExpiredSessions = await storage.getExpiredPhoneRentalsSince(lastCheckTime, 1000);
      const shouldLogDetails = totalChecks % LOG_EVERY_N_CHECKS === 0;
      if (shouldLogDetails && allExpiredSessions.length > 0) {
        console.log(`[AUTO-REFUND] Using INCREMENTAL check (since ${lastCheckTime.toISOString()})`);
      }
    } else {
      // FALLBACK: Full scan for first run or after long gaps
      allExpiredSessions = await storage.getAllExpiredPhoneRentalSessions();
      console.log(`[AUTO-REFUND] Using FULL SCAN (time gap: ${Math.round(timeSinceLastCheck/1000)}s > 300s threshold)`);
    }
    
    // SKIP PROCESSED: Lọc ra chỉ những sessions chưa được xử lý
    const expiredSessions = allExpiredSessions.filter(session => {
      const cached = processedSessionsCache.get(session.sessionId);
      if (cached && (Date.now() - cached.timestamp) < PROCESSED_CACHE_TTL) {
        return false; // Skip if still in cache and not expired
      }
      return true; // Process if not in cache or cache expired
    });
    
    if (expiredSessions.length === 0) {
      // Chỉ log khi có sessions bị skip
      if (allExpiredSessions.length > 0) {
        const shouldLogDetails = totalChecks % LOG_EVERY_N_CHECKS === 0;
        if (shouldLogDetails) {
          console.log(`[AUTO-REFUND] Skipped ${allExpiredSessions.length} already processed phone sessions`);
        }
      }
      return 0;
    }
    
    // OPTIMIZATION: Chỉ log khi có sessions mới cần xử lý
    const shouldLogDetails = totalChecks % LOG_EVERY_N_CHECKS === 0 || expiredSessions.length !== lastExpiredCount;
    if (shouldLogDetails) {
      console.log(`[AUTO-REFUND] Found ${expiredSessions.length} new expired phone rental sessions (${allExpiredSessions.length - expiredSessions.length} already processed)`);
    }
    
    // OPTIMIZATION: Xử lý tuần tự để tránh database connection exhaustion
    const sessionsToProcess = expiredSessions.slice(0, BATCH_SIZE);
    let processedCount = 0;
    
    for (const session of sessionsToProcess) {
      try {
        // RACE CONDITION PROTECTION: Check if session is already being processed
        const currentSession = await storage.getPhoneRentalHistoryBySession(session.sessionId);
        if (!currentSession) {
          if (shouldLogDetails) {
            console.log(`[AUTO-REFUND] Session ${session.sessionId} không tồn tại, bỏ qua`);
          }
          // DON'T mark as processed - session might appear later
          continue;
        }
        
        // Check if session is eligible for refund (waiting OR expired without refund)
        const isWaiting = currentSession.status === 'waiting';
        const isExpiredWithoutRefund = currentSession.status === 'expired';
        
        if (!isWaiting && !isExpiredWithoutRefund) {
          if (shouldLogDetails) {
            console.log(`[AUTO-REFUND] Session ${session.sessionId} status: ${currentSession.status}, bỏ qua`);
          }
          // DON'T mark as processed - status might change
          continue;
        }
        
        // For expired sessions, check if already refunded using SCHEMA-BASED approach (consistent with refund handlers)
        if (isExpiredWithoutRefund) {
          try {
            const isAlreadyRefunded = await storage.isPhoneRentalRefundProcessed(session.sessionId);
            if (isAlreadyRefunded) {
              if (shouldLogDetails) {
                console.log(`[AUTO-REFUND] Session ${session.sessionId} đã được hoàn tiền (schema-based check), bỏ qua`);
              }
              // MARK AS PROCESSED: Verified existing refund via schema
              processedSessionsCache.set(session.sessionId, {
                sessionId: session.sessionId,
                timestamp: Date.now(),
                reason: 'verified_existing_refund'
              });
              continue;
            }
          } catch (error) {
            // Fallback to transaction-based checking if schema not available
            console.log(`[AUTO-REFUND] Schema checking failed for session ${session.sessionId}, falling back to transaction-based checking`);
            const servicePrefix = session.service === 'otissim_v1' ? 'otissim_v1_refund' : 
                                session.service === 'otissim_v2' ? 'otissim_v2_refund' : 
                                session.service === 'otissim_v3' ? 'otissim_v3_refund' : '';
            
            if (servicePrefix) {
              const refundReference = `${servicePrefix}_${session.userId}_${session.sessionId}`;
              const existingRefund = await storage.getTransactionByReference(refundReference);
              
              if (existingRefund) {
                if (shouldLogDetails) {
                  console.log(`[AUTO-REFUND] Session ${session.sessionId} đã được hoàn tiền (ref: ${refundReference}), bỏ qua`);
                }
                // MARK AS PROCESSED: Verified existing refund
                processedSessionsCache.set(session.sessionId, {
                  sessionId: session.sessionId,
                  timestamp: Date.now(),
                  reason: 'verified_existing_refund'
                });
                continue;
              }
            }
          }
          
          if (shouldLogDetails) {
            console.log(`[AUTO-REFUND] Session ${session.sessionId} expired chưa hoàn tiền, xử lý refund`);
          }
        }
        
        // 🔒 ATOMIC OPERATION: Process refund and update session status in single transaction
        const userId = session.userId.toString();
        const sessionId = session.sessionId;
        const reason = 'Auto-refund - Session expired';
        
        // Remove from global queue before processing refund (outside transaction)
        if (session.service === 'otissim_v2' && session.phoneNumber) {
          removeFromShopeeV2GlobalQueue(parseInt(userId), session.phoneNumber);
        }
        
        let refundResult;
        try {
          // Process refund - this already handles atomicity internally via db.transaction()
          switch (session.service) {
            case 'otissim_v1':
              refundResult = await processOtissimV1Refund(userId, sessionId, reason, 'auto_refund');
              break;
            case 'otissim_v2':
              refundResult = await processOtissimV2Refund(userId, sessionId, reason, 'auto_refund');
              break;
            case 'otissim_v3':
              refundResult = await processOtissimV3Refund(userId, sessionId, reason, 'auto_refund');
              break;
            default:
              console.log(`[AUTO-REFUND] Unknown service type: ${session.service}`);
              continue;
          }
          
          // Only update session status if refund was successful
          if (refundResult?.success && isWaiting) {
            const updateResult = await storage.updatePhoneRentalHistory(sessionId, {
              status: 'expired',
              completedTime: new Date()
            });
            
            if (!updateResult) {
              console.log(`[AUTO-REFUND] Warning: Refund successful but failed to update session ${sessionId} status`);
            }
          }
        } catch (error) {
          console.error(`[AUTO-REFUND] Error in atomic refund operation for session ${sessionId}:`, error);
          refundResult = { success: false, amount: 0 };
        }
        
        if (refundResult?.success) {
          processedCount++;
          if (shouldLogDetails) {
            console.log(`[AUTO-REFUND] Successfully refunded ${refundResult.amount} VND for session ${sessionId} (${session.service})`);
          }
          // MARK AS PROCESSED: Only mark after successful refund
          processedSessionsCache.set(sessionId, {
            sessionId: sessionId,
            timestamp: Date.now(),
            reason: 'refunded'
          });
        }
        // DON'T mark as processed if refund failed - allow retry next cycle
        
      } catch (error) {
        console.error(`[AUTO-REFUND] Error processing session ${session.sessionId}:`, error);
        // DON'T mark as processed on error - allow retry next cycle
      }
    }
    
    // OPTIMIZATION: Update cache
    lastExpiredCount = expiredSessions.length;
    
    return processedCount;
  } catch (error) {
    console.error('[AUTO-REFUND] Error checking expired phone rentals:', error);
    return 0;
  }
}

/**
 * Kiểm tra và hoàn tiền TikTok rental sessions hết hạn - OPTIMIZED
 */
async function checkAndRefundExpiredTiktokRentals(): Promise<number> {
  try {
    // INCREMENTAL OPTIMIZATION: Chỉ lấy TikTok sessions expired kể từ lần check trước
    // Fallback to full scan nếu là lần đầu chạy (lastCheckTime too old)
    const timeSinceLastCheck = Date.now() - lastCheckTime.getTime();
    const useIncrementalCheck = timeSinceLastCheck < 300000; // 5 minutes threshold
    
    let allExpiredSessions;
    if (useIncrementalCheck) {
      // INCREMENTAL: Chỉ check sessions expired since last check
      allExpiredSessions = await storage.getExpiredTiktokRentalsSince(lastCheckTime, 1000);
      const shouldLogDetails = totalChecks % LOG_EVERY_N_CHECKS === 0;
      if (shouldLogDetails && allExpiredSessions.length > 0) {
        console.log(`[AUTO-REFUND] Using INCREMENTAL TikTok check (since ${lastCheckTime.toISOString()})`);
      }
    } else {
      // FALLBACK: Full scan for first run or after long gaps
      allExpiredSessions = await storage.getAllExpiredTiktokRentalSessions();
      console.log(`[AUTO-REFUND] Using FULL TikTok SCAN (time gap: ${Math.round(timeSinceLastCheck/1000)}s > 300s threshold)`);
    }
    
    // CLEANUP EXPIRED CACHE ENTRIES
    cleanupExpiredCacheEntries();
    
    // SKIP PROCESSED: Lọc ra chỉ những sessions chưa được xử lý (với TTL)
    const expiredSessions = allExpiredSessions.filter(session => {
      const cached = processedSessionsCache.get(session.sessionId);
      if (cached && (Date.now() - cached.timestamp) < PROCESSED_CACHE_TTL) {
        return false; // Skip if still in cache and not expired
      }
      return true; // Process if not in cache or cache expired
    });
    
    if (expiredSessions.length === 0) {
      // Chỉ log khi có sessions bị skip
      if (allExpiredSessions.length > 0) {
        const shouldLogDetails = totalChecks % LOG_EVERY_N_CHECKS === 0;
        if (shouldLogDetails) {
          console.log(`[AUTO-REFUND] Skipped ${allExpiredSessions.length} already processed TikTok sessions`);
        }
      }
      return 0;
    }
    
    // OPTIMIZATION: Chỉ log khi có sessions mới cần xử lý
    const shouldLogDetails = totalChecks % LOG_EVERY_N_CHECKS === 0;
    if (shouldLogDetails) {
      console.log(`[AUTO-REFUND] Found ${expiredSessions.length} new expired TikTok rental sessions (${allExpiredSessions.length - expiredSessions.length} already processed)`);
    }
    
    // OPTIMIZATION: Xử lý batch
    const sessionsToProcess = expiredSessions.slice(0, BATCH_SIZE);
    let processedCount = 0;
    
    for (const session of sessionsToProcess) {
      try {
        // RACE CONDITION PROTECTION: Check if session is already being processed
        const currentSession = await storage.getTiktokRentalBySessionId(session.sessionId);
        if (!currentSession) {
          if (shouldLogDetails) {
            console.log(`[AUTO-REFUND] TikTok session ${session.sessionId} không tồn tại, bỏ qua`);
          }
          // DON'T mark as processed - session might appear later
          continue;
        }

        // Check if session is eligible for refund (waiting OR expired without refund)
        const isWaiting = currentSession.status === 'waiting';
        const isExpiredWithoutRefund = currentSession.status === 'expired';
        
        if (!isWaiting && !isExpiredWithoutRefund) {
          if (shouldLogDetails) {
            console.log(`[AUTO-REFUND] TikTok session ${session.sessionId} status: ${currentSession.status}, bỏ qua`);
          }
          // DON'T mark as processed - status might change
          continue;
        }

        // For expired sessions, check if already refunded using SCHEMA-BASED approach (consistent with phone rentals)
        if (isExpiredWithoutRefund) {
          try {
            const isAlreadyRefunded = await storage.isTiktokRentalRefundProcessed(session.sessionId);
            if (isAlreadyRefunded) {
              if (shouldLogDetails) {
                console.log(`[AUTO-REFUND] TikTok session ${session.sessionId} đã được hoàn tiền (schema-based check), bỏ qua`);
              }
              // MARK AS PROCESSED: Verified existing refund via schema
              processedSessionsCache.set(session.sessionId, {
                sessionId: session.sessionId,
                timestamp: Date.now(),
                reason: 'verified_existing_refund'
              });
              continue;
            }
          } catch (error) {
            // Fallback to transaction-based checking if schema not available
            console.log(`[AUTO-REFUND] Schema checking failed for TikTok session ${session.sessionId}, falling back to transaction-based checking`);
            const refundReference = `tiktok_refund_${session.userId}_${session.sessionId}`;
            const existingRefund = await storage.getTransactionByReference(refundReference);
            
            if (existingRefund) {
              if (shouldLogDetails) {
                console.log(`[AUTO-REFUND] TikTok session ${session.sessionId} đã được hoàn tiền (ref: ${refundReference}), bỏ qua`);
              }
              // MARK AS PROCESSED: Verified existing refund
              processedSessionsCache.set(session.sessionId, {
                sessionId: session.sessionId,
                timestamp: Date.now(),
                reason: 'verified_existing_refund'
              });
              continue;
            }
          }
          
          if (shouldLogDetails) {
            console.log(`[AUTO-REFUND] TikTok session ${session.sessionId} expired chưa hoàn tiền, xử lý refund`);
          }
        }
        
        // Update session status to expired only if waiting
        if (isWaiting) {
          await storage.updateTiktokRental(session.sessionId, {
            status: 'expired',
            completedTime: new Date()
          });
        }
        
        // Process refund
        const userId = session.userId.toString();
        const sessionId = session.sessionId;
        const reason = 'Auto-refund - Session expired';
        
        const refundResult = await processTiktokRentalRefund(userId, sessionId, reason, 'auto_refund');
        
        if (refundResult?.success) {
          processedCount++;
          if (shouldLogDetails) {
            console.log(`[AUTO-REFUND] Successfully refunded ${refundResult.amount} VND for TikTok session ${sessionId}`);
          }
          // MARK AS PROCESSED: Only mark after successful refund
          processedSessionsCache.set(sessionId, {
            sessionId: sessionId,
            timestamp: Date.now(),
            reason: 'refunded'
          });
        }
        // DON'T mark as processed if refund failed - allow retry next cycle
        
      } catch (error) {
        console.error(`[AUTO-REFUND] Error processing TikTok session ${session.sessionId}:`, error);
        // DON'T mark as processed on error - allow retry next cycle
      }
    }
    
    return processedCount;
  } catch (error) {
    console.error('[AUTO-REFUND] Error checking expired TikTok rentals:', error);
    return 0;
  }
}

/**
 * Main scheduler function - OPTIMIZED: chạy mỗi 2 phút với session tracking
 */
async function runAutoRefundCheck(): Promise<void> {
  if (!isRunning) {
    return;
  }
  
  // MEMORY LEAK PREVENTION: Cleanup expired cache entries at start of each run
  cleanupExpiredCacheEntries();
  
  // OPTIMIZATION: Chỉ log mỗi vài lần check để giảm noise
  const shouldLog = totalChecks % LOG_EVERY_N_CHECKS === 0;
  if (shouldLog) {
    console.log(`[AUTO-REFUND] Starting check #${totalChecks + 1} (cache: ${processedSessionsCache.size} sessions)...`);
  }
  
  // INCREMENTAL OPTIMIZATION: Store current check time, update lastCheckTime at end
  const currentCheckTime = new Date();
  totalChecks++;
  
  try {
    // OPTIMIZATION: Parallel processing và chỉ lấy count ban đầu khi cần log
    const [phoneProcessed, tiktokProcessed] = await Promise.all([
      checkAndRefundExpiredPhoneRentals(),
      checkAndRefundExpiredTiktokRentals()
    ]);
    
    // OPTIMIZATION: Update kết quả và chỉ log khi có activity
    if (phoneProcessed > 0 || tiktokProcessed > 0 || shouldLog) {
      lastResult = {
        phoneRentals: phoneProcessed,
        tiktokRentals: tiktokProcessed,
        timestamp: new Date().toISOString()
      };
      
      console.log(`[AUTO-REFUND] Processed: ${phoneProcessed} phone rentals, ${tiktokProcessed} TikTok rentals`);
    }
    
    // Calculate next check time
    nextCheckTime = new Date(Date.now() + CHECK_INTERVAL_MS);
    
    if (shouldLog) {
      console.log(`[AUTO-REFUND] Check completed. Next check at: ${nextCheckTime.toLocaleString()}`);
    }
    
    // INCREMENTAL OPTIMIZATION: Update lastCheckTime for next incremental check
    lastCheckTime = currentCheckTime;
  } catch (error: any) {
    console.error('[AUTO-REFUND] Error during scheduled check:', error);
    
    // If it's a database connection error, log more details
    if (error.code) {
      console.error(`[AUTO-REFUND] Database error code: ${error.code}`);
    }
    if (error.severity) {
      console.error(`[AUTO-REFUND] Database error severity: ${error.severity}`);
    }
    
    // Continue running even if there's a database error
    // The scheduler will try again on the next interval
    console.log('[AUTO-REFUND] Scheduler continuing despite error - will retry on next check');
  }
}

/**
 * Khởi động auto-refund scheduler
 */
export function startAutoRefundScheduler(): void {
  if (schedulerInterval) {
    console.log('[AUTO-REFUND] Scheduler already running');
    return;
  }
  
  isRunning = true;
  
  // Chạy ngay lập tức lần đầu
  runAutoRefundCheck();
  
  // BACKUP POLLING: 5 phút cho backup, instant refunds sẽ dùng event-driven system
  schedulerInterval = setInterval(runAutoRefundCheck, CHECK_INTERVAL_MS);
  
  console.log(`[AUTO-REFUND] Scheduler started - checking every ${CHECK_INTERVAL_MS/1000} seconds (${CHECK_INTERVAL_MS/60000} minutes)`);
}

/**
 * Dừng auto-refund scheduler
 */
export function stopAutoRefundScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
  
  isRunning = false;
  console.log('[AUTO-REFUND] Scheduler stopped');
}

/**
 * Kiểm tra trạng thái scheduler
 */
export function getAutoRefundSchedulerStatus(): { 
  isRunning: boolean; 
  lastCheck: string; 
  nextCheck: string; 
  interval: number; 
  totalChecks: number; 
  lastResult: { phoneRentals: number; tiktokRentals: number; timestamp: string };
  processedCache: { size: number; maxSize: number };
  performance: { intervalMinutes: number; batchSize: number }
} {
  return {
    isRunning: isRunning && !!schedulerInterval,
    lastCheck: lastCheckTime.toISOString(),
    nextCheck: nextCheckTime.toISOString(),
    interval: CHECK_INTERVAL_MS / 1000,
    totalChecks,
    lastResult,
    processedCache: {
      size: processedSessionsCache.size,
      maxSize: processedSessionsCache.size
    },
    performance: {
      intervalMinutes: CHECK_INTERVAL_MS / 60000,
      batchSize: BATCH_SIZE
    }
  };
}

/**
 * Chạy manual check ngay lập tức - OPTIMIZED
 */
export async function runManualRefundCheck(): Promise<{ phoneRentals: number; tiktokRentals: number }> {
  console.log('[AUTO-REFUND] Running manual check...');
  
  const startTime = Date.now();
  
  // OPTIMIZATION: Parallel execution với error handling riêng biệt
  const [phoneProcessed, tiktokProcessed] = await Promise.allSettled([
    checkAndRefundExpiredPhoneRentals(),
    checkAndRefundExpiredTiktokRentals()
  ]);
  
  const duration = Date.now() - startTime;
  
  const phoneCount = phoneProcessed.status === 'fulfilled' ? phoneProcessed.value : 0;
  const tiktokCount = tiktokProcessed.status === 'fulfilled' ? tiktokProcessed.value : 0;
  
  console.log(`[AUTO-REFUND] Manual check completed in ${duration}ms - Phone: ${phoneCount}, TikTok: ${tiktokCount}`);
  
  return {
    phoneRentals: phoneCount,
    tiktokRentals: tiktokCount
  };
}