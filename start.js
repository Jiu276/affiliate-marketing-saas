#!/usr/bin/env node

/**
 * 快速启动脚本
 * 自动检查配置并启动项目
 */

const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 联盟营销数据采集系统 - 快速启动\n');

// 检查Node.js版本
function checkNodeVersion() {
  const version = process.version;
  const majorVersion = parseInt(version.slice(1).split('.')[0]);
  
  if (majorVersion < 18) {
    console.log('❌ Node.js版本过低，需要 >= 18.0.0');
    console.log(`当前版本: ${version}`);
    process.exit(1);
  }
  
  console.log(`✅ Node.js版本: ${version}`);
}

// 检查依赖
function checkDependencies() {
  console.log('📦 检查项目依赖...');
  
  if (!fs.existsSync('node_modules')) {
    console.log('⚠️ 依赖未安装，正在安装...');
    try {
      execSync('npm install', { stdio: 'inherit' });
      console.log('✅ 依赖安装完成');
    } catch (error) {
      console.log('❌ 依赖安装失败');
      process.exit(1);
    }
  } else {
    console.log('✅ 依赖已安装');
  }
}

// 创建必要的目录
function createDirectories() {
  const dirs = ['logs'];
  
  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`✅ 创建目录: ${dir}`);
    }
  });
}

// 检查环境变量
function checkEnvironment() {
  console.log('🔐 检查环境变量...');
  
  if (!fs.existsSync('.env')) {
    console.log('⚠️ .env 文件不存在，创建默认配置...');
    
    const defaultEnv = `# 联盟营销数据采集系统 - 环境变量配置

# JWT认证密钥 (建议使用32位随机字符串)
JWT_SECRET=affiliate_marketing_saas_jwt_secret_key_2024

# 数据加密密钥 (32位字符，用于加密平台账号密码)
ENCRYPTION_KEY=affiliate_encryption_key_32_chars

# 服务器端口
PORT=3000

# 运行环境
NODE_ENV=development

# 数据库配置
DB_PATH=./data.db

# 日志配置
LOG_LEVEL=info
LOG_FILE=./logs/app.log

# 平台API配置
LH_SALT=TSf03xGHykY
LH_BASE_URL=https://www.linkhaitao.com
PM_BASE_URL=https://api.partnermatic.com
LB_BASE_URL=https://www.linkbux.com
RW_BASE_URL=https://admin.rewardoo.com

# OCR配置
OCR_PYTHON_PATH=python
OCR_SCRIPT_PATH=./ocr_solver.py

# 安全配置
BCRYPT_ROUNDS=10
TOKEN_EXPIRE_DAYS=7

# 数据采集配置
MAX_RETRY_ATTEMPTS=3
REQUEST_TIMEOUT=30000
BATCH_SIZE=1000`;

    fs.writeFileSync('.env', defaultEnv);
    console.log('✅ 已创建 .env 文件');
  } else {
    console.log('✅ .env 文件存在');
  }
}

// 初始化数据库
function initDatabase() {
  console.log('🗄️ 初始化数据库...');
  
  try {
    // 运行数据库迁移
    execSync('node migrate.js up', { stdio: 'inherit' });
    console.log('✅ 数据库初始化完成');
  } catch (error) {
    console.log('❌ 数据库初始化失败');
    console.log('请手动运行: node migrate.js up');
  }
}

// 启动服务器
function startServer() {
  console.log('\n🚀 启动服务器...');
  console.log('='.repeat(50));
  
  const server = spawn('node', ['server-v2.js'], {
    stdio: 'inherit',
    env: { ...process.env }
  });
  
  server.on('error', (error) => {
    console.log('❌ 服务器启动失败:', error.message);
    process.exit(1);
  });
  
  server.on('close', (code) => {
    console.log(`\n服务器已停止，退出码: ${code}`);
  });
  
  // 处理进程退出
  process.on('SIGINT', () => {
    console.log('\n🛑 正在停止服务器...');
    server.kill('SIGINT');
  });
  
  process.on('SIGTERM', () => {
    console.log('\n🛑 正在停止服务器...');
    server.kill('SIGTERM');
  });
}

// 主函数
async function main() {
  try {
    checkNodeVersion();
    checkDependencies();
    createDirectories();
    checkEnvironment();
    initDatabase();
    
    console.log('\n✅ 所有检查完成，准备启动服务器...');
    console.log('📡 服务器将在 http://localhost:3000 启动');
    console.log('💡 按 Ctrl+C 停止服务器\n');
    
    // 延迟2秒后启动服务器
    setTimeout(() => {
      startServer();
    }, 2000);
    
  } catch (error) {
    console.log('❌ 启动失败:', error.message);
    process.exit(1);
  }
}

// 运行主函数
main();

