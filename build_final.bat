@echo off
echo ===============================================
echo    家庭囤货助手 v2.0.0 - 正式发布版本
echo ===============================================
echo.
echo 构建配置：
echo - 目标平台：Android
echo - 输出格式：APK（适合直接安装分享）
echo - 构建模式：Preview（包含完整功能）
echo.

echo 设置构建环境...
set EAS_NO_VCS=1

echo.
echo 开始构建APK文件...
echo 这可能需要5-15分钟，请耐心等待...
echo.

npx eas build --platform android --profile preview --non-interactive

echo.
echo ===============================================
echo          构建完成！
echo ===============================================
echo.
echo 请访问以下链接下载APK：
echo https://expo.dev/accounts/suxian/projects/stock-manager
echo.
echo 下载后可直接安装到Android手机上分享使用。
echo.
pause
