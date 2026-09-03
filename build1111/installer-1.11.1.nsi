Unicode true
!include "LogicLib.nsh"
Name "הרמב״ם הבהיר 1.11.1 — שימור כלים ומאגר ימני"
OutFile "HaYad-HaHazaka-Update-1.11.1.exe"
RequestExecutionLevel admin
SilentInstall normal
ShowInstDetails show
SetCompressor zlib
Page instfiles

Var TARGET

Function .onInit
  StrCpy $TARGET "$LOCALAPPDATA\hayad-hahazaka"
  IfFileExists "$TARGET\resources\app.asar" found
  StrCpy $TARGET "$LOCALAPPDATA\Programs\hayad-hahazaka"
  IfFileExists "$TARGET\resources\app.asar" found
  StrCpy $TARGET "$LOCALAPPDATA\Programs\HaYad-HaHazaka"
  IfFileExists "$TARGET\resources\app.asar" found
  StrCpy $TARGET "$PROGRAMFILES\hayad-hahazaka"
  IfFileExists "$TARGET\resources\app.asar" found
  StrCpy $TARGET "$PROGRAMFILES\HaYad-HaHazaka"
  IfFileExists "$TARGET\resources\app.asar" found
  StrCpy $TARGET "$PROGRAMFILES32\hayad-hahazaka"
  IfFileExists "$TARGET\resources\app.asar" found
  MessageBox MB_ICONSTOP "לא נמצאה התקנת הרמב״ם הבהיר."
  Abort
found:
FunctionEnd

Section "Preserve Original Workspace + Right Research Sidebar"
  CreateDirectory "$TARGET\resources\core-library"
  IfFileExists "$TARGET\resources\core-library\core-library-ui.js" 0 +2
    CopyFiles /SILENT "$TARGET\resources\core-library\core-library-ui.js" "$TARGET\resources\core-library\core-library-ui.before-1.11.1.js"
  SetOutPath "$TARGET\resources\core-library"
  File /oname=core-library-ui.js "payload\core-library-ui.js"
  SetOutPath "$TARGET\resources"
  File /oname=rambam-bahir-1.11.1.json "payload\rambam-bahir-1.11.1.json"
  MessageBox MB_ICONINFORMATION "1.11.1 הותקנה. כל כלי המערכת המקוריים נשמרו; המאגר והניווט נוספו כ-Side Bar ימני. יש לסגור ולפתוח מחדש את התוכנה."
SectionEnd
