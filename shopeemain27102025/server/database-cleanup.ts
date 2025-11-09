/**
 * DATABASE CLEANUP SERVICE
 * ========================
 * 
 * Service tự động xóa các log và dữ liệu cũ trong database
 * Chức năng:
 * - Xóa audit logs quá 30 ngày
 * - Xóa transaction history quá 30 ngày  
 * - Xóa service usage logs quá 30 ngày
 * - Chạy tự động mỗi ngày lúc 2:00 AM
 */

import { db } from './db.js';
import { auditLogs, transactions, phoneChecks, accountChecks, trackingChecks, cookieExtractions, phoneRentalHistory, tiktokRentals, emailAdditions } from '../shared/schema.js';
import { lt } from 'drizzle-orm';

let cleanupInterval: NodeJS.Timeout | null = null;
let nextCleanupTime: Date | null = null;

/**
 * Xóa các bản ghi cũ hơn 30 ngày
 */
async function performDatabaseCleanup(): Promise<void> {
  try {
    console.log('[Database Cleanup] Bắt đầu dọn dẹp database...');
    
    // Tính ngày cắt (30 ngày trước)
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 30);
    
    let totalDeleted = 0;
    
    // 1. Xóa audit logs cũ
    const deletedAuditLogs = await db.delete(auditLogs)
      .where(lt(auditLogs.timestamp, cutoffDate));
    console.log(`[Database Cleanup] Đã xóa ${deletedAuditLogs.rowCount || 0} audit logs`);
    totalDeleted += deletedAuditLogs.rowCount || 0;
    
    // 2. Xóa transaction history cũ
    const deletedTransactions = await db.delete(transactions)
      .where(lt(transactions.createdAt, cutoffDate));
    console.log(`[Database Cleanup] Đã xóa ${deletedTransactions.rowCount || 0} transaction records`);
    totalDeleted += deletedTransactions.rowCount || 0;
    
    // 3. Xóa phone check history cũ
    const deletedPhoneChecks = await db.delete(phoneChecks)
      .where(lt(phoneChecks.checkedAt, cutoffDate));
    console.log(`[Database Cleanup] Đã xóa ${deletedPhoneChecks.rowCount || 0} phone check records`);
    totalDeleted += deletedPhoneChecks.rowCount || 0;
    
    // 4. Xóa account check history cũ
    const deletedAccountChecks = await db.delete(accountChecks)
      .where(lt(accountChecks.createdAt, cutoffDate));
    console.log(`[Database Cleanup] Đã xóa ${deletedAccountChecks.rowCount || 0} account check records`);
    totalDeleted += deletedAccountChecks.rowCount || 0;
    
    // 5. Xóa tracking check history cũ
    const deletedTrackingChecks = await db.delete(trackingChecks)
      .where(lt(trackingChecks.createdAt, cutoffDate));
    console.log(`[Database Cleanup] Đã xóa ${deletedTrackingChecks.rowCount || 0} tracking check records`);
    totalDeleted += deletedTrackingChecks.rowCount || 0;
    
    // 6. Xóa cookie extraction history cũ
    const deletedCookieExtractions = await db.delete(cookieExtractions)
      .where(lt(cookieExtractions.createdAt, cutoffDate));
    console.log(`[Database Cleanup] Đã xóa ${deletedCookieExtractions.rowCount || 0} cookie extraction records`);
    totalDeleted += deletedCookieExtractions.rowCount || 0;
    
    // 7. Xóa phone rental history cũ
    const deletedPhoneRentals = await db.delete(phoneRentalHistory)
      .where(lt(phoneRentalHistory.createdAt, cutoffDate));
    console.log(`[Database Cleanup] Đã xóa ${deletedPhoneRentals.rowCount || 0} phone rental records`);
    totalDeleted += deletedPhoneRentals.rowCount || 0;
    
    // 8. Xóa TikTok rental history cũ
    const deletedTiktokRentals = await db.delete(tiktokRentals)
      .where(lt(tiktokRentals.createdAt, cutoffDate));
    console.log(`[Database Cleanup] Đã xóa ${deletedTiktokRentals.rowCount || 0} TikTok rental records`);
    totalDeleted += deletedTiktokRentals.rowCount || 0;
    
    // 9. Xóa email addition history cũ
    const deletedEmailAdditions = await db.delete(emailAdditions)
      .where(lt(emailAdditions.createdAt, cutoffDate));
    console.log(`[Database Cleanup] Đã xóa ${deletedEmailAdditions.rowCount || 0} email addition records`);
    totalDeleted += deletedEmailAdditions.rowCount || 0;
    
    console.log(`[Database Cleanup] Hoàn thành! Tổng cộng đã xóa ${totalDeleted} bản ghi cũ hơn 30 ngày`);
    
    // Cập nhật thời gian cleanup tiếp theo
    updateNextCleanupTime();
    
  } catch (error) {
    console.error('[Database Cleanup] Lỗi trong quá trình dọn dẹp:', error);
  }
}

/**
 * Khởi động service dọn dẹp database tự động
 * Chạy mỗi ngày lúc 2:00 AM
 */
export function startDatabaseCleanupService(): void {
  if (cleanupInterval) {
    console.log('[Database Cleanup] Service đã được khởi động trước đó');
    return;
  }
  
  // Tính thời gian đến 2:00 AM tiếp theo
  const now = new Date();
  let nextRun = new Date(now);
  nextRun.setHours(2, 0, 0, 0); // 2:00 AM
  
  // Nếu 2:00 AM hôm nay đã qua, chuyển sang ngày mai
  if (nextRun <= now) {
    nextRun.setDate(nextRun.getDate() + 1);
  }
  
  const timeUntilNextRun = nextRun.getTime() - now.getTime();
  
  // Đặt timeout cho lần chạy đầu tiên
  setTimeout(() => {
    performDatabaseCleanup();
    
    // Sau đó chạy mỗi 24 giờ
    cleanupInterval = setInterval(performDatabaseCleanup, 24 * 60 * 60 * 1000);
  }, timeUntilNextRun);
  
  nextCleanupTime = nextRun;
  
  console.log(`[Database Cleanup] Service đã khởi động. Lần dọn dẹp tiếp theo: ${nextRun.toLocaleString('vi-VN')}`);
}

/**
 * Dừng service dọn dẹp database
 */
export function stopDatabaseCleanupService(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    nextCleanupTime = null;
    console.log('[Database Cleanup] Service đã được dừng');
  }
}

/**
 * Kiểm tra trạng thái service
 */
export function getDatabaseCleanupServiceStatus(): { running: boolean; nextCleanup?: string } {
  return {
    running: cleanupInterval !== null,
    nextCleanup: nextCleanupTime ? nextCleanupTime.toLocaleString('vi-VN') : undefined
  };
}

/**
 * Thực hiện cleanup thủ công
 */
export async function manualDatabaseCleanup(): Promise<void> {
  console.log('[Database Cleanup] Thực hiện dọn dẹp thủ công...');
  await performDatabaseCleanup();
}

/**
 * Cập nhật thời gian cleanup tiếp theo
 */
function updateNextCleanupTime(): void {
  if (cleanupInterval) {
    const nextRun = new Date();
    nextRun.setDate(nextRun.getDate() + 1);
    nextRun.setHours(2, 0, 0, 0);
    nextCleanupTime = nextRun;
  }
}