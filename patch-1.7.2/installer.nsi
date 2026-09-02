Unicode true
Name "הי״ד החזקה 1.7.2 — שחזור ממשק + מאגר מקומי"
OutFile "HaYad-HaHazaka-Patch-1.7.2.exe"
RequestExecutionLevel admin
SilentInstall normal
ShowInstDetails show
SetCompressor /SOLID lzma

Page instfiles

Section "Install"
  SetOutPath "$TEMP\HaYad172Patch\app"
  File /r "payload\app\*.*"
  SetOutPath "$TEMP\HaYad172Patch\local-library"
  File /r "payload\local-library\*.*"
  SetOutPath "$TEMP\HaYad172Patch"
  File "apply-patch.ps1"
  DetailPrint "מעדכן את הי״ד החזקה 1.6.3 בלי לשנות את הממשק..."
  ExecWait 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$TEMP\HaYad172Patch\apply-patch.ps1" -Payload "$TEMP\HaYad172Patch"' $0
  ${If} $0 != 0
    MessageBox MB_ICONSTOP "העדכון נעצר. קוד שגיאה: $0"
    Abort
  ${EndIf}
SectionEnd
