// 多用户SaaS系统前端逻辑
const API_BASE = 'http://localhost:3000/api';
let authToken = null;
let currentUser = null;
let platformAccounts = [];
let selectedAccountIds = []; // 改为数组，支持多选

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

  container.innerHTML = `
    <div style="margin-bottom: 15px;">
      <button onclick="selectAllAccounts()" class="btn-secondary">全选</button>
      <button onclick="deselectAllAccounts()" class="btn-secondary" style="margin-left: 10px;">取消全选</button>
    </div>
  ` + platformAccounts
    .map(
      account => `
    <div class="account-item" data-account-id="${account.id}">
      <div class="account-info">
        <label style="display: flex; align-items: center; cursor: pointer;">
          <input type="checkbox"
                 class="account-checkbox"
                 value="${account.id}"
                 onchange="toggleAccountSelection(${account.id})"
                 style="width: 18px; height: 18px; margin-right: 12px; cursor: pointer;">
          <div>
            <span class="platform-badge">${account.platform}</span>
            <strong>${account.account_name}</strong>
            <div style="font-size: 12px; color: #999; margin-top: 5px;">
              添加于 ${new Date(account.created_at).toLocaleDateString()}
            </div>
          </div>
        </label>
      </div>
      <div class="account-actions">
        <button onclick="deleteAccount(${account.id})" class="btn-danger">删除</button>
      </div>
    </div>
  `
    )
    .join('');

  // 显示采集区域
  document.getElementById('collectSection').style.display = 'block';
}

// 切换账号选择状态
function toggleAccountSelection(accountId) {
  const index = selectedAccountIds.indexOf(accountId);
  if (index > -1) {
    selectedAccountIds.splice(index, 1);
  } else {
    selectedAccountIds.push(accountId);
  }
  updateSelectionUI();
}

// 全选账号
function selectAllAccounts() {
  selectedAccountIds = platformAccounts.map(a => a.id);
  document.querySelectorAll('.account-checkbox').forEach(cb => {
    cb.checked = true;
  });
  updateSelectionUI();
}

// 取消全选
function deselectAllAccounts() {
  selectedAccountIds = [];
  document.querySelectorAll('.account-checkbox').forEach(cb => {
    cb.checked = false;
  });
  updateSelectionUI();
}

// 更新选择状态UI
function updateSelectionUI() {
  const count = selectedAccountIds.length;

  if (count > 0) {
    document.getElementById('collectSection').style.display = 'block';

    const accounts = platformAccounts
      .filter(a => selectedAccountIds.includes(a.id))
      .map(a => `${a.platform}-${a.account_name}`)
      .join(', ');

    showMessage('collectStatus', `已选择 ${count} 个账号: ${accounts}`, 'info');
  } else {
    showMessage('collectStatus', '请选择至少一个平台账号', 'error');
  }
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

      // 从已选列表中移除
      const index = selectedAccountIds.indexOf(accountId);
      if (index > -1) {
        selectedAccountIds.splice(index, 1);
      }

      loadPlatformAccounts();

      // 如果没有任何选中的账号，隐藏采集区域
      if (selectedAccountIds.length === 0) {
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

// 处理数据采集（支持多账号）
async function handleCollect(e) {
  e.preventDefault();

  if (selectedAccountIds.length === 0) {
    showMessage('collectStatus', '请先选择至少一个平台账号', 'error');
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
    const totalAccounts = selectedAccountIds.length;
    showMessage(
      'collectStatus',
      `正在采集 ${totalAccounts} 个账号的数据...（每个账号约需10-30秒）`,
      'info'
    );

    // 存储所有账号的订单数据
    const allOrders = [];
    let successCount = 0;
    let failCount = 0;
    let totalOrdersCount = 0;

    // 循环采集每个账号
    for (let i = 0; i < selectedAccountIds.length; i++) {
      const accountId = selectedAccountIds[i];
      const account = platformAccounts.find(a => a.id === accountId);

      showMessage(
        'collectStatus',
        `[${i + 1}/${totalAccounts}] 正在采集 ${account.platform} - ${account.account_name}...`,
        'info'
      );

      try {
        const response = await fetch(`${API_BASE}/collect-orders`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            platformAccountId: accountId,
            startDate,
            endDate,
          }),
        });

        const result = await response.json();

        if (result.success && result.data && result.data.orders) {
          allOrders.push(...result.data.orders);
          totalOrdersCount += result.data.total.items || 0;
          successCount++;

          showMessage(
            'collectStatus',
            `[${i + 1}/${totalAccounts}] ✅ ${account.account_name} 采集成功，获取 ${result.data.total.items} 条订单`,
            'success'
          );
        } else {
          failCount++;
          showMessage(
            'collectStatus',
            `[${i + 1}/${totalAccounts}] ❌ ${account.account_name} 采集失败: ${result.message}`,
            'error'
          );
        }
      } catch (error) {
        failCount++;
        showMessage(
          'collectStatus',
          `[${i + 1}/${totalAccounts}] ❌ ${account.account_name} 网络请求失败: ${error.message}`,
          'error'
        );
      }

      // 每个账号之间延迟1秒，避免请求过快
      if (i < selectedAccountIds.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // 显示最终结果
    if (successCount > 0) {
      showMessage(
        'collectStatus',
        `🎉 采集完成！成功: ${successCount}个账号，失败: ${failCount}个账号，共采集 ${totalOrdersCount} 条订单`,
        'success'
      );

      // 计算总统计数据
      const totalStats = {
        items: totalOrdersCount,
        total_amount: allOrders.reduce((sum, o) => sum + parseFloat(o.amount || 0), 0).toFixed(2),
        total_aff_ba: allOrders.reduce((sum, o) => sum + parseFloat(o.total_cmsn || 0), 0).toFixed(2),
      };

      displayStats(totalStats);
      calculateAndDisplayMerchantSummary(allOrders);
    } else {
      showMessage('collectStatus', '❌ 所有账号采集均失败，请检查账号配置或网络连接', 'error');
    }
  } catch (error) {
    showMessage('collectStatus', '采集过程出错: ' + error.message, 'error');
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
    } else if (order.status === 'Approved') {
      merchant.confirmed_commission += commission;
    } else if (order.status === 'Rejected') {
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
