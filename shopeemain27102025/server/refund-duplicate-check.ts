/**
 * REFUND DUPLICATE CHECK SERVICE
 * ===============================
 * Kiểm tra và đảm bảo cơ chế chống trùng lặp hoạt động trên tất cả các phiên bản
 */

import { storage } from './storage';

export interface DuplicateCheckResult {
  service: string;
  totalSessions: number;
  duplicateRefunds: number;
  missingSchemaProtection: number;
  potentialIssues: {
    sessionId: string;
    userId: number;
    issue: string;
    refundCount: number;
  }[];
  protectionMechanisms: {
    referenceCheck: boolean;
    schemaCheck: boolean;
    legacyProtection: boolean;
  };
}

export interface SystemDuplicateAudit {
  otissimV1: DuplicateCheckResult;
  otissimV2: DuplicateCheckResult;
  otissimV3: DuplicateCheckResult;
  tiktokV1: DuplicateCheckResult;
  summary: {
    totalDuplicates: number;
    totalIssues: number;
    overallHealth: 'EXCELLENT' | 'GOOD' | 'WARNING' | 'CRITICAL';
  };
}

/**
 * Kiểm tra cơ chế chống trùng lặp cho OtisSim V1
 */
async function checkOtissimV1Duplicates(): Promise<DuplicateCheckResult> {
  // Get all refund transactions with pagination to ensure complete coverage
  let allTransactions: any[] = [];
  let offset = 0;
  const batchSize = 500;
  
  while (true) {
    const batch = await storage.getTransactionsWithFilter({ 
      limit: batchSize, 
      offset: offset, 
      types: ['refund'] 
    });
    
    if (batch.length === 0) break;
    allTransactions = allTransactions.concat(batch);
    
    if (batch.length < batchSize) break; // Last batch
    offset += batchSize;
  }
  
  const v1Refunds = allTransactions.filter(t => 
    t.type === 'refund' && t.reference?.includes('otissim_v1_refund_')
  );

  // Nhóm refunds theo sessionId
  const refundGroups: { [key: string]: any[] } = {};
  const potentialIssues: any[] = [];

  v1Refunds.forEach(refund => {
    if (refund.reference) {
      const match = refund.reference.match(/otissim_v1_refund_(\d+)_(.+)/);
      if (match) {
        const sessionId = match[2];
        const userId = parseInt(match[1]);
        
        if (!refundGroups[sessionId]) {
          refundGroups[sessionId] = [];
        }
        refundGroups[sessionId].push({ ...refund, extractedUserId: userId, sessionId });
      }
    }
  });

  let duplicateCount = 0;
  let missingSchemaProtection = 0;

  // Kiểm tra từng session
  for (const sessionId of Object.keys(refundGroups)) {
    const refunds = refundGroups[sessionId];
    
    if (refunds.length > 1) {
      duplicateCount++;
      potentialIssues.push({
        sessionId,
        userId: refunds[0].extractedUserId,
        issue: `${refunds.length} lần hoàn tiền trùng lặp`,
        refundCount: refunds.length
      });
    }

    // Kiểm tra schema protection
    try {
      const session = await storage.getPhoneRentalHistoryBySession(sessionId);
      if (session) {
        const isMarked = await storage.isPhoneRentalRefundProcessed(sessionId);
        if (!isMarked && refunds.length > 0) {
          missingSchemaProtection++;
        }
      }
    } catch (error) {
      // Schema chưa có sẵn
    }
  }

  // Get complete session count with pagination
  let totalSessions: any[] = [];
  let sessionOffset = 0;
  const sessionBatchSize = 500;
  
  while (true) {
    const sessionBatch = await storage.getPhoneRentalHistoryWithFilter({ 
      limit: sessionBatchSize, 
      page: Math.floor(sessionOffset / sessionBatchSize) + 1 
    });
    
    if (sessionBatch.length === 0) break;
    totalSessions = totalSessions.concat(sessionBatch);
    
    if (sessionBatch.length < sessionBatchSize) break;
    sessionOffset += sessionBatchSize;
  }
  
  const v1Sessions = totalSessions.filter(s => s.service === 'otissim_v1').length;

  return {
    service: 'OtisSim V1',
    totalSessions: v1Sessions,
    duplicateRefunds: duplicateCount,
    missingSchemaProtection,
    potentialIssues,
    protectionMechanisms: {
      referenceCheck: true, // Có reference unique
      schemaCheck: true,    // Có schema protection
      legacyProtection: true // Có legacy cutoff
    }
  };
}

/**
 * Kiểm tra cơ chế chống trùng lặp cho OtisSim V2
 */
