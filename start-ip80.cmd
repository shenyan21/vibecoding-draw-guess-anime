@echo off
cd /d %~dp0
set NODE_ENV=production
set PORT=80
echo Starting Draw & Guess server on port 80...
call node_modules\.bin\tsx.cmd apps\server\src\server.ts
