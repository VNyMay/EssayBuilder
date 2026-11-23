@echo off
rem Drag your images, tables and code files (or the folder that holds them) onto this file.
rem It lists their full paths and copies the list to the clipboard: paste it into the AI chat.
where python >nul 2>nul
if errorlevel 1 (
  echo Python 3.10 or newer is required: https://www.python.org/downloads/
  if not defined ESSAY_BUILDER_NO_PAUSE pause
  exit /b 1
)
if "%~1"=="" (
  echo Drag your images / data / code files, or the folder that holds them, onto "List my files.bat".
  echo Or type the path of ONE folder here and press Enter.
  set /p FOLDER=Folder:
  if not defined FOLDER exit /b 1
  python "%~dp0engine\collect.py" "%FOLDER%"
) else (
  python "%~dp0engine\collect.py" %*
)
if not defined ESSAY_BUILDER_NO_PAUSE pause
