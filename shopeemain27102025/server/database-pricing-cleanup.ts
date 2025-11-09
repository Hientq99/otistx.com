/**
 * DATABASE PRICING CLEANUP SCRIPT
 * ===============================
 * 
 * Script để kiểm tra và sửa các cấu hình giá dịch vụ trong database
 * 
 * Vấn đề: V2 rentals đang charge 2600 VND thay vì 2700 VND
 * Nguyên nhân: Có thể có duplicate hoặc sai config trong bảng service_pricing
 * 
 * Chức năng:
 * 1. Query tất cả service pricing entries
 * 2. Tìm duplicates và pricing không đúng cho otissim_v2
 * 3. Fix/update pricing về giá trị đúng
 * 4. Remove duplicates
 * 5. Cung cấp summary các thay đổi
 */

import { db, executeWithRetry } from "./db";
import { servicePricing } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";

interface PricingIssue {
  type: 'duplicate' | 'incorrect_price' | 'missing';
  service: string;
  current_price?: string;
  expected_price?: string;
  details: string;
}

interface CleanupSummary {
  issues_found: PricingIssue[];
  fixes_applied: string[];
  before_count: number;
  after_count: number;
}

// Expected pricing configuration for all services
const EXPECTED_PRICING: Record<string, number> = {
  // Phone rental services
  'otissim_v1': 1900,        // V1 rentals should be 1900 VND
  'otissim_v2': 2700,        // V2 rentals should be 2700 VND
  'otissim_v3': 2000,        // V3 rentals should be 2000 VND
  'tiktok_rental': 1200,     // TikTok rentals
  
  // Shopee services  
  'phone_check': 200,        // Phone number checks
  'account_check': 300,      // Account verification
  'tracking_check': 400,     // Tracking information
  'cookie_rapid_check': 500, // Cookie rapid checks
  'email_addition': 600,     // Email addition service
  'username_check': 100,     // Username availability
  'voucher_saving': 3000,    // Voucher saving operations (corrected from 50 to match usage)
  
  // Cookie services
  'cookie_extraction': 800,  // Cookie extraction
  'cookie_manager': 300,     // Cookie management
  
  // Additional services found in routes
  'express_tracking_check': 200,   // Express tracking checks
  'freeship_voucher_usage': 2000,  // Freeship voucher usage (correct price)
};

async function getAllServicePricing() {
  console.log("📋 Đang lấy tất cả service pricing entries...");
  
  const allPricing = await executeWithRetry(async () => {
    return await db.select().from(servicePricing).orderBy(servicePricing.serviceName);
  });
  
  console.log(`✅ Tìm thấy ${allPricing.length} service pricing entries`);
  return allPricing;
}

async function findPricingIssues(allPricing: any[]): Promise<PricingIssue[]> {
  console.log("🔍 Đang phân tích các vấn đề pricing...");
  
  const issues: PricingIssue[] = [];
  const serviceMap = new Map<string, any[]>();
  
  // Group by service name to find duplicates
  for (const pricing of allPricing) {
    const serviceName = pricing.serviceName;
    if (!serviceMap.has(serviceName)) {
      serviceMap.set(serviceName, []);
    }
    serviceMap.get(serviceName)!.push(pricing);
  }
  
  // Check for duplicates
  for (const [serviceName, entries] of Array.from(serviceMap.entries())) {
    if (entries.length > 1) {
      issues.push({
        type: 'duplicate',
        service: serviceName,
        details: `Found ${entries.length} entries for ${serviceName}: ${entries.map((e: any) => `${e.price} VND (id: ${e.id})`).join(', ')}`
      });
    }
    
    // Check for incorrect pricing
    const expectedPrice = EXPECTED_PRICING[serviceName];
    if (expectedPrice) {
      const currentEntry = entries[0]; // Use first entry for price check
      const currentPrice = parseFloat(currentEntry.price);
      
      if (currentPrice !== expectedPrice) {
        issues.push({
          type: 'incorrect_price',
          service: serviceName,
          current_price: currentPrice.toString(),
          expected_price: expectedPrice.toString(),
          details: `${serviceName} has price ${currentPrice} VND but should be ${expectedPrice} VND`
        });
      }
    }
  }
  
  // Check for missing services
  for (const [serviceName, expectedPrice] of Object.entries(EXPECTED_PRICING)) {
    if (!serviceMap.has(serviceName)) {
      issues.push({
        type: 'missing',
        service: serviceName,
        expected_price: expectedPrice.toString(),
        details: `Missing service: ${serviceName} (should be ${expectedPrice} VND)`
      });
    }
  }
  
  return issues;
}

async function fixPricingIssues(issues: PricingIssue[]): Promise<string[]> {
  console.log("🔧 Đang sửa các vấn đề pricing...");
  
  const fixesApplied: string[] = [];
  
  for (const issue of issues) {
    try {
      switch (issue.type) {
        case 'duplicate':
          await fixDuplicateService(issue.service);
          fixesApplied.push(`Fixed duplicates for ${issue.service}`);
          break;
          
        case 'incorrect_price':
          await fixIncorrectPrice(issue.service, parseFloat(issue.expected_price!));
          fixesApplied.push(`Updated ${issue.service} price from ${issue.current_price} to ${issue.expected_price} VND`);
          break;
          
        case 'missing':
          await createMissingService(issue.service, parseFloat(issue.expected_price!));
          fixesApplied.push(`Created missing service ${issue.service} with price ${issue.expected_price} VND`);
          break;
      }
    } catch (error) {
      console.error(`❌ Error fixing ${issue.service}:`, error);
      fixesApplied.push(`❌ Failed to fix ${issue.service}: ${error}`);
    }
  }
  
  return fixesApplied;
}

