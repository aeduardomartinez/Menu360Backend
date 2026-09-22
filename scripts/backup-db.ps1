# backup-db.ps1
# Crea un respaldo (dump) de la base de datos Postgres de VentaComida, que
# corre dentro del contenedor Docker "venta_comida_db" (ver backend/docker-compose.yml).
#
# USO:
#   Doble clic, o desde PowerShell:  .\backup-db.ps1
#
# Guarda el respaldo en backend\backups\venta_comida_YYYY-MM-DD_HHmmss.sql
#
# RECOMENDACION: agrega este script a las Tareas Programadas de Windows
# (Task Scheduler) para que corra automaticamente, por ejemplo cada noche.
# Sin un respaldo periodico, cualquier cambio destructivo en la base de datos
# (o un error humano) puede borrar todos los pedidos, clientes y configuracion
# del restaurante sin forma de recuperarlos.

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$backupDir = Join-Path (Split-Path -Parent $scriptDir) "backups"

if (-not (Test-Path $backupDir)) {
    New-Item -ItemType Directory -Path $backupDir | Out-Null
}

$timestamp = Get-Date -Format "yyyy-MM-dd_HHmmss"
$backupFile = Join-Path $backupDir "venta_comida_$timestamp.sql"

Write-Host "Creando respaldo de la base de datos 'venta_comida'..."

docker exec venta_comida_db pg_dump -U postgres venta_comida | Out-File -Encoding utf8 $backupFile

if ($LASTEXITCODE -eq 0) {
    Write-Host "Respaldo creado correctamente en: $backupFile"
} else {
    Write-Host "ERROR: no se pudo crear el respaldo. Verifica que Docker Desktop este corriendo y que el contenedor 'venta_comida_db' este activo (docker ps)."
    exit 1
}

# Limpieza: conserva solo los ultimos 30 respaldos para no llenar el disco.
Get-ChildItem $backupDir -Filter "venta_comida_*.sql" |
    Sort-Object LastWriteTime -Descending |
    Select-Object -Skip 30 |
    Remove-Item -Force
