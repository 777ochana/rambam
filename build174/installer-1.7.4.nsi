Unicode true
!include "LogicLib.nsh"
Name "הרמב״ם הבהיר 1.7.4 — מאגר מקומי, ממשק 1.6.3 AS IS"
OutFile "HaYad-HaHazaka-Update-1.7.4.exe"
RequestExecutionLevel admin
SilentInstall normal
ShowInstDetails show
SetCompressor zlib
Page instfiles
Section "Install"
  RMDir /r "$TEMP\HaYad174Payload"
  SetOutPath "$TEMP\HaYad174Payload"
  File "payload\patch-main-1.7.4.js"
  File "apply-1.7.4.ps1"
  SetOutPath "$TEMP\HaYad174Payload\asar-tool"
  File "payload\asar-tool\node.exe"
  SetOutPath "$TEMP\HaYad174Payload\asar-tool\node_modules"
  File /r "payload\asar-tool\node_modules\*.*"
  SetOutPath "$TEMP\HaYad174Payload\local-library"
  File "payload\local-library\sqlite3.exe"
  File "payload\local-library\library.zip"
  DetailPrint "מתקין מאגר מקומי בלבד. ממשק 1.6.3 נשמר AS IS..."
  ExecWait 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$TEMP\HaYad174Payload\apply-1.7.4.ps1" -Payload "$TEMP\HaYad174Payload"' $0
  ${If} $0 != 0
    MessageBox MB_ICONSTOP "העדכון נעצר. קוד: $0. לוג: %TEMP%\HaYad-1.7.4-install.log"
    Abort
  ${EndIf}
SectionEnd
