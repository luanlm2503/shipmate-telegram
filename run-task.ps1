# Wrapper invoked by Task Scheduler. Ensures Node 22 and Herdr are on PATH (since
# Task Scheduler's non-interactive environment may not match an interactive shell),
# then runs the bot, redirecting output to the logs directory for post-mortem debugging.

$ErrorActionPreference = "Stop"
$ProjectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$LogsDir = Join-Path $ProjectDir "logs"
New-Item -ItemType Directory -Force -Path $LogsDir | Out-Null

$NodeDir = "C:\Program Files\nodejs"
if (-not ($env:PATH -split ";" | Where-Object { $_ -eq $NodeDir })) {
    $env:PATH = "$NodeDir;$env:PATH"
}

# Ensure Herdr binary path is also preserved
$HerdrDir = "C:\Users\luanlm\.herdr\packages\standalone\releases\0.9.3-x86_64-pc-windows-msvc"
if (-not ($env:PATH -split ";" | Where-Object { $_ -eq $HerdrDir })) {
    $env:PATH = "$HerdrDir;$env:PATH"
}

# Ensure jq binary path is also preserved
$JqDir = "C:\Users\luanlm\AppData\Local\Microsoft\WinGet\Packages\jqlang.jq_Microsoft.Winget.Source_8wekyb3d8bbwe"
if ((Test-Path $JqDir) -and (-not ($env:PATH -split ";" | Where-Object { $_ -eq $JqDir }))) {
    $env:PATH = "$JqDir;$env:PATH"
}

Set-Location $ProjectDir
$stdoutLog = Join-Path $LogsDir "stdout.log"
$stderrLog = Join-Path $LogsDir "stderr.log"

$process = Start-Process -FilePath "node.exe" -ArgumentList "index.js" -WorkingDirectory $ProjectDir -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog -WindowStyle Hidden -PassThru
$process.WaitForExit()
