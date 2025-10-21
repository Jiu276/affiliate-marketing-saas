// Railway 部署专用数据库配置 - 使用内存数据库避免编译问题
const Database = require('better-sqlite3');
const path = require('path');

// 在 Railway 上使用内存数据库，避免文件系统权限问题
const DB_PATH = process.env.NODE_ENV === 'production' ? ':memory:' : path.join(__dirname, 'data.db');
const db = new Database(DB_PATH);

// 启用外键约束
db.pragma('foreign_keys = ON');

/**
 * 初始化数据库 - 使用Migration系统
 */
function initDatabase() {
  console.log('🔧 开始初始化数据库...');
  console.log(`📊 数据库路径: ${DB_PATH}`);

  try {
    // 延迟加载migrate模块，避免循环依赖
    const { runPendingMigrations, getCurrentVersion } = require('./migrate');

    // 执行所有待运行的migrations，传入现有的db实例
    runPendingMigrations(db);

    const version = getCurrentVersion(db);
    console.log(`✅ 数据库初始化完成，当前版本: v${version}`);
  } catch (error) {
    console.error('❌ 数据库初始化失败:', error);
    throw error;
  }
}

// 导出数据库实例
module.exports = { db, initDatabase };
