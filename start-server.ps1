$env:NODE_ENV = 'production'
$env:PORT = '80'
$workingDir = 'C:\apps\drawandguess'
$nodeExe = 'C:\Program Files\nodejs\node.exe'
$serverScript = 'C:\apps\drawandguess\apps\server\src\server.ts'
$logFile = 'C:\apps\drawandguess\server.log'
$errorLog = 'C:\apps\drawandguess\server-error.log'

Start-Process -FilePath $nodeExe `
  -ArgumentList '--import','tsx/esm',$serverScript `
  -WorkingDirectory $workingDir `
  -RedirectStandardOutput $logFile `
  -RedirectStandardError $errorLog `
  -WindowStyle Hidden

Start-Sleep -Seconds 2
Write-Host "Server started. Check $logFile for output."
