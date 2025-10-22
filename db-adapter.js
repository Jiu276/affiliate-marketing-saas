// 数据库适配器 - 为 sqlite3 提供类似 better-sqlite3 的接口
const sqlite3 = require('sqlite3').verbose();

class DatabaseAdapter {
  constructor(db) {
    this.db = db;
  }

  // 模拟 better-sqlite3 的 prepare 方法
  prepare(sql) {
    return {
      get: (params) => {
        return new Promise((resolve, reject) => {
          this.db.get(sql, params, (err, row) => {
            if (err) {
              reject(err);
            } else {
              resolve(row);
            }
          });
        });
      },
      run: (...params) => {
        return new Promise((resolve, reject) => {
          this.db.run(sql, params, function(err) {
            if (err) {
              reject(err);
            } else {
              resolve({ changes: this.changes, lastID: this.lastID });
            }
          });
        });
      },
      all: (params) => {
        return new Promise((resolve, reject) => {
          this.db.all(sql, params, (err, rows) => {
            if (err) {
              reject(err);
            } else {
              resolve(rows);
            }
          });
        });
      }
    };
  }

  // 直接执行 SQL
  exec(sql) {
    return new Promise((resolve, reject) => {
      this.db.exec(sql, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }
}

module.exports = DatabaseAdapter;
