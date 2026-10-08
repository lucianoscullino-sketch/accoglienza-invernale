$src = "C:\Users\elucscu\AppData\Local\Cline\accoglienza-invernale"
$c = 0
Get-ChildItem -LiteralPath $src -Recurse -Force | Where-Object {
  -not $_.PSIsContainer -and
  $_.Name -notin @('node_modules', '.env.local', '.git', 'accoglienza-dist', 'make-dist.ps1', 'accoglienza-invernale.zip', '.next') -and
  $_.FullName -notlike '*accoglienza-dist\*'
} | ForEach-Object { $c++ }
Write-Host "count=$c"
