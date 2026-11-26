# SPDX-License-Identifier: Apache-2.0
# Backup PostgreSQL OrderTower trên Windows/PowerShell.
# Dùng: ./scripts/backup-postgres.ps1
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$backupDir = if ($env:BACKUP_DIR) { $env:BACKUP_DIR } else { 'backups' }
$dbUser = if ($env:POSTGRES_USER) { $env:POSTGRES_USER } else { 'ordertower' }
$dbName = if ($env:POSTGRES_DB) { $env:POSTGRES_DB } else { 'ordertower' }
$stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$file = Join-Path $backupDir "$dbName-$stamp.dump"
$tmp = "/tmp/ordertower-$stamp.dump"

New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
Write-Output "Đang backup database $dbName..."
& docker compose exec -T postgres pg_dump --username $dbUser --dbname $dbName --format=custom --file $tmp
if ($LASTEXITCODE -ne 0) { throw "pg_dump thất bại (exit $LASTEXITCODE)." }
& docker compose cp "postgres:$tmp" $file
if ($LASTEXITCODE -ne 0) { throw "docker compose cp thất bại (exit $LASTEXITCODE)." }
& docker compose exec -T postgres rm -f $tmp | Out-Null

$hash = (Get-FileHash -Algorithm SHA256 -Path $file).Hash.ToLowerInvariant()
"$hash  $(Split-Path -Leaf $file)" | Set-Content -Path "$file.sha256" -Encoding ascii
Write-Output "Đã tạo: $file"
Write-Output "Checksum: $file.sha256"
