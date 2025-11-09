# Telecommunications & Multi-Carrier Phone Rental Platform

## Overview
A comprehensive telecommunications and multi-carrier phone rental platform for the Vietnamese market, designed to offer advanced troubleshooting and user support. The platform aims to provide robust phone rental services, efficient transaction processing, and a scalable architecture for future growth in the Vietnamese telecommunications sector.

## User Preferences
- Use Vietnamese language for user-facing messages and logs
- Prioritize data integrity and financial accuracy
- Implement comprehensive logging for all financial operations
- Focus on automated solutions with manual oversight capabilities

## System Architecture
The platform is built with a React TypeScript frontend and an Express.js backend, utilizing PostgreSQL with Drizzle ORM. Tailwind CSS is used for responsive design.

### UI/UX Decisions
The platform features a mobile-first redesign with bottom sheet navigation on mobile and a sidebar on desktop. Card-based layouts replace traditional tables for a better mobile experience. All sensitive values are masked by default with a toggle reveal functionality.

### Technical Implementations
- **Frontend**: React with TypeScript, Vite, memoized computed values, lazy loading for improved performance.
- **Backend**: Express.js with dedicated APIs for various services, comprehensive analytics endpoints, and robust error handling.
- **Database**: PostgreSQL with Drizzle ORM, featuring a normalized schema for refund tracking, and optimized with indexes for faster queries. Connection pool configured for 2-core 4GB RAM server: 15 max connections, 3 min connections, 30s timeouts.
- **Security**: JWT-based authentication, role-based access control, API key authentication, SSRF protection with IP validation, comprehensive audit logging, and secure credential management.
- **Performance**: 
  - **Connection Pooling**: 15 max connections (7-8 per core), 30s timeout for fail-fast behavior
  - **Rate Limiting**: 3-tier system - Global (50/min, skip successful), Strict (5/min for expensive ops), Auth (10/15min)
  - **Concurrency Control**: Global queue (30 concurrent, 2x DB pool), Phone rental queue (8 concurrent), with idempotent release logic
  - **Memory Monitoring**: Auto cleanup at 85% usage, force GC at 90%, checked every 60s
  - **Performance Endpoint**: `/api/admin/system/performance` for real-time queue and memory stats
  - **Auto-Restart**: Intelligent error detection with recoverable/critical classification, auto-restart on critical errors or error threshold (10 errors/minute), graceful shutdown with database cleanup
  - **Enhanced Caching**: Smart cache với tiered TTL (Balance 10s, Pricing 1hr, History 30s), pattern-based invalidation, hit rate tracking
  - **Circuit Breakers**: Fail-fast protection cho external APIs (Viotp, Chaycodes3, 365OTP, FunOTP, IronSim, BossOTP, Shopee) với auto-recovery
  - **Performance Monitoring**: Real-time API response time tracking, slow endpoint detection, throughput metrics, error rate monitoring
  - **Request Deduplication**: Automatic duplicate request prevention (5s window) để tránh race conditions
  - **Database Indexes**: Optimized indexes cho phoneChecks, emailAdditions, tiktokRentals, externalApiRentals
  - **Analytics Query Optimization**: 15 optimized ByDateRange methods trong storage.ts (getPhoneChecksByDateRange, getAccountChecksByDateRange, getTrackingChecksByDateRange, getCookieExtractionsByDateRange, getEmailAdditionsByDateRange, getCookieRapidChecksByDateRange, getExpressTrackingChecksByDateRange, getFreeshipVoucherUsageByDateRange, getVoucherSavingOperationsByDateRange, getSpcFExtractionsByDateRange, getTransactionsByDateRange, getTopupRequestsByDateRange, getVoucherOperationsByDateRange, getServiceUsageByDateRange, getPhoneRentalHistoryWithFilter, getTiktokRentalsWithFilter) → Query với WHERE clause at DB level thay vì load ALL data rồi filter in-memory → Giảm data transfer, memory usage và tăng tốc 10x (5-10s → 0.5-1s)
  - **Analytics Endpoints Optimization**: Tất cả 13 analytics endpoints đã optimized để query trực tiếp theo date range: /api/analytics/revenue, /api/analytics/topup-history, /api/analytics/export, /api/analytics/daily, /api/analytics/overview, /api/analytics/service-details, /api/analytics/user-behavior, /api/analytics/real-time, /api/analytics/performance, /api/analytics/user-stats, /api/analytics/service-performance, /api/analytics/growth-metrics, /api/analytics/voucher-freeship
  - Batch processing for large operations
- **Internationalization**: Multilingual support specifically for the Vietnamese market.
- **Refund Management**: Advanced refund processing with automated scheduling, auditing, and recovery tools, using a normalized database schema with `refund_processed` and `refund_processed_at` fields.
- **System Configuration**: UI for managing API keys and other system settings, with Zod schemas for form validation.
- **Cookie Management**: Robust cookie validation logic with retry mechanisms and safe deletion policies, supporting SPC_ST+SPC_SC_SESSION pairing.
- **Parallel Processing**: Optimized email addition service and phone check operations with parallel processing and batch database lookups.

### Feature Specifications
- Multi-carrier phone rental services (OtisSim V1, V2, V3, TikTok rentals).
- Automated refund system with comprehensive tracking and recovery.
- Express Tracking Check API and Voucher Saving API with separate functionalities and permissions.
- Dynamic pricing configuration through `service_pricing`.
- Enhanced session tracking and robust admin diagnostic tools.

## External Dependencies
- **365otp.com API**: For OtisSim V1 number ordering and OTP retrieval.
- **FunOTP API (funotp.com)**: For OtisSim V2 number rental and OTP retrieval.
- **Shopee API (banhang.shopee.vn)**: For refreshing `SPC_SC_SESSION` tokens.
- **XLSX library**: For exporting data (lazy-loaded).