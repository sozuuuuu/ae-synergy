# AE Synergy (src/index.ts) を起動・停止・再起動する簡易メニュー。デスクトップの「AE Synergy サーバー」から開く。
# サーバーはウィンドウなしで動き、このメニューを閉じても止まらない。ログは storage/server.log。
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Port = 3940
$Bun = Join-Path $env:USERPROFILE '.bun\bin\bun.exe'
$Log = Join-Path $Root 'storage\server.log'
$Url = "http://localhost:$Port"

function Get-ServerPid {
  $c = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($c) { $c.OwningProcess } else { $null }
}

function Show-Status {
  $p = Get-ServerPid
  if ($p) {
    $proc = Get-Process -Id $p -ErrorAction SilentlyContinue
    Write-Host "稼働中  PID $p  起動 $($proc.StartTime)  $Url" -ForegroundColor Green
  } else {
    Write-Host "停止中" -ForegroundColor Yellow
  }
}

# スマホ用の tailscale serve（tailnet 内だけに HTTPS 8443 → 127.0.0.1:3940）。443 は Moneytree Local が使っているので触らない。
$Tailscale = 'C:\Program Files\Tailscale\tailscale.exe'
$ServePort = 8443

function Get-TailnetOrigin {
  if (-not (Test-Path $Tailscale)) { return $null }
  $j = & $Tailscale status --json 2>$null | Out-String | ConvertFrom-Json
  if (-not $j -or -not $j.Self.DNSName) { return $null }
  'https://' + $j.Self.DNSName.TrimEnd('.') + ":$ServePort"
}

function Get-ServeUrl {
  if (-not (Test-Path $Tailscale)) { return $null }
  $j = & $Tailscale serve status --json 2>$null | Out-String | ConvertFrom-Json
  if (-not $j -or -not $j.Web) { return $null }
  foreach ($p in $j.Web.PSObject.Properties) {
    if ($p.Name -like "*:$ServePort" -and ($p.Value.Handlers.PSObject.Properties | Where-Object { $_.Value.Proxy -match ":$Port$" })) {
      return 'https://' + $p.Name
    }
  }
  $null
}

function Show-ServeStatus {
  $u = Get-ServeUrl
  if ($u) { Write-Host "Tailscale 公開中  $u" -ForegroundColor Green } else { Write-Host "Tailscale 公開なし" -ForegroundColor Yellow }
}

function Switch-Serve {
  if (Get-ServeUrl) { & $Tailscale serve --https=$ServePort off | Out-Null; Write-Host "Tailscale の公開を止めました" }
  else { & $Tailscale serve --bg --https=$ServePort $Port | Out-Null; Write-Host "Tailscale で公開しました" }
}

function Start-Server {
  if (Get-ServerPid) { Write-Host "すでに稼働中です"; return }
  # 画面の CSS はビルド済みファイルを配るので、起動前に作り直す
  Start-Process -FilePath $Bun -ArgumentList 'run', 'css:build' -WorkingDirectory $Root -WindowStyle Hidden -Wait
  # 子プロセスは起動時の環境変数を引き継ぐ。PUBLIC_ORIGIN は tailscale 越しの POST を Origin 検査で通すため
  $env:PORT = "$Port"
  $env:PUBLIC_ORIGIN = Get-TailnetOrigin
  try {
    Start-Process -FilePath $Bun -ArgumentList 'src/index.ts' -WorkingDirectory $Root -WindowStyle Hidden `
      -RedirectStandardOutput $Log -RedirectStandardError "$Log.err"
  } finally {
    Remove-Item Env:PORT, Env:PUBLIC_ORIGIN -ErrorAction SilentlyContinue
  }
  for ($i = 0; $i -lt 30 -and -not (Get-ServerPid); $i++) { Start-Sleep -Milliseconds 300 }
  if (Get-ServerPid) { Write-Host "起動しました" } else { Write-Host "起動を確認できません。$Log.err を見てください" -ForegroundColor Red }
}

function Stop-Server {
  $p = Get-ServerPid
  if (-not $p) { Write-Host "停止中です"; return }
  Stop-Process -Id $p -Force
  for ($i = 0; $i -lt 20 -and (Get-ServerPid); $i++) { Start-Sleep -Milliseconds 200 }
  Write-Host "停止しました"
}

while ($true) {
  Write-Host ""
  Write-Host "=== AE Synergy ===" -ForegroundColor Cyan
  Show-Status
  Show-ServeStatus
  Write-Host "[1] 起動  [2] 停止  [3] 再起動  [4] ブラウザで開く  [5] ログ  [6] Tailscale 公開 ON/OFF  [q] 終了"
  switch (Read-Host "選択") {
    '1' { Start-Server }
    '2' { Stop-Server }
    '3' { Stop-Server; Start-Server }
    '4' { Start-Process $Url }
    '5' { if (Test-Path $Log) { Get-Content $Log, "$Log.err" -Tail 30 -ErrorAction SilentlyContinue } else { Write-Host "ログはまだありません" } }
    '6' { Switch-Serve }
    'q' { exit }
    default { }
  }
}
