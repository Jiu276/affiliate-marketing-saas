// 多用户SaaS系统前端逻辑
const API_BASE = 'http://localhost:3000/api';
let authToken = null;
let currentUser = null;
let platformAccounts = [];
let selectedAccountId = null;

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
  // 检查是否有保存的token
  const savedToken = localStorage.getItem('authToken');
  if (savedToken) {
    authToken = savedToken;
    loadUserProfile();
  }

  // 设置默认日期（最近7天）
  const today = new Date();
  const weekAgo = new Date(today);
  weekAgo.setDate(today.getDate() - 7);

  const startInput = document.getElementById('startDate');
  const endInput = document.getElementById('endDate');

  if (startInput && endInput) {
    startInput.valueAsDate = weekAgo;
    endInput.valueAsDate = today;
  }

  // 绑定事件
  document.getElementById('loginForm').addEventListener('submit', handleLogin);
  document.getElementById('registerForm').addEventListener('submit', handleRegister);
  document.getElementById('addAccountForm').addEventListener('submit', handleAddAccount);
  document.getElementById('collectForm').addEventListener('submit', handleCollect);
});

// ============ Tab切换 ============
function showTab(tabName) {
  // 切换按钮状态
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  event.target.classList.add('active');

  // 切换内容
  document.getElementById('loginTab').classList.remove('active');
  document.getElementById('registerTab').classList.remove('active');

  if (tabName === 'login') {
    document.getElementById('loginTab').classList.add('active');
  } else {
    document.getElementById('registerTab').classList.add('active');
  }
}

// ============ 用户认证 ============

// 处理注册
async function handleRegister(e) {
  e.preventDefault();

  const username = document.getElementById('registerUsername').value;
  const email = document.getElementById('registerEmail').value;
  const password = document.getElementById('registerPassword').value;

  try {
    const response = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password }),
    });

    const result = await response.json();

    if (result.success) {
      authToken = result.data.token;
      currentUser = result.data.user;

      localStorage.setItem('authToken', authToken);

      showMessage('registerStatus', '注册成功！正在跳转...', 'success');

      setTimeout(() => {
        showAppSection();
      }, 1000);
    } else {
      showMessage('registerStatus', result.message, 'error');
    }
  } catch (error) {
    showMessage('registerStatus', '网络请求失败: ' + error.message, 'error');
  }
}

// 处理登录
async function handleLogin(e) {
  e.preventDefault();

  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;

  try {
    const response = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const result = await response.json();

    if (result.success) {
      authToken = result.data.token;
      currentUser = result.data.user;

      localStorage.setItem('authToken', authToken);

      showMessage('loginStatus', '登录成功！正在跳转...', 'success');

      setTimeout(() => {
        showAppSection();
      }, 1000);
    } else {
      showMessage('loginStatus', result.message, 'error');
    }
  } catch (error) {
    showMessage('loginStatus', '网络请求失败: ' + error.message, 'error');
  }
}

// 加载用户信息
async function loadUserProfile() {
  try {
    const response = await fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    const result = await response.json();

    if (result.success) {
      currentUser = result.data;
      showAppSection();
    } else {
      // Token无效，清除并返回登录页
      logout();
    }
  } catch (error) {
    console.error('加载用户信息失败:', error);
    logout();
  }
}

// 退出登录
function logout() {
  authToken = null;
  currentUser = null;
  localStorage.removeItem('authToken');

  document.getElementById('authSection').style.display = 'block';
  document.getElementById('appSection').style.display = 'none';
}

// 显示应用主页面
function showAppSection() {
  document.getElementById('authSection').style.display = 'none';
  document.getElementById('appSection').style.display = 'block';
  document.getElementById('currentUser').textContent = currentUser.username;

  loadPlatformAccounts();
}

// ============ 平台账号管理 ============

