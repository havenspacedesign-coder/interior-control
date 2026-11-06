$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$aiPortableJava = Join-Path $PSScriptRoot '.runtime/java21'
if (Test-Path -LiteralPath $aiPortableJava) {
  $aiJavaDirectory = Get-ChildItem -LiteralPath $aiPortableJava -Directory | Select-Object -First 1
  if ($aiJavaDirectory) {
    $env:JAVA_HOME = $aiJavaDirectory.FullName
    $env:PATH = "$($aiJavaDirectory.FullName)\bin;$env:PATH"
  }
}
$aiCli = Join-Path $PSScriptRoot 'node_modules/firebase-tools/lib/bin/firebase.js'
if (!(Test-Path -LiteralPath $aiCli)) { throw '請先在此目錄安裝 package.json 的測試相依套件，並準備 Java 21。詳見 README.md。' }
$aiArguments = @($aiCli, 'emulators:start', '--project', 'demo-haven-ai', '--config', 'firebase.json', '--only', 'auth,firestore,storage', '--export-on-exit', 'emulator-data')
if (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'emulator-data/firebase-export-metadata.json')) { $aiArguments += @('--import', 'emulator-data') }
& node @aiArguments
