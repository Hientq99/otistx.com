/**
 * REFUND HANDLERS
 * ===============
 * 
 * Tách riêng các function xử lý hoàn tiền để tái sử dụng
 * Được import bởi cả routes.ts và auto-refund-scheduler.ts
 */

import { storage } from './storage';
import { db } from './db';

/**
 * OTISSIM V1 REFUND LOGIC
 * Handles all refund scenarios for OtisSim v1 service
 */
export async function processOtissimV1Refund(userId: string, sessionId: string, reason: string, reference: string) {
  try {
    // 🔒 DB-LEVEL IDEMPOTENCY: Reference pattern for all V1 refund scenarios
    const refundReference = `otissim_v1_refund_${userId}_${sessionId}`;
    // Removed pre-check - now relying on createTransaction's ON CONFLICT handling
    
    // ENHANCED SCHEMA-BASED REFUND PROTECTION
    const currentSession = await storage.getPhoneRentalHistoryBySession(sessionId);
    if (currentSession) {
      // Check if refund already processed using new schema fields (if available)
      try {
        const isAlreadyRefunded = await storage.isPhoneRentalRefundProcessed(sessionId);
        if (isAlreadyRefunded) {
          console.log(`[OTISSIM V1 REFUND] Session ${sessionId} already marked as refund processed in schema`);
          return { success: false, amount: 0, message: 'Refund already processed (schema)' };
        }
      } catch (error) {
        // Schema fields not available yet during migration - continue with refund eligibility check
        console.log(`[OTISSIM V1 REFUND] Schema marking not available yet (expected during migration), proceeding with refund check`);
      }
      
      // Sessions already successfully completed should NOT be refunded
      if (currentSession.status === 'completed') {
        console.log(`[OTISSIM V1 REFUND] Session ${sessionId} was completed successfully, no refund needed`);
        return { success: false, amount: 0, message: 'Session was completed successfully, no refund needed' };
      }
      
      // TIME-BASED ELIGIBILITY: Check if session is actually expired (architect recommendation)
      const sessionExpiredTime = new Date(currentSession.expiresAt);
      const now = new Date();
      const isSessionExpired = now >= sessionExpiredTime;
      
      if (!isSessionExpired) {
        console.log(`[OTISSIM V1 REFUND] Session ${sessionId} not yet expired (expires at ${sessionExpiredTime.toISOString()}), no refund needed`);
        return { success: false, amount: 0, message: 'Session not yet expired' };
      }
      
      // ENHANCED PROTECTION: Check for existing refund for waiting sessions (edge case protection)
      if (currentSession.status === 'waiting') {
        const userTransactions = await storage.getTransactionsByUser(parseInt(userId));
        // Check both exact reference pattern AND broader patterns that might contain sessionId
        const existingRefund = userTransactions.find(t => 
          t.type === 'refund' && (
            t.reference === `otissim_v1_refund_${userId}_${sessionId}` || // Exact pattern
            (t.reference && t.reference.includes(sessionId)) || // Reference contains sessionId
            (t.description && t.description.includes(sessionId)) // Description contains sessionId
          )
        );
        if (existingRefund) {
          console.log(`[OTISSIM V1 REFUND] Session ${sessionId} waiting but already has refund transaction (ref: ${existingRefund.reference}), no additional refund needed`);
          return { success: false, amount: 0, message: 'Refund already exists for this session' };
        }
      }
      
      console.log(`[OTISSIM V1 REFUND] Session ${sessionId} is expired (status: ${currentSession.status}, expired ${Math.round((now.getTime() - sessionExpiredTime.getTime()) / 60000)} minutes ago), proceeding with refund check`);
    }
    
    // VERIFY SESSION BELONGS TO USER - Đảm bảo session thuộc về user này
    const session = await storage.getPhoneRentalHistoryBySession(sessionId);
    if (!session) {
      console.log(`[OTISSIM V1 REFUND] Session ${sessionId} không tồn tại trong database`);
      console.log(`[OTISSIM V1 REFUND] Kiểm tra tất cả transactions của user ${userId} có chứa sessionId ${sessionId} không...`);
      
      // Tìm transaction liên quan đến sessionId này
      const userTransactions = await storage.getTransactionsByUser(parseInt(userId));
      const relatedTransactions = userTransactions.filter(t => 
        t.reference?.includes(sessionId) || 
        t.description?.includes(sessionId)
      );
      
      if (relatedTransactions.length > 0) {
        console.log(`[OTISSIM V1 REFUND] Tìm thấy ${relatedTransactions.length} transaction(s) liên quan đến sessionId ${sessionId}`);
        relatedTransactions.forEach((t, i) => {
          console.log(`[OTISSIM V1 REFUND] Transaction ${i+1}:`, {
            id: t.id,
            type: t.type,
            amount: t.amount,
            reference: t.reference,
            description: t.description?.substring(0, 100)
          });
        });
        
        // Nếu có charge transaction mà không có session record, có thể session bị mất
        const chargeTransaction = relatedTransactions.find(t => 
          (t.type === 'charge' || t.type === 'otissim_v1') && 
          t.reference?.includes(`charge_${sessionId}`)
        );
        
        if (chargeTransaction && Math.abs(parseFloat(chargeTransaction.amount.toString())) > 0) {
          console.log(`[OTISSIM V1 REFUND] Tìm thấy charge transaction cho session không tồn tại. Tiến hành hoàn tiền emergency...`);
          
          // Emergency refund - sử dụng số tiền từ charge transaction
          const refundAmount = Math.abs(parseFloat(chargeTransaction.amount.toString()));
          console.log(`[OTISSIM V1 REFUND EMERGENCY] Hoàn tiền ${refundAmount} VND cho sessionId bị mất: ${sessionId}`);
          
          // 🔒 ATOMIC EMERGENCY REFUND TRANSACTION - Fix theo architect feedback
          return await db.transaction(async (tx) => {
            // 🔒 DB-LEVEL IDEMPOTENCY: Unified reference pattern prevents double refunds
            const refundReference = `otissim_v1_refund_${userId}_${sessionId}`;
            // Removed pre-check - createTransaction will handle ON CONFLICT
            
            // 🔒 ATOMIC: Increment balance safely using SQL to prevent race conditions
            const { beforeBalance, afterBalance } = await storage.incrementUserBalance(parseInt(userId), refundAmount, tx);
            
            // 🔒 ATOMIC: Create transaction record within same transaction
            await storage.createTransaction({
              userId: parseInt(userId),
              type: 'refund',
              amount: refundAmount.toString(),
              description: `Emergency refund - Session ${sessionId} not found but charge exists`,
              reference: refundReference,
              status: 'completed',
              balanceBefore: beforeBalance.toString(),
              balanceAfter: afterBalance.toString()
            }, tx);
            
            console.log(`[OTISSIM V1 REFUND EMERGENCY] Hoàn tiền thành công ${refundAmount} VND cho user ${userId}`);
            return { success: true, amount: refundAmount, message: 'Emergency refund completed' };
          });
        }
      }
      
      console.log(`[OTISSIM V1 REFUND] Không tìm thấy session hoặc transaction liên quan cho ${sessionId}, từ chối hoàn tiền`);
      return { success: false, amount: 0, message: 'Session not found' };
    }
    
    console.log(`[OTISSIM V1 REFUND DEBUG] Session found: userId=${session.userId} (type: ${typeof session.userId}), requestUserId=${userId} (type: ${typeof userId})`);
    if (session.userId.toString() !== userId.toString()) {
      console.log(`[OTISSIM V1 REFUND] Session ${sessionId} thuộc về user ${session.userId}, không phải user ${userId}, từ chối hoàn tiền`);
      return { success: false, amount: 0, message: 'Session does not belong to user' };
    }
    
    // Lấy giá từ service pricing thay vì cố định
    const servicePricing = await storage.getServicePricing('otissim_v1');
    const REFUND_AMOUNT = servicePricing ? parseFloat(servicePricing.price) : 2100; // Fallback 2100 (365otp pricing)
    
    // VERIFY ORIGINAL CHARGE - Kiểm tra số tiền đã charge ban đầu để không hoàn quá
    const userTransactions = await storage.getTransactionsByUser(parseInt(userId));
    console.log(`[OTISSIM V1 REFUND DEBUG] Looking for charge transaction for session ${sessionId}`);
    console.log(`[OTISSIM V1 REFUND DEBUG] Found ${userTransactions.length} transactions for user ${userId}`);
    
    const chargeTransaction = userTransactions.find(t => 
      (t.type === 'charge' || t.type === 'otissim_v1') && 
      (t.reference === `charge_${sessionId}` || 
       t.description?.includes(sessionId))
    );
    
    if (chargeTransaction) {
      console.log(`[OTISSIM V1 REFUND DEBUG] Found charge transaction:`, {
        id: chargeTransaction.id,
        type: chargeTransaction.type,
        amount: chargeTransaction.amount,
        reference: chargeTransaction.reference,
        description: chargeTransaction.description
      });
    } else {
      console.log(`[OTISSIM V1 REFUND DEBUG] No charge transaction found for session ${sessionId}`);
      // Log all transactions for debugging
      userTransactions.forEach(t => {
        console.log(`[OTISSIM V1 REFUND DEBUG] Transaction:`, {
          id: t.id,
          type: t.type,
          amount: t.amount,
          reference: t.reference,
          description: t.description?.substring(0, 100)
        });
      });
    }
    
    // 🔒 ATOMIC REFUND TRANSACTION - CLAIM-FIRST PATTERN (architect recommendation)
    return await db.transaction(async (tx) => {
      // 🔒 ATOMIC CLAIM: Try to claim refund processing rights atomically to prevent race conditions
      // SPECIAL CASE: For emergency refunds (session doesn't exist), skip schema claiming and rely on transaction-based idempotency
      const session = await storage.getPhoneRentalHistoryBySession(sessionId);
      if (!session) {
        console.log(`[OTISSIM V1 REFUND] Emergency refund for missing session ${sessionId} - skipping schema claim, using transaction-based idempotency only`);
        
        // Check for existing refund transaction to prevent duplicates
        const userTransactions = await storage.getTransactionsByUser(parseInt(userId));
        const existingRefundTx = userTransactions.find(t => 
          t.type === 'refund' && t.reference === refundReference
        );
        if (existingRefundTx) {
          console.log(`[OTISSIM V1 REFUND] Emergency refund for session ${sessionId} already exists (ref: ${existingRefundTx.reference}), skipping`);
          return { success: false, amount: 0, message: 'Emergency refund already processed' };
        }
      } else {
        // Normal case: Session exists, use schema-based claiming
        try {
          const claimResult = await storage.markPhoneRentalRefundProcessed(sessionId, tx);
          if (!claimResult) {
            console.log(`[OTISSIM V1 REFUND] Session ${sessionId} already claimed for refund processing, skipping`);
            return { success: false, amount: 0, message: 'Refund already processed by another process' };
          }
          console.log(`[OTISSIM V1 REFUND] Successfully claimed session ${sessionId} for refund processing`);
        } catch (error: any) {
          // Only allow schema-specific errors to fallback to legacy protection
          if (error?.code === '42703' || error?.message?.includes('column') || error?.message?.includes('does not exist')) {
            console.log(`[OTISSIM V1 REFUND] Schema claiming not available yet (expected during migration), using legacy protection`);
          } else {
            console.error(`[OTISSIM V1 REFUND] Unexpected error during claim, aborting refund:`, error);
            throw error; // Abort transaction for unexpected errors
          }
        }
      }
      
      if (chargeTransaction) {
        const originalChargeAmount = Math.abs(parseFloat(chargeTransaction.amount));
        if (REFUND_AMOUNT > originalChargeAmount) {
          console.log(`[OTISSIM V1 REFUND] Số tiền hoàn (${REFUND_AMOUNT}) lớn hơn số tiền đã charge (${originalChargeAmount}), điều chỉnh refund`);
          // Điều chỉnh số tiền hoàn về bằng số tiền đã charge
          const adjustedRefundAmount = originalChargeAmount;
          
          // 🔒 ATOMIC: Increment balance safely using SQL to prevent race conditions
          const { beforeBalance, afterBalance } = await storage.incrementUserBalance(parseInt(userId), adjustedRefundAmount, tx);
          
          // 🔒 ATOMIC: Create transaction record within same transaction
          await storage.createTransaction({
            userId: parseInt(userId),
            type: 'refund',
            amount: adjustedRefundAmount.toString(),
            description: `Hoàn tiền OtisSim v1 (điều chỉnh) - ${reason}`,
            reference: refundReference,
            status: 'completed',
            balanceBefore: beforeBalance.toString(),
            balanceAfter: afterBalance.toString()
          }, tx);
          
          console.log(`[OTISSIM V1 REFUND] ${reason} - Refunded ${adjustedRefundAmount} VND (adjusted) to user ${userId}`);
          return { success: true, amount: adjustedRefundAmount };
        }
      }
      
      // 🔒 ATOMIC: Standard refund flow using atomic operations
      const { beforeBalance, afterBalance } = await storage.incrementUserBalance(parseInt(userId), REFUND_AMOUNT, tx);
      
      // 🔒 ATOMIC: Create transaction record within same transaction
      await storage.createTransaction({
        userId: parseInt(userId),
        type: 'refund',
        amount: REFUND_AMOUNT.toString(),
        description: `Hoàn tiền OtisSim v1 - ${reason}`,
        reference: refundReference,
        status: 'completed',
        balanceBefore: beforeBalance.toString(),
        balanceAfter: afterBalance.toString()
      }, tx);
      
      console.log(`[OTISSIM V1 REFUND] ${reason} - Refunded ${REFUND_AMOUNT} VND to user ${userId}`);
      return { success: true, amount: REFUND_AMOUNT };
    });
  } catch (error) {
    console.error(`[OTISSIM V1 REFUND ERROR] ${reason}:`, error);
    return { success: false, amount: 0 };
  }
}

