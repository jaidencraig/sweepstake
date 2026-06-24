@echo off
echo [%DATE% %TIME%] Starting fetch >> "C:\sweepstake\fetch-log.txt" 2>&1
"C:\Program Files\nodejs\node.exe" "C:\sweepstake\fetch-data.js" >> "C:\sweepstake\fetch-log.txt" 2>&1
echo [%DATE% %TIME%] Exit code: %ERRORLEVEL% >> "C:\sweepstake\fetch-log.txt" 2>&1
