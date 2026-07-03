@echo off
title Servidor FinanceAI
echo Iniciando o servidor FinanceAI...
node server.js
if %errorlevel% neq 0 (
    echo.
    echo Ocorreu um erro ao iniciar o servidor. Certifique-se de que o Node.js esta instalado!
    pause
)
