@echo off
echo ===============================================
echo    家庭囤货助手 v1.5.0 - 推送到GitHub
echo ===============================================
echo.

echo 正在初始化Git仓库...
git init
echo.

echo 配置Git用户信息...
git config user.name "suxian"
git config user.email "your-email@example.com"
echo.

echo 添加所有文件到Git...
git add .
echo.

echo 创建初始提交...
git commit -m "Initial commit: 家庭囤货助手 v1.5.0

功能特性:
✅ 物品管理（增删改查）
✅ 智能筛选和排序
✅ 图片上传功能（1:1比例裁剪）
✅ +/-快速数量调整
✅ 智能归档系统
✅ 过期提醒通知
✅ 本地数据存储
✅ 自定义图标
✅ 响应式UI设计

技术栈:
- React Native + Expo
- TypeScript
- AsyncStorage
- Expo Notifications
- Expo Image Picker"
echo.

echo.
echo ===============================================
echo    重要：请按以下步骤推送到GitHub
echo ===============================================
echo.
echo 1. 打开浏览器访问: https://github.com
echo 2. 登录您的GitHub账号
echo 3. 点击右上角"+" → "New repository"
echo 4. 仓库名称: stock-manager (或您喜欢的名称)
echo 5. 保持公开（Public）
echo 6. 不要勾选"Add a README file"
echo 7. 点击"Create repository"
echo.
echo 8. 复制仓库的HTTPS地址，例如:
echo    https://github.com/YOUR_USERNAME/stock-manager.git
echo.
echo 9. 运行以下命令（替换为您自己的仓库地址）:
echo    git remote add origin YOUR_REPOSITORY_URL
echo    git push -u origin main
echo.
echo ===============================================
pause

