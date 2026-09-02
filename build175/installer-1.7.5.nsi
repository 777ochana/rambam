Unicode true
!include "LogicLib.nsh"
Name "הרמב״ם הבהיר 1.7.5 — ממשק 1.6.3 AS IS + מאגר LOCAL"
OutFile "HaYad-HaHazaka-Update-1.7.5.exe"
RequestExecutionLevel admin
SilentInstall normal
ShowInstDetails show
SetCompressor zlib
Page instfiles
Section "Install"
  RMDir /r "$TEMP\HaYad175Payload"
  SetOutPath "$TEMP\HaYad175Payload"
  File "payload\package.json"
  File "payload\apply-1.7.5.js"
  File "payload\patch-main-1.7.5.js"
  SetOutPath "$TEMP\HaYad175Payload\asar-tool"
  File "payload\asar-tool\node.exe"
  SetOutPath "$TEMP\HaYad175Payload\asar-tool\node_modules"
  File /r "payload\asar-tool\node_modules\*.*"
  SetOutPath "$TEMP\HaYad175Payload\tools"
  File "payload\tools\7z.exe"
  File "payload\tools\7z.dll"
  SetOutPath "$TEMP\HaYad175Payload\local-library"
  File "payload\local-library\sqlite3.exe"
  File "payload\local-library\library.zip"
  DetailPrint "מתקין מאגר מקומי בלבד. ממשק 1.6.3 נשמר AS IS. ללא PowerShell..."
  ExecWait '"$TEMP\HaYad175Payload\asar-tool\node.exe" "$TEMP\HaYad175Payload\apply-1.7.5.js" "$TEMP\HaYad175Payload"' $0
  ${If} $0 != 0
    MessageBox MB_ICONSTOP "העדכון נעצר ללא שינוי בעיצוב.$\r$\nקוד: $0$\r$\nלוג: $TEMP\HaYad-1.7.5-install.log"
    Abort
  ${EndIf}
  MessageBox MB_ICONINFORMATION "עדכון 1.7.5 הותקן בהצלחה.$\r$\nממשק 1.6.3 נשמר AS IS ונוסף המאגר המקומי."
  RMDir /r "$TEMP\HaYad175Payload"
SectionEnd
