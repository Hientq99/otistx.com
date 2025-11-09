/**
 * SHOPEE V2 RATE LIMITER
 * ======================
 * 
 * Chuyên quản lý rate limiting cho dịch vụ thuê sim Shopee v2
 * - 3 giây giữa mỗi request
 * - Tối đa 30 request thành công trong 6 phút
 * - Block cho đến khi tất cả số pending được giải phóng
 */

// ============================================================================
// SHOPEE SIM V2 SPECIFIC RATE LIMITING
// ============================================================================

interface ShopeeV2RateLimit {
  userId: number;
  successfulRequests: number[];  // Array of successful request timestamps
  lastRequestTime?: number;  // Last request timestamp for 3s delay
  blockedUntil?: number;  // Timestamp when user will be unblocked
  pendingNumbers: Set<string>;  // Set of phone numbers that are pending
}

// In-memory storage for Shopee v2 rate limiting
const shopeeV2Limits = new Map<number, ShopeeV2RateLimit>();

// Shopee v2 rate limiting configuration
const SHOPEE_V2_MAX_REQUESTS = 30;  // Max successful requests
const SHOPEE_V2_TIME_WINDOW = 6 * 60 * 1000;  // 6 minutes in milliseconds
const SHOPEE_V2_REQUEST_DELAY = 3 * 1000;  // 3 seconds between requests

/**
 * Check if user is blocked for Shopee v2 and needs to wait for 3s delay or exceeded rate limit
 * Returns remaining time in milliseconds if blocked, 0 if allowed
 */
export function checkShopeeV2RateLimit(userId: number): { allowed: boolean; waitTime: number; reason: string } {
  const now = Date.now();
  
  // Get or create user limit record
  let userLimit = shopeeV2Limits.get(userId);
  if (!userLimit) {
    userLimit = { 
      userId, 
      successfulRequests: [], 
      pendingNumbers: new Set()
    };
    shopeeV2Limits.set(userId, userLimit);
  }

  // Check if user is currently blocked due to pending numbers
  if (userLimit.blockedUntil && now < userLimit.blockedUntil) {
    const waitTime = userLimit.blockedUntil - now;
    return { 
      allowed: false, 
      waitTime, 
      reason: `Đã vượt quá 30 lần lấy số trong 6 phút. Vui lòng chờ ${Math.ceil(waitTime / (60 * 1000))} phút hoặc cho đến khi tất cả số đang chờ được giải phóng.`
    };
  }

  // Check 3-second delay between requests
  if (userLimit.lastRequestTime && (now - userLimit.lastRequestTime) < SHOPEE_V2_REQUEST_DELAY) {
    const waitTime = SHOPEE_V2_REQUEST_DELAY - (now - userLimit.lastRequestTime);
    return { 
      allowed: false, 
      waitTime, 
      reason: `Vui lòng chờ ${Math.ceil(waitTime / 1000)} giây trước khi lấy số tiếp theo.`
    };
  }

  // Remove successful requests older than 6 minutes
  userLimit.successfulRequests = userLimit.successfulRequests.filter(timestamp => 
    now - timestamp < SHOPEE_V2_TIME_WINDOW
  );

  // Check if user has exceeded the limit
  if (userLimit.successfulRequests.length >= SHOPEE_V2_MAX_REQUESTS) {
    // Block user until all pending numbers are released or time window passes
    const oldestRequest = Math.min(...userLimit.successfulRequests);
    const timeWindowEnd = oldestRequest + SHOPEE_V2_TIME_WINDOW;
    userLimit.blockedUntil = timeWindowEnd;
    
    console.log(`[SHOPEE V2 RATE LIMIT] User ${userId} blocked - ${userLimit.successfulRequests.length}/30 requests in 6 minutes`);
    
    const waitTime = timeWindowEnd - now;
    return { 
      allowed: false, 
      waitTime, 
      reason: `Đã vượt quá 30 lần lấy số trong 6 phút. Vui lòng chờ ${Math.ceil(waitTime / (60 * 1000))} phút hoặc cho đến khi tất cả số đang chờ được giải phóng.`
    };
  }

  return { allowed: true, waitTime: 0, reason: '' };
}

