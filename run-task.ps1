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
$HerdrDir = Split-Path -Parent (Get-Command herdr -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source)
if ($HerdrDir -and (-not ($env:PATH -split ";" | Where-Object { $_ -eq $HerdrDir }))) {
    $env:PATH = "$HerdrDir;$env:PATH"
}

Set-Location $ProjectDir
$stdoutLog = Join-Path $LogsDir "stdout.log"
$stderrLog = Join-Path $LogsDir "stderr.log"

node index.js *>> $stdoutLog 2>> $stderrLog
