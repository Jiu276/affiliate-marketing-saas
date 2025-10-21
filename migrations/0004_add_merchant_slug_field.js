// Migration 0004: add_merchant_slug_field
// 为orders表添加merchant_slug字段，用于标准化商家名称匹配

/**
 * 向上迁移 - 应用此migration
 */
function up(db) {
  console.log('  添加merchant_slug字段到orders表...');

  // 添加merchant_slug字段
  db.exec(`
    ALTER TABLE orders
    ADD COLUMN merchant_slug TEXT
  `);

  // 创建索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_orders_merchant_slug
    ON orders(merchant_slug)
  `);

  console.log('  ✅ merchant_slug字段添加完成');
}

/**
 * 向下迁移 - 回滚此migration
 */
function down(db) {
  console.log('  移除merchant_slug字段...');

  // SQLite不支持直接删除列，需要重建表
  db.exec(`
    -- 创建临时表
    CREATE TABLE orders_temp AS
    SELECT id, user_id, platform_account_id, order_id, merchant_id, merchant_name,
           order_amount, commission, status, order_date, confirm_date, raw_data,
           collected_at, created_at, updated_at
    FROM orders;

    -- 删除原表
    DROP TABLE orders;

    -- 重建原表（不包含merchant_slug）
    CREATE TABLE orders (
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
      updated_at DATETIME,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (platform_account_id) REFERENCES platform_accounts(id) ON DELETE CASCADE,
      UNIQUE(platform_account_id, order_id)
    );

    -- 恢复数据
    INSERT INTO orders
    SELECT * FROM orders_temp;

    -- 删除临时表
    DROP TABLE orders_temp;

    -- 重建索引
    CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
    CREATE INDEX IF NOT EXISTS idx_orders_platform_account_id ON orders(platform_account_id);
    CREATE INDEX IF NOT EXISTS idx_orders_order_date ON orders(order_date);
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
  `);

  console.log('  ✅ merchant_slug字段移除完成');
}

module.exports = { up, down };

