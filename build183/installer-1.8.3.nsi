Unicode true
!include "LogicLib.nsh"
Name "הרמב״ם הבהיר 1.8.3 — Repair Core Library v2"
OutFile "HaYad-HaHazaka-Repair-1.8.3.exe"
RequestExecutionLevel admin
SilentInstall normal
ShowInstDetails show
SetCompressor zlib
Page instfiles
Section "Repair"
  RMDir /r "$TEMP\HaYad183Payload"
  SetOutPath "$TEMP\HaYad183Payload"
  File "payload\apply-1.8.3.cjs"
  File "payload\patch-main-1.7.6.cjs"
  File "payload\patch-core-1.8.1.cjs"
  File "payload\core-library-ui.js"
  SetOutPath "$TEMP\HaYad183Payload\asar-tool"
  File "payload\asar-tool\node.exe"
  SetOutPath "$TEMP\HaYad183Payload\asar-tool\node_modules"
  File /r "payload\asar-tool\node_modules\*.*"
  DetailPrint "Directly extracting the verified 1.6.3 UI into resources\app, then patching backend only."
  ExecWait '"$TEMP\HaYad183Payload\asar-tool\node.exe" "$TEMP\HaYad183Payload\apply-1.8.3.cjs" "$TEMP\HaYad183Payload"' $0
  ${If} $0 != 0
    nsExec::ExecToStack '"$SYSDIR\cmd.exe" /S /C chcp 65001>nul & type "$TEMP\HaYad-1.8.3-result.json"'
    Pop $1
    Pop $2
    MessageBox MB_ICONSTOP "Repair stopped. Code: $0.$\r$\n$2$\r$\nLog: $TEMP\HaYad-1.8.3-install.log"
    Abort
  ${EndIf}
  MessageBox MB_ICONINFORMATION "Repair 1.8.3 completed. The approved 1.6.3 UI is preserved and the local library is loaded as a core layer."
  RMDir /r "$TEMP\HaYad183Payload"
SectionEnd
