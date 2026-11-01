# Registra la tarea "KindleDashAgent": ejecuta el agente cada 5 minutos mientras el PC esté encendido y la sesión iniciada.
# Uso: powershell -ExecutionPolicy Bypass -File agent\install-task.ps1   (con -Remove para quitarla)
param([switch]$Remove, [int]$Minutes = 5)

$name = 'KindleDashAgent'
if ($Remove) {
    Unregister-ScheduledTask -TaskName $name -Confirm:$false
    "Tarea $name eliminada"
    return
}

$node = (Get-Command node).Source
$agent = Join-Path $PSScriptRoot 'agent.mjs'
if (-not (Test-Path (Join-Path $PSScriptRoot '.env'))) { throw 'Crea agent\.env a partir de agent\.env.example antes de instalar la tarea' }

# conhost --headless evita que aparezca una consola cada 5 minutos.
$action = New-ScheduledTaskAction -Execute 'conhost.exe' -Argument "--headless `"$node`" `"$agent`"" -WorkingDirectory $PSScriptRoot
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes $Minutes)
$logon = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 2) -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName $name -Action $action -Trigger @($trigger, $logon) -Settings $settings `
    -Description 'Envía uso de Claude Code, estado de Immich y dispositivos de la red local al dashboard del Kindle' -Force | Out-Null
"Tarea $name registrada (cada $Minutes min). Log: $PSScriptRoot\agent.log"
