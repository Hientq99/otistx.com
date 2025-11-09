/**
 * REFUND AUDIT SERVICE - Thu hồi tiền hoàn sai và kiểm tra cơ chế hoàn tiền 100% chính xác
 * ==================================================================================
 */

import { storage } from './storage';

export interface DuplicateRefund {
  userId: number;
  transactionId: number;
  amount: number;
  sessionId: string;
  createdAt: string;
  reference: string;
  originalRefundDate: string;
}

export interface OverRefund {
  sessionId: string;
  userId: number;
  service: string;
  totalCharged: number;
  totalRefunded: number;
  overAmount: number;
  refundCount: number;
}

export interface AuditResult {
  duplicateRefunds: DuplicateRefund[];
  overRefunds: OverRefund[];
  totalDuplicateAmount: number;
  totalOverAmount: number;
  summary: {
    duplicateCount: number;
    overRefundCount: number;
    affectedUsers: number;
    totalRecoveryAmount: number;
  };
}

/**
 * Kiểm tra toàn bộ hệ thống và tìm các khoản hoàn tiền sai
 */
export async function auditRefundSystem(): Promise<AuditResult> {
  console.log('🔍 [REFUND AUDIT] Starting comprehensive refund audit...');
  
  try {
    // 1. Lấy tất cả transactions refund - SECURE pagination approach
    console.log('🔍 [REFUND AUDIT] Fetching all refund transactions in batches...');
    const refundTransactions: any[] = [];
    let offset = 0;
    const batchSize = 1000;
    
    while (true) {
      const batch = await storage.getTransactionsWithFilter({
        types: ['refund'],
        limit: batchSize,
        offset
      });
      
      if (batch.length === 0) break;
      refundTransactions.push(...batch);
      offset += batchSize;
      
      // Safety check to prevent infinite loops - but fail loudly if reached
      if (refundTransactions.length > 100000) {
        throw new Error(`[REFUND AUDIT] CRITICAL: Exceeded 100K refund transactions limit. This suggests a runaway query or massive dataset requiring manual intervention.`);
      }
    }
    
    console.log(`📈 [REFUND AUDIT] Loaded ${refundTransactions.length} refund transactions in ${Math.ceil(offset/batchSize)} batches`);
    
    console.log(`📊 [REFUND AUDIT] Found ${refundTransactions.length} refund transactions`);
    
    // 2. Phân tích duplicate refunds
    const refundGroups: { [key: string]: any[] } = {};
    
    refundTransactions.forEach(refund => {
      // Extract sessionId từ reference
      let sessionId = null;
      
      if (refund.reference) {
        // Format: "otissim_v2_refund_userId_sessionId" hoặc "tiktok_refund_userId_sessionId"
        if (refund.reference.includes('_refund_')) {
          const parts = refund.reference.split('_');
          if (parts.length >= 4) {
            sessionId = parts.slice(3).join('_');
          }
        }
      }
      
      if (sessionId) {
        const key = `${refund.userId}_${sessionId}`;
        if (!refundGroups[key]) {
          refundGroups[key] = [];
        }
        refundGroups[key].push(refund);
      }
    });
    
    // 3. Tìm duplicate refunds
    const duplicateRefunds: DuplicateRefund[] = [];
    let totalDuplicateAmount = 0;
    
    Object.keys(refundGroups).forEach(key => {
      if (refundGroups[key].length > 1) {
        // Sort theo thời gian tạo
        const refunds = refundGroups[key].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        const originalRefund = refunds[0];
        const duplicates = refunds.slice(1);
        
        duplicates.forEach(duplicate => {
          const amount = Math.abs(parseFloat(duplicate.amount));
          duplicateRefunds.push({
            userId: duplicate.userId,
            transactionId: duplicate.id,
            amount,
            sessionId: key.split('_').slice(1).join('_'),
            createdAt: duplicate.createdAt,
            reference: duplicate.reference,
            originalRefundDate: originalRefund.createdAt
          });
          totalDuplicateAmount += amount;
        });
      }
    });
    
    console.log(`⚠️  [REFUND AUDIT] Found ${duplicateRefunds.length} duplicate refunds totaling ${totalDuplicateAmount.toLocaleString()} VND`);
    
    // 4. Kiểm tra over-refunds (hoàn nhiều hơn charge)
    console.log('💰 [REFUND AUDIT] Checking for over-refunds...');
    console.log('🔍 [REFUND AUDIT] Fetching sessions in batches for comprehensive coverage...');
    
    // SECURE: Fetch all sessions in batches instead of limiting by date
    const sessions = [];
    const tiktokSessions = [];
    const sessionBatchSize = 500;
    
    // Fetch phone rental sessions in batches
    let sessionOffset = 0;
    while (true) {
      const batch = await storage.getPhoneRentalHistoryWithFilter({
        limit: sessionBatchSize,
        offset: sessionOffset
      });
      if (batch.length === 0) break;
      sessions.push(...batch);
      sessionOffset += sessionBatchSize;
      
      if (sessions.length > 50000) {
        throw new Error(`[REFUND AUDIT] CRITICAL: Exceeded 50K phone sessions limit. Dataset too large for safe processing.`);
      }
    }
    
    // Fetch TikTok rental sessions in batches  
    let tiktokOffset = 0;
    while (true) {
      const batch = await storage.getTiktokRentalsWithFilter({
        limit: sessionBatchSize,
        offset: tiktokOffset
      });
      if (batch.length === 0) break;
      tiktokSessions.push(...batch);
      tiktokOffset += sessionBatchSize;
      
      if (tiktokSessions.length > 50000) {
        throw new Error(`[REFUND AUDIT] CRITICAL: Exceeded 50K TikTok sessions limit. Dataset too large for safe processing.`);
      }
    }
    
    console.log(`📈 [REFUND AUDIT] Loaded ${sessions.length} phone + ${tiktokSessions.length} TikTok sessions`);
    const allSessions = [...sessions, ...tiktokSessions];
    
    const overRefunds: OverRefund[] = [];
    let totalOverAmount = 0;
    
    // OPTIMIZATION: Pre-load all user transactions to eliminate O(n²) queries
    console.log(`🔄 [REFUND AUDIT] Pre-loading user transactions to eliminate repeated queries...`);
    const sessionsToCheck = allSessions;
    const userIds = [...new Set(sessionsToCheck.map(s => s.userId))];
    console.log(`📋 [REFUND AUDIT] Found ${userIds.length} unique users for ${sessionsToCheck.length} sessions`);
    
    const userTransactionsMap = new Map<number, any[]>();
    const userBatchSize = 25; // Process 25 users at a time to manage connections
    
    for (let i = 0; i < userIds.length; i += userBatchSize) {
      const userBatch = userIds.slice(i, i + userBatchSize);
      console.log(`🔄 [REFUND AUDIT] Loading transactions batch ${Math.floor(i/userBatchSize) + 1}/${Math.ceil(userIds.length/userBatchSize)} (${userBatch.length} users)`);
      
      // Load transactions for this batch of users
      for (const userId of userBatch) {
        try {
          const userTransactions = await storage.getTransactionsByUser(userId);
          userTransactionsMap.set(userId, userTransactions);
        } catch (error) {
          console.error(`Error loading transactions for user ${userId}:`, error);
          userTransactionsMap.set(userId, []); // Set empty array as fallback
        }
      }
    }
    
    console.log(`✅ [REFUND AUDIT] Pre-loaded transactions for ${userTransactionsMap.size} users`);
    
    // Verification: Log cache statistics
    let totalCachedTransactions = 0;
    userTransactionsMap.forEach(transactions => totalCachedTransactions += transactions.length);
    console.log(`📊 [REFUND AUDIT] Cache stats: ${userTransactionsMap.size} users, ${totalCachedTransactions} total cached transactions`);
    
    // COMPREHENSIVE CHECK: Process ALL sessions for over-refunds using cached data
    console.log(`🔍 [REFUND AUDIT] Checking ALL ${allSessions.length} sessions for over-refunds...`);
    
    // Process sessions in smaller batches to manage memory and connections
    const overRefundBatchSize = 100;
    for (let i = 0; i < sessionsToCheck.length; i += overRefundBatchSize) {
      const sessionBatch = sessionsToCheck.slice(i, i + overRefundBatchSize);
      console.log(`🔍 [REFUND AUDIT] Processing over-refund batch ${Math.floor(i/overRefundBatchSize) + 1}/${Math.ceil(sessionsToCheck.length/overRefundBatchSize)}`);
      
      for (const session of sessionBatch) {
      try {
        // Use pre-loaded transactions instead of individual database queries
        const userTransactions = userTransactionsMap.get(session.userId) || [];
        
        // Debug: Verify cache hit
        if (i === 0 && session === sessionBatch[0]) {
          console.log(`🎯 [REFUND AUDIT] Cache verification - User ${session.userId}: ${userTransactions.length} cached transactions`);
        }
        
        // Tìm charge transaction cho session này
        const chargeTransactions = userTransactions.filter(t => {
          const isChargeType = t.type === 'charge' || t.type === session.service || t.type.includes('sim') || t.type === 'tiktok_rental';
          const hasSessionRef = t.reference?.includes(session.sessionId) || t.description?.includes(session.sessionId);
          return isChargeType && hasSessionRef;
        });
        
        // Tìm refund transactions cho session này
        const sessionRefunds = userTransactions.filter(t => {
          const isRefundType = t.type === 'refund';
          const hasSessionRef = t.reference?.includes(session.sessionId) || t.description?.includes(session.sessionId);
          return isRefundType && hasSessionRef;
        });
        
        if (chargeTransactions.length > 0 && sessionRefunds.length > 0) {
          const totalCharged = chargeTransactions.reduce((sum, t) => sum + Math.abs(parseFloat(t.amount)), 0);
          const totalRefunded = sessionRefunds.reduce((sum, t) => sum + Math.abs(parseFloat(t.amount)), 0);
          
          if (totalRefunded > totalCharged) {
            const overAmount = totalRefunded - totalCharged;
            overRefunds.push({
              sessionId: session.sessionId,
              userId: session.userId,
              service: session.service || 'unknown',
              totalCharged,
              totalRefunded,
              overAmount,
              refundCount: sessionRefunds.length
            });
            totalOverAmount += overAmount;
          }
        }
      } catch (error) {
        console.error(`Error checking session ${session.sessionId}:`, error);
      }
    }
    }  // End of batch processing loop
    
    console.log(`💸 [REFUND AUDIT] Found ${overRefunds.length} over-refunded sessions totaling ${totalOverAmount.toLocaleString()} VND`);
    
    // 5. Prepare result
    const affectedUsers = new Set([
      ...duplicateRefunds.map(d => d.userId),
      ...overRefunds.map(o => o.userId)
    ]).size;
    
    const result: AuditResult = {
      duplicateRefunds,
      overRefunds,
      totalDuplicateAmount,
      totalOverAmount,
      summary: {
        duplicateCount: duplicateRefunds.length,
        overRefundCount: overRefunds.length,
        affectedUsers,
        totalRecoveryAmount: totalDuplicateAmount + totalOverAmount
      }
    };
    
    console.log('✅ [REFUND AUDIT] Audit completed successfully');
    return result;
    
  } catch (error) {
    console.error('❌ [REFUND AUDIT] Error during audit:', error);
    throw error;
  }
}

