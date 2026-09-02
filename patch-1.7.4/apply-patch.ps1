param([Parameter(Mandatory=$true)][string]$Payload,[switch]$Quiet)
$ErrorActionPreference='Stop'
$log=Join-Path $env:TEMP 'HaYad-1.7.4-install.log'
"[$(Get-Date -Format o)] Starting HaYad 1.7.4 UI-locked patch" | Set-Content $log -Encoding UTF8
function Log([string]$m){ "[$(Get-Date -Format o)] $m" | Add-Content $log -Encoding UTF8 }
function CandidatePaths {
  $paths=@()
  $roots=@($env:LOCALAPPDATA,$env:ProgramFiles,${env:ProgramFiles(x86)}) | Where-Object {$_}
  foreach($root in $roots){
    $paths += Join-Path $root 'Programs\hayad-hahazaka'
    $paths += Join-Path $root 'Programs\HaYad-HaHazaka'
    $paths += Join-Path $root 'Programs\היד החזקה'
    $paths += Join-Path $root 'hayad-hahazaka'
    $paths += Join-Path $root 'HaYad-HaHazaka'
    $paths += Join-Path $root 'היד החזקה'
  }
  $reg=@('HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*','HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*','HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*')
  foreach($r in $reg){ Get-ItemProperty $r -ErrorAction SilentlyContinue | ForEach-Object { if($_.InstallLocation){$paths += $_.InstallLocation}; if($_.DisplayIcon){try{$paths += Split-Path ($_.DisplayIcon -replace '"','') -Parent}catch{}} } }
  $paths | Where-Object {$_} | Select-Object -Unique
}
$target=$null
try {
  Log "Payload=$Payload Quiet=$Quiet"
  foreach($p in CandidatePaths){ if((Test-Path (Join-Path $p 'resources\app.asar')) -or (Test-Path (Join-Path $p 'resources\app-1.6.3-original.asar'))){$target=$p;break} }
  if(-not $target){ throw 'לא נמצאה התקנת 1.6.3 המקורית.' }
  Log "Target=$target"
  $appExe=Get-ChildItem $target -Filter '*.exe' -File | Where-Object {$_.Name -notmatch 'unins|Uninstall|elevate'} | Select-Object -First 1
  if($appExe){ Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {$_.ExecutablePath -and $_.ExecutablePath -eq $appExe.FullName} | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }; Start-Sleep -Milliseconds 800 }

  $res=Join-Path $target 'resources'; $current=Join-Path $res 'app.asar'; $original=Join-Path $res 'app-1.6.3-original.asar'
  if(-not (Test-Path $original)){ if(-not (Test-Path $current)){throw 'app.asar המקורי לא נמצא.'}; Copy-Item $current $original -Force; Log 'Backed up original app.asar' }
  $originalSha=(Get-FileHash $original -Algorithm SHA256).Hash
  Log "OriginalAsarSHA=$originalSha"

  $appDir=Join-Path $res 'app'
  if(Test-Path $appDir){ Remove-Item $appDir -Recurse -Force }
  Copy-Item (Join-Path $Payload 'app') $appDir -Recurse -Force
  Log 'Installed backend bridge only. Original app.asar was not modified.'

  $libDir=Join-Path $res 'local-library'
  if(Test-Path $libDir){ Remove-Item $libDir -Recurse -Force }
  New-Item -ItemType Directory -Force $libDir | Out-Null
  Copy-Item (Join-Path $Payload 'local-library\sqlite3.exe') (Join-Path $libDir 'sqlite3.exe') -Force
  $archive=Join-Path $Payload 'local-library\library.zip'
  if(-not (Test-Path $archive)){ throw 'קובץ המאגר המקומי חסר.' }
  $drive=[System.IO.DriveInfo]::new((Split-Path $target -Qualifier)); if($drive.AvailableFreeSpace -lt 4GB){ throw 'נדרשים לפחות 4GB פנויים להתקנת המאגר המקומי.' }
  Expand-Archive -LiteralPath $archive -DestinationPath $libDir -Force
  $db=Join-Path $libDir 'torah-library.sqlite'; if(-not (Test-Path $db)){throw 'מסד הנתונים לא נמצא לאחר הפריסה.'}
  $sqlite=Join-Path $libDir 'sqlite3.exe'; $check=& $sqlite -readonly $db 'PRAGMA quick_check;' 2>&1
  if(($check|Out-String).Trim() -ne 'ok'){throw "SQLite quick_check נכשל: $check"}
  Log "SQLite quick_check=ok; DBBytes=$((Get-Item $db).Length)"

  $afterSha=(Get-FileHash $original -Algorithm SHA256).Hash
  if($afterSha -ne $originalSha){ throw 'בדיקת UI LOCK נכשלה: app.asar המקורי השתנה.' }
  Log 'UI LOCK OK: original 1.6.3 app.asar SHA unchanged.'
  @{version='1.7.4';base='1.6.3';ui='AS-IS';rendererModified=$false;localLibrary=$true;originalAsarSha=$originalSha;installedAt=(Get-Date).ToString('o')} | ConvertTo-Json | Set-Content (Join-Path $res 'rambam-bahir-1.7.4.json') -Encoding UTF8
  if(-not $Quiet){ Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show('המאגר המקומי הוטמע. ממשק 1.6.3 נשמר AS IS.','הרמב״ם הבהיר 1.7.4') | Out-Null; if($appExe){Start-Process $appExe.FullName} }
  exit 0
}
catch {
  $msg=$_.Exception.Message; Log "ERROR: $msg"; Log ($_|Out-String)
  if($target){ try { $rollback=Join-Path $target 'resources\app'; if(Test-Path $rollback){Remove-Item $rollback -Recurse -Force}; Log 'Rollback: removed bridge; Electron will use original app.asar.' } catch {} }
  if(-not $Quiet){ try { Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show("העדכון נעצר וחזר אוטומטית ל־1.6.3 המקורית.\n\n$msg\n\nלוג: $log",'הרמב״ם הבהיר') | Out-Null } catch {} }
  exit 10
}
