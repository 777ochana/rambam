param([Parameter(Mandatory=$true)][string]$Payload,[switch]$Quiet)
$ErrorActionPreference='Stop'
$log=Join-Path $env:TEMP 'HaYad-1.7.3-install.log'
"[$(Get-Date -Format o)] Starting HaYad 1.7.3 patch" | Set-Content $log -Encoding UTF8

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
  foreach($r in $reg){
    Get-ItemProperty $r -ErrorAction SilentlyContinue | ForEach-Object {
      if($_.InstallLocation){$paths += $_.InstallLocation}
      if($_.DisplayIcon){try{$paths += Split-Path ($_.DisplayIcon -replace '"','') -Parent}catch{}}
    }
  }
  $paths | Where-Object {$_} | Select-Object -Unique
}

try {
  Log "Payload=$Payload Quiet=$Quiet"
  $target=$null
  foreach($p in CandidatePaths){
    if((Test-Path (Join-Path $p 'resources\app.asar')) -or (Test-Path (Join-Path $p 'resources\app-1.6.3-original.asar'))){$target=$p;break}
  }
  if(-not $target){ throw 'Base installation 1.6.3 was not found.' }
  Log "Target=$target"

  $appExe=Get-ChildItem $target -Filter '*.exe' -File | Where-Object {$_.Name -notmatch 'unins|Uninstall|elevate'} | Select-Object -First 1
  if($appExe){
    Log "AppExe=$($appExe.FullName); ProductVersion=$($appExe.VersionInfo.ProductVersion)"
    Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {$_.ExecutablePath -and $_.ExecutablePath -eq $appExe.FullName} | ForEach-Object {
      Log "Stopping running app PID=$($_.ProcessId)"
      Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Milliseconds 900
  }

  $res=Join-Path $target 'resources'
  $original=Join-Path $res 'app-1.6.3-original.asar'
  $current=Join-Path $res 'app.asar'
  if(-not (Test-Path $original)){
    if(-not (Test-Path $current)){ throw 'Original app.asar was not found.' }
    Copy-Item $current $original -Force
    Log 'Backed up original app.asar'
  }

  $appDir=Join-Path $res 'app'
  if(Test-Path $appDir){ Remove-Item $appDir -Recurse -Force }
  Copy-Item (Join-Path $Payload 'app') $appDir -Recurse -Force
  Log 'Installed wrapper app without modifying original UI bundle'

  $libDir=Join-Path $res 'local-library'
  if(Test-Path $libDir){ Remove-Item $libDir -Recurse -Force }
  New-Item -ItemType Directory -Force $libDir | Out-Null
  Copy-Item (Join-Path $Payload 'local-library\sqlite3.exe') (Join-Path $libDir 'sqlite3.exe') -Force

  $archive=Join-Path $Payload 'local-library\library.zip'
  if(-not (Test-Path $archive)){ throw 'Local library archive is missing.' }
  $archiveSize=(Get-Item $archive).Length
  $drive=[System.IO.DriveInfo]::new((Split-Path $target -Qualifier))
  Log "ArchiveBytes=$archiveSize; FreeBytes=$($drive.AvailableFreeSpace)"
  if($drive.AvailableFreeSpace -lt 4GB){ throw 'At least 4 GB of free disk space is required for the local library.' }

  Log 'Extracting local library...'
  Expand-Archive -LiteralPath $archive -DestinationPath $libDir -Force
  $db=Join-Path $libDir 'torah-library.sqlite'
  if(-not (Test-Path $db)){ throw 'Database was not found after extraction.' }
  $dbSize=(Get-Item $db).Length
  if($dbSize -lt 500MB){ throw "Database size is unexpectedly small: $dbSize" }
  Log "Database extracted; Bytes=$dbSize"

  $sqlite=Join-Path $libDir 'sqlite3.exe'
  $integrity=& $sqlite -readonly $db 'PRAGMA quick_check;' 2>&1
  Log "SQLite quick_check=$integrity"
  if(($integrity | Out-String).Trim() -ne 'ok'){ throw "SQLite integrity check failed: $integrity" }

  $marker=@{version='1.7.3';base='1.6.3';ui='original-1.6.3';localLibrary=$true;installedAt=(Get-Date).ToString('o')}|ConvertTo-Json
  Set-Content (Join-Path $res 'rambam-bahir-1.7.3.json') $marker -Encoding UTF8
  Log 'Patch completed successfully'

  if(-not $Quiet){
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show('עדכון 1.7.3 הותקן בהצלחה. ממשק 1.6.3 המקורי נשמר ונוסף המאגר המקומי.','הרמב״ם הבהיר') | Out-Null
    if($appExe){ Start-Process $appExe.FullName }
  }
  exit 0
}
catch {
  $msg=$_.Exception.Message
  Log "ERROR: $msg"
  Log ($_ | Out-String)
  if(-not $Quiet){
    try {
      Add-Type -AssemblyName PresentationFramework
      [System.Windows.MessageBox]::Show("העדכון נעצר. לא בוצעה החלפת עיצוב.\n\nשגיאה: $msg\n\nלוג: $log",'הרמב״ם הבהיר') | Out-Null
    } catch {}
  }
  exit 10
}
