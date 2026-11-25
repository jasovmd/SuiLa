$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$jdk21 = Get-ChildItem "C:\Program Files\Microsoft" -Directory -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -like "jdk-21*" } |
  Select-Object -First 1
if ($jdk21) {
  $env:JAVA_HOME = $jdk21.FullName
} else {
  $studioJbr = "C:\Program Files\Android\Android Studio\jbr"
  if (Test-Path $studioJbr) { $env:JAVA_HOME = $studioJbr }
}
if ($env:JAVA_HOME) {
  $env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
}
$env:GRADLE_USER_HOME = "C:\Users\jason\AppData\Local\suila77-gradle"

if (-not $env:ANDROID_HOME) {
  $sdk = Join-Path $env:LOCALAPPDATA "Android\Sdk"
  if (Test-Path $sdk) { $env:ANDROID_HOME = $sdk }
}

Write-Host "JAVA_HOME=$env:JAVA_HOME"
Write-Host "ANDROID_HOME=$env:ANDROID_HOME"

npm run build -- --mode production
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npx cap sync android
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Push-Location (Join-Path $root "android")
try {
  .\gradlew.bat assembleDebug --no-daemon
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
  Pop-Location
}

$apk = Get-ChildItem "C:\Users\jason\AppData\Local\suila77-android-build" -Recurse -Filter "app-debug.apk" -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1 -ExpandProperty FullName
if (-not $apk) {
  $apk = Join-Path $root "android\app\build\outputs\apk\debug\app-debug.apk"
}
$outDir = Join-Path (Split-Path $root) "APK"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$dest = Join-Path $outDir "suila-capacitor-debug.apk"
Copy-Item $apk $dest -Force
Write-Host "APK ready: $dest"