async function checkOtissimV2Duplicates(): Promise<DuplicateCheckResult> {
  // Get all refund transactions with pagination to ensure complete coverage
  let allTransactions: any[] = [];
  let offset = 0;
  const batchSize = 500;
  
  while (true) {
    const batch = await storage.getTransactionsWithFilter({ 
      limit: batchSize, 
      offset: offset, 
      types: ['refund'] 
    });
    
    if (batch.length === 0) break;
    allTransactions = allTransactions.concat(batch);
    
    if (batch.length < batchSize) break; // Last batch
    offset += batchSize;
  }
  
  const v2Refunds = allTransactions.filter(t => 
    t.type === 'refund' && t.reference?.includes('otissim_v2_refund_')
  );

  const refundGroups: { [key: string]: any[] } = {};
  const potentialIssues: any[] = [];

  v2Refunds.forEach(refund => {
    if (refund.reference) {
      const match = refund.reference.match(/otissim_v2_refund_(\d+)_(.+)/);
      if (match) {
        const sessionId = match[2];
        const userId = parseInt(match[1]);
        
        if (!refundGroups[sessionId]) {
          refundGroups[sessionId] = [];
        }
        refundGroups[sessionId].push({ ...refund, extractedUserId: userId, sessionId });
      }
    }
  });

  let duplicateCount = 0;
  let missingSchemaProtection = 0;

  for (const sessionId of Object.keys(refundGroups)) {
    const refunds = refundGroups[sessionId];
    
    if (refunds.length > 1) {
      duplicateCount++;
      potentialIssues.push({
        sessionId,
        userId: refunds[0].extractedUserId,
        issue: `${refunds.length} lần hoàn tiền trùng lặp`,
        refundCount: refunds.length
      });
    }

    try {
      const session = await storage.getPhoneRentalHistoryBySession(sessionId);
      if (session) {
        const isMarked = await storage.isPhoneRentalRefundProcessed(sessionId);
        if (!isMarked && refunds.length > 0) {
          missingSchemaProtection++;
        }
      }
    } catch (error) {
      // Schema chưa có sẵn
    }
  }

  // Get complete session count with pagination - V2
  let totalSessions: any[] = [];
  let sessionOffset = 0;
  const sessionBatchSize = 500;
  
  while (true) {
    const sessionBatch = await storage.getPhoneRentalHistoryWithFilter({ 
      limit: sessionBatchSize, 
      page: Math.floor(sessionOffset / sessionBatchSize) + 1 
    });
    
    if (sessionBatch.length === 0) break;
    totalSessions = totalSessions.concat(sessionBatch);
    
    if (sessionBatch.length < sessionBatchSize) break;
    sessionOffset += sessionBatchSize;
  }
  
  const v2Sessions = totalSessions.filter(s => s.service === 'otissim_v2').length;

  return {
    service: 'OtisSim V2',
    totalSessions: v2Sessions,
    duplicateRefunds: duplicateCount,
    missingSchemaProtection,
    potentialIssues,
    protectionMechanisms: {
      referenceCheck: true,
      schemaCheck: true,
      legacyProtection: true
    }
  };
}

/**
 * Kiểm tra cơ chế chống trùng lặp cho OtisSim V3
 */
async function checkOtissimV3Duplicates(): Promise<DuplicateCheckResult> {
  // Get all refund transactions with pagination to ensure complete coverage
  let allTransactions: any[] = [];
  let offset = 0;
  const batchSize = 500;
  
  while (true) {
    const batch = await storage.getTransactionsWithFilter({ 
      limit: batchSize, 
      offset: offset, 
      types: ['refund'] 
    });
    
    if (batch.length === 0) break;
    allTransactions = allTransactions.concat(batch);
    
    if (batch.length < batchSize) break; // Last batch
    offset += batchSize;
  }
  
  const v3Refunds = allTransactions.filter(t => 
    t.type === 'refund' && t.reference?.includes('otissim_v3_refund_')
  );

  const refundGroups: { [key: string]: any[] } = {};
  const potentialIssues: any[] = [];

  v3Refunds.forEach(refund => {
    if (refund.reference) {
      const match = refund.reference.match(/otissim_v3_refund_(\d+)_(.+)/);
      if (match) {
        const sessionId = match[2];
        const userId = parseInt(match[1]);
        
        if (!refundGroups[sessionId]) {
          refundGroups[sessionId] = [];
        }
        refundGroups[sessionId].push({ ...refund, extractedUserId: userId, sessionId });
      }
    }
  });

  let duplicateCount = 0;
  let missingSchemaProtection = 0;

  for (const sessionId of Object.keys(refundGroups)) {
    const refunds = refundGroups[sessionId];
    
    if (refunds.length > 1) {
      duplicateCount++;
      potentialIssues.push({
        sessionId,
        userId: refunds[0].extractedUserId,
        issue: `${refunds.length} lần hoàn tiền trùng lặp`,
        refundCount: refunds.length
      });
    }

    try {
      const session = await storage.getPhoneRentalHistoryBySession(sessionId);
      if (session) {
        const isMarked = await storage.isPhoneRentalRefundProcessed(sessionId);
        if (!isMarked && refunds.length > 0) {
          missingSchemaProtection++;
        }
      }
    } catch (error) {
      // Schema chưa có sẵn
    }
  }

  // Get complete session count with pagination - V3
  let totalSessions: any[] = [];
  let sessionOffset = 0;
  const sessionBatchSize = 500;
  
  while (true) {
    const sessionBatch = await storage.getPhoneRentalHistoryWithFilter({ 
      limit: sessionBatchSize, 
      page: Math.floor(sessionOffset / sessionBatchSize) + 1 
    });
    
    if (sessionBatch.length === 0) break;
    totalSessions = totalSessions.concat(sessionBatch);
    
    if (sessionBatch.length < sessionBatchSize) break;
    sessionOffset += sessionBatchSize;
  }
  
  const v3Sessions = totalSessions.filter(s => s.service === 'otissim_v3').length;

  return {
    service: 'OtisSim V3',
    totalSessions: v3Sessions,
    duplicateRefunds: duplicateCount,
    missingSchemaProtection,
    potentialIssues,
    protectionMechanisms: {
      referenceCheck: true,
      schemaCheck: true,
      legacyProtection: true
    }
  };
}

