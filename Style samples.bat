@echo off
rem Drag your essay .txt onto this file. It makes a PDF with the first page of YOUR essay in four different looks
rem (A classic, B modern, C document, D large print), so you can see which one you like and tell the AI.
where python >nul 2>nul
if errorlevel 1 (
  echo Python 3.10 or newer is required: https://www.python.org/downloads/
  if not defined ESSAY_BUILDER_NO_PAUSE pause
  exit /b 1
)
if "%~1"=="" (
  echo Drag your essay .txt onto "Style samples.bat".
  if not defined ESSAY_BUILDER_NO_PAUSE pause
  exit /b 1
)
python "%~dp0engine\build.py" "%~1" --samples
if not defined ESSAY_BUILDER_NO_PAUSE pause
