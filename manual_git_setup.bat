@echo off
echo ===============================================
echo    手动Git设置指南
echo ===============================================
echo.
echo 如果自动脚本失败，请手动执行以下命令：
echo.
echo 1. 初始化仓库:
echo    git init
echo.
echo 2. 配置用户信息:
echo    git config user.name "suxian"
echo    git config user.email "your-email@example.com"
echo.
echo 3. 添加文件:
echo    git add .
echo.
echo 4. 提交代码:
echo    git commit -m "Initial commit: 家庭囤货助手 v1.5.0"
echo.
echo 5. 在GitHub创建仓库后，添加远程地址:
echo    git remote add origin YOUR_REPOSITORY_URL
echo.
echo 6. 推送代码:
echo    git push -u origin main
echo.
echo ===============================================
echo 重要提醒：
echo - 请先在 https://github.com 创建新仓库
echo - 仓库名建议: stock-manager
echo - 保持公开(Public)
echo - 不要添加README文件
echo ===============================================
pause

