/**
 * AUTO-VALIDATE COOKIE PAIRS SERVICE
 * ===================================
 * 
 * Background service tự động validate Shopee cookie pairs mỗi 2 tiếng (120 phút)
 * Lấy SPC_SC_SESSION mới - nếu thành công thì update DB, nếu thất bại thì xóa
 */

import { storage } from './storage';

let validationInterval: NodeJS.Timeout | null = null;
let isRunning = false;

/**
 * Start auto-validation service
 */
export function startCookieValidatorService() {
  if (isRunning) {
    console.log('[COOKIE VALIDATOR] Service already running');
    return;
  }

  console.log('[COOKIE VALIDATOR] Starting auto-validation service...');
  console.log('[COOKIE VALIDATOR] Will validate cookie pairs every 120 minutes (2 hours)');

  // Run immediately on start
  runValidation();

  // Set up interval to run every 120 minutes (2 hours)
  validationInterval = setInterval(() => {
    runValidation();
  }, 120 * 60 * 1000); // 120 minutes = 2 hours

  isRunning = true;
  console.log('[COOKIE VALIDATOR] ✅ Service started successfully');
}

/**
 * Stop auto-validation service
 */
export function stopCookieValidatorService() {
  if (validationInterval) {
    clearInterval(validationInterval);
    validationInterval = null;
    isRunning = false;
    console.log('[COOKIE VALIDATOR] Service stopped');
  }
}

/**
 * Run validation process
 */
async function runValidation() {
  try {
    console.log('[COOKIE VALIDATOR] Starting validation cycle...');
    const result = await storage.autoValidateAllCookiePairs();
    console.log(`[COOKIE VALIDATOR] ✓ Validation completed:`);
    console.log(`  - Validated: ${result.validated}`);
    console.log(`  - Invalid: ${result.invalid}`);
    console.log(`  - Deleted: ${result.deleted}`);
  } catch (error) {
    console.error('[COOKIE VALIDATOR] Error during validation:', error);
  }
}

/**
 * Get service status
 */
export function getCookieValidatorStatus() {
  return {
    running: isRunning,
    intervalMinutes: 720,
  };
}
