/**
 * STORAGE LAYER - TẦNG QUẢN LÝ DỮ LIỆU
 * ===================================
 * 
 * Lớp trừu tượng để quản lý tất cả các thao tác database
 * Sử dụng Drizzle ORM với PostgreSQL
 * 
 * Chức năng chính:
 * - User management (quản lý người dùng)
 * - Service operations (các dịch vụ Shopee, TikTok)
 * - Transaction tracking (theo dõi giao dịch)
 * - System configuration (cấu hình hệ thống)
 */

import axios from 'axios';
import * as https from 'https';
import { 
  users, projects, resources, auditLogs, activities,
  phoneRentals, shopeeCookies, phoneChecks, trackingChecks, cookieRapidChecks, emailAdditions,
  transactions, serviceUsageHistory, servicePricing, systemConfig, shopeeCookiePairs, phoneShopee, accountChecks, spcFExtractions, cookieExtractions, phoneRentalHistory, apiKeys, topupRequests, httpProxies, tiktokRentals, usernameChecks, voucherSavingOperations, voucherSaveResults, expressTrackingChecks, freeshipVouchers, freeshipVoucherUsage, externalApiKeys, externalApiRentals, databaseMigrationConfig, databaseMigrationHistory,
  type User, type InsertUser,
  type Project, type InsertProject,
  type Resource, type InsertResource,
  type AuditLog, type InsertAuditLog,
  type Activity, type InsertActivity,
  type PhoneRental, type InsertPhoneRental,
  type ShopeeCookie, type InsertShopeeCookie,
  type PhoneCheck, type InsertPhoneCheck,
  type TrackingCheck, type InsertTrackingCheck,
  type CookieRapidCheck, type InsertCookieRapidCheck,
  type EmailAddition, type InsertEmailAddition,
  type Transaction, type InsertTransaction,
  type ServiceUsageHistory, type InsertServiceUsage,
  type ServicePricing, type InsertServicePricing,
  type SystemConfig, type InsertSystemConfig,
  type ShopeeCookiePair, type InsertShopeeCookiePair,
  type PhoneShopee, type InsertPhoneShopee,
  type AccountCheck, type InsertAccountCheck,
  type SpcFExtraction, type InsertSpcFExtraction,
  type CookieExtraction, type InsertCookieExtraction,
  type PhoneRentalHistory, type InsertPhoneRentalHistory,
  type ApiKey, type InsertApiKey,
  type TopupRequest, type InsertTopupRequest,
  type HttpProxy, type InsertHttpProxy,
  type TiktokRental, type InsertTiktokRental,
  type UsernameCheck, type InsertUsernameCheck,
  type VoucherSavingOperation, type InsertVoucherSavingOperation,
  type VoucherSaveResult, type InsertVoucherSaveResult,
  type ExpressTrackingCheck, type InsertExpressTrackingCheck,
  type FreeshipVoucher, type InsertFreeshipVoucher,
  type FreeshipVoucherUsage, type InsertFreeshipVoucherUsage,
  type ExternalApiKey, type InsertExternalApiKey,
  type ExternalApiRental, type InsertExternalApiRental,
  type DatabaseMigrationConfig, type InsertDatabaseMigrationConfig,
  type DatabaseMigrationHistory, type InsertDatabaseMigrationHistory
} from "@shared/schema";
import { db, executeWithRetry, pool } from "./db";
import { eq, and, sql, or, desc, gte, lte, gt, lt, inArray } from "drizzle-orm";

// Simple memory cache để giảm database queries
class SimpleCache {
  private cache = new Map<string, { value: any; timestamp: number; ttl: number }>();
  
  set(key: string, value: any, ttlSeconds: number = 1800) { // Default 30 phút TTL - EXTREME EGRESS REDUCTION
    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      ttl: ttlSeconds * 1000
    });
  }
  
  get(key: string): any | null {
    const item = this.cache.get(key);
    if (!item) return null;
    
    if (Date.now() - item.timestamp > item.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    return item.value;
  }
  
  delete(key: string) {
    this.cache.delete(key);
  }
  
  clear() {
    this.cache.clear();
  }
  
  // Cleanup expired entries
  cleanup() {
    const now = Date.now();
    for (const [key, item] of Array.from(this.cache.entries())) {
      if (now - item.timestamp > item.ttl) {
        this.cache.delete(key);
      }
    }
  }
}

const cache = new SimpleCache();

// Cleanup cache mỗi 30 phút để giảm CPU usage và memory overhead - EXTREME EGRESS REDUCTION
setInterval(() => cache.cleanup(), 30 * 60 * 1000);
import bcrypt from "bcryptjs";
import { HttpsProxyAgent } from "https-proxy-agent";
import { SocksProxyAgent } from "socks-proxy-agent";

