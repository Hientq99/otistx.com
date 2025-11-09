// Shopee SIM v2 Global Queue Rate Limiting Module
// Implements global queue system for the Shopee SIM v2 service
// - 3-second delays between requests per user
// - Maximum 30 phone numbers in global queue across ALL users
// - Automatic cleanup of numbers older than 6 minutes
// - Global tracking and release system

interface PendingNumber {
  phoneNumber: string;
  userId: number;
  timestamp: number;        // When this number was added to queue
  sessionId: string;        // Session ID for tracking
}

interface UserDelayLimit {
  userId: number;
  lastRequestTime?: number; // Last request timestamp for 3-second delay
}

// Global queue storage
const globalPendingQueue: PendingNumber[] = [];
const userDelayLimits = new Map<number, UserDelayLimit>();

// Rate limiting constants
const GLOBAL_MAX_PENDING = 30;               // Max pending numbers across ALL users
const SHOPEE_V2_TIME_WINDOW = 6 * 60 * 1000; // 6 minutes in milliseconds
const SHOPEE_V2_REQUEST_DELAY = 3000;        // 3 seconds between requests per user

/**
 * Clean up expired numbers from the global queue (older than 6 minutes)
 */
function cleanupExpiredNumbers(): void {
  const now = Date.now();
  const initialCount = globalPendingQueue.length;
  
  // Remove numbers older than 6 minutes
  for (let i = globalPendingQueue.length - 1; i >= 0; i--) {
    const item = globalPendingQueue[i];
    if (now - item.timestamp > SHOPEE_V2_TIME_WINDOW) {
      globalPendingQueue.splice(i, 1);
      console.log(`[SHOPEE V2 GLOBAL QUEUE] Expired number ${item.phoneNumber} removed from queue (user ${item.userId})`);
    }
  }
  
  const removedCount = initialCount - globalPendingQueue.length;
  if (removedCount > 0) {
    console.log(`[SHOPEE V2 GLOBAL QUEUE] Cleaned up ${removedCount} expired numbers, queue: ${globalPendingQueue.length}/${GLOBAL_MAX_PENDING}`);
  }
}

/**
 * Check if user can make a request (3-second delay + global queue limit)
 */
export function checkShopeeV2GlobalLimit(userId: number): { allowed: boolean; waitTime: number; reason: string } {
  const now = Date.now();
  
  // Clean up expired numbers first
  cleanupExpiredNumbers();
  
  // Check 3-second delay for this user
  let userLimit = userDelayLimits.get(userId);
  if (!userLimit) {
    userLimit = { userId };
    userDelayLimits.set(userId, userLimit);
  }
  
  if (userLimit.lastRequestTime && (now - userLimit.lastRequestTime) < SHOPEE_V2_REQUEST_DELAY) {
    const waitTime = SHOPEE_V2_REQUEST_DELAY - (now - userLimit.lastRequestTime);
    return { 
      allowed: false, 
      waitTime, 
      reason: `Vui lòng chờ ${Math.ceil(waitTime / 1000)} giây trước khi lấy số tiếp theo.`
    };
  }
  
  // Check global queue limit
  if (globalPendingQueue.length >= GLOBAL_MAX_PENDING) {
    return { 
      allowed: false, 
      waitTime: 0, 
      reason: `Hệ thống đã đạt giới hạn ${GLOBAL_MAX_PENDING} số đang chờ. Hiện tại: ${globalPendingQueue.length}/${GLOBAL_MAX_PENDING}. Vui lòng thử lại sau.`
    };
  }
  
  return { allowed: true, waitTime: 0, reason: '' };
}

/**
 * Add a number to the global pending queue
 */
export function addToShopeeV2GlobalQueue(userId: number, phoneNumber: string, sessionId: string): void {
  const now = Date.now();
  
  // Update user's last request time
  let userLimit = userDelayLimits.get(userId);
  if (!userLimit) {
    userLimit = { userId };
    userDelayLimits.set(userId, userLimit);
  }
  userLimit.lastRequestTime = now;
  
  // Add to global queue
  const pendingNumber: PendingNumber = {
    phoneNumber,
    userId,
    timestamp: now,
    sessionId
  };
  
  globalPendingQueue.push(pendingNumber);
  
  console.log(`[SHOPEE V2 GLOBAL QUEUE] Added ${phoneNumber} for user ${userId} (session: ${sessionId}), queue: ${globalPendingQueue.length}/${GLOBAL_MAX_PENDING}`);
}

