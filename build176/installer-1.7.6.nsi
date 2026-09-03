Unicode true
!include "LogicLib.nsh"
Name "הרמב״ם הבהיר 1.7.6 — תיקון מאגר LOCAL, ממשק 1.6.3 AS IS"
OutFile "HaYad-HaHazaka-Update-1.7.6.exe"
RequestExecutionLevel admin
SilentInstall normal
ShowInstDetails show
SetCompressor zlib
Page instfiles
Section "Install"
  RMDir /r "$TEMP\HaYad176Payload"
  SetOutPath "$TEMP\HaYad176Payload"
  File "payload\apply-1.7.6.js"
  File "payload\patch-main-1.7.6.js"
  SetOutPath "$TEMP\HaYad176Payload\asar-tool"
  File "payload\asar-tool\node.exe"
  SetOutPath "$TEMP\HaYad176Payload\asar-tool\node_modules"
  File /r "payload\asar-tool\node_modules\*.*"
  DetailPrint "מתקן את חיבור המאגר המקומי בלבד. קבצי UI של 1.6.3 נשארים זהים."
  ExecWait '"$TEMP\HaYad176Payload\asar-tool\node.exe" "$TEMP\HaYad176Payload\apply-1.7.6.js" "$TEMP\HaYad176Payload"' $0
  ${If} $0 != 0
    MessageBox MB_ICONSTOP "העדכון נעצר. קוד: $0.$\r$\nלוג: $TEMP\HaYad-1.7.6-install.log"
    Abort
  ${EndIf}
  MessageBox MB_ICONINFORMATION "עדכון 1.7.6 הושלם. המאגר המקומי מחובר כעת למסך המקורי של 1.6.3."
  RMDir /r "$TEMP\HaYad176Payload"
SectionEnd
