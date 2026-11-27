#define AppName "Essay Builder"
#ifndef AppVersion
#define AppVersion "1.2.0"
#endif

[Setup]
AppId={{B7E3A1D2-4C58-4F0B-9A7E-5D2C6F1E8A34}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher=VNyMay
AppPublisherURL=https://github.com/VNyMay/EssayBuilder
AppSupportURL=https://github.com/VNyMay/EssayBuilder/issues
AppCopyright=Copyright (c) 2026 VNyMay
VersionInfoCompany=VNyMay
VersionInfoDescription=Essay Builder Setup
VersionInfoProductName=Essay Builder
VersionInfoVersion={#AppVersion}
DefaultDirName={autopf}\{#AppName}
DisableProgramGroupPage=yes
DisableDirPage=auto
PrivilegesRequired=lowest
OutputDir=dist
OutputBaseFilename=EssayBuilder-Setup
SetupIconFile=..\studio\icon.ico
UninstallDisplayIcon={app}\studio\icon.ico
UninstallDisplayName={#AppName}
WizardStyle=modern
WizardImageFile=build\wizard-large.bmp
WizardSmallImageFile=build\wizard-small.bmp
LicenseFile=..\LICENSE
Compression=lzma2/max
SolidCompression=yes
ArchitecturesInstallIn64BitMode=x64compatible
ArchitecturesAllowed=x64compatible
CloseApplications=force
ShowLanguageDialog=no

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Shortcuts:"

[InstallDelete]
Type: files; Name: "{app}\studio\flow.js"
Type: filesandordirs; Name: "{app}\studio\tests"
Type: filesandordirs; Name: "{app}\studio\editor-src"
Type: filesandordirs; Name: "{app}\python\Lib\site-packages\onnxruntime"
Type: filesandordirs; Name: "{app}\python\Lib\site-packages\numpy"
Type: filesandordirs; Name: "{app}\python\Lib\site-packages\numpy.libs"
Type: filesandordirs; Name: "{app}\python\Lib\site-packages\networkx"
Type: filesandordirs; Name: "{app}\python\Lib\site-packages\pymupdf_layout"

[Files]
Source: "build\app\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[Icons]
Name: "{autoprograms}\{#AppName}"; Filename: "{app}\python\Essay Builder.exe"; Parameters: """{app}\Essay Builder.pyw"""; WorkingDir: "{app}"; IconFilename: "{app}\studio\icon.ico"; AppUserModelID: "VNyMay.EssayBuilder"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\python\Essay Builder.exe"; Parameters: """{app}\Essay Builder.pyw"""; WorkingDir: "{app}"; IconFilename: "{app}\studio\icon.ico"; AppUserModelID: "VNyMay.EssayBuilder"; Tasks: desktopicon

[Run]
Filename: "{app}\python\Essay Builder.exe"; Parameters: """{app}\Essay Builder.pyw"""; WorkingDir: "{app}"; Description: "Start {#AppName}"; Flags: postinstall nowait skipifsilent
Filename: "{app}\python\Essay Builder.exe"; Parameters: """{app}\Essay Builder.pyw"""; WorkingDir: "{app}"; Flags: nowait; Check: Relaunch

[UninstallDelete]
Type: filesandordirs; Name: "{app}\engine\fonts"
Type: filesandordirs; Name: "{app}\engine\cache"
Type: filesandordirs; Name: "{app}\__pycache__"
Type: filesandordirs; Name: "{app}\engine\__pycache__"
Type: filesandordirs; Name: "{app}\engine\lib\__pycache__"
Type: filesandordirs; Name: "{app}\engine\lib\kits\__pycache__"
Type: filesandordirs; Name: "{app}\studio\__pycache__"

[Code]
function HasBrowser(): Boolean;
var
  Roots: array of String;
  I: Integer;
begin
  Result := False;
  SetArrayLength(Roots, 3);
  Roots[0] := ExpandConstant('{commonpf}');
  Roots[1] := ExpandConstant('{commonpf32}');
  Roots[2] := ExpandConstant('{localappdata}');
  for I := 0 to 2 do
    if FileExists(Roots[I] + '\Google\Chrome\Application\chrome.exe') or
       FileExists(Roots[I] + '\Microsoft\Edge\Application\msedge.exe') then
    begin
      Result := True;
      Exit;
    end;
end;

function InitializeSetup(): Boolean;
begin
  Result := True;
  if not HasBrowser() then
    MsgBox('Essay Builder needs Google Chrome or Microsoft Edge. Install one of them after this setup and Essay Builder will find it.', mbInformation, MB_OK);
end;

function Relaunch(): Boolean;
begin
  Result := ExpandConstant('{param:RELAUNCH|0}') = '1';
end;
