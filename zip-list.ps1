$zip = 'C:\Users\elucscu\AppData\Local\Cline\accoglienza-invernale\accoglienza-invernale.zip'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$entries = [System.IO.Compression.ZipFile]::Open($zip, 'Read').Entries
Write-Host 'file count: ' $entries.Count
$entries | Select-Object -First 40 | ForEach-Object { Write-Host $_.FullName }
