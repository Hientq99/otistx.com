import { sql } from "drizzle-orm";
import { db } from "./db";
import bcrypt from "bcryptjs";

/**
 * HỆ THỐNG KHỞI TẠO DATABASE TỰ ĐỘNG
 * =================================
 *
 * File này chứa toàn bộ logic khởi tạo database tự động khi ứng dụng khởi động
 * Bao gồm:
 * - Tạo schema đầy đủ cho 25+ bảng
 * - Tạo 3 tài khoản mặc định
 * - Cấu hình giá dịch vụ
 * - Thiết lập system config
 */

// Khởi tạo schema database với đầy đủ các bảng
const initializeDatabase = async () => {
  console.log("Đang khởi tạo schema database...");

  try {
    // Test database connection first
    await db.execute(sql`SELECT 1`);
    console.log("Database connection successful");
    
    // Create all tables with proper schema
    await db.execute(sql`
      -- Users table
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        email TEXT,
        password TEXT NOT NULL,
        full_name TEXT NOT NULL,
        phone TEXT,
        role TEXT NOT NULL DEFAULT 'user',
        balance NUMERIC NOT NULL DEFAULT 0,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      -- Sessions table
      CREATE TABLE IF NOT EXISTS sessions (
        sid VARCHAR NOT NULL PRIMARY KEY,
        sess JSONB NOT NULL,
        expire TIMESTAMP NOT NULL
      );

      -- Transactions table
      CREATE TABLE IF NOT EXISTS transactions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        type TEXT NOT NULL,
        amount NUMERIC NOT NULL,
        description TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        reference TEXT,
        metadata JSONB,
        balance_before NUMERIC,
        balance_after NUMERIC,
        admin_note TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      -- Shopee cookies table
      CREATE TABLE IF NOT EXISTS shopee_cookies (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        cookie_type TEXT NOT NULL,
        cookie_value TEXT NOT NULL,
        shopee_region TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      -- Phone checks table
      CREATE TABLE IF NOT EXISTS phone_checks (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        phone_number TEXT NOT NULL,
        is_registered BOOLEAN NOT NULL,
        cost INTEGER NOT NULL DEFAULT 0,
        checked_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      -- Phone Shopee table
      CREATE TABLE IF NOT EXISTS phone_shopee (
        id SERIAL PRIMARY KEY,
        phone_number TEXT NOT NULL UNIQUE,
        is_registered BOOLEAN NOT NULL DEFAULT true,
        checked_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      -- Account checks table
      CREATE TABLE IF NOT EXISTS account_checks (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        cookie_id TEXT,
        cookie_preview TEXT NOT NULL,
        status BOOLEAN NOT NULL,
        message TEXT NOT NULL,
        username TEXT,
        nickname TEXT,
        email TEXT,
        phone TEXT,
        userid TEXT,
        shopid TEXT,
        ctime TEXT,
        proxy TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      -- SPC_F extractions table
      CREATE TABLE IF NOT EXISTS spc_f_extractions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        cookie_id TEXT,
        spc_st TEXT NOT NULL,
        spc_f TEXT,
        username TEXT,
        status BOOLEAN NOT NULL,
        message TEXT NOT NULL,
        proxy TEXT,
        user_ip TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      -- Tracking checks table
      CREATE TABLE IF NOT EXISTS tracking_checks (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        cookie_id TEXT,
        cookie_preview TEXT NOT NULL,
        status BOOLEAN NOT NULL,
        message TEXT NOT NULL,
        order_count INTEGER DEFAULT 0,
        order_id TEXT,
        tracking_number TEXT,
        tracking_info TEXT,
        shipping_name TEXT,
        shipping_phone TEXT,
        shipping_address TEXT,
        order_name TEXT,
        order_price TEXT,
        order_time TEXT,
        proxy TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      -- Cookie rapid checks table
      CREATE TABLE IF NOT EXISTS cookie_rapid_checks (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        cookie_id TEXT,
        cookie_preview TEXT NOT NULL,
        status BOOLEAN NOT NULL,
        message TEXT NOT NULL,
        order_count INTEGER DEFAULT 0,
        order_id TEXT,
        tracking_number TEXT,
        tracking_info TEXT,
        shipping_name TEXT,
        shipping_phone TEXT,
        shipping_address TEXT,
        order_name TEXT,
        order_price TEXT,
        order_time TEXT,
        driver_phone TEXT,
        driver_name TEXT,
        proxy TEXT,
        user_ip TEXT,
        metadata JSONB,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      -- Email additions table
      CREATE TABLE IF NOT EXISTS email_additions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        cookie_id TEXT NOT NULL,
        cookie_preview TEXT NOT NULL,
        email TEXT NOT NULL,
        status BOOLEAN NOT NULL DEFAULT false,
        message TEXT NOT NULL,
        proxy TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      -- Cookie extractions table
      CREATE TABLE IF NOT EXISTS cookie_extractions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        method TEXT NOT NULL,
        input TEXT NOT NULL,
        spc_st TEXT,
        spc_f TEXT,
        status TEXT NOT NULL,
        message TEXT NOT NULL,
        cost INTEGER NOT NULL DEFAULT 0,
        proxy TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      -- Phone rental history table
      CREATE TABLE IF NOT EXISTS phone_rental_history (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        session_id TEXT NOT NULL,
        service TEXT NOT NULL,
        carrier TEXT NOT NULL,
        phone_number TEXT NOT NULL,
        status TEXT NOT NULL,
        otp_code TEXT,
        cost INTEGER NOT NULL,
        start_time TIMESTAMP NOT NULL,
        completed_time TIMESTAMP,
        expires_at TIMESTAMP NOT NULL,
        api_response_data TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      -- TikTok rentals table
      CREATE TABLE IF NOT EXISTS tiktok_rentals (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        session_id TEXT NOT NULL,
        service TEXT NOT NULL,
        carrier TEXT NOT NULL,
        phone_number TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'waiting',
        otp_code TEXT,
        cost INTEGER NOT NULL DEFAULT 1200,
        api_id TEXT,
        start_time TIMESTAMP NOT NULL DEFAULT NOW(),
        completed_time TIMESTAMP,
        expires_at TIMESTAMP NOT NULL,
        api_response JSONB,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      -- Top-up requests table
      CREATE TABLE IF NOT EXISTS topup_requests (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        amount INTEGER NOT NULL,
        description TEXT NOT NULL,
        qr_url TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        transaction_id TEXT,
        bank_reference TEXT,
        balance_before TEXT,
        balance_after TEXT,
        admin_note TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMP NOT NULL
      );

      -- System config table
      CREATE TABLE IF NOT EXISTS system_config (
        id SERIAL PRIMARY KEY,
        config_key TEXT NOT NULL,
        config_value TEXT NOT NULL,
        config_type TEXT NOT NULL,
        description TEXT,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(config_key)
      );

      -- Service pricing table
      CREATE TABLE IF NOT EXISTS service_pricing (
        id SERIAL PRIMARY KEY,
        service_type TEXT NOT NULL,
        service_name TEXT NOT NULL,
        price NUMERIC NOT NULL,
        description TEXT,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(service_type, service_name)
      );

      -- API keys table
      CREATE TABLE IF NOT EXISTS api_keys (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        key_name TEXT NOT NULL,
        key_value TEXT NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        last_used_at TIMESTAMP,
        request_count INTEGER NOT NULL DEFAULT 0,
        monthly_request_limit INTEGER DEFAULT 1000,
        daily_request_count INTEGER NOT NULL DEFAULT 0,
        last_reset_date TIMESTAMP DEFAULT NOW(),
        permissions TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      -- Audit logs table
      CREATE TABLE IF NOT EXISTS audit_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        target_user_id INTEGER REFERENCES users(id),
        action TEXT NOT NULL,
        description TEXT NOT NULL,
        before_data JSONB,
        after_data JSONB,
        ip_address TEXT NOT NULL,
        timestamp TIMESTAMP NOT NULL DEFAULT NOW()
      );

      -- HTTP proxies table
      CREATE TABLE IF NOT EXISTS http_proxies (
        id SERIAL PRIMARY KEY,
        ip TEXT NOT NULL,
        port INTEGER NOT NULL,
        username TEXT NOT NULL,
        password TEXT NOT NULL,
        label TEXT,
        is_active BOOLEAN NOT NULL DEFAULT true,
        last_used TIMESTAMP,
        total_usage INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      -- Service usage history table
      CREATE TABLE IF NOT EXISTS service_usage_history (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        service_type TEXT NOT NULL,
        service_name TEXT NOT NULL,
        description TEXT NOT NULL,
        status TEXT NOT NULL,
        cost NUMERIC DEFAULT 0,
        metadata JSONB,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      -- Activities table  
      CREATE TABLE IF NOT EXISTS activities (
        id SERIAL PRIMARY KEY,
        description TEXT NOT NULL,
        type TEXT NOT NULL,
        timestamp TIMESTAMP NOT NULL DEFAULT NOW()
      );

      -- Projects table
      CREATE TABLE IF NOT EXISTS projects (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        manager TEXT NOT NULL,
        budget NUMERIC NOT NULL,
        spent NUMERIC NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'active',
        progress INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      -- Resources table
      CREATE TABLE IF NOT EXISTS resources (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        project_id INTEGER REFERENCES projects(id),
        allocation INTEGER NOT NULL,
        cost NUMERIC NOT NULL
      );

      -- Phone rentals table (legacy)
      CREATE TABLE IF NOT EXISTS phone_rentals (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        phone_number TEXT NOT NULL,
        carrier TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        otp_code TEXT,
        rent_price NUMERIC NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      -- Username checks table (drop and recreate to fix schema)
      DROP TABLE IF EXISTS username_checks;
      CREATE TABLE username_checks (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        username TEXT NOT NULL,
        status INTEGER,
        is_available BOOLEAN,
        user_ip TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      -- Voucher saving operations table
      CREATE TABLE IF NOT EXISTS voucher_saving_operations (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        session_id TEXT NOT NULL,
        cookie_id TEXT,
        cookie_preview TEXT NOT NULL,
        status TEXT NOT NULL,
        total_vouchers_found INTEGER DEFAULT 0,
        successful_saves INTEGER DEFAULT 0,
        failed_saves INTEGER DEFAULT 0,
        cost INTEGER DEFAULT 3000 NOT NULL,
        message TEXT NOT NULL,
        proxy TEXT,
        user_ip TEXT,
        metadata JSONB,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        completed_at TIMESTAMP
      );

      -- Voucher save results table
      CREATE TABLE IF NOT EXISTS voucher_save_results (
        id SERIAL PRIMARY KEY,
        operation_id INTEGER NOT NULL REFERENCES voucher_saving_operations(id),
        voucher_code TEXT NOT NULL,
        promotion_id TEXT NOT NULL,
        signature TEXT NOT NULL,
        voucher_name TEXT NOT NULL,
        status BOOLEAN NOT NULL,
        save_response JSONB,
        error_message TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      -- Express tracking checks table
      CREATE TABLE IF NOT EXISTS express_tracking_checks (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        cookie_id TEXT REFERENCES shopee_cookies(id),
        cookie_preview TEXT NOT NULL,
        tracking_number TEXT NOT NULL,
        status BOOLEAN NOT NULL,
        message TEXT NOT NULL,
        order_count INTEGER DEFAULT 0,
        express_carrier TEXT,
        estimated_delivery TEXT,
        current_status TEXT,
        last_update TEXT,
        delivery_address TEXT,
        recipient_name TEXT,
        recipient_phone TEXT,
        order_id TEXT,
        order_name TEXT,
        order_price TEXT,
        order_time TEXT,
        shipping_fee TEXT,
        proxy TEXT,
        user_ip TEXT,
        cost INTEGER DEFAULT 0 NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      -- Freeship vouchers table
      CREATE TABLE IF NOT EXISTS freeship_vouchers (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        voucher_code TEXT NOT NULL UNIQUE,
        voucher_name TEXT NOT NULL,
        description TEXT,
        min_order_value NUMERIC DEFAULT 0,
        max_discount NUMERIC DEFAULT 0,
        discount_type TEXT NOT NULL DEFAULT 'freeship',
        discount_value NUMERIC DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'active',
        is_active BOOLEAN NOT NULL DEFAULT true,
        usage_limit INTEGER DEFAULT 1,
        used_count INTEGER DEFAULT 0 NOT NULL,
        valid_from TIMESTAMP NOT NULL,
        valid_until TIMESTAMP NOT NULL,
        shopee_region TEXT,
        category TEXT,
        applicable_products TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      -- Freeship voucher usage table
      CREATE TABLE IF NOT EXISTS freeship_voucher_usage (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        voucher_id INTEGER NOT NULL REFERENCES freeship_vouchers(id),
        order_id TEXT NOT NULL,
        usage_date TIMESTAMP NOT NULL DEFAULT NOW(),
        order_amount NUMERIC NOT NULL,
        discount_applied NUMERIC NOT NULL,
        status TEXT NOT NULL DEFAULT 'used',
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      -- External API Keys table  
      CREATE TABLE IF NOT EXISTS external_api_keys (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        provider TEXT NOT NULL,
        key_name TEXT NOT NULL,
        key_value TEXT NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        balance DECIMAL(15,2),
        last_balance_check TIMESTAMP,
        balance_check_error TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      -- External API Rentals table
      CREATE TABLE IF NOT EXISTS external_api_rentals (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        session_id TEXT NOT NULL UNIQUE,
        provider TEXT NOT NULL,
        provider_request_id TEXT,
        phone_number TEXT,
        formatted_phone_number TEXT,
        carrier TEXT,
        status TEXT NOT NULL DEFAULT 'requesting',
        otp_code TEXT,
        sms_content TEXT,
        price DECIMAL(15,2),
        is_shopee_registered BOOLEAN,
        shopee_check_attempts INTEGER DEFAULT 0,
        error_message TEXT,
        metadata JSONB,
        max_attempts INTEGER NOT NULL DEFAULT 10,
        attempt_number INTEGER NOT NULL DEFAULT 1,
        expires_at TIMESTAMP,
        allocated_at TIMESTAMP,
        otp_received_at TIMESTAMP,
        started_at TIMESTAMP NOT NULL DEFAULT NOW(),
        completed_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      -- Create indexes for external API tables
      CREATE INDEX IF NOT EXISTS idx_external_api_keys_user ON external_api_keys(user_id);
      CREATE INDEX IF NOT EXISTS idx_external_api_keys_active ON external_api_keys(is_active);
      CREATE INDEX IF NOT EXISTS idx_external_api_rentals_user ON external_api_rentals(user_id);
      CREATE INDEX IF NOT EXISTS idx_external_api_rentals_status ON external_api_rentals(status);
      CREATE INDEX IF NOT EXISTS idx_external_api_rentals_provider ON external_api_rentals(provider);

      -- Add missing metadata column to existing tables if they don't have it
      ALTER TABLE cookie_rapid_checks ADD COLUMN IF NOT EXISTS metadata JSONB;
      
      -- Add missing shopee_check_attempts column to external_api_rentals table
      ALTER TABLE external_api_rentals ADD COLUMN IF NOT EXISTS shopee_check_attempts INTEGER DEFAULT 0;
      
      -- Add missing metadata column to external_api_rentals table
      ALTER TABLE external_api_rentals ADD COLUMN IF NOT EXISTS metadata JSONB;

      -- Create database migration management tables
      CREATE TABLE IF NOT EXISTS database_migration_config (
        id SERIAL PRIMARY KEY,
        target_database_url TEXT,
        auto_migration_enabled BOOLEAN DEFAULT FALSE,
        last_auto_migration_at TIMESTAMP,
        next_auto_migration_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      );

      CREATE TABLE IF NOT EXISTS database_migration_history (
        id SERIAL PRIMARY KEY,
        source_database TEXT NOT NULL,
        target_database TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'running',
        start_time TIMESTAMP DEFAULT NOW() NOT NULL,
        end_time TIMESTAMP,
        records_migrated INTEGER DEFAULT 0,
        total_records INTEGER DEFAULT 0,
        errors TEXT,
        is_manual BOOLEAN DEFAULT FALSE,
        metadata JSONB
      );

      -- Create indexes for migration tables
      CREATE INDEX IF NOT EXISTS idx_migration_history_status ON database_migration_history(status);
      CREATE INDEX IF NOT EXISTS idx_migration_history_time ON database_migration_history(start_time);
    `);

    console.log("Database schema initialized successfully");
  } catch (error) {
    console.error("Error initializing database schema:", error);
    throw error;
  }
};

