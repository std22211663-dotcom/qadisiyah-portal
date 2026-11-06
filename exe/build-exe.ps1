# Builds dist\QadisiyahPortal\  (QadisiyahPortal.exe + runtime\node.exe + app\ + data\) and a zip next to it.
# Run:  powershell -ExecutionPolicy Bypass -File exe\build-exe.ps1
# Keep this file ASCII only (Windows PowerShell 5.1 reads BOM-less files as ANSI); the Arabic text lives in readme-ar.txt.
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$out = Join-Path $root 'dist\QadisiyahPortal'
$csc = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path $csc)) { throw 'csc.exe (.NET Framework 4) not found' }
$nodeExe = (Get-Command node).Source
if (Test-Path $out) { Remove-Item $out -Recurse -Force }
New-Item -ItemType Directory -Force "$out\runtime", "$out\app" | Out-Null
Copy-Item $nodeExe "$out\runtime\node.exe"
Copy-Item "$root\server.js", "$root\org.json" "$out\app"
Copy-Item "$root\public" "$out\app\public" -Recurse
& $csc /nologo /target:winexe /codepage:65001 /optimize+ "/out:$out\QadisiyahPortal.exe" /r:System.Windows.Forms.dll /r:System.Drawing.dll "$PSScriptRoot\Launcher.cs"
if ($LASTEXITCODE -ne 0) { throw 'compile failed' }
$readme = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'readme-ar.txt'), [Text.Encoding]::UTF8).Replace("`r`n", "`n").Replace("`n", "`r`n")
[IO.File]::WriteAllText((Join-Path $out 'readme-ar.txt'), $readme, (New-Object Text.UTF8Encoding($true)))
$zip = Join-Path $root 'dist\QadisiyahPortal.zip'
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path $out -DestinationPath $zip
"built: $out"
"zip: {0:N0} MB" -f ((Get-Item $zip).Length / 1MB)
