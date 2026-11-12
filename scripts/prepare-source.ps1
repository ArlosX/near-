$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$releaseRoot = Join-Path $projectRoot 'artifacts/local/release'
$stageRoot = Join-Path $releaseRoot ('source-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $stageRoot -Force | Out-Null
$folders = @('apps','contracts','docs','packages','scripts','supabase','tests','.cargo')
$files = @('LICENSE','README.md','package.json','pnpm-lock.yaml','pnpm-workspace.yaml','tsconfig.json','.gitignore','.env.example')
$inventory = @()
foreach ($folder in $folders) {
    $folderPath = Join-Path $projectRoot $folder
    if (!(Test-Path -LiteralPath $folderPath)) { continue }
    $inventory += Get-ChildItem -LiteralPath $folderPath -File -Recurse -Force |
        Where-Object { $_.FullName -notmatch '[\\/](node_modules|target|\.git|artifacts|coverage|dist)[\\/]' -and $_.Name -notmatch '^\.env(?:\.|$)' -and $_.Extension -notin @('.log','.sqlite','.db','.pem','.key') }
}
foreach ($file in $files) { $inventory += Get-Item -LiteralPath (Join-Path $projectRoot $file) -Force }
foreach ($item in $inventory) {
    $relative = $item.FullName.Substring($projectRoot.Length + 1)
    if ($relative.StartsWith('..')) { throw 'Source entry escaped project root' }
    $destination = Join-Path $stageRoot $relative
    New-Item -ItemType Directory -Path (Split-Path $destination -Parent) -Force | Out-Null
    Copy-Item -LiteralPath $item.FullName -Destination $destination
}
$manifest = $inventory | ForEach-Object { [PSCustomObject]@{path=$_.FullName.Substring($projectRoot.Length + 1);sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()} }
$manifest | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath (Join-Path $stageRoot 'SOURCE-MANIFEST.json') -Encoding utf8
$archive = $stageRoot + '.zip'
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression
$zip = [IO.Compression.ZipFile]::Open($archive,[IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($entryFile in Get-ChildItem -LiteralPath $stageRoot -File -Recurse -Force) {
        # Portable ZIP entry paths, including dotfiles; no Windows backslashes.
        $entryName = $entryFile.FullName.Substring($stageRoot.Length + 1).Replace('\','/')
        [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip,$entryFile.FullName,$entryName,[IO.Compression.CompressionLevel]::Optimal) | Out-Null
    }
} finally { $zip.Dispose() }
Write-Output "Prepared offline source archive: $archive"
Write-Output "Files: $($inventory.Count). Environment credentials, local artifacts and dependencies excluded. Review the archive before publishing; no upload performed."