// Tạo 3 tài khoản mặc định với role khác nhau
const createDefaultUsers = async () => {
  console.log("Đang tạo tài khoản mặc định...");

  try {
    // Hash passwords
    const demoPassword = await bcrypt.hash("1", 10);
    const adminPassword = await bcrypt.hash("1", 10);
    const superAdminPassword = await bcrypt.hash("1", 10);

    // Check if users already exist and create if not
    await db.execute(sql`
      INSERT INTO users (username, password, full_name, role, balance)
      VALUES 
        ('a', ${demoPassword}, 'Demo User', 'user', 10000),
        ('admin', ${adminPassword}, 'Administrator', 'admin', 50000),
        ('admin3', ${adminPassword}, 'Demo Admin 3', 'admin', 50000),
        ('spadmin', ${superAdminPassword}, 'Super Administrator', 'superadmin', 100000)
      ON CONFLICT (username) DO NOTHING;
    `);

    console.log("Default users created successfully");
  } catch (error) {
    console.error("Error creating default users:", error);
    throw error;
  }
};

// Tạo cấu hình giá dịch vụ mặc định cho tất cả các dịch vụ
const createDefaultServicePricing = async () => {
  console.log("Đang tạo cấu hình giá dịch vụ...");

  try {
    // Check and insert each service individually to avoid conflicts
    const services = [
      {
        type: "otissim_v1",
        name: "Otissim_v1",
        price: 2100,
        desc: "OtisSim v1 - 365otp.com API phone rental",
      },
      {
        type: "otissim_v2",
        name: "Otissim_v2",
        price: 2700,  // Updated to match current pricing
        desc: "OtisSim v2 - TOTP API phone rental",
      },
      {
        type: "otissim_v3",
        name: "Otissim_v3",
        price: 2000,
        desc: "OtisSim v3 - ChayCodeso3 API phone rental",
      },
      {
        type: "tiktok_rental",
        name: "TikTokSim_v1",
        price: 1200,
        desc: "TikTok phone rental service",
      },
      {
        type: "phone_check",
        name: "Phone_Check",
        price: 100,
        desc: "Shopee phone number registration check",
      },
      {
        type: "account_check",
        name: "Account_Check",
        price: 100,
        desc: "Shopee account verification",
      },
      {
        type: "tracking_check",
        name: "Tracking_Check",
        price: 100,
        desc: "Shopee order tracking check",
      },
      {
        type: "email_service",
        name: "Email_Addition",
        price: 100,
        desc: "Add email to Shopee account",
      },
      {
        type: "cookie_extraction",
        name: "Cookie_Extract",
        price: 100,
        desc: "Extract Shopee cookies",
      },
      {
        type: "cookie_rapid_check",
        name: "cookie_rapid_check",
        price: 500,
        desc: "Cookie hỏa tốc - rapid order driver info check",
      },
      {
        type: "voucher_saving",
        name: "voucher_saving",
        price: 3000,
        desc: "Lưu mã free ship - Save free shipping vouchers to Shopee account",
      },
      {
        type: "express_tracking_check",
        name: "express_tracking_check",
        price: 200,
        desc: "Kiểm tra mã vận đơn hỏa tốc - Express tracking number check",
      },
      {
        type: "freeship_voucher_usage",
        name: "freeship_voucher_usage",
        price: 50,
        desc: "Ghi nhận sử dụng voucher freeship - Track freeship voucher usage",
      },
      {
        type: "spc_f_extract",
        name: "SPC_F_Extract",
        price: 100,
        desc: "Trích xuất SPC_F từ SPC_ST cookies - Extract SPC_F from SPC_ST cookies",
      },
    ];

    for (const service of services) {
      // Check if service exists first
      const existing = await db.execute(sql`
        SELECT id FROM service_pricing 
        WHERE service_type = ${service.type} AND service_name = ${service.name}
      `);

      if (existing.rowCount === 0) {
        await db.execute(sql`
          INSERT INTO service_pricing (service_type, service_name, price, description)
          VALUES (${service.type}, ${service.name}, ${service.price}, ${service.desc})
        `);
      }
    }

    console.log("Default service pricing created successfully");
  } catch (error) {
    console.error("Error creating default service pricing:", error);
    throw error;
  }
};

