# Builds in dist\ :  QadisiyahPortal\ (portable folder), QadisiyahPortal.zip, and QadisiyahPortal-Setup.exe (installer with the zip embedded).
# Run:  powershell -ExecutionPolicy Bypass -File exe\build-exe.ps1      (exe\app.ico comes from: node exe\make-icons.js)
# Keep this file ASCII only (Windows PowerShell 5.1 reads BOM-less files as ANSI); the Arabic text lives in readme-ar.txt.
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$dist = Join-Path $root 'dist'
$out = Join-Path $dist 'QadisiyahPortal'
$csc = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path $csc)) { throw 'csc.exe (.NET Framework 4) not found' }
$ico = Join-Path $PSScriptRoot 'app.ico'
if (-not (Test-Path $ico)) { throw 'exe\app.ico missing: run node exe\make-icons.js' }
$nodeExe = (Get-Command node).Source
if (Test-Path $out) { Remove-Item $out -Recurse -Force }
New-Item -ItemType Directory -Force "$out\runtime", "$out\app" | Out-Null
Copy-Item $nodeExe "$out\runtime\node.exe"
Copy-Item "$root\server.js", "$root\org.json" "$out\app"
Copy-Item "$root\public" "$out\app\public" -Recurse
& $csc /nologo /target:winexe /codepage:65001 /optimize+ "/win32icon:$ico" "/out:$out\QadisiyahPortal.exe" /r:System.Windows.Forms.dll /r:System.Drawing.dll "$PSScriptRoot\Launcher.cs"
if ($LASTEXITCODE -ne 0) { throw 'compile failed (launcher)' }
$readme = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'readme-ar.txt'), [Text.Encoding]::UTF8).Replace("`r`n", "`n").Replace("`n", "`r`n")
[IO.File]::WriteAllText((Join-Path $out 'readme-ar.txt'), $readme, (New-Object Text.UTF8Encoding($true)))
$zip = Join-Path $dist 'QadisiyahPortal.zip'
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path $out -DestinationPath $zip
$setup = Join-Path $dist 'QadisiyahPortal-Setup.exe'
& $csc /nologo /target:winexe /codepage:65001 /optimize+ "/win32icon:$ico" "/out:$setup" "/resource:$zip,payload.zip" /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.IO.Compression.dll /r:System.IO.Compression.FileSystem.dll "$PSScriptRoot\Setup.cs"
if ($LASTEXITCODE -ne 0) { throw 'compile failed (setup)' }
"portable: $out"
"zip:   {0:N0} MB" -f ((Get-Item $zip).Length / 1MB)
"setup: {0:N0} MB  ($setup)" -f ((Get-Item $setup).Length / 1MB)
