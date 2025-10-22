// Railway 部署专用数据库配置 - 使用 sqlite3 纯 JS 实现
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
 * 初始化数据库 - 使用Migration系统
 */
async function initDatabase() {
  console.log('🔧 开始初始化数据库...');
  console.log(`📊 数据库路径: ${DB_PATH}`);

  try {
    // 延迟加载migrate模块，避免循环依赖
    const { runPendingMigrations, getCurrentVersion } = require('./migrate-railway');

    // 执行所有待运行的migrations，传入现有的db实例
    await runPendingMigrations(db);

    const version = await getCurrentVersion(db);
    console.log(`✅ 数据库初始化完成，当前版本: v${version}`);
  } catch (error) {
    console.error('❌ 数据库初始化失败:', error);
    throw error;
  }
}

// 导出数据库实例
module.exports = { db, initDatabase };
