// 多用户SaaS系统前端逻辑
const API_BASE = 'http://localhost:3000/api';
let authToken = null;
let currentUser = null;
let platformAccounts = [];
let selectedAccountIds = []; // 改为数组，支持多选
let googleSheets = []; // Google表格列表

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
  document.getElementById('addGoogleSheetForm').addEventListener('submit', handleAddGoogleSheet);
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
  loadGoogleSheets();
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

  // 清空之前的选择状态
  selectedAccountIds = [];

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
            ${account.affiliate_name ? `<span style="background: #28a745; color: white; padding: 2px 8px; border-radius: 3px; font-size: 11px; margin-left: 8px; font-weight: bold;">${account.affiliate_name}</span>` : ''}
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

  // 清空状态提示
  showMessage('collectStatus', '请勾选要采集的账号', 'info');
}

// 切换账号选择状态
function toggleAccountSelection(accountId) {
  // 确保accountId是数字类型
  const id = typeof accountId === 'string' ? parseInt(accountId) : accountId;
  const index = selectedAccountIds.indexOf(id);
  if (index > -1) {
    selectedAccountIds.splice(index, 1);
  } else {
    selectedAccountIds.push(id);
  }
  console.log('当前选中的账号IDs:', selectedAccountIds); // 调试日志
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
  const affiliateName = document.getElementById('affiliateName').value.trim();

  try {
    const response = await fetch(`${API_BASE}/platform-accounts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ platform, accountName, accountPassword, affiliateName }),
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
    let totalOrdersCount = 0;  // 实际入库的订单数（新增+更新）
    let totalProcessedCount = 0;  // 总处理数（新增+更新+跳过）

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

          // 计算实际入库数（新增+更新）和总处理数（新增+更新+跳过）
          const stats = result.data.stats || {};
          const savedCount = (stats.new || 0) + (stats.updated || 0);  // 实际入库数
          const processedCount = stats.total || result.data.orders.length || 0;  // 总处理数

          totalOrdersCount += savedCount;
          totalProcessedCount += processedCount;
          successCount++;

          // 显示详细的采集统计
          let statusMsg = `[${i + 1}/${totalAccounts}] ✅ ${account.account_name} - ${result.message}`;

          if (stats) {
            const details = [];
            if (stats.new > 0) details.push(`新增${stats.new}条`);
            if (stats.updated > 0) details.push(`更新${stats.updated}条`);
            if (stats.skipped > 0) details.push(`跳过${stats.skipped}条`);
            if (details.length > 0) {
              statusMsg += ` (${details.join('，')})`;
            }
          }

          showMessage('collectStatus', statusMsg, 'success');
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
      // 构建详细的采集结果消息
      let finalMsg = `🎉 采集完成！成功: ${successCount}个账号，失败: ${failCount}个账号`;
      if (totalProcessedCount > totalOrdersCount) {
        // 有跳过的订单，显示更详细的信息
        const skippedCount = totalProcessedCount - totalOrdersCount;
        finalMsg += `，实际入库 ${totalOrdersCount} 条（查询到 ${totalProcessedCount} 条，跳过 ${skippedCount} 条重复订单）`;
      } else {
        finalMsg += `，共采集 ${totalOrdersCount} 条订单`;
      }

      showMessage('collectStatus', finalMsg, 'success');

      // 从数据库查询该日期范围内的统计数据（而不是仅统计本次采集的数据）
      await fetchAndDisplayStats(startDate, endDate);
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

// 从数据库查询并显示统计数据
async function fetchAndDisplayStats(startDate, endDate) {
  try {
    // 如果选中了多个账号，需要分别查询然后累加
    let totalOrders = 0;
    let totalAmount = 0;
    let totalCommission = 0;

    if (selectedAccountIds.length === 0) {
      // 没有选中账号，查询所有订单
      const params = new URLSearchParams({ startDate, endDate });
      const response = await fetch(`${API_BASE}/stats?${params.toString()}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const result = await response.json();

      if (result.success && result.data) {
        totalOrders = result.data.total_orders || 0;
        totalAmount = result.data.total_amount || 0;
        totalCommission = result.data.total_commission || 0;
      }
    } else {
      // 为每个选中的账号分别查询统计数据，然后累加
      for (const accountId of selectedAccountIds) {
        const params = new URLSearchParams({
          startDate,
          endDate,
          platformAccountId: accountId
        });

        const response = await fetch(`${API_BASE}/stats?${params.toString()}`, {
          headers: { Authorization: `Bearer ${authToken}` },
        });

        const result = await response.json();

        if (result.success && result.data) {
          totalOrders += result.data.total_orders || 0;
          totalAmount += result.data.total_amount || 0;
          totalCommission += result.data.total_commission || 0;
        }
      }
    }

    // 显示统计数据
    document.getElementById('totalOrders').textContent = totalOrders;
    document.getElementById('totalAmount').textContent = '$' + totalAmount.toFixed(2);
    document.getElementById('totalCommission').textContent = '$' + totalCommission.toFixed(2);

    document.getElementById('statsSection').style.display = 'block';
  } catch (error) {
    console.error('获取统计数据失败:', error);
  }
}

