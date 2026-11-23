@echo off
rem Builds an essay inside Docker (nothing to install except Docker Desktop).
rem Drag your essay .txt onto this file, or run:  build-docker.bat "C:\path\My Essay.txt" [--check]
rem Keep the essay's images, data and code in the same folder as the essay and refer to them by relative path.
setlocal
if "%~1"=="" (
  echo Drag an essay .txt file onto build-docker.bat, or run:  build-docker.bat "C:\path\My Essay.txt"
  if not defined ESSAY_BUILDER_NO_PAUSE pause
  exit /b 1
)
where docker >nul 2>nul
if errorlevel 1 (
  echo Docker is not installed. Install Docker Desktop, or use build.bat instead.
  if not defined ESSAY_BUILDER_NO_PAUSE pause
  exit /b 1
)
docker info >nul 2>nul
if errorlevel 1 (
  echo Docker Desktop is not running. Start it, wait until it says "running", and try again.
  if not defined ESSAY_BUILDER_NO_PAUSE pause
  exit /b 1
)
docker image inspect essay-builder >nul 2>nul
if errorlevel 1 (
  echo First run: building the Essay Builder image. This takes a few minutes...
  docker build -t essay-builder "%~dp0."
  if errorlevel 1 (
    if not defined ESSAY_BUILDER_NO_PAUSE pause
    exit /b 1
  )
)
for %%I in ("%~f1") do (
  set "DIR=%%~dpI"
  set "NAME=%%~nxI"
)
set "DIR=%DIR:~0,-1%"
docker run --rm -v "%DIR%:/essay" -v essay-builder-fonts:/app/engine/fonts essay-builder "%NAME%" %2 %3 %4 %5
set CODE=%ERRORLEVEL%
if not defined ESSAY_BUILDER_NO_PAUSE pause
exit /b %CODE%
