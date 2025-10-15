# Railway.app 一键部署指南 🚂

## 🎯 最简单的部署方式！

Railway.app 是最适合本项目的部署平台，支持：
- ✅ **SQLite 持久化存储**（自动挂载 Volume）
- ✅ **自动 HTTPS** 域名
- ✅ **从 GitHub 自动部署**
- ✅ **免费额度充足**（500小时/月，约￥5刀信用额度）
- ✅ **零配置，一键部署**

---

## 📋 部署步骤（5分钟搞定）

### 步骤 1: 注册 Railway 账号

1. 访问：https://railway.app
2. 点击 **"Start a New Project"**
3. 使用 **GitHub 账号登录**（推荐）

### 步骤 2: 从 GitHub 部署

1. 在 Railway 控制台点击 **"New Project"**
2. 选择 **"Deploy from GitHub repo"**
3. 授权 Railway 访问你的 GitHub
4. 选择仓库：**`daphnelxqyp/affiliate-marketing-saas`**
5. Railway 会自动检测到 Node.js 项目并开始部署

### 步骤 3: 配置环境变量

在 Railway 项目页面：

1. 点击 **Variables** 标签
2. 添加以下环境变量：

```bash
# 必填环境变量
NODE_ENV=production
PORT=3000

# JWT密钥（必须修改！）
# 生成方法: 在本地运行 node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_SECRET=你生成的64字符随机字符串

# 加密密钥（必须修改！）
# 生成方法: node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
ENCRYPTION_KEY=你生成的32字符随机字符串
```

**⚠️ 重要**: `JWT_SECRET` 和 `ENCRYPTION_KEY` 必须修改为随机生成的值！

### 步骤 4: 添加持久化存储（SQLite）

1. 在项目页面点击 **Settings**
2. 找到 **Volumes** 部分
3. 点击 **"Add Volume"**
4. 配置：
   - **Mount Path**: `/app/data`
   - **Size**: 1GB（免费版足够）
5. 点击 **"Add"**

**注意**: 需要修改 `db.js` 中的数据库路径为 `/app/data/data.db`

### 步骤 5: 获取部署域名

1. 部署成功后，Railway 会自动分配一个域名，如：
   ```
   https://your-app.up.railway.app
   ```

2. （可选）绑定自定义域名：
   - 点击 **Settings** → **Domains**
   - 点击 **"Generate Domain"** 或 **"Custom Domain"**

---

## 🔧 本地生成密钥

在本地终端运行以下命令生成密钥：

```bash
# 生成 JWT_SECRET
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# 生成 ENCRYPTION_KEY
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
```

将生成的值复制到 Railway 的环境变量中。

---

## 📊 查看日志和监控

- **实时日志**: 在 Railway 项目页面点击 **Deployments** → 点击最新部署 → 查看日志
- **性能监控**: 在 **Metrics** 标签查看 CPU、内存、网络使用情况
- **重启服务**: 点击 **Deployments** → **Redeploy**

---

## 🔄 自动部署更新

Railway 会自动监听你的 GitHub 仓库：

1. 每次 `git push` 到 `main` 分支
2. Railway 自动触发重新部署
3. 无需手动操作，全自动！

---

## 💰 费用说明

**免费额度**:
- 500 小时/月运行时间
- $5 信用额度
- 1GB 存储空间
- 100GB 流量/月

**超出后**:
- 按使用量付费
- 约 $5-20/月（小型应用足够）

---

## 🐛 常见问题

### 1. 部署失败？

**检查日志**:
- 在 Railway 控制台查看构建日志
- 确认 `package.json` 中的 `engines` 字段正确

### 2. SQLite 数据丢失？

**确保配置了 Volume**:
- 检查 Volumes 是否正确挂载到 `/app/data`
- 数据库文件路径必须指向 Volume 目录

### 3. 环境变量未生效？

**重新部署**:
- 修改环境变量后，点击 **Redeploy** 重启服务

### 4. 域名无法访问？

**检查部署状态**:
- 确认部署状态为 **Active**
- 查看日志是否有错误

---

## 🔒 安全建议

1. **修改默认密钥**: 不要使用示例密钥，必须生成随机值
2. **启用 GitHub 保护**: 在 GitHub 仓库设置中启用分支保护
3. **定期备份数据库**:
   ```bash
   # 在 Railway CLI 中下载数据库
   railway run sqlite3 /app/data/data.db .dump > backup.sql
   ```

---

## 📞 获取帮助

- Railway 文档: https://docs.railway.app
- Railway 社区: https://discord.gg/railway
- 项目 Issues: https://github.com/daphnelxqyp/affiliate-marketing-saas/issues

---

## ✅ 部署检查清单

- [ ] Railway 账号已注册
- [ ] GitHub 仓库已连接
- [ ] 环境变量已配置（JWT_SECRET, ENCRYPTION_KEY）
- [ ] Volume 已添加（/app/data）
- [ ] 部署状态为 Active
- [ ] 可以通过域名访问
- [ ] 注册/登录功能正常
- [ ] 数据采集功能正常

---

🎉 **部署完成！享受零运维的快乐吧！**
