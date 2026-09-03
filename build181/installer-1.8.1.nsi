Unicode true
!include "LogicLib.nsh"
Name "הרמב״ם הבהיר 1.8.1 — Core Library תיקון התקנה"
OutFile "HaYad-HaHazaka-Update-1.8.1.exe"
RequestExecutionLevel admin
SilentInstall normal
ShowInstDetails show
SetCompressor zlib
Page instfiles
Section "Install"
  RMDir /r "$TEMP\HaYad181Payload"
  SetOutPath "$TEMP\HaYad181Payload"
  File "payload\apply-1.8.1.js"
  File "payload\patch-main-1.7.6.js"
  File "payload\patch-core-1.8.0.js"
  SetOutPath "$TEMP\HaYad181Payload\asar-tool"
  File "payload\asar-tool\node.exe"
  SetOutPath "$TEMP\HaYad181Payload\asar-tool\node_modules"
  File /r "payload\asar-tool\node_modules\*.*"
  DetailPrint "מתקין שכבת מאגר ליבה מעל 1.7.6 הקיימת, ללא שינוי בקבצי ה-UI של 1.6.3."
  ExecWait '"$TEMP\HaYad181Payload\asar-tool\node.exe" "$TEMP\HaYad181Payload\apply-1.8.1.js" "$TEMP\HaYad181Payload"' $0
  ${If} $0 != 0
    nsExec::ExecToStack '"$SYSDIR\cmd.exe" /S /C type "$TEMP\HaYad-1.8.1-result.json"'
    Pop $1
    Pop $2
    MessageBox MB_ICONSTOP "העדכון נעצר. קוד: $0.$\r$\n$2$\r$\nלוג מלא: $TEMP\HaYad-1.8.1-install.log"
    Abort
  ${EndIf}
  MessageBox MB_ICONINFORMATION "עדכון 1.8.1 הושלם. המאגר המקומי משולב כשכבת Core Library."
  RMDir /r "$TEMP\HaYad181Payload"
SectionEnd
