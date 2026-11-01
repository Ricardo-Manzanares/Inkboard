# Registra la tarea "InkboardServer": arranca el servidor de Inkboard al iniciar sesión en Windows.
# Solo para el modo local (mientras no esté en Railway). Uso:
#   powershell -ExecutionPolicy Bypass -File server\install-task.ps1          (registrar)
#   powershell -ExecutionPolicy Bypass -File server\install-task.ps1 -Remove  (quitar)
param([switch]$Remove)

$name = 'InkboardServer'
if ($Remove) {
    Unregister-ScheduledTask -TaskName $name -Confirm:$false
    "Tarea $name eliminada"
    return
}

$root = Split-Path $PSScriptRoot -Parent
if (-not (Test-Path (Join-Path $root '.env'))) { throw "Falta $root\.env con DASH_KEY e INGEST_TOKEN" }
$node = (Get-Command node).Source
New-Item -ItemType Directory -Force (Join-Path $root 'data') | Out-Null

# conhost --headless evita la ventana de consola; cmd /c redirige la salida al log.
$cmd = "`"$node`" server\index.js >> data\server.log 2>&1"
$action = New-ScheduledTaskAction -Execute 'conhost.exe' -Argument "--headless cmd.exe /c $cmd" -WorkingDirectory $root
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
# Sin límite de tiempo y con reinicio automático si el proceso se cae.
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Settings $settings `
    -Description 'Servidor local de Inkboard (puerto 3000)' -Force | Out-Null
"Tarea $name registrada: arranca al iniciar sesión. Log: $root\data\server.log"
