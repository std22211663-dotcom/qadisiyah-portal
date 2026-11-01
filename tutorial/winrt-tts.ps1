param([string]$TextFile, [string]$Out, [string]$Voice = '', [double]$Rate = 0.9, [switch]$List)
# Windows.Media.SpeechSynthesis (the "OneCore" voices, e.g. Arabic Naayf) - not visible to System.Speech
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.SpeechSynthesis.SpeechSynthesizer, Windows.Media.SpeechSynthesis, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime]
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function Await($op, $type) { $t = $asTask.MakeGenericMethod($type).Invoke($null, @($op)); $t.Wait(-1) | Out-Null; $t.Result }
$voices = [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices
if ($List) { $voices | ForEach-Object { $_.DisplayName + ' | ' + $_.Language }; exit 0 }
$s = New-Object Windows.Media.SpeechSynthesis.SpeechSynthesizer
$v = $voices | Where-Object { $_.Language -like 'ar*' -and ($Voice -eq '' -or $_.DisplayName -like "*$Voice*") } | Select-Object -First 1
if (-not $v) { Write-Error 'no Arabic WinRT voice'; exit 3 }
$s.Voice = $v
try { $s.Options.SpeakingRate = $Rate } catch { }
$text = [IO.File]::ReadAllText($TextFile, [Text.Encoding]::UTF8)
$stream = Await ($s.SynthesizeTextToStreamAsync($text)) ([Windows.Media.SpeechSynthesis.SpeechSynthesisStream])
$reader = New-Object Windows.Storage.Streams.DataReader($stream.GetInputStreamAt(0))
$null = Await ($reader.LoadAsync([uint32]$stream.Size)) ([uint32])
$bytes = New-Object byte[] $stream.Size
$reader.ReadBytes($bytes)
[IO.File]::WriteAllBytes($Out, $bytes)
