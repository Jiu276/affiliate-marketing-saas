# 🔧 配置指南

## 📋 配置检查与修复工具

本项目提供了完整的配置检查和修复工具，帮助您快速设置和启动系统。

### 🛠️ 可用工具

#### 1. 配置检查工具
```bash
npm run check-config
# 或
node check-config.js
```

**功能:**
- ✅ 检查所有核心文件是否存在
- ✅ 验证 package.json 配置
- ✅ 检查环境变量配置
- ✅ 验证数据库迁移文件
- ✅ 检查Python OCR环境
- ✅ 验证日志目录

#### 2. 配置修复工具
```bash
npm run fix-config
# 或
node fix-config.js
```

**功能:**
- 🔧 自动创建缺失的目录和文件
- 🔧 生成默认的 .env 配置文件
- 🔧 安装项目依赖
- 🔧 初始化数据库
- 🔧 检查Python环境
- 🔧 创建启动脚本

#### 3. 快速启动工具
```bash
npm run quick-start
# 或
node start.js
```

**功能:**
- 🚀 自动检查所有配置
- 🚀 创建必要的目录和文件
- 🚀 初始化数据库
- 🚀 启动服务器

### 📝 环境变量配置

#### 创建 .env 文件
```bash
# 复制模板文件
cp .env.example .env

# 或使用修复工具自动创建
npm run fix-config
```

#### 必要的环境变量
```env
# JWT认证密钥 (32位随机字符串)
JWT_SECRET=your_jwt_secret_key_here

# 数据加密密钥 (32位字符)
ENCRYPTION_KEY=your_32_character_encryption_key

# 服务器端口
PORT=3000

# 运行环境
NODE_ENV=development
```

### 🗄️ 数据库配置

#### 初始化数据库
```bash
# 运行数据库迁移
npm run migrate

# 查看迁移状态
npm run migrate:status
```

#### 数据库文件
- **开发环境**: `data.db` (SQLite)
- **生产环境**: PostgreSQL (通过环境变量配置)

### 🐍 Python OCR配置

#### 安装Python依赖
```bash
pip install ddddocr pillow
```

#### 检查OCR环境
```bash
# 检查Python版本
python --version

# 检查OCR脚本
ls ocr_solver.py
```

### 📁 目录结构

```
项目根目录/
├── .env                 # 环境变量配置
├── data.db             # SQLite数据库文件
├── logs/               # 日志目录
├── migrations/         # 数据库迁移文件
├── public/             # 前端资源
├── server-v2.js        # 主服务器文件
├── check-config.js     # 配置检查工具
├── fix-config.js       # 配置修复工具
├── start.js            # 快速启动工具
└── package.json        # 项目配置
```

### 🚀 快速开始

#### 方法1: 使用快速启动工具
```bash
npm run quick-start
```

#### 方法2: 手动配置
```bash
# 1. 检查配置
npm run check-config

# 2. 修复配置问题
npm run fix-config

# 3. 启动服务器
npm start
```

#### 方法3: 传统方式
```bash
# 1. 安装依赖
npm install

# 2. 创建环境变量文件
cp .env.example .env

# 3. 初始化数据库
npm run migrate

# 4. 启动服务器
npm start
```

### 🔍 故障排除

#### 常见问题

1. **Node.js版本过低**
   ```bash
   # 检查版本
   node --version
   
   # 需要 >= 18.0.0
   ```

2. **依赖安装失败**
   ```bash
   # 清理缓存
   npm cache clean --force
   
   # 重新安装
   rm -rf node_modules package-lock.json
   npm install
   ```

3. **数据库初始化失败**
   ```bash
   # 检查迁移文件
   npm run migrate:status
   
   # 手动运行迁移
   node migrate.js up
   ```

4. **Python环境问题**
   ```bash
   # 检查Python
   python --version
   
   # 安装OCR依赖
   pip install ddddocr pillow
   ```

5. **端口被占用**
   ```bash
   # 修改 .env 文件中的 PORT
   PORT=3001
   ```

### 📊 配置验证

运行配置检查后，您会看到类似以下的输出：

```
🔍 开始检查项目配置...

✅ 项目配置文件: package.json
✅ 主服务器文件: server-v2.js
✅ 数据库配置文件: db.js
✅ 工具函数文件: utils.js
✅ 数据库迁移工具: migrate.js

📦 检查 package.json 配置...
✅ name: 已配置
✅ version: 已配置
✅ main: 已配置
✅ scripts: 已配置
✅ dependencies: 已配置
✅ 启动脚本: node server-v2.js
✅ Node.js版本要求: >=18.0.0

🔐 检查环境变量配置...
✅ .env 文件存在
✅ 环境变量 JWT_SECRET: 已配置
✅ 环境变量 ENCRYPTION_KEY: 已配置
✅ 环境变量 PORT: 已配置

🗄️ 检查数据库配置...
✅ 数据库文件存在
✅ 数据库迁移目录存在
✅ 发现 4 个迁移文件

🐍 检查Python OCR配置...
✅ OCR脚本存在
✅ Python环境可用

📝 检查日志配置...
✅ 日志目录存在

==================================================
📊 配置检查总结
==================================================
✅ 通过: 15
❌ 失败: 0
⚠️ 警告: 0

🎉 配置检查通过！项目可以正常启动。
```

### 💡 提示

- 首次运行建议使用 `npm run quick-start`
- 遇到问题时先运行 `npm run check-config`
- 配置问题可以使用 `npm run fix-config` 自动修复
- 生产环境部署前请修改默认的环境变量值