/**
 * Record a successful number request for Shopee v2
 */
export function recordShopeeV2Success(userId: number, phoneNumber: string): void {
  const now = Date.now();
  let userLimit = shopeeV2Limits.get(userId);
  
  if (!userLimit) {
    userLimit = { 
      userId, 
      successfulRequests: [], 
      pendingNumbers: new Set()
    };
    shopeeV2Limits.set(userId, userLimit);
  }

  // Record successful request
  userLimit.successfulRequests.push(now);
  userLimit.lastRequestTime = now;
  
  // Add to pending numbers
  userLimit.pendingNumbers.add(phoneNumber);
  
  console.log(`[SHOPEE V2 RATE LIMIT] User ${userId} successful request recorded: ${userLimit.successfulRequests.length}/30 in 6 minutes, pending: ${userLimit.pendingNumbers.size}`);
}

/**
 * Release a pending number when session expires or completes
 */
export function releaseShopeeV2Number(userId: number, phoneNumber: string): void {
  const userLimit = shopeeV2Limits.get(userId);
  if (userLimit && userLimit.pendingNumbers.has(phoneNumber)) {
    userLimit.pendingNumbers.delete(phoneNumber);
    
    // If no more pending numbers and user was blocked, unblock them
    if (userLimit.pendingNumbers.size === 0 && userLimit.blockedUntil) {
      userLimit.blockedUntil = undefined;
      console.log(`[SHOPEE V2 RATE LIMIT] User ${userId} unblocked - all pending numbers released`);
    }
    
    console.log(`[SHOPEE V2 RATE LIMIT] User ${userId} number ${phoneNumber} released, pending: ${userLimit.pendingNumbers.size}`);
  }
}

/**
 * Reset successful requests when user gets OTP (successful completion)
 */
export function resetShopeeV2SuccessfulRequests(userId: number): void {
  const userLimit = shopeeV2Limits.get(userId);
  if (userLimit) {
    userLimit.successfulRequests = [];
    userLimit.blockedUntil = undefined;
    console.log(`[SHOPEE V2 RATE LIMIT] User ${userId} successful requests reset - OTP completed successfully`);
  }
}

/**
 * Update last request time for 3-second delay tracking
 */
export function updateShopeeV2RequestTime(userId: number): void {
  let userLimit = shopeeV2Limits.get(userId);
  if (!userLimit) {
    userLimit = { 
      userId, 
      successfulRequests: [], 
      pendingNumbers: new Set()
    };
    shopeeV2Limits.set(userId, userLimit);
  }
  
  userLimit.lastRequestTime = Date.now();
}

/**
 * Get current rate limit status for a user (for debugging/monitoring)
 */
export function getShopeeV2RateLimitStatus(userId: number): {
  successfulRequests: number;
  pendingNumbers: number;
  isBlocked: boolean;
  nextAllowedTime?: number;
} {
  const userLimit = shopeeV2Limits.get(userId);
  if (!userLimit) {
    return {
      successfulRequests: 0,
      pendingNumbers: 0,
      isBlocked: false
    };
  }

  const now = Date.now();
  
  // Clean old requests
  userLimit.successfulRequests = userLimit.successfulRequests.filter(timestamp => 
    now - timestamp < SHOPEE_V2_TIME_WINDOW
  );

  const isBlocked = userLimit.blockedUntil ? now < userLimit.blockedUntil : false;
  const nextRequestTime = userLimit.lastRequestTime ? userLimit.lastRequestTime + SHOPEE_V2_REQUEST_DELAY : now;

  return {
    successfulRequests: userLimit.successfulRequests.length,
    pendingNumbers: userLimit.pendingNumbers.size,
    isBlocked: isBlocked,
    nextAllowedTime: Math.max(nextRequestTime, userLimit.blockedUntil || 0)
  };
}