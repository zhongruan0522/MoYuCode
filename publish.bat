@echo off
setlocal enabledelayedexpansion

rem MyYuCode publish script (Windows)
rem 1) Build frontend (Vite)
rem 2) Copy dist -> backend wwwroot
rem 3) dotnet publish backend
rem 4) Publish Windows tray exe

set "ROOT=%~dp0"
pushd "%ROOT%" >nul

set "WEB_DIR=%ROOT%web"
set "WEB_DIST=%ROOT%web\dist"
set "BACKEND_WWWROOT=%ROOT%src\MyYuCode\wwwroot"
set "PUBLISH_DIR=%ROOT%artifacts\publish"
set "RUNTIME=win-x64"

if not "%~1"=="" (
  set "RUNTIME=%~1"
)

echo [1/4] Building frontend...
pushd "%WEB_DIR%" >nul
call bun i
if errorlevel 1 goto :error
call bun run build
if errorlevel 1 goto :error
popd >nul

if not exist "%WEB_DIST%\index.html" (
  echo Frontend build did not produce "%WEB_DIST%\index.html".
  goto :error
)

echo [2/4] Syncing frontend into backend wwwroot...
if not exist "%BACKEND_WWWROOT%" mkdir "%BACKEND_WWWROOT%" >nul 2>&1
robocopy "%WEB_DIST%" "%BACKEND_WWWROOT%" /MIR /NFL /NDL /NP /R:2 /W:1
set "ROBO=%ERRORLEVEL%"
if %ROBO% GEQ 8 goto :error

echo [3/4] Publishing backend...
if exist "%PUBLISH_DIR%" rmdir /s /q "%PUBLISH_DIR%"
mkdir "%PUBLISH_DIR%" >nul
call dotnet publish "%ROOT%src\MyYuCode\MyYuCode.csproj" -c Release -r %RUNTIME% --self-contained true -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -o "%PUBLISH_DIR%"
if errorlevel 1 goto :error

echo [4/4] Publishing Windows tray...
set "WIN_TRAY_DIR=%PUBLISH_DIR%\win-tray"
if exist "%WIN_TRAY_DIR%" rmdir /s /q "%WIN_TRAY_DIR%"
mkdir "%WIN_TRAY_DIR%" >nul
call dotnet publish "%ROOT%src\MyYuCode.Win\MyYuCode.Win.csproj" -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:DebugType=None -p:DebugSymbols=false -o "%WIN_TRAY_DIR%"
if errorlevel 1 goto :error
if not exist "%WIN_TRAY_DIR%\MyYuCode.Win.exe" (
  echo WinForms publish did not produce "MyYuCode.Win.exe".
  goto :error
)
copy /y "%WIN_TRAY_DIR%\MyYuCode.Win.exe" "%PUBLISH_DIR%\MyYuCode.Win.exe" >nul
rmdir /s /q "%WIN_TRAY_DIR%"

echo.
echo Done.
echo Output: "%PUBLISH_DIR%"
echo Tray app: "%PUBLISH_DIR%\MyYuCode.Win.exe"

popd >nul
endlocal
exit /b 0

:error
echo.
echo Publish failed.
popd >nul
endlocal
exit /b 1
