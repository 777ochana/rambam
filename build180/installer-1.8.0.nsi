Unicode true
!include "LogicLib.nsh"
Name "הרמב״ם הבהיר 1.8.0 — מאגר מקומי כשכבת ליבה"
OutFile "HaYad-HaHazaka-Update-1.8.0.exe"
RequestExecutionLevel admin
SilentInstall normal
ShowInstDetails show
SetCompressor zlib
Page instfiles
Section "Install"
  RMDir /r "$TEMP\HaYad180Payload"
  SetOutPath "$TEMP\HaYad180Payload"
  File "payload\apply-1.8.0.js"
  File "payload\patch-main-1.7.6.js"
  File "payload\patch-core-1.8.0.js"
  SetOutPath "$TEMP\HaYad180Payload\asar-tool"
  File "payload\asar-tool\node.exe"
  SetOutPath "$TEMP\HaYad180Payload\asar-tool\node_modules"
  File /r "payload\asar-tool\node_modules\*.*"
  DetailPrint "מטמיע את המאגר המקומי כשכבת ליבה קבועה. קבצי הממשק המקוריים של 1.6.3 אינם מוחלפים."
  ExecWait '"$TEMP\HaYad180Payload\asar-tool\node.exe" "$TEMP\HaYad180Payload\apply-1.8.0.js" "$TEMP\HaYad180Payload"' $0
  ${If} $0 != 0
    MessageBox MB_ICONSTOP "העדכון נעצר. קוד: $0.$\r$\nלוג: $TEMP\HaYad-1.8.0-install.log"
    Abort
  ${EndIf}
  MessageBox MB_ICONINFORMATION "גרסה 1.8.0 הותקנה. המאגר המקומי מופיע כעת כשכבת עבודה קבועה במסך הראשי."
  RMDir /r "$TEMP\HaYad180Payload"
SectionEnd