// Tạo cấu hình hệ thống mặc định (API keys, cookies, proxy keys)
const createDefaultSystemConfig = async () => {
  console.log("Đang tạo cấu hình hệ thống...");

  try {
    const configs = [
      {
        key: "SPC_ST_check",
        value:
          ".a1JaTTZzb1lWS2txQlJXMc6irWVexYAVyCDk/SRr9GeauB7kSynSAhjnqsVio7IY7hQU9Ylfyz/oN9yN66J6wcowWRuPjdH9hV7YQnURbwMwc99FqT6BRD8qHynAMSotSUB+F0USe8xTOOuE1ZVhDfpKsPgikPAFsm0ZJwMQcbXgS1+xKDrgjXDYgAbWAWhrJeB4M23GTg+QcYhsaGCuMOHRZ6jEf4KMiCXcKsLGijNktG15uWVJYN68DLxomIoI",
        type: "shopee_cookie",
        desc: "System cookie for Shopee API calls",
      },
      {
        key: "SPC_SC_SESSION_check",
        value:
          "gVr4pIt9WoGfGd7/XwlT2joND/PlK4qoat8Q5TeRG+wBMhF5xuh3s/p7oktW37R0LZtUWi9XveU26eLCM1l8HrwTlwpn4pVLGcOQ/tb+b2Q2AWpR5VV4KlqsD8Swr+shYLTP6hZa7ZhWbqXDaEf1949iBv3c/JR8v4WbQmw0gGAcaoyZeSP8MwSVXiPuWdp1X3affdI0hehsGVnwAFh9jyKFw4A3S8JJUJ/hbK6+7UQS1/Puy2y51Vg7aKHrZ+m7g_1_1543438532",
        type: "shopee_cookie",
        desc: "System session cookie for Shopee API",
      },
      {
        key: "api_keychaycodes3",
        value: "f04fe4e0ea9068a7",
        type: "api_key",
        desc: "ChayCodeso3 API key for phone rental v3",
      },
      {
        key: "wproxy_key",
        value: "default_wproxy_key",
        type: "proxy_key",
        desc: "W-Proxy rotation key",
      },
      {
        key: "fproxy_key",
        value: "default_fproxy_key",
        type: "proxy_key",
        desc: "F-Proxy rotation key",
      },
      {
        key: "webhook_token",
        value: "default_webhook_token_2025",
        type: "webhook",
        desc: "Webhook authentication token for payment processing",
      },
      {
        key: "SPC_ST_check",
        value: "default_spc_st_cookie_value",
        type: "shopee_cookie",
        desc: "SPC_ST cookie for username checking service",
      },
    ];

    for (const config of configs) {
      // Kiểm tra xem config đã tồn tại chưa
      const existing = await db.execute(sql`
        SELECT id FROM system_config WHERE config_key = ${config.key}
      `);

      // Chỉ thêm nếu chưa tồn tại
      if (existing.rowCount === 0) {
        await db.execute(sql`
          INSERT INTO system_config (config_key, config_value, config_type, description)
          VALUES (${config.key}, ${config.value}, ${config.type}, ${config.desc})
        `);
      }
    }

    console.log("Default system configurations created successfully");
  } catch (error) {
    console.error("Error creating default system configurations:", error);
    throw error;
  }
};

