// 多用户SaaS系统 - Express后端服务器

// 设置控制台编码为UTF-8（修复Windows终端中文乱码）
if (process.platform === 'win32') {
  try {
    const { execSync } = require('child_process');
    execSync('chcp 65001', { stdio: 'ignore' });
  } catch (e) {
    // 忽略错误
  }
}

const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

// 使用简化的数据库配置（兼容Railway部署）
const { db, dbAdapter, initDatabase } = require('./db-simple');
const {
  hashPassword,
  verifyPassword,
  generateToken,
  verifyToken,
  encryptPassword,
  decryptPassword,
  generateSign,
} = require('./utils');

const app = express();
const PORT = process.env.PORT || 3000;

// 初始化数据库
initDatabase().catch(error => {
  console.error('❌ 数据库初始化失败:', error);
  process.exit(1);
});

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ============ 认证中间件 ============
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ success: false, message: '未提供认证token' });
  }

  const user = verifyToken(token);
  if (!user) {
    return res.status(403).json({ success: false, message: 'Token无效或已过期' });
  }

  req.user = user;
  next();
}

// ============ 用户认证API ============

/**
 * API: 用户注册
 * POST /api/auth/register
 */
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, username } = req.body;

    if (!email || !password || !username) {
      return res.json({ success: false, message: '缺少必要参数' });
    }

    // 检查邮箱是否已存在
    const existingUser = await dbAdapter.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existingUser) {
      return res.json({ success: false, message: '该邮箱已被注册' });
    }

    // 创建用户
    const passwordHash = await hashPassword(password);
    const result = await dbAdapter
      .prepare('INSERT INTO users (email, password_hash, username) VALUES (?, ?, ?)')
      .run(email, passwordHash, username);

    const token = generateToken({ id: result.lastID, email, username });

    res.json({
      success: true,
      message: '注册成功',
      data: { token, user: { id: result.lastID, email, username } },
    });
  } catch (error) {
    console.error('注册错误:', error);
    res.json({ success: false, message: '注册失败: ' + error.message });
  }
});

/**
 * API: 用户登录
 * POST /api/auth/login
 */
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.json({ success: false, message: '缺少必要参数' });
    }

    const user = await dbAdapter.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) {
      return res.json({ success: false, message: '邮箱或密码错误' });
    }

    const isValid = await verifyPassword(password, user.password_hash);
    if (!isValid) {
      return res.json({ success: false, message: '邮箱或密码错误' });
    }

    const token = generateToken({ id: user.id, email: user.email, username: user.username });

    res.json({
      success: true,
      message: '登录成功',
      data: { token, user: { id: user.id, email: user.email, username: user.username } },
    });
  } catch (error) {
    console.error('登录错误:', error);
    res.json({ success: false, message: '登录失败: ' + error.message });
  }
});

/**
 * API: 获取当前用户信息
 * GET /api/auth/me
 */
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  const user = await dbAdapter.prepare('SELECT id, email, username, created_at FROM users WHERE id = ?').get(req.user.id);

  if (!user) {
    return res.json({ success: false, message: '用户不存在' });
  }

  res.json({ success: true, data: user });
});

// ============ 平台账号管理API ============

/**
 * API: 添加平台账号
 * POST /api/platform-accounts
 */
app.post('/api/platform-accounts', authenticateToken, async (req, res) => {
  try {
    const { platform, accountName, accountPassword, affiliateName, apiToken } = req.body;

    if (!platform || !accountName) {
      return res.json({ success: false, message: '缺少必要参数' });
    }

    // LB、RW、LH、PM平台必须使用API Token
    if (platform === 'linkbux' || platform === 'rewardoo' || platform === 'linkhaitao' || platform === 'partnermatic') {
      if (!apiToken) {
        const platformNames = {
          'linkbux': 'LinkBux',
          'rewardoo': 'Rewardoo',
          'linkhaitao': 'LinkHaitao',
          'partnermatic': 'PartnerMatic'
        };
        const platformName = platformNames[platform] || platform;
        return res.json({ success: false, message: `${platformName}平台需要提供API Token` });
      }
    } else {
      // 其他平台必须提供密码
      if (!accountPassword) {
        return res.json({ success: false, message: '请提供账号密码' });
      }
    }

    // 检查是否已存在相同的平台账号
    console.log('🔍 添加平台账号调试信息:');
    console.log('用户ID:', req.user.id);
    console.log('平台:', platform);
    console.log('账号名称:', accountName);
    console.log('联盟序号:', affiliateName);
    console.log('API Token:', apiToken ? '已提供' : '未提供');
    
    const existingAccount = await dbAdapter
      .prepare('SELECT id FROM platform_accounts WHERE user_id = ? AND platform = ? AND account_name = ?')
      .get(req.user.id, platform, accountName);

    if (existingAccount) {
      return res.json({ success: false, message: '该平台账号已存在' });
    }

    // 加密密码（如果有）
    const encryptedPassword = accountPassword ? encryptPassword(accountPassword) : null;

    const result = await dbAdapter
      .prepare(
        'INSERT INTO platform_accounts (user_id, platform, account_name, account_password, affiliate_name, api_token) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(req.user.id, platform, accountName, encryptedPassword, affiliateName || null, apiToken || null);

    res.json({
      success: true,
      message: '平台账号添加成功',
      data: { id: result.lastID, platform, accountName, affiliateName },
    });
  } catch (error) {
    if (error.message.includes('UNIQUE')) {
      return res.json({ success: false, message: '该平台账号已存在' });
    }
    console.error('添加平台账号错误:', error);
    res.json({ success: false, message: '添加失败: ' + error.message });
  }
});

/**
 * API: 获取平台账号列表
 * GET /api/platform-accounts
 */
app.get('/api/platform-accounts', authenticateToken, async (req, res) => {
  try {
    console.log('获取平台账号请求，用户ID:', req.user.id);
    const accounts = await dbAdapter
      .prepare(
        'SELECT id, platform, account_name, affiliate_name, is_active, created_at FROM platform_accounts WHERE user_id = ?'
      )
      .all(req.user.id);

    console.log('查询到的账号数量:', accounts.length);
    console.log('账号数据:', accounts);
    res.json({ success: true, data: accounts });
  } catch (error) {
    console.error('获取平台账号错误:', error);
    res.json({ success: false, message: '获取失败: ' + error.message });
  }
});

/**
 * API: 删除平台账号
 * DELETE /api/platform-accounts/:id
 */
app.delete('/api/platform-accounts/:id', authenticateToken, (req, res) => {
  try {
    const { id } = req.params;

    const result = db
      .prepare('DELETE FROM platform_accounts WHERE id = ? AND user_id = ?')
      .run(id, req.user.id);

    if (result.changes === 0) {
      return res.json({ success: false, message: '账号不存在或无权删除' });
    }

    res.json({ success: true, message: '删除成功' });
  } catch (error) {
    console.error('删除平台账号错误:', error);
    res.json({ success: false, message: '删除失败: ' + error.message });
  }
});

// ============ LH平台自动登录 ============

// 存储验证码timestamp
const captchaTimestamps = new Map();

/**
 * 获取验证码图片（内部使用）
 */
async function getCaptchaImage() {
  const timestamp = Date.now();
  const url = `https://www.linkhaitao.com/api2.php?c=verifyCode&a=getCode&t=${timestamp}`;

  const response = await axios.get(url, { responseType: 'arraybuffer' });

  return {
    imageBuffer: response.data,
    timestamp: timestamp.toString(),
  };
}

/**
 * 调用Python OCR识别验证码
 */
async function recognizeCaptcha(imageBuffer) {
  const fs = require('fs');
  const path = require('path');
  const { spawn } = require('child_process');

  // 保存临时图片
  const tempFile = path.join(__dirname, 'temp_captcha.png');
  fs.writeFileSync(tempFile, imageBuffer);

  return new Promise((resolve, reject) => {
    const python = spawn('python', ['ocr_solver.py', tempFile]);

    let result = '';
    python.stdout.on('data', data => {
      result += data.toString();
    });

    python.on('close', code => {
      fs.unlinkSync(tempFile); // 删除临时文件

      if (code !== 0) {
        return reject(new Error('OCR识别失败'));
      }

      const code_text = result.trim();
      if (code_text && code_text.length === 4) {
        resolve(code_text);
      } else {
        reject(new Error('OCR结果无效: ' + code_text));
      }
    });
  });
}

/**
 * 自动登录LH平台（带验证码识别）
 */
async function autoLoginLH(accountName, accountPassword) {
  let attempts = 0;
  const maxAttempts = 5;

  while (attempts < maxAttempts) {
    attempts++;

    try {
      // 获取验证码
      const { imageBuffer, timestamp } = await getCaptchaImage();

      // OCR识别
      const code = await recognizeCaptcha(imageBuffer);
      console.log(`[尝试 ${attempts}] 验证码识别结果: ${code}`);

      // 登录
      const remember = '1';
      const sign = generateSign(accountName + accountPassword + code + remember + timestamp);

      const response = await axios.post(
        'https://www.linkhaitao.com/api2.php?c=login&a=login',
        new URLSearchParams({
          sign: sign,
          uname: accountName,
          password: accountPassword,
          code: code,
          remember: remember,
          t: timestamp,
        }),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        }
      );

      const isSuccess =
        response.data.code === '0200' ||
        response.data.msg === 'success' ||
        response.data.error_no === 'lh_suc';

      if (isSuccess && response.data.payload && response.data.payload.auth_token) {
        console.log('✅ LH平台自动登录成功');
        return {
          success: true,
          token: response.data.payload.auth_token,
          uid: response.data.payload.uid,
          expireTime: response.data.payload.expire_time,
        };
      } else {
        console.log(`❌ 登录失败: ${response.data.msg || response.data.error_info}`);
      }
    } catch (error) {
      console.error(`[尝试 ${attempts}] 登录异常:`, error.message);
    }
  }

  throw new Error(`自动登录失败，已尝试 ${maxAttempts} 次`);
}

