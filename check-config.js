#!/usr/bin/env node

/**
 * 配置检查工具
 * 检查项目配置的完整性和正确性
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 开始检查项目配置...\n');

// 检查结果
const results = {
  passed: 0,
  failed: 0,
  warnings: 0,
  issues: []
};

function checkFile(filePath, description, required = true) {
  const exists = fs.existsSync(filePath);
  if (exists) {
    console.log(`✅ ${description}: ${filePath}`);
    results.passed++;
  } else {
    const message = `${description}: ${filePath} ${required ? '缺失' : '不存在'}`;
    console.log(`${required ? '❌' : '⚠️'} ${message}`);
    results.issues.push(message);
    if (required) {
      results.failed++;
    } else {
      results.warnings++;
    }
  }
}

function checkDirectory(dirPath, description, required = true) {
  const exists = fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory();
  if (exists) {
    console.log(`✅ ${description}: ${dirPath}`);
    results.passed++;
  } else {
    const message = `${description}: ${dirPath} ${required ? '缺失' : '不存在'}`;
    console.log(`${required ? '❌' : '⚠️'} ${message}`);
    results.issues.push(message);
    if (required) {
      results.failed++;
    } else {
      results.warnings++;
    }
  }
}

function checkPackageJson() {
  console.log('\n📦 检查 package.json 配置...');
  
  try {
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    
    // 检查必要字段
    const requiredFields = ['name', 'version', 'main', 'scripts', 'dependencies'];
    requiredFields.forEach(field => {
      if (pkg[field]) {
        console.log(`✅ ${field}: 已配置`);
        results.passed++;
      } else {
        console.log(`❌ ${field}: 缺失`);
        results.failed++;
        results.issues.push(`package.json 缺少 ${field} 字段`);
      }
    });
    
    // 检查启动脚本
    if (pkg.scripts && pkg.scripts.start) {
      console.log(`✅ 启动脚本: ${pkg.scripts.start}`);
      results.passed++;
    } else {
      console.log('❌ 启动脚本: 缺失');
      results.failed++;
      results.issues.push('package.json 缺少 start 脚本');
    }
    
    // 检查Node.js版本要求
    if (pkg.engines && pkg.engines.node) {
      console.log(`✅ Node.js版本要求: ${pkg.engines.node}`);
      results.passed++;
    } else {
      console.log('⚠️ Node.js版本要求: 未指定');
      results.warnings++;
    }
    
  } catch (error) {
    console.log('❌ package.json 解析失败:', error.message);
    results.failed++;
    results.issues.push('package.json 格式错误');
  }
}

function checkEnvironmentVariables() {
  console.log('\n🔐 检查环境变量配置...');
  
  const envFile = '.env';
  const envExampleFile = '.env.example';
  
  if (fs.existsSync(envFile)) {
    console.log('✅ .env 文件存在');
    results.passed++;
    
    // 检查必要的环境变量
    const envContent = fs.readFileSync(envFile, 'utf8');
    const requiredVars = ['JWT_SECRET', 'ENCRYPTION_KEY', 'PORT'];
    
    requiredVars.forEach(varName => {
      if (envContent.includes(varName)) {
        console.log(`✅ 环境变量 ${varName}: 已配置`);
        results.passed++;
      } else {
        console.log(`❌ 环境变量 ${varName}: 缺失`);
        results.failed++;
        results.issues.push(`环境变量 ${varName} 未配置`);
      }
    });
  } else {
    console.log('❌ .env 文件不存在');
    results.failed++;
    results.issues.push('.env 文件不存在，请创建环境变量配置文件');
    
    if (fs.existsSync(envExampleFile)) {
      console.log('✅ .env.example 文件存在，可作为模板');
      results.passed++;
    } else {
      console.log('⚠️ .env.example 文件不存在');
      results.warnings++;
    }
  }
}

function checkDatabase() {
  console.log('\n🗄️ 检查数据库配置...');
  
  // 检查数据库文件
  const dbFile = 'data.db';
  if (fs.existsSync(dbFile)) {
    console.log('✅ 数据库文件存在');
    results.passed++;
  } else {
    console.log('⚠️ 数据库文件不存在，首次运行时会自动创建');
    results.warnings++;
  }
  
  // 检查迁移文件
  const migrationsDir = 'migrations';
  if (fs.existsSync(migrationsDir)) {
    console.log('✅ 数据库迁移目录存在');
    results.passed++;
    
    const migrationFiles = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.js'));
    console.log(`✅ 发现 ${migrationFiles.length} 个迁移文件`);
    results.passed++;
  } else {
    console.log('❌ 数据库迁移目录不存在');
    results.failed++;
    results.issues.push('migrations 目录不存在');
  }
}

function checkPythonOCR() {
  console.log('\n🐍 检查Python OCR配置...');
  
  const ocrScript = 'ocr_solver.py';
  if (fs.existsSync(ocrScript)) {
    console.log('✅ OCR脚本存在');
    results.passed++;
  } else {
    console.log('❌ OCR脚本不存在');
    results.failed++;
    results.issues.push('ocr_solver.py 文件不存在');
  }
  
  // 检查Python依赖
  try {
    const { execSync } = require('child_process');
    execSync('python --version', { stdio: 'pipe' });
    console.log('✅ Python环境可用');
    results.passed++;
  } catch (error) {
    console.log('❌ Python环境不可用');
    results.failed++;
    results.issues.push('Python环境未安装或不在PATH中');
  }
}

function checkLogsDirectory() {
  console.log('\n📝 检查日志配置...');
  
  const logsDir = 'logs';
  if (fs.existsSync(logsDir)) {
    console.log('✅ 日志目录存在');
    results.passed++;
  } else {
    console.log('⚠️ 日志目录不存在，建议创建');
    results.warnings++;
    results.issues.push('建议创建 logs 目录用于存储日志文件');
  }
}

// 执行所有检查
console.log('🔍 检查核心文件...');
checkFile('package.json', '项目配置文件', true);
checkFile('server-v2.js', '主服务器文件', true);
checkFile('db.js', '数据库配置文件', true);
checkFile('utils.js', '工具函数文件', true);
checkFile('migrate.js', '数据库迁移工具', true);

console.log('\n🔍 检查部署配置...');
checkFile('ecosystem.config.js', 'PM2配置文件', false);
checkFile('railway.json', 'Railway部署配置', false);
checkFile('nixpacks.toml', '构建配置', false);

console.log('\n🔍 检查前端文件...');
checkDirectory('public', '前端资源目录', true);
checkFile('public/index-v2.html', '主页面文件', true);
checkFile('public/app-v2.js', '前端脚本文件', true);
checkFile('public/style-v2.css', '样式文件', true);

// 详细检查
checkPackageJson();
checkEnvironmentVariables();
checkDatabase();
checkPythonOCR();
checkLogsDirectory();

// 输出总结
console.log('\n' + '='.repeat(50));
console.log('📊 配置检查总结');
console.log('='.repeat(50));
console.log(`✅ 通过: ${results.passed}`);
console.log(`❌ 失败: ${results.failed}`);
console.log(`⚠️ 警告: ${results.warnings}`);

if (results.issues.length > 0) {
  console.log('\n🔧 需要解决的问题:');
  results.issues.forEach((issue, index) => {
    console.log(`${index + 1}. ${issue}`);
  });
}

if (results.failed === 0) {
  console.log('\n🎉 配置检查通过！项目可以正常启动。');
  process.exit(0);
} else {
  console.log('\n⚠️ 发现配置问题，请解决后再启动项目。');
  process.exit(1);
}

