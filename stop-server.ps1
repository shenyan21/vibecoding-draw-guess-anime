$port = 80
$pids = (Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Where-Object State -eq 'Listen').OwningProcess | Sort-Object -Unique
if ($pids) {
    foreach ($pid in $pids) {
        Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
        Write-Host "Stopped process $pid listening on port $port"
    }
} else {
    Write-Host "No process found on port $port"
}
