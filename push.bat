@echo off
REM ============================================================
REM  push.bat  -  commit + push to GitHub + deploy to Vercel
REM  Usage:  double-click, OR:  push.bat "your commit message"
REM  (Run the one-time steps in GITHUB_VERCEL_SETUP.md first.)
REM ============================================================
cd /d "%~dp0"

REM --- commit message: use the argument, else a timestamp ---
set "MSG=%~1"
if "%MSG%"=="" set "MSG=update %date% %time%"

echo.
echo === 1/3  Committing changes ===
git add -A
git commit -m "%MSG%"
if errorlevel 1 echo    (nothing new to commit - continuing)

echo.
echo === 2/3  Pushing to GitHub ===
git push
if errorlevel 1 (
  echo.
  echo [!] Push failed. If this is the FIRST push, run these once instead:
  echo     git branch -M main
  echo     git remote add origin https://github.com/YOUR-USER/YOUR-REPO.git
  echo     git push -u origin main
  echo.
  if not "%NOPAUSE%"=="1" pause
  exit /b 1
)

echo.
echo === 3/3  Deploying to Vercel (production) ===
call vercel --prod
if errorlevel 1 (
  echo [!] Vercel deploy failed - see the message above.
  if not "%NOPAUSE%"=="1" pause
  exit /b 1
)

echo.
echo === Done. GitHub updated and site redeployed. ===
if not "%NOPAUSE%"=="1" pause
