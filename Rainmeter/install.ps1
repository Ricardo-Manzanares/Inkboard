# Instala el skin de Rainmeter: copia Rainmeter\KindleDashboard a Documentos\Rainmeter\Skins,
# crea Variables.inc con la clave del Kindle (DASH_KEY del .env del repo) y lo carga en Rainmeter.
# Uso: powershell -ExecutionPolicy Bypass -File Rainmeter\install.ps1 [-ServerUrl https://...] [-Page 0] [-Width 700] [-Theme dark|light] [-Monitor 1] [-Align 1]
# Cada pantalla es una config propia de Rainmeter (una carpeta), así que se pueden mostrar varias a la vez:
# -Page 0 (métricas) va a Skins\KindleDashboard y -Page N a Skins\KindleDashboard-Pantalla<N+1>.
param(
  [string]$ServerUrl = 'http://localhost:3000',
  [string]$Key = '',
  [ValidateRange(0, 9)][int]$Page = 0,
  [int]$Width = 700,
  [ValidateSet('dark', 'light')][string]$Theme = 'dark',
  [int]$Monitor = 1,
  [int]$Align = 1,
  [int]$Margin = 24,
  [int]$RefreshMinutes = 5
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$source = Join-Path $PSScriptRoot 'KindleDashboard'
$skins = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'Rainmeter\Skins'
$config = if ($Page -eq 0) { 'KindleDashboard' } else { "KindleDashboard-Pantalla$($Page + 1)" }
$target = Join-Path $skins $config
$rainmeter = @("$env:ProgramFiles\Rainmeter\Rainmeter.exe", "${env:ProgramFiles(x86)}\Rainmeter\Rainmeter.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $rainmeter) { throw 'No se encuentra Rainmeter. Instálalo con: winget install Rainmeter.Rainmeter' }

if (-not $Key) {
  $envFile = Join-Path $repo '.env'
  if (Test-Path $envFile) { $Key = (Select-String -Path $envFile -Pattern '^DASH_KEY=(.*)$').Matches.Groups[1].Value }
}
if (-not $Key) { throw 'Falta la clave: pásala con -Key o pon DASH_KEY en el .env del repo.' }

# Se copia el skin entero salvo Variables.inc, que se genera aquí y nunca se sobrescribe con el del repo.
New-Item -ItemType Directory -Force (Join-Path $target '@Resources') | Out-Null
Copy-Item (Join-Path $source 'KindleDashboard.ini') $target -Force
Copy-Item (Join-Path $source '@Resources\Variables.example.inc') (Join-Path $target '@Resources') -Force

# Rainmeter lee los .inc en UTF-16 LE sin problemas con cualquier carácter.
@"
[Variables]
ServerUrl=$($ServerUrl.TrimEnd('/'))
Key=$Key
Page=$Page
Width=$Width
Theme=$Theme
Monitor=$Monitor
Align=$Align
Margin=$Margin
UpdateRate=$($RefreshMinutes * 60)
"@ | Out-File -FilePath (Join-Path $target '@Resources\Variables.inc') -Encoding Unicode

if (-not (Get-Process Rainmeter -ErrorAction SilentlyContinue)) { Start-Process $rainmeter; Start-Sleep 3 }
& $rainmeter '!RefreshApp'
Start-Sleep 2
& $rainmeter '!ActivateConfig' $config 'KindleDashboard.ini'
Write-Output "Pantalla $($Page + 1) instalada en $target y cargada en el monitor $Monitor ($Width px de ancho, tema $Theme)."
