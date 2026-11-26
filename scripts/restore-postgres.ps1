# SPDX-License-Identifier: Apache-2.0
# Restore PostgreSQL OrderTower trên Windows/PowerShell.
# Dùng: $env:RESTORE_YES='1'; ./scripts/restore-postgres.ps1 backups/file.dump
param(
  [Parameter(Mandatory = $true)]
  [string]$File
)
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
if ($env:RESTORE_YES -ne '1') {
  throw "Từ chối restore vì chưa đặt RESTORE_YES=1."
}
if (-not (Test-Path -LiteralPath $File)) {
  throw "Không tìm thấy file backup: $File"
}
$dbUser = if ($env:POSTGRES_USER) { $env:POSTGRES_USER } else { 'ordertower' }
$dbName = if ($env:POSTGRES_DB) { $env:POSTGRES_DB } else { 'ordertower' }
$tmp = "/tmp/ordertower-restore-$([Guid]::NewGuid().ToString('N')).dump"
$startedApi = $false

if ($env:RESTORE_KEEP_API -ne '1') {
  Write-Output 'Dừng API để tránh kết nối đang mở...'
  & docker compose stop api | Out-Null
  $startedApi = $true
}

try {
  Write-Output "Đang restore $File vào database $dbName..."
  & docker compose cp $File "postgres:$tmp"
  if ($LASTEXITCODE -ne 0) { throw "docker compose cp thất bại (exit $LASTEXITCODE)." }
  & docker compose exec -T postgres pg_restore --username $dbUser --dbname $dbName --clean --if-exists --no-owner --no-acl $tmp
  if ($LASTEXITCODE -ne 0) { throw "pg_restore thất bại (exit $LASTEXITCODE)." }
  Write-Output 'Restore xong.'
}
finally {
  & docker compose exec -T postgres rm -f $tmp | Out-Null
  if ($startedApi) {
    Write-Output 'Bật lại API...'
    & docker compose start api | Out-Null
  }
}