/**
 * OTISSIM V2 REFUND LOGIC
 * Handles all refund scenarios for OtisSim v2 service
 */
export async function processOtissimV2Refund(userId: string, sessionId: string, reason: string, reference: string) {
  try {
    // 🔒 DB-LEVEL IDEMPOTENCY: Reference pattern for all V2 refund scenarios
    const refundReference = `otissim_v2_refund_${userId}_${sessionId}`;
    // Removed pre-check - now relying on createTransaction's ON CONFLICT handling
    
    // ENHANCED SCHEMA-BASED REFUND PROTECTION
    const currentSession = await storage.getPhoneRentalHistoryBySession(sessionId);
    if (currentSession) {
      // Check if refund already processed using new schema fields (if available)
      try {
        const isAlreadyRefunded = await storage.isPhoneRentalRefundProcessed(sessionId);
        if (isAlreadyRefunded) {
          console.log(`[OTISSIM V2 REFUND] Session ${sessionId} already marked as refund processed in schema`);
          return { success: false, amount: 0, message: 'Refund already processed (schema)' };
        }
      } catch (error) {
        // Schema fields not available yet during migration - continue with refund eligibility check
        console.log(`[OTISSIM V2 REFUND] Schema marking not available yet (expected during migration), proceeding with refund check`);
      }
      
      // Sessions already successfully completed should NOT be refunded
      if (currentSession.status === 'completed') {
        console.log(`[OTISSIM V2 REFUND] Session ${sessionId} was completed successfully, no refund needed`);
        return { success: false, amount: 0, message: 'Session was completed successfully, no refund needed' };
      }
      
      // TIME-BASED ELIGIBILITY: Check if session is actually expired (architect recommendation)
      const sessionExpiredTime = new Date(currentSession.expiresAt);
      const now = new Date();
      const isSessionExpired = now >= sessionExpiredTime;
      
      if (!isSessionExpired) {
        console.log(`[OTISSIM V2 REFUND] Session ${sessionId} not yet expired (expires at ${sessionExpiredTime.toISOString()}), no refund needed`);
        return { success: false, amount: 0, message: 'Session not yet expired' };
      }
      
      // ENHANCED PROTECTION: Check for existing refund for waiting sessions (edge case protection)
      if (currentSession.status === 'waiting') {
        const userTransactions = await storage.getTransactionsByUser(parseInt(userId));
        // Check both exact reference pattern AND broader patterns that might contain sessionId
        const existingRefund = userTransactions.find(t => 
          t.type === 'refund' && (
            t.reference === `otissim_v2_refund_${userId}_${sessionId}` || // Exact pattern
            (t.reference && t.reference.includes(sessionId)) || // Reference contains sessionId
            (t.description && t.description.includes(sessionId)) // Description contains sessionId
          )
        );
        if (existingRefund) {
          console.log(`[OTISSIM V2 REFUND] Session ${sessionId} waiting but already has refund transaction (ref: ${existingRefund.reference}), no additional refund needed`);
          return { success: false, amount: 0, message: 'Refund already exists for this session' };
        }
      }
      
      console.log(`[OTISSIM V2 REFUND] Session ${sessionId} is expired (status: ${currentSession.status}, expired ${Math.round((now.getTime() - sessionExpiredTime.getTime()) / 60000)} minutes ago), proceeding with refund check`);
    }
    
    // VERIFY SESSION BELONGS TO USER - Đảm bảo session thuộc về user này
    // CHÚ Ý: Với lỗi API sớm, session có thể chưa được lưu vào database
    const session = await storage.getPhoneRentalHistoryBySession(sessionId);
    if (session) {
      console.log(`[OTISSIM V2 REFUND DEBUG] Session found: userId=${session.userId} (type: ${typeof session.userId}), requestUserId=${userId} (type: ${typeof userId})`);
      if (session.userId.toString() !== userId.toString()) {
        console.log(`[OTISSIM V2 REFUND] Session ${sessionId} không thuộc về user ${userId}, từ chối hoàn tiền`);
        return { success: false, amount: 0, message: 'Session does not belong to user' };
      }
    } else {
      console.log(`[OTISSIM V2 REFUND DEBUG] Session ${sessionId} not found in database - checking for charge transaction`);
      
      // SECURITY: Verify charge transaction exists before allowing emergency refund (mirror V1 pattern)
      const userTransactions = await storage.getTransactionsByUser(parseInt(userId));
      const chargeTransaction = userTransactions.find(t => 
        (t.type === 'charge' || t.type === 'otissim_v2') && 
        (t.reference === `charge_${sessionId}` || t.description?.includes(sessionId))
      );
      
      if (!chargeTransaction || Math.abs(parseFloat(chargeTransaction.amount.toString())) <= 0) {
        console.log(`[OTISSIM V2 REFUND] No valid charge transaction found for missing session ${sessionId}, refusing refund`);
        return { success: false, amount: 0, message: 'Session not found and no charge transaction exists' };
      }
      
      console.log(`[OTISSIM V2 REFUND] Found charge transaction for missing session, allowing emergency refund`);
    }
    
    // Lấy giá từ service pricing thay vì cố định
    const servicePricing = await storage.getServicePricing('otissim_v2');
    const REFUND_AMOUNT = servicePricing ? parseFloat(servicePricing.price) : 2700; // Fallback 2700 VND cho V2
    
    // VERIFY ORIGINAL CHARGE - Kiểm tra số tiền đã charge ban đầu để không hoàn quá
    const userTransactions = await storage.getTransactionsByUser(parseInt(userId));
    console.log(`[OTISSIM V2 REFUND DEBUG] Looking for charge transaction for session ${sessionId}`);
    console.log(`[OTISSIM V2 REFUND DEBUG] Found ${userTransactions.length} transactions for user ${userId}`);
    
    const chargeTransaction = userTransactions.find(t => 
      (t.type === 'charge' || t.type === 'otissim_v2') && 
      (t.reference === `charge_${sessionId}` || 
       t.description?.includes(sessionId))
    );
    
    if (chargeTransaction) {
      console.log(`[OTISSIM V2 REFUND DEBUG] Found charge transaction:`, {
        id: chargeTransaction.id,
        type: chargeTransaction.type,
        amount: chargeTransaction.amount,
        reference: chargeTransaction.reference,
        description: chargeTransaction.description
      });
    } else {
      console.log(`[OTISSIM V2 REFUND DEBUG] No charge transaction found for session ${sessionId}`);
    }
    
    // 🔒 ATOMIC REFUND TRANSACTION - CLAIM-FIRST PATTERN (architect recommendation)
    return await db.transaction(async (tx) => {
      // 🔒 ATOMIC CLAIM: Try to claim refund processing rights atomically to prevent race conditions
      // SPECIAL CASE: For emergency refunds (session doesn't exist), skip schema claiming and rely on transaction-based idempotency
      const session = await storage.getPhoneRentalHistoryBySession(sessionId);
      if (!session) {
        console.log(`[OTISSIM V2 REFUND] Emergency refund for missing session ${sessionId} - skipping schema claim, using transaction-based idempotency only`);
        
        // Check for existing refund transaction to prevent duplicates
        const userTransactions = await storage.getTransactionsByUser(parseInt(userId));
        const existingRefundTx = userTransactions.find(t => 
          t.type === 'refund' && t.reference === refundReference
        );
        if (existingRefundTx) {
          console.log(`[OTISSIM V2 REFUND] Emergency refund for session ${sessionId} already exists (ref: ${existingRefundTx.reference}), skipping`);
          return { success: false, amount: 0, message: 'Emergency refund already processed' };
        }
      } else {
        // Normal case: Session exists, use schema-based claiming
        try {
          const claimResult = await storage.markPhoneRentalRefundProcessed(sessionId, tx);
          if (!claimResult) {
            console.log(`[OTISSIM V2 REFUND] Session ${sessionId} already claimed for refund processing, skipping`);
            return { success: false, amount: 0, message: 'Refund already processed by another process' };
          }
          console.log(`[OTISSIM V2 REFUND] Successfully claimed session ${sessionId} for refund processing`);
        } catch (error: any) {
          // Only allow schema-specific errors to fallback to legacy protection
          if (error?.code === '42703' || error?.message?.includes('column') || error?.message?.includes('does not exist')) {
            console.log(`[OTISSIM V2 REFUND] Schema claiming not available yet (expected during migration), using legacy protection`);
          } else {
            console.error(`[OTISSIM V2 REFUND] Unexpected error during claim, aborting refund:`, error);
            throw error; // Abort transaction for unexpected errors
          }
        }
      }
      
      if (chargeTransaction) {
        const originalChargeAmount = Math.abs(parseFloat(chargeTransaction.amount));
        if (REFUND_AMOUNT > originalChargeAmount) {
          console.log(`[OTISSIM V2 REFUND] Số tiền hoàn (${REFUND_AMOUNT}) lớn hơn số tiền đã charge (${originalChargeAmount}), điều chỉnh refund`);
          const adjustedRefundAmount = originalChargeAmount;
          
          // 🔒 ATOMIC: Increment balance safely using SQL to prevent race conditions
          const { beforeBalance, afterBalance } = await storage.incrementUserBalance(parseInt(userId), adjustedRefundAmount, tx);
          
          // 🔒 ATOMIC: Create transaction record within same transaction
          await storage.createTransaction({
            userId: parseInt(userId),
            type: 'refund',
            amount: adjustedRefundAmount.toString(),
            description: `Hoàn tiền OtisSim v2 (điều chỉnh) - ${reason}`,
            reference: refundReference,
            status: 'completed',
            balanceBefore: beforeBalance.toString(),
            balanceAfter: afterBalance.toString()
          }, tx);
          
          console.log(`[OTISSIM V2 REFUND] ${reason} - Refunded ${adjustedRefundAmount} VND (adjusted) to user ${userId}`);
          return { success: true, amount: adjustedRefundAmount };
        }
      }
      
      // 🔒 ATOMIC: Standard refund flow using atomic operations
      const { beforeBalance, afterBalance } = await storage.incrementUserBalance(parseInt(userId), REFUND_AMOUNT, tx);
      
      // 🔒 ATOMIC: Create transaction record within same transaction
      await storage.createTransaction({
        userId: parseInt(userId),
        type: 'refund',
        amount: REFUND_AMOUNT.toString(),
        description: `Hoàn tiền OtisSim v2 - ${reason}`,
        reference: refundReference,
        status: 'completed',
        balanceBefore: beforeBalance.toString(),
        balanceAfter: afterBalance.toString()
      }, tx);
      
      console.log(`[OTISSIM V2 REFUND] ${reason} - Refunded ${REFUND_AMOUNT} VND to user ${userId}`);
      return { success: true, amount: REFUND_AMOUNT };
    });
  } catch (error) {
    console.error(`[OTISSIM V2 REFUND ERROR] ${reason}:`, error);
    return { success: false, amount: 0 };
  }
}

