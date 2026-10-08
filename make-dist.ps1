$src = 'C:\Users\elucscu\AppData\Local\Cline\accoglienza-invernale'
$out = $src + '\accoglienza-dist'
if (Test-Path $out) { rd $out -Recurse -Force }
md $out
Get-ChildItem -LiteralPath $src -Recurse -Force | Where-Object {
  -not $_.PSIsContainer -and
  $_.Name -notin @('node_modules', '.env.local', '.git', 'accoglienza-dist', 'make-dist.ps1', 'accoglienza-invernale.zip', '.next') -and
  $_.FullName -notlike '*accoglienza-dist\*'
} | ForEach-Object {
  $d = $_.FullName.Substring($src.Length)
  if ($_.PSIsContainer) { md (Join-Path $out $d) } else { Copy-Item $_.FullName (Join-Path $out $d) -Force }
}
$zipPath = Join-Path $src 'accoglienza-invernale.zip'
if (Test-Path $zipPath) { rm $zipPath }
$entry = [System.IO.Compression.ZipFile]::Open($zipPath, 'Create')
Get-ChildItem $src -Recurse -Force | Where-Object {
  -not $_.PSIsContainer -and
  $_.Name -notin @('node_modules', '.env.local', '.git', 'accoglienza-dist', 'make-dist.ps1', 'accoglienza-invernale.zip', '.next') -and
  $_.FullName -notlike '*accoglienza-dist\*'
} | ForEach-Object {
  $rel = $_.FullName.Substring($src.Length + 1)
  $entry.CreateEntryFromFile($_.FullName, $rel, 6)
}
$entry.Dispose()
Remove-Item $out -Recurse -Force
Write-Host 'Fatto: ' $zipPath
