# Windows installer

`build-installer.ps1` makes `dist\EssayBuilder-Setup.exe`, a normal setup wizard:

- installs for the current user only (no administrator prompt) into `%LOCALAPPDATA%\Programs\Essay Builder`
- carries its own Python, Node.js and libraries, so the person installing needs nothing else except Chrome or Edge
- adds a Start menu entry, an optional desktop shortcut and an entry in Settings, Apps (with an uninstaller)
- keeps essays in `Documents\Essay Builder` and settings in `%LOCALAPPDATA%\Essay Builder`; uninstalling never touches essays

## Build it

You need Windows, Python 3.10+, Node.js 18+ and an internet connection.

```
powershell -ExecutionPolicy Bypass -File installer\build-installer.ps1
```

The script installs [Inno Setup](https://jrsoftware.org/isinfo.php) with winget if it is missing. The result is `installer\dist\EssayBuilder-Setup.exe`.

To publish it, attach the file to a GitHub release.