// 加载平台账号列表
async function loadPlatformAccounts() {
  try {
    const response = await fetch(`${API_BASE}/platform-accounts`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    const result = await response.json();

    if (result.success) {
      platformAccounts = result.data;
      renderAccountsList();
    }
  } catch (error) {
    console.error('加载平台账号失败:', error);
  }
}

// 渲染账号列表
function renderAccountsList() {
  const container = document.getElementById('accountsList');

  if (platformAccounts.length === 0) {
    container.innerHTML = '<p style="color: #999;">暂无平台账号，请先添加</p>';
    document.getElementById('collectSection').style.display = 'none';
    return;
  }

  container.innerHTML = platformAccounts
    .map(
      account => `
    <div class="account-item">
      <div class="account-info">
        <span class="platform-badge">${account.platform}</span>
        <strong>${account.account_name}</strong>
        <div style="font-size: 12px; color: #999; margin-top: 5px;">
          添加于 ${new Date(account.created_at).toLocaleDateString()}
        </div>
      </div>
      <div class="account-actions">
        <button onclick="selectAccount(${account.id})" class="btn-success">选择</button>
        <button onclick="deleteAccount(${account.id})" class="btn-danger">删除</button>
      </div>
    </div>
  `
    )
    .join('');
}

// 选择账号用于采集
function selectAccount(accountId) {
  selectedAccountId = accountId;
  const account = platformAccounts.find(a => a.id === accountId);

  // 显示采集区域
  document.getElementById('collectSection').style.display = 'block';

  // 更新UI提示
  document.querySelectorAll('.account-item').forEach(item => {
    item.style.border = '1px solid #e0e0e0';
  });
  event.target.closest('.account-item').style.border = '2px solid #667eea';

  showMessage('collectStatus', `已选择: ${account.platform} - ${account.account_name}`, 'info');
}

// 显示添加账号弹窗
function showAddAccountModal() {
  document.getElementById('addAccountModal').style.display = 'block';
}

// 关闭添加账号弹窗
function closeAddAccountModal() {
  document.getElementById('addAccountModal').style.display = 'none';
  document.getElementById('addAccountForm').reset();
  document.getElementById('addAccountStatus').className = 'status-message';
  document.getElementById('addAccountStatus').textContent = '';
}

// 处理添加账号
async function handleAddAccount(e) {
  e.preventDefault();

  const platform = document.getElementById('platformSelect').value;
  const accountName = document.getElementById('accountName').value;
  const accountPassword = document.getElementById('accountPassword').value;

  try {
    const response = await fetch(`${API_BASE}/platform-accounts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ platform, accountName, accountPassword }),
    });

    const result = await response.json();

    if (result.success) {
      showMessage('addAccountStatus', '添加成功！', 'success');

      setTimeout(() => {
        closeAddAccountModal();
        loadPlatformAccounts();
      }, 1000);
    } else {
      showMessage('addAccountStatus', result.message, 'error');
    }
  } catch (error) {
    showMessage('addAccountStatus', '网络请求失败: ' + error.message, 'error');
  }
}

// 删除账号
async function deleteAccount(accountId) {
  if (!confirm('确定要删除这个平台账号吗？')) return;

  try {
    const response = await fetch(`${API_BASE}/platform-accounts/${accountId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${authToken}` },
    });

    const result = await response.json();

    if (result.success) {
      alert('删除成功');
      loadPlatformAccounts();

      if (selectedAccountId === accountId) {
        selectedAccountId = null;
        document.getElementById('collectSection').style.display = 'none';
      }
    } else {
      alert('删除失败: ' + result.message);
    }
  } catch (error) {
    alert('网络请求失败: ' + error.message);
  }
}

// ============ 数据采集 ============

// 处理数据采集
async function handleCollect(e) {
  e.preventDefault();

  if (!selectedAccountId) {
    showMessage('collectStatus', '请先选择一个平台账号', 'error');
    return;
  }

  const startDate = document.getElementById('startDate').value;
  const endDate = document.getElementById('endDate').value;

  const submitBtn = e.target.querySelector('button[type="submit"]');
  const btnText = document.getElementById('collectBtnText');
  const spinner = document.getElementById('collectSpinner');

  submitBtn.disabled = true;
  btnText.textContent = '采集中...';
  spinner.style.display = 'inline-block';

  document.getElementById('statsSection').style.display = 'none';

  try {
    showMessage('collectStatus', '正在自动登录LH平台并采集数据...（这可能需要10-30秒）', 'info');

    const response = await fetch(`${API_BASE}/collect-orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        platformAccountId: selectedAccountId,
        startDate,
        endDate,
      }),
    });

    const result = await response.json();

    if (result.success) {
      showMessage('collectStatus', `✅ ${result.message}`, 'success');

      // 显示统计数据
      if (result.data && result.data.total) {
        displayStats(result.data.total);
      }

      // 直接用本次采集的订单数据计算商家汇总
      if (result.data && result.data.orders) {
        calculateAndDisplayMerchantSummary(result.data.orders);
      }
    } else {
      showMessage('collectStatus', result.message, 'error');
    }
  } catch (error) {
    showMessage('collectStatus', '网络请求失败: ' + error.message, 'error');
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

// 计算并显示本次采集的商家汇总（前端计算）
function calculateAndDisplayMerchantSummary(orders) {
  const merchantMap = new Map();

  orders.forEach(order => {
    const mcid = order.mcid;
    if (!merchantMap.has(mcid)) {
      merchantMap.set(mcid, {
        merchant_id: mcid,
        merchant_name: order.sitename,
        order_count: 0,
        total_amount: 0,
        total_commission: 0,
        pending_commission: 0,
        confirmed_commission: 0,
        rejected_commission: 0,
      });
    }

    const merchant = merchantMap.get(mcid);
    merchant.order_count++;
    merchant.total_amount += parseFloat(order.amount || 0);

    const commission = parseFloat(order.total_cmsn || 0);
    merchant.total_commission += commission;

    if (order.status === 'Pending') {
      merchant.pending_commission += commission;
    } else if (order.status === 'Confirmed' || order.status === 'Paid') {
      merchant.confirmed_commission += commission;
    } else if (order.status === 'Rejected' || order.status === 'Cancelled') {
      merchant.rejected_commission += commission;
    }
  });

  const summary = Array.from(merchantMap.values());
  summary.sort((a, b) => b.total_commission - a.total_commission);

  displayMerchantSummary(summary);
}

// 显示商家汇总表格
function displayMerchantSummary(summary) {
  const tbody = document.getElementById('merchantTableBody');
  tbody.innerHTML = '';

  if (summary.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; color: #999;">暂无数据</td></tr>';
    document.getElementById('merchantSection').style.display = 'block';
    return;
  }

  summary.forEach((merchant, index) => {
    const row = tbody.insertRow();
    row.innerHTML = `
      <td>${index + 1}</td>
      <td><strong>${merchant.merchant_name || '未知'}</strong></td>
      <td>${merchant.merchant_id || '-'}</td>
      <td>${merchant.order_count || 0}</td>
      <td>$${(merchant.total_amount || 0).toFixed(2)}</td>
      <td><strong style="color: #667eea;">$${(merchant.total_commission || 0).toFixed(2)}</strong></td>
      <td style="color: #ffa500;">$${(merchant.pending_commission || 0).toFixed(2)}</td>
      <td style="color: #28a745;">$${(merchant.confirmed_commission || 0).toFixed(2)}</td>
      <td style="color: #dc3545;">$${(merchant.rejected_commission || 0).toFixed(2)}</td>
    `;
  });

  document.getElementById('merchantSection').style.display = 'block';
}

// 显示消息
function showMessage(elementId, message, type) {
  const el = document.getElementById(elementId);
  el.textContent = message;
  el.className = `status-message ${type}`;
}