/**
 * Remove a number from the global queue when OTP is received or session expires
 */
export function removeFromShopeeV2GlobalQueue(userId: number, phoneNumber: string): void {
  const initialCount = globalPendingQueue.length;
  
  for (let i = globalPendingQueue.length - 1; i >= 0; i--) {
    const item = globalPendingQueue[i];
    if (item.userId === userId && item.phoneNumber === phoneNumber) {
      globalPendingQueue.splice(i, 1);
      console.log(`[SHOPEE V2 GLOBAL QUEUE] Removed ${phoneNumber} for user ${userId}, queue: ${globalPendingQueue.length}/${GLOBAL_MAX_PENDING}`);
      break;
    }
  }
  
  if (globalPendingQueue.length === initialCount) {
    console.log(`[SHOPEE V2 GLOBAL QUEUE] Number ${phoneNumber} not found in queue for user ${userId}`);
  }
}

/**
 * Get current global queue status
 */
export function getShopeeV2GlobalQueueStatus(userId?: number): {
  globalPending: number;
  maxPending: number;
  userPending: number;
  canRequest: boolean;
  nextAllowedTime: number | null;
  userPendingNumbers: string[];
} {
  const now = Date.now();
  
  // Clean up expired numbers
  cleanupExpiredNumbers();
  
  let userPending = 0;
  let nextAllowedTime: number | null = null;
  let userPendingNumbers: string[] = [];
  
  if (userId) {
    // Count user's pending numbers
    userPendingNumbers = globalPendingQueue
      .filter(item => item.userId === userId)
      .map(item => item.phoneNumber);
    userPending = userPendingNumbers.length;
    
    // Check user's next allowed time (3-second delay)
    const userLimit = userDelayLimits.get(userId);
    if (userLimit?.lastRequestTime) {
      const timeSinceLastRequest = now - userLimit.lastRequestTime;
      if (timeSinceLastRequest < SHOPEE_V2_REQUEST_DELAY) {
        nextAllowedTime = userLimit.lastRequestTime + SHOPEE_V2_REQUEST_DELAY;
      }
    }
  }
  
  const canRequest = globalPendingQueue.length < GLOBAL_MAX_PENDING && 
                    (nextAllowedTime === null || now >= nextAllowedTime);
  
  return {
    globalPending: globalPendingQueue.length,
    maxPending: GLOBAL_MAX_PENDING,
    userPending,
    canRequest,
    nextAllowedTime,
    userPendingNumbers
  };
}

/**
 * Get detailed queue information for debugging
 */
export function getShopeeV2GlobalQueueDetails(): {
  totalPending: number;
  maxPending: number;
  queueDetails: Array<{
    phoneNumber: string;
    userId: number;
    sessionId: string;
    minutesInQueue: number;
  }>;
  userCounts: Record<number, number>;
} {
  const now = Date.now();
  cleanupExpiredNumbers();
  
  const queueDetails = globalPendingQueue.map(item => ({
    phoneNumber: item.phoneNumber,
    userId: item.userId,
    sessionId: item.sessionId,
    minutesInQueue: Math.floor((now - item.timestamp) / (60 * 1000))
  }));
  
  // Count pending numbers per user
  const userCounts: Record<number, number> = {};
  globalPendingQueue.forEach(item => {
    userCounts[item.userId] = (userCounts[item.userId] || 0) + 1;
  });
  
  return {
    totalPending: globalPendingQueue.length,
    maxPending: GLOBAL_MAX_PENDING,
    queueDetails,
    userCounts
  };
}

// Auto-cleanup expired numbers every 5 minutes - Optimized to reduce egress
setInterval(cleanupExpiredNumbers, 300 * 1000);