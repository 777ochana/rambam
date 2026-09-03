Unicode true
!include "LogicLib.nsh"
Name "הרמב״ם הבהיר 1.9.0 — עיצוב סביבת העבודה"
OutFile "HaYad-HaHazaka-Update-1.9.0.exe"
RequestExecutionLevel admin
SilentInstall normal
ShowInstDetails show
SetCompressor zlib
Page instfiles
Section "Workspace Visual Update"
  RMDir /r "$TEMP\HaYad190Payload"
  SetOutPath "$TEMP\HaYad190Payload"
  File "payload\apply-1.9.0.cjs"
  File "payload\patch-main-1.7.6.cjs"
  File "payload\patch-core-1.8.1.cjs"
  File "payload\patch-visual-1.9.0.cjs"
  File "payload\core-library-ui.js"
  File "payload\workspace-visual-1.9.0.js"
  SetOutPath "$TEMP\HaYad190Payload\asar-tool"
  File "payload\asar-tool\node.exe"
  SetOutPath "$TEMP\HaYad190Payload\asar-tool\node_modules"
  File /r "payload\asar-tool\node_modules\*.*"
  DetailPrint "דף הפתיחה עם 14 הספרים נשאר AS IS. מעדכן עיצוב חזותי רק בסביבת העבודה ומבליט את המאגר המקומי."
  ExecWait '"$TEMP\HaYad190Payload\asar-tool\node.exe" "$TEMP\HaYad190Payload\apply-1.9.0.cjs" "$TEMP\HaYad190Payload"' $0
  ${If} $0 != 0
    nsExec::ExecToStack '"$SYSDIR\cmd.exe" /S /C type "$TEMP\HaYad-1.9.0-result.json"'
    Pop $1
    Pop $2
    MessageBox MB_ICONSTOP "העדכון נעצר. קוד: $0.$\r$\n$2$\r$\nלוג: $TEMP\HaYad-1.9.0-install.log"
    Abort
  ${EndIf}
  MessageBox MB_ICONINFORMATION "עדכון 1.9.0 הושלם. דף הפתיחה נשמר AS IS; סביבת העבודה עודכנה ויזואלית והמאגר המקומי הודגש כשכבת ליבה."
  RMDir /r "$TEMP\HaYad190Payload"
SectionEnd