// Main initialization function
export const initializeApp = async () => {
  try {
    console.log("Starting application initialization...");

    await initializeDatabase();
    await createDefaultUsers();
    await createDefaultServicePricing();
    await createDefaultSystemConfig();
    
    // Fix any sequence issues that might exist
    console.log("Fixing database sequences...");
    await fixDatabaseSequences();

    // Add demo HTTP proxies if none exist
    await createDemoHttpProxies();

    console.log("Application initialization completed successfully!");
  } catch (error) {
    console.error("Application initialization failed:", error);
    throw error;
  }
};

// Create demo HTTP proxies for testing
const createDemoHttpProxies = async () => {
  try {
    console.log("Đang kiểm tra HTTP proxy...");

    // Check if any HTTP proxies exist
    const existingProxies = await db.execute(sql`SELECT COUNT(*) as count FROM http_proxies`);
    const count = (existingProxies.rows[0] as any).count;

    if (parseInt(count) === 0) {
      console.log("Đang tạo demo HTTP proxy...");
      
      // Add demo HTTP proxies
      const demoProxies = [
        {
          ip: "103.216.51.218",
          port: 5836,
          username: "user1",
          password: "pass1",
          label: "Demo Proxy 1"
        },
        {
          ip: "103.216.51.219", 
          port: 5837,
          username: "user2",
          password: "pass2",
          label: "Demo Proxy 2"
        },
        {
          ip: "103.216.51.220",
          port: 5838,
          username: "user3", 
          password: "pass3",
          label: "Demo Proxy 3"
        }
      ];

      for (const proxy of demoProxies) {
        await db.execute(sql`
          INSERT INTO http_proxies (ip, port, username, password, label, is_active)
          VALUES (${proxy.ip}, ${proxy.port}, ${proxy.username}, ${proxy.password}, ${proxy.label}, true)
        `);
      }

      console.log("Demo HTTP proxies created successfully");
    } else {
      console.log(`HTTP proxy database already has ${count} entries`);
    }
  } catch (error) {
    console.error("Error creating demo HTTP proxies:", error);
    // Don't throw error, just log it - this is not critical
  }
};