/**
 * OTISSIM V3 REFUND LOGIC
 * Handles all refund scenarios for OtisSim v3 service
 */
export async function processOtissimV3Refund(userId: string, sessionId: string, reason: string, reference: string) {
  try {
    // 🔒 DB-LEVEL IDEMPOTENCY: Reference pattern for all V3 refund scenarios
    const refundReference = `otissim_v3_refund_${userId}_${sessionId}`;
    // Removed pre-check - now relying on createTransaction's ON CONFLICT handling
    
    // ENHANCED SCHEMA-BASED REFUND PROTECTION
    const currentSession = await storage.getPhoneRentalHistoryBySession(sessionId);
    if (currentSession) {
      // Check if refund already processed using new schema fields (if available)
      try {
        const isAlreadyRefunded = await storage.isPhoneRentalRefundProcessed(sessionId);
        if (isAlreadyRefunded) {
          console.log(`[OTISSIM V3 REFUND] Session ${sessionId} already marked as refund processed in schema`);
          return { success: false, amount: 0, message: 'Refund already processed (schema)' };
        }
      } catch (error) {
        // Schema fields not available yet during migration - continue with refund eligibility check
        console.log(`[OTISSIM V3 REFUND] Schema marking not available yet (expected during migration), proceeding with refund check`);
      }
      
      // Sessions already successfully completed should NOT be refunded
      if (currentSession.status === 'completed') {
        console.log(`[OTISSIM V3 REFUND] Session ${sessionId} was completed successfully, no refund needed`);
        return { success: false, amount: 0, message: 'Session was completed successfully, no refund needed' };
      }
      
      // TIME-BASED ELIGIBILITY: Check if session is actually expired (architect recommendation)
      const sessionExpiredTime = new Date(currentSession.expiresAt);
      const now = new Date();
      const isSessionExpired = now >= sessionExpiredTime;
      
      if (!isSessionExpired) {
        console.log(`[OTISSIM V3 REFUND] Session ${sessionId} not yet expired (expires at ${sessionExpiredTime.toISOString()}), no refund needed`);
        return { success: false, amount: 0, message: 'Session not yet expired' };
      }
      
      // ENHANCED PROTECTION: Check for existing refund for waiting sessions (edge case protection)
      if (currentSession.status === 'waiting') {
        const userTransactions = await storage.getTransactionsByUser(parseInt(userId));
        // Check both exact reference pattern AND broader patterns that might contain sessionId
        const existingRefund = userTransactions.find(t => 
          t.type === 'refund' && (
            t.reference === `otissim_v3_refund_${userId}_${sessionId}` || // Exact pattern
            (t.reference && t.reference.includes(sessionId)) || // Reference contains sessionId
            (t.description && t.description.includes(sessionId)) // Description contains sessionId
          )
        );
        if (existingRefund) {
          console.log(`[OTISSIM V3 REFUND] Session ${sessionId} waiting but already has refund transaction (ref: ${existingRefund.reference}), no additional refund needed`);
          return { success: false, amount: 0, message: 'Refund already exists for this session' };
        }
      }
      
      console.log(`[OTISSIM V3 REFUND] Session ${sessionId} is expired (status: ${currentSession.status}, expired ${Math.round((now.getTime() - sessionExpiredTime.getTime()) / 60000)} minutes ago), proceeding with refund check`);
    }
    
    // VERIFY SESSION BELONGS TO USER - Đảm bảo session thuộc về user này
    // CHÚ Ý: Với lỗi API sớm, session có thể chưa được lưu vào database  
    const session = await storage.getPhoneRentalHistoryBySession(sessionId);
    if (session) {
      console.log(`[OTISSIM V3 REFUND DEBUG] Session found: userId=${session.userId} (type: ${typeof session.userId}), requestUserId=${userId} (type: ${typeof userId})`);
      if (session.userId.toString() !== userId.toString()) {
        console.log(`[OTISSIM V3 REFUND] Session ${sessionId} không thuộc về user ${userId}, từ chối hoàn tiền`);
        return { success: false, amount: 0, message: 'Session does not belong to user' };
      }
    } else {
      console.log(`[OTISSIM V3 REFUND DEBUG] Session ${sessionId} not found in database - checking for charge transaction`);
    }
    
    // Lấy giá từ service pricing thay vì cố định
    const servicePricing = await storage.getServicePricing('otissim_v3');
    const REFUND_AMOUNT = servicePricing ? parseFloat(servicePricing.price) : 2000; // Fallback 2000 nếu không có config
    
    // VERIFY ORIGINAL CHARGE - Kiểm tra số tiền đã charge ban đầu để không hoàn quá (includes security check for missing sessions)
    const userTransactions = await storage.getTransactionsByUser(parseInt(userId));
    console.log(`[OTISSIM V3 REFUND DEBUG] Looking for charge transaction for session ${sessionId}`);
    console.log(`[OTISSIM V3 REFUND DEBUG] Found ${userTransactions.length} transactions for user ${userId}`);
    
    const chargeTransaction = userTransactions.find(t => 
      (t.type === 'charge' || t.type === 'otissim_v3') && 
      (t.reference === `charge_${sessionId}` || 
       t.description?.includes(sessionId))
    );
    
    // SECURITY: For missing sessions, require verified charge transaction (mirror V1 pattern)
    if (!session && (!chargeTransaction || Math.abs(parseFloat(chargeTransaction.amount.toString())) <= 0)) {
      console.log(`[OTISSIM V3 REFUND] No valid charge transaction found for missing session ${sessionId}, refusing refund`);
      return { success: false, amount: 0, message: 'Session not found and no charge transaction exists' };
    }
    
    if (chargeTransaction) {
      console.log(`[OTISSIM V3 REFUND DEBUG] Found charge transaction:`, {
        id: chargeTransaction.id,
        type: chargeTransaction.type,
        amount: chargeTransaction.amount,
        reference: chargeTransaction.reference,
        description: chargeTransaction.description
      });
    } else {
      console.log(`[OTISSIM V3 REFUND DEBUG] No charge transaction found for session ${sessionId}`);
    }
    
    // 🔒 ATOMIC REFUND TRANSACTION - CLAIM-FIRST PATTERN (architect recommendation)
    return await db.transaction(async (tx) => {
      // 🔒 ATOMIC CLAIM: Try to claim refund processing rights atomically to prevent race conditions
      // SPECIAL CASE: For emergency refunds (session doesn't exist), skip schema claiming and rely on transaction-based idempotency
      if (!session) {
        console.log(`[OTISSIM V3 REFUND] Emergency refund for missing session ${sessionId} - skipping schema claim, using transaction-based idempotency only`);
        
        // Check for existing refund transaction to prevent duplicates
        const existingRefundTx = userTransactions.find(t => 
          t.type === 'refund' && t.reference === refundReference
        );
        if (existingRefundTx) {
          console.log(`[OTISSIM V3 REFUND] Emergency refund for session ${sessionId} already exists (ref: ${existingRefundTx.reference}), skipping`);
          return { success: false, amount: 0, message: 'Emergency refund already processed' };
        }
      } else {
        // Normal case: Session exists, use schema-based claiming
        try {
          const claimResult = await storage.markPhoneRentalRefundProcessed(sessionId, tx);
          if (!claimResult) {
            console.log(`[OTISSIM V3 REFUND] Session ${sessionId} already claimed for refund processing, skipping`);
            return { success: false, amount: 0, message: 'Refund already processed by another process' };
          }
          console.log(`[OTISSIM V3 REFUND] Successfully claimed session ${sessionId} for refund processing`);
        } catch (error: any) {
          // Only allow schema-specific errors to fallback to legacy protection
          if (error?.code === '42703' || error?.message?.includes('column') || error?.message?.includes('does not exist')) {
            console.log(`[OTISSIM V3 REFUND] Schema claiming not available yet (expected during migration), using legacy protection`);
          } else {
            console.error(`[OTISSIM V3 REFUND] Error during claim, using fallback protection:`, error);
            // Instead of throwing and aborting transaction, continue with legacy protection
            // This prevents "current transaction is aborted" error while maintaining safety
          }
        }
      }
      
      // ADDITIONAL SAFETY: Check for existing refund transaction even when schema claiming fails
      const existingRefundTx = userTransactions.find(t => 
        t.type === 'refund' && t.reference === refundReference
      );
      if (existingRefundTx) {
        console.log(`[OTISSIM V3 REFUND] Refund transaction already exists (ref: ${existingRefundTx.reference}), skipping duplicate refund`);
        return { success: false, amount: 0, message: 'Refund transaction already exists' };
      }
      
      if (chargeTransaction) {
        const originalChargeAmount = Math.abs(parseFloat(chargeTransaction.amount));
        if (REFUND_AMOUNT > originalChargeAmount) {
          console.log(`[OTISSIM V3 REFUND] Số tiền hoàn (${REFUND_AMOUNT}) lớn hơn số tiền đã charge (${originalChargeAmount}), điều chỉnh refund`);
          const adjustedRefundAmount = originalChargeAmount;
          
          // 🔒 ATOMIC: Increment balance safely using SQL to prevent race conditions
          const { beforeBalance, afterBalance } = await storage.incrementUserBalance(parseInt(userId), adjustedRefundAmount, tx);
          
          // 🔒 ATOMIC: Create transaction record within same transaction
          await storage.createTransaction({
            userId: parseInt(userId),
            type: 'refund',
            amount: adjustedRefundAmount.toString(),
            description: `Hoàn tiền OtisSim v3 (điều chỉnh) - ${reason}`,
            reference: refundReference,
            status: 'completed',
            balanceBefore: beforeBalance.toString(),
            balanceAfter: afterBalance.toString()
          }, tx);
          
          console.log(`[OTISSIM V3 REFUND] ${reason} - Refunded ${adjustedRefundAmount} VND (adjusted) to user ${userId}`);
          return { success: true, amount: adjustedRefundAmount };
        }
      }
      
      // 🔒 ATOMIC: Standard refund flow using atomic operations
      const { beforeBalance, afterBalance } = await storage.incrementUserBalance(parseInt(userId), REFUND_AMOUNT, tx);
      
      // 🔒 ATOMIC: Create transaction record within same transaction
      await storage.createTransaction({
        userId: parseInt(userId),
        type: 'refund',
        amount: REFUND_AMOUNT.toString(),
        description: `Hoàn tiền OtisSim v3 - ${reason}`,
        reference: refundReference,
        status: 'completed',
        balanceBefore: beforeBalance.toString(),
        balanceAfter: afterBalance.toString()
      }, tx);
      
      console.log(`[OTISSIM V3 REFUND] ${reason} - Refunded ${REFUND_AMOUNT} VND to user ${userId}`);
      return { success: true, amount: REFUND_AMOUNT };
    });
  } catch (error) {
    console.error(`[OTISSIM V3 REFUND ERROR] ${reason}:`, error);
    return { success: false, amount: 0 };
  }
}