// 显示统计数据（保留用于兼容性）
function displayStats(total) {
  document.getElementById('totalOrders').textContent = total.items || '0';
  document.getElementById('totalAmount').textContent = '$' + (total.total_amount || '0');
  document.getElementById('totalCommission').textContent = '$' + (total.total_aff_ba || '0');

  document.getElementById('statsSection').style.display = 'block';
}

// 计算并显示本次采集的商家汇总（改为从后端API获取，包含广告数据）
async function calculateAndDisplayMerchantSummary(orders) {
  // 获取日期范围（从采集表单）
  const startDate = document.getElementById('startDate').value;
  const endDate = document.getElementById('endDate').value;

  // 构建查询参数：只包含选中的账号
  const params = new URLSearchParams({
    startDate,
    endDate
  });

  // 如果选中了账号，添加平台账号ID过滤（只查询选中账号的数据）
  if (selectedAccountIds.length > 0) {
    // 注意：后端目前只支持单个platformAccountId参数
    // 如果选中多个账号，可以改为：
    // 1. 后端支持逗号分隔的多个ID：platformAccountId=1,6
    // 2. 或者后端支持数组参数：platformAccountId[]=1&platformAccountId[]=6
    // 3. 或者前端只传第一个（当前方案）

    // 方案1：只传第一个选中的账号ID
    params.append('platformAccountId', selectedAccountIds[0]);

    // TODO: 未来如果需要支持多账号汇总，需要修改后端API
  }

  try {
    // 调用后端API获取商家汇总（包含广告数据）
    const response = await fetch(`${API_BASE}/merchant-summary?${params.toString()}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    const result = await response.json();

    if (result.success) {
      displayMerchantSummary(result.data);
    } else {
      console.error('获取商家汇总失败:', result.message);
      // 降级方案：使用前端计算（不含广告数据）
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
  } catch (error) {
    console.error('调用商家汇总API失败:', error);
    // 降级方案同上
    displayMerchantSummary([]);
  }
}

// 显示商家汇总表格（包含营销指标：CR、EPC、CPC、ROI）
function displayMerchantSummary(summary) {
  const tbody = document.getElementById('merchantTableBody');
  tbody.innerHTML = '';

  if (summary.length === 0) {
    tbody.innerHTML = '<tr><td colspan="13" style="text-align: center; color: #999;">暂无数据</td></tr>';
    document.getElementById('merchantSection').style.display = 'block';
    return;
  }

  summary.forEach((merchant, index) => {
    // 处理广告系列名称（可能很长，截取前面部分或显示数量）
    let campaignDisplay = '-';
    if (merchant.campaign_names) {
      const campaigns = merchant.campaign_names.split(',');
      if (campaigns.length > 1) {
        campaignDisplay = `${campaigns[0].substring(0, 25)}... (共${campaigns.length}个)`;
      } else {
        campaignDisplay = campaigns[0].substring(0, 35) + (campaigns[0].length > 35 ? '...' : '');
      }
    }

    // 计算营销指标
    const clicks = merchant.total_clicks || 0;
    const orders = merchant.order_count || 0;
    const commission = merchant.total_commission || 0;
    const cost = merchant.total_cost || 0;

    // CR (Conversion Rate) = 订单数 / 点击数 * 100%
    const cr = clicks > 0 ? (orders / clicks * 100).toFixed(2) : '0.00';

    // EPC (Earnings Per Click) = 总佣金 / 点击数
    const epc = clicks > 0 ? (commission / clicks).toFixed(2) : '0.00';

    // CPC (Cost Per Click) = 广告费 / 点击数
    const cpc = clicks > 0 ? (cost / clicks).toFixed(2) : '0.00';

    // ROI (Return On Investment) = (总佣金 - 广告费) / 广告费 * 100%
    let roi = '0.00';
    let roiColor = '#999';
    if (cost > 0) {
      const roiValue = ((commission - cost) / cost * 100);
      roi = roiValue.toFixed(2);
      // ROI颜色：正数绿色，负数红色
      roiColor = roiValue >= 0 ? '#28a745' : '#dc3545';
    }

    const row = tbody.insertRow();
    row.innerHTML = `
      <td>${index + 1}</td>
      <td style="background: #f0f4ff; font-size: 12px;" title="${merchant.campaign_names || '-'}">${campaignDisplay}</td>
      <td><strong>${merchant.merchant_id || '-'}</strong></td>
      <td style="background: #f0f4ff;">$${(merchant.total_budget || 0).toFixed(2)}</td>
      <td style="background: #f0f4ff;">${(merchant.total_impressions || 0).toLocaleString()}</td>
      <td style="background: #f0f4ff;">${clicks.toLocaleString()}</td>
      <td style="background: #f0f4ff;"><strong style="color: #dc3545;">$${cost.toFixed(2)}</strong></td>
      <td>${orders}</td>
      <td><strong style="color: #667eea;">$${commission.toFixed(2)}</strong></td>
      <td style="background: #e8f5e9;"><strong>${cr}%</strong></td>
      <td style="background: #e8f5e9;"><strong>$${epc}</strong></td>
      <td style="background: #e8f5e9;"><strong>$${cpc}</strong></td>
      <td style="background: #e8f5e9;"><strong style="color: ${roiColor};">${roi}%</strong></td>
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

// ============ Google表格管理 ============

// 加载Google表格列表
async function loadGoogleSheets() {
  try {
    const response = await fetch(`${API_BASE}/google-sheets`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    const result = await response.json();

    if (result.success) {
      googleSheets = result.data;
      renderGoogleSheetsList();
    }
  } catch (error) {
    console.error('加载Google表格失败:', error);
  }
}

// 渲染Google表格列表
function renderGoogleSheetsList() {
  const container = document.getElementById('googleSheetsList');

  if (googleSheets.length === 0) {
    container.innerHTML = '<p style="color: #999;">暂无Google表格，请先添加</p>';
    return;
  }

  container.innerHTML = googleSheets
    .map(
      sheet => `
    <div class="account-item">
      <div class="account-info">
        <div>
          <span class="platform-badge" style="background: #4285f4;">Google Sheets</span>
          <strong>${sheet.sheet_name}</strong>
          ${sheet.description ? `<div style="font-size: 12px; color: #999; margin-top: 5px;">${sheet.description}</div>` : ''}
          <div style="font-size: 12px; color: #999; margin-top: 5px;">
            添加于 ${new Date(sheet.created_at).toLocaleDateString()}
          </div>
        </div>
      </div>
      <div class="account-actions">
        <button onclick="collectGoogleSheetData(${sheet.id})" class="btn-primary" style="margin-right: 10px;">
          采集数据
        </button>
        <button onclick="viewSheetUrl('${sheet.sheet_url}')" class="btn-secondary" style="margin-right: 10px;">
          查看表格
        </button>
        <button onclick="deleteGoogleSheet(${sheet.id})" class="btn-danger">删除</button>
      </div>
    </div>
  `
    )
    .join('');
}

// 显示添加Google表格弹窗
function showAddGoogleSheetModal() {
  document.getElementById('addGoogleSheetModal').style.display = 'block';
}

// 关闭添加Google表格弹窗
function closeAddGoogleSheetModal() {
  document.getElementById('addGoogleSheetModal').style.display = 'none';
  document.getElementById('addGoogleSheetForm').reset();
  document.getElementById('addGoogleSheetStatus').className = 'status-message';
  document.getElementById('addGoogleSheetStatus').textContent = '';
}

// 处理添加Google表格
async function handleAddGoogleSheet(e) {
  e.preventDefault();

  const sheetName = document.getElementById('sheetName').value;
  const sheetUrl = document.getElementById('sheetUrl').value;
  const description = document.getElementById('sheetDescription').value;

  try {
    const response = await fetch(`${API_BASE}/google-sheets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ sheetName, sheetUrl, description }),
    });

    const result = await response.json();

    if (result.success) {
      showMessage('addGoogleSheetStatus', '添加成功！', 'success');

      setTimeout(() => {
        closeAddGoogleSheetModal();
        loadGoogleSheets();
      }, 1000);
    } else {
      showMessage('addGoogleSheetStatus', result.message, 'error');
    }
  } catch (error) {
    showMessage('addGoogleSheetStatus', '网络请求失败: ' + error.message, 'error');
  }
}

// 删除Google表格
async function deleteGoogleSheet(sheetId) {
  if (!confirm('确定要删除这个Google表格吗？相关的广告数据也会被删除。')) return;

  try {
    const response = await fetch(`${API_BASE}/google-sheets/${sheetId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${authToken}` },
    });

    const result = await response.json();

    if (result.success) {
      alert('删除成功');
      loadGoogleSheets();
    } else {
      alert('删除失败: ' + result.message);
    }
  } catch (error) {
    alert('网络请求失败: ' + error.message);
  }
}

// 查看表格URL
function viewSheetUrl(url) {
  window.open(url, '_blank');
}

// 采集Google表格数据
async function collectGoogleSheetData(sheetId) {
  const sheet = googleSheets.find(s => s.id === sheetId);
  if (!sheet) return;

  if (!confirm(`确定要采集表格"${sheet.sheet_name}"的数据吗？`)) return;

  const statusMsg = `正在采集 ${sheet.sheet_name} 的数据...`;

  // 临时创建一个状态提示区域
  const statusDiv = document.createElement('div');
  statusDiv.id = 'collectSheetStatus';
  statusDiv.className = 'status-message info';
  statusDiv.textContent = statusMsg;
  statusDiv.style.marginTop = '15px';

  const container = document.getElementById('googleSheetsList');
  const existingStatus = document.getElementById('collectSheetStatus');
  if (existingStatus) {
    existingStatus.remove();
  }
  container.parentElement.insertBefore(statusDiv, container.nextSibling);

  try {
    const response = await fetch(`${API_BASE}/collect-google-sheets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ sheetId }),
    });

    const result = await response.json();

    if (result.success) {
      statusDiv.textContent = `✅ ${result.message}`;
      statusDiv.className = 'status-message success';

      setTimeout(() => {
        statusDiv.remove();
      }, 5000);
    } else {
      statusDiv.textContent = `❌ 采集失败: ${result.message}`;
      statusDiv.className = 'status-message error';
    }
  } catch (error) {
    statusDiv.textContent = `❌ 网络请求失败: ${error.message}`;
    statusDiv.className = 'status-message error';
  }
}
