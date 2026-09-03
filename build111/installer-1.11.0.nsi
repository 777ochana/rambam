Unicode true
!include "LogicLib.nsh"
Name "הרמב״ם הבהיר 1.11.0 — סביבת עבודה מלאה"
OutFile "HaYad-HaHazaka-Update-1.11.0.exe"
RequestExecutionLevel admin
SilentInstall normal
ShowInstDetails show
SetCompressor zlib
Page instfiles
Section "Workspace 1.11"
  RMDir /r "$TEMP\HaYad111Payload"
  SetOutPath "$TEMP\HaYad111Payload"
  File "payload\apply-1.11.0.cjs"
  File "payload\core-library-ui.js"
  File "payload\workspace-visual-1.9.0.js"
  SetOutPath "$TEMP\HaYad111Payload\asar-tool"
  File "payload\asar-tool\node.exe"
  SetOutPath "$TEMP\HaYad111Payload\asar-tool\node_modules"
  File /r "payload\asar-tool\node_modules\*.*"
  DetailPrint "דף הפתיחה נשאר ללא שינוי. מתקין את סביבת העבודה החדשה לפי העיצוב המאושר."
  ExecWait '"$TEMP\HaYad111Payload\asar-tool\node.exe" "$TEMP\HaYad111Payload\apply-1.11.0.cjs" "$TEMP\HaYad111Payload"' $0
  ${If} $0 != 0
    nsExec::ExecToStack '"$SYSDIR\cmd.exe" /S /C type "$TEMP\HaYad-1.11.0-result.json"'
    Pop $1
    Pop $2
    MessageBox MB_ICONSTOP "העדכון נעצר. קוד: $0.$\r$\n$2$\r$\nלוג: $TEMP\HaYad-1.11.0-install.log"
    Abort
  ${EndIf}
  MessageBox MB_ICONINFORMATION "1.11.0 הותקנה בהצלחה. דף הפתיחה נשאר ללא שינוי; סביבת העבודה החדשה והמאגר המקומי פעילים."
  RMDir /r "$TEMP\HaYad111Payload"
SectionEnd