/**
 * TIKTOK RENTAL REFUND LOGIC
 * Handles all refund scenarios for TikTok rental service
 */
export async function processTiktokRentalRefund(userId: string, sessionId: string, reason: string, reference: string) {
  try {
    // 🔒 DB-LEVEL IDEMPOTENCY: Reference pattern for all TikTok refund scenarios
    const refundReference = `tiktok_refund_${userId}_${sessionId}`;
    // Removed pre-check - now relying on createTransaction's ON CONFLICT handling
    
    // ENHANCED SCHEMA-BASED REFUND PROTECTION
    const currentSession = await storage.getTiktokRentalBySessionId(sessionId);
    if (currentSession) {
      // Check if refund already processed using new schema fields (if available)
      try {
        const isAlreadyRefunded = await storage.isTiktokRentalRefundProcessed(sessionId);
        if (isAlreadyRefunded) {
          console.log(`[TIKTOK REFUND] Session ${sessionId} already marked as refund processed in schema`);
          return { success: false, amount: 0, message: 'Refund already processed (schema)' };
        }
      } catch (error) {
        // Schema fields not available yet during migration - continue with refund eligibility check
        console.log(`[TIKTOK REFUND] Schema marking not available yet (expected during migration), proceeding with refund check`);
      }
      
      // Sessions already successfully completed should NOT be refunded
      if (currentSession.status === 'completed') {
        console.log(`[TIKTOK REFUND] Session ${sessionId} was completed successfully, no refund needed`);
        return { success: false, amount: 0, message: 'Session was completed successfully, no refund needed' };
      }
      
      // TIME-BASED ELIGIBILITY: Check if session is actually expired (architect recommendation)
      const sessionExpiredTime = new Date(currentSession.expiresAt);
      const now = new Date();
      const isSessionExpired = now >= sessionExpiredTime;
      
      if (!isSessionExpired) {
        console.log(`[TIKTOK REFUND] Session ${sessionId} not yet expired (expires at ${sessionExpiredTime.toISOString()}), no refund needed`);
        return { success: false, amount: 0, message: 'Session not yet expired' };
      }
      
      // ENHANCED PROTECTION: Check for existing refund for waiting sessions (edge case protection)
      if (currentSession.status === 'waiting') {
        const userTransactions = await storage.getTransactionsByUser(parseInt(userId));
        // Check both exact reference pattern AND broader patterns that might contain sessionId
        const existingRefund = userTransactions.find(t => 
          t.type === 'refund' && (
            t.reference === `tiktok_refund_${userId}_${sessionId}` || // Exact pattern
            (t.reference && t.reference.includes(sessionId)) || // Reference contains sessionId
            (t.description && t.description.includes(sessionId)) // Description contains sessionId
          )
        );
        if (existingRefund) {
          console.log(`[TIKTOK REFUND] Session ${sessionId} waiting but already has refund transaction (ref: ${existingRefund.reference}), no additional refund needed`);
          return { success: false, amount: 0, message: 'Refund already exists for this session' };
        }
      }
      
      console.log(`[TIKTOK REFUND] Session ${sessionId} is expired (status: ${currentSession.status}, expired ${Math.round((now.getTime() - sessionExpiredTime.getTime()) / 60000)} minutes ago), proceeding with refund check`);
    }
    
    // VERIFY SESSION BELONGS TO USER - Đảm bảo session thuộc về user này
    const session = await storage.getTiktokRentalBySessionId(sessionId);
    if (!session || session.userId.toString() !== userId) {
      console.log(`[TIKTOK REFUND] Session ${sessionId} không thuộc về user ${userId}, từ chối hoàn tiền`);
      return { success: false, amount: 0, message: 'Session does not belong to user' };
    }
    
    // Lấy giá từ service pricing thay vì parameter truyền vào
    const servicePricing = await storage.getServicePricing('tiktok_rental');
    const REFUND_AMOUNT = servicePricing ? parseFloat(servicePricing.price) : 1200; // Fallback 1200 nếu không có config
    
    // VERIFY ORIGINAL CHARGE - Kiểm tra số tiền đã charge ban đầu để không hoàn quá
    const userTransactions = await storage.getTransactionsByUser(parseInt(userId));
    const chargeTransaction = userTransactions.find(t => 
      (t.type === 'charge' || t.type === 'tiktok_rental') && 
      (t.reference?.includes(sessionId) || 
       t.description?.includes(sessionId) || 
       (t.description?.includes('TikTok') && t.reference?.startsWith('charge_')))
    );
    
    // 🔒 ATOMIC REFUND TRANSACTION - CLAIM-FIRST PATTERN (architect recommendation)
    return await db.transaction(async (tx) => {
      // 🔒 ATOMIC CLAIM: Try to claim refund processing rights atomically to prevent race conditions
      try {
        const claimResult = await storage.markTiktokRentalRefundProcessed(sessionId, tx);
        if (!claimResult) {
          console.log(`[TIKTOK REFUND] Session ${sessionId} already claimed for refund processing, skipping`);
          return { success: false, amount: 0, message: 'Refund already processed by another process' };
        }
        console.log(`[TIKTOK REFUND] Successfully claimed session ${sessionId} for refund processing`);
      } catch (error: any) {
        // Only allow schema-specific errors to fallback to legacy protection
        if (error?.code === '42703' || error?.message?.includes('column') || error?.message?.includes('does not exist')) {
          console.log(`[TIKTOK REFUND] Schema claiming not available yet (expected during migration), using legacy protection`);
        } else {
          console.error(`[TIKTOK REFUND] Unexpected error during claim, aborting refund:`, error);
          throw error; // Abort transaction for unexpected errors
        }
      }
      
      if (chargeTransaction) {
        const originalChargeAmount = Math.abs(parseFloat(chargeTransaction.amount));
        if (REFUND_AMOUNT > originalChargeAmount) {
          console.log(`[TIKTOK REFUND] Số tiền hoàn (${REFUND_AMOUNT}) lớn hơn số tiền đã charge (${originalChargeAmount}), điều chỉnh refund`);
          const adjustedRefundAmount = originalChargeAmount;
          
          // 🔒 ATOMIC: Increment balance safely using SQL to prevent race conditions
          const { beforeBalance, afterBalance } = await storage.incrementUserBalance(parseInt(userId), adjustedRefundAmount, tx);
          
          // 🔒 ATOMIC: Create transaction record within same transaction
          await storage.createTransaction({
            userId: parseInt(userId),
            type: 'refund',
            amount: adjustedRefundAmount.toString(),
            description: `Hoàn tiền TikTok (điều chỉnh) - ${reason}`,
            reference: refundReference,
            status: 'completed',
            balanceBefore: beforeBalance.toString(),
            balanceAfter: afterBalance.toString()
          }, tx);
          
          console.log(`[TIKTOK REFUND] ${reason} - Refunded ${adjustedRefundAmount} VND (adjusted) to user ${userId}`);
          return { success: true, amount: adjustedRefundAmount };
        }
      }
      
      // 🔒 ATOMIC: Standard refund flow using atomic operations
      const { beforeBalance, afterBalance } = await storage.incrementUserBalance(parseInt(userId), REFUND_AMOUNT, tx);
      
      // 🔒 ATOMIC: Create transaction record within same transaction
      await storage.createTransaction({
        userId: parseInt(userId),
        type: 'refund',
        amount: REFUND_AMOUNT.toString(),
        description: `Hoàn tiền TikTok - ${reason}`,
        reference: refundReference,
        status: 'completed',
        balanceBefore: beforeBalance.toString(),
        balanceAfter: afterBalance.toString()
      }, tx);
      
      console.log(`[TIKTOK REFUND] ${reason} - Refunded ${REFUND_AMOUNT} VND to user ${userId}`);
      return { success: true, amount: REFUND_AMOUNT };
    });
  } catch (error) {
    console.error(`[TIKTOK REFUND ERROR] ${reason}:`, error);
    return { success: false, amount: 0 };
  }
}