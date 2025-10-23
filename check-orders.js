const { db, dbAdapter } = require('./db-simple');

async function checkOrders() {
  try {
    console.log('🔍 检查数据库中的订单数据...');
    
    // 使用dbAdapter查询
    const count = await dbAdapter.prepare('SELECT COUNT(*) as count FROM orders').get();
    console.log('📊 订单总数:', count.count);
    
    if (count.count > 0) {
      const orders = await dbAdapter.prepare('SELECT order_id, order_amount, commission, status, merchant_name FROM orders LIMIT 5').all();
      console.log('📋 订单数据样本:');
      console.table(orders);
    } else {
      console.log('❌ 数据库中没有订单数据');
    }
    
    // 检查平台账号
    const accounts = await dbAdapter.prepare('SELECT id, platform, account_name, affiliate_name FROM platform_accounts').all();
    console.log('🔑 平台账号:');
    console.table(accounts);
    
  } catch (error) {
    console.error('❌ 查询错误:', error);
  }
}

checkOrders();
