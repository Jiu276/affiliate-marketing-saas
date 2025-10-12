// 全局变量
const API_BASE = 'http://localhost:3000/api';
let userToken = null;
let userName = null;
let captchaTimestamp = null; // 存储验证码对应的timestamp

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
  // 检查是否有保存的token
  const savedToken = localStorage.getItem('token');
  const savedUser = localStorage.getItem('username');

  if (savedToken && savedUser) {
    userToken = savedToken;
    userName = savedUser;
    showDataSection();
  }

  // 设置默认日期（最近7天）
  const today = new Date();
  const weekAgo = new Date(today);
  weekAgo.setDate(today.getDate() - 7);

  document.getElementById('startDate').valueAsDate = weekAgo;
  document.getElementById('endDate').valueAsDate = today;

  // 绑定事件
  document.getElementById('loginForm').addEventListener('submit', handleLogin);
  document.getElementById('fetchForm').addEventListener('submit', handleFetchData);
  document.getElementById('captchaImg').addEventListener('click', refreshCaptcha);
});

// 刷新验证码
async function refreshCaptcha() {
  const img = document.getElementById('captchaImg');
  const url = `${API_BASE}/captcha?t=${Date.now()}`;

  try {
    const response = await fetch(url);
    const timestamp = response.headers.get('X-Captcha-Timestamp');

    if (timestamp) {
      captchaTimestamp = timestamp;
      console.log('验证码timestamp:', captchaTimestamp);
    }

    // 将图片转为blob并设置src
    const blob = await response.blob();
    img.src = URL.createObjectURL(blob);
  } catch (error) {
    console.error('获取验证码失败:', error);
    // 降级方案：直接设置src
    img.src = url;
  }
}

// 处理登录
async function handleLogin(e) {
  e.preventDefault();

  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  const code = document.getElementById('captcha').value;

  // 显示加载状态
  const submitBtn = e.target.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span class="spinner"></span> 登录中...';

  try {
    // 如果没有timestamp，先刷新验证码获取
    if (!captchaTimestamp) {
      await refreshCaptcha();
    }

    const response = await fetch(`${API_BASE}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username,
        password,
        code,
        timestamp: captchaTimestamp, // 传递验证码对应的timestamp
      }),
    });

    const result = await response.json();

    if (result.success) {
      // 登录成功
      userToken = result.data.token;
      userName = result.data.username;

      // 保存到localStorage
      localStorage.setItem('token', userToken);
      localStorage.setItem('username', userName);

      showMessage('loginStatus', result.message, 'success');

      // 1秒后切换到数据采集页面
      setTimeout(() => {
        showDataSection();
      }, 1000);
    } else {
      // 登录失败
      showMessage('loginStatus', result.message, 'error');
      await refreshCaptcha(); // 刷新验证码
      document.getElementById('captcha').value = '';
      document.getElementById('captcha').focus(); // 聚焦到验证码输入框
    }
  } catch (error) {
    showMessage('loginStatus', '网络请求失败: ' + error.message, 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = '登录';
  }
}

// 处理数据采集
async function handleFetchData(e) {
  e.preventDefault();

  const startDate = document.getElementById('startDate').value;
  const endDate = document.getElementById('endDate').value;

  if (!startDate || !endDate) {
    showMessage('fetchStatus', '请选择日期范围', 'error');
    return;
  }

  // 显示加载状态
  const submitBtn = e.target.querySelector('button[type="submit"]');
  const btnText = document.getElementById('fetchBtnText');
  const spinner = document.getElementById('fetchSpinner');

  submitBtn.disabled = true;
  btnText.textContent = '采集中...';
  spinner.style.display = 'inline-block';

  // 隐藏之前的结果
  document.getElementById('statsSection').style.display = 'none';
  document.getElementById('summarySection').style.display = 'none';

  try {
    showMessage('fetchStatus', '正在从LinkHaitao获取订单数据...', 'info');

    const response = await fetch(`${API_BASE}/fetch-orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: userToken,
        startDate,
        endDate,
        page: 1,
        pageSize: 100,
      }),
    });

    const result = await response.json();

    if (result.success) {
      const payload = result.data;
      const orders = payload.info || [];

      if (orders.length === 0) {
        showMessage('fetchStatus', '该日期范围内没有订单数据', 'info');
        return;
      }

      showMessage('fetchStatus', `✅ 成功获取 ${orders.length} 条订单`, 'success');

      // 显示统计数据
      displayStats(payload.total);

      // 计算商家汇总
      const summaryResponse = await fetch(`${API_BASE}/summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orders }),
      });

      const summaryResult = await summaryResponse.json();

      if (summaryResult.success) {
        displaySummary(summaryResult.data);
      }
    } else {
      showMessage('fetchStatus', result.message, 'error');

      // 如果是token过期，返回登录页
      if (result.message.includes('token') || result.message.includes('auth')) {
        setTimeout(() => {
          logout();
        }, 2000);
      }
    }
  } catch (error) {
    showMessage('fetchStatus', '网络请求失败: ' + error.message, 'error');
  } finally {
    submitBtn.disabled = false;
    btnText.textContent = '开始采集';
    spinner.style.display = 'none';
  }
}

// 显示统计数据
function displayStats(total) {
  document.getElementById('totalOrders').textContent = total.items || '0';
  document.getElementById('totalAmount').textContent = '$' + (total.total_amount || '0');
  document.getElementById('totalCommission').textContent = '$' + (total.total_aff_ba || '0');

  document.getElementById('statsSection').style.display = 'block';
}

// 显示商家汇总表格
function displaySummary(summary) {
  const tbody = document.getElementById('summaryTableBody');
  tbody.innerHTML = '';

  summary.forEach((merchant, index) => {
    const row = tbody.insertRow();
    row.innerHTML = `
      <td>${index + 1}</td>
      <td><strong>${merchant.sitename}</strong></td>
      <td>${merchant.mcid}</td>
      <td>${merchant.orderCount}</td>
      <td>$${merchant.totalAmount.toFixed(2)}</td>
      <td><strong>$${merchant.totalCommission.toFixed(2)}</strong></td>
      <td>$${merchant.pendingCommission.toFixed(2)}</td>
      <td style="color: green;">$${merchant.confirmedCommission.toFixed(2)}</td>
      <td style="color: red;">$${merchant.rejectedCommission.toFixed(2)}</td>
    `;
  });

  document.getElementById('summarySection').style.display = 'block';
}

// 显示消息
function showMessage(elementId, message, type) {
  const el = document.getElementById(elementId);
  el.textContent = message;
  el.className = `status-message ${type}`;
}

// 切换到数据采集页面
function showDataSection() {
  document.getElementById('loginSection').style.display = 'none';
  document.getElementById('dataSection').style.display = 'block';
  document.getElementById('currentUser').textContent = userName;
}

// 退出登录
async function logout() {
  userToken = null;
  userName = null;
  localStorage.removeItem('token');
  localStorage.removeItem('username');

  document.getElementById('loginSection').style.display = 'block';
  document.getElementById('dataSection').style.display = 'none';
  document.getElementById('captcha').value = '';
  await refreshCaptcha();

  showMessage('loginStatus', '已退出登录', 'info');
}
