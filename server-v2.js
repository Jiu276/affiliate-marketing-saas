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
    const { platform, accountName, accountPassword } = req.body;

    if (!platform || !accountName || !accountPassword) {
      return res.json({ success: false, message: '缺少必要参数' });
    }

    // 加密密码
    const encryptedPassword = encryptPassword(accountPassword);

    const result = db
      .prepare(
        'INSERT INTO platform_accounts (user_id, platform, account_name, account_password) VALUES (?, ?, ?, ?)'
      )
      .run(req.user.id, platform, accountName, encryptedPassword);

    res.json({
      success: true,
      message: '平台账号添加成功',
      data: { id: result.lastInsertRowid, platform, accountName },
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
        'SELECT id, platform, account_name, is_active, created_at FROM platform_accounts WHERE user_id = ?'
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

// ============ 数据采集API（改造版）============

/**
 * API: 采集订单数据
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

    // 获取LH token（自动登录）
    const lhToken = await getLHToken(platformAccountId);

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

      // 保存订单到数据库
      const insertStmt = db.prepare(`
        INSERT OR REPLACE INTO orders
        (user_id, platform_account_id, order_id, merchant_id, merchant_name,
         order_amount, commission, status, order_date, raw_data)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      orders.forEach(order => {
        // 字段映射（根据实际API返回的字段）
        const orderId = order.id;  // LH返回的唯一ID
        const merchantId = order.mcid;
        const merchantName = order.sitename;
        const orderAmount = parseFloat(order.amount || 0);
        const commission = parseFloat(order.total_cmsn || 0);
        const status = order.status;
        const orderDate = order.date_ymd || order.updated_date;

        insertStmt.run(
          req.user.id,
          platformAccountId,
          orderId,
          merchantId,
          merchantName,
          orderAmount,
          commission,
          status,
          orderDate,
          JSON.stringify(order)
        );
      });

      res.json({
        success: true,
        message: `成功采集 ${orders.length} 条订单`,
        data: {
          total: response.data.payload.total,
          orders: orders,
        },
      });
    } else {
      res.json({
        success: false,
        message: response.data.msg || '数据获取失败',
      });
    }
  } catch (error) {
    console.error('采集订单错误:', error);
    res.json({ success: false, message: '采集失败: ' + error.message });
  }
});

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
        SUM(CASE WHEN status = 'Confirmed' OR status = 'Paid' THEN commission ELSE 0 END) as confirmed_commission,
        SUM(CASE WHEN status = 'Pending' THEN commission ELSE 0 END) as pending_commission,
        SUM(CASE WHEN status = 'Rejected' OR status = 'Cancelled' THEN commission ELSE 0 END) as rejected_commission
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
 * API: 获取商家汇总数据
 * GET /api/merchant-summary
 */
app.get('/api/merchant-summary', authenticateToken, (req, res) => {
  try {
    const { startDate, endDate, platformAccountId } = req.query;

    let query = `
      SELECT
        merchant_id,
        merchant_name,
        COUNT(*) as order_count,
        SUM(order_amount) as total_amount,
        SUM(commission) as total_commission,
        SUM(CASE WHEN status = 'Confirmed' OR status = 'Paid' THEN commission ELSE 0 END) as confirmed_commission,
        SUM(CASE WHEN status = 'Pending' THEN commission ELSE 0 END) as pending_commission,
        SUM(CASE WHEN status = 'Rejected' OR status = 'Cancelled' THEN commission ELSE 0 END) as rejected_commission
      FROM orders
      WHERE user_id = ?
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

    query += ' GROUP BY merchant_id, merchant_name ORDER BY total_commission DESC';

    const summary = db.prepare(query).all(...params);

    res.json({ success: true, data: summary });
  } catch (error) {
    console.error('获取商家汇总错误:', error);
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
