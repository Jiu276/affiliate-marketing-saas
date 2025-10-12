// SQLite数据库配置和初始化
const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'data.db'));

// 初始化数据库表
function initDatabase() {
  // 用户表
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      username TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      is_active INTEGER DEFAULT 1
    )
  `);

  // 平台账号配置表
  db.exec(`
    CREATE TABLE IF NOT EXISTS platform_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      platform TEXT NOT NULL,
      account_name TEXT NOT NULL,
      account_password TEXT NOT NULL,
      affiliate_name TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user_id, platform, account_name)
    )
  `);

  // 为已存在的表添加affiliate_name列（如果不存在）
  try {
    db.exec(`ALTER TABLE platform_accounts ADD COLUMN affiliate_name TEXT`);
  } catch (e) {
    // 列已存在，忽略错误
  }

  // 平台Token缓存表
  db.exec(`
    CREATE TABLE IF NOT EXISTS platform_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform_account_id INTEGER NOT NULL,
      token TEXT NOT NULL,
      expire_time DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (platform_account_id) REFERENCES platform_accounts(id) ON DELETE CASCADE
    )
  `);

  // 订单数据表
  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      platform_account_id INTEGER NOT NULL,
      order_id TEXT NOT NULL,
      merchant_id TEXT,
      merchant_name TEXT,
      order_amount REAL,
      commission REAL,
      status TEXT,
      order_date DATETIME,
      confirm_date DATETIME,
      raw_data TEXT,
      collected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (platform_account_id) REFERENCES platform_accounts(id) ON DELETE CASCADE,
      UNIQUE(platform_account_id, order_id)
    )
  `);

  // 采集任务记录表
  db.exec(`
    CREATE TABLE IF NOT EXISTS collection_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      platform_account_id INTEGER NOT NULL,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      status TEXT DEFAULT 'pending',
      total_orders INTEGER DEFAULT 0,
      total_amount REAL DEFAULT 0,
      total_commission REAL DEFAULT 0,
      error_message TEXT,
      started_at DATETIME,
      completed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (platform_account_id) REFERENCES platform_accounts(id) ON DELETE CASCADE
    )
  `);

  // Google表格配置表
  db.exec(`
    CREATE TABLE IF NOT EXISTS google_sheets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      sheet_name TEXT NOT NULL,
      sheet_url TEXT NOT NULL,
      sheet_id TEXT NOT NULL,
      description TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Google广告数据表
  db.exec(`
    CREATE TABLE IF NOT EXISTS google_ads_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      sheet_id INTEGER NOT NULL,
      date DATE NOT NULL,
      campaign_name TEXT,
      affiliate_name TEXT,
      merchant_id TEXT,
      campaign_budget REAL,
      currency TEXT,
      impressions INTEGER,
      clicks INTEGER,
      cost REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (sheet_id) REFERENCES google_sheets(id) ON DELETE CASCADE,
      UNIQUE(sheet_id, date, campaign_name)
    )
  `);

  // 为已存在的表添加新列（如果不存在）
  try {
    db.exec(`ALTER TABLE google_ads_data ADD COLUMN affiliate_name TEXT`);
  } catch (e) {
    // 列已存在，忽略错误
  }
  try {
    db.exec(`ALTER TABLE google_ads_data ADD COLUMN merchant_id TEXT`);
  } catch (e) {
    // 列已存在，忽略错误
  }

  // 创建索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
    CREATE INDEX IF NOT EXISTS idx_orders_platform_account_id ON orders(platform_account_id);
    CREATE INDEX IF NOT EXISTS idx_orders_order_date ON orders(order_date);
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
    CREATE INDEX IF NOT EXISTS idx_platform_accounts_user_id ON platform_accounts(user_id);
    CREATE INDEX IF NOT EXISTS idx_platform_accounts_affiliate ON platform_accounts(affiliate_name);
    CREATE INDEX IF NOT EXISTS idx_collection_jobs_user_id ON collection_jobs(user_id);
    CREATE INDEX IF NOT EXISTS idx_google_sheets_user_id ON google_sheets(user_id);
    CREATE INDEX IF NOT EXISTS idx_google_ads_data_user_id ON google_ads_data(user_id);
    CREATE INDEX IF NOT EXISTS idx_google_ads_data_date ON google_ads_data(date);
    CREATE INDEX IF NOT EXISTS idx_google_ads_data_affiliate ON google_ads_data(affiliate_name);
    CREATE INDEX IF NOT EXISTS idx_google_ads_data_merchant ON google_ads_data(merchant_id);
  `);

  console.log('✅ 数据库表初始化完成');
}

// 导出数据库实例
module.exports = { db, initDatabase };