/**
 * 获取或刷新LH平台token
 */
async function getLHToken(platformAccountId) {
  // 查询缓存的token
  const tokenRecord = db
    .prepare(
      `
    SELECT token, expire_time FROM platform_tokens
    WHERE platform_account_id = ?
    ORDER BY created_at DESC LIMIT 1
  `
    )
    .get(platformAccountId);

  // 检查token是否有效
  if (tokenRecord && tokenRecord.expire_time) {
    const expireTime = new Date(tokenRecord.expire_time);
    if (expireTime > new Date()) {
      console.log('✅ 使用缓存的LH token');
      return tokenRecord.token;
    }
  }

  // Token过期或不存在，重新登录
  console.log('🔄 Token已过期，开始自动登录LH平台...');

  const account = db
    .prepare('SELECT account_name, account_password FROM platform_accounts WHERE id = ?')
    .get(platformAccountId);

  if (!account) {
    throw new Error('平台账号不存在');
  }

  const accountPassword = decryptPassword(account.account_password);
  const loginResult = await autoLoginLH(account.account_name, accountPassword);

  // 保存新token
  await dbAdapter.prepare(
    'INSERT INTO platform_tokens (platform_account_id, token, expire_time) VALUES (?, ?, ?)'
  ).run(platformAccountId, loginResult.token, loginResult.expireTime);

  return loginResult.token;
}

// ============ 工具函数 ============

/**
 * 生成标准化的商家标识符（merchant_slug）
 * 规则：小写 + 移除所有非字母数字字符
 * @param {string} merchantName - 商家名称
 * @returns {string} - 标准化后的商家标识符
 * @example
 * generateMerchantSlug("Screwfix - FR") // 返回 "screwfixfr"
 * generateMerchantSlug("Champion US") // 返回 "championus"
 */
