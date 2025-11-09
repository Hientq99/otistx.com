/**
 * MEMORY MONITORING & AUTO CLEANUP
 * =================================
 * 
 * Theo dõi memory usage và tự động dọn dẹp khi cao
 * Tối ưu cho máy 2 cores, 4GB RAM
 */

let isCleaningUp = false;
let lastCleanupTime = 0;
const CLEANUP_INTERVAL = 300000; // 5 minutes
const MEMORY_THRESHOLD_PERCENT = 85; // Cleanup when memory > 85%
const FORCE_GC_THRESHOLD_PERCENT = 90; // Force GC when memory > 90%

/**
 * Get current memory usage statistics
 */
export function getMemoryStats() {
  const usage = process.memoryUsage();
  const totalMemory = 4 * 1024 * 1024 * 1024; // 4GB in bytes
  
  return {
    rss: usage.rss,
    heapTotal: usage.heapTotal,
    heapUsed: usage.heapUsed,
    external: usage.external,
    arrayBuffers: usage.arrayBuffers,
    rssMB: Math.round(usage.rss / 1024 / 1024),
    heapTotalMB: Math.round(usage.heapTotal / 1024 / 1024),
    heapUsedMB: Math.round(usage.heapUsed / 1024 / 1024),
    externalMB: Math.round(usage.external / 1024 / 1024),
    usagePercent: Math.round((usage.rss / totalMemory) * 100),
    heapUsagePercent: Math.round((usage.heapUsed / usage.heapTotal) * 100)
  };
}

/**
 * Perform memory cleanup
 */
async function performCleanup() {
  if (isCleaningUp) {
    return;
  }

  const now = Date.now();
  if (now - lastCleanupTime < CLEANUP_INTERVAL) {
    return; // Too soon since last cleanup
  }

  isCleaningUp = true;
  lastCleanupTime = now;

  try {
    console.log('[MEMORY] Starting cleanup...');
    const beforeStats = getMemoryStats();
    console.log(`[MEMORY] Before cleanup: RSS ${beforeStats.rssMB}MB (${beforeStats.usagePercent}%), Heap ${beforeStats.heapUsedMB}/${beforeStats.heapTotalMB}MB (${beforeStats.heapUsagePercent}%)`);

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
      console.log('[MEMORY] Forced garbage collection');
    }

    // Wait a bit for GC to complete
    await new Promise(resolve => setTimeout(resolve, 1000));

    const afterStats = getMemoryStats();
    const freed = beforeStats.rssMB - afterStats.rssMB;
    console.log(`[MEMORY] After cleanup: RSS ${afterStats.rssMB}MB (${afterStats.usagePercent}%), Heap ${afterStats.heapUsedMB}/${afterStats.heapTotalMB}MB (${afterStats.heapUsagePercent}%)`);
    console.log(`[MEMORY] Freed: ${freed}MB`);
  } catch (error) {
    console.error('[MEMORY] Cleanup error:', error);
  } finally {
    isCleaningUp = false;
  }
}

/**
 * Check memory and cleanup if needed
 */
async function checkMemory() {
  const stats = getMemoryStats();

  // Log memory stats every check
  if (stats.usagePercent > 70) {
    console.log(`[MEMORY] Current usage: ${stats.rssMB}MB (${stats.usagePercent}%), Heap: ${stats.heapUsedMB}/${stats.heapTotalMB}MB (${stats.heapUsagePercent}%)`);
  }

  // Force GC if memory is very high
  if (stats.usagePercent >= FORCE_GC_THRESHOLD_PERCENT && global.gc && !isCleaningUp) {
    console.warn(`[MEMORY] HIGH USAGE DETECTED: ${stats.usagePercent}% - Forcing GC`);
    try {
      global.gc();
    } catch (error) {
      console.error('[MEMORY] Failed to force GC:', error);
    }
  }

  // Perform cleanup if above threshold
  if (stats.usagePercent >= MEMORY_THRESHOLD_PERCENT) {
    console.warn(`[MEMORY] THRESHOLD EXCEEDED: ${stats.usagePercent}% - Starting cleanup`);
    await performCleanup();
  }
}

/**
 * Start memory monitoring service
 */
export function startMemoryMonitoring() {
  console.log('[MEMORY] Starting memory monitoring service');
  console.log(`[MEMORY] Cleanup threshold: ${MEMORY_THRESHOLD_PERCENT}%`);
  console.log(`[MEMORY] Force GC threshold: ${FORCE_GC_THRESHOLD_PERCENT}%`);
  console.log(`[MEMORY] Check interval: 60 seconds`);

  // Check memory every minute
  setInterval(checkMemory, 60000);

  // Initial memory stats
  const stats = getMemoryStats();
  console.log(`[MEMORY] Initial stats: RSS ${stats.rssMB}MB (${stats.usagePercent}%), Heap ${stats.heapUsedMB}/${stats.heapTotalMB}MB (${stats.heapUsagePercent}%)`);
  
  console.log('[MEMORY] ✅ Monitoring service started');
}

/**
 * Get monitoring service status
 */
export function getMonitoringStatus() {
  return {
    isCleaningUp,
    lastCleanupTime,
    lastCleanupAgo: lastCleanupTime > 0 ? Date.now() - lastCleanupTime : null,
    thresholds: {
      cleanup: MEMORY_THRESHOLD_PERCENT,
      forceGC: FORCE_GC_THRESHOLD_PERCENT
    },
    currentStats: getMemoryStats()
  };
}
