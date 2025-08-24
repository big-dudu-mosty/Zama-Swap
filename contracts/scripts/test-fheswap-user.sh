#!/bin/bash

# 编译合约
echo "🔨 编译合约..."
npx hardhat compile

# 运行本地测试
echo "🧪 运行 FHESwapUser 测试..."
npx hardhat test test/FHESwapUser.ts

# 如果需要在 Sepolia 测试网上测试，取消下面的注释
# echo "🧪 在 Sepolia 上运行 FHESwapUser 测试..."
# npx hardhat test test/FHESwapUser.ts --network sepolia
