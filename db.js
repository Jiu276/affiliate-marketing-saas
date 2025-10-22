// SQLite数据库配置和初始化（使用Migration系统）
const Database = require('better-sqlite3');
const path = require('path');
const DatabaseAdapter = require('./db-adapter');

const DB_PATH = path.join(__dirname, 'data.db');
const db = new Database(DB_PATH);

// 启用外键约束
db.pragma('foreign_keys = ON');

/**
 * 初始化数据库 - 使用Migration系统
 */
function initDatabase() {
  console.log('🔧 开始初始化数据库...');

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

// 创建数据库适配器（为开发环境提供统一接口）
const dbAdapter = new DatabaseAdapter(db);

// 导出数据库实例和适配器
module.exports = { db, dbAdapter, initDatabase };
