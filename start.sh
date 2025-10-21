#!/bin/bash
# 快速启动脚本

echo "🚀 启动联盟营销数据采集系统..."

# 检查Node.js版本
node_version=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$node_version" -lt 18 ]; then
    echo "❌ Node.js版本过低，需要 >= 18.0.0"
    exit 1
fi

# 启动服务器
node server-v2.js