// Fix database sequences to prevent primary key conflicts for ALL tables with serial IDs
const fixDatabaseSequences = async () => {
  console.log("Fixing sequences for all tables with serial primary keys...");
  
  // List of all tables with serial primary keys and their sequence names
  const tables = [
    { table: 'users', sequence: 'users_id_seq' },
    { table: 'projects', sequence: 'projects_id_seq' },
    { table: 'resources', sequence: 'resources_id_seq' },
    { table: 'audit_logs', sequence: 'audit_logs_id_seq' },
    { table: 'activities', sequence: 'activities_id_seq' },
    { table: 'phone_rentals', sequence: 'phone_rentals_id_seq' },
    { table: 'phone_checks', sequence: 'phone_checks_id_seq' },
    { table: 'tracking_checks', sequence: 'tracking_checks_id_seq' },
    { table: 'cookie_rapid_checks', sequence: 'cookie_rapid_checks_id_seq' },
    { table: 'email_additions', sequence: 'email_additions_id_seq' },
    { table: 'transactions', sequence: 'transactions_id_seq' },
    { table: 'service_usage_history', sequence: 'service_usage_history_id_seq' },
    { table: 'service_pricing', sequence: 'service_pricing_id_seq' },
    { table: 'system_config', sequence: 'system_config_id_seq' },
    { table: 'phone_shopee', sequence: 'phone_shopee_id_seq' },
    { table: 'phone_rental_history', sequence: 'phone_rental_history_id_seq' },
    { table: 'account_checks', sequence: 'account_checks_id_seq' },
    { table: 'spc_f_extractions', sequence: 'spc_f_extractions_id_seq' },
    { table: 'cookie_extractions', sequence: 'cookie_extractions_id_seq' },
    { table: 'api_keys', sequence: 'api_keys_id_seq' },
    { table: 'tiktok_rentals', sequence: 'tiktok_rentals_id_seq' },
    { table: 'http_proxies', sequence: 'http_proxies_id_seq' },
    { table: 'username_checks', sequence: 'username_checks_id_seq' },
    { table: 'voucher_saving_operations', sequence: 'voucher_saving_operations_id_seq' },
    { table: 'voucher_save_results', sequence: 'voucher_save_results_id_seq' },
    { table: 'external_api_keys', sequence: 'external_api_keys_id_seq' },
    { table: 'external_api_rentals', sequence: 'external_api_rentals_id_seq' }
  ];

  let fixedCount = 0;
  let errorCount = 0;

  for (const { table, sequence } of tables) {
    try {
      await db.execute(sql.raw(`
        SELECT setval('${sequence}', (SELECT COALESCE(MAX(id), 0) + 1 FROM ${table}), false)
      `));
      fixedCount++;
      console.log(`✓ Fixed sequence for ${table}`);
    } catch (error) {
      errorCount++;
      console.error(`✗ Error fixing sequence for ${table}:`, error instanceof Error ? error.message : 'Unknown error');
    }
  }
  
  console.log(`Database sequences fix completed: ${fixedCount} success, ${errorCount} errors`);
};
