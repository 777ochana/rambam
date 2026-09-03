Unicode true
!include "LogicLib.nsh"
Name "הרמב״ם הבהיר 1.9.1 — הפעלת המאגר והעיצוב בפועל"
OutFile "HaYad-HaHazaka-Update-1.9.1.exe"
RequestExecutionLevel admin
SilentInstall normal
ShowInstDetails show
SetCompressor zlib
Page instfiles
Section "Activate Core Library + Workspace Visual"
  RMDir /r "$TEMP\HaYad191Payload"
  SetOutPath "$TEMP\HaYad191Payload"
  File "payload\apply-1.9.1.cjs"
  File "payload\patch-main-1.7.6.cjs"
  File "payload\patch-core-1.8.1.cjs"
  File "payload\patch-visual-1.9.0.cjs"
  File "payload\core-library-ui.js"
  File "payload\workspace-visual-1.9.0.js"
  SetOutPath "$TEMP\HaYad191Payload\asar-tool"
  File "payload\asar-tool\node.exe"
  SetOutPath "$TEMP\HaYad191Payload\asar-tool\node_modules"
  File /r "payload\asar-tool\node_modules\*.*"
  DetailPrint "מפעיל בפועל את app.asar המתוקן. דף הפתיחה עם 14 הספרים נשאר ללא שינוי."
  ExecWait '"$TEMP\HaYad191Payload\asar-tool\node.exe" "$TEMP\HaYad191Payload\apply-1.9.1.cjs" "$TEMP\HaYad191Payload"' $0
  ${If} $0 != 0
    nsExec::ExecToStack '"$SYSDIR\cmd.exe" /S /C type "$TEMP\HaYad-1.9.1-result.json"'
    Pop $1
    Pop $2
    MessageBox MB_ICONSTOP "העדכון נעצר. קוד: $0.$\r$\n$2$\r$\nלוג: $TEMP\HaYad-1.9.1-install.log"
    Abort
  ${EndIf}
  MessageBox MB_ICONINFORMATION "עדכון 1.9.1 הושלם. המאגר המקומי ושכבת העיצוב הופעלו מתוך app.asar הפעיל; דף 14 הספרים נשמר ללא שינוי."
  RMDir /r "$TEMP\HaYad191Payload"
SectionEnd