function generateMerchantSlug(merchantName) {
  if (!merchantName) return '';
  return merchantName.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// ============ 所有平台现在都使用API Token ============
// LH、PM、LB、RW平台使用固定API Token，不需要登录，直接从账号配置中读取

// ============ 数据采集API（改造版）============

/**
 * API: 采集订单数据（支持LH、PM、LB平台）
 * POST /api/collect-orders
 */
app.post('/api/collect-orders', authenticateToken, async (req, res) => {
  try {
    const { platformAccountId, startDate, endDate } = req.body;

    if (!platformAccountId || !startDate || !endDate) {
      return res.json({ success: false, message: '缺少必要参数' });
    }

    // 验证账号归属
    const account = await dbAdapter
      .prepare('SELECT * FROM platform_accounts WHERE id = ? AND user_id = ?')
      .get(platformAccountId, req.user.id);

    if (!account) {
      return res.json({ success: false, message: '平台账号不存在或无权访问' });
    }

    // 根据平台类型调用不同的采集方法
    if (account.platform === 'linkhaitao') {
      return await collectLHOrders(req, res, account, startDate, endDate);
    } else if (account.platform === 'partnermatic') {
      return await collectPMOrders(req, res, account, startDate, endDate);
    } else if (account.platform === 'linkbux') {
      return await collectLBOrders(req, res, account, startDate, endDate);
    } else if (account.platform === 'rewardoo') {
      return await collectRWOrders(req, res, account, startDate, endDate);
    } else {
      return res.json({ success: false, message: `不支持的平台: ${account.platform}` });
    }
  } catch (error) {
    console.error('采集订单错误:', error);
    res.json({ success: false, message: '采集失败: ' + error.message });
  }
});

/**
 * 采集LinkHaitao订单数据（支持API Token和模拟登录两种方式）
 */
async function collectLHOrders(req, res, account, startDate, endDate) {
  try {
    let response;
    let orders = [];

    // ========== 方式1：使用API Token（新方式，优先）==========
    if (account.api_token) {
      console.log('📥 使用LH API Token方式采集订单...');

      // 构建GET请求URL
      const params = new URLSearchParams({
        token: account.api_token,
        begin_date: startDate,
        end_date: endDate,
        page: '1',
        per_page: '4000'  // 最大4000条/页
      });

      const apiUrl = `https://www.linkhaitao.com/api.php?mod=medium&op=cashback2&${params.toString()}`;

      response = await axios.get(apiUrl);

      // LH新API响应格式：
      // 成功: { status: { code: 0, msg: "success" }, data: { list: [...] } }
      const isSuccess = response.data.status && response.data.status.code === 0;

      if (isSuccess && response.data.data && response.data.data.list) {
        orders = response.data.data.list;
        console.log(`✅ LH API Token方式：获取到 ${orders.length} 条订单`);
      } else {
        const errorMsg = (response.data.status && response.data.status.msg) || '数据获取失败';
        return res.json({
          success: false,
          message: `LH API错误: ${errorMsg}`
        });
      }
    }
    // ========== 方式2：使用模拟登录（旧方式，兼容）==========
    else {
      console.log('📥 使用LH模拟登录方式采集订单...');

      // 获取LH token（自动登录）
      const lhToken = await getLHToken(account.id);

      // 获取订单数据
      const exportFlag = '0';
      const page = 1;
      const pageSize = 100;
      const signData = `${startDate}${endDate}${page}${pageSize}${exportFlag}`;
      const sign = generateSign(signData);

      response = await axios.post(
        'https://www.linkhaitao.com/api2.php?c=report&a=transactionDetail',
        new URLSearchParams({
          sign: sign,
          start_date: startDate,
          end_date: endDate,
          page: page.toString(),
          page_size: pageSize.toString(),
          export: exportFlag,
        }),
        {
          headers: {
            'Lh-Authorization': lhToken,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      const isSuccess = response.data.code === '0200' || response.data.msg === '成功';

      if (isSuccess && response.data.payload) {
        orders = response.data.payload.info || [];
        console.log(`✅ LH模拟登录方式：获取到 ${orders.length} 条订单`);
      } else {
        return res.json({
          success: false,
          message: response.data.msg || '数据获取失败',
        });
      }
    }

    // ========== 统一处理订单数据入库 ==========
    if (orders.length > 0) {

      // ========== 第1步：预处理订单数据，累加同一订单号的多个商品 ==========
      const orderMap = new Map();  // 按order_id分组累加金额

      orders.forEach(order => {
        // 字段映射（根据API方式不同，字段名也不同）
        let orderId, merchantId, merchantName, orderAmount, commission, status, orderDate;

        if (account.api_token) {
          // 新API格式字段映射
          orderId = order.order_id || order.sign_id;  // 订单号
          merchantId = order.m_id;  // 商家ID（重要：使用m_id而不是mcid）
          merchantName = order.advertiser_name;  // 商家名称
          orderAmount = parseFloat(order.sale_amount || 0);  // 订单金额
          commission = parseFloat(order.cashback || 0);  // 佣金
          status = order.status;  // 订单状态（expired/pending/approved等）
          orderDate = order.order_time ? order.order_time.split(' ')[0] : '';  // 订单日期
        } else {
          // 旧API格式字段映射（模拟登录方式）
          orderId = order.id;
          merchantId = order.mcid;
          merchantName = order.sitename;
          orderAmount = parseFloat(order.amount || 0);
          commission = parseFloat(order.total_cmsn || 0);
          status = order.status;
          orderDate = order.date_ymd || order.updated_date;
        }

        // 如果订单已存在于Map中，累加金额和佣金
        if (orderMap.has(orderId)) {
          const existingData = orderMap.get(orderId);
          existingData.orderAmount += orderAmount;
          existingData.commission += commission;
          // 保留最新的原始数据
          existingData.rawData = order;
        } else {
          // 第一次遇到该订单号，创建记录
          orderMap.set(orderId, {
            orderId,
            merchantId,
            merchantName,
            orderAmount,
            commission,
            status,
            orderDate,
            rawData: order
          });
        }
      });

      console.log(`📊 LH API返回 ${orders.length} 条商品数据，合并后得到 ${orderMap.size} 个订单`);

      // ========== 第2步：将合并后的订单数据入库 ==========
      const selectStmt = dbAdapter.prepare(`
        SELECT id, status, order_amount, commission FROM orders
        WHERE user_id = ? AND platform_account_id = ? AND order_id = ?
      `);

      const insertStmt = dbAdapter.prepare(`
        INSERT INTO orders
        (user_id, platform_account_id, order_id, merchant_id, merchant_name, merchant_slug,
         order_amount, commission, status, order_date, affiliate_name, raw_data)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const updateStmt = dbAdapter.prepare(`
        UPDATE orders
        SET status = ?, commission = ?, order_amount = ?,
            merchant_name = ?, merchant_slug = ?, affiliate_name = ?, raw_data = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);

      let newCount = 0;       // 新增订单数
      let updatedCount = 0;   // 状态更新数
      let skippedCount = 0;   // 跳过订单数

      orderMap.forEach(orderData => {
        // 直接使用聚合后的数据
        const orderId = orderData.orderId;
        const merchantId = orderData.merchantId;
        const merchantName = orderData.merchantName;
        const orderAmount = orderData.orderAmount;  // 已累加的金额
        const commission = orderData.commission;    // 已累加的佣金
        const status = orderData.status;
        const orderDate = orderData.orderDate;

        // 查询是否存在相同订单号
        const existingOrder = selectStmt.get(req.user.id, account.id, orderId);

        if (existingOrder) {
          // 订单已存在,比对状态和金额
          if (existingOrder.status !== status ||
              Math.abs(existingOrder.order_amount - orderAmount) > 0.01 ||
              Math.abs(existingOrder.commission - commission) > 0.01) {
            // 状态或金额不一致，更新订单
            updateStmt.run(
              status,
              commission,
              orderAmount,
              merchantName,
              generateMerchantSlug(merchantName),
              account.affiliate_name || null,
              JSON.stringify(orderData.rawData),
              existingOrder.id
            );
            updatedCount++;
            console.log(`📝 LH订单 ${orderId} 更新: 金额${existingOrder.order_amount}→${orderAmount}, 佣金${existingOrder.commission}→${commission}`);
          } else {
            // 数据一致，跳过
            skippedCount++;
          }
        } else {
          // 订单不存在，插入新订单
          insertStmt.run(
            req.user.id,
            account.id,
            orderId,
            merchantId,
            merchantName,
            generateMerchantSlug(merchantName),
            orderAmount,
            commission,
            status,
            orderDate,
            account.affiliate_name || null,
            JSON.stringify(orderData.rawData)
          );
          newCount++;
        }
      });

      // 构建详细的结果消息
      let message = `采集完成：`;
      const details = [];
      if (newCount > 0) details.push(`新增 ${newCount} 条`);
      if (updatedCount > 0) details.push(`更新 ${updatedCount} 条`);
      if (skippedCount > 0) details.push(`跳过 ${skippedCount} 条`);
      message += details.join('，');

      console.log(`✅ LH ${message}`);

      res.json({
        success: true,
        message: message,
        data: {
          total: orders.length,
          orders: orders,
          stats: {
            new: newCount,
            updated: updatedCount,
            skipped: skippedCount,
            total: orders.length
          }
        },
      });
    } else {
      // 没有订单数据
      res.json({
        success: true,
        message: '采集完成：未找到订单数据',
        data: {
          total: 0,
          orders: [],
          stats: {
            new: 0,
            updated: 0,
            skipped: 0,
            total: 0
          }
        }
      });
    }
  } catch (error) {
    console.error('采集LH订单错误:', error);
    res.json({ success: false, message: '采集失败: ' + error.message });
  }
}

/**
 * 采集PartnerMatic订单数据（使用API Token）
 */
async function collectPMOrders(req, res, account, startDate, endDate) {
  try {
    // 获取PM API token（从account.api_token字段读取）
    const pmToken = account.api_token;

    if (!pmToken) {
      return res.json({
        success: false,
        message: 'PartnerMatic账号未配置API Token，请在账号设置中添加'
      });
    }

    console.log('📥 开始采集PM订单...');
    console.log('PM Token:', pmToken);
    console.log('日期范围:', startDate, '到', endDate);

    // 尝试不同的API接口路径
    const apiEndpoints = [
      'https://api.partnermatic.com/report/performance',
      'https://api.partnermatic.com/api/transactions',
      'https://api.partnermatic.com/api/orders',
      'https://api.partnermatic.com/api/reports',
      'https://api.partnermatic.com/api/data'
    ];

    let response = null;
    let lastError = null;

    // 尝试每个API端点
    for (const endpoint of apiEndpoints) {
      try {
        console.log(`尝试API端点: ${endpoint}`);
        
        // 尝试不同的请求格式
        const requestFormats = [
          // 格式1: JWT Token在Header中
          {
            data: {
              beginDate: startDate,
              endDate: endDate,
              curPage: 1,
              perPage: 2000
            },
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${pmToken}`
            }
          },
          // 格式2: Token在请求体中
          {
            data: {
              token: pmToken,
              beginDate: startDate,
              endDate: endDate,
              curPage: 1,
              perPage: 2000
            },
            headers: {
              'Content-Type': 'application/json'
            }
          },
          // 格式3: 原始格式
          {
            data: {
              source: 'partnermatic',
              token: pmToken,
              dataScope: 'user',
              beginDate: startDate,
              endDate: endDate,
              curPage: 1,
              perPage: 2000
            },
            headers: {
              'Content-Type': 'application/json'
            }
          }
        ];
        
        let formatSuccess = false;
        for (const format of requestFormats) {
          try {
            response = await axios.post(endpoint, format.data, { headers: format.headers });
            if (response.status === 200) {
              formatSuccess = true;
              break;
            }
          } catch (formatError) {
            console.log(`请求格式失败: ${formatError.message}`);
            continue;
          }
        }
        
        if (!formatSuccess) {
          throw new Error('所有请求格式都失败了');
        }

        console.log(`${endpoint} 响应状态:`, response.status);
        console.log(`${endpoint} 响应数据:`, JSON.stringify(response.data, null, 2));

        // 如果响应成功且包含数据，跳出循环
        if (response.data && (response.data.code === '0' || response.data.success || response.data.data)) {
          console.log(`✅ 成功使用API端点: ${endpoint}`);
          break;
        }
      } catch (error) {
        console.log(`❌ ${endpoint} 失败:`, error.message);
        lastError = error;
        response = null;
      }
    }

    // 如果所有端点都失败
    if (!response) {
      return res.json({
        success: false,
        message: `所有API端点都失败，最后错误: ${lastError ? lastError.message : '未知错误'}`
      });
    }

    console.log('PM API响应状态:', response.status);
    console.log('PM API响应数据:', JSON.stringify(response.data, null, 2));

    // PM新API响应格式：{ code: "0", message: "success", data: { total, list: [...] } }
    const isSuccess = response.data.code === '0' && response.data.data;

    if (isSuccess && response.data.data.list) {
      const orders = response.data.data.list || [];

      console.log(`✅ PM API返回 ${orders.length} 条商品数据`);

      // ========== 第1步：预处理订单数据，累加同一订单号的多个商品 ==========
      const orderMap = new Map();  // 按order_id分组累加金额

      orders.forEach(order => {
        // 字段映射（PM新API格式）
        const orderId = order.order_id;
        const merchantId = order.brand_id;  // 商家ID (使用brand_id而不是mcid)
        const merchantName = order.merchant_name;
        const orderAmount = parseFloat(order.sale_amount || 0);
        const commission = parseFloat(order.sale_comm || 0);

        // 状态映射
        let status = 'Pending';
        if (order.status === 'Approved') status = 'Approved';
        else if (order.status === 'Rejected' || order.status === 'Canceled') status = 'Rejected';
        else status = 'Pending';

        // 订单日期：order_time是Unix时间戳（秒级），需转换为YYYY-MM-DD
        let orderDate = '';
        if (order.order_time) {
          if (typeof order.order_time === 'number') {
            // 数字类型：秒级时间戳
            const timestamp = order.order_time * 1000;
            orderDate = new Date(timestamp).toISOString().split('T')[0];
          } else if (typeof order.order_time === 'string') {
            // 字符串类型：可能是时间戳字符串
            const numericTimestamp = parseInt(order.order_time);
            if (!isNaN(numericTimestamp)) {
              const timestamp = numericTimestamp * 1000;
              orderDate = new Date(timestamp).toISOString().split('T')[0];
            } else {
              // 或者是日期字符串
              orderDate = order.order_time.split(' ')[0];
            }
          }
        }

        // 如果订单已存在于Map中，累加金额和佣金
        if (orderMap.has(orderId)) {
          const existingData = orderMap.get(orderId);
          existingData.orderAmount += orderAmount;
          existingData.commission += commission;
          // 保留最新的原始数据
          existingData.rawData = order;
        } else {
          // 第一次遇到该订单号，创建记录
          orderMap.set(orderId, {
            orderId,
            merchantId,
            merchantName,
            orderAmount,
            commission,
            status,
            orderDate,
            rawData: order
          });
        }
      });

      console.log(`📊 PM API返回 ${orders.length} 条商品数据，合并后得到 ${orderMap.size} 个订单`);

      // ========== 第2步：同步删除数据库中API不存在的订单（日期范围内） ==========
      // 查询数据库中该日期范围内的所有订单
      const dbOrdersInRange = dbAdapter.prepare(`
        SELECT order_id FROM orders
        WHERE user_id = ? AND platform_account_id = ?
          AND order_date >= ? AND order_date <= ?
      `).all(req.user.id, account.id, startDate, endDate);

      // 找出API中不存在的订单
      const apiOrderIds = new Set(orderMap.keys());
      const ordersToDelete = dbOrdersInRange.filter(dbOrder => !apiOrderIds.has(dbOrder.order_id));

      let deletedCount = 0;
      if (ordersToDelete.length > 0) {
        const deleteStmt = dbAdapter.prepare(`
          DELETE FROM orders
          WHERE user_id = ? AND platform_account_id = ? AND order_id = ?
        `);

        ordersToDelete.forEach(order => {
          deleteStmt.run(req.user.id, account.id, order.order_id);
          deletedCount++;
        });

        console.log(`🗑️  PM删除 ${deletedCount} 个API中不存在的订单`);
      }

      // ========== 第3步：将合并后的订单数据入库 ==========
      const selectStmt = dbAdapter.prepare(`
        SELECT id, status, order_amount, commission FROM orders
        WHERE user_id = ? AND platform_account_id = ? AND order_id = ?
      `);

      const insertStmt = dbAdapter.prepare(`
        INSERT INTO orders
        (user_id, platform_account_id, order_id, merchant_id, merchant_name, merchant_slug,
         order_amount, commission, status, order_date, affiliate_name, raw_data)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const updateStmt = dbAdapter.prepare(`
        UPDATE orders
        SET status = ?, commission = ?, order_amount = ?,
            merchant_name = ?, merchant_slug = ?, affiliate_name = ?, raw_data = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);

      let newCount = 0;
      let updatedCount = 0;
      let skippedCount = 0;

      orderMap.forEach(orderData => {
        // 直接使用聚合后的数据
        const orderId = orderData.orderId;
        const merchantId = orderData.merchantId;
        const merchantName = orderData.merchantName;
        const orderAmount = orderData.orderAmount;  // 已累加的金额
        const commission = orderData.commission;    // 已累加的佣金
        const status = orderData.status;
        const orderDate = orderData.orderDate;

        // 查询是否存在相同订单号
        const existingOrder = selectStmt.get(req.user.id, account.id, orderId);

        if (existingOrder) {
          // 订单已存在，比对状态和金额
          if (existingOrder.status !== status ||
              Math.abs(existingOrder.order_amount - orderAmount) > 0.01 ||
              Math.abs(existingOrder.commission - commission) > 0.01) {
            // 状态或金额不一致，更新订单
            updateStmt.run(
              status,
              commission,
              orderAmount,
              merchantName,
              generateMerchantSlug(merchantName),
              account.affiliate_name || null,
              JSON.stringify(orderData.rawData),
              existingOrder.id
            );
            updatedCount++;
            console.log(`📝 PM订单 ${orderId} 更新: 金额${existingOrder.order_amount}→${orderAmount}, 佣金${existingOrder.commission}→${commission}`);
          } else {
            // 数据一致，跳过
            skippedCount++;
          }
        } else {
          // 订单不存在，插入新订单
          insertStmt.run(
            req.user.id,
            account.id,
            orderId,
            merchantId,
            merchantName,
            generateMerchantSlug(merchantName),
            orderAmount,
            commission,
            status,
            orderDate,
            account.affiliate_name || null,
            JSON.stringify(orderData.rawData)
          );
          newCount++;
        }
      });

      // 构建详细的结果消息
      let message = `采集完成：`;
      const details = [];
      if (newCount > 0) details.push(`新增 ${newCount} 条`);
      if (updatedCount > 0) details.push(`更新 ${updatedCount} 条`);
      if (deletedCount > 0) details.push(`删除 ${deletedCount} 条`);
      if (skippedCount > 0) details.push(`跳过 ${skippedCount} 条`);
      message += details.join('，');

      console.log(`✅ PM ${message}`);

      res.json({
        success: true,
        message: message,
        data: {
          total: response.data.data.total || orders.length,
          orders: orders.map(o => {
            // 处理order_time时间戳
            let dateYmd = '';
            if (o.order_time) {
              if (typeof o.order_time === 'number') {
                const timestamp = o.order_time * 1000;
                dateYmd = new Date(timestamp).toISOString().split('T')[0];
              } else if (typeof o.order_time === 'string') {
                const numericTimestamp = parseInt(o.order_time);
                if (!isNaN(numericTimestamp)) {
                  const timestamp = numericTimestamp * 1000;
                  dateYmd = new Date(timestamp).toISOString().split('T')[0];
                } else {
                  dateYmd = o.order_time.split(' ')[0];
                }
              }
            }

            return {
              id: o.order_id,
              mcid: o.mcid,
              sitename: o.merchant_name,
              amount: o.sale_amount,
              total_cmsn: o.sale_comm,
              status: o.status,
              date_ymd: dateYmd
            };
          }),
          stats: {
            new: newCount,
            updated: updatedCount,
            deleted: deletedCount,
            skipped: skippedCount,
            total: orders.length
          }
        },
      });
    } else {
      // API错误响应
      const errorMessage = response.data.message || 'PM数据获取失败';
      console.error(`❌ PM API错误: ${errorMessage}`);

      res.json({
        success: false,
        message: `PM API错误: ${errorMessage}`,
      });
    }
  } catch (error) {
    console.error('采集PM订单错误:', error);
    res.json({ success: false, message: '采集失败: ' + error.message });
  }
}

/**
 * 采集LinkBux订单数据
 */
async function collectLBOrders(req, res, account, startDate, endDate) {
  try {
    // 获取LB API token（从account.api_token字段读取，而不是登录获取）
    const lbToken = account.api_token;

    if (!lbToken) {
      return res.json({
        success: false,
        message: 'LinkBux账号未配置API Token，请在账号设置中添加'
      });
    }

    // 构建请求URL（GET请求，参数在URL中）
    const params = new URLSearchParams({
      token: lbToken,
      begin_date: startDate,
      end_date: endDate,
      type: 'json',
      status: 'All',  // 获取所有状态：Approved、Pending、Rejected
      limit: '2000'   // 每页最大2000条
    });

    const apiUrl = `https://www.linkbux.com/api.php?mod=medium&op=transaction_v2&${params.toString()}`;

    console.log('📥 开始采集LB订单...');

    const response = await axios.get(apiUrl);

    // LB API响应格式（有两种）：
    // 成功: { status: { code: 0, msg: "Success" }, data: { total_trans, total_page, list: [...] } }
    // 失败: { status: { code: 1000, msg: "error" } }
    const isSuccess =
      (response.data.code === 0 || response.data.code === '0') ||
      (response.data.status && (response.data.status.code === 0 || response.data.status.code === '0'));

    if (isSuccess && response.data.data) {
      const orders = response.data.data.list || response.data.data.transactions || [];

      // ========== 第1步：预处理订单数据，累加同一订单号的多个商品 ==========
      const orderMap = new Map();  // 按order_id分组累加金额

      orders.forEach(order => {
        const orderId = order.order_id || order.linkbux_id;
        const merchantId = order.mid;
        const merchantName = order.merchant_name;
        const orderAmount = parseFloat(order.sale_amount || 0);
        const commission = parseFloat(order.sale_comm || 0);

        // 状态映射：Approved/Pending/Rejected
        let status = 'Pending';
        if (order.status === 'Approved') status = 'Approved';
        else if (order.status === 'Rejected') status = 'Rejected';
        else status = 'Pending';

        // 订单日期：order_time是秒级时间戳，需转换为YYYY-MM-DD格式
        let orderDate = '';
        if (order.order_time) {
          if (typeof order.order_time === 'number') {
            const timestamp = order.order_time * 1000;
            orderDate = new Date(timestamp).toISOString().split('T')[0];
          } else if (typeof order.order_time === 'string') {
            orderDate = order.order_time.split(' ')[0];
          }
        } else if (order.validation_date) {
          orderDate = typeof order.validation_date === 'string' ? order.validation_date.split(' ')[0] : '';
        }

        // 如果订单已存在于Map中，累加金额和佣金
        if (orderMap.has(orderId)) {
          const existingData = orderMap.get(orderId);
          existingData.orderAmount += orderAmount;
          existingData.commission += commission;
          // 保留最新的原始数据
          existingData.rawData = order;
        } else {
          // 第一次遇到该订单号，创建记录
          orderMap.set(orderId, {
            orderId,
            merchantId,
            merchantName,
            orderAmount,
            commission,
            status,
            orderDate,
            rawData: order
          });
        }
      });

      console.log(`📊 LB API返回 ${orders.length} 条商品数据，合并后得到 ${orderMap.size} 个订单`);

      // ========== 第2步：将合并后的订单数据入库 ==========
      const selectStmt = dbAdapter.prepare(`
        SELECT id, status, order_amount, commission FROM orders
        WHERE user_id = ? AND platform_account_id = ? AND order_id = ?
      `);

      const insertStmt = dbAdapter.prepare(`
        INSERT INTO orders
        (user_id, platform_account_id, order_id, merchant_id, merchant_name, merchant_slug,
         order_amount, commission, status, order_date, affiliate_name, raw_data)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const updateStmt = dbAdapter.prepare(`
        UPDATE orders
        SET status = ?, commission = ?, order_amount = ?,
            merchant_name = ?, merchant_slug = ?, affiliate_name = ?, raw_data = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);

      let newCount = 0;       // 新增订单数
      let updatedCount = 0;   // 状态更新数
      let skippedCount = 0;   // 跳过订单数

      orderMap.forEach(orderData => {
        // 直接使用聚合后的数据
        const orderId = orderData.orderId;
        const merchantId = orderData.merchantId;
        const merchantName = orderData.merchantName;
        const orderAmount = orderData.orderAmount;  // 已累加的金额
        const commission = orderData.commission;    // 已累加的佣金
        const status = orderData.status;
        const orderDate = orderData.orderDate;

        // 查询是否存在相同订单号
        const existingOrder = selectStmt.get(req.user.id, account.id, orderId);

        if (existingOrder) {
          // 订单已存在，比对状态和金额
          if (existingOrder.status !== status ||
              Math.abs(existingOrder.order_amount - orderAmount) > 0.01 ||
              Math.abs(existingOrder.commission - commission) > 0.01) {
            // 状态或金额不一致，更新订单
            updateStmt.run(
              status,
              commission,
              orderAmount,
              merchantName,
              generateMerchantSlug(merchantName),
              account.affiliate_name || null,
              JSON.stringify(orderData.rawData),
              existingOrder.id
            );
            updatedCount++;
            console.log(`📝 LB订单 ${orderId} 更新: 金额${existingOrder.order_amount}→${orderAmount}, 佣金${existingOrder.commission}→${commission}`);
          } else {
            // 数据一致，跳过
            skippedCount++;
          }
        } else {
          // 订单不存在，插入新订单
          insertStmt.run(
            req.user.id,
            account.id,
            orderId,
            merchantId,
            merchantName,
            generateMerchantSlug(merchantName),
            orderAmount,
            commission,
            status,
            orderDate,
            account.affiliate_name || null,
            JSON.stringify(orderData.rawData)
          );
          newCount++;
        }
      });

      // 构建详细的结果消息
      let message = `采集完成：`;
      const details = [];
      if (newCount > 0) details.push(`新增 ${newCount} 条`);
      if (updatedCount > 0) details.push(`更新 ${updatedCount} 条`);
      if (skippedCount > 0) details.push(`跳过 ${skippedCount} 条`);
      message += details.join('，');

      console.log(`✅ LB ${message}`);

      res.json({
        success: true,
        message: message,
        data: {
          total: response.data.data.total_items || orders.length,  // 使用total_items显示API返回的原始数据行数
          total_trans: response.data.data.total_trans || 0,  // 真实交易数（去重后）
          total_page: response.data.data.total_page || 1,
          orders: orders.map(o => {
            // 处理order_time: 可能是秒级时间戳（数字）或日期字符串
            let dateYmd = '';
            if (o.order_time) {
              if (typeof o.order_time === 'number') {
                // 秒级时间戳转换为YYYY-MM-DD
                const timestamp = o.order_time * 1000;
                dateYmd = new Date(timestamp).toISOString().split('T')[0];
              } else if (typeof o.order_time === 'string') {
                // 字符串格式，提取日期部分
                dateYmd = o.order_time.split(' ')[0];
              }
            }

            return {
              id: o.order_id || o.linkbux_id,
              mcid: o.mcid,
              sitename: o.merchant_name,
              amount: o.sale_amount,
              total_cmsn: o.sale_comm,
              status: o.status,
              date_ymd: dateYmd
            };
          }),
          stats: {
            new: newCount,
            updated: updatedCount,
            skipped: skippedCount,
            total: orders.length
          }
        },
      });
    } else {
      // 处理API错误响应
      const errorCode = response.data.code || (response.data.status && response.data.status.code);
      const errorMessage =
        response.data.msg ||
        response.data.message ||
        (response.data.status && response.data.status.msg) ||
        'LB数据获取失败';

      console.error(`❌ LB API错误 [code: ${errorCode}]: ${errorMessage}`);

      res.json({
        success: false,
        message: `LB API错误: ${errorMessage} (code: ${errorCode})`,
      });
    }
  } catch (error) {
    console.error('采集LB订单错误:', error);
    res.json({ success: false, message: '采集失败: ' + error.message });
  }
}

/**
 * 采集Rewardoo订单数据
 */
async function collectRWOrders(req, res, account, startDate, endDate) {
  try {
    // 获取RW API token（从account.api_token字段读取）
    const rwToken = account.api_token;

    if (!rwToken) {
      return res.json({
        success: false,
        message: 'Rewardoo账号未配置API Token，请在账号设置中添加'
      });
    }

    // 构建POST请求参数
    const params = new URLSearchParams({
      token: rwToken,
      begin_date: startDate,
      end_date: endDate,
      page: '1',
      limit: '1000'
    });

    // 尝试多个可能的API端点
    const apiEndpoints = [
      'https://admin.rewardoo.com/api.php?mod=medium&op=transaction_details',
      'https://admin.rewardoo.com/api.php?mod=transaction&op=details',
      'https://admin.rewardoo.com/api.php?mod=report&op=transaction',
      'https://admin.rewardoo.com/api.php?mod=data&op=transaction'
    ];
    
    let response;
    let apiUrl;
    
    for (const endpoint of apiEndpoints) {
      try {
        console.log(`尝试API端点: ${endpoint}`);
        apiUrl = endpoint;
        response = await axios.post(endpoint, params, {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        });
        console.log(`API端点 ${endpoint} 响应状态:`, response.status);
        console.log(`API端点 ${endpoint} 响应数据:`, JSON.stringify(response.data, null, 2));
        
        // 如果响应成功，跳出循环
        if (response.status === 200) {
          break;
        }
      } catch (error) {
        console.log(`API端点 ${endpoint} 失败:`, error.message);
        continue;
      }
    }

    console.log('📥 开始采集RW订单...');
    console.log('RW Token:', rwToken);
    console.log('日期范围:', startDate, '到', endDate);
    console.log('API URL:', apiUrl);
    console.log('请求参数:', params.toString());

    console.log('RW API响应状态:', response.status);
    console.log('RW API响应数据:', JSON.stringify(response.data, null, 2));

    // RW API响应格式与LB类似
    const isSuccess =
      (response.data.code === 0 || response.data.code === '0') ||
      (response.data.status && (response.data.status.code === 0 || response.data.status.code === '0'));

    if (isSuccess && response.data.data) {
      const orders = response.data.data.list || response.data.data.transactions || [];

      // ========== 第1步：预处理订单数据，累加同一订单号的多个商品 ==========
      const orderMap = new Map();

      orders.forEach(order => {
        const orderId = order.order_id || order.rewardoo_id;
        const merchantId = order.mid;
        const merchantName = order.merchant_name;
        const orderAmount = parseFloat(order.sale_amount || 0);
        const commission = parseFloat(order.sale_comm || 0);

        // 状态映射
        let status = 'Pending';
        if (order.status === 'Approved') status = 'Approved';
        else if (order.status === 'Rejected') status = 'Rejected';
        else status = 'Pending';

        // 订单日期处理
        let orderDate = '';
        if (order.order_time) {
          if (typeof order.order_time === 'number') {
            // 数字类型：秒级时间戳
            const timestamp = order.order_time * 1000;
            orderDate = new Date(timestamp).toISOString().split('T')[0];
          } else if (typeof order.order_time === 'string') {
            // 字符串类型：可能是时间戳字符串或日期字符串
            const numericTimestamp = parseInt(order.order_time);
            if (!isNaN(numericTimestamp) && order.order_time.length === 10) {
              // 10位数字字符串，是秒级时间戳
              const timestamp = numericTimestamp * 1000;
              orderDate = new Date(timestamp).toISOString().split('T')[0];
            } else {
              // 日期字符串格式
              orderDate = order.order_time.split(' ')[0];
            }
          }
        } else if (order.validation_date && order.validation_date !== 'null') {
          orderDate = typeof order.validation_date === 'string' ? order.validation_date.split(' ')[0] : '';
        }

        // 如果订单已存在于Map中，累加金额和佣金
        if (orderMap.has(orderId)) {
          const existingData = orderMap.get(orderId);
          existingData.orderAmount += orderAmount;
          existingData.commission += commission;
          existingData.rawData = order;
        } else {
          orderMap.set(orderId, {
            orderId,
            merchantId,
            merchantName,
            orderAmount,
            commission,
            status,
            orderDate,
            rawData: order
          });
        }
      });

      console.log(`📊 RW API返回 ${orders.length} 条商品数据，合并后得到 ${orderMap.size} 个订单`);

      // ========== 第2步：将合并后的订单数据入库 ==========
      const selectStmt = dbAdapter.prepare(`
        SELECT id, status, order_amount, commission FROM orders
        WHERE user_id = ? AND platform_account_id = ? AND order_id = ?
      `);

      const insertStmt = dbAdapter.prepare(`
        INSERT INTO orders
        (user_id, platform_account_id, order_id, merchant_id, merchant_name, merchant_slug,
         order_amount, commission, status, order_date, affiliate_name, raw_data)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const updateStmt = dbAdapter.prepare(`
        UPDATE orders
        SET status = ?, commission = ?, order_amount = ?,
            merchant_name = ?, merchant_slug = ?, affiliate_name = ?, raw_data = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);

      let newCount = 0;
      let updatedCount = 0;
      let skippedCount = 0;

      orderMap.forEach(orderData => {
        const orderId = orderData.orderId;
        const merchantId = orderData.merchantId;
        const merchantName = orderData.merchantName;
        const orderAmount = orderData.orderAmount;
        const commission = orderData.commission;
        const status = orderData.status;
        const orderDate = orderData.orderDate;

        const existingOrder = selectStmt.get(req.user.id, account.id, orderId);

        if (existingOrder) {
          if (existingOrder.status !== status ||
              Math.abs(existingOrder.order_amount - orderAmount) > 0.01 ||
              Math.abs(existingOrder.commission - commission) > 0.01) {
            updateStmt.run(
              status,
              commission,
              orderAmount,
              merchantName,
              generateMerchantSlug(merchantName),
              account.affiliate_name || null,
              JSON.stringify(orderData.rawData),
              existingOrder.id
            );
            updatedCount++;
            console.log(`📝 RW订单 ${orderId} 更新: 金额${existingOrder.order_amount}→${orderAmount}, 佣金${existingOrder.commission}→${commission}`);
          } else {
            skippedCount++;
          }
        } else {
          insertStmt.run(
            req.user.id,
            account.id,
            orderId,
            merchantId,
            merchantName,
            generateMerchantSlug(merchantName),
            orderAmount,
            commission,
            status,
            orderDate,
            account.affiliate_name || null,
            JSON.stringify(orderData.rawData)
          );
          newCount++;
        }
      });

      let message = `采集完成：`;
      const details = [];
      if (newCount > 0) details.push(`新增 ${newCount} 条`);
      if (updatedCount > 0) details.push(`更新 ${updatedCount} 条`);
      if (skippedCount > 0) details.push(`跳过 ${skippedCount} 条`);
      message += details.join('，');

      console.log(`✅ RW ${message}`);

      res.json({
        success: true,
        message: message,
        data: {
          total: response.data.data.total_items || orders.length,
          total_trans: response.data.data.total_trans || 0,
          total_page: response.data.data.total_page || 1,
          orders: orders.map(o => {
            let dateYmd = '';
            if (o.order_time) {
              if (typeof o.order_time === 'number') {
                const timestamp = o.order_time * 1000;
                dateYmd = new Date(timestamp).toISOString().split('T')[0];
              } else if (typeof o.order_time === 'string') {
                dateYmd = o.order_time.split(' ')[0];
              }
            }

            return {
              id: o.order_id || o.rewardoo_id,
              mcid: o.mcid,
              sitename: o.merchant_name,
              amount: o.sale_amount,
              total_cmsn: o.sale_comm,
              status: o.status,
              date_ymd: dateYmd
            };
          }),
          stats: {
            new: newCount,
            updated: updatedCount,
            skipped: skippedCount,
            total: orders.length
          }
        },
      });
    } else {
      const errorCode = response.data.code || (response.data.status && response.data.status.code);
      const errorMessage =
        response.data.msg ||
        response.data.message ||
        (response.data.status && response.data.status.msg) ||
        'RW数据获取失败';

      console.error(`❌ RW API错误 [code: ${errorCode}]: ${errorMessage}`);

      res.json({
        success: false,
        message: `RW API错误: ${errorMessage} (code: ${errorCode})`,
      });
    }
  } catch (error) {
    console.error('采集RW订单错误:', error);
    res.json({ success: false, message: '采集失败: ' + error.message });
  }
}

/**
 * API: 获取历史订单
 * GET /api/orders
 */
app.get('/api/orders', authenticateToken, async (req, res) => {
  try {
    const { startDate, endDate, platformAccountId } = req.query;

    let query = 'SELECT * FROM orders WHERE user_id = ?';
    const params = [req.user.id];

    if (startDate) {
      query += ' AND order_date >= ?';
      params.push(startDate);
    }

    if (endDate) {
      query += ' AND order_date <= ?';
      params.push(endDate);
    }

    if (platformAccountId) {
      query += ' AND platform_account_id = ?';
      params.push(platformAccountId);
    }

    query += ' ORDER BY order_date DESC LIMIT 1000';

    const orders = await dbAdapter.prepare(query).all(...params);

    res.json({ success: true, data: orders });
  } catch (error) {
    console.error('获取订单错误:', error);
    res.json({ success: false, message: '获取失败: ' + error.message });
  }
});

/**
 * API: 获取统计数据
 * GET /api/stats
 */
app.get('/api/stats', authenticateToken, async (req, res) => {
  try {
    const { startDate, endDate, platformAccountId } = req.query;

    let query = `
      SELECT
        COUNT(*) as total_orders,
        SUM(order_amount) as total_amount,
        SUM(commission) as total_commission,
        SUM(CASE WHEN status = 'Approved' THEN commission ELSE 0 END) as confirmed_commission,
        SUM(CASE WHEN status = 'Pending' THEN commission ELSE 0 END) as pending_commission,
        SUM(CASE WHEN status = 'Rejected' THEN commission ELSE 0 END) as rejected_commission
      FROM orders WHERE user_id = ?
    `;
    const params = [req.user.id];

    if (startDate) {
      query += ' AND order_date >= ?';
      params.push(startDate);
    }

    if (endDate) {
      query += ' AND order_date <= ?';
      params.push(endDate);
    }

    if (platformAccountId) {
      query += ' AND platform_account_id = ?';
      params.push(platformAccountId);
    }

    const stats = await dbAdapter.prepare(query).get(...params);

    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('获取统计错误:', error);
    res.json({ success: false, message: '获取失败: ' + error.message });
  }
});

/**
 * API: 获取商家汇总数据（包含广告数据）
 * GET /api/merchant-summary
 */
app.get('/api/merchant-summary', authenticateToken, async (req, res) => {
  try {
    const { startDate, endDate, platformAccountIds } = req.query;

    // 第一步：获取订单汇总（关联平台账号获取affiliate_name，使用merchant_slug）
    let orderQuery = `
      SELECT
        o.merchant_id,
        o.merchant_name,
        o.merchant_slug,
        pa.affiliate_name,
        COUNT(*) as order_count,
        SUM(o.order_amount) as total_amount,
        SUM(o.commission) as total_commission,
        SUM(CASE WHEN o.status = 'Approved' THEN o.commission ELSE 0 END) as confirmed_commission,
        SUM(CASE WHEN o.status = 'Pending' THEN o.commission ELSE 0 END) as pending_commission,
        SUM(CASE WHEN o.status = 'Rejected' THEN o.commission ELSE 0 END) as rejected_commission
      FROM orders o
      LEFT JOIN platform_accounts pa ON o.platform_account_id = pa.id
      WHERE o.user_id = ?
    `;
    const orderParams = [req.user.id];

    if (startDate) {
      orderQuery += ' AND o.order_date >= ?';
      orderParams.push(startDate);
    }

    if (endDate) {
      orderQuery += ' AND o.order_date <= ?';
      orderParams.push(endDate);
    }

    // 支持多账号ID过滤（逗号分隔的字符串）
    if (platformAccountIds) {
      const accountIds = platformAccountIds.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
      if (accountIds.length > 0) {
        const placeholders = accountIds.map(() => '?').join(',');
        orderQuery += ` AND o.platform_account_id IN (${placeholders})`;
        orderParams.push(...accountIds);
      }
    }

    orderQuery += ' GROUP BY o.merchant_id, o.merchant_name, pa.affiliate_name ORDER BY total_commission DESC';

    const orderSummary = await dbAdapter.prepare(orderQuery).all(...orderParams);
    console.log(`📊 订单汇总查询结果: ${orderSummary.length} 个商家`);
    if (orderSummary.length > 0) {
      console.log('样例商家:', orderSummary[0]);
    }

    // 第二步：获取广告数据汇总（按merchant_slug + affiliate_name分组）
    // 预算取结束日期当天的值，展示/点击/广告费取日期范围内累计
    // 重要：人民币广告费需要按7.15汇率转换成美元
    let adsQuery = `
      SELECT
        merchant_id,
        merchant_slug,
        affiliate_name,
        GROUP_CONCAT(DISTINCT campaign_name) as campaign_names,
        ${endDate ? `MAX(CASE WHEN date = '${endDate}' THEN campaign_budget END)` : 'MAX(campaign_budget)'} as total_budget,
        ${endDate ? `MAX(CASE WHEN date = '${endDate}' THEN currency END)` : 'MAX(currency)'} as currency,
        SUM(impressions) as total_impressions,
        SUM(clicks) as total_clicks,
        SUM(CASE WHEN currency = 'CNY' THEN cost / 7.15 ELSE cost END) as total_cost
      FROM google_ads_data
      WHERE user_id = ?
    `;
    const adsParams = [req.user.id];

    if (startDate) {
      adsQuery += ' AND date >= ?';
      adsParams.push(startDate);
    }

    if (endDate) {
      adsQuery += ' AND date <= ?';
      adsParams.push(endDate);
    }

    // 🔥 新增：根据选中的平台账号过滤affiliate_name（转小写比较）
    if (platformAccountIds) {
      const accountIds = platformAccountIds.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
      if (accountIds.length > 0) {
        // 查询这些账号的affiliate_name并转为小写
        const placeholders = accountIds.map(() => '?').join(',');
        const selectedAffiliateNames = dbAdapter.prepare(`
          SELECT DISTINCT affiliate_name FROM platform_accounts
          WHERE id IN (${placeholders}) AND user_id = ?
        `).all(...accountIds, req.user.id)
          .map(row => row.affiliate_name)
          .filter(name => name)
          .map(name => name.toLowerCase());  // 🔥 统一转小写

        if (selectedAffiliateNames.length > 0) {
          // 使用LOWER()函数进行不区分大小写的比较
          const affiliatePlaceholders = selectedAffiliateNames.map(() => '?').join(',');
          adsQuery += ` AND LOWER(affiliate_name) IN (${affiliatePlaceholders})`;
          adsParams.push(...selectedAffiliateNames);
          console.log(`📊 过滤广告数据：只显示 affiliate_name 为 [${selectedAffiliateNames.join(', ')}] 的数据`);
        }
      }
    }

    adsQuery += ' GROUP BY merchant_id, affiliate_name';

    const adsSummary = await dbAdapter.prepare(adsQuery).all(...adsParams);
    console.log(`📊 广告数据查询结果: ${adsSummary.length} 个商家`);
    if (adsSummary.length > 0) {
      console.log('样例广告商家:', adsSummary[0]);
    }

    // 第三步：合并数据（使用merchant_id + affiliate_name作为复合键）
    const adsMap = new Map();
    adsSummary.forEach(ads => {
      if (ads.merchant_id && ads.affiliate_name) {
        // 使用 merchant_id + affiliate_name 作为复合键（统一转小写比较）
        const key = `${ads.merchant_id}_${(ads.affiliate_name || '').toLowerCase()}`;
        adsMap.set(key, {
          campaign_names: ads.campaign_names || '',
          total_budget: ads.total_budget || 0,
          total_impressions: ads.total_impressions || 0,
          total_clicks: ads.total_clicks || 0,
          total_cost: ads.total_cost || 0
        });
      }
    });

    // ========== 改进：以广告数据为主，合并订单数据（订单可以为0） ==========
    const mergedSummary = [];

    // 遍历所有广告数据
    adsSummary.forEach(ads => {
      if (!ads.merchant_id || !ads.affiliate_name) {
        return; // 跳过无效数据
      }

      // 构建复合键
      const key = `${ads.merchant_id}_${(ads.affiliate_name || '').toLowerCase()}`;

      // 查找对应的订单数据
      const matchingOrder = orderSummary.find(order => {
        const orderKey = `${order.merchant_id}_${(order.affiliate_name || '').toLowerCase()}`;
        return orderKey === key;
      });

      if (matchingOrder) {
        // 有订单数据，合并
        mergedSummary.push({
          merchant_id: matchingOrder.merchant_id,
          merchant_name: matchingOrder.merchant_name,
          merchant_slug: matchingOrder.merchant_slug,
          affiliate_name: matchingOrder.affiliate_name,
          order_count: matchingOrder.order_count,
          total_amount: matchingOrder.total_amount,
          total_commission: matchingOrder.total_commission,
          confirmed_commission: matchingOrder.confirmed_commission,
          pending_commission: matchingOrder.pending_commission,
          rejected_commission: matchingOrder.rejected_commission,
          campaign_names: ads.campaign_names,
          total_budget: ads.total_budget,
          total_impressions: ads.total_impressions,
          total_clicks: ads.total_clicks,
          total_cost: ads.total_cost
        });
      } else {
        // 没有订单数据，但有广告数据，订单相关字段设为0
        mergedSummary.push({
          merchant_id: ads.merchant_id,
          merchant_name: '', // 广告数据中没有merchant_name
          merchant_slug: ads.merchant_slug,
          affiliate_name: ads.affiliate_name,
          order_count: 0,
          total_amount: 0,
          total_commission: 0,
          confirmed_commission: 0,
          pending_commission: 0,
          rejected_commission: 0,
          campaign_names: ads.campaign_names,
          total_budget: ads.total_budget,
          total_impressions: ads.total_impressions,
          total_clicks: ads.total_clicks,
          total_cost: ads.total_cost
        });
        console.log(`ℹ️  广告系列 ${ads.campaign_names}(${ads.affiliate_name}) 没有订单，显示为0`);
      }
    });

    console.log(`📊 最终合并结果: ${mergedSummary.length} 个商家（包含所有有广告数据的商家）`);

    // 🔥 按ROI从大到小排序
    mergedSummary.sort((a, b) => {
      const roiA = a.total_cost > 0 ? ((a.total_commission - a.total_cost) / a.total_cost * 100) : -Infinity;
      const roiB = b.total_cost > 0 ? ((b.total_commission - b.total_cost) / b.total_cost * 100) : -Infinity;
      return roiB - roiA;  // 降序排列
    });

    res.json({ success: true, data: mergedSummary });
  } catch (error) {
    console.error('获取商家汇总错误:', error);
    res.json({ success: false, message: '获取失败: ' + error.message });
  }
});

// ============ Google表格管理API ============

/**
 * 从Google Sheets URL提取sheet ID
 */
function extractSheetId(url) {
  const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

/**
 * 从广告系列名提取联盟名称和商家编号
 * 格式：596-pm1-Champion-US-0826-71017
 * 联盟名称：第1个-和第2个-之间 → pm1
 * 商家编号：最后一个-之后 → 71017（数字ID）
 * 同时生成商家标识符：基于商家名称的标准化字符串（用于匹配字符串格式的merchant_id）
 */
function extractCampaignInfo(campaignName) {
  if (!campaignName) {
    return { affiliateName: '', merchantId: '', merchantSlug: '' };
  }

  const parts = campaignName.split('-');

  // 联盟名称：第2个元素（索引1）
  const affiliateName = parts.length >= 2 ? parts[1] : '';

  // 商家编号：最后一个元素（数字ID）
  const merchantId = parts.length > 0 ? parts[parts.length - 1] : '';

  // 商家名称：第3个元素到倒数第3个元素之间（去掉：序号、联盟、国家、日期、ID）
  // 例如：596-pm1-Champion-US-0826-71017 -> Champion
  let merchantName = '';
  if (parts.length >= 5) {
    // 从索引2开始，到倒数第3个（不包含国家、日期、ID）
    const nameEnd = parts.length - 3;
    merchantName = parts.slice(2, nameEnd).join('-');
  }

  // 生成标准化的商家标识符：小写+移除空格和特殊字符
  // 例如："Champion" -> "champion", "Lily and Me Clothing" -> "lilyandmeclothing"
  const merchantSlug = merchantName.toLowerCase().replace(/[^a-z0-9]/g, '');

  return { affiliateName, merchantId, merchantSlug };
}

/**
 * API: 添加Google表格
 * POST /api/google-sheets
 */
app.post('/api/google-sheets', authenticateToken, (req, res) => {
  try {
    const { sheetName, sheetUrl, description } = req.body;

    if (!sheetName || !sheetUrl) {
      return res.json({ success: false, message: '缺少必要参数' });
    }

    // 提取sheet ID
    const sheetId = extractSheetId(sheetUrl);
    if (!sheetId) {
      return res.json({ success: false, message: '无效的Google表格URL' });
    }

    const result = db
      .prepare(
        'INSERT INTO google_sheets (user_id, sheet_name, sheet_url, sheet_id, description) VALUES (?, ?, ?, ?, ?)'
      )
      .run(req.user.id, sheetName, sheetUrl, sheetId, description || '');

    res.json({
      success: true,
      message: 'Google表格添加成功',
      data: { id: result.lastInsertRowid, sheetName, sheetId },
    });
  } catch (error) {
    console.error('添加Google表格错误:', error);
    res.json({ success: false, message: '添加失败: ' + error.message });
  }
});

/**
 * API: 获取Google表格列表
 * GET /api/google-sheets
 */
app.get('/api/google-sheets', authenticateToken, async (req, res) => {
  try {
    const sheets = await dbAdapter
      .prepare('SELECT * FROM google_sheets WHERE user_id = ? ORDER BY created_at DESC')
      .all(req.user.id);

    res.json({ success: true, data: sheets });
  } catch (error) {
    console.error('获取Google表格错误:', error);
    res.json({ success: false, message: '获取失败: ' + error.message });
  }
});

/**
 * API: 删除Google表格
 * DELETE /api/google-sheets/:id
 */
app.delete('/api/google-sheets/:id', authenticateToken, (req, res) => {
  try {
    const { id } = req.params;

    const result = db
      .prepare('DELETE FROM google_sheets WHERE id = ? AND user_id = ?')
      .run(id, req.user.id);

    if (result.changes === 0) {
      return res.json({ success: false, message: '表格不存在或无权删除' });
    }

    res.json({ success: true, message: '删除成功' });
  } catch (error) {
    console.error('删除Google表格错误:', error);
    res.json({ success: false, message: '删除失败: ' + error.message });
  }
});

/**
 * API: 采集Google表格数据
 * POST /api/collect-google-sheets
 */
app.post('/api/collect-google-sheets', authenticateToken, async (req, res) => {
  try {
    const { sheetId } = req.body;

    if (!sheetId) {
      return res.json({ success: false, message: '缺少必要参数' });
    }

    // 验证表格归属
    const sheet = await dbAdapter
      .prepare('SELECT * FROM google_sheets WHERE id = ? AND user_id = ?')
      .get(sheetId, req.user.id);

    if (!sheet) {
      return res.json({ success: false, message: 'Google表格不存在或无权访问' });
    }

    // 构建CSV导出URL（公开表格可直接访问）
    const csvUrl = `https://docs.google.com/spreadsheets/d/${sheet.sheet_id}/export?format=csv&gid=0`;

    console.log(`📥 开始采集Google表格: ${sheet.sheet_name}`);

    // 获取CSV数据
    const response = await axios.get(csvUrl);
    const csvData = response.data;

    // 解析CSV数据
    const lines = csvData.split('\n');

    // 根据你的描述，A3开始是数据，所以跳过前2行
    const dataLines = lines.slice(2).filter(line => line.trim());

    let newCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    // 获取今天的日期（用于增量更新）
    const today = new Date().toISOString().split('T')[0];

    // 准备SQL语句
    const selectStmt = dbAdapter.prepare(`
      SELECT id FROM google_ads_data
      WHERE sheet_id = ? AND date = ? AND campaign_name = ?
    `);

    const insertStmt = dbAdapter.prepare(`
      INSERT INTO google_ads_data
      (user_id, sheet_id, date, campaign_name, affiliate_name, merchant_id, merchant_slug, campaign_budget, currency, impressions, clicks, cost)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const updateStmt = dbAdapter.prepare(`
      UPDATE google_ads_data
      SET affiliate_name = ?, merchant_id = ?, merchant_slug = ?, campaign_budget = ?, currency = ?, impressions = ?, clicks = ?, cost = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    // 🔥 新增：在内存中先去重（相同campaign_name + 相同date = 重复）
    const uniqueDataMap = new Map();  // 键: "campaignName|date", 值: 行数据

    // 解析每一行数据
    for (const line of dataLines) {
      if (!line.trim()) continue;

      // CSV解析（简单处理，假设没有包含逗号的字段）
      const fields = line.split(',').map(f => f.trim().replace(/^"|"$/g, ''));

      if (fields.length < 11) continue; // 数据不完整，至少需要11列

      // 正确的列顺序映射：
      // 0=广告系列名, 1=目标投放国家, 2=最终到达网址, 3=广告系列预算, 4=广告系列预算所属货币,
      // 5=广告系列类型, 6=出价策略, 7=日期, 8=展示次数, 9=点击次数, 10=花费
      const campaignName = fields[0] || '';
      const date = fields[7] || '';
      const budget = parseFloat(fields[3]) || 0;
      const currency = fields[4] || '';
      const impressions = parseInt(fields[8]) || 0;
      const clicks = parseInt(fields[9]) || 0;
      const cost = parseFloat(fields[10]) || 0;

      if (!date || !campaignName) continue; // 必填字段检查

      // 🔥 去重关键：生成唯一键（campaign_name + date）
      const uniqueKey = `${campaignName}|${date}`;

      // 🔥 如果表格中已经遇到过相同的campaign_name+date，跳过（CSV内部去重）
      if (uniqueDataMap.has(uniqueKey)) {
        console.log(`⚠️  跳过重复数据: ${campaignName}, 日期: ${date} (CSV表格内有重复行)`);
        skippedCount++;
        continue;
      }

      // 提取联盟名称、商家编号和商家标识符
      const { affiliateName, merchantId, merchantSlug } = extractCampaignInfo(campaignName);

      // 存入Map，避免CSV内部重复
      uniqueDataMap.set(uniqueKey, {
        campaignName,
        date,
        budget,
        currency,
        impressions,
        clicks,
        cost,
        affiliateName,
        merchantId,
        merchantSlug
      });
    }

    // 🔥 遍历去重后的唯一数据，插入/更新数据库
    uniqueDataMap.forEach(data => {
      const { campaignName, date, budget, currency, impressions, clicks, cost, affiliateName, merchantId, merchantSlug } = data;

      // 增量更新逻辑：只更新今天的数据
      if (date === today) {
        const existing = selectStmt.get(sheetId, date, campaignName);

        if (existing) {
          // 更新今日数据
          updateStmt.run(affiliateName, merchantId, merchantSlug, budget, currency, impressions, clicks, cost, existing.id);
          updatedCount++;
        } else {
          // 插入新数据
          insertStmt.run(
            req.user.id,
            sheetId,
            date,
            campaignName,
            affiliateName,
            merchantId,
            merchantSlug,
            budget,
            currency,
            impressions,
            clicks,
            cost
          );
          newCount++;
        }
      } else {
        // 非今日数据，检查是否存在
        const existing = selectStmt.get(sheetId, date, campaignName);
        if (!existing) {
          // 历史数据不存在，插入
          insertStmt.run(
            req.user.id,
            sheetId,
            date,
            campaignName,
            affiliateName,
            merchantId,
            merchantSlug,
            budget,
            currency,
            impressions,
            clicks,
            cost
          );
          newCount++;
        } else {
          skippedCount++;
        }
      }
    });

    const message = `采集完成：新增 ${newCount} 条，更新 ${updatedCount} 条，跳过 ${skippedCount} 条`;
    console.log(`✅ ${message}`);

    res.json({
      success: true,
      message: message,
      data: {
        stats: {
          new: newCount,
          updated: updatedCount,
          skipped: skippedCount,
          total: dataLines.length
        }
      }
    });
  } catch (error) {
    console.error('采集Google表格错误:', error);
    res.json({ success: false, message: '采集失败: ' + error.message });
  }
});

/**
 * API: 获取Google广告数据
 * GET /api/google-ads-data
 */
app.get('/api/google-ads-data', authenticateToken, async (req, res) => {
  try {
    const { startDate, endDate, sheetId } = req.query;

    let query = 'SELECT * FROM google_ads_data WHERE user_id = ?';
    const params = [req.user.id];

    if (startDate) {
      query += ' AND date >= ?';
      params.push(startDate);
    }

    if (endDate) {
      query += ' AND date <= ?';
      params.push(endDate);
    }

    if (sheetId) {
      query += ' AND sheet_id = ?';
      params.push(sheetId);
    }

    query += ' ORDER BY date DESC, campaign_name ASC LIMIT 1000';

    const data = await dbAdapter.prepare(query).all(...params);

    res.json({ success: true, data: data });
  } catch (error) {
    console.error('获取Google广告数据错误:', error);
    res.json({ success: false, message: '获取失败: ' + error.message });
  }
});

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: '服务运行正常',
    timestamp: new Date().toISOString(),
  });
});

// 启动服务器
app.listen(PORT, () => {
  console.log('\n🚀 多用户SaaS系统启动成功！');
  console.log('='.repeat(60));
  console.log(`📡 服务地址: http://localhost:${PORT}`);
  console.log(`🔗 打开浏览器访问: http://localhost:${PORT}`);
  console.log('='.repeat(60));
  console.log('\n💡 提示: 按 Ctrl+C 停止服务器\n');
});
