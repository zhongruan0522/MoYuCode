@echo off
setlocal enabledelayedexpansion

rem OneCode publish script (Windows)
rem 1) Build frontend (Vite)
rem 2) Copy dist -> backend wwwroot
rem 3) dotnet publish backend
rem 4) Emit a runnable OneCode.bat into publish output

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

echo [1/5] Building frontend...
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

echo [2/5] Syncing frontend into backend wwwroot...
if not exist "%BACKEND_WWWROOT%" mkdir "%BACKEND_WWWROOT%" >nul 2>&1
robocopy "%WEB_DIST%" "%BACKEND_WWWROOT%" /MIR /NFL /NDL /NP /R:2 /W:1
set "ROBO=%ERRORLEVEL%"
if %ROBO% GEQ 8 goto :error

echo [3/5] Publishing backend...
if exist "%PUBLISH_DIR%" rmdir /s /q "%PUBLISH_DIR%"
mkdir "%PUBLISH_DIR%" >nul
call dotnet publish "%ROOT%src\OneCode\OneCode.csproj" -c Release -r %RUNTIME% --self-contained true -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -o "%PUBLISH_DIR%"
if errorlevel 1 goto :error

echo [4/5] Writing launcher bat...
set "RUN_BAT=%PUBLISH_DIR%\OneCode.bat"
(
  echo @echo off
  echo setlocal
  echo cd /d "%%~dp0"
  echo set "DOTNET_ENVIRONMENT=Production"
  echo set "ASPNETCORE_URLS=http://0.0.0.0:9110"
  echo echo OneCode is running at %%ASPNETCORE_URLS%%
  echo echo Open: http://localhost:9110
  echo if exist "OneCode.exe" ^(
  echo   "OneCode.exe"
  echo ^) else ^(
  echo   dotnet "OneCode.dll"
  echo ^)
  echo endlocal
) > "%RUN_BAT%"

echo [5/5] Writing Windows service installer...
set "SERVICE_BAT=%PUBLISH_DIR%\install-service.bat"
(
  echo @echo off
  echo setlocal enableextensions
  echo set "SERVICE_NAME=%%SERVICE_NAME%%"
  echo if "%%SERVICE_NAME%%"=="" set "SERVICE_NAME=OneCode"
  echo set "DISPLAY_NAME=%%DISPLAY_NAME%%"
  echo if "%%DISPLAY_NAME%%"=="" set "DISPLAY_NAME=OneCode"
  echo set "DESCRIPTION=%%DESCRIPTION%%"
  echo if "%%DESCRIPTION%%"=="" set "DESCRIPTION=OneCode service"
  echo set "URLS=%%URLS%%"
  echo if "%%URLS%%"=="" set "URLS=http://0.0.0.0:9110"
  echo.
  echo net session ^>nul 2^>^&1
  echo if not "%%errorlevel%%"=="0" ^(
  echo   echo Run this script as Administrator.
  echo   exit /b 1
  echo ^)
  echo.
  echo set "INSTALL_DIR=%%~dp0"
  echo set "EXE_PATH=%%INSTALL_DIR%%OneCode.exe"
  echo if exist "%%EXE_PATH%%" ^(
  echo   set "BIN_PATH=\"%%EXE_PATH%%\" --urls \"%%URLS%%\""
  echo ^) else ^(
  echo   set "DLL_PATH=%%INSTALL_DIR%%OneCode.dll"
  echo   if not exist "%%DLL_PATH%%" ^(
  echo     echo OneCode executable not found in %%INSTALL_DIR%%
  echo     exit /b 1
  echo   ^)
  echo   set "BIN_PATH=\"dotnet\" \"%%DLL_PATH%%\" --urls \"%%URLS%%\""
  echo ^)
  echo.
  echo sc query "%%SERVICE_NAME%%" ^>nul 2^>^&1
  echo if "%%errorlevel%%"=="1060" ^(
  echo   sc create "%%SERVICE_NAME%%" binPath^= "%%BIN_PATH%%" start^= auto DisplayName^= "%%DISPLAY_NAME%%" ^>nul
  echo ^) else ^(
  echo   sc config "%%SERVICE_NAME%%" binPath^= "%%BIN_PATH%%" start^= auto ^>nul
  echo ^)
  echo.
  echo sc description "%%SERVICE_NAME%%" "%%DESCRIPTION%%" ^>nul
  echo sc start "%%SERVICE_NAME%%" ^>nul
  echo sc query "%%SERVICE_NAME%%"
  echo echo URL: %%URLS%%
  echo echo Open: http://localhost:9110
  echo endlocal
) > "%SERVICE_BAT%"

echo.
echo Done.
echo Output: "%PUBLISH_DIR%"
echo Start:  "%RUN_BAT%"
echo Service install: "%SERVICE_BAT%"

popd >nul
endlocal
exit /b 0

:error
echo.
echo Publish failed.
popd >nul
endlocal
exit /b 1