export interface IStorage {
  // Users
  getUser(id: number): Promise<User | undefined>;
  getUserById(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;
  createUser(user: InsertUser): Promise<User>;
  createUserWithHashedPassword(user: InsertUser & { password: string }): Promise<User>;
  updateUser(id: number, updates: Partial<User>, adminUserId?: number, ipAddress?: string): Promise<User | undefined>;
  deleteUser(id: number): Promise<boolean>;
  getUserBalance(userId: number): Promise<number>;
  updateUserBalance(userId: number, newBalance: number, adminUserId?: number, ipAddress?: string): Promise<void>;
  updateUserPassword(userId: number, hashedPassword: string): Promise<void>;
  
  // Projects
  getAllProjects(): Promise<Project[]>;
  getProject(id: number): Promise<Project | undefined>;
  createProject(project: InsertProject): Promise<Project>;
  updateProject(id: number, project: Partial<Project>): Promise<Project | undefined>;
  
  // Resources
  getAllResources(): Promise<Resource[]>;
  getResourcesByProject(projectId: number): Promise<Resource[]>;
  createResource(resource: InsertResource): Promise<Resource>;
  
  // Audit Logs (getAllAuditLogs REMOVED - use getAuditLogsWithPagination)
  getAuditLogsWithPagination(page: number, limit: number, search?: string, action?: string): Promise<AuditLog[]>;
  createAuditLog(log: InsertAuditLog): Promise<AuditLog>;
  
  // Optimized transaction queries
  getTransactionsWithFilter(options?: {
    limit?: number;
    offset?: number;
    userId?: number;
    types?: string[];
    dateFrom?: Date;
    dateTo?: Date;
  }): Promise<Transaction[]>;
  
  // REMOVED: Legacy offset-based signature - keeping only page-based signature
  
  // Optimized TikTok rental queries
  getTiktokRentalsWithFilter(options?: {
    limit?: number;
    offset?: number;
    userId?: number;
    status?: string;
    dateFrom?: Date;
    dateTo?: Date;
  }): Promise<TiktokRental[]>;
  
  // Enhanced logging methods
  logUserAction(userId: number, action: string, description: string, ipAddress: string, targetUserId?: number, beforeData?: any, afterData?: any): Promise<void>;
  
  // Activities
  getRecentActivities(limit?: number): Promise<Activity[]>;
  createActivity(activity: InsertActivity): Promise<Activity>;
  fixActivitiesSequence(): Promise<void>;
  fixTableSequence(tableName: string, sequenceName: string): Promise<void>;
  safeInsert<T>(table: any, values: any): Promise<T>;
  
  // Phone Rentals (getAllPhoneRentals REMOVED - use getPhoneRentalsWithPagination)
  getPhoneRentalsWithPagination(page?: number, limit?: number, filters?: {
    userId?: number;
    status?: string;
    sessionId?: string;
    startDate?: Date;
    endDate?: Date;
  }): Promise<PhoneRental[]>;
  getPhoneRentalsByUser(userId: number): Promise<PhoneRental[]>;
  
  // Phone Rental History (getAllPhoneRentalHistory REMOVED - use getPhoneRentalHistoryWithFilter)
  getPhoneRentalHistoryWithFilter(options?: {
    limit?: number;
    page?: number;
    userId?: number;
    status?: string;
    service?: string;
    startDate?: Date;
    endDate?: Date;
  }): Promise<PhoneRentalHistory[]>;
  createPhoneRental(rental: InsertPhoneRental & { userId: number }): Promise<PhoneRental>;
  updatePhoneRental(id: number, updates: Partial<PhoneRental>): Promise<PhoneRental | undefined>;
  
  // Shopee Cookies
  getAllShopeeCookies(): Promise<ShopeeCookie[]>;
  getShopeeCookiesByUser(userId: number): Promise<ShopeeCookie[]>;
  createShopeeCookie(cookie: InsertShopeeCookie & { userId: number }): Promise<ShopeeCookie>;
  updateShopeeCookie(id: string, updates: Partial<ShopeeCookie>): Promise<ShopeeCookie | undefined>;
  deleteShopeeCookie(id: string, userId: number): Promise<boolean>;
  
  // Phone Checks
  getAllPhoneChecks(): Promise<PhoneCheck[]>;
  getPhoneChecksByUser(userId: number): Promise<PhoneCheck[]>;
  createPhoneCheck(check: InsertPhoneCheck & { userId: number }): Promise<PhoneCheck>;
  
  // Tracking Checks
  getAllTrackingChecks(): Promise<TrackingCheck[]>;
  getTrackingChecksByUser(userId: number): Promise<TrackingCheck[]>;
  createTrackingCheck(check: InsertTrackingCheck & { userId: number }): Promise<TrackingCheck>;
  updateTrackingCheckByCookie(userId: number, cookieId: string, updates: Partial<TrackingCheck>): Promise<TrackingCheck | undefined>;
  deleteTrackingChecksByCookie(userId: number, cookieId: string): Promise<void>;
  
  // Cookie Rapid Checks
  getAllCookieRapidChecks(): Promise<CookieRapidCheck[]>;
  getCookieRapidChecksByUser(userId: number): Promise<CookieRapidCheck[]>;
  createCookieRapidCheck(check: InsertCookieRapidCheck & { userId: number }): Promise<CookieRapidCheck>;
  updateCookieRapidCheck(id: number, updates: Partial<CookieRapidCheck>): Promise<CookieRapidCheck | undefined>;
  updateCookieRapidCheckByCookie(userId: number, cookieId: string, updates: Partial<CookieRapidCheck>): Promise<CookieRapidCheck | undefined>;
  deleteCookieRapidChecksByCookie(userId: number, cookieId: string): Promise<void>;
  
  // Express Tracking Checks (Kiểm tra mã vận đơn hỏa tốc)
  getAllExpressTrackingChecks(): Promise<ExpressTrackingCheck[]>;
  getExpressTrackingChecksByUser(userId: number): Promise<ExpressTrackingCheck[]>;
  createExpressTrackingCheck(check: InsertExpressTrackingCheck & { userId: number }): Promise<ExpressTrackingCheck>;
  updateExpressTrackingCheck(id: number, updates: Partial<ExpressTrackingCheck>): Promise<ExpressTrackingCheck | undefined>;
  deleteExpressTrackingCheck(id: number): Promise<boolean>;
  
  // Freeship Vouchers (Lưu và quản lý voucher freeship)
  getAllFreeshipVouchers(): Promise<FreeshipVoucher[]>;
  getFreeshipVouchersByUser(userId: number): Promise<FreeshipVoucher[]>;
  getFreeshipVoucherByCode(voucherCode: string): Promise<FreeshipVoucher | undefined>;
  getFreeshipVoucherById(id: number): Promise<FreeshipVoucher | undefined>;
  getFreeshipVoucherByIdAndUser(id: number, userId: number): Promise<FreeshipVoucher | undefined>;
  createFreeshipVoucher(voucher: InsertFreeshipVoucher & { userId: number }): Promise<FreeshipVoucher>;
  updateFreeshipVoucher(id: number, updates: Partial<FreeshipVoucher>): Promise<FreeshipVoucher | undefined>;
  deleteFreeshipVoucher(id: number): Promise<boolean>;
  getActiveFreeshipVouchers(userId?: number): Promise<FreeshipVoucher[]>;
  getExpiredFreeshipVouchers(): Promise<FreeshipVoucher[]>;
  
  // Freeship Voucher Usage Tracking
  getAllFreeshipVoucherUsage(): Promise<FreeshipVoucherUsage[]>;
  getFreeshipVoucherUsageByUser(userId: number): Promise<FreeshipVoucherUsage[]>;
  getFreeshipVoucherUsageByVoucher(voucherId: number): Promise<FreeshipVoucherUsage[]>;
  createFreeshipVoucherUsage(usage: InsertFreeshipVoucherUsage & { userId: number }): Promise<FreeshipVoucherUsage>;
  updateFreeshipVoucherUsage(id: number, updates: Partial<FreeshipVoucherUsage>): Promise<FreeshipVoucherUsage | undefined>;
  
  // 🔒 Atomic freeship voucher operations with financial safety
  atomicFreeshipVoucherUsage(params: {
    userId: number;
    voucherId: number;
    orderId?: string;
    orderValue?: string;
    discountApplied?: string;
    serviceCost: number;
    idempotencyKey: string;
    voucherCode: string;
    userFullName: string;
  }): Promise<{
    success: boolean;
    usage?: FreeshipVoucherUsage;
    transaction?: Transaction;
    balanceAfter: number;
    message: string;
  }>;
  
  // Email Additions
  getAllEmailAdditions(): Promise<EmailAddition[]>;
  getEmailAdditionsByUser(userId: number): Promise<EmailAddition[]>;
  createEmailAddition(addition: InsertEmailAddition & { userId: number }): Promise<EmailAddition>;
  updateEmailAddition(id: number, updates: Partial<EmailAddition>): Promise<EmailAddition | undefined>;
  
  // Transactions (getAllTransactions REMOVED - use getTransactionsWithFilter)
  getTransactionsByUser(userId: number, limit?: number, offset?: number): Promise<Transaction[]>;
  createTransaction(transaction: InsertTransaction & { userId: number }): Promise<Transaction>;
  updateTransaction(id: number, updates: Partial<Transaction>): Promise<Transaction | undefined>;
  getTransactionByReference(reference: string): Promise<Transaction | undefined>;
  getTransactionsByDateRange(startDate: Date, endDate: Date): Promise<Transaction[]>;
  
  // Service Usage History
  getAllServiceUsage(): Promise<ServiceUsageHistory[]>;
  getServiceUsageByUser(userId: number): Promise<ServiceUsageHistory[]>;
  createServiceUsage(usage: InsertServiceUsage & { userId: number }): Promise<ServiceUsageHistory>;
  
  // Service Pricing Configuration
  getAllServicePricing(): Promise<ServicePricing[]>;
  getServicePricing(serviceType: string): Promise<ServicePricing | undefined>;
  requireServicePrice(serviceType: string): Promise<number>; // Enforces database-driven pricing
  createServicePricing(pricing: InsertServicePricing): Promise<ServicePricing>;
  updateServicePricing(id: number, updates: Partial<ServicePricing>): Promise<ServicePricing | undefined>;
  deleteServicePricing(id: number): Promise<boolean>;
  
  // System Configuration
  getAllSystemConfig(): Promise<SystemConfig[]>;
  getSystemConfig(configKey: string): Promise<SystemConfig | undefined>;
  getSystemConfigByKey(configKey: string): Promise<SystemConfig | undefined>;
  getSystemConfigById(id: number): Promise<SystemConfig | undefined>;
  getSystemConfigByType(configType: string): Promise<SystemConfig[]>;
  createSystemConfig(config: InsertSystemConfig): Promise<SystemConfig>;
  updateSystemConfig(id: number, updates: Partial<SystemConfig>): Promise<SystemConfig | undefined>;
  deleteSystemConfig(id: number): Promise<boolean>;
  
  // Analytics Reports
  getRevenueByPeriod(startDate: Date, endDate: Date): Promise<{ date: string; revenue: number; transactions: number }[]>;
  getUserTopUpHistory(userId?: number): Promise<{ userId: number; username: string; totalAmount: number; transactionCount: number }[]>;
  
  // Phone Shopee Registry
  getAllPhoneShopee(): Promise<PhoneShopee[]>;
  getPhoneShopee(phoneNumber: string): Promise<PhoneShopee | undefined>;
  getPhonesShopeeBatch(phoneNumbers: string[]): Promise<PhoneShopee[]>;
  createPhoneShopee(phone: InsertPhoneShopee): Promise<PhoneShopee>;
  updatePhoneShopee(phoneNumber: string, updates: Partial<PhoneShopee>): Promise<PhoneShopee | undefined>;
  
  // Bulk Phone Check
  checkPhoneNumbers(phoneNumbers: string[], userId: number, ipAddress: string): Promise<{ 
    phoneNumber: string; 
    isRegistered: boolean; 
    alreadyInDatabase: boolean; 
    cost: number; 
  }[]>;
  
  // Account Check History
  getAllAccountChecks(): Promise<AccountCheck[]>;
  getAccountChecksByUser(userId: number): Promise<AccountCheck[]>;
  createAccountCheck(check: InsertAccountCheck & { userId: number }): Promise<AccountCheck>;
  updateAccountCheckByCookie(userId: number, cookieId: string, updates: Partial<AccountCheck>): Promise<AccountCheck | undefined>;
  
  // Cookie Extractions
  getAllCookieExtractions(): Promise<CookieExtraction[]>;
  getCookieExtractionsByUser(userId: number): Promise<CookieExtraction[]>;
  createCookieExtraction(extraction: InsertCookieExtraction & { userId: number }): Promise<CookieExtraction>;

  // SPC_F Extractions
  getAllSpcFExtractions(): Promise<SpcFExtraction[]>;
  getSpcFExtractionsByUser(userId: number): Promise<SpcFExtraction[]>;
  createSpcFExtraction(extraction: InsertSpcFExtraction & { userId: number }): Promise<SpcFExtraction>;

  // Phone Rental History (getAllPhoneRentalHistory REMOVED - use getPhoneRentalHistoryWithFilter)
  getPhoneRentalHistoryByUser(userId: number, limit?: number, offset?: number): Promise<PhoneRentalHistory[]>;
  getPhoneRentalHistoryBySession(sessionId: string): Promise<PhoneRentalHistory | undefined>;
  getActivePhoneRentalSessions(userId: number, limit?: number): Promise<PhoneRentalHistory[]>;
  getExpiredPhoneRentalSessions(userId: number, limit?: number): Promise<PhoneRentalHistory[]>;
  createPhoneRentalHistory(history: InsertPhoneRentalHistory & { userId: number }): Promise<PhoneRentalHistory>;
  updatePhoneRentalHistory(sessionId: string, updates: Partial<PhoneRentalHistory>): Promise<PhoneRentalHistory | undefined>;
  
  // Enhanced refund tracking methods
  markPhoneRentalRefundProcessed(sessionId: string): Promise<boolean>;
  isPhoneRentalRefundProcessed(sessionId: string): Promise<boolean>;
  markTiktokRentalRefundProcessed(sessionId: string): Promise<boolean>;
  isTiktokRentalRefundProcessed(sessionId: string): Promise<boolean>;

  // API Keys
  getAllApiKeys(): Promise<ApiKey[]>;
  getApiKeysByUser(userId: number): Promise<ApiKey[]>;
  getApiKeyByValue(keyValue: string): Promise<ApiKey | undefined>;
  createApiKey(apiKey: InsertApiKey & { userId: number }): Promise<ApiKey>;
  updateApiKey(id: number, updates: Partial<ApiKey>): Promise<ApiKey | undefined>;
  deleteApiKey(id: number): Promise<boolean>;
  updateApiKeyUsage(keyValue: string): Promise<void>;

  // External API Keys - Third-party provider API management
  getAllExternalApiKeys(): Promise<ExternalApiKey[]>;
  getExternalApiKeysByUser(userId: number): Promise<ExternalApiKey[]>;
  getExternalApiKeyByUserAndProvider(userId: number, provider: string): Promise<ExternalApiKey | undefined>;
  createExternalApiKey(apiKey: InsertExternalApiKey & { userId: number }): Promise<ExternalApiKey>;
  updateExternalApiKey(id: number, updates: Partial<ExternalApiKey>): Promise<ExternalApiKey | undefined>;
  deleteExternalApiKey(id: number): Promise<boolean>;
  updateExternalApiKeyBalance(id: number, balance: number, error?: string): Promise<void>;

  // External API Rentals - Manage third-party provider rental sessions
  getAllExternalApiRentals(): Promise<ExternalApiRental[]>;
  getExternalApiRentalsByUser(userId: number): Promise<ExternalApiRental[]>;
  getExternalApiRentalsByStatus(status: string): Promise<ExternalApiRental[]>;
  getExternalApiRental(sessionId: string): Promise<ExternalApiRental | undefined>;
  createExternalApiRental(rental: InsertExternalApiRental & { userId: number }): Promise<ExternalApiRental>;
  updateExternalApiRental(sessionId: string, updates: Partial<ExternalApiRental>): Promise<ExternalApiRental | undefined>;
  deleteExternalApiRental(sessionId: string): Promise<boolean>;

  // Topup Requests
  getAllTopupRequests(): Promise<TopupRequest[]>;
  getTopupRequestsByUser(userId: number): Promise<TopupRequest[]>;
  getTopupRequest(id: string): Promise<TopupRequest | undefined>;
  getPendingTopupRequests(userId: number): Promise<TopupRequest[]>;
  createTopupRequest(request: InsertTopupRequest & { userId: number; id: string; qrUrl: string; expiresAt: Date }): Promise<TopupRequest>;
  updateTopupRequest(id: string, updates: Partial<TopupRequest>): Promise<TopupRequest | undefined>;
  expireOldTopupRequests(): Promise<void>;
  getTopupHistoryByUser(userId: number): Promise<TopupRequest[]>;
  getTopupRequestsByDateRange(startDate: Date, endDate: Date): Promise<TopupRequest[]>;

  // HTTP Proxy Management
  getAllHttpProxies(): Promise<HttpProxy[]>;
  getActiveHttpProxies(): Promise<HttpProxy[]>;
  getHttpProxy(id: number): Promise<HttpProxy | undefined>;
  createHttpProxy(proxy: InsertHttpProxy): Promise<HttpProxy>;
  createBulkHttpProxies(proxies: InsertHttpProxy[]): Promise<HttpProxy[]>;
  updateHttpProxy(id: number, updates: Partial<HttpProxy>): Promise<HttpProxy | undefined>;
  deleteHttpProxy(id: number): Promise<boolean>;
  updateHttpProxyUsage(id: number): Promise<void>;
  getRandomHttpProxy(): Promise<HttpProxy | undefined>;

  // TikTok rental methods (getAllTiktokRentals REMOVED - use getTiktokRentalsWithFilter)
  createTiktokRental(data: any): Promise<any>;
  getTiktokRentalsByUserId(userId: number): Promise<any[]>;
  getActiveTiktokSessions(userId: number): Promise<any[]>;

  // Username Checks
  getAllUsernameChecks(): Promise<UsernameCheck[]>;
  getUsernameChecksByUser(userId: number): Promise<UsernameCheck[]>;
  createUsernameCheck(check: InsertUsernameCheck & { userId: number }): Promise<UsernameCheck>;
  checkShopeeUsernames(usernames: string[], userId: number, userIp: string): Promise<any[]>;
  updateTiktokRental(sessionId: string, data: any): Promise<void>;
  getTiktokRentalBySessionId(sessionId: string): Promise<any | null>;

  // Username check methods
  getAllUsernameChecks(): Promise<UsernameCheck[]>;
  getUsernameChecksByUser(userId: number): Promise<UsernameCheck[]>;
  createUsernameCheck(check: InsertUsernameCheck): Promise<UsernameCheck>;
  checkShopeeUsernames(usernames: string[], userId: number, ipAddress: string): Promise<{
    username: string;
    status: number | null;
    isAvailable: boolean;
    statusMessage: string;
  }[]>;

  // Voucher Saving Operations
  getAllVoucherSavingOperations(): Promise<VoucherSavingOperation[]>;
  getVoucherSavingOperationsByUser(userId: number): Promise<(VoucherSavingOperation & { fullCookieValue?: string })[]>;
  getVoucherSavingOperationsBySession(sessionId: string): Promise<VoucherSavingOperation[]>;
  getVoucherOperationsByDateRange(startDate: Date, endDate: Date): Promise<VoucherSavingOperation[]>;
  createVoucherSavingOperation(operation: InsertVoucherSavingOperation & { userId: number }): Promise<VoucherSavingOperation>;
  updateVoucherSavingOperation(id: number, updates: Partial<VoucherSavingOperation>): Promise<VoucherSavingOperation | undefined>;
  
  // Voucher Save Results
  getAllVoucherSaveResults(): Promise<VoucherSaveResult[]>;
  getVoucherSaveResultsByOperation(operationId: number): Promise<VoucherSaveResult[]>;
  createVoucherSaveResult(result: InsertVoucherSaveResult): Promise<VoucherSaveResult>;
  updateVoucherSaveResult(id: number, updates: Partial<VoucherSaveResult>): Promise<VoucherSaveResult | undefined>;
  
  // 🔒 Atomic voucher saving operations with financial safety
  atomicVoucherSaving(params: {
    userId: number;
    cookieId: string;
    cookieValue: string;
    cookiePreview: string;
    sessionId: string;
    serviceCost: number;
    idempotencyKey: string;
    userIp?: string;
    userFullName: string;
  }): Promise<{
    success: boolean;
    operation?: VoucherSavingOperation;
    transaction?: Transaction;
    successfulSaves: number;
    failedSaves: number;
    totalVouchersFound: number;
    balanceAfter: number;
    message: string;
  }>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: number): Promise<User | undefined> {
    // Check cache first - EGRESS OPTIMIZATION
    const cacheKey = `user:${id}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      return cached;
    }
    
    // Query database if not in cache
    const user = await executeWithRetry(async () => {
      const [user] = await db.select().from(users).where(eq(users.id, id));
      return user;
    });
    
    // Cache result for 30 minutes - MASSIVE EGRESS REDUCTION
    if (user) {
      cache.set(cacheKey, user, 1800); // 30 minutes
    }
    
    return user;
  }

  async getUserById(id: number): Promise<User | undefined> {
    // Use the same caching logic as getUser - EGRESS OPTIMIZATION
    return this.getUser(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return await executeWithRetry(async () => {
      const [user] = await db.select().from(users).where(eq(users.username, username));
      return user;
    });
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return await executeWithRetry(async () => {
      const [user] = await db.select().from(users).where(eq(users.email, email));
      return user;
    });
  }

  async getAllUsers(): Promise<User[]> {
    return await executeWithRetry(async () => {
      return await db.select().from(users).orderBy(users.createdAt);
    });
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    // Hash password if not already hashed
    let hashedPassword = insertUser.password;
    if (!insertUser.password.startsWith('$2a$')) {
      hashedPassword = await bcrypt.hash(insertUser.password, 12);
    }

    const [user] = await db
      .insert(users)
      .values({
        ...insertUser,
        password: hashedPassword,
        role: insertUser.role || "user",
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    return user;
  }

  async createUserWithHashedPassword(insertUser: InsertUser & { password: string }): Promise<User> {
    const hashedPassword = await bcrypt.hash(insertUser.password, 12);
    const [user] = await db
      .insert(users)
      .values({
        ...insertUser,
        password: hashedPassword,
        role: insertUser.role || "user",
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    return user;
  }

  async updateUser(id: number, updates: Partial<User>, adminUserId?: number, ipAddress?: string): Promise<User | undefined> {
    // Get current user data for logging
    const beforeData = await this.getUser(id);
    
    // Hash password if being updated
    if (updates.password && !updates.password.startsWith('$2a$')) {
      updates.password = await bcrypt.hash(updates.password, 12);
    }
    
    const [user] = await db
      .update(users)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();

    // Log the update if admin user and IP are provided
    if (user && adminUserId && ipAddress) {
      await this.logUserAction(
        adminUserId,
        'update_user',
        `Cập nhật thông tin người dùng ${beforeData?.username}`,
        ipAddress,
        id,
        beforeData,
        user
      );
    }
    
    // Invalidate cache when user is updated - EGRESS OPTIMIZATION
    if (user) {
      const cacheKey = `user:${id}`;
      cache.delete(cacheKey);
    }
    
    return user || undefined;
  }

  async deleteUser(id: number): Promise<boolean> {
    try {
      // Hard delete - permanently remove user from database
      const result = await db
        .delete(users)
        .where(eq(users.id, id));
      
      const success = result.rowCount !== null && result.rowCount > 0;
      
      // Invalidate cache when user is deleted - EGRESS OPTIMIZATION
      if (success) {
        const cacheKey = `user:${id}`;
        cache.delete(cacheKey);
      }
      
      return success;
    } catch (error) {
      console.error('Error deleting user:', error);
      // If foreign key constraint error, fall back to soft delete
      if (error instanceof Error && error.message.includes('foreign key')) {
        console.log('Foreign key constraint detected, performing soft delete instead');
        const updateResult = await db
          .update(users)
          .set({ 
            isActive: false,
            updatedAt: new Date()
          })
          .where(eq(users.id, id));
        
        const success = (updateResult.rowCount || 0) > 0;
        
        // Invalidate cache when user is soft deleted - EGRESS OPTIMIZATION
        if (success) {
          const cacheKey = `user:${id}`;
          cache.delete(cacheKey);
        }
        
        return success;
      }
      return false;
    }
  }

  async getUserBalance(userId: number, txOrDb?: any): Promise<number> {
    // Get database object to use (transaction or main db)
    const dbToUse = txOrDb || db;
    
    // If using transaction, skip cache to get fresh data
    if (txOrDb) {
      const [user] = await dbToUse.select({ balance: users.balance }).from(users).where(eq(users.id, userId));
      return user ? parseFloat(user.balance) : 0;
    }
    
    // Kiểm tra cache trước (only for non-transaction calls)
    const cacheKey = `user_balance_${userId}`;
    const cachedBalance = cache.get(cacheKey);
    if (cachedBalance !== null) {
      return cachedBalance;
    }
    
    // Nếu không có trong cache, query database
    const [user] = await dbToUse.select({ balance: users.balance }).from(users).where(eq(users.id, userId));
    const balance = user ? parseFloat(user.balance) : 0;
    
    // Cache trong 5 phút (balance thường không thay đổi thường xuyên)
    cache.set(cacheKey, balance, 300);
    
    return balance;
  }

  async updateUserBalance(userId: number, newBalance: number, adminUserId?: number, ipAddress?: string, txOrDb?: any): Promise<void> {
    // Get database object to use (transaction or main db)
    const dbToUse = txOrDb || db;
    
    // Get current balance for logging
    const beforeBalance = await this.getUserBalance(userId, txOrDb);
    const user = await this.getUser(userId);
    
    await dbToUse
      .update(users)
      .set({ balance: newBalance.toString() })
      .where(eq(users.id, userId));
      
    // CRITICAL: Invalidate cache when balance updates
    const cacheKey = `user_balance_${userId}`;
    cache.delete(cacheKey);

    // If this is an admin balance update, create a transaction record
    if (adminUserId && user) {
      const amount = newBalance - beforeBalance;
      const adminUser = await this.getUser(adminUserId);
      const adminNote = `${adminUser?.username || 'Admin'} đã ${amount > 0 ? 'cộng' : 'trừ'} ${Math.abs(amount).toLocaleString('vi-VN')} VND`;
      
      await this.createTransaction({
        userId,
        type: amount > 0 ? 'admin_credit' : 'admin_debit',
        amount: amount.toString(),
        description: `Điều chỉnh số dư bởi ${adminUser?.username || 'Admin'}`,
        status: 'completed',
        balanceBefore: beforeBalance.toString(),
        balanceAfter: newBalance.toString(),
        adminNote
      }, txOrDb);
    }

    // Log the balance update if admin user and IP are provided
    if (adminUserId && ipAddress && user) {
      await this.logUserAction(
        adminUserId,
        'update_balance',
        `Cập nhật số dư người dùng ${user.username} từ ${beforeBalance} thành ${newBalance}`,
        ipAddress,
        userId,
        { balance: beforeBalance },
        { balance: newBalance }
      );
    }
  }

  // 🔒 NEW ATOMIC METHOD: Increment balance safely using SQL
  async incrementUserBalance(userId: number, amount: number, txOrDb?: any): Promise<{ beforeBalance: number; afterBalance: number }> {
    // Get database object to use (transaction or main db)  
    const dbToUse = txOrDb || db;
    
    // Atomic increment using SQL - prevents race conditions
    const [result] = await dbToUse
      .update(users)
      .set({ balance: sql`${users.balance}::numeric + ${amount}` })
      .where(eq(users.id, userId))
      .returning({ 
        balance: users.balance,
        // Get previous balance by subtracting the amount we just added
        previousBalance: sql<string>`(${users.balance}::numeric - ${amount})::text`
      });

    if (!result) {
      throw new Error(`User ${userId} not found`);
    }

    const afterBalance = parseFloat(result.balance);
    const beforeBalance = parseFloat(result.previousBalance);
    
    // CRITICAL: Invalidate cache when balance updates
    const cacheKey = `user_balance_${userId}`;
    cache.delete(cacheKey);

    return { beforeBalance, afterBalance };
  }

  async updateUserPassword(userId: number, hashedPassword: string): Promise<void> {
    await db
      .update(users)
      .set({ 
        password: hashedPassword,
        updatedAt: new Date()
      })
      .where(eq(users.id, userId));
  }

  // Project operations
  async getAllProjects(): Promise<Project[]> {
    return await db.select().from(projects).orderBy(projects.createdAt);
  }

  async getProject(id: number): Promise<Project | undefined> {
    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    return project;
  }

  async createProject(insertProject: InsertProject): Promise<Project> {
    const [project] = await db
      .insert(projects)
      .values({
        ...insertProject,
        createdAt: new Date(),
      })
      .returning();
    return project;
  }

  async updateProject(id: number, updates: Partial<Project>): Promise<Project | undefined> {
    const [project] = await db
      .update(projects)
      .set(updates)
      .where(eq(projects.id, id))
      .returning();
    return project || undefined;
  }

  // Resource operations
  async getAllResources(): Promise<Resource[]> {
    return await db.select().from(resources);
  }

  async getResourcesByProject(projectId: number): Promise<Resource[]> {
    return await db.select().from(resources).where(eq(resources.projectId, projectId));
  }

  async createResource(insertResource: InsertResource): Promise<Resource> {
    const [resource] = await db
      .insert(resources)
      .values(insertResource)
      .returning();
    return resource;
  }

  // getAllAuditLogs REMOVED - use getAuditLogsWithPagination

  async getAuditLogsWithPagination(page: number, limit: number, search?: string, action?: string): Promise<AuditLog[]> {
    const offset = (page - 1) * limit;
    
    let whereConditions: any[] = [];
    
    if (search) {
      whereConditions.push(
        or(
          sql`${auditLogs.description} ILIKE ${`%${search}%`}`,
          sql`${auditLogs.ipAddress} ILIKE ${`%${search}%`}`
        )
      );
    }
    
    if (action && action !== 'all') {
      whereConditions.push(eq(auditLogs.action, action));
    }
    
    const results = await db
      .select()
      .from(auditLogs)
      .where(whereConditions.length > 0 ? and(...whereConditions) : undefined)
      .orderBy(desc(auditLogs.timestamp))
      .limit(limit)
      .offset(offset);

    // Fetch user information for each audit log
    const logsWithUsers = await Promise.all(
      results.map(async (log) => {
        const user = await this.getUser(log.userId);
        const targetUser = log.targetUserId ? await this.getUser(log.targetUserId) : null;
        
        return {
          ...log,
          timestamp: log.timestamp.toISOString(),
          user: user ? { username: user.username, fullName: user.fullName } : null,
          targetUser: targetUser ? { username: targetUser.username, fullName: targetUser.fullName } : null
        };
      })
    );

    return logsWithUsers as any[];
  }

  async createAuditLog(insertLog: InsertAuditLog): Promise<AuditLog> {
    const [log] = await db
      .insert(auditLogs)
      .values(insertLog)
      .returning();
    return log;
  }

  async logUserAction(userId: number, action: string, description: string, ipAddress: string, targetUserId?: number, beforeData?: any, afterData?: any): Promise<void> {
    await this.createAuditLog({
      userId,
      targetUserId,
      action,
      description,
      beforeData,
      afterData,
      ipAddress
    });
  }

  // Activity operations
  async getRecentActivities(limit = 10): Promise<Activity[]> {
    return await db.select().from(activities).orderBy(desc(activities.timestamp)).limit(limit);
  }

  async createActivity(insertActivity: InsertActivity): Promise<Activity> {
    try {
      const [activity] = await db
        .insert(activities)
        .values(insertActivity)
        .returning() as Activity[];
      return activity;
    } catch (error: any) {
      // If it's a primary key violation, try to fix the sequence and retry
      if (error.message?.includes('duplicate key value violates unique constraint') && 
          error.message?.includes('activities_pkey')) {
        console.log('Fixing activities sequence...');
        await this.fixActivitiesSequence();
        
        // Retry the insert
        const [activity] = await db
          .insert(activities)
          .values(insertActivity)
          .returning() as Activity[];
        return activity;
      }
      throw error;
    }
  }

  // Fix sequence for activities table
  async fixActivitiesSequence(): Promise<void> {
    try {
      await db.execute(sql`
        SELECT setval('activities_id_seq', (SELECT COALESCE(MAX(id), 0) + 1 FROM activities), false)
      `);
      console.log('Activities sequence fixed successfully');
    } catch (error) {
      console.error('Error fixing activities sequence:', error);
    }
  }

  // Fix sequence for any table with serial primary key
  async fixTableSequence(tableName: string, sequenceName: string): Promise<void> {
    try {
      await db.execute(sql.raw(`
        SELECT setval('${sequenceName}', (SELECT COALESCE(MAX(id), 0) + 1 FROM ${tableName}), false)
      `));
      console.log(`${tableName} sequence fixed successfully`);
    } catch (error) {
      console.error(`Error fixing ${tableName} sequence:`, error);
    }
  }

  // Generic insert with auto sequence fix for primary key conflicts (simplified)
  async safeInsert<T>(table: any, values: any): Promise<T> {
    try {
      const [result] = await db.insert(table).values(values).returning() as T[];
      return result;
    } catch (error: any) {
      // If it's a primary key violation, try to fix the sequence and retry
      if (error.message?.includes('duplicate key value violates unique constraint') && 
          error.message?.includes('_pkey')) {
        console.log(`Fixing sequence for table...`);
        
        // Extract table name from error message
        const match = error.message.match(/\"(\w+)_pkey\"/);
        if (match) {
          const tableName = match[1];
          const sequenceName = `${tableName}_id_seq`;
          await this.fixTableSequence(tableName, sequenceName);
          
          // Retry the insert
          const [result] = await db.insert(table).values(values).returning() as T[];
          return result;
        }
      }
      throw error;
    }
  }

  // getAllPhoneRentals REMOVED - use getPhoneRentalsWithPagination

  // OPTIMIZED: New paginated phone rentals query to reduce egress
  async getPhoneRentalsWithPagination(page: number = 1, limit: number = 50, filters?: {
    userId?: number;
    status?: string;
    sessionId?: string;
    startDate?: Date;
    endDate?: Date;
  }): Promise<PhoneRental[]> {
    const offset = (page - 1) * limit;
    let query = db.select().from(phoneRentals);

    // FIXED: Combine all conditions with and() to prevent override
    const conditions = [];
    if (filters?.userId) {
      conditions.push(eq(phoneRentals.userId, filters.userId));
    }
    if (filters?.status) {
      conditions.push(eq(phoneRentals.status, filters.status));
    }
    if (filters?.sessionId) {
      conditions.push(eq(phoneRentals.sessionId, filters.sessionId));
    }
    if (filters?.startDate) {
      conditions.push(gte(phoneRentals.createdAt, filters.startDate));
    }
    if (filters?.endDate) {
      conditions.push(lte(phoneRentals.createdAt, filters.endDate));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    return await query
      .orderBy(desc(phoneRentals.createdAt))
      .limit(limit)
      .offset(offset);
  }

  // getAllPhoneRentalHistory REMOVED - use getPhoneRentalHistoryWithFilter

  async getPhoneRentalHistoryWithFilter(options: {
    limit?: number;
    page?: number;
    userId?: number;
    status?: string;
    service?: string;
    startDate?: Date;
    endDate?: Date;
  } = {}): Promise<PhoneRentalHistory[]> {
    const { limit = 100, page = 1, ...filters } = options;
    const offset = (page - 1) * limit;
    let query = db.select().from(phoneRentalHistory);

    // FIXED: Combine all conditions with and() to prevent override
    const conditions = [];
    if (filters.userId) {
      conditions.push(eq(phoneRentalHistory.userId, filters.userId));
    }
    if (filters.status) {
      conditions.push(eq(phoneRentalHistory.status, filters.status));
    }
    if (filters.service) {
      conditions.push(eq(phoneRentalHistory.service, filters.service));
    }
    if (filters.startDate) {
      conditions.push(gte(phoneRentalHistory.createdAt, filters.startDate));
    }
    if (filters.endDate) {
      conditions.push(lte(phoneRentalHistory.createdAt, filters.endDate));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    return await query
      .orderBy(desc(phoneRentalHistory.createdAt))
      .limit(limit)
      .offset(offset);
  }

  async getPhoneRentalsByUser(userId: number): Promise<PhoneRental[]> {
    return await db.select().from(phoneRentals).where(eq(phoneRentals.userId, userId)).orderBy(desc(phoneRentals.createdAt));
  }

  async createPhoneRental(rental: InsertPhoneRental & { userId: number }): Promise<PhoneRental> {
    const [newRental] = await db
      .insert(phoneRentals)
      .values(rental)
      .returning();
    return newRental;
  }

  async updatePhoneRental(id: number, updates: Partial<PhoneRental>): Promise<PhoneRental | undefined> {
    const [rental] = await db
      .update(phoneRentals)
      .set(updates)
      .where(eq(phoneRentals.id, id))
      .returning();
    return rental || undefined;
  }

  // Shopee cookie operations
  async getAllShopeeCookies(): Promise<ShopeeCookie[]> {
    return await db.select().from(shopeeCookies).orderBy(desc(shopeeCookies.createdAt));
  }

  async getShopeeCookiesByUser(userId: number): Promise<ShopeeCookie[]> {
    return await db.select().from(shopeeCookies).where(eq(shopeeCookies.userId, userId)).orderBy(desc(shopeeCookies.createdAt));
  }

  async createShopeeCookie(cookie: InsertShopeeCookie & { userId: number }): Promise<ShopeeCookie> {
    // Generate random 5-character ID
    const id = Math.random().toString(36).substring(2, 7).toUpperCase();
    
    const [newCookie] = await db
      .insert(shopeeCookies)
      .values({
        id,
        userId: cookie.userId,
        cookieType: cookie.cookieType,
        cookieValue: cookie.cookieValue,
        shopeeRegion: cookie.shopeeRegion,
      })
      .returning();
    return newCookie;
  }

  async updateShopeeCookie(id: string, updates: Partial<ShopeeCookie>): Promise<ShopeeCookie | undefined> {
    const [cookie] = await db
      .update(shopeeCookies)
      .set(updates)
      .where(eq(shopeeCookies.id, id))
      .returning();
    return cookie || undefined;
  }

  async deleteShopeeCookie(id: string, userId: number): Promise<boolean> {
    try {
      // First, delete related records to avoid foreign key constraint violations
      await db.delete(accountChecks).where(eq(accountChecks.cookieId, id));
      await db.delete(trackingChecks).where(eq(trackingChecks.cookieId, id));
      await db.delete(emailAdditions).where(eq(emailAdditions.cookieId, id));
      
      // Then delete the cookie itself
      const result = await db
        .delete(shopeeCookies)
        .where(and(eq(shopeeCookies.id, id), eq(shopeeCookies.userId, userId)));
      return (result.rowCount || 0) > 0;
    } catch (error) {
      console.error('Error deleting cookie:', error);
      return false;
    }
  }

  // Phone check operations
  async getAllPhoneChecks(): Promise<PhoneCheck[]> {
    return await db.select().from(phoneChecks).orderBy(desc(phoneChecks.checkedAt));
  }

  async getPhoneChecksByDateRange(startDate: Date, endDate: Date): Promise<PhoneCheck[]> {
    return await db.select()
      .from(phoneChecks)
      .where(and(
        gte(phoneChecks.checkedAt, startDate),
        lte(phoneChecks.checkedAt, endDate)
      ))
      .orderBy(desc(phoneChecks.checkedAt));
  }

  async getPhoneChecksByUser(userId: number): Promise<PhoneCheck[]> {
    return await db.select().from(phoneChecks).where(eq(phoneChecks.userId, userId)).orderBy(desc(phoneChecks.checkedAt));
  }

  async createPhoneCheck(check: InsertPhoneCheck & { userId: number }): Promise<PhoneCheck> {
    const [newCheck] = await db
      .insert(phoneChecks)
      .values(check)
      .returning();
    return newCheck;
  }

  // Tracking check operations
  async getAllTrackingChecks(): Promise<TrackingCheck[]> {
    return await db.select().from(trackingChecks).orderBy(desc(trackingChecks.createdAt));
  }

  async getTrackingChecksByDateRange(startDate: Date, endDate: Date): Promise<TrackingCheck[]> {
    return await db.select()
      .from(trackingChecks)
      .where(and(
        gte(trackingChecks.createdAt, startDate),
        lte(trackingChecks.createdAt, endDate)
      ))
      .orderBy(desc(trackingChecks.createdAt));
  }

  async getTrackingChecksByUser(userId: number): Promise<TrackingCheck[]> {
    return await db.select().from(trackingChecks).where(eq(trackingChecks.userId, userId)).orderBy(desc(trackingChecks.createdAt));
  }

  async createTrackingCheck(check: InsertTrackingCheck & { userId: number }): Promise<TrackingCheck> {
    const [newCheck] = await db
      .insert(trackingChecks)
      .values(check)
      .returning();
    return newCheck;
  }

  async updateTrackingCheckByCookie(userId: number, cookieId: string, updates: Partial<TrackingCheck>): Promise<TrackingCheck | undefined> {
    const [updatedCheck] = await db
      .update(trackingChecks)
      .set({ ...updates, createdAt: new Date() })
      .where(and(
        eq(trackingChecks.userId, userId),
        eq(trackingChecks.cookieId, cookieId)
      ))
      .returning();
    return updatedCheck || undefined;
  }

  async deleteTrackingChecksByCookie(userId: number, cookieId: string): Promise<void> {
    await db
      .delete(trackingChecks)
      .where(and(
        eq(trackingChecks.userId, userId),
        eq(trackingChecks.cookieId, cookieId)
      ));
  }

  // Cookie rapid check operations
  async getAllCookieRapidChecks(): Promise<CookieRapidCheck[]> {
    return await db.select().from(cookieRapidChecks).orderBy(desc(cookieRapidChecks.createdAt));
  }

  async getCookieRapidChecksByDateRange(startDate: Date, endDate: Date): Promise<CookieRapidCheck[]> {
    return await db.select()
      .from(cookieRapidChecks)
      .where(and(
        gte(cookieRapidChecks.createdAt, startDate),
        lte(cookieRapidChecks.createdAt, endDate)
      ))
      .orderBy(desc(cookieRapidChecks.createdAt));
  }

  async getCookieRapidChecksByUser(userId: number): Promise<CookieRapidCheck[]> {
    return await db.select().from(cookieRapidChecks).where(eq(cookieRapidChecks.userId, userId)).orderBy(desc(cookieRapidChecks.createdAt));
  }

  async createCookieRapidCheck(check: InsertCookieRapidCheck & { userId: number }): Promise<CookieRapidCheck> {
    const [newCheck] = await db
      .insert(cookieRapidChecks)
      .values(check)
      .returning();
    return newCheck;
  }

  async updateCookieRapidCheck(id: number, updates: Partial<CookieRapidCheck>): Promise<CookieRapidCheck | undefined> {
    const [updatedCheck] = await db
      .update(cookieRapidChecks)
      .set(updates)
      .where(eq(cookieRapidChecks.id, id))
      .returning();
    return updatedCheck || undefined;
  }

  async updateCookieRapidCheckByCookie(userId: number, cookieId: string, updates: Partial<CookieRapidCheck>): Promise<CookieRapidCheck | undefined> {
    const [updatedCheck] = await db
      .update(cookieRapidChecks)
      .set({ ...updates, createdAt: new Date() })
      .where(and(
        eq(cookieRapidChecks.userId, userId),
        eq(cookieRapidChecks.cookieId, cookieId)
      ))
      .returning();
    return updatedCheck || undefined;
  }

  async deleteCookieRapidChecksByCookie(userId: number, cookieId: string): Promise<void> {
    await db
      .delete(cookieRapidChecks)
      .where(and(
        eq(cookieRapidChecks.userId, userId),
        eq(cookieRapidChecks.cookieId, cookieId)
      ));
  }

  /**
   * Check if a successful cookie rapid check exists within the last 3 days
   * Returns the existing check if found, null otherwise
   */
  async getRecentSuccessfulCookieCheck(userId: number, cookiePreview: string): Promise<CookieRapidCheck | null> {
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    
    const recentChecks = await db
      .select()
      .from(cookieRapidChecks)
      .where(and(
        eq(cookieRapidChecks.userId, userId),
        eq(cookieRapidChecks.cookiePreview, cookiePreview),
        eq(cookieRapidChecks.status, true), // Only successful checks
        sql`${cookieRapidChecks.createdAt} >= ${threeDaysAgo}`, // Within last 3 days
        sql`${cookieRapidChecks.driverPhone} IS NOT NULL AND ${cookieRapidChecks.driverPhone} != ''` // Must have driver info
      ))
      .orderBy(desc(cookieRapidChecks.createdAt))
      .limit(1);
    
    return recentChecks.length > 0 ? recentChecks[0] : null;
  }

  /**
   * 🔒 ATOMIC COOKIE RAPID CHECK WITH FINANCIAL SAFETY
   * Safely process cookie rapid check with 3-day history check and atomic billing
   */
  async atomicCookieRapidCheck(params: {
    userId: number;
    cookieId: string;
    cookiePreview: string;
    idempotencyKey: string;
    userIp?: string;
  }): Promise<{
    success: boolean;
    foundRecentCheck: boolean;
    recentCheck?: CookieRapidCheck;
    message: string;
  }> {
    const { userId, cookieId, cookiePreview, idempotencyKey, userIp } = params;
    
    try {
      // Check for recent successful check within 3 days (free)
      const recentCheck = await this.getRecentSuccessfulCookieCheck(userId, cookiePreview);
      
      if (recentCheck) {
        console.log(`[ATOMIC COOKIE] Found recent successful check within 3 days for user ${userId}`);
        return {
          success: true,
          foundRecentCheck: true,
          recentCheck: recentCheck,
          message: `Sử dụng kết quả từ lịch sử (${Math.floor((Date.now() - new Date(recentCheck.createdAt).getTime()) / (1000 * 60 * 60 * 24))} ngày trước) - Miễn phí`
        };
      }
      
      console.log(`[ATOMIC COOKIE] No recent check found, need to proceed with new check for user ${userId}`);
      return {
        success: true,
        foundRecentCheck: false,
        message: 'Chưa có lịch sử kiểm tra, cần thực hiện kiểm tra mới'
      };
    } catch (error) {
      console.error(`[ATOMIC COOKIE] Error in atomicCookieRapidCheck:`, error);
      return {
        success: false,
        foundRecentCheck: false,
        message: 'Lỗi khi kiểm tra lịch sử cookie rapid check'
      };
    }
  }

  /**
   * 🔒 FINALIZE ATOMIC COOKIE RAPID CHECK
   * Complete the cookie rapid check after API call with atomic billing
   */
  async finalizeAtomicCookieRapidCheck(params: {
    userId: number;
    cookieId: string;
    cookieValue: string;
    cookiePreview: string;
    serviceCost: number;
    idempotencyKey: string;
    userIp?: string;
    userFullName: string;
    rapidResult: any;
  }): Promise<{
    success: boolean;
    checkRecord?: CookieRapidCheck;
    transaction?: Transaction;
    charged: boolean;
    amount_charged: number;
    balanceAfter: number;
    message: string;
    isFromHistory: boolean;
  }> {
    const { userId, cookieId, serviceCost, idempotencyKey, userFullName, rapidResult } = params;
    
    // Use database transaction for atomicity
    return await db.transaction(async (tx) => {
      try {
        // Step 0: Check for existing operation with same idempotency key (prevent double processing)
        const existingCheck = await tx
          .select()
          .from(cookieRapidChecks)
          .where(and(
            eq(cookieRapidChecks.userId, userId),
            eq(cookieRapidChecks.cookiePreview, params.cookiePreview),
            sql`metadata->>'idempotencyKey' = ${idempotencyKey}`
          ))
          .limit(1);
        
        if (existingCheck.length > 0) {
          // Return existing result for idempotency
          const currentUser = await tx.select({ balance: users.balance }).from(users).where(eq(users.id, userId));
          const wasCharged = existingCheck[0].driverPhone ? true : false;
          const chargeAmount = wasCharged ? serviceCost : 0;
          
          return {
            success: true,
            checkRecord: existingCheck[0],
            transaction: undefined,
            charged: wasCharged,
            amount_charged: chargeAmount,
            balanceAfter: parseFloat(currentUser[0]?.balance || '0'),
            message: 'Đã xử lý trước đó (idempotency)',
            isFromHistory: false
          };
        }

        // Determine if we should charge (only if successful and has driver info)
        const shouldCharge = rapidResult.success && rapidResult.driver_phone;
        
        let newBalance = 0;
        let balanceBefore = 0;
        let transaction: Transaction | undefined = undefined;
        
        if (shouldCharge) {
          // Step 1: Lock user row and check balance atomically
          const userResult = await tx
            .update(users)
            .set({ balance: sql`balance - ${serviceCost}` })
            .where(and(
              eq(users.id, userId),
              sql`balance >= ${serviceCost}` // Conditional update: only if sufficient balance
            ))
            .returning({ id: users.id, newBalance: users.balance });
          
          if (userResult.length === 0) {
            // No rows updated = insufficient balance
            const currentUser = await tx.select({ balance: users.balance }).from(users).where(eq(users.id, userId));
            const currentBalance = Number(currentUser[0]?.balance || '0');
            throw new Error(`Số dư không đủ. Cần ${serviceCost.toLocaleString('vi-VN')} VND để sử dụng dịch vụ Cookie hỏa tốc. Số dư hiện tại: ${currentBalance.toLocaleString('vi-VN')} VND`);
          }
          
          newBalance = Number(userResult[0].newBalance);
          balanceBefore = newBalance + serviceCost;
          
          // Step 2: Create transaction record
          const [newTransaction] = await tx
            .insert(transactions)
            .values({
              userId,
              type: 'cookie_service',
              amount: (-serviceCost).toString(),
              description: `Cookie hỏa tốc - Tìm thấy thông tin shipper: ${rapidResult.driver_phone}`,
              status: 'completed',
              balanceBefore: balanceBefore.toString(),
              balanceAfter: newBalance.toString(),
              metadata: JSON.stringify({
                service: 'cookie_rapid_check',
                cookieId,
                serviceCost,
                driverPhone: rapidResult.driver_phone,
                driverName: rapidResult.driver_name,
                idempotencyKey
              })
            })
            .returning();
          
          transaction = newTransaction;
          
          // Step 3: Create service usage history
          await tx
            .insert(serviceUsageHistory)
            .values({
              userId,
              serviceName: 'cookie_service',
              serviceType: 'Cookie Rapid Check',
              cost: serviceCost.toString(),
              status: 'success',
              description: `Cookie hỏa tốc - Tìm thấy shipper, trừ ${serviceCost}₫`,
              metadata: JSON.stringify({
                cookieId,
                serviceCost,
                driverPhone: rapidResult.driver_phone,
                driverName: rapidResult.driver_name,
                idempotencyKey
              })
            });
        } else {
          // No charge, just get current balance
          const currentUser = await tx.select({ balance: users.balance }).from(users).where(eq(users.id, userId));
          newBalance = parseFloat(currentUser[0]?.balance || '0');
        }
        
        // Step 4: Create cookie rapid check record with full order details
        const firstOrder = rapidResult.orders && rapidResult.orders.length > 0 ? rapidResult.orders[0] : null;
        
        // Determine message based on check result
        let checkMessage: string;
        if (!rapidResult.success) {
          // Cookie không trả về đơn hàng = cookie lỗi hoặc acc die
          checkMessage = "Cookie lỗi hoặc acc die";
        } else if (!rapidResult.driver_phone) {
          // Cookie trả về đơn hàng nhưng chưa có số shipper
          checkMessage = "Chưa có số shipper";
        } else {
          // Tìm thấy số shipper
          checkMessage = "Tìm thấy thông tin shipper";
        }
        
        const checkData = {
          cookieId,
          cookiePreview: params.cookiePreview,
          status: rapidResult.success,
          message: checkMessage,
          orderCount: rapidResult.order_count || 0,
          driverPhone: rapidResult.driver_phone || null,
          driverName: rapidResult.driver_name || null,
          // Store full order details when available
          orderId: firstOrder?.order_id || null,
          trackingNumber: firstOrder?.tracking_number || null,
          trackingInfo: firstOrder?.description || null,
          shippingName: firstOrder?.shipping_name || null,
          shippingPhone: firstOrder?.shipping_phone || null,
          shippingAddress: firstOrder?.shipping_address || null,
          orderName: firstOrder?.name || null,
          orderPrice: firstOrder?.order_price ? (firstOrder.order_price / 100000).toString() : null,
          orderTime: firstOrder?.order_time || null,
          proxy: null,
          userIp: params.userIp || null
        };

        const [checkRecord] = await tx
          .insert(cookieRapidChecks)
          .values({
            ...checkData,
            userId: userId, // Add userId manually as it's omitted from insert schema
            metadata: JSON.stringify({
              idempotencyKey,
              serviceCost: shouldCharge ? serviceCost : 0,
              processedAt: new Date().toISOString(),
              charged: shouldCharge,
              orders: rapidResult.orders || []
            })
          })
          .returning();
        
        // Determine return message
        let returnMessage: string;
        if (!rapidResult.success) {
          returnMessage = 'Cookie lỗi hoặc acc die - không trừ tiền';
        } else if (shouldCharge) {
          returnMessage = `Tìm thấy thông tin shipper, đã trừ ${serviceCost.toLocaleString('vi-VN')}₫`;
        } else {
          returnMessage = 'Chưa có số shipper, không trừ tiền';
        }
        
        return {
          success: true,
          checkRecord: checkRecord,
          transaction: transaction,
          charged: shouldCharge,
          amount_charged: shouldCharge ? serviceCost : 0,
          balanceAfter: newBalance,
          message: returnMessage,
          isFromHistory: false
        };
        
      } catch (error) {
        console.error('Finalize atomic cookie rapid check error:', error);
        
        // 🔒 FALLBACK AUDIT LOGGING - Guaranteed logging even on transaction rollback
        try {
          await this.createAuditLog({
            userId,
            action: 'COOKIE_RAPID_CHECK_FAILED',
            description: `Cookie rapid check failed - Cookie: ${params.cookiePreview.substring(0, 20)}..., Service cost: ${serviceCost}₫, Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            ipAddress: params.userIp || 'unknown',
            afterData: JSON.stringify({
              cookieId,
              serviceCost,
              idempotencyKey,
              errorType: error instanceof Error ? error.constructor.name : 'UnknownError',
              errorMessage: error instanceof Error ? error.message : String(error)
            })
          });
        } catch (auditError) {
          console.error('Failed to create fallback audit log:', auditError);
        }
        
        throw error;
      }
    });
  }

  /**
   * 🔒 ATOMIC COOKIE RAPID CHARGE WITH UPFRONT PAYMENT
   * Charge user upfront for cookie rapid check, allowing refund if service fails
   */
  async atomicCookieRapidCharge(params: {
    userId: number;
    cookieId: string;
    cookiePreview: string;
    serviceCost: number;
    idempotencyKey: string;
    userIp?: string;
    userFullName: string;
  }): Promise<{
    success: boolean;
    checkRecord?: CookieRapidCheck;
    transaction?: Transaction;
    balanceAfter: number;
    message: string;
  }> {
    const { userId, cookieId, serviceCost, idempotencyKey, userFullName } = params;
    
    // Use database transaction for atomicity
    return await db.transaction(async (tx) => {
      try {
        // Step 1: Check for existing operation with same idempotency key (prevent double processing)
        const existingCheck = await tx
          .select()
          .from(cookieRapidChecks)
          .where(and(
            eq(cookieRapidChecks.userId, userId),
            eq(cookieRapidChecks.cookiePreview, params.cookiePreview),
            sql`metadata->>'idempotencyKey' = ${idempotencyKey}`
          ))
          .limit(1);
        
        if (existingCheck.length > 0) {
          // Return existing result for idempotency
          const currentUser = await tx.select({ balance: users.balance }).from(users).where(eq(users.id, userId));
          return {
            success: true,
            checkRecord: existingCheck[0],
            balanceAfter: parseFloat(currentUser[0]?.balance || '0'),
            message: 'Đã xử lý trước đó (idempotency)'
          };
        }
        
        // Step 2: Lock user row and check balance atomically
        const userResult = await tx
          .update(users)
          .set({ balance: sql`balance - ${serviceCost}` })
          .where(and(
            eq(users.id, userId),
            sql`balance >= ${serviceCost}` // Conditional update: only if sufficient balance
          ))
          .returning({ id: users.id, newBalance: users.balance });
        
        if (userResult.length === 0) {
          // No rows updated = insufficient balance
          // Get current balance for error message
          const currentUser = await tx.select({ balance: users.balance }).from(users).where(eq(users.id, userId));
          const currentBalance = Number(currentUser[0]?.balance || '0');
          throw new Error(`Số dư không đủ. Cần ${serviceCost.toLocaleString('vi-VN')} VND để sử dụng dịch vụ Cookie hỏa tốc. Số dư hiện tại: ${currentBalance.toLocaleString('vi-VN')} VND`);
        }
        
        const newBalance = Number(userResult[0].newBalance);
        const balanceBefore = newBalance + serviceCost;
        
        // Step 3: Create transaction record
        const [newTransaction] = await tx
          .insert(transactions)
          .values({
            userId,
            amount: serviceCost,
            type: 'charge',
            description: 'Cookie hỏa tốc (Trừ tiền trước)',
            balanceBefore: balanceBefore.toString(),
            balanceAfter: newBalance.toString(),
            reference: `cookie_rapid_upfront_${cookieId}`,
            metadata: JSON.stringify({
              serviceCost,
              cookieId,
              cookiePreview: params.cookiePreview,
              userFullName,
              userIp: params.userIp,
              processedAt: new Date().toISOString(),
              idempotencyKey
            })
          })
          .returning();
        
        // Step 4: Create cookie rapid check record (pending status = false)
        const [newCheck] = await tx
          .insert(cookieRapidChecks)
          .values({
            userId,
            status: false,
            cookiePreview: params.cookiePreview,
            cost: serviceCost,
            message: 'Đã trừ tiền, đang xử lý cookie hỏa tốc...',
            userIp: params.userIp || null,
            metadata: JSON.stringify({
              idempotencyKey,
              serviceCost,
              processedAt: new Date().toISOString(),
              upfrontCharge: true,
              transactionId: newTransaction.id
            })
          })
          .returning();
        
        console.log(`[ATOMIC COOKIE RAPID CHARGE] Charged ${serviceCost}₫ upfront for user ${userId}, check ID: ${newCheck.id}`);
        
        return {
          success: true,
          checkRecord: newCheck,
          transaction: newTransaction,
          balanceAfter: newBalance,
          message: `Đã trừ ${serviceCost.toLocaleString('vi-VN')} VND, đang xử lý cookie hỏa tốc...`
        };
        
      } catch (error) {
        console.error(`[ATOMIC COOKIE RAPID CHARGE] Error for user ${userId}:`, error);
        throw error;
      }
    });
  }

  /**
   * 🔒 ATOMIC PHONE RENTAL CHARGE
   * Atomically charge user for phone rental and create rental history
   */
  async atomicPhoneRentalCharge(params: {
    userId: number;
    sessionId: string;
    service: string;
    carrier: string;
    serviceCost: number;
    expiresAt: Date;
  }): Promise<{
    success: boolean;
    rental?: PhoneRentalHistory;
    transaction?: Transaction;
    balanceAfter: number;
    message: string;
  }> {
    const { userId, sessionId, service, carrier, serviceCost, expiresAt } = params;
    
    return await db.transaction(async (tx) => {
      try {
        // Step 1: Check balance and deduct atomically using SQL
        const userResult = await tx
          .update(users)
          .set({ balance: sql`balance - ${serviceCost}` })
          .where(and(
            eq(users.id, userId),
            sql`balance >= ${serviceCost}` // Conditional update: only if sufficient balance
          ))
          .returning({ id: users.id, newBalance: users.balance });
        
        if (userResult.length === 0) {
          // No rows updated = insufficient balance
          const currentUser = await tx.select({ balance: users.balance }).from(users).where(eq(users.id, userId));
          const currentBalance = Number(currentUser[0]?.balance || '0');
          throw new Error(`Số dư không đủ. Cần ${serviceCost.toLocaleString('vi-VN')} VND để thuê số. Số dư hiện tại: ${currentBalance.toLocaleString('vi-VN')} VND.`);
        }
        
        const newBalance = Number(userResult[0].newBalance);
        const balanceBefore = newBalance + serviceCost;
        
        // Step 2: Create transaction record
        const [newTransaction] = await tx
          .insert(transactions)
          .values({
            userId,
            type: service,
            amount: `-${serviceCost}`,
            description: `Thuê số điện thoại ${service} - ${carrier}`,
            reference: `charge_${sessionId}`,
            status: 'completed',
            balanceBefore: balanceBefore.toString(),
            balanceAfter: newBalance.toString()
          })
          .returning();
        
        // Step 3: Create rental history record
        const [rental] = await tx
          .insert(phoneRentalHistory)
          .values({
            userId,
            sessionId,
            service,
            carrier,
            phoneNumber: '', // Will be updated after API call
            status: 'waiting',
            cost: serviceCost,
            startTime: new Date(),
            expiresAt,
            apiResponseData: 'Session created, waiting for API call'
          })
          .returning();
        
        // CRITICAL: Invalidate cache
        const cacheKey = `user_balance_${userId}`;
        cache.delete(cacheKey);
        
        console.log(`[ATOMIC PHONE RENTAL CHARGE] Charged ${serviceCost}₫ for user ${userId}, session: ${sessionId}`);
        
        return {
          success: true,
          rental,
          transaction: newTransaction,
          balanceAfter: newBalance,
          message: `Đã trừ ${serviceCost.toLocaleString('vi-VN')} VND và tạo session thành công`
        };
        
      } catch (error) {
        console.error(`[ATOMIC PHONE RENTAL CHARGE] Error for user ${userId}:`, error);
        throw error;
      }
    });
  }

  /**
   * 🔒 REFUND FAILED COOKIE RAPID CHECK
   * Refund user if cookie rapid check failed after upfront charge
   */
  async refundFailedCookieRapid(params: {
    userId: number;
    checkId: number;
    originalTransactionId: number;
    serviceCost: number;
    cookieId: string;
    reason: string;
    idempotencyKey: string;
  }): Promise<{
    success: boolean;
    refundTransaction?: Transaction;
    balanceAfter: number;
    message: string;
  }> {
    const { userId, checkId, originalTransactionId, serviceCost, cookieId, reason, idempotencyKey } = params;
    
    return await db.transaction(async (tx) => {
      try {
        // Step 1: Check for existing refund with same idempotency key
        const existingRefund = await tx
          .select()
          .from(transactions)
          .where(and(
            eq(transactions.userId, userId),
            eq(transactions.type, 'refund'),
            sql`metadata->>'idempotencyKey' = ${idempotencyKey}`
          ))
          .limit(1);
        
        if (existingRefund.length > 0) {
          const currentUser = await tx.select({ balance: users.balance }).from(users).where(eq(users.id, userId));
          return {
            success: true,
            refundTransaction: existingRefund[0],
            balanceAfter: parseFloat(currentUser[0]?.balance || '0'),
            message: 'Đã hoàn tiền trước đó (idempotency)'
          };
        }
        
        // Step 2: Add refund amount back to user balance
        const userResult = await tx
          .update(users)
          .set({ balance: sql`balance + ${serviceCost}` })
          .where(eq(users.id, userId))
          .returning({ id: users.id, newBalance: users.balance });
        
        const newBalance = Number(userResult[0].newBalance);
        const balanceBefore = newBalance - serviceCost;
        
        // Step 3: Create refund transaction record
        const [refundTransaction] = await tx
          .insert(transactions)
          .values({
            userId,
            amount: serviceCost,
            type: 'refund',
            description: `Hoàn tiền Cookie hỏa tốc: ${reason}`,
            balanceBefore: balanceBefore.toString(),
            balanceAfter: newBalance.toString(),
            reference: `cookie_rapid_refund_${checkId}_${cookieId}`,
            metadata: JSON.stringify({
              originalTransactionId,
              serviceCost,
              checkId,
              cookieId,
              reason,
              refundedAt: new Date().toISOString(),
              idempotencyKey
            })
          })
          .returning();
        
        // Step 4: Update check record status to failed and refunded
        await tx
          .update(cookieRapidChecks)
          .set({
            message: `Thất bại: ${reason} - Đã hoàn ${serviceCost.toLocaleString('vi-VN')} VND`,
            metadata: sql`COALESCE(metadata, '{}'::jsonb) || '{"refunded": true}'::jsonb`
          })
          .where(eq(cookieRapidChecks.id, checkId));
        
        console.log(`[COOKIE RAPID REFUND] Refunded ${serviceCost}₫ for failed check ${checkId}, user ${userId}`);
        
        return {
          success: true,
          refundTransaction,
          balanceAfter: newBalance,
          message: `Đã hoàn ${serviceCost.toLocaleString('vi-VN')} VND vào tài khoản do lỗi: ${reason}`
        };
        
      } catch (error) {
        console.error(`[COOKIE RAPID REFUND] Error refunding for user ${userId}:`, error);
        throw error;
      }
    });
  }

  // Express tracking check operations
  async getAllExpressTrackingChecks(): Promise<ExpressTrackingCheck[]> {
    return await db.select().from(expressTrackingChecks).orderBy(desc(expressTrackingChecks.createdAt));
  }

  async getExpressTrackingChecksByDateRange(startDate: Date, endDate: Date): Promise<ExpressTrackingCheck[]> {
    return await db.select()
      .from(expressTrackingChecks)
      .where(and(
        gte(expressTrackingChecks.createdAt, startDate),
        lte(expressTrackingChecks.createdAt, endDate)
      ))
      .orderBy(desc(expressTrackingChecks.createdAt));
  }

  async getExpressTrackingChecksByUser(userId: number): Promise<ExpressTrackingCheck[]> {
    return await db.select().from(expressTrackingChecks).where(eq(expressTrackingChecks.userId, userId)).orderBy(desc(expressTrackingChecks.createdAt));
  }

  async createExpressTrackingCheck(check: InsertExpressTrackingCheck & { userId: number }): Promise<ExpressTrackingCheck> {
    const [newCheck] = await db
      .insert(expressTrackingChecks)
      .values(check)
      .returning();
    return newCheck;
  }

  async updateExpressTrackingCheck(id: number, updates: Partial<ExpressTrackingCheck>): Promise<ExpressTrackingCheck | undefined> {
    const [updatedCheck] = await db
      .update(expressTrackingChecks)
      .set(updates)
      .where(eq(expressTrackingChecks.id, id))
      .returning();
    return updatedCheck || undefined;
  }

  async deleteExpressTrackingCheck(id: number): Promise<boolean> {
    const result = await db
      .delete(expressTrackingChecks)
      .where(eq(expressTrackingChecks.id, id));
    return (result.rowCount || 0) > 0;
  }

  // Freeship voucher operations
  async getAllFreeshipVouchers(): Promise<FreeshipVoucher[]> {
    return await db.select().from(freeshipVouchers).orderBy(desc(freeshipVouchers.createdAt));
  }

  async getFreeshipVouchersByUser(userId: number): Promise<FreeshipVoucher[]> {
    return await db.select().from(freeshipVouchers).where(eq(freeshipVouchers.userId, userId)).orderBy(desc(freeshipVouchers.createdAt));
  }

  async getFreeshipVoucherByCode(voucherCode: string): Promise<FreeshipVoucher | undefined> {
    const [voucher] = await db.select().from(freeshipVouchers).where(eq(freeshipVouchers.voucherCode, voucherCode));
    return voucher || undefined;
  }

  async getFreeshipVoucherById(id: number): Promise<FreeshipVoucher | undefined> {
    const [voucher] = await db.select().from(freeshipVouchers).where(eq(freeshipVouchers.id, id));
    return voucher || undefined;
  }

  async getFreeshipVoucherByIdAndUser(id: number, userId: number): Promise<FreeshipVoucher | undefined> {
    const [voucher] = await db.select().from(freeshipVouchers)
      .where(and(eq(freeshipVouchers.id, id), eq(freeshipVouchers.userId, userId)));
    return voucher || undefined;
  }

  async createFreeshipVoucher(voucher: InsertFreeshipVoucher & { userId: number }): Promise<FreeshipVoucher> {
    const [newVoucher] = await db
      .insert(freeshipVouchers)
      .values({
        ...voucher,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();
    return newVoucher;
  }

  async updateFreeshipVoucher(id: number, updates: Partial<FreeshipVoucher>): Promise<FreeshipVoucher | undefined> {
    const [voucher] = await db
      .update(freeshipVouchers)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(freeshipVouchers.id, id))
      .returning();
    return voucher || undefined;
  }

  async deleteFreeshipVoucher(id: number): Promise<boolean> {
    const result = await db
      .delete(freeshipVouchers)
      .where(eq(freeshipVouchers.id, id));
    return (result.rowCount || 0) > 0;
  }

  async getActiveFreeshipVouchers(userId?: number): Promise<FreeshipVoucher[]> {
    const currentTime = new Date();
    return await db.select().from(freeshipVouchers)
      .where(and(
        eq(freeshipVouchers.isActive, true),
        eq(freeshipVouchers.status, 'active'),
        sql`${freeshipVouchers.validFrom} <= ${currentTime}`,
        sql`${freeshipVouchers.validUntil} >= ${currentTime}`,
        userId ? eq(freeshipVouchers.userId, userId) : undefined
      ))
      .orderBy(freeshipVouchers.priority, freeshipVouchers.createdAt);
  }

  async getExpiredFreeshipVouchers(): Promise<FreeshipVoucher[]> {
    const currentTime = new Date();
    return await db.select().from(freeshipVouchers)
      .where(sql`${freeshipVouchers.validUntil} < ${currentTime}`)
      .orderBy(freeshipVouchers.updatedAt);
  }

  // Freeship voucher usage operations
  async getAllFreeshipVoucherUsage(): Promise<FreeshipVoucherUsage[]> {
    return await db.select().from(freeshipVoucherUsage).orderBy(desc(freeshipVoucherUsage.createdAt));
  }

  async getFreeshipVoucherUsageByDateRange(startDate: Date, endDate: Date): Promise<FreeshipVoucherUsage[]> {
    return await db.select()
      .from(freeshipVoucherUsage)
      .where(and(
        gte(freeshipVoucherUsage.createdAt, startDate),
        lte(freeshipVoucherUsage.createdAt, endDate)
      ))
      .orderBy(desc(freeshipVoucherUsage.createdAt));
  }

  async getFreeshipVoucherUsageByUser(userId: number): Promise<FreeshipVoucherUsage[]> {
    return await db.select().from(freeshipVoucherUsage).where(eq(freeshipVoucherUsage.userId, userId)).orderBy(desc(freeshipVoucherUsage.createdAt));
  }

  async getFreeshipVoucherUsageByVoucher(voucherId: number): Promise<FreeshipVoucherUsage[]> {
    return await db.select().from(freeshipVoucherUsage).where(eq(freeshipVoucherUsage.voucherId, voucherId)).orderBy(freeshipVoucherUsage.createdAt);
  }

  async createFreeshipVoucherUsage(usage: InsertFreeshipVoucherUsage & { userId: number }): Promise<FreeshipVoucherUsage> {
    const [newUsage] = await db
      .insert(freeshipVoucherUsage)
      .values(usage)
      .returning();
    return newUsage;
  }

  /**
   * 🔒 ATOMIC FREESHIP VOUCHER USAGE WITH FINANCIAL SAFETY
   * Safely process voucher usage with pre-charge validation and atomicity
   */
  async atomicFreeshipVoucherUsage(params: {
    userId: number;
    voucherId: number;
    orderId?: string;
    orderValue?: string;
    discountApplied?: string;
    serviceCost: number;
    idempotencyKey: string;
    voucherCode: string;
    userFullName: string;
  }): Promise<{
    success: boolean;
    usage?: FreeshipVoucherUsage;
    transaction?: Transaction;
    balanceAfter: number;
    message: string;
  }> {
    const { userId, voucherId, serviceCost, idempotencyKey, voucherCode, userFullName } = params;
    
    // Use database transaction for atomicity
    return await db.transaction(async (tx) => {
      try {
        // Step 1: Check for existing usage with same idempotency key (prevent double processing)
        const existingUsage = await tx
          .select()
          .from(freeshipVoucherUsage)
          .where(and(
            eq(freeshipVoucherUsage.userId, userId),
            eq(freeshipVoucherUsage.voucherId, voucherId),
            sql`metadata->>'idempotencyKey' = ${idempotencyKey}`
          ))
          .limit(1);
        
        if (existingUsage.length > 0) {
          // Return existing result for idempotency
          const currentUser = await tx.select({ balance: users.balance }).from(users).where(eq(users.id, userId));
          return {
            success: true,
            usage: existingUsage[0],
            balanceAfter: Number(currentUser[0]?.balance || '0'),
            message: 'Đã xử lý trước đó (idempotency)'
          };
        }
        
        // Step 2: Lock user row and check balance atomically
        const userResult = await tx
          .update(users)
          .set({ balance: sql`balance - ${serviceCost}` })
          .where(and(
            eq(users.id, userId),
            sql`balance >= ${serviceCost}` // Conditional update: only if sufficient balance
          ))
          .returning({ id: users.id, newBalance: users.balance });
        
        if (userResult.length === 0) {
          // No rows updated = insufficient balance
          // Get current balance for error message
          const currentUser = await tx.select({ balance: users.balance }).from(users).where(eq(users.id, userId));
          const currentBalance = Number(currentUser[0]?.balance || '0');
          throw new Error(`Số dư không đủ. Cần ${serviceCost.toLocaleString('vi-VN')} VND để sử dụng voucher freeship. Số dư hiện tại: ${currentBalance.toLocaleString('vi-VN')} VND`);
        }
        
        const newBalance = Number(userResult[0].newBalance);
        const balanceBefore = newBalance + serviceCost;
        
        // Step 3: Create voucher usage record
        const [newUsage] = await tx
          .insert(freeshipVoucherUsage)
          .values({
            voucherId,
            userId,
            orderId: params.orderId || null,
            orderValue: params.orderValue || null,
            discountApplied: params.discountApplied || null,
            status: 'used',
            metadata: JSON.stringify({
              idempotencyKey,
              serviceCost,
              processedAt: new Date().toISOString()
            })
          })
          .returning();
        
        // Step 4: Create transaction record
        const [newTransaction] = await tx
          .insert(transactions)
          .values({
            userId,
            type: 'service_usage',
            amount: (-serviceCost).toString(),
            description: `Sử dụng voucher freeship: ${voucherCode}`,
            status: 'completed',
            balanceBefore: balanceBefore.toString(),
            balanceAfter: newBalance.toString(),
            metadata: JSON.stringify({
              service: 'freeship_voucher_usage',
              voucherCode,
              voucherId,
              serviceCost,
              usageId: newUsage.id,
              idempotencyKey
            })
          })
          .returning();
        
        // Step 5: Create service usage history
        await tx
          .insert(serviceUsageHistory)
          .values({
            userId,
            serviceName: 'freeship_voucher_usage',
            serviceType: 'Freeship Voucher Usage',
            cost: serviceCost.toString(),
            status: 'success',
            description: `Sử dụng voucher freeship: ${voucherCode}`,
            metadata: JSON.stringify({
              voucherCode,
              voucherId,
              serviceCost,
              usageId: newUsage.id,
              idempotencyKey
            })
          });
        
        return {
          success: true,
          usage: newUsage,
          transaction: newTransaction,
          balanceAfter: newBalance,
          message: `Thành công! Đã trừ ${serviceCost.toLocaleString('vi-VN')} VND`
        };
        
      } catch (error: any) {
        // Transaction will auto-rollback on throw
        console.error('Atomic freeship voucher usage failed:', error);
        
        // 🔒 FALLBACK AUDIT LOGGING - Guaranteed logging even on transaction rollback
        try {
          await this.createAuditLog({
            userId,
            action: 'FREESHIP_VOUCHER_USAGE_FAILED',
            description: `Freeship voucher usage failed - Voucher: ${voucherCode}, Service cost: ${serviceCost}₫, Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            ipAddress: 'unknown',
            afterData: JSON.stringify({
              voucherId,
              voucherCode,
              serviceCost,
              idempotencyKey,
              orderId: params.orderId,
              orderValue: params.orderValue,
              discountApplied: params.discountApplied,
              errorType: error instanceof Error ? error.constructor.name : 'UnknownError',
              errorMessage: error instanceof Error ? error.message : String(error)
            })
          });
        } catch (auditError) {
          console.error('Failed to create fallback audit log:', auditError);
        }
        
        throw error;
      }
    });
  }

  async updateFreeshipVoucherUsage(id: number, updates: Partial<FreeshipVoucherUsage>): Promise<FreeshipVoucherUsage | undefined> {
    const [usage] = await db
      .update(freeshipVoucherUsage)
      .set(updates)
      .where(eq(freeshipVoucherUsage.id, id))
      .returning();
    return usage || undefined;
  }

  // Email addition operations
  async getAllEmailAdditions(): Promise<EmailAddition[]> {
    return await db.select().from(emailAdditions).orderBy(desc(emailAdditions.createdAt));
  }

  async getEmailAdditionsByDateRange(startDate: Date, endDate: Date): Promise<EmailAddition[]> {
    return await db.select()
      .from(emailAdditions)
      .where(and(
        gte(emailAdditions.createdAt, startDate),
        lte(emailAdditions.createdAt, endDate)
      ))
      .orderBy(desc(emailAdditions.createdAt));
  }

  async getEmailAdditionsByUser(userId: number): Promise<EmailAddition[]> {
    return await db.select().from(emailAdditions).where(eq(emailAdditions.userId, userId)).orderBy(desc(emailAdditions.createdAt));
  }

  async createEmailAddition(addition: InsertEmailAddition & { userId: number }): Promise<EmailAddition> {
    const [newAddition] = await db
      .insert(emailAdditions)
      .values(addition)
      .returning();
    return newAddition;
  }

  async updateEmailAddition(id: number, updates: Partial<EmailAddition>): Promise<EmailAddition | undefined> {
    const [addition] = await db
      .update(emailAdditions)
      .set(updates)
      .where(eq(emailAdditions.id, id))
      .returning();
    return addition || undefined;
  }

  // getAllTransactions REMOVED - use getTransactionsWithFilter

  // OPTIMIZED: New filtered transactions query with pagination to reduce egress
  async getTransactionsWithFilter(options: {
    limit?: number;
    offset?: number;
    userId?: number;
    types?: string[];
    dateFrom?: Date;
    dateTo?: Date;
  } = {}): Promise<Transaction[]> {
    // Enforce hard maximum to prevent unbounded queries
    const { limit: requestedLimit = 100, offset = 0, userId, types, dateFrom, dateTo } = options;
    const limit = Math.min(requestedLimit, 5000); // Hard cap at 5000
    
    let query = db.select().from(transactions);
    
    // Apply filters
    const conditions = [];
    if (userId) conditions.push(eq(transactions.userId, userId));
    if (types && types.length > 0) {
      conditions.push(inArray(transactions.type, types));
    }
    if (dateFrom) conditions.push(sql`${transactions.createdAt} >= ${dateFrom.toISOString()}`);
    if (dateTo) conditions.push(sql`${transactions.createdAt} <= ${dateTo.toISOString()}`);
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }
    
    return await query
      .orderBy(desc(transactions.createdAt))
      .limit(limit)
      .offset(offset)
      .execute();
  }

  async getTransactionsByUser(userId: number, limit: number = 100, offset: number = 0): Promise<Transaction[]> {
    // EGRESS OPTIMIZATION: Add pagination to prevent loading massive datasets
    return await db.select().from(transactions)
      .where(eq(transactions.userId, userId))
      .orderBy(desc(transactions.createdAt))
      .limit(limit)
      .offset(offset);
  }

  async getTransactionsByUserAndTypes(userId: number, types: string[], limit: number = 100, offset: number = 0): Promise<Transaction[]> {
    // EGRESS OPTIMIZATION: Add pagination and improve query efficiency
    const result = await db.select().from(transactions)
      .where(and(
        eq(transactions.userId, userId),
        sql`${transactions.type} IN ('admin_credit', 'admin_debit')`
      ))
      .orderBy(desc(transactions.createdAt))
      .limit(limit)
      .offset(offset);
    
    return result;
  }

  async createTransaction(transaction: InsertTransaction & { 
    userId: number;
    adminNote?: string;
    skipBalanceUpdate?: boolean; // Flag to skip automatic balance update
  }, txOrDb?: any): Promise<Transaction> {
    // FIXED: Chỉ tính toán balance khi cả 2 giá trị đều KHÔNG được cung cấp
    // Nếu webhook hoặc caller đã cung cấp balance tracking chính xác thì LUÔN sử dụng
    let balanceBefore = transaction.balanceBefore;
    let balanceAfter = transaction.balanceAfter;
    
    // Chỉ auto-calculate khi cả 2 balance values đều undefined/null/empty
    if ((!balanceBefore || balanceBefore === '') && (!balanceAfter || balanceAfter === '')) {
      // Lấy số dư hiện tại từ database - đây là số dư TRƯỚC giao dịch
      const currentBalance = await this.getUserBalance(transaction.userId);
      const transactionAmount = parseFloat(transaction.amount.toString());
      
      // Số dư trước giao dịch
      balanceBefore = currentBalance.toString();
      // Số dư sau giao dịch = số dư trước + số tiền giao dịch
      balanceAfter = (currentBalance + transactionAmount).toString();
    }

    // Get database object to use (transaction or main db)
    const dbToUse = txOrDb || db;
    
    // 🔒 ATOMIC: Tạo giao dịch với idempotency protection - sử dụng ON CONFLICT để tránh duplicate 
    let newTransaction: Transaction;
    
    try {
      const [insertedTransaction] = await dbToUse
        .insert(transactions)
        .values({
          ...transaction,
          balanceBefore: balanceBefore?.toString() || '0',
          balanceAfter: balanceAfter?.toString() || '0',
          adminNote: transaction.adminNote
        })
        .returning();
      
      newTransaction = insertedTransaction;
    } catch (error: any) {
      // Handle duplicate reference (unique constraint violation)
      if (error?.code === '23505' && error?.constraint?.includes('reference')) {
        console.log(`[STORAGE] Transaction with reference ${transaction.reference} already exists - idempotency protection activated`);
        // Return existing transaction (this is idempotent behavior)
        const [existingTransaction] = await dbToUse
          .select()
          .from(transactions)
          .where(eq(transactions.reference, transaction.reference || ''))
          .limit(1);
        
        if (existingTransaction) {
          return existingTransaction;
        }
      }
      
      // Re-throw unexpected errors
      throw error;
    }

    // CRITICAL FIX: Tự động cập nhật số dư cho giao dịch top_up completed
    // Chỉ cập nhật nếu không được yêu cầu bỏ qua (để tránh cập nhật kép từ webhook)
    if (!transaction.skipBalanceUpdate && 
        transaction.type === 'top_up' && 
        transaction.status === 'completed') {
      
      const finalBalance = parseFloat(balanceAfter?.toString() || '0');
      console.log(`🔄 [AUTO-BALANCE] Cập nhật số dư cho user ${transaction.userId}: ${balanceBefore} → ${finalBalance} VND (Transaction ID: ${newTransaction.id})`);
      
      // Cập nhật số dư user mà không tạo transaction duplicate (không truyền adminUserId)
      await this.updateUserBalance(transaction.userId, finalBalance);
    }

    return newTransaction;
  }

  async updateTransaction(id: number, updates: Partial<Transaction>): Promise<Transaction | undefined> {
    const [transaction] = await db
      .update(transactions)
      .set(updates)
      .where(eq(transactions.id, id))
      .returning();
    return transaction || undefined;
  }

  async getTransactionByReference(reference: string): Promise<Transaction | undefined> {
    const [transaction] = await db
      .select()
      .from(transactions)
      .where(eq(transactions.reference, reference));
    return transaction || undefined;
  }

  // Service usage operations
  async getAllServiceUsage(): Promise<ServiceUsageHistory[]> {
    return await db.select().from(serviceUsageHistory).orderBy(desc(serviceUsageHistory.createdAt));
  }

  async getServiceUsageByUser(userId: number): Promise<ServiceUsageHistory[]> {
    return await db.select().from(serviceUsageHistory).where(eq(serviceUsageHistory.userId, userId)).orderBy(desc(serviceUsageHistory.createdAt));
  }

  async createServiceUsage(usage: InsertServiceUsage & { userId: number }): Promise<ServiceUsageHistory> {
    const [newUsage] = await db
      .insert(serviceUsageHistory)
      .values(usage)
      .returning();
    return newUsage;
  }

  // Service pricing operations
  async getAllServicePricing(): Promise<ServicePricing[]> {
    // 🚀 EGRESS OPT: Cache all service pricing (TTL 1 hour)
    const cacheKey = 'all_service_pricing';
    const cached = cache.get(cacheKey);
    if (cached) return cached;
    
    const pricing = await db.select().from(servicePricing).orderBy(servicePricing.serviceName);
    cache.set(cacheKey, pricing, 3600); // TTL 1 hour
    return pricing;
  }

  async getServicePricing(serviceType: string): Promise<ServicePricing | undefined> {
    // 🚀 EGRESS OPT: Cache individual service pricing (TTL 1 hour)
    const cacheKey = `service_pricing:${serviceType}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;
    
    const [pricing] = await db.select().from(servicePricing).where(eq(servicePricing.serviceType, serviceType));
    if (pricing) {
      cache.set(cacheKey, pricing, 3600); // TTL 1 hour
    }
    return pricing;
  }

  async requireServicePrice(serviceType: string): Promise<number> {
    const pricing = await this.getServicePricing(serviceType);
    
    if (!pricing) {
      console.error(`[PRICING ERROR] Service pricing not found for: ${serviceType}`);
      throw new Error(`Service pricing not configured for '${serviceType}'. Please add pricing configuration to database.`);
    }
    
    const price = parseFloat(pricing.price);
    if (isNaN(price) || price < 0) {
      console.error(`[PRICING ERROR] Invalid price for ${serviceType}: ${pricing.price}`);
      throw new Error(`Invalid price configured for '${serviceType}': ${pricing.price}. Price must be a valid positive number.`);
    }
    
    return price;
  }

  async createServicePricing(pricing: InsertServicePricing): Promise<ServicePricing> {
    const [newPricing] = await db
      .insert(servicePricing)
      .values({ ...pricing, createdAt: new Date(), updatedAt: new Date() })
      .returning();
    
    // 🚀 EGRESS OPT: Invalidate cache on create
    if (newPricing) {
      cache.delete(`service_pricing:${newPricing.serviceType}`);
      cache.delete('all_service_pricing');
    }
    
    return newPricing;
  }

  async updateServicePricing(id: number, updates: Partial<ServicePricing>): Promise<ServicePricing | undefined> {
    const [pricing] = await db
      .update(servicePricing)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(servicePricing.id, id))
      .returning();
    
    // 🚀 EGRESS OPT: Invalidate cache on update
    if (pricing) {
      cache.delete(`service_pricing:${pricing.serviceType}`);
      cache.delete('all_service_pricing');
    }
    
    return pricing || undefined;
  }

  async deleteServicePricing(id: number): Promise<boolean> {
    // Get pricing before delete to invalidate cache
    const [existingPricing] = await db.select().from(servicePricing).where(eq(servicePricing.id, id));
    
    const result = await db.delete(servicePricing).where(eq(servicePricing.id, id));
    
    // 🚀 EGRESS OPT: Invalidate cache on delete
    if (existingPricing) {
      cache.delete(`service_pricing:${existingPricing.serviceType}`);
      cache.delete('all_service_pricing');
    }
    
    return (result.rowCount || 0) > 0;
  }

  // System configuration operations
  async getAllSystemConfig(): Promise<SystemConfig[]> {
    return await db.select().from(systemConfig).orderBy(systemConfig.configKey);
  }

  async getSystemConfig(configKey: string): Promise<SystemConfig | undefined> {
    const [config] = await db.select().from(systemConfig).where(eq(systemConfig.configKey, configKey));
    return config;
  }

  async getSystemConfigByKey(configKey: string): Promise<SystemConfig | undefined> {
    // Alias for getSystemConfig for consistency
    return this.getSystemConfig(configKey);
  }

  async getSystemConfigById(id: number): Promise<SystemConfig | undefined> {
    const [config] = await db.select().from(systemConfig).where(eq(systemConfig.id, id));
    return config;
  }

  async getSystemConfigByType(configType: string): Promise<SystemConfig[]> {
    return await db.select().from(systemConfig).where(eq(systemConfig.configType, configType)).orderBy(systemConfig.configKey);
  }

  async createSystemConfig(config: InsertSystemConfig): Promise<SystemConfig> {
    const [newConfig] = await db
      .insert(systemConfig)
      .values({ ...config, createdAt: new Date(), updatedAt: new Date() })
      .returning();
    return newConfig;
  }

  async updateSystemConfig(id: number, updates: Partial<SystemConfig>): Promise<SystemConfig | undefined> {
    const [config] = await db
      .update(systemConfig)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(systemConfig.id, id))
      .returning();
    return config || undefined;
  }

  async deleteSystemConfig(id: number): Promise<boolean> {
    const result = await db.delete(systemConfig).where(eq(systemConfig.id, id));
    return (result.rowCount || 0) > 0;
  }

  // Analytics operations
  async getRevenueByPeriod(startDate: Date, endDate: Date): Promise<{ date: string; revenue: number; transactions: number }[]> {
    const result = await db
      .select({
        date: transactions.createdAt,
        amount: transactions.amount,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.status, 'completed'),
          sql`${transactions.createdAt} >= ${startDate}`,
          sql`${transactions.createdAt} <= ${endDate}`
        )
      )
      .orderBy(transactions.createdAt);

    // Group by date and calculate revenue
    const grouped = result.reduce((acc, row) => {
      const date = row.date.toISOString().split('T')[0];
      if (!acc[date]) {
        acc[date] = { revenue: 0, transactions: 0 };
      }
      acc[date].revenue += parseFloat(row.amount);
      acc[date].transactions += 1;
      return acc;
    }, {} as Record<string, { revenue: number; transactions: number }>);

    return Object.entries(grouped).map(([date, data]) => ({
      date,
      revenue: data.revenue,
      transactions: data.transactions,
    }));
  }

  async getUserTopUpHistory(userId?: number): Promise<{ userId: number; username: string; totalAmount: number; transactionCount: number }[]> {
    const query = db
      .select({
        userId: users.id,
        username: users.username,
        totalAmount: transactions.amount,
      })
      .from(transactions)
      .innerJoin(users, eq(transactions.userId, users.id))
      .where(
        and(
          eq(transactions.type, 'top_up'),
          eq(transactions.status, 'completed'),
          userId ? eq(transactions.userId, userId) : undefined
        )
      );

    const result = await query;
    
    // Group by user and calculate totals
    const grouped = result.reduce((acc, row) => {
      if (!acc[row.userId]) {
        acc[row.userId] = {
          userId: row.userId,
          username: row.username,
          totalAmount: 0,
          transactionCount: 0,
        };
      }
      acc[row.userId].totalAmount += parseFloat(row.totalAmount);
      acc[row.userId].transactionCount += 1;
      return acc;
    }, {} as Record<number, { userId: number; username: string; totalAmount: number; transactionCount: number }>);

    return Object.values(grouped);
  }

  // Phone Shopee Registry operations
  async getAllPhoneShopee(): Promise<PhoneShopee[]> {
    return await db.select().from(phoneShopee).orderBy(desc(phoneShopee.checkedAt));
  }

  async getPhoneShopee(phoneNumber: string): Promise<PhoneShopee | undefined> {
    const [phone] = await db.select().from(phoneShopee).where(eq(phoneShopee.phoneNumber, phoneNumber));
    return phone;
  }

  async getPhonesShopeeBatch(phoneNumbers: string[]): Promise<PhoneShopee[]> {
    if (phoneNumbers.length === 0) return [];
    return await db.select().from(phoneShopee).where(inArray(phoneShopee.phoneNumber, phoneNumbers));
  }

  async createPhoneShopee(insertPhone: InsertPhoneShopee): Promise<PhoneShopee> {
    const [phone] = await db
      .insert(phoneShopee)
      .values({
        ...insertPhone,
        checkedAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    return phone;
  }

  async updatePhoneShopee(phoneNumber: string, updates: Partial<PhoneShopee>): Promise<PhoneShopee | undefined> {
    const [phone] = await db
      .update(phoneShopee)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(phoneShopee.phoneNumber, phoneNumber))
      .returning();
    return phone;
  }

  // Bulk phone number checking with Shopee API - OPTIMIZED WITH PARALLEL PROCESSING
  async checkPhoneNumbers(phoneNumbers: string[], userId: number, ipAddress: string): Promise<{ 
    phoneNumber: string; 
    isRegistered: boolean; 
    alreadyInDatabase: boolean; 
    cost: number; 
  }[]> {
    const results: any[] = [];
    
    // Get phone check service pricing
    const pricing = await this.getServicePricing('phone_check');
    const checkCost = pricing ? parseFloat(pricing.price) : 100; // Default 100 VND
    
    // Pre-process: Normalize phone numbers
    const normalizedNumbers: { original: string; normalized: string | null }[] = [];
    const validNormalizedPhones: string[] = [];
    
    for (const phone of phoneNumbers) {
      const normalizedPhone = this.normalizePhoneNumber(phone);
      normalizedNumbers.push({ original: phone, normalized: normalizedPhone });
      if (normalizedPhone) {
        validNormalizedPhones.push(normalizedPhone);
      }
    }
    
    // Batch database lookup - get all existing phones in one query
    const existingPhones = await this.getPhonesShopeeBatch(validNormalizedPhones);
    const existingPhonesMap = new Map(existingPhones.map(p => [p.phoneNumber, p]));
    
    // Categorize phone numbers based on batch lookup results
    const categorizedNumbers: { original: string; normalized: string | null; needsCheck: boolean; existingData?: any }[] = [];
    
    for (const item of normalizedNumbers) {
      if (!item.normalized) {
        categorizedNumbers.push({ ...item, needsCheck: false });
        continue;
      }
      
      const existingPhone = existingPhonesMap.get(item.normalized);
      categorizedNumbers.push({
        original: item.original,
        normalized: item.normalized,
        needsCheck: !existingPhone,
        existingData: existingPhone
      });
    }
    
    // Count numbers that need API checking
    const numbersToCheck = categorizedNumbers.filter(n => n.needsCheck).length;
    
    // TRỪ TIỀN TRƯỚC - Deduct money upfront for new numbers to check
    const currentBalance = await this.getUserBalance(userId);
    const totalCost = numbersToCheck * checkCost;
    
    if (currentBalance < totalCost) {
      throw new Error(`Số dư không đủ. Cần ${totalCost.toLocaleString('vi-VN')} VND để kiểm tra ${numbersToCheck} số mới. Số dư hiện tại: ${currentBalance.toLocaleString('vi-VN')} VND.`);
    }

    // Deduct balance upfront if there are numbers to check
    if (numbersToCheck > 0) {
      const newBalance = currentBalance - totalCost;
      await this.updateUserBalance(userId, newBalance);
      
      // Create upfront transaction
      await this.createTransaction({
        userId,
        type: 'phone_check',
        amount: (-totalCost).toString(),
        description: `Kiểm tra ${numbersToCheck} số điện thoại (trừ tiền trước)`,
        status: 'completed'
      });
    }
    
    console.log(`[PARALLEL CHECK] Starting check for ${phoneNumbers.length} numbers: ${numbersToCheck} need API calls, ${categorizedNumbers.length - numbersToCheck} from cache`);
    const startTime = Date.now();
    
    // Process numbers in parallel batches for super-fast performance
    const BATCH_SIZE = 10; // Process 10 numbers simultaneously
    const DELAY_BETWEEN_BATCHES = 2000; // 2 seconds between batches
    
    let actualCost = 0;
    
    // Process all numbers in batches
    for (let i = 0; i < categorizedNumbers.length; i += BATCH_SIZE) {
      const batch = categorizedNumbers.slice(i, i + BATCH_SIZE);
      
      // Add delay between batches (except for first batch)
      if (i > 0) {
        console.log(`[PARALLEL CHECK] Waiting ${DELAY_BETWEEN_BATCHES}ms before next batch...`);
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
      }
      
      // Process batch in parallel using Promise.allSettled
      const batchResults = await Promise.allSettled(
        batch.map(async (item) => {
          // Handle invalid phone numbers
          if (!item.normalized) {
            return {
              phoneNumber: item.original,
              isRegistered: false,
              alreadyInDatabase: false,
              cost: 0,
              error: 'Số điện thoại không hợp lệ (phải là 9 chữ số)'
            };
          }
          
          // Return cached results
          if (!item.needsCheck && item.existingData) {
            // Create history record for database lookup
            await this.createPhoneCheck({
              phoneNumber: item.normalized,
              isRegistered: item.existingData.isRegistered,
              cost: 0,
              userId
            });
            
            return {
              phoneNumber: item.normalized,
              isRegistered: item.existingData.isRegistered,
              alreadyInDatabase: true,
              cost: 0
            };
          }
          
          // Perform API check with retry
          let isRegistered = false;
          let checkError = null;
          let costForThisNumber = checkCost; // Default cost
          
          try {
            isRegistered = await this.checkShopeeRegistrationWithRetry(item.normalized!, 3); // 3 retries for parallel processing
          } catch (error: any) {
            console.error(`[PARALLEL CHECK] Failed to check phone ${item.normalized} after retries:`, error);
            
            // Check if this is a rate limit error (429) - using error code instead of message matching
            if (error.code === 'RATE_LIMIT_429') {
              checkError = 'Rate limit - không trừ tiền';
              costForThisNumber = 0; // Don't charge for rate-limited numbers
              console.log(`[RATE LIMIT] Phone ${item.normalized} hit rate limit, setting cost to 0`);
            } else {
              checkError = 'Lỗi khi kiểm tra';
            }
            isRegistered = false;
          }
          
          // Calculate actual cost: only charge if not registered AND no rate limit
          const actualCost = !isRegistered && !checkError?.includes('Rate limit') ? costForThisNumber : 0;
          
          // Create phone check history record
          await this.createPhoneCheck({
            phoneNumber: item.normalized!,
            isRegistered,
            cost: actualCost,
            userId
          });
          
          // Only store registered numbers in phone_shopee table
          if (isRegistered) {
            try {
              await this.createPhoneShopee({
                phoneNumber: item.normalized!,
                isRegistered: true
              });
            } catch (dbError: any) {
              if (dbError.code !== '23505') {
                console.error(`Error storing phone ${item.normalized}:`, dbError);
              }
            }
          }
          
          return {
            phoneNumber: item.normalized!,
            isRegistered,
            alreadyInDatabase: false,
            cost: actualCost,
            error: checkError
          };
        })
      );
      
      // Collect results from batch
      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
          if (result.value.cost > 0) {
            actualCost += result.value.cost;
          }
        } else {
          console.error('[PARALLEL CHECK] Promise rejected:', result.reason);
          results.push({
            phoneNumber: 'unknown',
            isRegistered: false,
            alreadyInDatabase: false,
            cost: 0,
            error: 'Lỗi khi kiểm tra'
          });
        }
      }
      
      console.log(`[PARALLEL CHECK] Batch ${Math.floor(i / BATCH_SIZE) + 1} completed: ${batch.length} numbers processed`);
    }
    
    const endTime = Date.now();
    const totalTime = Math.round((endTime - startTime) / 1000);
    console.log(`[PARALLEL CHECK] Completed: ${phoneNumbers.length} numbers in ${totalTime}s (avg ${(totalTime / phoneNumbers.length).toFixed(2)}s per number)`);
    
    // HOÀN TIỀN NẾU CÓ CHÊNH LỆCH - Refund excess if any
    if (numbersToCheck > 0) {
      const refundAmount = totalCost - actualCost;
      if (refundAmount > 0) {
        const currentBalance = await this.getUserBalance(userId);
        await this.updateUserBalance(userId, currentBalance + refundAmount);
        
        // Create refund transaction
        await this.createTransaction({
          userId,
          type: 'refund',
          amount: refundAmount.toString(),
          description: `Hoàn tiền kiểm tra số điện thoại (${Math.floor(refundAmount/checkCost)} số không cần kiểm tra)`,
          status: 'completed'
        });
      }
      
      // Create service usage for actual cost
      if (actualCost > 0) {
        await this.createServiceUsage({
          userId,
          serviceType: 'phone_check',
          serviceName: 'Kiểm tra số điện thoại Shopee',
          description: `Kiểm tra ${Math.floor(actualCost/checkCost)} số điện thoại - Chưa đăng ký`,
          status: 'success',
          cost: actualCost.toString()
        });
      }
    }
    
    return results;
  }

  // Account check history operations
  async getAllAccountChecks(): Promise<AccountCheck[]> {
    return await db.select().from(accountChecks).orderBy(desc(accountChecks.createdAt));
  }

  async getAccountChecksByDateRange(startDate: Date, endDate: Date): Promise<AccountCheck[]> {
    return await db.select()
      .from(accountChecks)
      .where(and(
        gte(accountChecks.createdAt, startDate),
        lte(accountChecks.createdAt, endDate)
      ))
      .orderBy(desc(accountChecks.createdAt));
  }

  async getAccountChecksByUser(userId: number): Promise<AccountCheck[]> {
    return await db.select().from(accountChecks)
      .where(eq(accountChecks.userId, userId))
      .orderBy(desc(accountChecks.createdAt));
  }

  async createAccountCheck(check: InsertAccountCheck & { userId: number }): Promise<AccountCheck> {
    const [newCheck] = await db
      .insert(accountChecks)
      .values({ ...check, createdAt: new Date() })
      .returning();
    return newCheck;
  }

  async updateAccountCheckByCookie(userId: number, cookieId: string, updates: Partial<AccountCheck>): Promise<AccountCheck | undefined> {
    const [updatedCheck] = await db
      .update(accountChecks)
      .set({ ...updates, createdAt: new Date() })
      .where(and(
        eq(accountChecks.userId, userId),
        eq(accountChecks.cookieId, cookieId)
      ))
      .returning();
    return updatedCheck || undefined;
  }

  // Normalize phone number to 9 digits format
  // FIXED: Priority check length FIRST, then handle prefixes
  private normalizePhoneNumber(phone: string): string | null {
    // Remove all non-digit characters
    const digits = phone.replace(/\D/g, '');
    
    // Priority 1: If exactly 9 digits -> Valid Vietnamese phone, keep as-is
    if (digits.length === 9) {
      return digits;
    }
    
    // Priority 2: If 11 digits starting with 84 -> Remove 84 prefix
    if (digits.length === 11 && digits.startsWith('84')) {
      return digits.substring(2);
    }
    
    // Priority 3: If 10 digits starting with 0 -> Remove 0 prefix
    if (digits.length === 10 && digits.startsWith('0')) {
      return digits.substring(1);
    }
    
    // Invalid format
    return null;
  }

  // Check phone registration with Shopee API - WITH COOKIE RETRY FOR 429 ERRORS
  private async checkShopeeRegistrationWithRetry(phoneNumber: string, maxRetries: number = 2): Promise<boolean> {
    const usedProxies: string[] = []; // Track used proxies to avoid reusing them
    const usedCookiePairs: string[] = []; // Track used cookie pairs to avoid reusing them on 429
    
    let last429Error = false;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[RETRY] Attempt ${attempt}/${maxRetries} for phone ${phoneNumber}`);
        
        // Pass used proxies and cookie pairs to force different selection
        const result = await this.checkShopeeRegistration(phoneNumber, usedProxies, usedCookiePairs);
        
        // Track the cookie pair used
        if (!usedCookiePairs.includes(result.cookiePair)) {
          usedCookiePairs.push(result.cookiePair);
        }
        
        console.log(`[RETRY] Success on attempt ${attempt} for phone ${phoneNumber}: ${result.isRegistered}, Cookie Pair: ${result.cookiePair}`);
        return result.isRegistered;
      } catch (error: any) {
        console.error(`[RETRY] Attempt ${attempt}/${maxRetries} failed for phone ${phoneNumber}:`, error);
        
        // Track the cookie pair that caused the error
        if (error.cookiePair && !usedCookiePairs.includes(error.cookiePair)) {
          usedCookiePairs.push(error.cookiePair);
          console.log(`[COOKIE TRACKING] Added cookie pair ${error.cookiePair} to used list. Total used: [${usedCookiePairs.join(', ')}]`);
        }
        
        // Check if this is a 429 error
        const is429Error = error.message?.includes('429') || error.message?.includes('rate limit');
        
        if (is429Error) {
          last429Error = true;
          // For 429 errors, we want to retry with different cookie pair
          // Only retry if we have attempts left (max 2 cookie retries: 1 initial + 1 retry)
          if (attempt < maxRetries && usedCookiePairs.length < 2) {
            const retryDelay = 1000; // 1 second delay before trying with new cookie (reduced from 2s)
            console.log(`[429 COOKIE RETRY] Attempt ${attempt} got 429, waiting ${retryDelay}ms before retry with different cookie pair. Used cookie pairs: [${usedCookiePairs.join(', ')}]`);
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            continue;
          } else {
            // Reached max retries with 429 error, throw special error with code
            console.error(`[429 RATE LIMIT] Phone ${phoneNumber} still getting 429 after trying ${usedCookiePairs.length} different cookie pairs. Marking as rate limit.`);
            const error: any = new Error(`Rate limit exceeded after trying ${usedCookiePairs.length} cookie pairs`);
            error.code = 'RATE_LIMIT_429';
            throw error;
          }
        }
        
        // For non-429 errors, retry with shorter delay
        if (attempt < maxRetries) {
          const retryDelay = 500; // 0.5 second for other errors (reduced from 1s)
          console.log(`[FAST RETRY] Non-429 error, waiting ${retryDelay}ms before retry ${attempt + 1}`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          continue;
        }
        
        // If last attempt, throw
        if (attempt === maxRetries) {
          throw error;
        }
      }
    }
    
    // Should never reach here
    return false;
  }

  // Check phone registration with Shopee API
  private async checkShopeeRegistration(phoneNumber: string, excludeProxies: string[] = [], excludeCookiePairs: string[] = []): Promise<{ isRegistered: boolean; cookiePair: string }> {
    // Get random proxy and cookies with proxy and cookie exclusion for retries
    const proxyInfo = await this.getRandomProxyKey(excludeProxies);
    const cookies = await this.getRandomShopeeCookies(excludeCookiePairs);
    
    console.log(`[PROXY CHECK] Phone: ${phoneNumber}, Proxy: ${proxyInfo ? `${proxyInfo.type} Available` : 'None'}, Cookie Pair: ${cookies.pairNumber}`);
    
    if (!cookies.spcSt || !cookies.spcSession) {
      console.error('No valid cookies found for Shopee API check');
      return { isRegistered: false, cookiePair: cookies.pairNumber };
    }
    
    try {

      const url = "https://banhang.shopee.vn/api/onboarding/local_onboard/v1/vn_onboard/phone/check/";
      
      // Format phone number with country code
      const formattedPhone = `84${phoneNumber}`;
      
      const payload = {
        phone: formattedPhone,
        lang: "vi"
      };

      const headers = {
        "Host": "banhang.shopee.vn",
        "Sec-Ch-Ua-Platform": "\"Windows\"",
        "Accept-Language": "en-US,en;q=0.9",
        "Sec-Ch-Ua": "\"Chromium\";v=\"135\", \"Not-A.Brand\";v=\"8\"",
        "Sec-Ch-Ua-Mobile": "?0",
        "Sc-Fe-Session": "BB8D6ACC88EC85D2",
        "Accept": "application/json, text/plain, */*",
        "Sc-Fe-Ver": "21.94550",
        "Content-Type": "application/json;charset=UTF-8",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
        "Origin": "https://banhang.shopee.vn",
        "Sec-Fetch-Site": "same-origin",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Dest": "empty",
        "Referer": "https://banhang.shopee.vn/portal/vn-onboarding/form/291000/291100",
        "Accept-Encoding": "gzip, deflate, br",
        "Priority": "u=1, i",
        "Cookie": `SPC_ST=${cookies.spcSt}; SPC_SC_SESSION=${cookies.spcSession}`
      };

      let fetchOptions: any = {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      };

      // Track used proxy for retry exclusion
      if (proxyInfo && excludeProxies) {
        const proxyId = `${proxyInfo.type}:${proxyInfo.key.substring(0, 10)}`;
        if (!excludeProxies.includes(proxyId)) {
          excludeProxies.push(proxyId);
          console.log(`[PROXY TRACKING] Added proxy ${proxyId} to exclude list for future retries`);
        }
      }

      // Add proxy if available
      if (proxyInfo) {
        console.log(`[PROXY] Attempting to get proxy data for ${proxyInfo.type}: ${proxyInfo.key.substring(0, 10)}...`);
        const proxyData = await this.getProxyData(proxyInfo.key, proxyInfo.type);
        if (proxyData) {
          try {
            // Create proxy agent based on proxy type
            let agent;
            if (proxyData.type === 'http' || proxyData.type === 'https') {
              agent = new HttpsProxyAgent(`${proxyData.type}://${proxyData.ip}:${proxyData.port}`);
            } else if (proxyData.type === 'socks5') {
              agent = new SocksProxyAgent(`socks5://${proxyData.ip}:${proxyData.port}`);
            }
            
            if (agent) {
              fetchOptions.agent = agent;
              console.log(`[PROXY SUCCESS] Using ${proxyData.type} proxy: ${proxyData.ip}:${proxyData.port} for phone ${phoneNumber}`);
            }
          } catch (error) {
            console.error('[PROXY ERROR] Error setting up proxy agent:', error);
          }
        } else {
          console.log(`[PROXY FAILED] No proxy data available for ${proxyInfo.type}: ${proxyInfo.key.substring(0, 10)}..., trying HTTP proxy fallback`);
          
          // Try HTTP proxy fallback
          const httpProxy = await this.getHttpProxyFallback();
          if (httpProxy) {
            console.log(`[HTTP_PROXY] Using fallback proxy: ${httpProxy.ip}:${httpProxy.port}`);
            try {
              const { HttpsProxyAgent } = await import('https-proxy-agent');
              const proxyUrl = httpProxy.username && httpProxy.password 
                ? `http://${httpProxy.username}:${httpProxy.password}@${httpProxy.ip}:${httpProxy.port}`
                : `http://${httpProxy.ip}:${httpProxy.port}`;
              fetchOptions.agent = new HttpsProxyAgent(proxyUrl);
              console.log(`[HTTP_PROXY] Successfully configured fallback proxy for phone ${phoneNumber}`);
            } catch (error) {
              console.error('[HTTP_PROXY] Error setting up HTTP proxy agent:', error);
            }
          } else {
            console.log('[HTTP_PROXY] No HTTP proxy available, making direct request');
          }
        }
      } else {
        console.log('[PROXY] No proxy key available, trying HTTP proxy fallback');
        
        // Try HTTP proxy fallback for direct requests too
        const httpProxy = await this.getHttpProxyFallback();
        if (httpProxy) {
          console.log(`[HTTP_PROXY] Using fallback proxy: ${httpProxy.ip}:${httpProxy.port}`);
          try {
            const { HttpsProxyAgent } = await import('https-proxy-agent');
            const proxyUrl = httpProxy.username && httpProxy.password 
              ? `http://${httpProxy.username}:${httpProxy.password}@${httpProxy.ip}:${httpProxy.port}`
              : `http://${httpProxy.ip}:${httpProxy.port}`;
            fetchOptions.agent = new HttpsProxyAgent(proxyUrl);
            console.log(`[HTTP_PROXY] Successfully configured fallback proxy for phone ${phoneNumber}`);
          } catch (error) {
            console.error('[HTTP_PROXY] Error setting up HTTP proxy agent:', error);
          }
        } else {
          console.log('[HTTP_PROXY] No HTTP proxy available, making direct request');
        }
      }

      // Add timeout to prevent hanging on slow Shopee API
      const response = await fetch(url, {
        ...fetchOptions,
        timeout: 5000 // 5 second timeout for Shopee API (reduced from 8s)
      } as any);
      const responseText = await response.text();
      
      console.log(`[SHOPEE API] Phone check response for ${phoneNumber}: ${response.status} - ${responseText.substring(0, 100)}`);

      // Handle rate limiting (429) specifically
      if (response.status === 429) {
        console.error(`[RATE_LIMIT] 429 Too Many Requests for phone ${phoneNumber} with cookie pair ${cookies.pairNumber}`);
        const error: any = new Error(`Rate limit exceeded (429) for phone ${phoneNumber}`);
        error.cookiePair = cookies.pairNumber; // Attach cookie pair info to error
        throw error;
      }
      
      // Handle other HTTP errors
      if (response.status >= 500) {
        console.error(`[SERVER_ERROR] ${response.status} server error for phone ${phoneNumber}`);
        throw new Error(`Server error (${response.status}) for phone ${phoneNumber}`);
      }

      if (response.status === 200) {
        if (responseText.toLowerCase().includes("ok")) {
          console.log(`[SHOPEE API] Phone ${phoneNumber} - Not registered (200 + OK)`);
          return { isRegistered: false, cookiePair: cookies.pairNumber }; // Phone is available (not registered)
        } else {
          console.log(`[SHOPEE API] Phone ${phoneNumber} - Already registered (200 without OK)`);
          return { isRegistered: true, cookiePair: cookies.pairNumber }; // Phone is already registered
        }
      } else if (response.status === 400) {
        if (responseText.toLowerCase().includes("số điện thoại này đã được sử dụng")) {
          console.log(`[SHOPEE API] Phone ${phoneNumber} - Already registered (400 response)`);
          return { isRegistered: true, cookiePair: cookies.pairNumber }; // Phone is already registered
        }
      } else if (response.status === 403) {
        // 403 = token/cookie invalid or expired - treat as ERROR to skip number for safety
        console.log(`[SHOPEE API] Phone ${phoneNumber} - Cookie/token error (403), marking as registered to skip`);
        return { isRegistered: true, cookiePair: cookies.pairNumber }; // Treat as registered to skip unsafe numbers
      }
      
      // SAFE DEFAULT: Unknown status = treat as registered to avoid giving wrong numbers
      console.log(`[SHOPEE API] Phone ${phoneNumber} - Unknown status (${response.status}), treating as REGISTERED for safety`);
      return { isRegistered: true, cookiePair: cookies.pairNumber }; // Safe default: skip unknown status
      
    } catch (error) {
      console.error(`Error checking Shopee registration for ${phoneNumber}:`, error);
      throw error; // Re-throw error to be handled by retry logic
    }
  }

  // Public method to check Shopee registration for external APIs - WITH RETRY AND COOKIE ROTATION
  async checkPhoneShopeeRegistration(phoneNumber: string): Promise<{ isRegistered: boolean; error?: string }> {
    try {
      // Normalize phone number first
      const normalizedPhone = this.normalizePhoneNumber(phoneNumber);
      if (!normalizedPhone) {
        return { isRegistered: false, error: "Invalid phone number format" };
      }

      console.log(`[EXTERNAL API SHOPEE CHECK] Checking phone: ${normalizedPhone} with retry logic`);
      
      // Use the retry method with max 2 attempts (1 initial + 1 retry for faster response)
      const isRegistered = await this.checkShopeeRegistrationWithRetry(normalizedPhone, 2);
      
      return { isRegistered };
    } catch (error: any) {
      console.error(`[EXTERNAL API SHOPEE CHECK] Error checking phone ${phoneNumber}:`, error);
      
      // Check if this is a rate limit error (429) - using error code instead of message matching
      if (error.code === 'RATE_LIMIT_429') {
        return { isRegistered: false, error: 'Rate limit - không trừ tiền' };
      }
      
      // SAFE DEFAULT: Any other error = treat as registered to skip number for safety
      console.error(`[SAFETY] Treating phone ${phoneNumber} as REGISTERED due to error: ${error.message}`);
      return { isRegistered: true, error: error.message };
    }
  }

  // Get random proxy key from system config with key name - ENHANCED WITH EXCLUSION SUPPORT
  private async getRandomProxyKey(excludeProxies: string[] = []): Promise<{key: string, type: string} | null> {
    const proxyConfigs = await db.select()
      .from(systemConfig)
      .where(and(
        eq(systemConfig.configType, 'proxy_key'),
        eq(systemConfig.isActive, true)
      ));
    
    if (proxyConfigs.length === 0) return null;
    
    // Filter out excluded proxies
    const availableConfigs = proxyConfigs.filter(config => 
      !excludeProxies.includes(`${config.configKey}:${config.configValue.substring(0, 10)}`)
    );
    
    // If all proxies are excluded, return any available proxy (fallback)
    const configsToUse = availableConfigs.length > 0 ? availableConfigs : proxyConfigs;
    
    const randomIndex = Math.floor(Math.random() * configsToUse.length);
    const selectedConfig = configsToUse[randomIndex];
    
    console.log(`[PROXY SELECTION] Available: ${proxyConfigs.length}, After exclusion: ${availableConfigs.length}, Selected: ${selectedConfig.configKey}`);
    
    return {
      key: selectedConfig.configValue,
      type: selectedConfig.configKey // 'fproxy_key' or 'wwproxy_key'
    };
  }

  // Get Shopee cookies from system config - RANDOM PAIR SELECTION TO AVOID 429
  private async getRandomShopeeCookies(excludePairs: string[] = []): Promise<{ spcSt: string; spcSession: string; pairNumber: string }> {
    try {
      // Get all SPC_ST cookies (both _check and _pair patterns) to find available pairs
      const spcStConfigs = await db.select()
        .from(systemConfig)
        .where(and(
          sql`(${systemConfig.configKey} LIKE 'SPC_ST_check%' OR ${systemConfig.configKey} LIKE 'SPC_ST_pair_%')`,
          eq(systemConfig.isActive, true)
        ));

      if (spcStConfigs.length === 0) {
        // Fallback to old format for backward compatibility
        const [oldSpcSt] = await db.select()
          .from(systemConfig)
          .where(and(
            eq(systemConfig.configKey, 'SPC_ST_check'),
            eq(systemConfig.isActive, true)
          ));
        
        const [oldSpcSession] = await db.select()
          .from(systemConfig)
          .where(and(
            eq(systemConfig.configKey, 'SPC_SC_SESSION_check'),
            eq(systemConfig.isActive, true)
          ));
        
        if (oldSpcSt && oldSpcSession) {
          console.log(`[COOKIE] Using old format cookies (no pair numbers)`);
          return {
            spcSt: oldSpcSt.configValue,
            spcSession: oldSpcSession.configValue,
            pairNumber: 'default'
          };
        }
        
        throw new Error('Vui lòng liên hệ admin để cấu hình cookies Shopee (SPC_ST_check_X và SPC_SC_SESSION_check_X)');
      }

      // Extract pair numbers and verify completeness (both cookies must exist)
      const pairNumbersSet = new Set<string>();
      for (const config of spcStConfigs) {
        // Match both _check_X and _pair_X patterns
        const pairMatch = config.configKey.match(/_(check|pair)_(\d+)$/);
        if (pairMatch) {
          pairNumbersSet.add(pairMatch[2]); // Get the number part
        } else if (config.configKey === 'SPC_ST_check') {
          pairNumbersSet.add(''); // Old format without number
        }
      }

      // Get all SPC_SC_SESSION cookies (both _check and _pair patterns) to verify pairs
      const spcSessionConfigs = await db.select()
        .from(systemConfig)
        .where(and(
          sql`(${systemConfig.configKey} LIKE 'SPC_SC_SESSION_check%' OR ${systemConfig.configKey} LIKE 'SPC_SC_SESSION_pair_%')`,
          eq(systemConfig.isActive, true)
        ));

      // Build list of COMPLETE pairs only (both SPC_ST and SPC_SC_SESSION exist)
      const completePairs: string[] = [];
      for (const pairNum of pairNumbersSet) {
        // Check both _check and _pair patterns
        const sessionKeyCheck = pairNum ? `SPC_SC_SESSION_check_${pairNum}` : 'SPC_SC_SESSION_check';
        const sessionKeyPair = pairNum ? `SPC_SC_SESSION_pair_${pairNum}` : '';
        const hasSession = spcSessionConfigs.some(c => c.configKey === sessionKeyCheck || c.configKey === sessionKeyPair);
        
        if (hasSession) {
          completePairs.push(pairNum);
          console.log(`[COOKIE] Complete pair found: ${pairNum || 'default'}`);
        } else {
          console.warn(`[COOKIE] Incomplete pair skipped: ${pairNum || 'default'} (missing SPC_SC_SESSION)`);
        }
      }

      if (completePairs.length === 0) {
        throw new Error('Không tìm thấy cặp cookie hoàn chỉnh. Vui lòng đảm bảo mỗi cặp có cả SPC_ST_check_X và SPC_SC_SESSION_check_X');
      }

      // Filter out excluded pairs
      const availablePairs = completePairs.filter(pair => !excludePairs.includes(pair));
      
      // If all pairs are excluded, use any available pair (fallback)
      const pairsToUse = availablePairs.length > 0 ? availablePairs : completePairs;
      
      console.log(`[COOKIE] Available pairs: ${completePairs.length}, After exclusion: ${availablePairs.length}, Excluded: [${excludePairs.join(', ')}]`);

      // Random select a complete pair
      const randomPairNumber = pairsToUse[Math.floor(Math.random() * pairsToUse.length)];

      console.log(`[COOKIE] Selected complete pair ${randomPairNumber || 'default'} from ${pairsToUse.length} available complete pairs`);

      // Get the selected pair (supports both _check and _pair patterns)
      const spcStConfig = await db.select()
        .from(systemConfig)
        .where(and(
          randomPairNumber 
            ? sql`(${systemConfig.configKey} = ${'SPC_ST_check_' + randomPairNumber} OR ${systemConfig.configKey} = ${'SPC_ST_pair_' + randomPairNumber})`
            : eq(systemConfig.configKey, 'SPC_ST_check'),
          eq(systemConfig.isActive, true)
        ))
        .limit(1);

      const spcSessionConfig = await db.select()
        .from(systemConfig)
        .where(and(
          randomPairNumber
            ? sql`(${systemConfig.configKey} = ${'SPC_SC_SESSION_check_' + randomPairNumber} OR ${systemConfig.configKey} = ${'SPC_SC_SESSION_pair_' + randomPairNumber})`
            : eq(systemConfig.configKey, 'SPC_SC_SESSION_check'),
          eq(systemConfig.isActive, true)
        ))
        .limit(1);

      if (!spcStConfig[0] || !spcSessionConfig[0]) {
        console.error(`[COOKIE] Critical error: Verified pair ${randomPairNumber} is missing cookies`);
        throw new Error(`Lỗi nghiêm trọng: Cặp cookie ${randomPairNumber} không đầy đủ`);
      }

      return {
        spcSt: spcStConfig[0].configValue,
        spcSession: spcSessionConfig[0].configValue,
        pairNumber: randomPairNumber || 'default'
      };
    } catch (error) {
      console.error('Error getting system config cookies:', error);
      throw error;
    }
  }

  // Get proxy data with IP, port, and type
  private async getProxyData(proxyKey: string, keyType: string): Promise<{ip: string, port: string, type: string} | null> {
    console.log(`[PROXY_DATA] Starting getProxyData for ${keyType}: ${proxyKey.substring(0, 10)}..., length: ${proxyKey.length}`);
    try {
      // Use config_key to determine proxy type
      if (keyType === 'wwproxy_key') {
        console.log(`[PROXY_DATA] Using wwproxy API`);
        // This is wwproxy
        console.log(`[WWPROXY] Trying wwproxy API with key: ${proxyKey.substring(0, 10)}...`);
        
        // First try available endpoint
        try {
          const url = `https://wwproxy.com/api/client/proxy/available?key=${proxyKey}&provinceId=-1`;
          console.log(`[WWPROXY] Requesting available: ${url}`);
          const response = await fetch(url);
          const responseText = await response.text();
          console.log(`[WWPROXY] Available response status: ${response.status}, body: ${responseText}`);
          
          if (response.ok && responseText) {
            try {
              const data = JSON.parse(responseText);
              console.log(`[WWPROXY] Available parsed data:`, data);
              if (data.status === 'OK' && data.data && data.data.ipAddress && data.data.port) {
                console.log(`[WWPROXY] Success with available - IP: ${data.data.ipAddress}, Port: ${data.data.port}`);
                return {
                  ip: data.data.ipAddress,
                  port: data.data.port.toString(),
                  type: 'http'
                };
              }
            } catch (parseError) {
              console.error(`[WWPROXY] Available JSON parse error:`, parseError);
            }
          }
        } catch (error) {
          console.error(`[WWPROXY] Available endpoint error:`, error);
        }
        
        // If available failed, try current
        try {
          const url2 = `https://wwproxy.com/api/client/proxy/current?key=${proxyKey}`;
          console.log(`[WWPROXY] Trying current fallback: ${url2}`);
          const response2 = await fetch(url2);
          const responseText2 = await response2.text();
          console.log(`[WWPROXY] Current response status: ${response2.status}, body: ${responseText2}`);
          
          if (response2.ok && responseText2) {
            try {
              const data = JSON.parse(responseText2);
              console.log(`[WWPROXY] Current parsed data:`, data);
              if (data.status === 'OK' && data.data && data.data.ipAddress && data.data.port) {
                console.log(`[WWPROXY] Success with current - IP: ${data.data.ipAddress}, Port: ${data.data.port}`);
                return {
                  ip: data.data.ipAddress,
                  port: data.data.port.toString(),
                  type: 'http'
                };
              }
            } catch (parseError2) {
              console.error(`[WWPROXY] Current JSON parse error:`, parseError2);
            }
          }
        } catch (error2) {
          console.error(`[WWPROXY] Current endpoint error:`, error2);
        }
        
        console.log(`[WWPROXY] Both available and current failed for key: ${proxyKey.substring(0, 10)}...`);
      } else if (keyType === 'fproxy_key') {
        console.log(`[PROXY_DATA] Using fproxy API`);
        // This is fproxy - first try getnew, then getcurrent if failed
        console.log(`[FPROXY] Trying fproxy API with key: ${proxyKey.substring(0, 10)}...`);
        
        // First try getnew
        try {
          const url = `https://fproxy.me/api/getnew?api_key=${proxyKey}&location=&ip_allow=`;
          console.log(`[FPROXY] Requesting getnew: ${url}`);
          const response = await fetch(url);
          const responseText = await response.text();
          console.log(`[FPROXY] Getnew response status: ${response.status}, body: ${responseText}`);
          
          if (response.ok && responseText) {
            try {
              const data = JSON.parse(responseText);
              console.log(`[FPROXY] Getnew parsed data:`, data);
              if (data.success && data.data && data.data.ip && data.data.port) {
                console.log(`[FPROXY] Success with getnew - IP: ${data.data.ip}, Port: ${data.data.port}`);
                return {
                  ip: data.data.ip,
                  port: data.data.port.toString(),
                  type: 'http'
                };
              }
            } catch (parseError) {
              console.error(`[FPROXY] Getnew JSON parse error:`, parseError);
            }
          }
        } catch (error) {
          console.error(`[FPROXY] Getnew endpoint error:`, error);
        }
        
        // If getnew failed, try getcurrent
        try {
          const url2 = `https://fproxy.me/api/getcurrent?api_key=${proxyKey}`;
          console.log(`[FPROXY] Trying getcurrent fallback: ${url2}`);
          const response2 = await fetch(url2);
          const responseText2 = await response2.text();
          console.log(`[FPROXY] Getcurrent response status: ${response2.status}, body: ${responseText2}`);
          
          if (response2.ok && responseText2) {
            try {
              const data = JSON.parse(responseText2);
              console.log(`[FPROXY] Getcurrent parsed data:`, data);
              if (data.success && data.data && data.data.ip && data.data.port) {
                console.log(`[FPROXY] Success with getcurrent - IP: ${data.data.ip}, Port: ${data.data.port}`);
                return {
                  ip: data.data.ip,
                  port: data.data.port.toString(),
                  type: 'http'
                };
              }
            } catch (parseError2) {
              console.error(`[FPROXY] Getcurrent JSON parse error:`, parseError2);
            }
          }
        } catch (error2) {
          console.error(`[FPROXY] Getcurrent endpoint error:`, error2);
        }
        
        console.log(`[FPROXY] Both getnew and getcurrent failed for key: ${proxyKey.substring(0, 10)}...`);
      }
    } catch (error) {
      console.error('Error getting proxy data:', error);
    }
    
    return null;
  }

  // Get HTTP proxy fallback
  private async getHttpProxyFallback(): Promise<{ip: string, port: string, username?: string, password?: string} | null> {
    try {
      const activeProxies = await db
        .select()
        .from(httpProxies)
        .where(eq(httpProxies.isActive, true));
      
      if (activeProxies.length === 0) {
        console.log('[HTTP_PROXY] No active HTTP proxies available');
        return null;
      }
      
      // Select random proxy
      const randomProxy = activeProxies[Math.floor(Math.random() * activeProxies.length)];
      
      // Update usage count
      await db
        .update(httpProxies)
        .set({ 
          totalUsage: randomProxy.totalUsage + 1,
          lastUsed: new Date()
        })
        .where(eq(httpProxies.id, randomProxy.id));
      
      console.log(`[HTTP_PROXY] Selected proxy: ${randomProxy.ip}:${randomProxy.port}`);
      
      return {
        ip: randomProxy.ip,
        port: randomProxy.port.toString(),
        username: randomProxy.username || undefined,
        password: randomProxy.password || undefined
      };
    } catch (error) {
      console.error('[HTTP_PROXY] Error getting HTTP proxy:', error);
      return null;
    }
  }

  async getAllCookieExtractions(): Promise<CookieExtraction[]> {
    return await db.select().from(cookieExtractions).orderBy(desc(cookieExtractions.createdAt));
  }

  async getCookieExtractionsByDateRange(startDate: Date, endDate: Date): Promise<CookieExtraction[]> {
    return await db.select()
      .from(cookieExtractions)
      .where(and(
        gte(cookieExtractions.createdAt, startDate),
        lte(cookieExtractions.createdAt, endDate)
      ))
      .orderBy(desc(cookieExtractions.createdAt));
  }

  async getCookieExtractionsByUser(userId: number): Promise<CookieExtraction[]> {
    return await db.select().from(cookieExtractions)
      .where(eq(cookieExtractions.userId, userId))
      .orderBy(desc(cookieExtractions.createdAt));
  }

  async createCookieExtraction(extraction: InsertCookieExtraction & { userId: number }): Promise<CookieExtraction> {
    const [created] = await db.insert(cookieExtractions)
      .values(extraction)
      .returning();
    return created;
  }

  async getAllSpcFExtractions(): Promise<SpcFExtraction[]> {
    return await db.select().from(spcFExtractions).orderBy(desc(spcFExtractions.createdAt));
  }

  async getSpcFExtractionsByUser(userId: number): Promise<SpcFExtraction[]> {
    return await db.select().from(spcFExtractions)
      .where(eq(spcFExtractions.userId, userId))
      .orderBy(desc(spcFExtractions.createdAt));
  }

  async createSpcFExtraction(extraction: InsertSpcFExtraction & { userId: number }): Promise<SpcFExtraction> {
    const [created] = await db.insert(spcFExtractions)
      .values(extraction)
      .returning();
    return created;
  }

  // DUPLICATE REMOVED: Keeping only the optimized version above with page/limit signature

  async getPhoneRentalHistoryByUser(userId: number, limit: number = 100, offset: number = 0): Promise<PhoneRentalHistory[]> {
    // EGRESS OPTIMIZATION: Add pagination to prevent loading massive user history
    return await db.select().from(phoneRentalHistory)
      .where(eq(phoneRentalHistory.userId, userId))
      .orderBy(desc(phoneRentalHistory.createdAt))
      .limit(limit)
      .offset(offset);
  }

  async getPhoneRentalHistoryBySession(sessionId: string): Promise<PhoneRentalHistory | undefined> {
    const [record] = await db.select().from(phoneRentalHistory)
      .where(eq(phoneRentalHistory.sessionId, sessionId));
    return record;
  }

  async createPhoneRentalHistory(history: InsertPhoneRentalHistory & { userId: number }): Promise<PhoneRentalHistory> {
    // Check for duplicate sessionId to prevent race condition duplicates
    const existingSession = await this.getPhoneRentalHistoryBySession(history.sessionId);
    if (existingSession) {
      console.log(`[DUPLICATE PREVENTION] Session ${history.sessionId} already exists, returning existing record`);
      return existingSession;
    }
    
    const [created] = await db.insert(phoneRentalHistory)
      .values(history)
      .returning();
    return created;
  }

  async updatePhoneRentalHistory(sessionId: string, updates: Partial<PhoneRentalHistory>): Promise<PhoneRentalHistory | undefined> {
    const [updated] = await db.update(phoneRentalHistory)
      .set(updates)
      .where(eq(phoneRentalHistory.sessionId, sessionId))
      .returning();
    return updated;
  }

  // Enhanced refund tracking methods implementation
  async markPhoneRentalRefundProcessed(sessionId: string, txOrDb?: any): Promise<boolean> {
    try {
      // Get database object to use (transaction or main db)
      const dbToUse = txOrDb || db;
      
      // 🚨 CRITICAL FIX: CAS (Compare-And-Swap) pattern to prevent race conditions
      // Only mark if refund_processed is currently false/null
      const [updated] = await dbToUse.update(phoneRentalHistory)
        .set({
          refundProcessed: true,
          refundProcessedAt: new Date()
        })
        .where(and(
          eq(phoneRentalHistory.sessionId, sessionId),
          sql`(${phoneRentalHistory.refundProcessed} = false OR ${phoneRentalHistory.refundProcessed} IS NULL)` // ATOMIC: Only update if not already processed
        ))
        .returning();
      return !!updated; // Returns false if already processed
    } catch (error) {
      console.error(`Error marking phone rental refund processed for session ${sessionId}:`, error);
      return false;
    }
  }

  async isPhoneRentalRefundProcessed(sessionId: string): Promise<boolean> {
    try {
      const [session] = await db.select({ refundProcessed: phoneRentalHistory.refundProcessed })
        .from(phoneRentalHistory)
        .where(eq(phoneRentalHistory.sessionId, sessionId));
      return session?.refundProcessed || false;
    } catch (error) {
      console.error(`Error checking phone rental refund status for session ${sessionId}:`, error);
      return false;
    }
  }

  async markTiktokRentalRefundProcessed(sessionId: string, txOrDb?: any): Promise<boolean> {
    try {
      // Get database object to use (transaction or main db)
      const dbToUse = txOrDb || db;
      
      // 🚨 CRITICAL FIX: CAS (Compare-And-Swap) pattern to prevent race conditions
      // Only mark if refund_processed is currently false/null
      const [updated] = await dbToUse.update(tiktokRentals)
        .set({
          refundProcessed: true,
          refundProcessedAt: new Date()
        })
        .where(and(
          eq(tiktokRentals.sessionId, sessionId),
          sql`(${tiktokRentals.refundProcessed} = false OR ${tiktokRentals.refundProcessed} IS NULL)` // ATOMIC: Only update if not already processed
        ))
        .returning();
      return !!updated; // Returns false if already processed
    } catch (error) {
      console.error(`Error marking TikTok rental refund processed for session ${sessionId}:`, error);
      return false;
    }
  }

  async isTiktokRentalRefundProcessed(sessionId: string): Promise<boolean> {
    try {
      const [session] = await db.select({ refundProcessed: tiktokRentals.refundProcessed })
        .from(tiktokRentals)
        .where(eq(tiktokRentals.sessionId, sessionId));
      return session?.refundProcessed || false;
    } catch (error) {
      console.error(`Error checking TikTok rental refund status for session ${sessionId}:`, error);
      return false;
    }
  }

  async getActivePhoneRentalSessions(userId: number, limit: number = 50): Promise<PhoneRentalHistory[]> {
    // EGRESS OPTIMIZATION: Add limit for active sessions (users rarely have many active)
    return await db.select()
      .from(phoneRentalHistory)
      .where(and(
        eq(phoneRentalHistory.userId, userId),
        eq(phoneRentalHistory.status, 'waiting')
      ))
      .orderBy(desc(phoneRentalHistory.startTime))
      .limit(limit);
  }

  async getExpiredPhoneRentalSessions(userId: number, limit: number = 50): Promise<PhoneRentalHistory[]> {
    // EGRESS OPTIMIZATION: Add limit for expired sessions
    return await db.select()
      .from(phoneRentalHistory)
      .where(and(
        eq(phoneRentalHistory.userId, userId),
        eq(phoneRentalHistory.status, 'waiting'),
        sql`${phoneRentalHistory.expiresAt} < NOW()`
      ))
      .orderBy(desc(phoneRentalHistory.startTime))
      .limit(limit);
  }

  // API Keys operations
  async getAllApiKeys(): Promise<ApiKey[]> {
    const keys = await db.select().from(apiKeys)
      .orderBy(desc(apiKeys.createdAt));
    return keys.map(key => ({
      ...key,
      permissions: JSON.parse(key.permissions || '[]')
    })) as ApiKey[];
  }

  async getApiKeysByUser(userId: number): Promise<ApiKey[]> {
    const keys = await db.select().from(apiKeys)
      .where(eq(apiKeys.userId, userId))
      .orderBy(desc(apiKeys.createdAt));
    return keys.map(key => ({
      ...key,
      permissions: JSON.parse(key.permissions || '[]')
    })) as ApiKey[];
  }

  async getApiKeyByValue(keyValue: string): Promise<ApiKey | undefined> {
    const [apiKey] = await db.select().from(apiKeys)
      .where(and(eq(apiKeys.keyValue, keyValue), eq(apiKeys.isActive, true)));
    if (!apiKey) return undefined;
    return {
      ...apiKey,
      permissions: JSON.parse(apiKey.permissions || '[]')
    } as ApiKey;
  }

  async createApiKey(apiKey: InsertApiKey & { userId: number }): Promise<ApiKey> {
    const [created] = await db.insert(apiKeys)
      .values({
        userId: apiKey.userId,
        keyName: apiKey.keyName,
        keyValue: apiKey.keyValue,
        isActive: apiKey.isActive ?? true,
        permissions: JSON.stringify(apiKey.permissions || []),
        monthlyRequestLimit: apiKey.monthlyRequestLimit || 1000,
        requestCount: 0,
        dailyRequestCount: 0
      })
      .returning();
    
    // Parse permissions back to array for return
    return {
      ...created,
      permissions: JSON.parse(created.permissions || '[]')
    } as ApiKey;
  }

  async updateApiKey(id: number, updates: Partial<ApiKey>): Promise<ApiKey | undefined> {
    const updateData: any = { ...updates, updatedAt: new Date() };
    if (updates.permissions) {
      updateData.permissions = JSON.stringify(updates.permissions);
    }
    
    const [updated] = await db.update(apiKeys)
      .set(updateData)
      .where(eq(apiKeys.id, id))
      .returning();
    
    if (!updated) return undefined;
    
    return {
      ...updated,
      permissions: JSON.parse(updated.permissions || '[]')
    } as ApiKey;
  }

  async deleteApiKey(id: number): Promise<boolean> {
    const result = await db.delete(apiKeys)
      .where(eq(apiKeys.id, id));
    return (result.rowCount || 0) > 0;
  }

  async updateApiKeyUsage(keyValue: string): Promise<void> {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    // Get current API key to check if we need to reset daily count
    const [currentKey] = await db.select().from(apiKeys)
      .where(eq(apiKeys.keyValue, keyValue));
    
    if (!currentKey) return;
    
    let dailyCount = currentKey.dailyRequestCount;
    const lastReset = currentKey.lastResetDate ? new Date(currentKey.lastResetDate) : new Date(0);
    const lastResetDay = new Date(lastReset.getFullYear(), lastReset.getMonth(), lastReset.getDate());
    
    // Reset daily count if it's a new day
    if (today.getTime() !== lastResetDay.getTime()) {
      dailyCount = 0;
    }
    
    await db.update(apiKeys)
      .set({
        lastUsedAt: now,
        requestCount: sql`${apiKeys.requestCount} + 1`,
        dailyRequestCount: dailyCount + 1,
        lastResetDate: today
      })
      .where(eq(apiKeys.keyValue, keyValue));
  }

  // External API Keys Implementation
  async getAllExternalApiKeys(): Promise<ExternalApiKey[]> {
    return await db.select().from(externalApiKeys)
      .orderBy(desc(externalApiKeys.createdAt));
  }

  async getExternalApiKeysByUser(userId: number): Promise<ExternalApiKey[]> {
    return await db.select().from(externalApiKeys)
      .where(eq(externalApiKeys.userId, userId))
      .orderBy(desc(externalApiKeys.createdAt));
  }

  async getExternalApiKeyByUserAndProvider(userId: number, provider: string): Promise<ExternalApiKey | undefined> {
    const [key] = await db.select().from(externalApiKeys)
      .where(and(
        eq(externalApiKeys.userId, userId), 
        eq(externalApiKeys.provider, provider),
        eq(externalApiKeys.isActive, true)
      ));
    return key;
  }

  async createExternalApiKey(apiKey: InsertExternalApiKey & { userId: number }): Promise<ExternalApiKey> {
    const [created] = await db.insert(externalApiKeys)
      .values({
        userId: apiKey.userId,
        provider: apiKey.provider,
        keyName: apiKey.keyName,
        keyValue: apiKey.keyValue,
        isActive: apiKey.isActive ?? true
      })
      .returning();
    return created;
  }

  async updateExternalApiKey(id: number, updates: Partial<ExternalApiKey>): Promise<ExternalApiKey | undefined> {
    const updateData: any = { ...updates, updatedAt: new Date() };
    
    const [updated] = await db.update(externalApiKeys)
      .set(updateData)
      .where(eq(externalApiKeys.id, id))
      .returning();
    return updated;
  }

  async deleteExternalApiKey(id: number): Promise<boolean> {
    const result = await db.delete(externalApiKeys)
      .where(eq(externalApiKeys.id, id));
    return (result.rowCount || 0) > 0;
  }

  async updateExternalApiKeyBalance(id: number, balance: number, error?: string): Promise<void> {
    await db.update(externalApiKeys)
      .set({
        balance: balance.toString(),
        lastBalanceCheck: new Date(),
        balanceCheckError: error || null,
        updatedAt: new Date()
      })
      .where(eq(externalApiKeys.id, id));
  }

  // External API Rentals Implementation
  async getAllExternalApiRentals(): Promise<ExternalApiRental[]> {
    try {
      return await db.select().from(externalApiRentals)
        .orderBy(desc(externalApiRentals.createdAt));
    } catch (error: any) {
      // Temporary workaround for missing column error until database is synced
      if (error?.code === '42703' && error?.message?.includes('shopee_check_attempts')) {
        console.log('[STORAGE] Table structure not synced yet, returning empty array');
        return [];
      }
      throw error;
    }
  }

  async getExternalApiRentalsByUser(userId: number): Promise<ExternalApiRental[]> {
    try {
      return await db.select().from(externalApiRentals)
        .where(eq(externalApiRentals.userId, userId))
        .orderBy(desc(externalApiRentals.createdAt));
    } catch (error: any) {
      // Temporary workaround for missing column error until database is synced
      if (error?.code === '42703' && error?.message?.includes('shopee_check_attempts')) {
        console.log('[STORAGE] Table structure not synced yet, returning empty array');
        return [];
      }
      throw error;
    }
  }

  async getExternalApiRentalsByStatus(status: string): Promise<ExternalApiRental[]> {
    // 🚀 EGRESS OPTIMIZATION: Select only minimal columns needed for auto-charge processing
    try {
      return await db.select({
        id: externalApiRentals.id,
        sessionId: externalApiRentals.sessionId,
        userId: externalApiRentals.userId,
        provider: externalApiRentals.provider,
        phoneNumber: externalApiRentals.phoneNumber,
        status: externalApiRentals.status,
        otpCode: externalApiRentals.otpCode,
        providerRequestId: externalApiRentals.providerRequestId,
        createdAt: externalApiRentals.createdAt
      }).from(externalApiRentals)
        .where(eq(externalApiRentals.status, status))
        .orderBy(desc(externalApiRentals.createdAt));
    } catch (error: any) {
      // Temporary workaround for missing column error until database is synced
      if (error?.code === '42703' && error?.message?.includes('shopee_check_attempts')) {
        console.log('[STORAGE] Table structure not synced yet, returning empty array');
        return [];
      }
      throw error;
    }
  }

  async getExternalApiRental(sessionId: string): Promise<ExternalApiRental | undefined> {
    try {
      const [rental] = await db.select().from(externalApiRentals)
        .where(eq(externalApiRentals.sessionId, sessionId));
      return rental;
    } catch (error: any) {
      // Temporary workaround for missing column error until database is synced
      if (error?.code === '42703' && error?.message?.includes('shopee_check_attempts')) {
        console.log('[STORAGE] Table structure not synced yet, returning undefined');
        return undefined;
      }
      throw error;
    }
  }

  async createExternalApiRental(rental: InsertExternalApiRental & { userId: number }): Promise<ExternalApiRental> {
    try {
      const [created] = await db.insert(externalApiRentals)
        .values(rental)
        .returning();
      return created;
    } catch (error: any) {
      // Temporary workaround for missing column error until database is synced
      if (error?.code === '42703' && error?.message?.includes('shopee_check_attempts')) {
        console.log('[STORAGE] Table structure not synced, trying insert without problematic fields');
        // Strip out any fields that might be causing issues and try again with minimal data
        const minimalRental = {
          sessionId: rental.sessionId,
          userId: rental.userId,
          provider: rental.provider,
          status: rental.status || 'requested',
          createdAt: new Date(),
          updatedAt: new Date()
        };
        const [created] = await db.insert(externalApiRentals)
          .values(minimalRental)
          .returning();
        return created;
      }
      throw error;
    }
  }

  async updateExternalApiRental(sessionId: string, updates: Partial<ExternalApiRental>): Promise<ExternalApiRental | undefined> {
    const updateData: any = { ...updates, updatedAt: new Date() };
    
    const [updated] = await db.update(externalApiRentals)
      .set(updateData)
      .where(eq(externalApiRentals.sessionId, sessionId))
      .returning();
    return updated;
  }

  async deleteExternalApiRental(sessionId: string): Promise<boolean> {
    const result = await db.delete(externalApiRentals)
      .where(eq(externalApiRentals.sessionId, sessionId));
    return (result.rowCount || 0) > 0;
  }

  // Atomic charge function for OTP operations - ensures data integrity
  async chargeUserForOtp(params: {
    userId: number;
    amount: number;
    reference: string;
    description: string;
    metadata?: any;
  }): Promise<{ success: boolean; newBalance?: number; error?: string }> {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Lock user row and get current balance FIRST
      const userResult = await client.query(
        'SELECT balance FROM users WHERE id = $1 FOR UPDATE',
        [params.userId]
      );
      
      if (userResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return { success: false, error: 'User not found' };
      }
      
      // Check if transaction already exists (idempotency) AFTER acquiring lock
      const existingTxn = await client.query(
        'SELECT id, balance_after FROM transactions WHERE reference = $1 LIMIT 1',
        [params.reference]
      );
      
      if (existingTxn.rows.length > 0) {
        await client.query('ROLLBACK');
        return {
          success: true,
          newBalance: parseFloat(existingTxn.rows[0].balance_after),
          error: 'Already processed'
        };
      }
      
      const currentBalance = parseFloat(userResult.rows[0].balance);
      
      // Check if user has sufficient balance
      if (currentBalance < params.amount) {
        await client.query('ROLLBACK');
        return {
          success: false,
          error: `Insufficient balance. Current: ${currentBalance}, Required: ${params.amount}`
        };
      }
      
      const newBalance = currentBalance - params.amount;
      
      // Update user balance
      await client.query(
        'UPDATE users SET balance = $1, updated_at = NOW() WHERE id = $2',
        [newBalance, params.userId]
      );
      
      // Create transaction record with ON CONFLICT handling for extra safety
      try {
        await client.query(`
          INSERT INTO transactions (
            user_id, type, amount, description, status, reference,
            balance_before, balance_after, metadata, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
        `, [
          params.userId,
          'external_api_otp',
          -params.amount,
          params.description,
          'completed',
          params.reference,
          currentBalance,
          newBalance,
          JSON.stringify(params.metadata || {})
        ]);
      } catch (insertError: any) {
        // Handle potential duplicate reference conflicts
        if (insertError.code === '23505') { // unique_violation
          await client.query('ROLLBACK');
          // Re-query to get existing transaction balance
          const retryTxn = await client.query(
            'SELECT balance_after FROM transactions WHERE reference = $1 LIMIT 1',
            [params.reference]
          );
          return {
            success: true,
            newBalance: retryTxn.rows[0] ? parseFloat(retryTxn.rows[0].balance_after) : currentBalance,
            error: 'Already processed (conflict handled)'
          };
        }
        throw insertError;
      }
      
      await client.query('COMMIT');
      
      return {
        success: true,
        newBalance: newBalance
      };
      
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('[CHARGE-OTP] Rollback failed:', rollbackError);
      }
      console.error('[CHARGE-OTP] Transaction failed:', error);
      return {
        success: false,
        error: 'Transaction failed'
      };
    } finally {
      client.release();
    }
  }

  // Topup Requests Implementation
  async getAllTopupRequests(): Promise<TopupRequest[]> {
    return await db.select().from(topupRequests).orderBy(desc(topupRequests.createdAt));
  }

  async getTopupRequestsByUser(userId: number): Promise<TopupRequest[]> {
    return await db
      .select()
      .from(topupRequests)
      .where(eq(topupRequests.userId, userId))
      .orderBy(desc(topupRequests.createdAt));
  }

  async getTopupHistoryByUser(userId: number): Promise<TopupRequest[]> {
    return await db
      .select()
      .from(topupRequests)
      .where(eq(topupRequests.userId, userId))
      .orderBy(desc(topupRequests.createdAt));
  }

  async getTopupRequest(id: string): Promise<TopupRequest | undefined> {
    const [request] = await db
      .select()
      .from(topupRequests)
      .where(eq(topupRequests.id, id));
    return request || undefined;
  }

  async getPendingTopupRequests(userId: number): Promise<TopupRequest[]> {
    return await db
      .select()
      .from(topupRequests)
      .where(and(
        eq(topupRequests.userId, userId),
        eq(topupRequests.status, 'pending')
      ))
      .orderBy(desc(topupRequests.createdAt));
  }

  async createTopupRequest(request: InsertTopupRequest & { 
    userId: number; 
    id: string; 
    qrUrl: string; 
    expiresAt: Date;
    balanceBefore?: number;
    balanceAfter?: number;
    adminNote?: string;
  }): Promise<TopupRequest> {
    const [newRequest] = await db
      .insert(topupRequests)
      .values({
        id: request.id,
        userId: request.userId,
        amount: request.amount,
        description: request.description,
        qrUrl: request.qrUrl,
        expiresAt: request.expiresAt,
        balanceBefore: request.balanceBefore?.toString(),
        balanceAfter: request.balanceAfter?.toString(),
        adminNote: request.adminNote,
        status: 'pending'
      })
      .returning();
    return newRequest;
  }

  async updateTopupRequest(id: string, updates: Partial<TopupRequest>): Promise<TopupRequest | undefined> {
    const [updated] = await db
      .update(topupRequests)
      .set({
        ...updates,
        updatedAt: new Date()
      })
      .where(eq(topupRequests.id, id))
      .returning();
    return updated || undefined;
  }

  async expireOldTopupRequests(): Promise<void> {
    // Update expired requests to 'cancelled' status and log transaction records
    const expiredRequests = await db
      .select()
      .from(topupRequests)
      .where(and(
        eq(topupRequests.status, 'pending'),
        sql`${topupRequests.expiresAt} < NOW()`
      ));

    for (const request of expiredRequests) {
      // Update status to cancelled
      await db
        .update(topupRequests)
        .set({
          status: 'cancelled',
          updatedAt: new Date()
        })
        .where(eq(topupRequests.id, request.id));

      // Create transaction record for cancelled topup
      await this.createTransaction({
        userId: request.userId,
        type: 'top_up_failed',
        amount: "0",
        description: `Nạp tiền QR Code hủy - Hết hạn sau 30 phút - Mã: ${request.description}`,
        reference: request.id,
        status: 'cancelled'
      });
    }
  }

  async getTransactionsByDateRange(startDate: Date, endDate: Date): Promise<Transaction[]> {
    return await db.select()
      .from(transactions)
      .where(and(
        sql`${transactions.createdAt} >= ${startDate}`,
        sql`${transactions.createdAt} <= ${endDate}`
      ))
      .orderBy(desc(transactions.createdAt));
  }

  async getTopupRequestsByDateRange(startDate: Date, endDate: Date): Promise<TopupRequest[]> {
    return await db.select()
      .from(topupRequests)
      .where(and(
        sql`${topupRequests.createdAt} >= ${startDate}`,
        sql`${topupRequests.createdAt} <= ${endDate}`
      ))
      .orderBy(desc(topupRequests.createdAt));
  }

  // HTTP Proxy Management operations
  async getAllHttpProxies(): Promise<HttpProxy[]> {
    return await db.select().from(httpProxies).orderBy(desc(httpProxies.createdAt));
  }

  async getActiveHttpProxies(): Promise<HttpProxy[]> {
    return await db.select().from(httpProxies).where(eq(httpProxies.isActive, true)).orderBy(httpProxies.totalUsage);
  }

  async getHttpProxy(id: number): Promise<HttpProxy | undefined> {
    const [proxy] = await db.select().from(httpProxies).where(eq(httpProxies.id, id));
    return proxy;
  }

  async createHttpProxy(proxy: InsertHttpProxy): Promise<HttpProxy> {
    const [newProxy] = await db
      .insert(httpProxies)
      .values({ ...proxy, createdAt: new Date(), updatedAt: new Date() })
      .returning();
    return newProxy;
  }

  async createBulkHttpProxies(proxies: InsertHttpProxy[]): Promise<HttpProxy[]> {
    const newProxies = await db
      .insert(httpProxies)
      .values(proxies.map(proxy => ({ 
        ...proxy, 
        createdAt: new Date(), 
        updatedAt: new Date() 
      })))
      .returning();
    return newProxies;
  }

  async updateHttpProxy(id: number, updates: Partial<HttpProxy>): Promise<HttpProxy | undefined> {
    const [proxy] = await db
      .update(httpProxies)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(httpProxies.id, id))
      .returning();
    return proxy;
  }

  async deleteHttpProxy(id: number): Promise<boolean> {
    const result = await db.delete(httpProxies).where(eq(httpProxies.id, id));
    return (result.rowCount || 0) > 0;
  }

  async updateHttpProxyUsage(id: number): Promise<void> {
    await db
      .update(httpProxies)
      .set({ 
        lastUsed: new Date(),
        totalUsage: sql`${httpProxies.totalUsage} + 1`,
        updatedAt: new Date()
      })
      .where(eq(httpProxies.id, id));
  }

  async getRandomHttpProxy(): Promise<HttpProxy | undefined> {
    const activeProxies = await this.getActiveHttpProxies();
    if (activeProxies.length === 0) return undefined;
    
    const randomIndex = Math.floor(Math.random() * activeProxies.length);
    const selectedProxy = activeProxies[randomIndex];
    
    // Update usage count
    await this.updateHttpProxyUsage(selectedProxy.id);
    
    return selectedProxy;
  }

  // getAllTiktokRentals REMOVED - use getTiktokRentalsWithFilter

  // OPTIMIZED: New filtered TikTok rentals query with pagination
  async getTiktokRentalsWithFilter(options: {
    limit?: number;
    offset?: number;
    userId?: number;
    status?: string;
    dateFrom?: Date;
    dateTo?: Date;
  } = {}): Promise<TiktokRental[]> {
    const { limit = 50, offset = 0, userId, status, dateFrom, dateTo } = options;
    
    let query = db.select().from(tiktokRentals);
    
    // Apply filters
    const conditions = [];
    if (userId) conditions.push(eq(tiktokRentals.userId, userId));
    if (status) conditions.push(eq(tiktokRentals.status, status));
    if (dateFrom) conditions.push(sql`${tiktokRentals.createdAt} >= ${dateFrom.toISOString()}`);
    if (dateTo) conditions.push(sql`${tiktokRentals.createdAt} <= ${dateTo.toISOString()}`);
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }
    
    return await query
      .orderBy(desc(tiktokRentals.createdAt))
      .limit(limit)
      .offset(offset)
      .execute();
  }

  async createTiktokRental(data: InsertTiktokRental): Promise<TiktokRental> {
    const [rental] = await db.insert(tiktokRentals).values(data).returning();
    return rental;
  }

  async getTiktokRentalsByUserId(userId: number): Promise<any[]> {
    return await db.select()
      .from(tiktokRentals)
      .where(eq(tiktokRentals.userId, userId))
      .orderBy(desc(tiktokRentals.createdAt));
  }

  async getActiveTiktokSessions(userId: number): Promise<any[]> {
    return await db.select()
      .from(tiktokRentals)
      .where(and(
        eq(tiktokRentals.userId, userId),
        eq(tiktokRentals.status, 'waiting')
      ));
  }

  async updateTiktokRental(sessionId: string, data: any): Promise<void> {
    await db.update(tiktokRentals)
      .set(data)
      .where(eq(tiktokRentals.sessionId, sessionId));
  }

  async getTiktokRentalBySessionId(sessionId: string): Promise<any | null> {
    const [rental] = await db.select()
      .from(tiktokRentals)
      .where(eq(tiktokRentals.sessionId, sessionId));
    return rental || null;
  }

  // AUTO-REFUND SCHEDULER METHODS
  async getAllExpiredPhoneRentalSessions(): Promise<any[]> {
    // FIXED LOGIC: Get both waiting sessions that expired AND expired sessions not yet refunded
    // 🚀 EGRESS OPTIMIZATION: Select only minimal columns needed for refund processing
    // 🚀 LIMIT OPTIMIZATION: Only fetch 500 sessions per query to reduce egress
    
    // Part 1: Waiting sessions that have expired - MINIMAL COLUMNS (with phoneNumber for queue cleanup)
    const expiredWaitingSessions = await db.select({
      sessionId: phoneRentalHistory.sessionId,
      userId: phoneRentalHistory.userId,
      service: phoneRentalHistory.service,
      status: phoneRentalHistory.status,
      expiresAt: phoneRentalHistory.expiresAt,
      cost: phoneRentalHistory.cost,
      phoneNumber: phoneRentalHistory.phoneNumber // CRITICAL: Required for Shopee V2 queue cleanup
    })
      .from(phoneRentalHistory)
      .where(and(
        eq(phoneRentalHistory.status, 'waiting'),
        sql`${phoneRentalHistory.expiresAt} < NOW()`,
        sql`(${phoneRentalHistory.refundProcessed} = false OR ${phoneRentalHistory.refundProcessed} IS NULL)` // 🚨 CRITICAL: Only fetch non-refunded sessions
      ))
      .orderBy(phoneRentalHistory.expiresAt) // DETERMINISTIC: Oldest expired first
      .limit(250); // EGRESS OPT: Limit to 250 waiting sessions

    // Part 2: Sessions already marked 'expired' but potentially not refunded yet - MINIMAL COLUMNS (with phoneNumber)
    const expiredSessionsNotRefunded = await db.select({
      sessionId: phoneRentalHistory.sessionId,
      userId: phoneRentalHistory.userId,
      service: phoneRentalHistory.service,
      status: phoneRentalHistory.status,
      expiresAt: phoneRentalHistory.expiresAt,
      cost: phoneRentalHistory.cost,
      phoneNumber: phoneRentalHistory.phoneNumber // CRITICAL: Required for Shopee V2 queue cleanup
    })
      .from(phoneRentalHistory)
      .where(and(
        eq(phoneRentalHistory.status, 'expired'),
        sql`${phoneRentalHistory.expiresAt} < NOW()`,
        sql`(${phoneRentalHistory.refundProcessed} = false OR ${phoneRentalHistory.refundProcessed} IS NULL)` // 🚨 CRITICAL: Only fetch non-refunded sessions
      ))
      .orderBy(phoneRentalHistory.expiresAt) // DETERMINISTIC: Oldest expired first
      .limit(250); // EGRESS OPT: Limit to 250 expired sessions

    // Combine both sets
    const allCandidateSessions = [...expiredWaitingSessions, ...expiredSessionsNotRefunded];
    
    console.log(`[STORAGE] Found ${expiredWaitingSessions.length} expired waiting + ${expiredSessionsNotRefunded.length} already-expired sessions = ${allCandidateSessions.length} total candidates`);
    return allCandidateSessions;
  }

  async getAllExpiredTiktokRentalSessions(): Promise<any[]> {
    // FIXED LOGIC: Same fix as phone rentals - include both waiting+expired and expired-not-refunded
    // 🚀 LIMIT OPTIMIZATION: Only fetch 100 TikTok sessions per query to reduce egress
    // 🚀 EGRESS OPTIMIZATION: Select only minimal columns needed for refund processing
    
    // Part 1: Waiting sessions that have expired - MINIMAL COLUMNS
    const expiredWaitingSessions = await db.select({
      sessionId: tiktokRentals.sessionId,
      userId: tiktokRentals.userId,
      service: tiktokRentals.service,
      status: tiktokRentals.status,
      expiresAt: tiktokRentals.expiresAt,
      cost: tiktokRentals.cost
    })
      .from(tiktokRentals)
      .where(and(
        eq(tiktokRentals.status, 'waiting'),
        sql`${tiktokRentals.expiresAt} < NOW()`,
        sql`(${tiktokRentals.refundProcessed} = false OR ${tiktokRentals.refundProcessed} IS NULL)` // 🚨 CRITICAL: Only fetch non-refunded sessions
      ))
      .orderBy(tiktokRentals.expiresAt) // DETERMINISTIC: Oldest expired first
      .limit(50); // EGRESS OPT: Limit to 50 TikTok waiting sessions

    // Part 2: Sessions already marked 'expired' but potentially not refunded yet - MINIMAL COLUMNS
    const expiredSessionsNotRefunded = await db.select({
      sessionId: tiktokRentals.sessionId,
      userId: tiktokRentals.userId,
      service: tiktokRentals.service,
      status: tiktokRentals.status,
      expiresAt: tiktokRentals.expiresAt,
      cost: tiktokRentals.cost
    })
      .from(tiktokRentals)
      .where(and(
        eq(tiktokRentals.status, 'expired'),
        sql`${tiktokRentals.expiresAt} < NOW()`,
        sql`(${tiktokRentals.refundProcessed} = false OR ${tiktokRentals.refundProcessed} IS NULL)` // 🚨 CRITICAL: Only fetch non-refunded sessions
      ))
      .orderBy(tiktokRentals.expiresAt) // DETERMINISTIC: Oldest expired first
      .limit(50); // EGRESS OPT: Limit to 50 TikTok expired sessions

    // Combine both sets
    const allCandidateSessions = [...expiredWaitingSessions, ...expiredSessionsNotRefunded];
    
    console.log(`[STORAGE] Found ${expiredWaitingSessions.length} expired waiting + ${expiredSessionsNotRefunded.length} already-expired TikTok sessions = ${allCandidateSessions.length} total candidates`);
    return allCandidateSessions;
  }

  // INCREMENTAL OPTIMIZATION: Get expired phone rentals since a specific time
  async getExpiredPhoneRentalsSince(sinceTime: Date, limit: number = 500): Promise<any[]> {
    // 🚀 EGRESS OPTIMIZATION: Select only minimal columns needed for refund processing
    
    // Part 1: Waiting sessions that have expired since last check - MINIMAL COLUMNS (with phoneNumber)
    const expiredWaitingSessions = await db.select({
      sessionId: phoneRentalHistory.sessionId,
      userId: phoneRentalHistory.userId,
      service: phoneRentalHistory.service,
      status: phoneRentalHistory.status,
      expiresAt: phoneRentalHistory.expiresAt,
      cost: phoneRentalHistory.cost,
      phoneNumber: phoneRentalHistory.phoneNumber // CRITICAL: Required for Shopee V2 queue cleanup
    })
      .from(phoneRentalHistory)
      .where(and(
        eq(phoneRentalHistory.status, 'waiting'),
        lt(phoneRentalHistory.expiresAt, new Date()),
        gt(phoneRentalHistory.expiresAt, sinceTime), // Only newly expired since last check
        sql`(${phoneRentalHistory.refundProcessed} = false OR ${phoneRentalHistory.refundProcessed} IS NULL)` // 🚨 CRITICAL: Only fetch non-refunded sessions
      ))
      .orderBy(phoneRentalHistory.expiresAt) // DETERMINISTIC: Oldest expired first
      .limit(Math.floor(limit / 2));

    // Part 2: Sessions marked 'expired' recently (based on createdAt - approximation) - MINIMAL COLUMNS (with phoneNumber)
    const recentlyExpiredSessions = await db.select({
      sessionId: phoneRentalHistory.sessionId,
      userId: phoneRentalHistory.userId,
      service: phoneRentalHistory.service,
      status: phoneRentalHistory.status,
      expiresAt: phoneRentalHistory.expiresAt,
      cost: phoneRentalHistory.cost,
      phoneNumber: phoneRentalHistory.phoneNumber // CRITICAL: Required for Shopee V2 queue cleanup
    })
      .from(phoneRentalHistory)
      .where(and(
        eq(phoneRentalHistory.status, 'expired'),
        gt(phoneRentalHistory.createdAt, sinceTime), // Recently created sessions that are expired
        sql`(${phoneRentalHistory.refundProcessed} = false OR ${phoneRentalHistory.refundProcessed} IS NULL)` // 🚨 CRITICAL: Only fetch non-refunded sessions
      ))
      .orderBy(phoneRentalHistory.expiresAt) // DETERMINISTIC: Oldest expired first
      .limit(Math.floor(limit / 2));

    const allCandidateSessions = [...expiredWaitingSessions, ...recentlyExpiredSessions];
    
    if (allCandidateSessions.length > 0) {
      console.log(`[STORAGE] INCREMENTAL: Found ${expiredWaitingSessions.length} newly expired waiting + ${recentlyExpiredSessions.length} recently expired = ${allCandidateSessions.length} candidates since ${sinceTime.toISOString()}`);
    }
    
    return allCandidateSessions;
  }

  // INCREMENTAL OPTIMIZATION: Get expired TikTok rentals since a specific time
  async getExpiredTiktokRentalsSince(sinceTime: Date, limit: number = 500): Promise<any[]> {
    // 🚀 EGRESS OPTIMIZATION: Select only minimal columns needed for refund processing
    
    // Part 1: Waiting sessions that have expired since last check - MINIMAL COLUMNS
    const expiredWaitingSessions = await db.select({
      sessionId: tiktokRentals.sessionId,
      userId: tiktokRentals.userId,
      service: tiktokRentals.service,
      status: tiktokRentals.status,
      expiresAt: tiktokRentals.expiresAt,
      cost: tiktokRentals.cost
    })
      .from(tiktokRentals)
      .where(and(
        eq(tiktokRentals.status, 'waiting'),
        lt(tiktokRentals.expiresAt, new Date()),
        gt(tiktokRentals.expiresAt, sinceTime), // Only newly expired since last check
        sql`(${tiktokRentals.refundProcessed} = false OR ${tiktokRentals.refundProcessed} IS NULL)` // 🚨 CRITICAL: Only fetch non-refunded sessions
      ))
      .orderBy(tiktokRentals.expiresAt) // DETERMINISTIC: Oldest expired first
      .limit(Math.floor(limit / 2));

    // Part 2: Sessions marked 'expired' recently (based on createdAt - approximation) - MINIMAL COLUMNS
    const recentlyExpiredSessions = await db.select({
      sessionId: tiktokRentals.sessionId,
      userId: tiktokRentals.userId,
      service: tiktokRentals.service,
      status: tiktokRentals.status,
      expiresAt: tiktokRentals.expiresAt,
      cost: tiktokRentals.cost
    })
      .from(tiktokRentals)
      .where(and(
        eq(tiktokRentals.status, 'expired'),
        gt(tiktokRentals.createdAt, sinceTime), // Recently created sessions that are expired
        sql`(${tiktokRentals.refundProcessed} = false OR ${tiktokRentals.refundProcessed} IS NULL)` // 🚨 CRITICAL: Only fetch non-refunded sessions
      ))
      .orderBy(tiktokRentals.expiresAt) // DETERMINISTIC: Oldest expired first
      .limit(Math.floor(limit / 2));

    const allCandidateSessions = [...expiredWaitingSessions, ...recentlyExpiredSessions];
    
    if (allCandidateSessions.length > 0) {
      console.log(`[STORAGE] INCREMENTAL: Found ${expiredWaitingSessions.length} newly expired waiting + ${recentlyExpiredSessions.length} recently expired TikTok = ${allCandidateSessions.length} candidates since ${sinceTime.toISOString()}`);
    }
    
    return allCandidateSessions;
  }

  // Username check implementation
  async getAllUsernameChecks(): Promise<UsernameCheck[]> {
    return await db.select().from(usernameChecks).orderBy(desc(usernameChecks.createdAt));
  }

  async getUsernameChecksByUser(userId: number): Promise<UsernameCheck[]> {
    return await db.select()
      .from(usernameChecks)
      .where(eq(usernameChecks.userId, userId))
      .orderBy(desc(usernameChecks.createdAt));
  }

  async createUsernameCheck(check: InsertUsernameCheck): Promise<UsernameCheck> {
    const [created] = await db.insert(usernameChecks).values(check).returning();
    return created;
  }

  async checkShopeeUsernames(usernames: string[], userId: number, ipAddress: string): Promise<{
    username: string;
    status: number | null;
    isAvailable: boolean;
    statusMessage: string;
  }[]> {
    const results = [];
    
    // Get SPC_ST cookie from system config - try username_check_cookie first, fallback to SPC_ST_check
    let spcStConfig = null;
    const usernameCheckConfigs = await this.getSystemConfigByType('username_check_cookie');
    if (usernameCheckConfigs && usernameCheckConfigs.length > 0) {
      spcStConfig = usernameCheckConfigs.find(config => config.isActive) || null;
    }
    if (!spcStConfig) {
      spcStConfig = await this.getSystemConfig('SPC_ST_check');
    }
    if (!spcStConfig) {
      throw new Error('Vui lòng cấu hình SPC_ST cookie trong system config (loại: Cookie kiểm tra Username)');
    }

    for (const username of usernames) {
      let proxyUsed = null;
      try {
        // Get a random proxy from the system
        const proxy = await this.getRandomHttpProxy();
        
        // Make request to Shopee API using axios with proxy support
        const url = "https://shopee.vn/api/v4/shop/get_shop_base";
        const params = {
          entry_point: "",
          need_cancel_rate: "true", 
          request_source: "shop_home_page",
          username: username.trim()
        };

        const headers = {
          "Host": "shopee.vn",
          "Cookie": spcStConfig.configValue.startsWith('SPC_ST=') 
            ? spcStConfig.configValue 
            : `SPC_ST=${spcStConfig.configValue}`,
          "Content-Type": "application/json",
          "User-Agent": "Android app Shopee appver=28320 app_type=1"
        };

        // Configure axios with proxy if available
        const axiosConfig: any = {
          headers: headers,
          params: params,
          timeout: 30000 // 30 seconds timeout
        };

        if (proxy) {
          // Parse proxy URL and configure HTTP proxy agent with authentication
          const { HttpsProxyAgent } = await import('https-proxy-agent');
          const { HttpProxyAgent } = await import('http-proxy-agent');
          
          // Build proxy URL with authentication if credentials exist
          let proxyUrl = `http://`;
          if (proxy.username && proxy.password) {
            proxyUrl += `${encodeURIComponent(proxy.username)}:${encodeURIComponent(proxy.password)}@`;
          }
          proxyUrl += `${proxy.ip}:${proxy.port}`;
          
          proxyUsed = proxy.label ? `${proxy.label} (${proxy.ip}:${proxy.port})` : `${proxy.ip}:${proxy.port}`;
          
          // Use appropriate proxy agent based on target URL protocol
          if (url.startsWith('https://')) {
            axiosConfig.httpsAgent = new HttpsProxyAgent(proxyUrl);
          } else {
            axiosConfig.httpAgent = new HttpProxyAgent(proxyUrl);
          }
          
          console.log(`[Username Check] Using proxy: ${proxyUsed} for user: ${username.trim()}`);
        } else {
          console.log(`[Username Check] No proxy available, using direct connection for user: ${username.trim()}`);
        }

        console.log(`[Username Check] Testing user: ${username.trim()}`);
        console.log(`[Username Check] Cookie: ${headers.Cookie.substring(0, 50)}...`);
        console.log(`[Username Check] Full params:`, params);

        // Retry logic: 3 attempts with exponential backoff (1s, 2s, 4s)
        let response;
        let lastError: any;
        const maxRetries = 3;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            response = await axios.get(url, axiosConfig);
            break; // Success, exit retry loop
          } catch (error: any) {
            lastError = error;
            // Retry only on network errors or 5xx server errors
            const shouldRetry = 
              error.code === 'ETIMEDOUT' || 
              error.code === 'ECONNRESET' ||
              error.code === 'ECONNREFUSED' ||
              (error.response && error.response.status >= 500);
            
            if (shouldRetry && attempt < maxRetries) {
              const delay = 1000 * Math.pow(2, attempt - 1); // 1s, 2s, 4s
              console.log(`[Username Check] Attempt ${attempt}/${maxRetries} failed for ${username.trim()}, retrying in ${delay}ms...`);
              await new Promise(resolve => setTimeout(resolve, delay));
            } else {
              throw error; // Non-retryable error or max retries reached
            }
          }
        }

        if (!response) {
          throw lastError; // All retries failed
        }

        console.log(`[Username Check] Response status: ${response.status}`);

        if (response.status === 200) {
          const jsonData = response.data;
          console.log(`[Username Check] Response data:`, JSON.stringify(jsonData, null, 2));
          
          let status = null;
          let isAvailable = false;
          let statusMessage = "";

          if (jsonData.error === 0) {
            const accountStatus = jsonData.data?.account?.status;
            
            if (accountStatus === 1) {
              status = 1;
              isAvailable = true;
              statusMessage = proxyUsed ? 
                `Tài khoản đang hoạt động (via proxy ${proxyUsed})` : 
                "Tài khoản đang hoạt động";
            } else if (accountStatus === 2) {
              status = 2;
              isAvailable = false;
              statusMessage = proxyUsed ? 
                `Tài khoản đã bị khóa (via proxy ${proxyUsed})` : 
                "Tài khoản đã bị khóa";
            } else {
              statusMessage = proxyUsed ? 
                `Không xác định được trạng thái tài khoản (via proxy ${proxyUsed})` : 
                "Không xác định được trạng thái tài khoản";
            }
          } else {
            statusMessage = jsonData.error_msg || "Lỗi API";
            if (proxyUsed) {
              statusMessage += ` (via proxy ${proxyUsed})`;
            }
          }

          // Save to database
          await this.createUsernameCheck({
            userId,
            username: username.trim(),
            status,
            isAvailable,
            userIp: ipAddress
          });

          results.push({
            username: username.trim(),
            status,
            isAvailable,
            statusMessage
          });

        } else {
          // Handle error response
          await this.createUsernameCheck({
            userId,
            username: username.trim(),
            status: null,
            isAvailable: false,
            userIp: ipAddress
          });

          results.push({
            username: username.trim(),
            status: null,
            isAvailable: false,
            statusMessage: proxyUsed ? 
              `Lỗi kết nối hoặc bị Shopee chặn (via proxy ${proxyUsed})` : 
              "Lỗi kết nối hoặc bị Shopee chặn"
          });
        }
      } catch (error: any) {
        // Handle exception
        await this.createUsernameCheck({
          userId,
          username: username.trim(),
          status: null,
          isAvailable: false,
          userIp: ipAddress
        });

        let errorMessage = `Lỗi khi gửi request: ${error.message}`;
        if (proxyUsed) {
          errorMessage += ` (via proxy ${proxyUsed})`;
        }

        // Check if error is proxy-related
        if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
          errorMessage = proxyUsed ? 
            `Proxy không khả dụng (${proxyUsed}): ${error.message}` : 
            `Kết nối thất bại: ${error.message}`;
        }

        results.push({
          username: username.trim(),
          status: null,
          isAvailable: false,
          statusMessage: errorMessage
        });

        console.error(`[Username Check] Error for ${username.trim()}:`, error.message);
      }

      // Add small delay between requests to avoid overwhelming the service
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return results;
  }

  // Voucher Saving Operations
  async getAllVoucherSavingOperations(): Promise<VoucherSavingOperation[]> {
    return await executeWithRetry(async () => {
      return await db.select().from(voucherSavingOperations).orderBy(desc(voucherSavingOperations.createdAt));
    });
  }

  async getVoucherSavingOperationsByDateRange(startDate: Date, endDate: Date): Promise<VoucherSavingOperation[]> {
    return await executeWithRetry(async () => {
      return await db.select()
        .from(voucherSavingOperations)
        .where(and(
          gte(voucherSavingOperations.createdAt, startDate),
          lte(voucherSavingOperations.createdAt, endDate)
        ))
        .orderBy(desc(voucherSavingOperations.createdAt));
    });
  }

  async getVoucherSavingOperationsByUser(userId: number): Promise<(VoucherSavingOperation & { fullCookieValue?: string })[]> {
    return await executeWithRetry(async () => {
      const results = await db.select({
        id: voucherSavingOperations.id,
        userId: voucherSavingOperations.userId,
        sessionId: voucherSavingOperations.sessionId,
        cookieId: voucherSavingOperations.cookieId,
        cookiePreview: voucherSavingOperations.cookiePreview,
        status: voucherSavingOperations.status,
        totalVouchersFound: voucherSavingOperations.totalVouchersFound,
        successfulSaves: voucherSavingOperations.successfulSaves,
        failedSaves: voucherSavingOperations.failedSaves,
        cost: voucherSavingOperations.cost,
        message: voucherSavingOperations.message,
        proxy: voucherSavingOperations.proxy,
        userIp: voucherSavingOperations.userIp,
        metadata: voucherSavingOperations.metadata,
        createdAt: voucherSavingOperations.createdAt,
        completedAt: voucherSavingOperations.completedAt,
        fullCookieValue: shopeeCookies.cookieValue
      })
      .from(voucherSavingOperations)
      .leftJoin(shopeeCookies, eq(voucherSavingOperations.cookieId, shopeeCookies.id))
      .where(eq(voucherSavingOperations.userId, userId))
      .orderBy(desc(voucherSavingOperations.createdAt));
      
      // Convert null to undefined for TypeScript compatibility
      // For bulk operations, cookiePreview contains full cookie value
      return results.map(result => ({
        ...result,
        fullCookieValue: result.fullCookieValue || 
          (result.cookieId?.startsWith('bulk_') ? result.cookiePreview : undefined)
      }));
    });
  }

  async getVoucherSavingOperationsBySession(sessionId: string): Promise<VoucherSavingOperation[]> {
    return await executeWithRetry(async () => {
      return await db.select().from(voucherSavingOperations)
        .where(eq(voucherSavingOperations.sessionId, sessionId))
        .orderBy(desc(voucherSavingOperations.createdAt));
    });
  }

  async getVoucherOperationsByDateRange(startDate: Date, endDate: Date): Promise<VoucherSavingOperation[]> {
    return await executeWithRetry(async () => {
      return await db.select().from(voucherSavingOperations)
        .where(
          and(
            gte(voucherSavingOperations.createdAt, startDate),
            lte(voucherSavingOperations.createdAt, endDate)
          )
        )
        .orderBy(desc(voucherSavingOperations.createdAt));
    });
  }

  async createVoucherSavingOperation(operation: InsertVoucherSavingOperation & { userId: number }): Promise<VoucherSavingOperation> {
    return await executeWithRetry(async () => {
      const [created] = await db.insert(voucherSavingOperations).values(operation).returning();
      return created;
    });
  }

  async updateVoucherSavingOperation(id: number, updates: Partial<VoucherSavingOperation>): Promise<VoucherSavingOperation | undefined> {
    return await executeWithRetry(async () => {
      const [updated] = await db.update(voucherSavingOperations)
        .set(updates)
        .where(eq(voucherSavingOperations.id, id))
        .returning();
      return updated;
    });
  }

  // Voucher Save Results
  async getAllVoucherSaveResults(): Promise<VoucherSaveResult[]> {
    return await executeWithRetry(async () => {
      return await db.select().from(voucherSaveResults).orderBy(desc(voucherSaveResults.createdAt));
    });
  }

  async getVoucherSaveResultsByOperation(operationId: number): Promise<VoucherSaveResult[]> {
    return await executeWithRetry(async () => {
      return await db.select().from(voucherSaveResults)
        .where(eq(voucherSaveResults.operationId, operationId))
        .orderBy(desc(voucherSaveResults.createdAt));
    });
  }

  async createVoucherSaveResult(result: InsertVoucherSaveResult): Promise<VoucherSaveResult> {
    return await executeWithRetry(async () => {
      const [created] = await db.insert(voucherSaveResults).values(result).returning();
      return created;
    });
  }

  async updateVoucherSaveResult(id: number, updates: Partial<VoucherSaveResult>): Promise<VoucherSaveResult | undefined> {
    return await executeWithRetry(async () => {
      const [updated] = await db.update(voucherSaveResults)
        .set(updates)
        .where(eq(voucherSaveResults.id, id))
        .returning();
      return updated;
    });
  }

  /**
   * 🔒 ATOMIC VOUCHER SAVING WITH FINANCIAL SAFETY
   * Safely process voucher saving with pre-charge validation and atomicity
   */
  async atomicVoucherSaving(params: {
    userId: number;
    cookieId: string;
    cookieValue: string;
    cookiePreview: string;
    sessionId: string;
    serviceCost: number;
    idempotencyKey: string;
    userIp?: string;
    userFullName: string;
  }): Promise<{
    success: boolean;
    operation?: VoucherSavingOperation;
    transaction?: Transaction;
    successfulSaves: number;
    failedSaves: number;
    totalVouchersFound: number;
    balanceAfter: number;
    message: string;
  }> {
    const { userId, cookieId, serviceCost, idempotencyKey, userFullName } = params;
    
    // Use database transaction for atomicity
    return await db.transaction(async (tx) => {
      try {
        // Step 1: Check for existing operation with same idempotency key (prevent double processing)
        const existingOperation = await tx
          .select()
          .from(voucherSavingOperations)
          .where(and(
            eq(voucherSavingOperations.userId, userId),
            eq(voucherSavingOperations.sessionId, params.sessionId),
            sql`metadata->>'idempotencyKey' = ${idempotencyKey}`
          ))
          .limit(1);
        
        if (existingOperation.length > 0) {
          // Return existing result for idempotency
          const currentUser = await tx.select({ balance: users.balance }).from(users).where(eq(users.id, userId));
          return {
            success: true,
            operation: existingOperation[0],
            successfulSaves: existingOperation[0].successfulSaves || 0,
            failedSaves: existingOperation[0].failedSaves || 0,
            totalVouchersFound: existingOperation[0].totalVouchersFound || 0,
            balanceAfter: parseFloat(currentUser[0]?.balance || '0'),
            message: 'Đã xử lý trước đó (idempotency)'
          };
        }
        
        // Step 2: Lock user row and check balance atomically
        const userResult = await tx
          .update(users)
          .set({ balance: sql`balance - ${serviceCost}` })
          .where(and(
            eq(users.id, userId),
            sql`balance >= ${serviceCost}` // Conditional update: only if sufficient balance
          ))
          .returning({ id: users.id, newBalance: users.balance });
        
        if (userResult.length === 0) {
          // No rows updated = insufficient balance
          // Get current balance for error message
          const currentUser = await tx.select({ balance: users.balance }).from(users).where(eq(users.id, userId));
          const currentBalance = Number(currentUser[0]?.balance || '0');
          throw new Error(`Số dư không đủ. Cần ${serviceCost.toLocaleString('vi-VN')} VND để sử dụng dịch vụ lưu voucher hỏa tốc. Số dư hiện tại: ${currentBalance.toLocaleString('vi-VN')} VND`);
        }
        
        const newBalance = Number(userResult[0].newBalance);
        const balanceBefore = newBalance + serviceCost;
        
        // Step 3: Create voucher saving operation record
        const [newOperation] = await tx
          .insert(voucherSavingOperations)
          .values({
            userId,
            sessionId: params.sessionId,
            cookieId,
            cookiePreview: params.cookiePreview,
            status: 'pending',
            totalVouchersFound: 0,
            successfulSaves: 0,
            failedSaves: 0,
            cost: serviceCost,
            message: 'Đã trừ tiền, đang xử lý voucher...',
            proxy: null,
            userIp: params.userIp || null,
            metadata: JSON.stringify({
              idempotencyKey,
              serviceCost,
              processedAt: new Date().toISOString()
            })
          })
          .returning();
        
        // Step 4: Create transaction record
        const [newTransaction] = await tx
          .insert(transactions)
          .values({
            userId,
            type: 'voucher_saving',
            amount: (-serviceCost).toString(),
            description: `Lưu mã free ship hỏa tốc - Cookie: ${params.cookiePreview.substring(0, 20)}...`,
            status: 'completed',
            balanceBefore: balanceBefore.toString(),
            balanceAfter: newBalance.toString(),
            metadata: JSON.stringify({
              service: 'voucher_saving',
              sessionId: params.sessionId,
              cookieId,
              serviceCost,
              operationId: newOperation.id,
              idempotencyKey
            })
          })
          .returning();
        
        // Step 5: Create service usage history
        await tx
          .insert(serviceUsageHistory)
          .values({
            userId,
            serviceName: 'voucher_saving',
            serviceType: 'Voucher Saving',
            cost: serviceCost.toString(),
            status: 'success',
            description: `Lưu mã free ship hỏa tốc - Đã trừ ${serviceCost}₫`,
            metadata: JSON.stringify({
              sessionId: params.sessionId,
              cookieId,
              serviceCost,
              operationId: newOperation.id,
              idempotencyKey
            })
          });
        
        return {
          success: true,
          operation: newOperation,
          transaction: newTransaction,
          successfulSaves: 0, // Will be updated later when actual voucher saving is complete
          failedSaves: 0,
          totalVouchersFound: 0,
          balanceAfter: newBalance,
          message: `Đã trừ ${serviceCost.toLocaleString('vi-VN')}₫ từ tài khoản. Đang xử lý voucher...`
        };
        
      } catch (error) {
        console.error('Atomic voucher saving error:', error);
        
        // 🔒 FALLBACK AUDIT LOGGING - Guaranteed logging even on transaction rollback
        try {
          await this.createAuditLog({
            userId,
            action: 'VOUCHER_SAVING_FAILED',
            description: `Voucher saving failed - SessionId: ${params.sessionId}, Service cost: ${serviceCost}₫, Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            ipAddress: params.userIp || 'unknown',
            afterData: JSON.stringify({
              sessionId: params.sessionId,
              cookieId,
              serviceCost,
              idempotencyKey,
              errorType: error instanceof Error ? error.constructor.name : 'UnknownError',
              errorMessage: error instanceof Error ? error.message : String(error)
            })
          });
        } catch (auditError) {
          console.error('Failed to create fallback audit log:', auditError);
        }
        
        throw error;
      }
    });
  }

  /**
   * 🔒 AUTOMATIC REFUND FOR FAILED VOUCHER SAVING
   * Refunds money and creates refund transaction when voucher saving fails
   */
  async refundFailedVoucherSaving(params: {
    userId: number;
    operationId: number;
    originalTransactionId: number;
    serviceCost: number;
    sessionId: string;
    cookieId: string;
    reason: string;
    idempotencyKey: string;
  }): Promise<{
    success: boolean;
    refundTransaction?: Transaction;
    balanceAfter: number;
    message: string;
  }> {
    const { userId, operationId, originalTransactionId, serviceCost, sessionId, cookieId, reason, idempotencyKey } = params;
    
    // Use database transaction for atomicity
    return await db.transaction(async (tx) => {
      try {
        console.log(`[REFUND] Starting refund for operation ${operationId}, amount: ${serviceCost}₫`);
        
        // Step 1: Lock the voucher operation row to prevent concurrent refunds
        const lockedOperation = await tx
          .select()
          .from(voucherSavingOperations)
          .where(eq(voucherSavingOperations.id, operationId))
          .for('update')
          .limit(1);
        
        if (lockedOperation.length === 0) {
          throw new Error(`Voucher operation ${operationId} not found`);
        }

        // Step 2: Check if refund already exists using unique refund key
        const refundKey = `voucher_refund_${operationId}_${idempotencyKey}`;
        const existingRefund = await tx
          .select()
          .from(transactions)
          .where(and(
            eq(transactions.userId, userId),
            eq(transactions.type, 'voucher_saving_refund'),
            sql`metadata->>'refundKey' = ${refundKey}`
          ))
          .limit(1);
        
        if (existingRefund.length > 0) {
          // Refund already processed
          const currentUser = await tx.select({ balance: users.balance }).from(users).where(eq(users.id, userId));
          return {
            success: true,
            refundTransaction: existingRefund[0],
            balanceAfter: parseFloat(currentUser[0]?.balance || '0'),
            message: 'Đã hoàn tiền trước đó (idempotency)'
          };
        }
        
        // Step 2: Get current balance before refund
        const currentUser = await tx.select({ balance: users.balance }).from(users).where(eq(users.id, userId));
        const balanceBefore = parseFloat(currentUser[0]?.balance || '0');
        
        // Step 3: Refund money to user
        const userResult = await tx
          .update(users)
          .set({ balance: sql`balance + ${serviceCost}` })
          .where(eq(users.id, userId))
          .returning({ id: users.id, newBalance: users.balance });
        
        if (userResult.length === 0) {
          throw new Error(`Không thể hoàn tiền cho user ${userId}`);
        }
        
        const balanceAfter = parseFloat(userResult[0].newBalance);
        
        // Step 4: Create refund transaction record with unique refund key
        const [refundTransaction] = await tx
          .insert(transactions)
          .values({
            userId,
            type: 'voucher_saving_refund',
            amount: serviceCost.toString(),
            description: `Hoàn tiền lưu voucher thất bại - ${reason}`,
            status: 'completed',
            balanceBefore: balanceBefore.toString(),
            balanceAfter: balanceAfter.toString(),
            metadata: JSON.stringify({
              service: 'voucher_saving_refund',
              refundKey: refundKey, // Unique key for idempotency
              originalOperationId: operationId,
              originalTransactionId,
              sessionId,
              cookieId,
              serviceCost,
              reason,
              idempotencyKey,
              refundedAt: new Date().toISOString()
            })
          })
          .returning();
        
        // Step 5: Create service usage history for refund
        await tx
          .insert(serviceUsageHistory)
          .values({
            userId,
            serviceName: 'voucher_saving_refund',
            serviceType: 'Voucher Saving Refund',
            cost: `+${serviceCost.toString()}`,
            status: 'success',
            description: `Hoàn tiền lưu voucher thất bại - ${reason} (+${serviceCost}₫)`,
            metadata: JSON.stringify({
              originalOperationId: operationId,
              originalTransactionId,
              sessionId,
              cookieId,
              serviceCost,
              reason,
              idempotencyKey
            })
          });
        
        console.log(`[REFUND] Successfully refunded ${serviceCost}₫ to user ${userId}. New balance: ${balanceAfter}₫`);
        
        return {
          success: true,
          refundTransaction,
          balanceAfter,
          message: `Đã hoàn ${serviceCost.toLocaleString('vi-VN')}₫ vào tài khoản do lưu voucher thất bại`
        };
        
      } catch (error) {
        console.error('Refund failed voucher saving error:', error);
        throw error;
      }
    });
  }

  // DATABASE MIGRATION MANAGEMENT METHODS
  // =====================================

  /**
   * Reset stuck migrations (running for more than 30 minutes) - handles missing columns gracefully
   */
  async resetStuckMigrations() {
    try {
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
      
      const stuckMigrations = await executeWithRetry(async () => {
        try {
          return await db
            .select()
            .from(databaseMigrationHistory)
            .where(and(
              eq(databaseMigrationHistory.status, 'running'),
              lt(databaseMigrationHistory.startTime, thirtyMinutesAgo)
            ));
        } catch (error) {
          // Handle missing columns gracefully
          if (error.code === '42703') {
            console.log(`[MIGRATION] Progress columns not available for stuck migration check, using basic query`);
            // Use raw SQL for backward compatibility
            const result = await db.execute(sql`
              SELECT id, source_database, target_database, status, start_time, end_time, 
                     records_migrated, total_records, errors, is_manual, metadata
              FROM database_migration_history 
              WHERE status = 'running' AND start_time < ${thirtyMinutesAgo}
            `);
            return result.rows;
          }
          throw error;
        }
      });

      if (stuckMigrations.length > 0) {
        console.log(`[MIGRATION] Found ${stuckMigrations.length} stuck migrations, resetting...`);
        
        for (const migration of stuckMigrations) {
          await executeWithRetry(async () => {
            try {
              await db
                .update(databaseMigrationHistory)
                .set({
                  status: 'failed',
                  endTime: new Date(),
                  errors: 'Migration was reset due to being stuck for more than 30 minutes'
                })
                .where(eq(databaseMigrationHistory.id, migration.id));
            } catch (error) {
              // Handle missing columns gracefully
              if (error.code === '42703') {
                console.log(`[MIGRATION] Progress columns not available for stuck migration update, using basic UPDATE`);
                // Use raw SQL for backward compatibility
                await db.execute(sql`
                  UPDATE database_migration_history 
                  SET status = 'failed', end_time = NOW(), 
                      errors = 'Migration was reset due to being stuck for more than 30 minutes'
                  WHERE id = ${migration.id}
                `);
              } else {
                throw error;
              }
            }
          });
          
          console.log(`[MIGRATION] Reset stuck migration ID: ${migration.id}`);
        }
        
        return stuckMigrations.length;
      }
      
      return 0;
    } catch (error) {
      console.error('[MIGRATION] Error resetting stuck migrations:', error);
      return 0;
    }
  }

  /**
   * Get current database migration status (handles missing columns gracefully)
   */
  async getDatabaseMigrationStatus() {
    try {
      const currentDbUrl = process.env.DATABASE_URL || '';
      
      // Auto-reset any stuck migrations first
      console.log('[MIGRATION] Checking for stuck migrations...');
      const resetCount = await this.resetStuckMigrations();
      console.log(`[MIGRATION] Reset ${resetCount} stuck migrations`);
      
      // Get latest config
      const config = await executeWithRetry(async () => {
        const result = await db
          .select()
          .from(databaseMigrationConfig)
          .orderBy(desc(databaseMigrationConfig.updatedAt))
          .limit(1);
        return result[0] || null;
      });

      // Get latest migration 
      const latestMigration = await executeWithRetry(async () => {
        const result = await db
          .select()
          .from(databaseMigrationHistory)
          .orderBy(desc(databaseMigrationHistory.startTime))
          .limit(1);
      return result[0] || null;
    });

    // Check if migration is currently running
    const runningMigration = await executeWithRetry(async () => {
      const result = await db
        .select()
        .from(databaseMigrationHistory)
        .where(eq(databaseMigrationHistory.status, 'running'))
        .limit(1);
      return result[0] || null;
    });

      return {
        isRunning: !!runningMigration,
        autoMigrationEnabled: config?.autoMigrationEnabled || false,
        currentDatabase: currentDbUrl,
        targetDatabase: config?.targetDatabaseUrl || '',
        lastRunTime: latestMigration?.startTime?.toISOString(),
        nextRunTime: config?.nextAutoMigrationAt?.toISOString(),
        totalRecords: runningMigration?.totalRecords || 0,
        migratedRecords: runningMigration?.recordsMigrated || 0,
        errors: runningMigration?.errors ? [runningMigration.errors] : []
      };
    } catch (error) {
      // Gracefully handle missing columns (schema not yet migrated)
      if (error.code === '42703') {
        console.log(`[MIGRATION] Database schema not yet fully migrated, returning basic status`);
        const currentDbUrl = process.env.DATABASE_URL || '';
        return {
          isRunning: false,
          autoMigrationEnabled: false,
          currentDatabase: currentDbUrl,
          targetDatabase: '',
          lastRunTime: undefined,
          nextRunTime: undefined,
          totalRecords: 0,
          migratedRecords: 0,
          errors: []
        };
      }
      console.error('Database migration status error:', error);
      throw error;
    }
  }

  /**
   * Test database connection
   */
  async testDatabaseConnection(databaseUrl: string): Promise<boolean> {
    try {
      // Create a test connection
      const { Pool } = await import('pg');
      const testPool = new Pool({
        connectionString: databaseUrl,
        max: 1,
        connectionTimeoutMillis: 10000,
      });

      // Test connection
      const client = await testPool.connect();
      await client.query('SELECT 1');
      client.release();
      await testPool.end();

      return true;
    } catch (error) {
      console.error('Database connection test failed:', error);
      return false;
    }
  }

  /**
   * Update migration configuration
   */
  async updateMigrationConfig(config: { targetDatabaseUrl: string; autoMigrationEnabled: boolean }) {
    const nextAutoMigration = config.autoMigrationEnabled 
      ? new Date(Date.now() + 12 * 60 * 60 * 1000) // 12 hours from now
      : null;

    return executeWithRetry(async () => {
      // Try to update existing config
      const existing = await db
        .select()
        .from(databaseMigrationConfig)
        .limit(1);

      if (existing.length > 0) {
        // Update existing
        return await db
          .update(databaseMigrationConfig)
          .set({
            targetDatabaseUrl: config.targetDatabaseUrl,
            autoMigrationEnabled: config.autoMigrationEnabled,
            nextAutoMigrationAt: nextAutoMigration,
            updatedAt: new Date()
          })
          .where(eq(databaseMigrationConfig.id, existing[0].id))
          .returning();
      } else {
        // Create new
        return await db
          .insert(databaseMigrationConfig)
          .values({
            targetDatabaseUrl: config.targetDatabaseUrl,
            autoMigrationEnabled: config.autoMigrationEnabled,
            nextAutoMigrationAt: nextAutoMigration
          })
          .returning();
      }
    });
  }

  /**
   * Start database migration
   */
  async startDatabaseMigration(targetDatabaseUrl: string, isManual: boolean = false): Promise<number> {
    // Try multiple ways to get DATABASE_URL
    let sourceDbUrl = process.env.DATABASE_URL;
    
    // Fallback: Read directly from .env file if process.env.DATABASE_URL is empty
    if (!sourceDbUrl) {
      try {
        const fs = await import('fs');
        const path = await import('path');
        const envFile = fs.readFileSync(path.join(process.cwd(), '.env'), 'utf8');
        const match = envFile.match(/DATABASE_URL=(.+)/);
        if (match) {
          sourceDbUrl = match[1].trim();
        }
      } catch (error) {
        console.error('[MIGRATION] Error reading .env file:', error);
      }
    }
    
    // Validate source URL exists
    if (!sourceDbUrl) {
      console.error('[MIGRATION] DATABASE_URL not found. Available env vars:', Object.keys(process.env).filter(k => k.includes('DATABASE')));
      console.error('[MIGRATION] process.env.DATABASE_URL:', process.env.DATABASE_URL ? 'exists but empty/undefined' : 'not found');
      throw new Error('Source database URL not configured - check DATABASE_URL environment variable or .env file');
    }
    
    console.log('[MIGRATION] Using source database:', sourceDbUrl.replace(/:[^:@]*@/, ':***@'));
    
    return executeWithRetry(async () => {
      let migration;
      
      try {
        [migration] = await db
          .insert(databaseMigrationHistory)
          .values({
            sourceDatabase: sourceDbUrl,
            targetDatabase: targetDatabaseUrl,
            status: 'running',
            isManual,
            metadata: JSON.stringify({
              startedBy: 'superadmin',
              migrationMethod: 'pg_dump_restore',
              timestamp: new Date().toISOString()
            })
          })
          .returning();
      } catch (error) {
        // Handle missing columns gracefully for schema migration
        if (error.code === '42703') {
          console.log(`[MIGRATION] Progress columns not available yet, using basic INSERT`);
          // Use raw SQL for backward compatibility
          const metadataStr = JSON.stringify({
            startedBy: 'superadmin',
            migrationMethod: 'pg_dump_restore',
            timestamp: new Date().toISOString()
          });
          const result = await db.execute(sql`
            INSERT INTO database_migration_history (
              source_database, target_database, status, is_manual, metadata, start_time
            ) VALUES (${sourceDbUrl}, ${targetDatabaseUrl}, 'running', ${isManual}, ${metadataStr}, NOW())
            RETURNING id, source_database, target_database, status, start_time, end_time, 
                     records_migrated, total_records, errors, is_manual, metadata
          `);
          migration = result.rows[0];
        } else {
          throw error;
        }
      }

      // Start migration process in background - don't await to return immediately
      setTimeout(async () => {
        try {
          await this.performDatabaseMigration(migration.id, sourceDbUrl, targetDatabaseUrl);
        } catch (error) {
          console.error(`[MIGRATION] Background migration ${migration.id} failed:`, error.message);
          console.error(`[MIGRATION] Full background error:`, error);
          
          // Update database record with error
          try {
            await executeWithRetry(async () => {
              await db
                .update(databaseMigrationHistory)
                .set({
                  status: 'failed',
                  endTime: new Date(),
                  errors: `Background migration error: ${error.message}`
                })
                .where(eq(databaseMigrationHistory.id, migration.id));
            });
          } catch (dbError) {
            console.error(`[MIGRATION] Failed to update database with error:`, dbError);
          }
        }
      }, 100);

      return migration.id;
    });
  }

  /**
   * Get database migration history - handles missing columns gracefully
   */
  async getDatabaseMigrationHistory(): Promise<DatabaseMigrationHistory[]> {
    return executeWithRetry(async () => {
      try {
        return await db
          .select()
          .from(databaseMigrationHistory)
          .orderBy(desc(databaseMigrationHistory.startTime))
          .limit(50);
      } catch (error: any) {
        // Handle missing columns gracefully
        if (error.code === '42703') {
          console.log(`[MIGRATION] Progress columns not available for history query, using basic query`);
          // Use raw SQL for backward compatibility
          const result = await db.execute(sql`
            SELECT id, source_database, target_database, status, start_time, end_time, 
                   records_migrated, total_records, errors, is_manual, metadata
            FROM database_migration_history 
            ORDER BY start_time DESC 
            LIMIT 50
          `);
          return result.rows;
        }
        throw error;
      }
    });
  }

  /**
   * Get table columns for dblink query
   */
  private async getTableColumns(client: any, tableName: string): Promise<string> {
    try {
      const result = await client.query(`
        SELECT column_name, data_type, udt_name
        FROM information_schema.columns 
        WHERE table_name = $1 AND table_schema = 'public'
        ORDER BY ordinal_position
      `, [tableName]);
      
      return result.rows.map((col: any) => {
        let colType = col.data_type;
        if (colType === 'USER-DEFINED') colType = col.udt_name;
        if (colType === 'character varying') colType = 'varchar';
        if (colType === 'timestamp without time zone') colType = 'timestamp';
        return `"${col.column_name}" ${colType}`;
      }).join(', ');
    } catch (error) {
      console.error(`[MIGRATION] Error getting columns for ${tableName}:`, error.message);
      return 'col1 text'; // fallback
    }
  }

  /**
   * Simplified database migration using pg_dump (most reliable approach)
   */
  private async performDatabaseMigration(migrationId: number, sourceUrl: string, targetUrl: string) {
    console.log(`[MIGRATION] Starting simplified migration ${migrationId}`);
    console.log(`[MIGRATION] Source: ${sourceUrl.substring(0, 50)}...`);
    console.log(`[MIGRATION] Target: ${targetUrl.substring(0, 50)}...`);

    try {
      console.log(`[MIGRATION] Step 1: Using pg_dump for reliable migration...`);
      
      // Test target connection first
      const { Pool } = await import('pg');
      const testPool = new Pool({
        connectionString: targetUrl,
        ssl: targetUrl.includes('supabase.com') ? { rejectUnauthorized: false } : false,
        max: 1
      });

      try {
        console.log(`[MIGRATION] Step 2: Testing target database connection...`);
        const testClient = await testPool.connect();
        await testClient.query('SELECT 1');
        testClient.release();
        console.log(`[MIGRATION] ✓ Target database connection successful`);
        
        await this.updateMigrationProgress(migrationId, 20, 100);
        console.log(`[MIGRATION] Progress: 20%`);
        
        console.log(`[MIGRATION] Step 3: Starting SQL-based migration (avoiding pg_dump version issues)...`);
        
        // Use direct SQL-based migration to avoid pg_dump version mismatch
        const sourcePool = new Pool({
          connectionString: sourceUrl,
          ssl: sourceUrl.includes('supabase.com') ? { rejectUnauthorized: false } : false,
          max: 2
        });
        
        const targetPool = testPool; // Reuse the test pool
        
        try {
          console.log(`[MIGRATION] Connecting to source and target databases...`);
          const sourceClient = await sourcePool.connect();
          const targetClient = await targetPool.connect();
          
          // Get all tables from source database
          console.log(`[MIGRATION] Getting table list from source database...`);
          const tablesResult = await sourceClient.query(`
            SELECT table_name, table_type 
            FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
            ORDER BY table_name
          `);
          
          const tables = tablesResult.rows;
          console.log(`[MIGRATION] Found ${tables.length} tables to migrate`);
          
          await this.updateMigrationProgress(migrationId, 30, 100);
          
          // First, create schema (tables, indexes, etc.)
          console.log(`[MIGRATION] Step 3a: Creating schema on target database...`);
          let tablesCreated = 0;
          let tableErrors = 0;
          
          for (let i = 0; i < tables.length; i++) {
            const table = tables[i];
            console.log(`[MIGRATION] Creating table ${table.table_name}...`);
            
            try {
              // Use pg_dump to get table DDL (more reliable than constructing manually)
              const { spawn } = await import('child_process');
              const { promisify } = await import('util');
              const execFile = promisify((await import('child_process')).execFile);
              
              try {
                // Extract table DDL using pg_dump
                const { stdout } = await execFile('pg_dump', [
                  sourceUrl,
                  '--schema-only',
                  '--table', table.table_name,
                  '--no-owner',
                  '--no-privileges'
                ], { timeout: 15000 });
                
                if (stdout && stdout.trim()) {
                  // Clean up the DDL and make it compatible with IF NOT EXISTS
                  let createSql = stdout
                    .replace(/CREATE TABLE /g, 'CREATE TABLE IF NOT EXISTS ')
                    .replace(/CREATE SEQUENCE /g, 'CREATE SEQUENCE IF NOT EXISTS ')
                    .replace(/CREATE INDEX /g, 'CREATE INDEX IF NOT EXISTS ')
                    .split('\n')
                    .filter(line => !line.startsWith('--') && line.trim())
                    .join('\n');
                  
                  // Execute DDL with statement timeout
                  await targetClient.query('SET statement_timeout = 15000'); // 15 second timeout
                  await targetClient.query(createSql);
                  await targetClient.query('SET statement_timeout = 0'); // Reset timeout
                  
                  console.log(`[MIGRATION] ✓ Created table ${table.table_name}`);
                  tablesCreated++;
                } else {
                  console.log(`[MIGRATION] ⚠️ No DDL output for table ${table.table_name}, skipping`);
                }
              } catch (pgDumpError) {
                console.log(`[MIGRATION] pg_dump failed for ${table.table_name}, falling back to simple CREATE...`);
                
                // Fallback: Simple table structure without complex schema
                const columnsResult = await sourceClient.query({
                  text: `SELECT column_name, data_type, is_nullable 
                         FROM information_schema.columns 
                         WHERE table_name = $1 AND table_schema = 'public'
                         ORDER BY ordinal_position`,
                  values: [table.table_name]
                });
                
                if (columnsResult.rows.length > 0) {
                  const columns = columnsResult.rows.map(row => 
                    `${row.column_name} ${row.data_type.toUpperCase()}${row.is_nullable === 'NO' ? ' NOT NULL' : ''}`
                  ).join(', ');
                  
                  const simpleSql = `CREATE TABLE IF NOT EXISTS ${table.table_name} (${columns});`;
                  
                  await targetClient.query('SET statement_timeout = 15000');
                  await targetClient.query(simpleSql);
                  await targetClient.query('SET statement_timeout = 0');
                  
                  console.log(`[MIGRATION] ✓ Created table ${table.table_name} (simplified)`);
                  tablesCreated++;
                } else {
                  console.log(`[MIGRATION] ⚠️ No columns found for table ${table.table_name}, skipping`);
                }
              }
            } catch (error) {
              tableErrors++;
              console.error(`[MIGRATION] ❌ Failed to create table ${table.table_name}:`, (error as Error).message);
              
              // Continue with next table instead of failing entire migration
              if (tableErrors > 5) {
                throw new Error(`Too many table creation errors (${tableErrors}/${tables.length}), aborting migration. Success: ${tablesCreated} tables`);
              }
            }
          }
          
          console.log(`[MIGRATION] Schema creation completed: ${tablesCreated} tables created, ${tableErrors} errors`);
          
          await this.updateMigrationProgress(migrationId, 50, 100);
          
          // Then, copy data
          console.log(`[MIGRATION] Step 3b: Copying data...`);
          for (let i = 0; i < tables.length; i++) {
            const table = tables[i];
            console.log(`[MIGRATION] Copying data for table ${table.table_name}...`);
            
            // Get column names for INSERT
            const columnsResult = await sourceClient.query(`
              SELECT column_name 
              FROM information_schema.columns 
              WHERE table_name = $1 AND table_schema = 'public'
              ORDER BY ordinal_position
            `, [table.table_name]);
            
            const columns = columnsResult.rows.map(r => r.column_name);
            
            if (columns.length > 0) {
              // Get all data from source table
              const dataResult = await sourceClient.query(`SELECT * FROM ${table.table_name}`);
              
              if (dataResult.rows.length > 0) {
                // Clear target table first
                await targetClient.query(`DELETE FROM ${table.table_name}`);
                
                // Insert data in batches
                const batchSize = 100;
                for (let j = 0; j < dataResult.rows.length; j += batchSize) {
                  const batch = dataResult.rows.slice(j, j + batchSize);
                  
                  const placeholders = batch.map((_, batchIndex) => 
                    `(${columns.map((_, colIndex) => `$${batchIndex * columns.length + colIndex + 1}`).join(', ')})`
                  ).join(', ');
                  
                  const values = batch.flatMap(row => columns.map(col => row[col]));
                  
                  const insertSql = `INSERT INTO ${table.table_name} (${columns.join(', ')}) VALUES ${placeholders}`;
                  await targetClient.query(insertSql, values);
                }
                
                console.log(`[MIGRATION] ✓ Copied ${dataResult.rows.length} rows to ${table.table_name}`);
              } else {
                console.log(`[MIGRATION] ✓ Table ${table.table_name} has no data to copy`);
              }
            }
          }
          
          console.log(`[MIGRATION] ✓ Data copy completed successfully`);
          
          // Step 3c: Copy database constraints, indexes, sequences, etc.
          console.log(`[MIGRATION] Step 3c: Creating constraints, indexes, and other database objects...`);
          
          // Copy primary keys and constraints
          console.log(`[MIGRATION] Creating primary keys and constraints...`);
          const constraintsResult = await sourceClient.query(`
            SELECT 
              tc.table_name,
              tc.constraint_name,
              tc.constraint_type,
              kcu.column_name,
              ccu.table_name AS foreign_table_name,
              ccu.column_name AS foreign_column_name
            FROM information_schema.table_constraints tc
            LEFT JOIN information_schema.key_column_usage kcu 
              ON tc.constraint_name = kcu.constraint_name
            LEFT JOIN information_schema.constraint_column_usage ccu 
              ON tc.constraint_name = ccu.constraint_name
            WHERE tc.table_schema = 'public' 
              AND tc.constraint_type IN ('PRIMARY KEY', 'FOREIGN KEY', 'UNIQUE', 'CHECK')
            ORDER BY tc.table_name, tc.constraint_type, tc.constraint_name
          `);
          
          let constraintsCreated = 0;
          let constraintErrors = 0;
          
          for (const constraint of constraintsResult.rows) {
            try {
              let constraintSql = '';
              
              if (constraint.constraint_type === 'PRIMARY KEY') {
                constraintSql = `ALTER TABLE ${constraint.table_name} ADD CONSTRAINT ${constraint.constraint_name} PRIMARY KEY (${constraint.column_name})`;
              } else if (constraint.constraint_type === 'FOREIGN KEY' && constraint.foreign_table_name) {
                constraintSql = `ALTER TABLE ${constraint.table_name} ADD CONSTRAINT ${constraint.constraint_name} FOREIGN KEY (${constraint.column_name}) REFERENCES ${constraint.foreign_table_name}(${constraint.foreign_column_name})`;
              } else if (constraint.constraint_type === 'UNIQUE') {
                constraintSql = `ALTER TABLE ${constraint.table_name} ADD CONSTRAINT ${constraint.constraint_name} UNIQUE (${constraint.column_name})`;
              }
              
              if (constraintSql) {
                await targetClient.query('SET statement_timeout = 15000');
                await targetClient.query(constraintSql);
                await targetClient.query('SET statement_timeout = 0');
                constraintsCreated++;
                console.log(`[MIGRATION] ✓ Created constraint ${constraint.constraint_name} on ${constraint.table_name}`);
              }
            } catch (error) {
              constraintErrors++;
              // Don't fail on constraint errors (may already exist or have dependencies)
              console.log(`[MIGRATION] ⚠️ Failed to create constraint ${constraint.constraint_name}: ${(error as Error).message}`);
            }
          }
          
          // Copy indexes
          console.log(`[MIGRATION] Creating indexes...`);
          const indexesResult = await sourceClient.query(`
            SELECT 
              indexname,
              tablename,
              indexdef
            FROM pg_indexes 
            WHERE schemaname = 'public' 
              AND indexname NOT LIKE '%_pkey'
            ORDER BY tablename, indexname
          `);
          
          let indexesCreated = 0;
          let indexErrors = 0;
          
          for (const index of indexesResult.rows) {
            try {
              // Modify index definition to use IF NOT EXISTS
              let indexSql = index.indexdef.replace(/CREATE INDEX /g, 'CREATE INDEX IF NOT EXISTS ');
              
              await targetClient.query('SET statement_timeout = 15000');
              await targetClient.query(indexSql);
              await targetClient.query('SET statement_timeout = 0');
              indexesCreated++;
              console.log(`[MIGRATION] ✓ Created index ${index.indexname} on ${index.tablename}`);
            } catch (error) {
              indexErrors++;
              console.log(`[MIGRATION] ⚠️ Failed to create index ${index.indexname}: ${(error as Error).message}`);
            }
          }
          
          // Copy sequences
          console.log(`[MIGRATION] Creating sequences...`);
          const sequencesResult = await sourceClient.query(`
            SELECT 
              sequence_name,
              start_value,
              increment,
              max_value,
              min_value,
              cycle_option
            FROM information_schema.sequences 
            WHERE sequence_schema = 'public'
            ORDER BY sequence_name
          `);
          
          let sequencesCreated = 0;
          
          for (const seq of sequencesResult.rows) {
            try {
              const seqSql = `CREATE SEQUENCE IF NOT EXISTS ${seq.sequence_name} 
                START WITH ${seq.start_value} 
                INCREMENT BY ${seq.increment} 
                MINVALUE ${seq.min_value} 
                MAXVALUE ${seq.max_value} 
                ${seq.cycle_option === 'YES' ? 'CYCLE' : 'NO CYCLE'}`;
              
              await targetClient.query(seqSql);
              sequencesCreated++;
              console.log(`[MIGRATION] ✓ Created sequence ${seq.sequence_name}`);
            } catch (error) {
              console.log(`[MIGRATION] ⚠️ Failed to create sequence ${seq.sequence_name}: ${(error as Error).message}`);
            }
          }
          
          console.log(`[MIGRATION] Database objects creation completed:`);
          console.log(`[MIGRATION] - ${constraintsCreated} constraints created (${constraintErrors} errors)`);
          console.log(`[MIGRATION] - ${indexesCreated} indexes created (${indexErrors} errors)`);
          console.log(`[MIGRATION] - ${sequencesCreated} sequences created`);
          
          sourceClient.release();
          targetClient.release();
          
        } finally {
          await sourcePool.end();
        }
        await this.updateMigrationProgress(migrationId, 90, 100);
        console.log(`[MIGRATION] Progress: 90%`);
        
        console.log(`[MIGRATION] Step 5: Verifying migration...`);
        
        // Quick verification of target database
        const verifyClient = await testPool.connect();
        const tableCheck = await verifyClient.query(`
          SELECT COUNT(*) as table_count 
          FROM information_schema.tables 
          WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        `);
        const tableCount = parseInt(tableCheck.rows[0].table_count);
        console.log(`[MIGRATION] ✓ Target database has ${tableCount} tables`);
        
        verifyClient.release();
        await this.updateMigrationProgress(migrationId, 95, 100);
        console.log(`[MIGRATION] Progress: 95%`);
        
        await this.updateMigrationProgress(migrationId, 100, 100);
        console.log(`[MIGRATION] Progress: 100%`);
        console.log(`[MIGRATION] ✓ Migration completed successfully`);
        
      } finally {
        await testPool.end();
      }

      // Update progress to completed
      await this.updateMigrationProgress(migrationId, 100, 100);

      // Mark migration as completed
      try {
        await executeWithRetry(async () => {
          await db
            .update(databaseMigrationHistory)
            .set({
              status: 'completed',
              endTime: new Date()
            })
            .where(eq(databaseMigrationHistory.id, migrationId));
        });
      } catch (error) {
        // Handle missing columns gracefully
        if ((error as any).code === '42703') {
          console.log(`[MIGRATION] Progress columns not available for completion, using basic update`);
          // Use raw SQL for backward compatibility
          await executeWithRetry(async () => {
            await db.execute(sql`
              UPDATE database_migration_history 
              SET status = 'completed', end_time = NOW() 
              WHERE id = ${migrationId}
            `);
          });
        } else {
          throw error;
        }
      }

      console.log(`[MIGRATION] Migration ${migrationId} completed successfully`);

    } catch (error) {
      console.error(`[MIGRATION] Migration ${migrationId} failed:`, error);

      // Mark migration as failed  
      try {
        await executeWithRetry(async () => {
          await db
            .update(databaseMigrationHistory)
            .set({
              status: 'failed',
              endTime: new Date(),
              errors: (error as Error).message
            })
            .where(eq(databaseMigrationHistory.id, migrationId));
        });
      } catch (updateError) {
        // Handle missing columns gracefully
        if ((updateError as any).code === '42703') {
          console.log(`[MIGRATION] Progress columns not available for error update, using basic update`);
          // Use raw SQL for backward compatibility
          await executeWithRetry(async () => {
            await db.execute(sql`
              UPDATE database_migration_history 
              SET status = 'failed', end_time = NOW(), errors = ${(error as Error).message}
              WHERE id = ${migrationId}
            `);
          });
        } else {
          console.error(`[MIGRATION] Failed to update migration status:`, updateError);
        }
      }
    }
  }

  /**
   * Get complete table creation SQL including all constraints and defaults
   */
  private async getTableCreateSql(client: any, tableName: string): Promise<string> {
    // Get table columns with full definitions
    const columnsResult = await client.query(`
      SELECT 
        c.column_name,
        c.data_type,
        c.character_maximum_length,
        c.numeric_precision,
        c.numeric_scale,
        c.is_nullable,
        c.column_default,
        CASE 
          WHEN c.data_type = 'USER-DEFINED' THEN c.udt_name
          WHEN c.data_type = 'ARRAY' THEN REPLACE(c.udt_name, '_', '') || '[]'
          ELSE c.data_type
        END as full_type
      FROM information_schema.columns c
      WHERE c.table_name = $1
      ORDER BY c.ordinal_position
    `, [tableName]);

    // Build CREATE TABLE SQL
    let createSql = `CREATE TABLE "${tableName}" (\n`;
    
    const columnDefinitions = columnsResult.rows.map(col => {
      let columnDef = `  "${col.column_name}" `;
      
      // Handle different data types
      if (col.character_maximum_length && col.data_type === 'character varying') {
        columnDef += `VARCHAR(${col.character_maximum_length})`;
      } else if (col.numeric_precision && col.data_type === 'numeric') {
        columnDef += `NUMERIC(${col.numeric_precision},${col.numeric_scale || 0})`;
      } else {
        columnDef += col.full_type.toUpperCase();
      }
      
      // Handle null/not null
      if (col.is_nullable === 'NO') {
        columnDef += ' NOT NULL';
      }
      
      // Handle defaults
      if (col.column_default) {
        columnDef += ` DEFAULT ${col.column_default}`;
      }
      
      return columnDef;
    });

    createSql += columnDefinitions.join(',\n');
    createSql += '\n)';

    return createSql;
  }

  /**
   * Update migration progress in database (handles missing columns gracefully)
   */
  private async updateMigrationProgress(migrationId: number, progress: number, totalSteps: number): Promise<void> {
    try {
      await executeWithRetry(async () => {
        await db
          .update(databaseMigrationHistory)
          .set({
            progress,
            totalSteps
          })
          .where(eq(databaseMigrationHistory.id, migrationId));
      });
    } catch (error) {
      // Gracefully handle missing columns (schema not yet migrated)
      if ((error as any).code === '42703') {
        console.log(`[MIGRATION] Progress columns not yet available, skipping progress update`);
        return;
      }
      throw error;
    }
  }

  // ============================================================================
  // SHOPEE COOKIE PAIRS AUTO-FETCH & VALIDATION METHODS
  // ============================================================================

  /**
   * Get all cookie pairs (optionally filter by validity)
   */
  async getCookiePairs(isValid?: boolean): Promise<ShopeeCookiePair[]> {
    const conditions = isValid !== undefined ? eq(shopeeCookiePairs.isValid, isValid) : undefined;
    return await executeWithRetry(async () => {
      return await db
        .select()
        .from(shopeeCookiePairs)
        .where(conditions)
        .orderBy(desc(shopeeCookiePairs.createdAt));
    });
  }

  /**
   * Create a new cookie pair
   */
  async createCookiePair(data: InsertShopeeCookiePair): Promise<ShopeeCookiePair> {
    const result = await executeWithRetry(async () => {
      return await db
        .insert(shopeeCookiePairs)
        .values({
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();
    });
    return result[0];
  }

  /**
   * Update cookie pair validity
   */
  async updateCookiePairValidity(id: number, isValid: boolean, validationError?: string): Promise<void> {
    await executeWithRetry(async () => {
      await db
        .update(shopeeCookiePairs)
        .set({
          isValid,
          validationError,
          lastValidated: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(shopeeCookiePairs.id, id));
    });
  }

  /**
   * Delete a cookie pair
   */
  async deleteCookiePair(id: number): Promise<void> {
    await executeWithRetry(async () => {
      await db.delete(shopeeCookiePairs).where(eq(shopeeCookiePairs.id, id));
    });
  }

  /**
   * Validate a single cookie pair by checking account
   */
  async validateCookiePair(spcSt: string, spcScSession: string): Promise<{ isValid: boolean; error?: string }> {
    try {
      const url = "https://banhang.shopee.vn/api/v3/general/profile/";
      
      const headers = {
        "Cookie": `SPC_ST=${spcSt}; SPC_SC_SESSION=${spcScSession}`,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
        "Referer": "https://banhang.shopee.vn/"
      };

      const response = await fetch(url, { 
        headers,
        method: 'GET'
      });

      const responseText = await response.text();
      
      // Check if authentication failed
      if (responseText.includes("Failed to authenticate") || response.status === 403 || response.status === 401) {
        return { isValid: false, error: "Failed to authenticate - cookie expired" };
      }

      // Check if response is valid JSON with user data
      try {
        const data = JSON.parse(responseText);
        if (data && (data.data || data.userid || data.username)) {
          return { isValid: true };
        }
      } catch (e) {
        // Not valid JSON
      }

      return { isValid: false, error: "Invalid response from API" };
    } catch (error: any) {
      return { isValid: false, error: error.message };
    }
  }

  /**
   * Auto-fetch cookie pairs from database
   * Fetches 200 newest SPC_ST cookies, extracts SPC_SC_SESSION, and saves pairs
   * OPTIMIZED: Parallel processing with batch size 10 for 70% faster performance
   */
  async autoFetchCookiePairsFromDatabase(): Promise<{ success: number; failed: number; skipped: number }> {
    console.log('[AUTO-FETCH COOKIES] Starting auto-fetch from database...');
    
    let success = 0;
    let failed = 0;
    let skipped = 0;
    let pairNumberCounter = 0;

    try {
      // Get 200 newest SPC_ST cookies from tracking_checks table (joined with shopeeCookies)
      const spcStCookies = await executeWithRetry(async () => {
        return await db
          .select({
            id: shopeeCookies.id,
            cookieValue: shopeeCookies.cookieValue,
            cookieType: shopeeCookies.cookieType,
            createdAt: trackingChecks.createdAt,
          })
          .from(trackingChecks)
          .innerJoin(shopeeCookies, eq(trackingChecks.cookieId, shopeeCookies.id))
          .where(eq(shopeeCookies.cookieType, 'SPC_ST'))
          .orderBy(desc(trackingChecks.createdAt))
          .limit(200);
      });

      console.log(`[AUTO-FETCH COOKIES] Found ${spcStCookies.length} SPC_ST cookies from tracking_checks`);
      
      // Debug: Show newest and oldest cookies
      if (spcStCookies.length > 0) {
        const newest = spcStCookies[0];
        const oldest = spcStCookies[spcStCookies.length - 1];
        console.log(`[AUTO-FETCH DEBUG] Newest cookie created at: ${newest.createdAt}`);
        console.log(`[AUTO-FETCH DEBUG] Oldest cookie created at: ${oldest.createdAt}`);
        
        const now = new Date();
        const newestAge = Math.floor((now.getTime() - new Date(newest.createdAt).getTime()) / 1000 / 60 / 60); // hours
        console.log(`[AUTO-FETCH DEBUG] Newest cookie age: ${newestAge} hours`);
      }

      // Get initial max pair number
      const existingPairs = await executeWithRetry(async () => {
        return await db
          .select()
          .from(systemConfig)
          .where(sql`${systemConfig.configKey} LIKE 'SPC_ST_pair_%'`)
          .orderBy(desc(systemConfig.id));
      });
      
      const pairNumbers = existingPairs
        .map(p => {
          const match = p.configKey.match(/SPC_ST_pair_(\d+)/);
          return match ? parseInt(match[1]) : 0;
        })
        .filter(n => n > 0);
      
      pairNumberCounter = pairNumbers.length > 0 ? Math.max(...pairNumbers) : 0;

      // PARALLEL PROCESSING: Process in batches of 10
      const BATCH_SIZE = 10;
      const batches: any[][] = [];
      
      for (let i = 0; i < spcStCookies.length; i += BATCH_SIZE) {
        batches.push(spcStCookies.slice(i, i + BATCH_SIZE));
      }

      console.log(`[AUTO-FETCH COOKIES] Processing ${spcStCookies.length} cookies in ${batches.length} batches (batch size: ${BATCH_SIZE})`);

      // Helper function to process a single cookie
      const processCookie = async (cookie: any, isFirstInBatch: boolean) => {
        try {
          // Strip 'SPC_ST=' prefix if exists
          let spcSt = cookie.cookieValue;
          if (spcSt.startsWith('SPC_ST=')) {
            spcSt = spcSt.substring(7);
          }

          // Extract SPC_SC_SESSION by making request with SPC_ST
          const url = "https://banhang.shopee.vn/";
          
          const options = {
            method: 'GET',
            headers: {
              "Cookie": `SPC_ST=${spcSt}`,
              "Accept-Language": "en-US,en;q=0.9",
              "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
              "Upgrade-Insecure-Requests": "1",
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
              "Sec-Fetch-Site": "same-origin",
              "Sec-Fetch-Mode": "cors",
              "Sec-Fetch-Dest": "empty",
              "Referer": "https://banhang.shopee.vn/",
              "Accept-Encoding": "gzip, deflate, br",
              "Priority": "u=0, i"
            }
          };

          const setCookieHeaders: string[] = await new Promise((resolve, reject) => {
            const req = https.get(url, options, (res: any) => {
              if (isFirstInBatch && success === 0 && failed === 0 && skipped === 0) {
                console.log(`[AUTO-FETCH DEBUG] Request headers sent:`, options.headers);
                console.log(`[AUTO-FETCH DEBUG] Response status: ${res.statusCode}`);
              }
              
              const cookies = res.headers['set-cookie'] || [];
              resolve(Array.isArray(cookies) ? cookies : [cookies]);
            });
            req.on('error', (err: any) => {
              reject(err);
            });
            req.setTimeout(10000, () => {
              req.destroy();
              reject(new Error('Request timeout'));
            });
          });

          // Find SPC_SC_SESSION from Set-Cookie headers
          const spcScSessionCookie = setCookieHeaders.find(h => h.includes('SPC_SC_SESSION='));
          if (!spcScSessionCookie) {
            return { status: 'failed', reason: 'No SPC_SC_SESSION in response' };
          }

          const spcScSessionMatch = spcScSessionCookie.match(/SPC_SC_SESSION=([^;]+)/);
          if (!spcScSessionMatch) {
            return { status: 'failed', reason: 'Cannot parse SPC_SC_SESSION' };
          }

          const spcScSession = spcScSessionMatch[1];

          // Assign next pair number atomically
          pairNumberCounter++;
          const nextPairNumber = pairNumberCounter;

          // Create config entries for both cookies
          try {
            await this.createSystemConfig({
              configKey: `SPC_ST_pair_${nextPairNumber}`,
              configValue: spcSt,
              configType: 'shopee_cookie',
              description: `Auto-fetched SPC_ST cookie pair ${nextPairNumber}`,
              isActive: true,
            });

            await this.createSystemConfig({
              configKey: `SPC_SC_SESSION_pair_${nextPairNumber}`,
              configValue: spcScSession,
              configType: 'shopee_cookie',
              description: `Auto-fetched SPC_SC_SESSION cookie pair ${nextPairNumber}`,
              isActive: true,
            });

            return { status: 'success', pairNumber: nextPairNumber };
          } catch (insertError: any) {
            if (insertError.code === '23505' || insertError.message?.includes('duplicate') || insertError.message?.includes('unique')) {
              return { status: 'skipped', reason: 'Duplicate' };
            } else {
              return { status: 'failed', reason: insertError.message };
            }
          }
        } catch (error: any) {
          return { status: 'failed', reason: error.message };
        }
      };

      // Process each batch in parallel
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        
        const results = await Promise.allSettled(
          batch.map((cookie, index) => processCookie(cookie, index === 0))
        );

        // Count results
        for (const result of results) {
          if (result.status === 'fulfilled') {
            const value = result.value;
            if (value.status === 'success') {
              success++;
              console.log(`[AUTO-FETCH COOKIES] ✓ Successfully created cookie pair ${value.pairNumber}`);
            } else if (value.status === 'skipped') {
              skipped++;
            } else {
              failed++;
            }
          } else {
            failed++;
            console.error(`[AUTO-FETCH COOKIES] Error:`, result.reason);
          }
        }

        // Delay between batches to avoid rate limiting
        if (batchIndex < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      console.log(`[AUTO-FETCH COOKIES] Completed - Success: ${success}, Failed: ${failed}, Skipped: ${skipped}`);
      return { success, failed, skipped };
    } catch (error: any) {
      console.error('[AUTO-FETCH COOKIES] Fatal error:', error);
      throw error;
    }
  }

  /**
   * Fetch fresh SPC_SC_SESSION from Shopee using SPC_ST token
   * Returns the new SPC_SC_SESSION value or null if failed
   * Includes retry logic with exponential backoff
   */
  private async fetchSPCSCSession(spcSt: string, maxRetries: number = 3): Promise<string | null> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const url = "https://banhang.shopee.vn/";
        
        const options = {
          method: 'GET',
          headers: {
            "Cookie": `SPC_ST=${spcSt}`,
            "Accept-Language": "en-US,en;q=0.9",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
            "Upgrade-Insecure-Requests": "1",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
            "Sec-Fetch-Site": "same-origin",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Dest": "empty",
            "Referer": "https://banhang.shopee.vn/",
            "Accept-Encoding": "gzip, deflate, br",
            "Priority": "u=0, i"
          }
        };

        // Get Set-Cookie headers from response
        const setCookieHeaders: string[] = await new Promise((resolve, reject) => {
          const req = https.get(url, options, (res: any) => {
            const cookies = res.headers['set-cookie'] || [];
            resolve(Array.isArray(cookies) ? cookies : [cookies]);
          });
          req.on('error', (err: any) => {
            reject(err);
          });
          req.setTimeout(10000, () => {
            req.destroy();
            reject(new Error('Request timeout'));
          });
        });

        // Find and parse SPC_SC_SESSION from Set-Cookie headers
        const spcScSessionCookie = setCookieHeaders.find(h => h.includes('SPC_SC_SESSION='));
        if (!spcScSessionCookie) {
          if (attempt < maxRetries) {
            const delay = Math.pow(2, attempt) * 1000; // Exponential backoff: 2s, 4s, 8s
            console.log(`[FETCH SPC_SC_SESSION] No SPC_SC_SESSION found, retry ${attempt}/${maxRetries} after ${delay}ms`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
          return null;
        }

        const spcScSessionMatch = spcScSessionCookie.match(/SPC_SC_SESSION=([^;]+)/);
        if (!spcScSessionMatch) {
          if (attempt < maxRetries) {
            const delay = Math.pow(2, attempt) * 1000;
            console.log(`[FETCH SPC_SC_SESSION] Failed to parse SPC_SC_SESSION, retry ${attempt}/${maxRetries} after ${delay}ms`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
          return null;
        }

        return spcScSessionMatch[1];
      } catch (error: any) {
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
          console.error(`[FETCH SPC_SC_SESSION] Error on attempt ${attempt}/${maxRetries}: ${error.message}, retrying after ${delay}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          console.error(`[FETCH SPC_SC_SESSION] Failed after ${maxRetries} attempts:`, error.message);
          return null;
        }
      }
    }
    return null;
  }

  /**
   * Auto-validate all cookie pairs from system_config and remove invalid ones
   */
  async autoValidateAllCookiePairs(): Promise<{ validated: number; invalid: number; deleted: number }> {
    console.log('[AUTO-VALIDATE COOKIES] Starting validation of cookie pairs from system_config...');
    
    let validated = 0;
    let invalid = 0;
    let deleted = 0;

    try {
      // Get all SPC_ST cookies from system_config (ONLY _pair pattern) - 🚀 VALIDATE ALL (not just active)
      const spcStConfigs = await executeWithRetry(async () => {
        return await db
          .select()
          .from(systemConfig)
          .where(sql`${systemConfig.configKey} LIKE 'SPC_ST_pair_%'`);
      });

      console.log(`[AUTO-VALIDATE COOKIES] Found ${spcStConfigs.length} SPC_ST_pair cookies to validate (including inactive)`);

      for (const spcStConfig of spcStConfigs) {
        try {
          // Extract pair number from key like "SPC_ST_pair_1"
          const match = spcStConfig.configKey.match(/SPC_ST_pair_(\d+)/);
          if (!match) {
            console.log(`[AUTO-VALIDATE COOKIES] Invalid key format: ${spcStConfig.configKey}`);
            continue;
          }

          const pairNumber = match[1];
          const spcSt = spcStConfig.configValue;

          // Find corresponding SPC_SC_SESSION_pair config
          const spcScSessionConfig = await executeWithRetry(async () => {
            return await db
              .select()
              .from(systemConfig)
              .where(eq(systemConfig.configKey, `SPC_SC_SESSION_pair_${pairNumber}`))
              .limit(1);
          });

          if (spcScSessionConfig.length === 0) {
            console.log(`[AUTO-VALIDATE COOKIES] No SPC_SC_SESSION found for pair ${pairNumber}`);
            continue;
          }

          // Fetch fresh SPC_SC_SESSION from Shopee
          console.log(`[AUTO-VALIDATE COOKIES] Fetching fresh SPC_SC_SESSION for pair ${pairNumber}...`);
          const newSpcScSession = await this.fetchSPCSCSession(spcSt);
          validated++;

          if (!newSpcScSession) {
            // Failed to get SPC_SC_SESSION
            invalid++;
            
            // Check if cookie is already inactive (failed before)
            if (!spcStConfig.isActive) {
              // Already failed once before - DELETE permanently
              console.log(`[AUTO-VALIDATE COOKIES] ✗ Pair ${pairNumber} failed twice - DELETING`);
              
              await executeWithRetry(async () => {
                await db
                  .delete(systemConfig)
                  .where(eq(systemConfig.id, spcStConfig.id));
              });

              await executeWithRetry(async () => {
                await db
                  .delete(systemConfig)
                  .where(eq(systemConfig.id, spcScSessionConfig[0].id));
              });

              deleted += 2;
              console.log(`[AUTO-VALIDATE COOKIES] ✓ Deleted pair ${pairNumber} after 2 consecutive failures`);
            } else {
              // First failure - SOFT DISABLE (set isActive=false)
              console.log(`[AUTO-VALIDATE COOKIES] ✗ Pair ${pairNumber} failed once - soft disabling`);
              
              await executeWithRetry(async () => {
                await db
                  .update(systemConfig)
                  .set({ isActive: false, updatedAt: new Date() })
                  .where(eq(systemConfig.id, spcStConfig.id));
              });

              await executeWithRetry(async () => {
                await db
                  .update(systemConfig)
                  .set({ isActive: false, updatedAt: new Date() })
                  .where(eq(systemConfig.id, spcScSessionConfig[0].id));
              });
              
              console.log(`[AUTO-VALIDATE COOKIES] ✓ Soft-disabled pair ${pairNumber} (will delete if fails again)`);
            }
          } else {
            // Successfully fetched new SPC_SC_SESSION - update it and re-enable
            await executeWithRetry(async () => {
              await db
                .update(systemConfig)
                .set({ 
                  configValue: newSpcScSession,
                  isActive: true,
                  updatedAt: new Date()
                })
                .where(eq(systemConfig.id, spcScSessionConfig[0].id));
            });

            // Also ensure SPC_ST is active
            if (!spcStConfig.isActive) {
              await executeWithRetry(async () => {
                await db
                  .update(systemConfig)
                  .set({ isActive: true, updatedAt: new Date() })
                  .where(eq(systemConfig.id, spcStConfig.id));
              });
            }
            
            console.log(`[AUTO-VALIDATE COOKIES] ✓ Updated & re-enabled pair ${pairNumber}`);
          }

          // Add delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error: any) {
          console.error(`[AUTO-VALIDATE COOKIES] Error validating pair:`, error.message);
        }
      }

      console.log(`[AUTO-VALIDATE COOKIES] Completed - Validated: ${validated}, Invalid: ${invalid}, Deleted: ${deleted} configs`);
      return { validated, invalid, deleted };
    } catch (error: any) {
      console.error('[AUTO-VALIDATE COOKIES] Fatal error:', error);
      throw error;
    }
  }
}

// Create and export storage instance
export const storage = new DatabaseStorage();
