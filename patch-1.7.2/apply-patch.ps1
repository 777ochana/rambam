param([Parameter(Mandatory=$true)][string]$Payload)
$ErrorActionPreference='Stop'

function CandidatePaths {
  $paths=@()
  $roots=@($env:LOCALAPPDATA,$env:ProgramFiles,${env:ProgramFiles(x86)}) | Where-Object {$_}
  foreach($root in $roots){
    $paths += Join-Path $root 'Programs\היד החזקה'
    $paths += Join-Path $root 'היד החזקה'
    $paths += Join-Path $root 'Programs\HaYad-HaHazaka'
    $paths += Join-Path $root 'HaYad-HaHazaka'
  }
  $reg=@('HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*','HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*','HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*')
  foreach($r in $reg){
    Get-ItemProperty $r -ErrorAction SilentlyContinue | Where-Object {$_.DisplayName -match 'היד החזקה|HaYad'} | ForEach-Object {
      if($_.InstallLocation){$paths += $_.InstallLocation}
      if($_.DisplayIcon){$paths += Split-Path ($_.DisplayIcon -replace '"','') -Parent}
    }
  }
  $paths | Where-Object {$_} | Select-Object -Unique
}

$target=$null
foreach($p in CandidatePaths){
  if((Test-Path (Join-Path $p 'resources\app.asar')) -or (Test-Path (Join-Path $p 'resources\app-1.6.3-original.asar'))){$target=$p;break}
}
if(-not $target){
  Add-Type -AssemblyName PresentationFramework
  [System.Windows.MessageBox]::Show('לא נמצאה התקנת הי״ד החזקה 1.6.3. יש להתקין תחילה את קובץ 1.6.3 המקורי ולאחר מכן להריץ עדכון זה.','הרמב״ם הבהיר') | Out-Null
  exit 2
}

$appExe=Get-ChildItem $target -Filter '*.exe' -File | Where-Object {$_.Name -notmatch 'unins|Uninstall|elevate'} | Select-Object -First 1
if($appExe){
  $ver=$appExe.VersionInfo.ProductVersion
  if($ver -and $ver -notmatch '^1\.6\.3'){
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show("נמצאה גרסה $ver. העדכון 1.7.2 נועד בכוונה ל-1.6.3 המקורי כדי לשמור בדיוק על העיצוב. התקן מחדש 1.6.3 ואז הרץ עדכון זה.",'הרמב״ם הבהיר') | Out-Null
    exit 3
  }
}

$res=Join-Path $target 'resources'
$original=Join-Path $res 'app-1.6.3-original.asar'
$current=Join-Path $res 'app.asar'
if(-not (Test-Path $original)){
  if(-not (Test-Path $current)){throw 'app.asar המקורי לא נמצא'}
  Move-Item $current $original -Force
}

$appDir=Join-Path $res 'app'
if(Test-Path $appDir){Remove-Item $appDir -Recurse -Force}
Copy-Item (Join-Path $Payload 'app') $appDir -Recurse -Force

$libDir=Join-Path $res 'local-library'
if(Test-Path $libDir){Remove-Item $libDir -Recurse -Force}
New-Item -ItemType Directory -Force $libDir | Out-Null
Copy-Item (Join-Path $Payload 'local-library\sqlite3.exe') (Join-Path $libDir 'sqlite3.exe') -Force
$archive=Join-Path $Payload 'local-library\library.zip'
if(-not (Test-Path $archive)){throw 'ארכיון המאגר המקומי חסר'}
& tar.exe -xf $archive -C $libDir
if($LASTEXITCODE -ne 0){throw 'פריסת המאגר המקומי נכשלה'}
if(-not (Test-Path (Join-Path $libDir 'torah-library.sqlite'))){throw 'מסד הנתונים לא נמצא לאחר הפריסה'}

$marker=@{
 version='1.7.2';
 base='1.6.3';
 ui='original-1.6.3';
 localLibrary=$true;
 installedAt=(Get-Date).ToString('o')
}|ConvertTo-Json
Set-Content (Join-Path $res 'rambam-bahir-1.7.2.json') $marker -Encoding UTF8

Add-Type -AssemblyName PresentationFramework
[System.Windows.MessageBox]::Show('עדכון 1.7.2 הותקן. העיצוב המקורי של 1.6.3 נשמר; נוסף רק המאגר המקומי וכפתור „שאל את המאגר”.','הרמב״ם הבהיר') | Out-Null
if($appExe){Start-Process $appExe.FullName}
