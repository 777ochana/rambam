Unicode true
!include "LogicLib.nsh"
Name "הרמב״ם הבהיר 1.10.0 — מאגר מקומי ועורך מאוחד"
OutFile "HaYad-HaHazaka-Update-1.10.0.exe"
RequestExecutionLevel admin
SilentInstall normal
ShowInstDetails show
SetCompressor zlib
Page instfiles
Section "Functional Core Update"
  RMDir /r "$TEMP\HaYad110Payload"
  SetOutPath "$TEMP\HaYad110Payload"
  File "payload\apply-1.10.0.cjs"
  File "payload\patch-main-1.7.6.cjs"
  File "payload\patch-core-1.8.1.cjs"
  File "payload\patch-visual-1.9.0.cjs"
  File "payload\patch-functional-1.10.0.cjs"
  File "payload\patch-api-1.10.0.cjs"
  File "payload\core-library-ui.js"
  File "payload\workspace-visual-1.9.0.js"
  SetOutPath "$TEMP\HaYad110Payload\asar-tool"
  File "payload\asar-tool\node.exe"
  SetOutPath "$TEMP\HaYad110Payload\asar-tool\node_modules"
  File /r "payload\asar-tool\node_modules\*.*"
  DetailPrint "דף הפתיחה נשאר AS IS. מתקין עורך מאוחד, מאגר מקומי, קטגוריות, צ'אט מבוסס מקורות ו-API אישי מוצפן."
  ExecWait '"$TEMP\HaYad110Payload\asar-tool\node.exe" "$TEMP\HaYad110Payload\apply-1.10.0.cjs" "$TEMP\HaYad110Payload"' $0
  ${If} $0 != 0
    nsExec::ExecToStack '"$SYSDIR\cmd.exe" /S /C type "$TEMP\HaYad-1.10.0-result.json"'
    Pop $1
    Pop $2
    MessageBox MB_ICONSTOP "העדכון נעצר. קוד: $0.$\r$\n$2$\r$\nלוג: $TEMP\HaYad-1.10.0-install.log"
    Abort
  ${EndIf}
  MessageBox MB_ICONINFORMATION "1.10.0 הותקנה בהצלחה. דף הפתיחה נשמר AS IS; המאגר המקומי והעורך המאוחד פעילים."
  RMDir /r "$TEMP\HaYad110Payload"
SectionEnd
