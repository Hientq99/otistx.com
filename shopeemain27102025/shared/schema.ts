/**
 * SCHEMA DATABASE
 * ===============
 * 
 * Định nghĩa schema cho tất cả các bảng trong hệ thống
 * Sử dụng Drizzle ORM với PostgreSQL
 * 
 * Bao gồm:
 * - Users (người dùng)
 * - Shopee services (dịch vụ Shopee)
 * - Phone rental (thuê số điện thoại)
 * - TikTok rental (thuê số TikTok)
 * - System config (cấu hình hệ thống)
 * - Transaction tracking (theo dõi giao dịch)
 */

import { pgTable, text, serial, integer, decimal, timestamp, boolean, varchar, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table for authentication
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  email: text("email").unique(),
  password: text("password").notNull(),
  fullName: text("full_name").notNull(),
  phone: text("phone"),
  role: text("role").notNull().default("user"), // "user" | "admin" | "superadmin"
  balance: decimal("balance", { precision: 15, scale: 2 }).notNull().default("0"), // User wallet balance
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  manager: text("manager").notNull(),
  budget: decimal("budget", { precision: 15, scale: 2 }).notNull(),
  spent: decimal("spent", { precision: 15, scale: 2 }).notNull().default("0"),
  status: text("status").notNull().default("active"), // "active" | "completed" | "on_hold"
  progress: integer("progress").notNull().default(0), // 0-100
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const resources = pgTable("resources", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(), // "human" | "equipment" | "software"
  projectId: integer("project_id").references(() => projects.id),
  allocation: integer("allocation").notNull(), // percentage or quantity
  cost: decimal("cost", { precision: 15, scale: 2 }).notNull(),
});

export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  targetUserId: integer("target_user_id").references(() => users.id), // User being affected by the action
  action: text("action").notNull(), // "login", "logout", "update_user", "update_balance", etc.
  description: text("description").notNull(),
  beforeData: jsonb("before_data"), // Data before change
  afterData: jsonb("after_data"), // Data after change
  ipAddress: text("ip_address").notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

