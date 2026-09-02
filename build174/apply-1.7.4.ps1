param([Parameter(Mandatory=$true)][string]$Payload,[switch]$Quiet)
$ErrorActionPreference='Stop'
$log=Join-Path $env:TEMP 'HaYad-1.7.4-install.log'
"[$(Get-Date -Format o)] Starting HaYad 1.7.4 UI-locked update" | Set-Content $log -Encoding UTF8
function Log([string]$m){ "[$(Get-Date -Format o)] $m" | Add-Content $log -Encoding UTF8 }
function CandidatePaths {
  $paths=@()
  $roots=@($env:LOCALAPPDATA,$env:ProgramFiles,${env:ProgramFiles(x86)}) | Where-Object {$_}
  foreach($root in $roots){
    $paths += Join-Path $root 'hayad-hahazaka'
    $paths += Join-Path $root 'Programs\hayad-hahazaka'
    $paths += Join-Path $root 'Programs\HaYad-HaHazaka'
    $paths += Join-Path $root 'Programs\היד החזקה'
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
function Invoke-Asar([string[]]$Args){
  $node=Join-Path $Payload 'asar-tool\node.exe'
  $asar=Join-Path $Payload 'asar-tool\node_modules\@electron\asar\bin\asar.js'
  if(-not (Test-Path $node)){throw 'Bundled node.exe is missing'}
  if(-not (Test-Path $asar)){throw 'Bundled ASAR tool is missing'}
  & $node $asar @Args
  if($LASTEXITCODE -ne 0){throw "ASAR tool failed with code $LASTEXITCODE"}
}
$uiExpected=@{
  'dist\assets\index.js'='e2a301bad496d87490eaceb091204d2287fa60f00c5d22341403e6f8daa69e76';
  'dist\assets\index.css'='6df2817f475b85236d7c4764d1fa2339673b3d827cd6442fbce042b5dbcefc37';
  'dist\index.html'='74e52686fc6f255043062277f385b45cd85e2fdd16abc42dc00afbe18913de24'
}
function Validate-Renderer([string]$dir){
  foreach($rel in $uiExpected.Keys){
    $p=Join-Path $dir $rel
    if(-not (Test-Path $p)){return $false}
    $actual=(Get-FileHash $p -Algorithm SHA256).Hash.ToLower()
    if($actual -ne $uiExpected[$rel]){Log "Renderer hash mismatch $rel expected=$($uiExpected[$rel]) actual=$actual";return $false}
  }
  return $true
}
try {
  Log "Payload=$Payload"
  $target=$null
  foreach($p in CandidatePaths){
    if(Test-Path (Join-Path $p 'resources\app.asar')){$target=$p;break}
  }
  if(-not $target){throw 'לא נמצאה התקנת 1.6.3 קיימת.'}
  $res=Join-Path $target 'resources'
  Log "Target=$target"
  $appExe=Get-ChildItem $target -Filter '*.exe' -File | Where-Object {$_.Name -notmatch 'unins|Uninstall|elevate'} | Select-Object -First 1
  if($appExe){
    Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {$_.ExecutablePath -and $_.ExecutablePath -eq $appExe.FullName} | ForEach-Object {Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue}
    Start-Sleep -Milliseconds 800
  }
  $temp=Join-Path $env:TEMP 'HaYad174Work'
  Remove-Item $temp -Recurse -Force -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Force $temp | Out-Null
  $current=Join-Path $res 'app.asar'
  $backup=Join-Path $res 'app-1.6.3-original.asar'
  $candidates=@($current,$backup) | Where-Object {Test-Path $_}
  $base=$null
  foreach($candidate in $candidates){
    $check=Join-Path $temp ('check-'+[guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Force $check | Out-Null
    try {
      Invoke-Asar @('extract',$candidate,$check)
      if(Validate-Renderer $check){$base=$candidate;Log "Validated original 1.6.3 renderer in $candidate";Remove-Item $check -Recurse -Force;break}
    } catch {Log "Candidate failed: $candidate / $($_.Exception.Message)"}
    Remove-Item $check -Recurse -Force -ErrorAction SilentlyContinue
  }
  if(-not $base){throw 'לא נמצאה חבילת 1.6.3 מקורית עם העיצוב המאושר. לא בוצע שינוי.'}
  if(-not (Test-Path $backup)){Copy-Item $base $backup -Force;Log 'Saved original 1.6.3 app.asar backup'}

  $work=Join-Path $temp 'app'
  New-Item -ItemType Directory -Force $work | Out-Null
  Invoke-Asar @('extract',$base,$work)
  if(-not (Validate-Renderer $work)){throw 'בדיקת נעילת העיצוב נכשלה לפני העדכון.'}

  $node=Join-Path $Payload 'asar-tool\node.exe'
  $patcher=Join-Path $Payload 'patch-main-1.7.4.js'
  & $node $patcher (Join-Path $work 'dist-electron\main.js') (Join-Path $work 'package.json')
  if($LASTEXITCODE -ne 0){throw 'Backend patching failed'}
  if(-not (Validate-Renderer $work)){throw 'קבצי הממשק השתנו בניגוד לנעילה.'}

  $newAsar=Join-Path $temp 'app-1.7.4.asar'
  Invoke-Asar @('pack',$work,$newAsar)
  $verify=Join-Path $temp 'verify'
  New-Item -ItemType Directory -Force $verify | Out-Null
  Invoke-Asar @('extract',$newAsar,$verify)
  if(-not (Validate-Renderer $verify)){throw 'בדיקת ASAR סופית נכשלה: הממשק אינו זהה ל-1.6.3.'}
  $mainText=Get-Content (Join-Path $verify 'dist-electron\main.js') -Raw -Encoding UTF8
  if(-not $mainText.Contains('LOCAL_CORPUS_174')){throw 'בדיקת שכבת המאגר נכשלה לאחר האריזה.'}
  Log 'UI HASH LOCK OK — renderer is byte-identical to 1.6.3'

  $libDir=Join-Path $res 'local-library'
  New-Item -ItemType Directory -Force $libDir | Out-Null
  Copy-Item (Join-Path $Payload 'local-library\sqlite3.exe') (Join-Path $libDir 'sqlite3.exe') -Force
  $db=Join-Path $libDir 'torah-library.sqlite'
  $dbOk=$false
  if(Test-Path $db){
    try{
      $q=& (Join-Path $libDir 'sqlite3.exe') -readonly $db 'PRAGMA quick_check;' 2>&1
      if(($q|Out-String).Trim() -eq 'ok'){$dbOk=$true;Log 'Existing local corpus passed quick_check'}
    }catch{}
  }
  if(-not $dbOk){
    $archive=Join-Path $Payload 'local-library\library.zip'
    if(-not (Test-Path $archive)){throw 'קובץ המאגר המקומי חסר.'}
    $drive=[System.IO.DriveInfo]::new((Split-Path $target -Qualifier))
    if($drive.AvailableFreeSpace -lt 4GB){throw 'נדרשים לפחות 4GB פנויים להתקנת המאגר המקומי.'}
    Remove-Item $db -Force -ErrorAction SilentlyContinue
    Expand-Archive -LiteralPath $archive -DestinationPath $libDir -Force
    $q=& (Join-Path $libDir 'sqlite3.exe') -readonly $db 'PRAGMA quick_check;' 2>&1
    if(($q|Out-String).Trim() -ne 'ok'){throw 'בדיקת תקינות המאגר המקומי נכשלה.'}
    Log "Local corpus installed: $((Get-Item $db).Length) bytes"
  }

  # Critical recovery from 1.7.2/1.7.3: Electron prefers resources\app over app.asar.
  $wrapper=Join-Path $res 'app'
  if(Test-Path $wrapper){Remove-Item $wrapper -Recurse -Force;Log 'Removed obsolete wrapper app directory'}
  Copy-Item $newAsar $current -Force
  Log 'Installed backend-only app.asar; renderer remains original 1.6.3'

  $master=Join-Path $res 'master\ספר שופטים גרסת מסטר.docx'
  if(-not (Test-Path $master)){
    $managed=@(
      (Join-Path $env:APPDATA 'hayad-hahazaka\masters\ספר שופטים גרסת מסטר.docx'),
      (Join-Path $env:LOCALAPPDATA 'hayad-hahazaka\masters\ספר שופטים גרסת מסטר.docx')
    ) | Where-Object {Test-Path $_} | Select-Object -First 1
    if($managed){New-Item -ItemType Directory -Force (Split-Path $master -Parent)|Out-Null;Copy-Item $managed $master -Force;Log 'Recovered master DOCX from user data'}
  }
  if(-not (Test-Path $master)){Log 'WARNING: base master DOCX not found in resources; app may require user master recovery.'}

  @{version='1.7.4';base='1.6.3';ui='sha256-locked-original';localLibrary=$true;installedAt=(Get-Date).ToString('o')} | ConvertTo-Json | Set-Content (Join-Path $res 'rambam-bahir-1.7.4.json') -Encoding UTF8
  Remove-Item $temp -Recurse -Force -ErrorAction SilentlyContinue
  if(-not $Quiet){
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show('עדכון 1.7.4 הותקן. העיצוב המקורי של 1.6.3 נשמר ללא שינוי ונוסף המאגר המקומי.','הרמב״ם הבהיר') | Out-Null
    if($appExe){Start-Process $appExe.FullName}
  }
  exit 0
}catch{
  $msg=$_.Exception.Message
  Log "ERROR: $msg"
  Log ($_|Out-String)
  if(-not $Quiet){try{Add-Type -AssemblyName PresentationFramework;[System.Windows.MessageBox]::Show("העדכון נעצר ללא שינוי בעיצוב.`n`n$msg`n`nלוג: $log",'הרמב״ם הבהיר')|Out-Null}catch{}}
  exit 14
}
