param()
$ErrorActionPreference = 'Stop'
Push-Location (Split-Path $PSScriptRoot -Parent)
try { npm.cmd run test:integration; if ($LASTEXITCODE -ne 0) { throw 'Fallaron las pruebas Node.js.' } } finally { Pop-Location }
