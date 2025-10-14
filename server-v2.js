// 多用户SaaS系统 - Express后端服务器
const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const { db, initDatabase } = require('./db');
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
initDatabase();

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
    const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existingUser) {
      return res.json({ success: false, message: '该邮箱已被注册' });
    }

    // 创建用户
    const passwordHash = await hashPassword(password);
    const result = db
      .prepare('INSERT INTO users (email, password_hash, username) VALUES (?, ?, ?)')
      .run(email, passwordHash, username);

    const token = generateToken({ id: result.lastInsertRowid, email, username });

    res.json({
      success: true,
      message: '注册成功',
      data: { token, user: { id: result.lastInsertRowid, email, username } },
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

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
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
app.get('/api/auth/me', authenticateToken, (req, res) => {
  const user = db.prepare('SELECT id, email, username, created_at FROM users WHERE id = ?').get(req.user.id);

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
app.post('/api/platform-accounts', authenticateToken, (req, res) => {
  try {
    const { platform, accountName, accountPassword, affiliateName, apiToken } = req.body;

    if (!platform || !accountName) {
      return res.json({ success: false, message: '缺少必要参数' });
    }

    // LinkBux和Rewardoo平台必须提供apiToken，其他平台必须提供密码
    if (platform === 'linkbux' || platform === 'rewardoo') {
      if (!apiToken) {
        return res.json({ success: false, message: `${platform === 'linkbux' ? 'LinkBux' : 'Rewardoo'}平台需要提供API Token` });
      }
    } else {
      if (!accountPassword) {
        return res.json({ success: false, message: '请提供账号密码' });
      }
    }

    // 加密密码（如果有）
    const encryptedPassword = accountPassword ? encryptPassword(accountPassword) : null;

    const result = db
      .prepare(
        'INSERT INTO platform_accounts (user_id, platform, account_name, account_password, affiliate_name, api_token) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(req.user.id, platform, accountName, encryptedPassword, affiliateName || null, apiToken || null);

    res.json({
      success: true,
      message: '平台账号添加成功',
      data: { id: result.lastInsertRowid, platform, accountName, affiliateName },
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
app.get('/api/platform-accounts', authenticateToken, (req, res) => {
  try {
    const accounts = db
      .prepare(
        'SELECT id, platform, account_name, affiliate_name, is_active, created_at FROM platform_accounts WHERE user_id = ?'
      )
      .all(req.user.id);

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
  db.prepare(
    'INSERT INTO platform_tokens (platform_account_id, token, expire_time) VALUES (?, ?, ?)'
  ).run(platformAccountId, loginResult.token, loginResult.expireTime);

  return loginResult.token;
}

// ============ PartnerMatic平台自动登录 ============

/**
 * 自动登录PM平台
 */
async function autoLoginPM(accountName, accountPassword) {
  console.log('🔐 开始登录PartnerMatic...');

  try {
    const response = await axios.post(
      'https://api.partnermatic.com/auth/sign_in',
      {
        appId: 32,
        req: {
          header: {
            token: ''
          },
          fields: [],
          attributes: {},
          filter: {
            platform_code: '',
            account: accountName,
            password: accountPassword
          }
        }
      },
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.data.code === '0' && response.data.data && response.data.data.auth_token) {
      console.log('✅ PM平台自动登录成功');
      return {
        success: true,
        token: response.data.data.auth_token,
        uid: response.data.data.uid,
        uname: response.data.data.uname,
        expireTime: response.data.data.expire_time,
      };
    } else {
      console.log(`❌ PM登录失败: ${response.data.message}`);
      throw new Error(`PM登录失败: ${response.data.message}`);
    }
  } catch (error) {
    console.error('❌ PM登录请求失败:', error.message);
    throw error;
  }
}

/**
 * 获取或刷新PM平台token
 */
async function getPMToken(platformAccountId) {
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
      console.log('✅ 使用缓存的PM token');
      return tokenRecord.token;
    }
  }

  // Token过期或不存在，重新登录
  console.log('🔄 Token已过期，开始自动登录PM平台...');

  const account = db
    .prepare('SELECT account_name, account_password FROM platform_accounts WHERE id = ?')
    .get(platformAccountId);

  if (!account) {
    throw new Error('平台账号不存在');
  }

  const accountPassword = decryptPassword(account.account_password);
  const loginResult = await autoLoginPM(account.account_name, accountPassword);

  // 保存新token
  db.prepare(
    'INSERT INTO platform_tokens (platform_account_id, token, expire_time) VALUES (?, ?, ?)'
  ).run(platformAccountId, loginResult.token, loginResult.expireTime);

  return loginResult.token;
}

// ============ LinkBux平台API Token管理 ============
// LinkBux使用固定API Token，不需要登录，直接从账号配置中读取

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
    const account = db
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
 * 采集LinkHaitao订单数据
 */
async function collectLHOrders(req, res, account, startDate, endDate) {
  try {
    // 获取LH token（自动登录）
    const lhToken = await getLHToken(account.id);

    // 获取订单数据
    const exportFlag = '0';
    const page = 1;
    const pageSize = 100;
    const signData = `${startDate}${endDate}${page}${pageSize}${exportFlag}`;
    const sign = generateSign(signData);

    const response = await axios.post(
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
      const orders = response.data.payload.info || [];

      // 智能订单处理：去重、状态比对、更新
      const selectStmt = db.prepare(`
        SELECT id, status FROM orders
        WHERE user_id = ? AND platform_account_id = ? AND order_id = ?
      `);

      const insertStmt = db.prepare(`
        INSERT INTO orders
        (user_id, platform_account_id, order_id, merchant_id, merchant_name,
         order_amount, commission, status, order_date, raw_data)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const updateStmt = db.prepare(`
        UPDATE orders
        SET status = ?, commission = ?, order_amount = ?,
            merchant_name = ?, raw_data = ?
        WHERE id = ?
      `);

      let newCount = 0;       // 新增订单数
      let updatedCount = 0;   // 状态更新数
      let skippedCount = 0;   // 跳过订单数

      orders.forEach(order => {
        // 字段映射（根据实际API返回的字段）
        const orderId = order.id;  // LH返回的唯一ID
        const merchantId = order.mcid;
        const merchantName = order.sitename;
        const orderAmount = parseFloat(order.amount || 0);
        const commission = parseFloat(order.total_cmsn || 0);
        const status = order.status;
        const orderDate = order.date_ymd || order.updated_date;

        // 查询是否存在相同订单号
        const existingOrder = selectStmt.get(req.user.id, account.id, orderId);

        if (existingOrder) {
          // 订单已存在，比对状态
          if (existingOrder.status === status) {
            // 状态一致，跳过
            skippedCount++;
          } else {
            // 状态不一致，更新订单
            updateStmt.run(
              status,
              commission,
              orderAmount,
              merchantName,
              JSON.stringify(order),
              existingOrder.id
            );
            updatedCount++;
            console.log(`📝 订单 ${orderId} 状态更新: ${existingOrder.status} -> ${status}`);
          }
        } else {
          // 订单不存在，插入新订单
          insertStmt.run(
            req.user.id,
            account.id,  // 修复: 使用account.id而不是未定义的platformAccountId
            orderId,
            merchantId,
            merchantName,
            orderAmount,
            commission,
            status,
            orderDate,
            JSON.stringify(order)
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

      console.log(`✅ ${message}`);

      res.json({
        success: true,
        message: message,
        data: {
          total: response.data.payload.total,
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
      res.json({
        success: false,
        message: response.data.msg || '数据获取失败',
      });
    }
  } catch (error) {
    console.error('采集LH订单错误:', error);
    res.json({ success: false, message: '采集失败: ' + error.message });
  }
}

/**
 * 采集PartnerMatic订单数据
 */
async function collectPMOrders(req, res, account, startDate, endDate) {
  try {
    // 获取PM token（自动登录）
    const pmToken = await getPMToken(account.id);

    // 获取订单数据
    const response = await axios.post(
      'https://api.partnermatic.com/report/transactions',
      {
        appId: 32,
        req: {
          header: {
            token: pmToken
          },
          fields: [],
          attributes: {},
          filter: {
            start_date: startDate,
            end_date: endDate,
            date_type: '0',
            medium_id: '',
            brand_name: '',
            tag: '',
            order_id: '',
            product_id: '',
            settlement_id: '',
            payment_id: '',
            sign_id: '',
            status: '',
            sort_field: 'transaction_date',
            sort_order: 'desc',
            page_num: 1,
            page_size: 1000,
            export: 0
          },
          page: {
            number: 1,
            size: 1000
          }
        }
      },
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    const isSuccess = response.data.code === '0' && response.data.data;

    if (isSuccess) {
      const orders = response.data.data.list || [];  // PM API返回的是list字段

      // 智能订单处理：去重、状态比对、更新
      const selectStmt = db.prepare(`
        SELECT id, status FROM orders
        WHERE user_id = ? AND platform_account_id = ? AND order_id = ?
      `);

      const insertStmt = db.prepare(`
        INSERT INTO orders
        (user_id, platform_account_id, order_id, merchant_id, merchant_name,
         order_amount, commission, status, order_date, raw_data)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const updateStmt = db.prepare(`
        UPDATE orders
        SET status = ?, commission = ?, order_amount = ?,
            merchant_name = ?, raw_data = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);

      let newCount = 0;       // 新增订单数
      let updatedCount = 0;   // 状态更新数
      let skippedCount = 0;   // 跳过订单数

      orders.forEach(order => {
        // 字段映射（根据PM API返回的字段）
        const orderId = order.orderId;  // PM返回的订单号
        const merchantId = order.buStoreId ? String(order.buStoreId) : order.mcid;  // PM平台必须使用buStoreId作为商家ID
        const merchantName = order.buStoreName;
        const orderAmount = parseFloat(order.amount || 0);
        const commission = parseFloat(order.cashback || 0);

        // 状态映射：PENDING/CANCELED/APPROVED
        let status = 'Pending';
        if (order.status === 'APPROVED') status = 'Approved';
        else if (order.status === 'CANCELED') status = 'Rejected';
        else status = 'Pending';

        const orderDate = order.transactionDate ? order.transactionDate.split(' ')[0] : '';

        // 查询是否存在相同订单号
        const existingOrder = selectStmt.get(req.user.id, account.id, orderId);

        if (existingOrder) {
          // 订单已存在，比对状态
          if (existingOrder.status === status) {
            // 状态一致，跳过
            skippedCount++;
          } else {
            // 状态不一致，更新订单
            updateStmt.run(
              status,
              commission,
              orderAmount,
              merchantName,
              JSON.stringify(order),
              existingOrder.id
            );
            updatedCount++;
            console.log(`📝 PM订单 ${orderId} 状态更新: ${existingOrder.status} -> ${status}`);
          }
        } else {
          // 订单不存在，插入新订单
          insertStmt.run(
            req.user.id,
            account.id,
            orderId,
            merchantId,
            merchantName,
            orderAmount,
            commission,
            status,
            orderDate,
            JSON.stringify(order)
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

      console.log(`✅ PM ${message}`);

      res.json({
        success: true,
        message: message,
        data: {
          total: response.data.data.pagination || { total: orders.length },
          orders: orders.map(o => ({
            id: o.orderId,
            mcid: o.mcid,
            sitename: o.buStoreName,
            amount: o.amount,
            total_cmsn: o.cashback,
            status: o.status,
            date_ymd: o.transactionDate ? o.transactionDate.split(' ')[0] : ''
          })),
          stats: {
            new: newCount,
            updated: updatedCount,
            skipped: skippedCount,
            total: orders.length
          }
        },
      });
    } else {
      res.json({
        success: false,
        message: response.data.message || 'PM数据获取失败',
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
      const selectStmt = db.prepare(`
        SELECT id, status, order_amount, commission FROM orders
        WHERE user_id = ? AND platform_account_id = ? AND order_id = ?
      `);

      const insertStmt = db.prepare(`
        INSERT INTO orders
        (user_id, platform_account_id, order_id, merchant_id, merchant_name,
         order_amount, commission, status, order_date, raw_data)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const updateStmt = db.prepare(`
        UPDATE orders
        SET status = ?, commission = ?, order_amount = ?,
            merchant_name = ?, raw_data = ?, updated_at = CURRENT_TIMESTAMP
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
            orderAmount,
            commission,
            status,
            orderDate,
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

    const apiUrl = 'https://admin.rewardoo.com/api.php?mod=medium&op=transaction_details';

    console.log('📥 开始采集RW订单...');

    const response = await axios.post(apiUrl, params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

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
      const selectStmt = db.prepare(`
        SELECT id, status, order_amount, commission FROM orders
        WHERE user_id = ? AND platform_account_id = ? AND order_id = ?
      `);

      const insertStmt = db.prepare(`
        INSERT INTO orders
        (user_id, platform_account_id, order_id, merchant_id, merchant_name,
         order_amount, commission, status, order_date, raw_data)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const updateStmt = db.prepare(`
        UPDATE orders
        SET status = ?, commission = ?, order_amount = ?,
            merchant_name = ?, raw_data = ?, updated_at = CURRENT_TIMESTAMP
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
            orderAmount,
            commission,
            status,
            orderDate,
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
app.get('/api/orders', authenticateToken, (req, res) => {
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

    const orders = db.prepare(query).all(...params);

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
app.get('/api/stats', authenticateToken, (req, res) => {
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

    const stats = db.prepare(query).get(...params);

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
app.get('/api/merchant-summary', authenticateToken, (req, res) => {
  try {
    const { startDate, endDate, platformAccountIds } = req.query;

    // 第一步：获取订单汇总
    let orderQuery = `
      SELECT
        merchant_id,
        merchant_name,
        COUNT(*) as order_count,
        SUM(order_amount) as total_amount,
        SUM(commission) as total_commission,
        SUM(CASE WHEN status = 'Approved' THEN commission ELSE 0 END) as confirmed_commission,
        SUM(CASE WHEN status = 'Pending' THEN commission ELSE 0 END) as pending_commission,
        SUM(CASE WHEN status = 'Rejected' THEN commission ELSE 0 END) as rejected_commission
      FROM orders
      WHERE user_id = ?
    `;
    const orderParams = [req.user.id];

    if (startDate) {
      orderQuery += ' AND order_date >= ?';
      orderParams.push(startDate);
    }

    if (endDate) {
      orderQuery += ' AND order_date <= ?';
      orderParams.push(endDate);
    }

    // 支持多账号ID过滤（逗号分隔的字符串）
    if (platformAccountIds) {
      const accountIds = platformAccountIds.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
      if (accountIds.length > 0) {
        const placeholders = accountIds.map(() => '?').join(',');
        orderQuery += ` AND platform_account_id IN (${placeholders})`;
        orderParams.push(...accountIds);
      }
    }

    orderQuery += ' GROUP BY merchant_id, merchant_name ORDER BY total_commission DESC';

    const orderSummary = db.prepare(orderQuery).all(...orderParams);
    console.log(`📊 订单汇总查询结果: ${orderSummary.length} 个商家`);
    if (orderSummary.length > 0) {
      console.log('样例商家:', orderSummary[0]);
    }

    // 第二步：获取广告数据汇总（按merchant_id分组）
    // 注意：预算是每日预算，不累加，只取结束日期那天的值
    let adsQuery = `
      SELECT
        merchant_id,
        GROUP_CONCAT(DISTINCT campaign_name) as campaign_names,
        (
          SELECT campaign_budget
          FROM google_ads_data AS inner_ads
          WHERE inner_ads.merchant_id = google_ads_data.merchant_id
            AND inner_ads.user_id = google_ads_data.user_id
            ${endDate ? `AND inner_ads.date = '${endDate}'` : ''}
          LIMIT 1
        ) as total_budget,
        SUM(impressions) as total_impressions,
        SUM(clicks) as total_clicks,
        SUM(cost) as total_cost
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

    adsQuery += ' GROUP BY merchant_id';

    const adsSummary = db.prepare(adsQuery).all(...adsParams);
    console.log(`📊 广告数据查询结果: ${adsSummary.length} 个商家`);
    if (adsSummary.length > 0) {
      console.log('样例广告商家:', adsSummary[0]);
    }

    // 第三步：合并数据
    const adsMap = new Map();
    adsSummary.forEach(ads => {
      if (ads.merchant_id) {
        adsMap.set(ads.merchant_id, {
          campaign_names: ads.campaign_names || '',
          total_budget: ads.total_budget || 0,
          total_impressions: ads.total_impressions || 0,
          total_clicks: ads.total_clicks || 0,
          total_cost: ads.total_cost || 0
        });
      }
    });

    // 合并订单汇总和广告数据，只保留有广告数据的商家
    const mergedSummary = orderSummary
      .map(order => {
        const adsData = adsMap.get(order.merchant_id);

        // 如果该商家没有广告数据，返回null（稍后过滤掉）
        if (!adsData || !adsData.campaign_names) {
          return null;
        }

        return {
          ...order,
          campaign_names: adsData.campaign_names,
          total_budget: adsData.total_budget,
          total_impressions: adsData.total_impressions,
          total_clicks: adsData.total_clicks,
          total_cost: adsData.total_cost
        };
      })
      .filter(item => item !== null); // 过滤掉没有广告数据的商家

    console.log(`📊 最终合并结果: ${mergedSummary.length} 个商家（有广告数据）`);

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
app.get('/api/google-sheets', authenticateToken, (req, res) => {
  try {
    const sheets = db
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
    const sheet = db
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
    const selectStmt = db.prepare(`
      SELECT id FROM google_ads_data
      WHERE sheet_id = ? AND date = ? AND campaign_name = ?
    `);

    const insertStmt = db.prepare(`
      INSERT INTO google_ads_data
      (user_id, sheet_id, date, campaign_name, affiliate_name, merchant_id, campaign_budget, currency, impressions, clicks, cost)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const updateStmt = db.prepare(`
      UPDATE google_ads_data
      SET affiliate_name = ?, merchant_id = ?, campaign_budget = ?, currency = ?, impressions = ?, clicks = ?, cost = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

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

      // 提取联盟名称和商家编号
      const { affiliateName, merchantId } = extractCampaignInfo(campaignName);

      // 增量更新逻辑：只更新今天的数据
      if (date === today) {
        const existing = selectStmt.get(sheetId, date, campaignName);

        if (existing) {
          // 更新今日数据
          updateStmt.run(affiliateName, merchantId, budget, currency, impressions, clicks, cost, existing.id);
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
    }

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
app.get('/api/google-ads-data', authenticateToken, (req, res) => {
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

    const data = db.prepare(query).all(...params);

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
