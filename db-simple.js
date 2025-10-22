// 简化版数据库配置 - 直接创建表结构，避免复杂的迁移系统
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// 在 Railway 上使用内存数据库，避免文件系统权限问题
const DB_PATH = process.env.NODE_ENV === 'production' ? ':memory:' : path.join(__dirname, 'data.db');

// 创建数据库连接
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('❌ 数据库连接失败:', err.message);
  } else {
    console.log('✅ 数据库连接成功');
  }
});

// 启用外键约束
db.run('PRAGMA foreign_keys = ON');

/**
 * 创建所有必要的表
 */
function createTables() {
  return new Promise((resolve, reject) => {
    console.log('🔧 创建数据库表结构...');

    const tables = [
      {
        name: 'users',
        sql: `
          CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            username TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            is_active INTEGER DEFAULT 1
          )
        `
      },
      {
        name: 'platform_accounts',
        sql: `
          CREATE TABLE IF NOT EXISTS platform_accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            platform TEXT NOT NULL,
            account_name TEXT NOT NULL,
            account_password TEXT,
            affiliate_name TEXT,
            api_token TEXT,
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE(user_id, platform, account_name)
          )
        `
      },
      {
        name: 'platform_tokens',
        sql: `
          CREATE TABLE IF NOT EXISTS platform_tokens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            platform_account_id INTEGER NOT NULL,
            token TEXT NOT NULL,
            expire_time DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (platform_account_id) REFERENCES platform_accounts(id) ON DELETE CASCADE
          )
        `
      },
      {
        name: 'orders',
        sql: `
          CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            platform_account_id INTEGER NOT NULL,
            order_id TEXT NOT NULL,
            merchant_id TEXT,
            merchant_name TEXT,
            merchant_slug TEXT,
            affiliate_name TEXT,
            order_amount REAL,
            commission REAL,
            status TEXT,
            order_date DATETIME,
            confirm_date DATETIME,
            raw_data TEXT,
            collected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (platform_account_id) REFERENCES platform_accounts(id) ON DELETE CASCADE,
            UNIQUE(platform_account_id, order_id)
          )
        `
      },
      {
        name: 'collection_jobs',
        sql: `
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
        `
      },
      {
        name: 'google_sheets',
        sql: `
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
        `
      },
      {
        name: 'google_ads_data',
        sql: `
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
        `
      }
    ];

    let completedTables = 0;
    
    // 创建所有表
    tables.forEach((table) => {
      db.run(table.sql, (err) => {
        if (err) {
          console.error(`❌ 创建${table.name}表失败:`, err);
          reject(err);
          return;
        }
        console.log(`✅ ${table.name}表创建成功`);
        completedTables++;
        
        // 所有表创建完成后，创建索引
        if (completedTables === tables.length) {
          createIndexes().then(resolve).catch(reject);
        }
      });
    });
  });
}

/**
 * 创建索引
 */
function createIndexes() {
  return new Promise((resolve, reject) => {
    console.log('🔧 创建数据库索引...');
    
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_orders_platform_account_id ON orders(platform_account_id)',
      'CREATE INDEX IF NOT EXISTS idx_orders_order_date ON orders(order_date)',
      'CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)',
      'CREATE INDEX IF NOT EXISTS idx_platform_accounts_user_id ON platform_accounts(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_platform_accounts_affiliate ON platform_accounts(affiliate_name)',
      'CREATE INDEX IF NOT EXISTS idx_collection_jobs_user_id ON collection_jobs(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_google_sheets_user_id ON google_sheets(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_google_ads_data_user_id ON google_ads_data(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_google_ads_data_date ON google_ads_data(date)',
      'CREATE INDEX IF NOT EXISTS idx_google_ads_data_affiliate ON google_ads_data(affiliate_name)',
      'CREATE INDEX IF NOT EXISTS idx_google_ads_data_merchant ON google_ads_data(merchant_id)'
    ];

    let completedIndexes = 0;
    indexes.forEach((indexSQL) => {
      db.run(indexSQL, (err) => {
        if (err) {
          console.error(`❌ 创建索引失败: ${indexSQL}`, err);
          reject(err);
          return;
        }
        completedIndexes++;
        if (completedIndexes === indexes.length) {
          console.log('✅ 所有索引创建成功');
          resolve();
        }
      });
    });
  });
}

/**
 * 初始化数据库
 */
async function initDatabase() {
  console.log('🔧 开始初始化数据库...');
  console.log(`📊 数据库路径: ${DB_PATH}`);

  try {
    await createTables();
    console.log('✅ 数据库初始化完成');
  } catch (error) {
    console.error('❌ 数据库初始化失败:', error);
    throw error;
  }
}

// 导出数据库实例
module.exports = { db, initDatabase };
