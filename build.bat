@echo off
rem Builds an essay. Drag your essay .txt onto this file, or run:  build.bat "C:\path\My Essay.txt" [--check]
rem The first run installs anything that is missing (Python packages, KaTeX, Mermaid) automatically,
rem and any font the essay asks for (font: Lora) is downloaded the first time it is used.
where python >nul 2>nul
if errorlevel 1 (
  echo Python 3.10 or newer is required: https://www.python.org/downloads/
  if not defined ESSAY_BUILDER_NO_PAUSE pause
  exit /b 1
)
if "%~1"=="" (
  echo Drag an essay .txt file onto build.bat, or run:  build.bat "C:\path\My Essay.txt"
  if not defined ESSAY_BUILDER_NO_PAUSE pause
  exit /b 1
)
python "%~dp0engine\build.py" %*
set CODE=%ERRORLEVEL%
if not defined ESSAY_BUILDER_NO_PAUSE pause
exit /b %CODE%
