/**
 * INSTANT REFUND SERVICE - EVENT-DRIVEN SYSTEM
 * ==========================================
 * 
 * Triggers immediate refunds when sessions expire/fail
 * ZERO polling overhead, instant response for users
 * Maintains low database egress while providing instant refunds
 */

import { storage } from './storage';
import { processOtissimV1Refund, processOtissimV2Refund, processOtissimV3Refund, processTiktokRentalRefund } from './refund-handlers';
import { removeFromShopeeV2GlobalQueue } from './shopee-v2-global-queue';

/**
 * Trigger immediate refund when session expires/fails
 * Called directly from session status update functions
 */
export async function triggerInstantRefund(
  sessionId: string, 
  userId: number,
  service: string,
  reason: 'expired' | 'failed' = 'expired'
): Promise<{ success: boolean; amount: number; message: string }> {
  try {
    console.log(`[INSTANT REFUND] Triggering immediate refund for session ${sessionId}, service: ${service}, reason: ${reason}`);
    
    // Determine appropriate refund handler based on service
    let refundResult;
    
    switch (service) {
      case 'otissim_v1':
        refundResult = await processOtissimV1Refund(userId.toString(), sessionId);
        break;
      case 'otissim_v2':
        refundResult = await processOtissimV2Refund(userId.toString(), sessionId);
        break;
      case 'otissim_v3':
        refundResult = await processOtissimV3Refund(userId.toString(), sessionId);
        break;
      case 'tiktok':
        refundResult = await processTiktokRentalRefund(userId.toString(), sessionId);
        break;
      default:
        console.log(`[INSTANT REFUND] Unknown service type: ${service}, skipping refund`);
        return { success: false, amount: 0, message: 'Unknown service type' };
    }
    
    if (refundResult.success && refundResult.amount > 0) {
      console.log(`[INSTANT REFUND] ✅ Success! Refunded ${refundResult.amount}₫ for session ${sessionId} (${reason})`);
    } else {
      console.log(`[INSTANT REFUND] ⚠️ No refund needed for session ${sessionId}: ${refundResult.message}`);
    }
    
    return refundResult;
    
  } catch (error) {
    console.error(`[INSTANT REFUND] Error processing refund for session ${sessionId}:`, error);
    return { 
      success: false, 
      amount: 0, 
      message: `Refund error: ${error instanceof Error ? error.message : 'Unknown error'}` 
    };
  }
}

/**
 * Trigger instant refund for TikTok rentals
 */
export async function triggerInstantTiktokRefund(
  sessionId: string,
  userId: number, 
  reason: 'expired' | 'failed' = 'expired'
): Promise<{ success: boolean; amount: number; message: string }> {
  return await triggerInstantRefund(sessionId, userId, 'tiktok', reason);
}

/**
 * Batch trigger instant refunds (for multiple sessions expiring at once)
 */
export async function triggerBatchInstantRefunds(
  sessions: Array<{
    sessionId: string;
    userId: number;
    service: string;
    reason?: 'expired' | 'failed';
  }>
): Promise<{
  totalProcessed: number;
  totalRefunded: number;
  totalAmount: number;
  results: Array<{ sessionId: string; success: boolean; amount: number; message: string }>;
}> {
  console.log(`[INSTANT REFUND] Processing batch of ${sessions.length} sessions`);
  
  const results = [];
  let totalRefunded = 0;
  let totalAmount = 0;
  
  // Process in small batches to avoid overwhelming the system
  const BATCH_SIZE = 3;
  for (let i = 0; i < sessions.length; i += BATCH_SIZE) {
    const batch = sessions.slice(i, i + BATCH_SIZE);
    
    const batchPromises = batch.map(session => 
      triggerInstantRefund(session.sessionId, session.userId, session.service, session.reason)
    );
    
    const batchResults = await Promise.allSettled(batchPromises);
    
    for (let j = 0; j < batch.length; j++) {
      const sessionResult = batchResults[j];
      const session = batch[j];
      
      if (sessionResult.status === 'fulfilled') {
        const result = sessionResult.value;
        results.push({ sessionId: session.sessionId, ...result });
        
        if (result.success && result.amount > 0) {
          totalRefunded++;
          totalAmount += result.amount;
        }
      } else {
        results.push({
          sessionId: session.sessionId,
          success: false,
          amount: 0,
          message: `Batch processing error: ${sessionResult.reason}`
        });
      }
    }
    
    // Small delay between batches to prevent overwhelming
    if (i + BATCH_SIZE < sessions.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  console.log(`[INSTANT REFUND] Batch complete: ${totalRefunded}/${sessions.length} refunded, total: ${totalAmount}₫`);
  
  return {
    totalProcessed: sessions.length,
    totalRefunded,
    totalAmount,
    results
  };
}