@echo off
setlocal enabledelayedexpansion

rem OneCode publish script (Windows)
rem 1) Build frontend (Vite)
rem 2) Copy dist -> backend wwwroot
rem 3) dotnet publish backend
rem 4) Publish Windows floating ball exe

set "ROOT=%~dp0"
pushd "%ROOT%" >nul

set "WEB_DIR=%ROOT%web"
set "WEB_DIST=%ROOT%web\dist"
set "BACKEND_WWWROOT=%ROOT%src\OneCode\wwwroot"
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
call dotnet publish "%ROOT%src\OneCode\OneCode.csproj" -c Release -r %RUNTIME% --self-contained true -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -o "%PUBLISH_DIR%"
if errorlevel 1 goto :error

echo [4/4] Publishing Windows floating ball...
set "WIN_BALL_DIR=%PUBLISH_DIR%\win-ball"
if exist "%WIN_BALL_DIR%" rmdir /s /q "%WIN_BALL_DIR%"
mkdir "%WIN_BALL_DIR%" >nul
call dotnet publish "%ROOT%src\OneCode.Win\OneCode.Win.csproj" -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:DebugType=None -p:DebugSymbols=false -o "%WIN_BALL_DIR%"
if errorlevel 1 goto :error
if not exist "%WIN_BALL_DIR%\OneCode.Win.exe" (
  echo WinForms publish did not produce "OneCode.Win.exe".
  goto :error
)
copy /y "%WIN_BALL_DIR%\OneCode.Win.exe" "%PUBLISH_DIR%\OneCode.Win.exe" >nul
rmdir /s /q "%WIN_BALL_DIR%"

echo.
echo Done.
echo Output: "%PUBLISH_DIR%"
echo Floating ball: "%PUBLISH_DIR%\OneCode.Win.exe"

popd >nul
endlocal
exit /b 0

:error
echo.
echo Publish failed.
popd >nul
endlocal
exit /b 1
