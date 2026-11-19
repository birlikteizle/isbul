@echo off
cd /d D:\Projeler\IsBul\server
if not exist .data mkdir .data
"C:\Program Files\nodejs\node.exe" --experimental-sqlite dist\index.js >> .data\server.log 2>&1