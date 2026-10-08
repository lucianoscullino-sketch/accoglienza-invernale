# Prepara l'archivio in dist2/, poi lo comprimi in accoglienza-invernale.zip
# (senza node_modules, .env.local e file di sviluppo)
$src = 'C:\Users\elucscu\AppData\Local\Cline\accoglienza-invernale'
$dist = $src + '\dist2'
if (Test-Path $dist) { rd $dist -Recurse -Force }
md $dist
Get-ChildItem $src -Directory | Where-Object { $_.Name -notin @('node_modules', 'accoglienza-dist', 'make-dist.ps1', 'count.ps1', '.next') } | ForEach-Object {
  Copy-Item $_.FullName $dist -Recurse -Force
}
Get-ChildItem -LiteralPath $src -Force | Where-Object {
  -not $_.PSIsContainer -and $_.Name -notin @('node_modules', '.env.local', '.git', 'accoglienza-dist', 'make-dist.ps1', 'count.ps1', 'accoglienza-invernale.zip', '.next', 'lint.log', 'winget.log')
} | ForEach-Object { Copy-Item $_.FullName $dist -Force }
$zipPath = Join-Path $src 'accoglienza-invernale.zip'
if (Test-Path $zipPath) { rm $zipPath }
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($dist, $zipPath)
Remove-Item $dist -Recurse -Force
Write-Host 'Fatto: ' $zipPath