export const activities = pgTable("activities", {
  id: serial("id").primaryKey(),
  description: text("description").notNull(),
  type: text("type").notNull(), // "success" | "warning" | "info" | "error"
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

// Shopee phone rental requests
export const phoneRentals = pgTable("phone_rentals", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  phoneNumber: text("phone_number").notNull(),
  carrier: text("carrier").notNull(), // "viettel" | "vinaphone" | "mobifone"
  status: text("status").notNull().default("pending"), // "pending" | "active" | "completed" | "cancelled"
  otpCode: text("otp_code"),
  rentPrice: decimal("rent_price", { precision: 10, scale: 2 }).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Shopee cookies management
export const shopeeCookies = pgTable("shopee_cookies", {
  id: text("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  cookieType: text("cookie_type").notNull(), // 'SPC_F' or 'SPC_ST'
  cookieValue: text("cookie_value").notNull(),
  shopeeRegion: text("shopee_region"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Phone number checks
export const phoneChecks = pgTable("phone_checks", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  phoneNumber: text("phone_number").notNull(),
  isRegistered: boolean("is_registered").notNull(),
  cost: integer("cost").default(0).notNull(),
  userIp: text("user_ip"),
  checkedAt: timestamp("checked_at").defaultNow().notNull(),
}, (table) => [
  // Index for user history queries
  index("idx_phone_checks_user_time").on(table.userId, table.checkedAt),
  // Index for phone number lookups
  index("idx_phone_checks_phone").on(table.phoneNumber)
]);

// Tracking info checks
export const trackingChecks = pgTable("tracking_checks", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  cookieId: text("cookie_id").references(() => shopeeCookies.id),
  cookiePreview: text("cookie_preview").notNull(),
  status: boolean("status").notNull(),
  message: text("message").notNull(),
  orderCount: integer("order_count").default(0),
  // Order details fields
  orderId: text("order_id"),
  trackingNumber: text("tracking_number"),
  trackingInfo: text("tracking_info"),
  shippingName: text("shipping_name"),
  shippingPhone: text("shipping_phone"),
  shippingAddress: text("shipping_address"),
  orderName: text("order_name"),
  orderPrice: text("order_price"),
  orderTime: text("order_time"),
  proxy: text("proxy"),
  userIp: text("user_ip"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Cookie rapid checks
export const cookieRapidChecks = pgTable("cookie_rapid_checks", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  cookieId: text("cookie_id").references(() => shopeeCookies.id),
  cookiePreview: text("cookie_preview").notNull(),
  status: boolean("status").notNull(),
  message: text("message").notNull(),
  orderCount: integer("order_count").default(0),
  // Order details fields
  orderId: text("order_id"),
  trackingNumber: text("tracking_number"),
  trackingInfo: text("tracking_info"),
  shippingName: text("shipping_name"),
  shippingPhone: text("shipping_phone"),
  shippingAddress: text("shipping_address"),
  orderName: text("order_name"),
  orderPrice: text("order_price"),
  orderTime: text("order_time"),
  // Driver/shipper fields - specific for rapid check
  driverPhone: text("driver_phone"),
  driverName: text("driver_name"),
  proxy: text("proxy"),
  userIp: text("user_ip"),
  metadata: jsonb("metadata"), // JSON metadata for storing additional operation data
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Email additions to Shopee accounts
export const emailAdditions = pgTable("email_additions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  cookieId: text("cookie_id").notNull(), // Store cookie ID as simple text identifier
  cookiePreview: text("cookie_preview").notNull(), // First 20 chars for display
  email: text("email").notNull(),
  status: boolean("status").notNull().default(false), // true for success, false for failed
  message: text("message").notNull(), // Success or error message
  userIp: text("user_ip"),
  proxy: text("proxy"), // Proxy used for the request
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  // Index for user history queries
  index("idx_email_additions_user_time").on(table.userId, table.createdAt),
  // Index for cookie-based queries
  index("idx_email_additions_cookie").on(table.cookieId)
]);

// User transactions (deposits, payments, etc.)
export const transactions = pgTable("transactions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  type: text("type").notNull(), // "top_up" | "phone_rental" | "cookie_service" | "tracking" | "email_service" | "express_tracking" | "freeship_voucher"
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(), // Positive for deposits, negative for expenses
  description: text("description").notNull(),
  status: text("status").notNull().default("pending"), // "pending" | "completed" | "failed" | "cancelled"
  reference: text("reference").unique(), // Payment reference or transaction ID - UNIQUE to prevent duplicate refunds
  metadata: jsonb("metadata"), // Additional transaction data
  balanceBefore: decimal("balance_before", { precision: 15, scale: 2 }), // Balance before transaction
  balanceAfter: decimal("balance_after", { precision: 15, scale: 2 }), // Balance after transaction
  adminNote: text("admin_note"), // Note from admin when manually adjusting balance
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  // EGRESS OPTIMIZATION: Composite index for high-traffic user queries (2,874 calls, 4.8M+ rows scanned)
  index("idx_transactions_user_created").on(table.userId, table.createdAt),
  // Index for reference-based lookups (already unique but explicit index for performance)
  index("idx_transactions_reference").on(table.reference),
  // Index for user + type queries (admin transactions, refunds, etc.)
  index("idx_transactions_user_type").on(table.userId, table.type)
]);

// Service usage history
export const serviceUsageHistory = pgTable("service_usage_history", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  serviceType: text("service_type").notNull(), // "phone_rental" | "cookie_manager" | "tracking" | "email_addition" | "account_check" | "express_tracking" | "freeship_voucher"
  serviceName: text("service_name").notNull(),
  description: text("description").notNull(),
  status: text("status").notNull(), // "success" | "processing" | "failed"
  cost: decimal("cost", { precision: 15, scale: 2 }).default("0"), // Cost of the service
  metadata: jsonb("metadata"), // Service-specific data
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Service pricing configuration
export const servicePricing = pgTable("service_pricing", {
  id: serial("id").primaryKey(),
  serviceType: text("service_type").notNull(), // "phone_rental" | "cookie_manager" | "tracking" | "email_addition" | "account_check" | "express_tracking" | "freeship_voucher"
  serviceName: text("service_name").notNull().unique(), // Make serviceName unique instead of serviceType
  price: decimal("price", { precision: 15, scale: 2 }).notNull(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// System configuration for API keys and settings
export const systemConfig = pgTable("system_config", {
  id: serial("id").primaryKey(),
  configKey: text("config_key").notNull(),
  configValue: text("config_value").notNull(),
  configType: text("config_type").notNull(), // "proxy_key" | "sim_service_key" | "api_key" | "setting"
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Shopee cookie pairs (SPC_ST + SPC_SC_SESSION) - AUTO-FETCHED AND VALIDATED
export const shopeeCookiePairs = pgTable("shopee_cookie_pairs", {
  id: serial("id").primaryKey(),
  spcSt: text("spc_st").notNull().unique(), // SPC_ST cookie
  spcScSession: text("spc_sc_session").notNull(), // SPC_SC_SESSION extracted from response header
  source: text("source").default("manual"), // "manual" | "auto_fetched"
  isValid: boolean("is_valid").notNull().default(true), // Updated by auto-validator
  lastValidated: timestamp("last_validated").defaultNow().notNull(), // Last validation time
  validationError: text("validation_error"), // Error message if validation fails
  usageCount: integer("usage_count").notNull().default(0), // Track usage for rotation
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_cookie_pairs_valid").on(table.isValid),
  index("idx_cookie_pairs_validated").on(table.lastValidated),
]);

// Phone numbers registered with Shopee
export const phoneShopee = pgTable("phone_shopee", {
  id: serial("id").primaryKey(),
  phoneNumber: text("phone_number").notNull().unique(),
  isRegistered: boolean("is_registered").notNull().default(true),
  checkedAt: timestamp("checked_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Phone rental history
export const phoneRentalHistory = pgTable("phone_rental_history", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  sessionId: text("session_id").notNull().unique(),
  service: text("service").notNull(), // 'otissim_v1', 'otissim_v2', or 'otissim_v3'
  carrier: text("carrier").notNull(),
  phoneNumber: text("phone_number").notNull(),
  status: text("status").notNull(), // 'waiting', 'completed', 'expired', 'failed'
  otpCode: text("otp_code"),
  cost: integer("cost").notNull(),
  startTime: timestamp("start_time").notNull(),
  completedTime: timestamp("completed_time"),
  expiresAt: timestamp("expires_at").notNull(),
  apiResponseData: text("api_response_data"), // JSON string of API response
  userIp: text("user_ip"),
  refundProcessed: boolean("refund_processed").notNull().default(false), // Track if refund has been processed
  refundProcessedAt: timestamp("refund_processed_at"), // When refund was processed
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  // EGRESS OPTIMIZATION: Critical indexes for massive query optimization
  // Index for user + status filtered queries (28,685 calls, 10M+ rows scanned)
  index("idx_phone_rental_user_status_time").on(table.userId, table.status, table.startTime),
  // Index for session-based lookups (36,569 calls) - sessionId already unique but explicit index
  index("idx_phone_rental_session").on(table.sessionId),
  // Index for expired sessions cleanup queries
  index("idx_phone_rental_expires").on(table.expiresAt, table.status),
  // Index for refund processing queries (new schema-based refund tracking)
  index("idx_phone_rental_refund").on(table.refundProcessed, table.status),
  // Index for user history queries ordered by creation time
  index("idx_phone_rental_user_created").on(table.userId, table.createdAt)
]);

// Account check history
export const accountChecks = pgTable("account_checks", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  cookieId: text("cookie_id").references(() => shopeeCookies.id),
  cookiePreview: text("cookie_preview").notNull(), // First 20 chars of cookie for identification
  status: boolean("status").notNull(), // true if check was successful
  message: text("message").notNull(),
  username: text("username"),
  nickname: text("nickname"),
  email: text("email"),
  phone: text("phone"),
  userid: text("userid"),
  userIp: text("user_ip"),
  shopid: text("shopid"),
  ctime: text("ctime"), // Account creation time from Shopee
  proxy: text("proxy"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// SPC_F extraction from SPC_ST
export const spcFExtractions = pgTable("spc_f_extractions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  cookieId: text("cookie_id").references(() => shopeeCookies.id),
  spcSt: text("spc_st").notNull(), // Input SPC_ST cookie
  spcF: text("spc_f"), // Extracted SPC_F cookie from response header
  username: text("username"), // Username from API response
  status: boolean("status").notNull(), // true if extraction was successful
  message: text("message").notNull(),
  proxy: text("proxy"),
  userIp: text("user_ip"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Cookie extractions
export const cookieExtractions = pgTable("cookie_extractions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  method: text("method").notNull(), // 'SPC_F' or 'QR'
  input: text("input").notNull(), // Input data (SPC_F|password|proxy or QR session info)
  spcSt: text("spc_st"),
  spcF: text("spc_f"),
  status: text("status").notNull(), // 'success' or 'failed'
  message: text("message").notNull(),
  cost: integer("cost").default(0).notNull(),
  proxy: text("proxy"),
  userIp: text("user_ip"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Express tracking checks - Check mã vận đơn hỏa tốc
export const expressTrackingChecks = pgTable("express_tracking_checks", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  cookieId: text("cookie_id").references(() => shopeeCookies.id),
  cookiePreview: text("cookie_preview").notNull(),
  trackingNumber: text("tracking_number").notNull(), // Mã vận đơn
  status: boolean("status").notNull(),
  message: text("message").notNull(),
  orderCount: integer("order_count").default(0),
  // Express delivery specific fields
  expressCarrier: text("express_carrier"), // Express delivery service (J&T Express, GHN, etc.)
  estimatedDelivery: text("estimated_delivery"), // Estimated delivery time
  currentStatus: text("current_status"), // Current delivery status
  lastUpdate: text("last_update"), // Last status update
  deliveryAddress: text("delivery_address"), // Delivery address
  recipientName: text("recipient_name"), // Recipient name
  recipientPhone: text("recipient_phone"), // Recipient phone
  // Order details
  orderId: text("order_id"),
  orderName: text("order_name"),
  orderPrice: text("order_price"),
  orderTime: text("order_time"),
  shippingFee: text("shipping_fee"), // Express shipping fee
  proxy: text("proxy"),
  userIp: text("user_ip"),
  cost: integer("cost").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Freeship voucher storage system
export const freeshipVouchers = pgTable("freeship_vouchers", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  voucherCode: text("voucher_code").notNull().unique(),
  voucherName: text("voucher_name").notNull(),
  description: text("description"),
  // Voucher details
  minOrderValue: decimal("min_order_value", { precision: 15, scale: 2 }).default("0"), // Minimum order value
  maxDiscount: decimal("max_discount", { precision: 15, scale: 2 }).default("0"), // Maximum discount amount
  discountType: text("discount_type").notNull().default("freeship"), // "freeship", "percentage", "fixed"
  discountValue: decimal("discount_value", { precision: 15, scale: 2 }).default("0"), // Discount amount or percentage
  // Status and availability
  status: text("status").notNull().default("active"), // "active", "expired", "used", "disabled"
  isActive: boolean("is_active").notNull().default(true),
  usageLimit: integer("usage_limit").default(1), // How many times can be used
  usedCount: integer("used_count").default(0).notNull(), // How many times has been used
  // Time constraints
  validFrom: timestamp("valid_from").notNull(),
  validUntil: timestamp("valid_until").notNull(),
  // Shopee specific
  shopeeCategory: text("shopee_category"), // Applicable categories
  shopeeRegion: text("shopee_region").default("VN"), // Country/region
  sellerShopId: text("seller_shop_id"), // Specific shop if applicable
  // Metadata
  source: text("source").notNull().default("manual"), // "manual", "api", "scraper"
  tags: text("tags"), // Comma-separated tags for filtering
  priority: integer("priority").default(0), // Priority for sorting (higher = more important)
  notes: text("notes"), // Admin notes
  // Tracking
  lastUsed: timestamp("last_used"),
  createdBy: integer("created_by").references(() => users.id),
  updatedBy: integer("updated_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Freeship voucher usage tracking
export const freeshipVoucherUsage = pgTable("freeship_voucher_usage", {
  id: serial("id").primaryKey(),
  voucherId: integer("voucher_id").references(() => freeshipVouchers.id).notNull(),
  userId: integer("user_id").references(() => users.id).notNull(),
  orderId: text("order_id"), // Shopee order ID where used
  orderValue: decimal("order_value", { precision: 15, scale: 2 }), // Order amount
  discountApplied: decimal("discount_applied", { precision: 15, scale: 2 }), // Actual discount amount
  status: text("status").notNull().default("used"), // "used", "failed", "refunded"
  userIp: text("user_ip"),
  metadata: jsonb("metadata"), // Additional usage data
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// API Keys for external access
export const apiKeys = pgTable("api_keys", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  keyName: text("key_name").notNull(),
  keyValue: text("key_value").notNull().unique(),
  isActive: boolean("is_active").notNull().default(true),
  lastUsedAt: timestamp("last_used_at"),
  requestCount: integer("request_count").notNull().default(0),
  monthlyRequestLimit: integer("monthly_request_limit").default(1000),
  dailyRequestCount: integer("daily_request_count").notNull().default(0),
  lastResetDate: timestamp("last_reset_date").defaultNow(),
  permissions: text("permissions"), // JSON string of allowed services
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Top-up requests for QR code payments
export const topupRequests = pgTable("topup_requests", {
  id: text("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  amount: integer("amount").notNull(),
  description: text("description").notNull(),
  qrUrl: text("qr_url").notNull(),
  status: text("status").notNull().default("pending"), // "pending" | "completed" | "expired"
  transactionId: text("transaction_id"), // Bank transaction ID when completed
  bankReference: text("bank_reference"), // Bank reference from webhook
  balanceBefore: text("balance_before"),
  balanceAfter: text("balance_after"), 
  adminNote: text("admin_note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
});

// Insert schemas
export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  email: true,
  password: true,
  fullName: true,
  phone: true,
  role: true,
});

export const registerSchema = z.object({
  // Họ và tên: 5-50 ký tự, chỉ chữ cái tiếng Việt và khoảng trắng
  fullName: z.string()
    .min(5, "Họ và tên phải có ít nhất 5 ký tự")
    .max(50, "Họ và tên không được quá 50 ký tự")
    .regex(/^[A-Za-zÀ-ỹ\s]{5,50}$/, "Họ và tên phải có từ 5 đến 50 ký tự và không chứa số hoặc ký tự đặc biệt"),
  
  // Tên đăng nhập: 4-20 ký tự, chỉ chữ thường, số, gạch dưới
  username: z.string()
    .min(4, "Tên đăng nhập phải có ít nhất 4 ký tự")
    .max(20, "Tên đăng nhập không được quá 20 ký tự")
    .regex(/^[a-z0-9_]{4,20}$/, "Tên đăng nhập phải từ 4 đến 20 ký tự, chỉ bao gồm chữ thường, số và dấu gạch dưới"),
  
  // Email: định dạng email hợp lệ
  email: z.string()
    .min(1, "Email là bắt buộc")
    .email("Email không hợp lệ")
    .regex(/^[\w\.-]+@[\w\.-]+\.\w{2,}$/, "Email không hợp lệ hoặc đã được sử dụng"),
  
  // Số điện thoại: tùy chọn, nếu có thì phải đúng định dạng VN
  phone: z.string()
    .optional()
    .refine((val) => !val || /^(0[3|5|7|8|9])[0-9]{8}$/.test(val), {
      message: "Số điện thoại không hợp lệ"
    }),
  
  // Mật khẩu: ít nhất 8 ký tự, có chữ hoa, chữ thường, số và ký tự đặc biệt
  password: z.string()
    .min(8, "Mật khẩu phải có ít nhất 8 ký tự")
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\w\s]).{8,}$/, "Mật khẩu phải có ít nhất 8 ký tự, bao gồm chữ hoa, chữ thường, số và ký tự đặc biệt"),
  
  // Xác nhận mật khẩu
  confirmPassword: z.string().min(1, "Vui lòng xác nhận mật khẩu"),
  
  // Đồng ý điều khoản sử dụng
  agreeToTerms: z.boolean().refine((val) => val === true, {
    message: "Bạn phải đồng ý với điều khoản sử dụng dịch vụ",
  }),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Mật khẩu xác nhận không khớp",
  path: ["confirmPassword"],
});

export const insertProjectSchema = createInsertSchema(projects).pick({
  name: true,
  manager: true,
  budget: true,
  status: true,
});

export const insertResourceSchema = createInsertSchema(resources).pick({
  name: true,
  type: true,
  projectId: true,
  allocation: true,
  cost: true,
});

export const insertAuditLogSchema = createInsertSchema(auditLogs).pick({
  userId: true,
  targetUserId: true,
  action: true,
  description: true,
  beforeData: true,
  afterData: true,
  ipAddress: true,
});

export const insertActivitySchema = createInsertSchema(activities).pick({
  description: true,
  type: true,
});

export const insertPhoneRentalSchema = createInsertSchema(phoneRentals).pick({
  phoneNumber: true,
  carrier: true,
  rentPrice: true,
  expiresAt: true,
});

export const insertPhoneRentalHistorySchema = createInsertSchema(phoneRentalHistory).pick({
  userId: true,
  sessionId: true,
  service: true,
  carrier: true,
  phoneNumber: true,
  status: true,
  otpCode: true,
  cost: true,
  startTime: true,
  completedTime: true,
  expiresAt: true,
  apiResponseData: true,
  userIp: true,
});

export const insertShopeeCookieSchema = createInsertSchema(shopeeCookies).pick({
  cookieType: true,
  cookieValue: true,
  shopeeRegion: true,
});

export const insertPhoneCheckSchema = createInsertSchema(phoneChecks).pick({
  phoneNumber: true,
  isRegistered: true,
  cost: true,
});

export const insertTrackingCheckSchema = createInsertSchema(trackingChecks).omit({
  id: true,
  userId: true,
  createdAt: true,
});

export const insertCookieRapidCheckSchema = createInsertSchema(cookieRapidChecks).omit({
  id: true,
  userId: true,
  createdAt: true,
});

export const insertEmailAdditionSchema = createInsertSchema(emailAdditions).pick({
  cookieId: true,
  cookiePreview: true,
  email: true,
  status: true,
  message: true,
  proxy: true,
  userIp: true,
});

export const insertTransactionSchema = createInsertSchema(transactions).pick({
  type: true,
  amount: true,
  description: true,
  status: true,
  reference: true,
  metadata: true,
  balanceBefore: true,
  balanceAfter: true,
  adminNote: true,
});

export const insertServiceUsageSchema = createInsertSchema(serviceUsageHistory).pick({
  serviceType: true,
  serviceName: true,
  description: true,
  status: true,
  cost: true,
  metadata: true,
});

export const insertServicePricingSchema = createInsertSchema(servicePricing).pick({
  serviceType: true,
  serviceName: true,
  price: true,
  description: true,
  isActive: true,
});

export const insertSystemConfigSchema = createInsertSchema(systemConfig).pick({
  configKey: true,
  configValue: true,
  configType: true,
  description: true,
  isActive: true,
});

export const insertShopeeCookiePairSchema = createInsertSchema(shopeeCookiePairs).pick({
  spcSt: true,
  spcScSession: true,
  source: true,
  isValid: true,
});

export const insertPhoneShopeeSchema = createInsertSchema(phoneShopee).pick({
  phoneNumber: true,
  isRegistered: true,
});

export const insertAccountCheckSchema = createInsertSchema(accountChecks).pick({
  cookieId: true,
  cookiePreview: true,
  status: true,
  message: true,
  username: true,
  nickname: true,
  email: true,
  phone: true,
  userid: true,
  shopid: true,
  ctime: true,
  proxy: true,
  userIp: true,
});

export const insertSpcFExtractionSchema = createInsertSchema(spcFExtractions).pick({
  cookieId: true,
  spcSt: true,
  spcF: true,
  username: true,
  status: true,
  message: true,
  proxy: true,
  userIp: true,
});

export const insertCookieExtractionSchema = createInsertSchema(cookieExtractions).pick({
  method: true,
  input: true,
  spcSt: true,
  spcF: true,
  status: true,
  message: true,
  cost: true,
  proxy: true,
  userIp: true,
});

export const insertApiKeySchema = createInsertSchema(apiKeys).omit({
  id: true,
  userId: true,
  lastUsedAt: true,
  requestCount: true,
  dailyRequestCount: true,
  lastResetDate: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTopupRequestSchema = createInsertSchema(topupRequests).pick({
  amount: true,
  description: true,
});

// TikTok phone rental sessions
export const tiktokRentals = pgTable("tiktok_rentals", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  sessionId: text("session_id").notNull().unique(),
  service: text("service").notNull(), // "tiktoksim_v1"
  carrier: text("carrier").notNull(), // "main_3", "vnmb", "itel", "random"
  phoneNumber: text("phone_number").notNull(),
  status: text("status").notNull().default("waiting"), // "waiting" | "completed" | "expired" | "failed"
  otpCode: text("otp_code"),
  cost: integer("cost").notNull().default(1200), // Cost in VND
  apiId: text("api_id"), // ChayCodeso3 API ID
  startTime: timestamp("start_time").defaultNow().notNull(),
  completedTime: timestamp("completed_time"),
  expiresAt: timestamp("expires_at").notNull(),
  apiResponse: jsonb("api_response"), // Store API response data
  userIp: text("user_ip"),
  refundProcessed: boolean("refund_processed").notNull().default(false), // Track if refund has been processed
  refundProcessedAt: timestamp("refund_processed_at"), // When refund was processed
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  // Index for session lookups
  index("idx_tiktok_session").on(table.sessionId),
  // Index for user + status queries
  index("idx_tiktok_user_status").on(table.userId, table.status),
  // Index for refund processing
  index("idx_tiktok_refund").on(table.refundProcessed, table.status),
  // Index for expired sessions cleanup
  index("idx_tiktok_expires").on(table.expiresAt, table.status)
]);

export const insertTiktokRentalSchema = createInsertSchema(tiktokRentals);

// Voucher saving operations
export const voucherSavingOperations = pgTable("voucher_saving_operations", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  sessionId: text("session_id").notNull(), // UUID để track cùng 1 session bulk
  cookieId: text("cookie_id"), // Nullable for bulk operations
  cookiePreview: text("cookie_preview").notNull(), // First 20 chars for display
  status: text("status").notNull(), // "pending" | "success" | "failed"
  totalVouchersFound: integer("total_vouchers_found").default(0),
  successfulSaves: integer("successful_saves").default(0),
  failedSaves: integer("failed_saves").default(0),
  cost: integer("cost").default(3000).notNull(), // Cost per operation
  message: text("message").notNull(),
  proxy: text("proxy"),
  userIp: text("user_ip"),
  metadata: jsonb("metadata"), // Store idempotency key and other operation metadata
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

// Individual voucher save results
export const voucherSaveResults = pgTable("voucher_save_results", {
  id: serial("id").primaryKey(),
  operationId: integer("operation_id").references(() => voucherSavingOperations.id).notNull(),
  voucherCode: text("voucher_code").notNull(),
  promotionId: text("promotion_id").notNull(),
  signature: text("signature").notNull(),
  voucherName: text("voucher_name").notNull(),
  status: boolean("status").notNull(), // true for success, false for failed
  saveResponse: jsonb("save_response"), // Full API response from Shopee
  errorMessage: text("error_message"), // Error message if failed
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertVoucherSavingOperationSchema = createInsertSchema(voucherSavingOperations).pick({
  sessionId: true,
  cookieId: true,
  cookiePreview: true,
  status: true,
  totalVouchersFound: true,
  successfulSaves: true,
  failedSaves: true,
  cost: true,
  message: true,
  proxy: true,
  userIp: true,
  completedAt: true,
});

export const insertVoucherSaveResultSchema = createInsertSchema(voucherSaveResults).pick({
  operationId: true,
  voucherCode: true,
  promotionId: true,
  signature: true,
  voucherName: true,
  status: true,
  saveResponse: true,
  errorMessage: true,
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Project = typeof projects.$inferSelect;
export type InsertProject = z.infer<typeof insertProjectSchema>;

export type Resource = typeof resources.$inferSelect;
export type InsertResource = z.infer<typeof insertResourceSchema>;

export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;

export type Activity = typeof activities.$inferSelect;
export type InsertActivity = z.infer<typeof insertActivitySchema>;

export type PhoneRental = typeof phoneRentals.$inferSelect;
export type InsertPhoneRental = z.infer<typeof insertPhoneRentalSchema>;

export type ShopeeCookie = typeof shopeeCookies.$inferSelect;
export type InsertShopeeCookie = z.infer<typeof insertShopeeCookieSchema>;

export type PhoneCheck = typeof phoneChecks.$inferSelect;
export type InsertPhoneCheck = z.infer<typeof insertPhoneCheckSchema>;

export type TrackingCheck = typeof trackingChecks.$inferSelect;
export type InsertTrackingCheck = z.infer<typeof insertTrackingCheckSchema>;

export type CookieRapidCheck = typeof cookieRapidChecks.$inferSelect;
export type InsertCookieRapidCheck = z.infer<typeof insertCookieRapidCheckSchema>;

export type EmailAddition = typeof emailAdditions.$inferSelect;
export type InsertEmailAddition = z.infer<typeof insertEmailAdditionSchema>;

export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;

export type ServiceUsageHistory = typeof serviceUsageHistory.$inferSelect;
export type InsertServiceUsage = z.infer<typeof insertServiceUsageSchema>;

export type ServicePricing = typeof servicePricing.$inferSelect;
export type InsertServicePricing = z.infer<typeof insertServicePricingSchema>;

export type SystemConfig = typeof systemConfig.$inferSelect;
export type InsertSystemConfig = z.infer<typeof insertSystemConfigSchema>;

export type ShopeeCookiePair = typeof shopeeCookiePairs.$inferSelect;
export type InsertShopeeCookiePair = z.infer<typeof insertShopeeCookiePairSchema>;

export type PhoneShopee = typeof phoneShopee.$inferSelect;
export type InsertPhoneShopee = z.infer<typeof insertPhoneShopeeSchema>;

export type AccountCheck = typeof accountChecks.$inferSelect;
export type InsertAccountCheck = z.infer<typeof insertAccountCheckSchema>;

export type SpcFExtraction = typeof spcFExtractions.$inferSelect;
export type InsertSpcFExtraction = z.infer<typeof insertSpcFExtractionSchema>;

export type CookieExtraction = typeof cookieExtractions.$inferSelect;
export type InsertCookieExtraction = z.infer<typeof insertCookieExtractionSchema>;

export type PhoneRentalHistory = typeof phoneRentalHistory.$inferSelect;
export type InsertPhoneRentalHistory = z.infer<typeof insertPhoneRentalHistorySchema>;

export type ApiKey = typeof apiKeys.$inferSelect & { permissions: string[] };
export type InsertApiKey = z.infer<typeof insertApiKeySchema> & { permissions: string[] };

export type TopupRequest = typeof topupRequests.$inferSelect;
export type InsertTopupRequest = z.infer<typeof insertTopupRequestSchema>;

// HTTP Proxy management table
export const httpProxies = pgTable("http_proxies", {
  id: serial("id").primaryKey(),
  ip: text("ip").notNull(),
  port: integer("port").notNull(),
  username: text("username").notNull(),
  password: text("password").notNull(),
  label: text("label"), // Optional label for easy identification
  isActive: boolean("is_active").notNull().default(true),
  lastUsed: timestamp("last_used"),
  totalUsage: integer("total_usage").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertHttpProxySchema = createInsertSchema(httpProxies).omit({
  id: true,
  totalUsage: true,
  lastUsed: true,
  createdAt: true,
  updatedAt: true,
});

export type HttpProxy = typeof httpProxies.$inferSelect;
export type InsertHttpProxy = z.infer<typeof insertHttpProxySchema>;

export type TiktokRental = typeof tiktokRentals.$inferSelect;
export type InsertTiktokRental = z.infer<typeof insertTiktokRentalSchema>;

export type VoucherSavingOperation = typeof voucherSavingOperations.$inferSelect;
export type InsertVoucherSavingOperation = z.infer<typeof insertVoucherSavingOperationSchema>;

// Express tracking checks insert schemas
export const insertExpressTrackingCheckSchema = createInsertSchema(expressTrackingChecks).omit({
  id: true,
  userId: true,
  createdAt: true,
});

export type ExpressTrackingCheck = typeof expressTrackingChecks.$inferSelect;
export type InsertExpressTrackingCheck = z.infer<typeof insertExpressTrackingCheckSchema>;

// Freeship voucher insert schemas
export const insertFreeshipVoucherSchema = createInsertSchema(freeshipVouchers).omit({
  id: true,
  usedCount: true,
  lastUsed: true,
  createdAt: true,
  updatedAt: true,
}).refine((data) => {
  return data.voucherCode.startsWith('FSV-');
}, {
  message: 'Mã voucher phải bắt đầu bằng "FSV-"',
  path: ['voucherCode'],
});

export const insertFreeshipVoucherUsageSchema = createInsertSchema(freeshipVoucherUsage).omit({
  id: true,
  createdAt: true,
});

export type FreeshipVoucher = typeof freeshipVouchers.$inferSelect;
export type InsertFreeshipVoucher = z.infer<typeof insertFreeshipVoucherSchema>;

export type FreeshipVoucherUsage = typeof freeshipVoucherUsage.$inferSelect;
export type InsertFreeshipVoucherUsage = z.infer<typeof insertFreeshipVoucherUsageSchema>;

export type VoucherSaveResult = typeof voucherSaveResults.$inferSelect;
export type InsertVoucherSaveResult = z.infer<typeof insertVoucherSaveResultSchema>;

// Login schema
export const loginSchema = z.object({
  username: z.string().min(1, "Tên đăng nhập là bắt buộc"),
  password: z.string().min(1, "Mật khẩu là bắt buộc"),
});

export type LoginData = z.infer<typeof loginSchema>;
export type RegisterData = z.infer<typeof registerSchema>;

// Voucher saving request schema
export const voucherSavingRequestSchema = z.object({
  cookies: z.array(
    z.union([
      z.string().min(1, "Cookie không được để trống"), // Bulk cookie strings
      z.object({
        id: z.string().min(1, "Cookie ID là bắt buộc"), // Saved cookie ID
      }),
      z.object({
        cookie: z.string().min(1, "Cookie không được để trống"), // Direct cookie value
      })
    ])
  ).min(1, "Phải có ít nhất một cookie")
});

export type VoucherSavingRequest = z.infer<typeof voucherSavingRequestSchema>;

// Username check table  
export const usernameChecks = pgTable("username_checks", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  username: text("username").notNull(),
  status: integer("status"), // 1 = active, 2 = banned, null = error/unknown
  isAvailable: boolean("is_available"), // true if account exists and active
  userIp: text("user_ip"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertUsernameCheckSchema = createInsertSchema(usernameChecks).omit({
  id: true,
  createdAt: true,
});

export type UsernameCheck = typeof usernameChecks.$inferSelect;
export type InsertUsernameCheck = z.infer<typeof insertUsernameCheckSchema>;

// External API Integration - Store user's API keys for external providers
export const externalApiKeys = pgTable("external_api_keys", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  provider: text("provider").notNull(), // "viotp" | "chaycodes3" | "365otp" | "funotp" | "ironsim" | "bossotp"
  keyName: text("key_name").notNull(),
  keyValue: text("key_value").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  balance: decimal("balance", { precision: 15, scale: 2 }), // Last known balance
  lastBalanceCheck: timestamp("last_balance_check"),
  balanceCheckError: text("balance_check_error"), // Last error message if any
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  // Index for fast lookups by user
  index("idx_external_api_keys_user").on(table.userId),
  // Index for active keys
  index("idx_external_api_keys_active").on(table.isActive)
]);

// External API Rental Sessions - Track rental sessions from external providers
export const externalApiRentals = pgTable("external_api_rentals", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  sessionId: text("session_id").notNull().unique(), // Our internal session ID
  provider: text("provider").notNull(), // "viotp" | "chaycodes3" | "365otp" | "funotp" | "ironsim" | "bossotp"
  providerRequestId: text("provider_request_id"), // External provider's request/order ID
  phoneNumber: text("phone_number"),
  formattedPhoneNumber: text("formatted_phone_number"), // e.g., "84987654321"
  carrier: text("carrier"), // Provider's carrier info
  status: text("status").notNull().default("requesting"), // "requesting" | "allocated" | "waiting_otp" | "otp_received" | "cancelled" | "expired" | "failed"
  otpCode: text("otp_code"),
  smsContent: text("sms_content"),
  price: decimal("price", { precision: 15, scale: 2 }),
  isShopeeRegistered: boolean("is_shopee_registered"), // Result of Shopee check
  shopeeCheckAttempts: integer("shopee_check_attempts").default(0),
  maxAttempts: integer("max_attempts").default(10),
  attemptNumber: integer("attempt_number").default(1),
  errorMessage: text("error_message"),
  metadata: jsonb("metadata"), // Store additional provider-specific data
  expiresAt: timestamp("expires_at"),
  allocatedAt: timestamp("allocated_at"), // When number was allocated
  otpReceivedAt: timestamp("otp_received_at"), // When OTP was received
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  // Index for fast lookups by user and provider
  index("idx_external_rentals_user_provider").on(table.userId, table.provider),
  // Index for status-based queries
  index("idx_external_rentals_status").on(table.status),
  // Index for provider request ID lookups
  index("idx_external_rentals_provider_id").on(table.providerRequestId),
  // Index for session ID (unique already)
  index("idx_external_rentals_session").on(table.sessionId)
]);

export const insertExternalApiKeySchema = createInsertSchema(externalApiKeys).omit({
  id: true,
  balance: true,
  lastBalanceCheck: true,
  balanceCheckError: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  provider: z.enum(['viotp', 'chaycodes3', '365otp', 'funotp', 'ironsim', 'bossotp'])
});

export const insertExternalApiRentalSchema = createInsertSchema(externalApiRentals).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  provider: z.enum(['viotp', 'chaycodes3', '365otp', 'funotp', 'ironsim', 'bossotp'])
});

// Database Migration Management Tables
export const databaseMigrationConfig = pgTable("database_migration_config", {
  id: serial("id").primaryKey(),
  targetDatabaseUrl: text("target_database_url"), // URL of target database
  autoMigrationEnabled: boolean("auto_migration_enabled").default(false),
  lastAutoMigrationAt: timestamp("last_auto_migration_at"),
  nextAutoMigrationAt: timestamp("next_auto_migration_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const databaseMigrationHistory = pgTable("database_migration_history", {
  id: serial("id").primaryKey(),
  sourceDatabase: text("source_database").notNull(),
  targetDatabase: text("target_database").notNull(),
  status: text("status").notNull().default("running"), // "running" | "completed" | "failed"
  startTime: timestamp("start_time").defaultNow().notNull(),
  endTime: timestamp("end_time"),
  recordsMigrated: integer("records_migrated").default(0),
  totalRecords: integer("total_records").default(0),
  progress: integer("progress").default(0), // 0-100 migration progress
  totalSteps: integer("total_steps").default(100), // Total migration steps
  errors: text("errors"),
  isManual: boolean("is_manual").default(false), // Manual trigger vs automatic
  metadata: jsonb("metadata"), // Additional migration details
}, (table) => [
  // Index for status-based queries
  index("idx_migration_history_status").on(table.status),
  // Index for time-based queries
  index("idx_migration_history_time").on(table.startTime)
]);

export const insertDatabaseMigrationConfigSchema = createInsertSchema(databaseMigrationConfig).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertDatabaseMigrationHistorySchema = createInsertSchema(databaseMigrationHistory).omit({
  id: true,
  startTime: true,
});

export type DatabaseMigrationConfig = typeof databaseMigrationConfig.$inferSelect;
export type InsertDatabaseMigrationConfig = z.infer<typeof insertDatabaseMigrationConfigSchema>;

export type DatabaseMigrationHistory = typeof databaseMigrationHistory.$inferSelect;
export type InsertDatabaseMigrationHistory = z.infer<typeof insertDatabaseMigrationHistorySchema>;

export type ExternalApiKey = typeof externalApiKeys.$inferSelect;
export type InsertExternalApiKey = z.infer<typeof insertExternalApiKeySchema>;

export type ExternalApiRental = typeof externalApiRentals.$inferSelect;
export type InsertExternalApiRental = z.infer<typeof insertExternalApiRentalSchema>;