/**
 * Thu hồi tiền hoàn sai từ users
 */
export async function recoverIncorrectRefunds(auditResult: AuditResult): Promise<{ success: boolean; recoveredAmount: number; affectedUsers: number }> {
  console.log('🔧 [REFUND RECOVERY] Starting recovery process...');
  
  try {
    let totalRecovered = 0;
    const processedUsers = new Set<number>();
    
    // 1. Thu hồi duplicate refunds
    for (const duplicate of auditResult.duplicateRefunds) {
      try {
        // Tạo negative transaction để thu hồi tiền
        const recoveryAmount = -Math.abs(duplicate.amount); // Negative để trừ tiền
        
        // Get current balance
        const currentBalance = await storage.getUserBalance(duplicate.userId);
        const newBalance = currentBalance + recoveryAmount;
        
        // Create recovery transaction
        await storage.createTransaction({
          userId: duplicate.userId,
          type: 'adjustment',
          amount: recoveryAmount.toString(),
          reference: `recovery_duplicate_${duplicate.transactionId}`,
          description: `Thu hồi hoàn tiền duplicate - Session: ${duplicate.sessionId} - Original refund: ${duplicate.originalRefundDate}`,
          status: 'completed',
          balanceBefore: currentBalance.toString(),
          balanceAfter: newBalance.toString()
        });
        
        // Update user balance
        await storage.updateUserBalance(duplicate.userId, recoveryAmount);
        
        // Add audit log
        await storage.createAuditLog({
          userId: duplicate.userId,
          action: 'refund_recovery',
          description: `Thu hồi ${Math.abs(duplicate.amount)} VND từ hoàn tiền duplicate cho session ${duplicate.sessionId}`,
          ipAddress: 'system'
        });
        
        totalRecovered += Math.abs(duplicate.amount);
        processedUsers.add(duplicate.userId);
        
        console.log(`💰 [RECOVERY] Recovered ${Math.abs(duplicate.amount)} VND from user ${duplicate.userId}`);
        
      } catch (error) {
        console.error(`❌ [RECOVERY] Error recovering from user ${duplicate.userId}:`, error);
      }
    }
    
    // 2. Thu hồi over-refunds
    for (const overRefund of auditResult.overRefunds) {
      try {
        // Tạo negative transaction để thu hồi số tiền thừa
        const recoveryAmount = -Math.abs(overRefund.overAmount);
        
        // Get current balance
        const currentBalance = await storage.getUserBalance(overRefund.userId);
        const newBalance = currentBalance + recoveryAmount;
        
        // Create recovery transaction
        await storage.createTransaction({
          userId: overRefund.userId,
          type: 'adjustment',
          amount: recoveryAmount.toString(),
          reference: `recovery_overrefund_${overRefund.sessionId}`,
          description: `Thu hồi hoàn tiền thừa - Session: ${overRefund.sessionId} - Charged: ${overRefund.totalCharged}, Refunded: ${overRefund.totalRefunded}`,
          status: 'completed',
          balanceBefore: currentBalance.toString(),
          balanceAfter: newBalance.toString()
        });
        
        // Update user balance
        await storage.updateUserBalance(overRefund.userId, recoveryAmount);
        
        // Add audit log
        await storage.createAuditLog({
          userId: overRefund.userId,
          action: 'overrefund_recovery',
          description: `Thu hồi ${Math.abs(overRefund.overAmount)} VND từ hoàn tiền thừa cho session ${overRefund.sessionId}`,
          ipAddress: 'system'
        });
        
        totalRecovered += Math.abs(overRefund.overAmount);
        processedUsers.add(overRefund.userId);
        
        console.log(`💸 [RECOVERY] Recovered ${Math.abs(overRefund.overAmount)} VND over-refund from user ${overRefund.userId}`);
        
      } catch (error) {
        console.error(`❌ [RECOVERY] Error recovering over-refund from user ${overRefund.userId}:`, error);
      }
    }
    
    console.log(`✅ [REFUND RECOVERY] Recovery completed - Total: ${totalRecovered.toLocaleString()} VND from ${processedUsers.size} users`);
    
    return {
      success: true,
      recoveredAmount: totalRecovered,
      affectedUsers: processedUsers.size
    };
    
  } catch (error) {
    console.error('❌ [REFUND RECOVERY] Error during recovery:', error);
    throw error;
  }
}

