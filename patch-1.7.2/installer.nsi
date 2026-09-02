Unicode true
!include "LogicLib.nsh"
Name "הי״ד החזקה 1.7.3 — ממשק 1.6.3 + מאגר LOCAL"
OutFile "HaYad-HaHazaka-Patch-1.7.3.exe"
RequestExecutionLevel admin
SilentInstall normal
ShowInstDetails show
SetCompressor zlib

Page instfiles

Section "Install"
  RMDir /r "$TEMP\HaYad173Patch"
  SetOutPath "$TEMP\HaYad173Patch\app"
  File /r "payload\app\*.*"
  SetOutPath "$TEMP\HaYad173Patch\local-library"
  File /r "payload\local-library\*.*"
  SetOutPath "$TEMP\HaYad173Patch"
  File "apply-patch.ps1"
  DetailPrint "מעדכן את הי״ד החזקה 1.6.3 בלי לשנות את הממשק..."
  ExecWait 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$TEMP\HaYad173Patch\apply-patch.ps1" -Payload "$TEMP\HaYad173Patch"' $0
  ${If} $0 != 0
    MessageBox MB_ICONSTOP "העדכון נעצר. קוד שגיאה: $0. לוג: %TEMP%\HaYad-1.7.3-install.log"
    Abort
  ${EndIf}
SectionEnd
