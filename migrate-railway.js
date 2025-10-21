// Railway 部署专用 Migration 管理工具 - 使用 sqlite3
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// 初始化migration系统
function initMigrationSystem(db) {
  return new Promise((resolve, reject) => {
    // 创建schema版本追踪表
    db.run(`
      CREATE TABLE IF NOT EXISTS db_schema_versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        version INTEGER UNIQUE NOT NULL,
        name TEXT NOT NULL,
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        checksum TEXT
      )
    `, (err) => {
      if (err) {
        reject(err);
      } else {
        console.log('✅ Migration系统已初始化');
        resolve();
      }
    });
  });
}

// 获取当前数据库版本
function getCurrentVersion(db) {
  return new Promise((resolve, reject) => {
    db.get(`
      SELECT MAX(version) as current_version
      FROM db_schema_versions
    `, (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row ? row.current_version || 0 : 0);
      }
    });
  });
}

// 获取所有migration文件
function getMigrationFiles() {
  const migrationsDir = path.join(__dirname, 'migrations');

  if (!fs.existsSync(migrationsDir)) {
    fs.mkdirSync(migrationsDir);
    return [];
  }

  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.js'))
    .sort();

  return files.map(file => {
    const match = file.match(/^(\d{4})_(.+)\.js$/);
    if (!match) {
      throw new Error(`Invalid migration filename: ${file}`);
    }

    return {
      version: parseInt(match[1]),
      name: match[2],
      filename: file,
      path: path.join(migrationsDir, file)
    };
  });
}

// 执行单个migration
function runMigration(db, migration) {
  return new Promise((resolve, reject) => {
    console.log(`📊 执行migration: ${migration.name} (v${migration.version})`);

    try {
      const migrationModule = require(migration.path);
      
      if (typeof migrationModule.up !== 'function') {
        throw new Error(`Migration ${migration.name} must export an 'up' function`);
      }

      // 执行migration
      migrationModule.up(db, (err) => {
        if (err) {
          reject(err);
        } else {
          // 记录migration版本
          const checksum = require('crypto')
            .createHash('md5')
            .update(fs.readFileSync(migration.path))
            .digest('hex');

          db.run(`
            INSERT INTO db_schema_versions (version, name, checksum)
            VALUES (?, ?, ?)
          `, [migration.version, migration.name, checksum], (err) => {
            if (err) {
              reject(err);
            } else {
              console.log(`✅ Migration ${migration.name} 执行成功`);
              resolve();
            }
          });
        }
      });
    } catch (error) {
      reject(error);
    }
  });
}

// 运行所有待执行的migrations
async function runPendingMigrations(db) {
  try {
    await initMigrationSystem(db);
    
    const currentVersion = await getCurrentVersion(db);
    console.log(`📊 当前数据库版本: ${currentVersion}`);
    
    const migrations = getMigrationFiles();
    const pendingMigrations = migrations.filter(m => m.version > currentVersion);

    if (pendingMigrations.length === 0) {
      console.log('✅ 数据库已是最新版本，无需执行migration');
      return;
    }

    console.log(`📊 发现 ${pendingMigrations.length} 个待执行的migration`);

    for (const migration of pendingMigrations) {
      await runMigration(db, migration);
    }

    const newVersion = await getCurrentVersion(db);
    console.log(`✅ 数据库迁移完成，当前版本: v${newVersion}`);
  } catch (error) {
    console.error('❌ Migration执行失败:', error);
    throw error;
  }
}

// 回滚到指定版本
async function rollbackToVersion(db, targetVersion) {
  try {
    await initMigrationSystem(db);
    
    const currentVersion = await getCurrentVersion(db);
    console.log(`📊 当前数据库版本: ${currentVersion}`);

    if (targetVersion >= currentVersion) {
      console.log('⚠️ 目标版本必须小于当前版本');
      return;
    }

    const migrations = getMigrationFiles();
    const rollbackMigrations = migrations
      .filter(m => m.version > targetVersion && m.version <= currentVersion)
      .sort((a, b) => b.version - a.version);

    console.log(`📊 需要回滚 ${rollbackMigrations.length} 个migration`);

    for (const migration of rollbackMigrations) {
      console.log(`📊 回滚migration: ${migration.name} (v${migration.version})`);

      try {
        const migrationModule = require(migration.path);
        
        if (typeof migrationModule.down !== 'function') {
          throw new Error(`Migration ${migration.name} must export a 'down' function`);
        }

        await new Promise((resolve, reject) => {
          migrationModule.down(db, (err) => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          });
        });

        // 删除版本记录
        await new Promise((resolve, reject) => {
          db.run(`
            DELETE FROM db_schema_versions WHERE version = ?
          `, [migration.version], (err) => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          });
        });

        console.log(`✅ Migration ${migration.name} 回滚成功`);
      } catch (error) {
        console.error(`❌ Migration ${migration.name} 回滚失败:`, error);
        throw error;
      }
    }

    const newVersion = await getCurrentVersion(db);
    console.log(`✅ 数据库回滚完成，当前版本: v${newVersion}`);
  } catch (error) {
    console.error('❌ 数据库回滚失败:', error);
    throw error;
  }
}

// 显示migration状态
async function showMigrationStatus(db) {
  try {
    await initMigrationSystem(db);
    
    const currentVersion = await getCurrentVersion(db);
    const migrations = getMigrationFiles();

    console.log('\n📊 Migration状态:');
    console.log('='.repeat(50));
    console.log(`当前版本: ${currentVersion}`);
    console.log(`总migration数: ${migrations.length}`);
    console.log('');

    for (const migration of migrations) {
      const status = migration.version <= currentVersion ? '✅ 已执行' : '⏳ 待执行';
      console.log(`${status} v${migration.version}: ${migration.name}`);
    }

    console.log('');
  } catch (error) {
    console.error('❌ 获取migration状态失败:', error);
    throw error;
  }
}

module.exports = {
  initMigrationSystem,
  getCurrentVersion,
  getMigrationFiles,
  runMigration,
  runPendingMigrations,
  rollbackToVersion,
  showMigrationStatus
};