async function fixDuplicateService(serviceName: string): Promise<void> {
  console.log(`🔄 Fixing duplicates for ${serviceName}...`);
  
  // Get all entries for this service
  const entries = await executeWithRetry(async () => {
    return await db.select().from(servicePricing)
      .where(eq(servicePricing.serviceName, serviceName))
      .orderBy(servicePricing.id);
  });
  
  if (entries.length <= 1) return;
  
  // Keep the first entry, delete the rest
  const toDelete = entries.slice(1);
  
  for (const entry of toDelete) {
    await executeWithRetry(async () => {
      await db.delete(servicePricing).where(eq(servicePricing.id, entry.id));
    });
    console.log(`🗑️ Deleted duplicate ${serviceName} entry (id: ${entry.id}, price: ${entry.price})`);
  }
  
  // Update the remaining entry with correct price if needed
  const expectedPrice = EXPECTED_PRICING[serviceName];
  if (expectedPrice && parseFloat(entries[0].price) !== expectedPrice) {
    await executeWithRetry(async () => {
      await db.update(servicePricing)
        .set({ 
          price: expectedPrice.toString(),
          updatedAt: new Date()
        })
        .where(eq(servicePricing.id, entries[0].id));
    });
    console.log(`💰 Updated ${serviceName} price to ${expectedPrice} VND`);
  }
}

async function fixIncorrectPrice(serviceName: string, correctPrice: number): Promise<void> {
  console.log(`💰 Updating ${serviceName} price to ${correctPrice} VND...`);
  
  await executeWithRetry(async () => {
    await db.update(servicePricing)
      .set({ 
        price: correctPrice.toString(),
        updatedAt: new Date()
      })
      .where(eq(servicePricing.serviceName, serviceName));
  });
}

async function createMissingService(serviceName: string, price: number): Promise<void> {
  console.log(`➕ Creating missing service ${serviceName} with price ${price} VND...`);
  
  await executeWithRetry(async () => {
    await db.insert(servicePricing).values({
      serviceType: getServiceType(serviceName),
      serviceName: serviceName,
      price: price.toString(),
      description: `${serviceName} service`,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    });
  });
}

function getServiceType(serviceName: string): string {
  if (serviceName.includes('rental') || serviceName.includes('otissim')) {
    return 'phone_rental';
  }
  if (serviceName.includes('check')) {
    return 'verification';
  }
  if (serviceName.includes('cookie')) {
    return 'cookie_service';
  }
  if (serviceName.includes('email')) {
    return 'email_service';
  }
  if (serviceName.includes('voucher')) {
    return 'voucher_service';
  }
  return 'general';
}

async function generateReport(summary: CleanupSummary): Promise<void> {
  console.log("\n" + "=".repeat(60));
  console.log("📊 DATABASE PRICING CLEANUP REPORT");
  console.log("=".repeat(60));
  
  console.log(`\n📈 SUMMARY:`);
  console.log(`   • Issues found: ${summary.issues_found.length}`);
  console.log(`   • Fixes applied: ${summary.fixes_applied.length}`);
  console.log(`   • Before cleanup: ${summary.before_count} entries`);
  console.log(`   • After cleanup: ${summary.after_count} entries`);
  
  if (summary.issues_found.length > 0) {
    console.log(`\n🔍 ISSUES FOUND:`);
    for (const issue of summary.issues_found) {
      const icon = issue.type === 'duplicate' ? '🔄' : 
                   issue.type === 'incorrect_price' ? '💰' : '❌';
      console.log(`   ${icon} ${issue.details}`);
    }
  }
  
  if (summary.fixes_applied.length > 0) {
    console.log(`\n✅ FIXES APPLIED:`);
    for (const fix of summary.fixes_applied) {
      console.log(`   • ${fix}`);
    }
  }
  
  console.log("\n" + "=".repeat(60));
}

export async function runPricingCleanup(): Promise<CleanupSummary> {
  console.log("🚀 Starting database pricing cleanup...");
  
  try {
    // Step 1: Get current state
    const allPricingBefore = await getAllServicePricing();
    
    // Step 2: Find issues
    const issues = await findPricingIssues(allPricingBefore);
    
    console.log(`\n🔍 Found ${issues.length} issues to fix:`);
    for (const issue of issues) {
      console.log(`   • ${issue.details}`);
    }
    
    // Step 3: Fix issues
    const fixesApplied = await fixPricingIssues(issues);
    
    // Step 4: Get final state
    const allPricingAfter = await getAllServicePricing();
    
    // Step 5: Generate summary
    const summary: CleanupSummary = {
      issues_found: issues,
      fixes_applied: fixesApplied,
      before_count: allPricingBefore.length,
      after_count: allPricingAfter.length
    };
    
    // Step 6: Generate report
    await generateReport(summary);
    
    console.log("\n✅ Cleanup completed successfully!");
    return summary;
    
  } catch (error) {
    console.error("❌ Error during pricing cleanup:", error);
    throw error;
  }
}

// Main execution function
export async function main() {
  console.log("Starting pricing cleanup script...");
  try {
    return await runPricingCleanup();
  } catch (error) {
    console.error("Cleanup failed:", error);
    throw error;
  }
}