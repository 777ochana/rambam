Unicode true
!include "LogicLib.nsh"
Name "הרמב״ם הבהיר 1.8.2 — Repair Core Library"
OutFile "HaYad-HaHazaka-Repair-1.8.2.exe"
RequestExecutionLevel admin
SilentInstall normal
ShowInstDetails show
SetCompressor zlib
Page instfiles
Section "Repair"
  RMDir /r "$TEMP\HaYad182Payload"
  SetOutPath "$TEMP\HaYad182Payload"
  File "payload\apply-1.8.2.cjs"
  File "payload\patch-main-1.7.6.cjs"
  File "payload\patch-core-1.8.1.cjs"
  File "payload\core-library-ui.js"
  SetOutPath "$TEMP\HaYad182Payload\asar-tool"
  File "payload\asar-tool\node.exe"
  SetOutPath "$TEMP\HaYad182Payload\asar-tool\node_modules"
  File /r "payload\asar-tool\node_modules\*.*"
  DetailPrint "משחזר את בסיס 1.6.3 המאושר ומתקין את המאגר כשכבת Core, ללא שינוי בקבצי ה-UI."
  ExecWait '"$TEMP\HaYad182Payload\asar-tool\node.exe" "$TEMP\HaYad182Payload\apply-1.8.2.cjs" "$TEMP\HaYad182Payload"' $0
  ${If} $0 != 0
    nsExec::ExecToStack '"$SYSDIR\cmd.exe" /S /C type "$TEMP\HaYad-1.8.2-result.json"'
    Pop $1
    Pop $2
    MessageBox MB_ICONSTOP "התיקון נעצר. קוד: $0.$\r$\n$2$\r$\nלוג: $TEMP\HaYad-1.8.2-install.log"
    Abort
  ${EndIf}
  MessageBox MB_ICONINFORMATION "תיקון 1.8.2 הושלם. ממשק 1.6.3 נשמר והמאגר המקומי נטען כשכבת ליבה."
  RMDir /r "$TEMP\HaYad182Payload"
SectionEnd
