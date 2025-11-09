import { db, pool } from '../db';
import { sql } from 'drizzle-orm';

export async function createCookiePairsTable() {
  try {
    console.log('[MIGRATION] Creating shopee_cookie_pairs table if not exists...');
    
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS shopee_cookie_pairs (
        id SERIAL PRIMARY KEY,
        spc_st TEXT NOT NULL UNIQUE,
        spc_sc_session TEXT NOT NULL,
        source TEXT DEFAULT 'manual',
        is_valid BOOLEAN NOT NULL DEFAULT true,
        last_validated TIMESTAMP NOT NULL DEFAULT NOW(),
        validation_error TEXT,
        usage_count INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    
    console.log('[MIGRATION] Creating indexes...');
    
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_cookie_pairs_valid ON shopee_cookie_pairs(is_valid)
    `);
    
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_cookie_pairs_validated ON shopee_cookie_pairs(last_validated)
    `);
    
    console.log('[MIGRATION] ✓ Cookie pairs table and indexes created successfully');
  } catch (error) {
    console.error('[MIGRATION] Error creating cookie pairs table:', error);
    throw error;
  }
}
