#!/usr/bin/env node

/**
 * 配置修复工具
 * 自动修复常见的配置问题
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔧 配置修复工具\n');

// 修复函数
const fixes = {
  // 创建 .env 文件
  createEnvFile: () => {
    if (!fs.existsSync('.env')) {
      console.log('📝 创建 .env 文件...');
      
      const envContent = `# 联盟营销数据采集系统 - 环境变量配置

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

      fs.writeFileSync('.env', envContent);
      console.log('✅ .env 文件已创建');
      return true;
    } else {
      console.log('✅ .env 文件已存在');
      return false;
    }
  },

  // 创建日志目录
  createLogsDir: () => {
    if (!fs.existsSync('logs')) {
      console.log('📁 创建 logs 目录...');
      fs.mkdirSync('logs', { recursive: true });
      console.log('✅ logs 目录已创建');
      return true;
    } else {
      console.log('✅ logs 目录已存在');
      return false;
    }
  },

  // 安装依赖
  installDependencies: () => {
    if (!fs.existsSync('node_modules')) {
      console.log('📦 安装项目依赖...');
      try {
        execSync('npm install', { stdio: 'inherit' });
        console.log('✅ 依赖安装完成');
        return true;
      } catch (error) {
        console.log('❌ 依赖安装失败:', error.message);
        return false;
      }
    } else {
      console.log('✅ 依赖已安装');
      return false;
    }
  },

  // 初始化数据库
  initDatabase: () => {
    console.log('🗄️ 初始化数据库...');
    try {
      execSync('node migrate.js up', { stdio: 'inherit' });
      console.log('✅ 数据库初始化完成');
      return true;
    } catch (error) {
      console.log('❌ 数据库初始化失败:', error.message);
      return false;
    }
  },

  // 检查Python环境
  checkPython: () => {
    console.log('🐍 检查Python环境...');
    try {
      const version = execSync('python --version', { encoding: 'utf8' });
      console.log(`✅ Python环境: ${version.trim()}`);
      return true;
    } catch (error) {
      console.log('⚠️ Python环境不可用，OCR功能可能无法使用');
      console.log('请安装Python并确保在PATH中');
      return false;
    }
  },

  // 检查OCR脚本
  checkOCRScript: () => {
    if (fs.existsSync('ocr_solver.py')) {
      console.log('✅ OCR脚本存在');
      return true;
    } else {
      console.log('❌ OCR脚本不存在');
      console.log('请确保 ocr_solver.py 文件存在');
      return false;
    }
  },

  // 创建启动脚本
  createStartScript: () => {
    const startScript = `#!/bin/bash
# 快速启动脚本

echo "🚀 启动联盟营销数据采集系统..."

# 检查Node.js版本
node_version=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$node_version" -lt 18 ]; then
    echo "❌ Node.js版本过低，需要 >= 18.0.0"
    exit 1
fi

# 启动服务器
node server-v2.js
`;

    if (!fs.existsSync('start.sh')) {
      fs.writeFileSync('start.sh', startScript);
      fs.chmodSync('start.sh', '755');
      console.log('✅ 创建启动脚本 start.sh');
      return true;
    } else {
      console.log('✅ 启动脚本已存在');
      return false;
    }
  }
};

// 执行修复
async function runFixes() {
  const results = {
    fixed: 0,
    skipped: 0,
    failed: 0
  };

  console.log('开始执行配置修复...\n');

  // 按顺序执行修复
  const fixOrder = [
    'createLogsDir',
    'createEnvFile', 
    'installDependencies',
    'initDatabase',
    'checkPython',
    'checkOCRScript',
    'createStartScript'
  ];

  for (const fixName of fixOrder) {
    try {
      const fixed = fixes[fixName]();
      if (fixed) {
        results.fixed++;
      } else {
        results.skipped++;
      }
    } catch (error) {
      console.log(`❌ 修复 ${fixName} 失败:`, error.message);
      results.failed++;
    }
    console.log(''); // 空行分隔
  }

  // 输出结果
  console.log('='.repeat(50));
  console.log('📊 修复结果总结');
  console.log('='.repeat(50));
  console.log(`✅ 已修复: ${results.fixed}`);
  console.log(`⏭️ 跳过: ${results.skipped}`);
  console.log(`❌ 失败: ${results.failed}`);

  if (results.failed === 0) {
    console.log('\n🎉 配置修复完成！');
    console.log('\n📋 下一步操作:');
    console.log('1. 检查 .env 文件中的配置');
    console.log('2. 运行: node start.js 启动项目');
    console.log('3. 访问: http://localhost:3000');
  } else {
    console.log('\n⚠️ 部分修复失败，请手动处理');
  }
}

// 运行修复
runFixes().catch(console.error);