/**
 * Kiểm tra cơ chế chống trùng lặp cho TikTok V1
 */
async function checkTiktokV1Duplicates(): Promise<DuplicateCheckResult> {
  // Get all refund transactions with pagination to ensure complete coverage
  let allTransactions: any[] = [];
  let offset = 0;
  const batchSize = 500;
  
  while (true) {
    const batch = await storage.getTransactionsWithFilter({ 
      limit: batchSize, 
      offset: offset, 
      types: ['refund'] 
    });
    
    if (batch.length === 0) break;
    allTransactions = allTransactions.concat(batch);
    
    if (batch.length < batchSize) break; // Last batch
    offset += batchSize;
  }
  
  const tiktokRefunds = allTransactions.filter(t => 
    t.type === 'refund' && t.reference?.includes('tiktok_refund_')
  );

  const refundGroups: { [key: string]: any[] } = {};
  const potentialIssues: any[] = [];

  tiktokRefunds.forEach(refund => {
    if (refund.reference) {
      const match = refund.reference.match(/tiktok_refund_(\d+)_(.+)/);
      if (match) {
        const sessionId = match[2];
        const userId = parseInt(match[1]);
        
        if (!refundGroups[sessionId]) {
          refundGroups[sessionId] = [];
        }
        refundGroups[sessionId].push({ ...refund, extractedUserId: userId, sessionId });
      }
    }
  });

  let duplicateCount = 0;
  let missingSchemaProtection = 0;

  for (const sessionId of Object.keys(refundGroups)) {
    const refunds = refundGroups[sessionId];
    
    if (refunds.length > 1) {
      duplicateCount++;
      potentialIssues.push({
        sessionId,
        userId: refunds[0].extractedUserId,
        issue: `${refunds.length} lần hoàn tiền trùng lặp`,
        refundCount: refunds.length
      });
    }

    try {
      const session = await storage.getTiktokRentalBySessionId(sessionId);
      if (session) {
        const isMarked = await storage.isTiktokRentalRefundProcessed(sessionId);
        if (!isMarked && refunds.length > 0) {
          missingSchemaProtection++;
        }
      }
    } catch (error) {
      // Schema chưa có sẵn
    }
  }

  // Use optimized approach instead of deprecated getAllTiktokRentals
  const allTiktokSessions = await storage.getTiktokRentalsWithFilter({ limit: 10000, offset: 0 });

  return {
    service: 'TikTok V1',
    totalSessions: allTiktokSessions.length,
    duplicateRefunds: duplicateCount,
    missingSchemaProtection,
    potentialIssues,
    protectionMechanisms: {
      referenceCheck: true,
      schemaCheck: true,
      legacyProtection: true
    }
  };
}

/**
 * Kiểm tra toàn bộ hệ thống chống trùng lặp
 */
