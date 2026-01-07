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
set "SERVICE_PS1=%PUBLISH_DIR%\install-service.ps1"
(
  echo param^(
  echo   [string]$ServiceName = "OneCode",
  echo   [string]$DisplayName = "OneCode",
  echo   [string]$Description = "OneCode service",
  echo   [string]$Urls = "http://0.0.0.0:9110"
  echo ^)
  echo $installDir = Split-Path -Parent $MyInvocation.MyCommand.Path
  echo $exePath = Join-Path $installDir "OneCode.exe"
  echo if ^(-not ^(Test-Path $exePath^)^) ^{
  echo   $exePath = Join-Path $installDir "OneCode.dll"
  echo   if ^(-not ^(Test-Path $exePath^)^) ^{
  echo     Write-Error "OneCode executable not found in $installDir"
  echo     exit 1
  echo   ^}
  echo   $binaryPath = "dotnet `"$exePath`" --urls `"$Urls`""
  echo ^} else ^{
  echo   $binaryPath = "`"$exePath`" --urls `"$Urls`""
  echo ^}
  echo $principal = New-Object Security.Principal.WindowsPrincipal^([Security.Principal.WindowsIdentity]::GetCurrent^()^)
  echo if ^(-not $principal.IsInRole^([Security.Principal.WindowsBuiltInRole]::Administrator^)^) ^{
  echo   Write-Error "Run this script as Administrator."
  echo   exit 1
  echo ^}
  echo $service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
  echo if ^($null -eq $service^) ^{
  echo   New-Service -Name $ServiceName -DisplayName $DisplayName -BinaryPathName $binaryPath -Description $Description -StartupType Automatic ^| Out-Null
  echo ^} else ^{
  echo   sc.exe config $ServiceName binPath= "$binaryPath" start= auto ^| Out-Null
  echo ^}
  echo Start-Service -Name $ServiceName
  echo $service = Get-Service -Name $ServiceName
  echo Write-Host "Service status: $service.Status"
  echo Write-Host "URL: $Urls"
  echo Write-Host "Open: http://localhost:9110"
) > "%SERVICE_PS1%"

echo.
echo Done.
echo Output: "%PUBLISH_DIR%"
echo Start:  "%RUN_BAT%"
echo Service install: "%SERVICE_PS1%"

popd >nul
endlocal
exit /b 0

:error
echo.
echo Publish failed.
popd >nul
endlocal
exit /b 1
