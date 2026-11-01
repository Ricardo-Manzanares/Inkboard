# Instala la piel de telemetría del PC: copia Rainmeter\Telemetria a Documentos\Rainmeter\Skins\Inkboard-Telemetria,
# guarda la configuración, detecta los discos fijos y la carga en Rainmeter. No necesita el servidor ni el agente:
# lee CPU, RAM, SWAP y discos del propio PC.
# Uso: powershell -ExecutionPolicy Bypass -File Rainmeter\install-telemetria.ps1 [-Width 700] [-Theme dark|light] [-Monitor 1] [-Align 0] [-Margin 24] [-OffsetX 0] [-Subtitle "texto"]
param(
  [int]$Width = 700,
  [ValidateSet('dark', 'light')][string]$Theme = 'dark',
  [int]$Monitor = 1,
  [int]$Align = 0,
  [int]$Margin = 24,
  # Desplazamiento horizontal desde el borde, para poner varios widgets en fila.
  [int]$OffsetX = 0,
  # Texto bajo «Sistema»; vacío = nombre del equipo y procesador.
  [string]$Subtitle = ''
)
$ErrorActionPreference = 'Stop'
$config = 'Inkboard-Telemetria'
$source = Join-Path $PSScriptRoot 'Telemetria'
$skins = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'Rainmeter\Skins'
$target = Join-Path $skins $config
$resources = Join-Path $target '@Resources'
$rainmeter = @("$env:ProgramFiles\Rainmeter\Rainmeter.exe", "${env:ProgramFiles(x86)}\Rainmeter\Rainmeter.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $rainmeter) { throw 'No se encuentra Rainmeter. Instálalo con: winget install Rainmeter.Rainmeter' }

# Con la piel cargada, Rainmeter tiene abiertas sus fuentes y no se podrían sobrescribir: se descarga antes.
if (Get-Process Rainmeter -ErrorAction SilentlyContinue) { & $rainmeter '!DeactivateConfig' $config; Start-Sleep 2 }

# Se copia la piel entera; Variables.inc y Disks.inc se generan aquí, para cada PC.
New-Item -ItemType Directory -Force $target | Out-Null
Copy-Item (Join-Path $source '*') $target -Recurse -Force

# Rainmeter lee los .inc en UTF-16 LE sin problemas con cualquier carácter.
@"
[Variables]
; Ancho en píxeles; el alto depende del número de discos. 700 = el mismo ancho que el widget de Inkboard.
Width=$Width
; Tema: dark (tarjetas oscuras, texto claro) o light (tarjetas blancas, texto negro, como el Kindle).
Theme=$Theme
; Monitor de Rainmeter (1 = el primero), lado (0 = izquierda, 1 = derecha) y separación del borde.
Monitor=$Monitor
Align=$Align
Margin=$Margin
OffsetX=$OffsetX
; Texto bajo «Sistema». Vacío = nombre del equipo y procesador.
SystemSubtitle=$Subtitle
"@ | Out-File -FilePath (Join-Path $resources 'Variables.inc') -Encoding Unicode

# Discos fijos con letra, en orden (máximo 6, los que caben en la tarjeta).
$disks = @(Get-Volume | Where-Object { $_.DriveType -eq 'Fixed' -and $_.DriveLetter -and $_.Size -gt 0 } | Sort-Object DriveLetter | Select-Object -First 6)
$lines = @('[Variables]', '; Generado por install-telemetria.ps1. Vuelve a ejecutarlo si cambian los discos.', "DiskCount=$($disks.Count)")
for ($i = 1; $i -le 6; $i++) { $lines += "Disk$i=$(if ($i -le $disks.Count) { "$($disks[$i - 1].DriveLetter):" })" }
$lines -join "`r`n" | Out-File -FilePath (Join-Path $resources 'Disks.inc') -Encoding Unicode

if (-not (Get-Process Rainmeter -ErrorAction SilentlyContinue)) { Start-Process $rainmeter; Start-Sleep 3 }
& $rainmeter '!RefreshApp'
Start-Sleep 2
& $rainmeter '!ActivateConfig' $config 'Telemetry.ini'
Write-Output "Telemetría instalada en $target`: tema $Theme, monitor $Monitor, $(if ($Align) { 'derecha' } else { 'izquierda' }), $Width px, discos $(($disks | ForEach-Object { "$($_.DriveLetter):" }) -join ' ')."