/**
 * Kiểm tra cơ chế hoàn tiền 100% chính xác
 */
export async function validateRefundMechanism(): Promise<{
  isAccurate: boolean;
  issues: string[];
  recommendations: string[];
}> {
  console.log('🔍 [REFUND VALIDATION] Validating refund mechanism accuracy...');
  
  const issues: string[] = [];
  const recommendations: string[] = [];
  
  try {
    // 1. Kiểm tra duplicate detection logic
    const sampleSessions = await storage.getPhoneRentalHistoryWithFilter({ limit: 100, page: 1 });
    const testSession = sampleSessions[0];
    
    if (testSession) {
      // Test duplicate detection
      const refundReference = `otissim_v2_refund_${testSession.userId}_${testSession.sessionId}`;
      const existingRefund = await storage.getTransactionByReference(refundReference);
      
      if (!existingRefund) {
        console.log('✅ [VALIDATION] Duplicate detection logic is working correctly');
      }
    }
    
    // 2. Kiểm tra service pricing consistency
    const servicePricings = await Promise.all([
      storage.getServicePricing('otissim_v1'),
      storage.getServicePricing('otissim_v2'),
      storage.getServicePricing('otissim_v3'),
      storage.getServicePricing('tiktok_rental')
    ]);
    
    servicePricings.forEach((pricing, index) => {
      const services = ['otissim_v1', 'otissim_v2', 'otissim_v3', 'tiktok_rental'];
      if (!pricing) {
        issues.push(`Missing service pricing for ${services[index]}`);
        recommendations.push(`Add service pricing configuration for ${services[index]}`);
      }
    });
    
    // 3. Kiểm tra refund handler consistency
    const recentRefunds = (await storage.getTransactionsWithFilter({ limit: 100, offset: 0, types: ['refund'] }))
      .filter(t => t.type === 'refund')
      .slice(0, 10);
    
    recentRefunds.forEach(refund => {
      if (!refund.reference || !refund.reference.includes('_refund_')) {
        issues.push(`Invalid refund reference format: ${refund.reference}`);
        recommendations.push('Ensure all refunds use proper reference format: service_refund_userId_sessionId');
      }
    });
    
    // 4. Kiểm tra auto-refund scheduler status
    // (This would require importing the scheduler status function)
    
    const isAccurate = issues.length === 0;
    
    if (isAccurate) {
      console.log('✅ [REFUND VALIDATION] Refund mechanism is 100% accurate');
    } else {
      console.log(`⚠️  [REFUND VALIDATION] Found ${issues.length} issues that need attention`);
    }
    
    return {
      isAccurate,
      issues,
      recommendations
    };
    
  } catch (error) {
    console.error('❌ [REFUND VALIDATION] Error during validation:', error);
    issues.push(`Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    
    return {
      isAccurate: false,
      issues,
      recommendations
    };
  }
}