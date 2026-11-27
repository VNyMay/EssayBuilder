$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$repo = Split-Path -Parent $here
$build = Join-Path $here "build"
$app = Join-Path $build "app"
$version = (Get-Content (Join-Path $repo "studio\version.txt") -TotalCount 1).Trim()

function Find-Iscc {
    $found = Get-Command iscc -ErrorAction SilentlyContinue
    if ($found) { return $found.Source }
    foreach ($base in @((Join-Path $env:LOCALAPPDATA "Programs"), $env:ProgramFiles, ${env:ProgramFiles(x86)})) {
        $candidate = Join-Path $base "Inno Setup 6\ISCC.exe"
        if (Test-Path $candidate) { return $candidate }
    }
    return $null
}

$iscc = Find-Iscc
if (-not $iscc) {
    Write-Host "Installing Inno Setup (the tool that builds the installer)..."
    winget install -e --id JRSoftware.InnoSetup --silent --accept-package-agreements --accept-source-agreements | Out-Null
    $iscc = Find-Iscc
    if (-not $iscc) { throw "Inno Setup is missing. Install it from https://jrsoftware.org/isinfo.php and run this script again." }
}

if (Test-Path $build) { Remove-Item $build -Recurse -Force }
New-Item -ItemType Directory $app | Out-Null

Write-Host "Copying Essay Builder..."
$skip = @("node_modules", "__pycache__", "fonts", "cache", ".git", ".github", "installer", "dist", "docker", "Essays", "essays", "tests", "editor-src")
robocopy $repo $app /E /XD $skip /XF *.log *.pdf running.json recent.json launcher.json Dockerfile docker-compose.yml .dockerignore .gitignore .gitattributes build-docker.bat /NFL /NDL /NJH /NJS /NP | Out-Null
New-Item -ItemType Directory (Join-Path $app "engine\fonts") -Force | Out-Null

Write-Host "Bundling Python..."
$python = (python -c "import sys; print(sys.base_prefix)").Trim()
$target = Join-Path $app "python"
robocopy $python $target /E /XD site-packages Doc test tests idlelib __pycache__ include libs Scripts /NFL /NDL /NJH /NJS /NP | Out-Null
$site = Join-Path $target "Lib\site-packages"
New-Item -ItemType Directory $site -Force | Out-Null
$wanted = Join-Path $build "requirements.txt"
Get-Content (Join-Path $repo "engine\requirements.txt") | Where-Object { $_ -notmatch '^\s*pymupdf\s*$' } | Set-Content $wanted -Encoding ascii
python -m pip install --disable-pip-version-check --quiet --target $site -r $wanted
if ($LASTEXITCODE -ne 0) { throw "pip install failed" }
python -m pip install --disable-pip-version-check --quiet --no-deps --target $site pymupdf
if ($LASTEXITCODE -ne 0) { throw "pip install pymupdf failed" }

Write-Host "Making Essay Builder.exe..."
$tools = Join-Path $here "tools"
$rcedit = Join-Path $tools "node_modules\rcedit\bin\rcedit-x64.exe"
if (-not (Test-Path $rcedit)) {
    npm install --no-audit --no-fund --loglevel=error --prefix $tools rcedit@4 | Out-Null
    if (-not (Test-Path $rcedit)) { throw "rcedit could not be installed" }
}
$exe = Join-Path $target "Essay Builder.exe"
Copy-Item (Join-Path $target "pythonw.exe") $exe
& $rcedit $exe --set-icon (Join-Path $repo "studio\icon.ico") --set-version-string "FileDescription" "Essay Builder" --set-version-string "ProductName" "Essay Builder" --set-version-string "CompanyName" "VNyMay" --set-version-string "LegalCopyright" "Copyright (c) 2026 VNyMay" --set-version-string "InternalName" "Essay Builder" --set-version-string "OriginalFilename" "Essay Builder.exe" --set-file-version $version --set-product-version $version
if ($LASTEXITCODE -ne 0) { throw "rcedit failed" }

Write-Host "Bundling Node.js..."
$node = (Get-Command node).Source
New-Item -ItemType Directory (Join-Path $app "node") | Out-Null
Copy-Item $node (Join-Path $app "node\node.exe")

Write-Host "Installing the JavaScript libraries..."
npm ci --omit=dev --no-audit --no-fund --loglevel=error --prefix (Join-Path $app "engine")
if ($LASTEXITCODE -ne 0) { throw "npm ci failed" }
python (Join-Path $here "prune.py") (Join-Path $app "engine")
if ($LASTEXITCODE -ne 0) { throw "pruning failed" }

Set-Content -Path (Join-Path $app "installed.flag") -Value "installed" -Encoding ascii

Write-Host "Preparing the wizard pictures..."
python (Join-Path $here "make_wizard.py") $build

Write-Host "Building the installer..."
& $iscc "/DAppVersion=$version" (Join-Path $here "EssayBuilder.iss")
if ($LASTEXITCODE -ne 0) { throw "Inno Setup failed" }
Write-Host "Done: $(Join-Path $here 'dist\EssayBuilder-Setup.exe')"