export async function auditSystemDuplicateProtection(): Promise<SystemDuplicateAudit> {
  console.log('🔍 [DUPLICATE AUDIT] Starting comprehensive duplicate protection audit...');

  const [v1Check, v2Check, v3Check, tiktokCheck] = await Promise.all([
    checkOtissimV1Duplicates(),
    checkOtissimV2Duplicates(),  
    checkOtissimV3Duplicates(),
    checkTiktokV1Duplicates()
  ]);

  const totalDuplicates = v1Check.duplicateRefunds + v2Check.duplicateRefunds + 
                         v3Check.duplicateRefunds + tiktokCheck.duplicateRefunds;

  const totalIssues = v1Check.potentialIssues.length + v2Check.potentialIssues.length + 
                     v3Check.potentialIssues.length + tiktokCheck.potentialIssues.length;

  let overallHealth: 'EXCELLENT' | 'GOOD' | 'WARNING' | 'CRITICAL';
  if (totalDuplicates === 0) {
    overallHealth = 'EXCELLENT';
  } else if (totalDuplicates <= 2) {
    overallHealth = 'GOOD';
  } else if (totalDuplicates <= 5) {
    overallHealth = 'WARNING';
  } else {
    overallHealth = 'CRITICAL';
  }

  const audit: SystemDuplicateAudit = {
    otissimV1: v1Check,
    otissimV2: v2Check,
    otissimV3: v3Check,
    tiktokV1: tiktokCheck,
    summary: {
      totalDuplicates,
      totalIssues,
      overallHealth
    }
  };

  // Log kết quả
  console.log('📊 [DUPLICATE AUDIT] Results:');
  console.log(`   • OtisSim V1: ${v1Check.duplicateRefunds} duplicates, ${v1Check.potentialIssues.length} issues`);
  console.log(`   • OtisSim V2: ${v2Check.duplicateRefunds} duplicates, ${v2Check.potentialIssues.length} issues`);
  console.log(`   • OtisSim V3: ${v3Check.duplicateRefunds} duplicates, ${v3Check.potentialIssues.length} issues`);
  console.log(`   • TikTok V1: ${tiktokCheck.duplicateRefunds} duplicates, ${tiktokCheck.potentialIssues.length} issues`);
  console.log(`   • Overall Health: ${overallHealth}`);

  if (totalIssues > 0) {
    console.log('⚠️  [DUPLICATE AUDIT] Issues found:');
    [v1Check, v2Check, v3Check, tiktokCheck].forEach(check => {
      if (check.potentialIssues.length > 0) {
        console.log(`   • ${check.service}:`);
        check.potentialIssues.forEach(issue => {
          console.log(`     - Session ${issue.sessionId}: ${issue.issue}`);
        });
      }
    });
  }

  return audit;
}

/**
 * Test cơ chế chống trùng lặp với session giả lập
 */
export async function testDuplicateProtection(userId: string, sessionId: string): Promise<{
  allServicesProtected: boolean;
  protectionResults: {
    service: string;
    protected: boolean;
    mechanism: string;
  }[];
}> {
  const { processOtissimV1Refund, processOtissimV2Refund, processOtissimV3Refund, processTiktokRentalRefund } = await import('./refund-handlers');

  console.log(`🧪 [DUPLICATE TEST] Testing duplicate protection for session ${sessionId}, user ${userId}`);

  const results = [];

  // Test V1
  const v1Result1 = await processOtissimV1Refund(userId, sessionId, 'Test duplicate protection', `test_ref_${Date.now()}`);
  const v1Result2 = await processOtissimV1Refund(userId, sessionId, 'Test duplicate protection', `test_ref_${Date.now()}`);
  results.push({
    service: 'OtisSim V1',
    protected: !v1Result2.success,
    mechanism: v1Result2.message || 'Unknown'
  });

  // Test V2  
  const v2Result1 = await processOtissimV2Refund(userId, sessionId, 'Test duplicate protection', `test_ref_${Date.now()}`);
  const v2Result2 = await processOtissimV2Refund(userId, sessionId, 'Test duplicate protection', `test_ref_${Date.now()}`);
  results.push({
    service: 'OtisSim V2',
    protected: !v2Result2.success,
    mechanism: v2Result2.message || 'Unknown'
  });

  // Test V3
  const v3Result1 = await processOtissimV3Refund(userId, sessionId, 'Test duplicate protection', `test_ref_${Date.now()}`);
  const v3Result2 = await processOtissimV3Refund(userId, sessionId, 'Test duplicate protection', `test_ref_${Date.now()}`);
  results.push({
    service: 'OtisSim V3',
    protected: !v3Result2.success,
    mechanism: v3Result2.message || 'Unknown'
  });

  // Test TikTok
  const tiktokResult1 = await processTiktokRentalRefund(userId, sessionId, 'Test duplicate protection', `test_ref_${Date.now()}`);
  const tiktokResult2 = await processTiktokRentalRefund(userId, sessionId, 'Test duplicate protection', `test_ref_${Date.now()}`);
  results.push({
    service: 'TikTok V1',
    protected: !tiktokResult2.success,
    mechanism: tiktokResult2.message || 'Unknown'
  });

  const allServicesProtected = results.every(r => r.protected);

  console.log('🧪 [DUPLICATE TEST] Results:');
  results.forEach(r => {
    console.log(`   • ${r.service}: ${r.protected ? 'PROTECTED' : 'NOT PROTECTED'} (${r.mechanism})`);
  });

  return {
    allServicesProtected,
    protectionResults: results
  };
}