Unicode true
!include "LogicLib.nsh"
Name "הרמב״ם הבהיר 1.7.4 — מאגר LOCAL, ממשק 1.6.3 AS IS"
OutFile "HaYad-HaHazaka-Local-Library-1.7.4.exe"
RequestExecutionLevel admin
SilentInstall normal
ShowInstDetails show
SetCompressor zlib
Page instfiles
Section "Install"
  RMDir /r "$TEMP\HaYad174"
  SetOutPath "$TEMP\HaYad174\app"
  File /r "payload\app\*.*"
  SetOutPath "$TEMP\HaYad174\local-library"
  File /r "payload\local-library\*.*"
  SetOutPath "$TEMP\HaYad174"
  File "apply-patch.ps1"
  DetailPrint "מטמיע מאגר מקומי בלי לשנות את ממשק 1.6.3..."
  ExecWait 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$TEMP\HaYad174\apply-patch.ps1" -Payload "$TEMP\HaYad174"' $0
  ${If} $0 != 0
    MessageBox MB_ICONSTOP "העדכון נעצר. התוכנה הוחזרה אוטומטית לממשק 1.6.3 המקורי."
    Abort
  ${EndIf}
SectionEnd
