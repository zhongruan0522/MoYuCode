@echo off
setlocal enabledelayedexpansion

rem MoYuCode publish script (Windows)
rem 1) Build frontend (Vite)
rem 2) Copy dist -> backend wwwroot
rem 3) dotnet publish backend

set "ROOT=%~dp0"
pushd "%ROOT%" >nul

set "WEB_DIR=%ROOT%web"
set "WEB_DIST=%ROOT%web\dist"
set "BACKEND_WWWROOT=%ROOT%src\MoYuCode\wwwroot"
set "PUBLISH_DIR=%ROOT%artifacts\publish"
set "RUNTIME=win-x64"
set "DOTNET=dotnet"
set "LOCAL_DOTNET_DIR=%ROOT%.dotnet"
set "DOTNET_INSTALL_SCRIPT=%ROOT%.tmpbuild\dotnet-install.ps1"
set "DOTNET_SDK_VERSION=10.0.102"

if not "%~1"=="" (
  set "RUNTIME=%~1"
)

echo [1/3] Building frontend...
pushd "%WEB_DIR%" >nul
where bun >nul 2>&1
if %ERRORLEVEL%==0 (
  echo Using bun...
  call bun i
  if errorlevel 1 goto :error
  call bun run build
  if errorlevel 1 goto :error
) else (
  echo bun not found, falling back to npm...
  call npm ci
  if errorlevel 1 goto :error
  call npm run build
  if errorlevel 1 goto :error
)
popd >nul

if not exist "%WEB_DIST%\index.html" (
  echo Frontend build did not produce "%WEB_DIST%\index.html".
  goto :error
)

echo [2/3] Syncing frontend into backend wwwroot...
if not exist "%BACKEND_WWWROOT%" mkdir "%BACKEND_WWWROOT%" >nul 2>&1
robocopy "%WEB_DIST%" "%BACKEND_WWWROOT%" /MIR /NFL /NDL /NP /R:2 /W:1
set "ROBO=%ERRORLEVEL%"
if %ROBO% GEQ 8 goto :error

echo [pre] Ensuring .NET SDK %DOTNET_SDK_VERSION%...
set "HAS_NET10_SDK="
for /f "usebackq delims=" %%S in (`dotnet --list-sdks 2^>nul`) do (
  echo %%S | findstr /b "10.0." >nul 2>&1 && set "HAS_NET10_SDK=1"
)
if not defined HAS_NET10_SDK (
  set "DOTNET=%LOCAL_DOTNET_DIR%\dotnet.exe"
  if not exist "!DOTNET!" (
    echo Installing .NET SDK %DOTNET_SDK_VERSION% locally into "%LOCAL_DOTNET_DIR%"...
    if not exist "%ROOT%.tmpbuild" mkdir "%ROOT%.tmpbuild" >nul 2>&1
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -UseBasicParsing -Uri 'https://dot.net/v1/dotnet-install.ps1' -OutFile '%DOTNET_INSTALL_SCRIPT%'; & '%DOTNET_INSTALL_SCRIPT%' -Version '%DOTNET_SDK_VERSION%' -InstallDir '%LOCAL_DOTNET_DIR%' -NoPath"
    if errorlevel 1 goto :error
    if not exist "!DOTNET!" (
      echo Local dotnet install did not produce "!DOTNET!".
      goto :error
    )
  )
)

echo [3/3] Publishing backend...
if exist "%PUBLISH_DIR%" rmdir /s /q "%PUBLISH_DIR%"
mkdir "%PUBLISH_DIR%" >nul
call "%DOTNET%" publish "%ROOT%src\MoYuCode\MoYuCode.csproj" -c Release -r %RUNTIME% --self-contained true -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -o "%PUBLISH_DIR%"
if errorlevel 1 goto :error

echo.
echo Done.
echo Output: "%PUBLISH_DIR%"

popd >nul
endlocal
exit /b 0

:error
echo.
echo Publish failed.
popd >nul
endlocal
exit /b 1
