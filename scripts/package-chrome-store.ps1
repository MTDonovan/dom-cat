Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$manifestPath = Join-Path $repoRoot 'manifest.json'
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json

if ($manifest.manifest_version -ne 3) {
  throw 'manifest.json must declare Manifest V3.'
}

$requiredFiles = @(
  'manifest.json',
  'devtools.html',
  'devtools.js',
  'sidebar.html',
  'sidebar.css',
  'sidebar.js',
  'xpath-engine.js'
)

foreach ($iconPath in $manifest.icons.psobject.Properties.Value) {
  $requiredFiles += $iconPath
}

foreach ($relativePath in $requiredFiles) {
  if (-not (Test-Path -LiteralPath (Join-Path $repoRoot $relativePath) -PathType Leaf)) {
    throw "Required extension file is missing: $relativePath"
  }
}

$distPath = Join-Path $repoRoot 'dist'
$outputPath = Join-Path $distPath "$($manifest.name.ToLowerInvariant().Replace(' ', '-'))-$($manifest.version)-chrome-store.zip"
$packageRoot = Join-Path ([System.IO.Path]::GetTempPath()) "dom-cat-package-$([System.Guid]::NewGuid())"

try {
  New-Item -ItemType Directory -Path $packageRoot | Out-Null
  New-Item -ItemType Directory -Path $distPath -Force | Out-Null

  foreach ($relativePath in $requiredFiles) {
    $destinationPath = Join-Path $packageRoot $relativePath
    $destinationDirectory = Split-Path -Parent $destinationPath
    New-Item -ItemType Directory -Path $destinationDirectory -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $repoRoot $relativePath) -Destination $destinationPath
  }

  Remove-Item -LiteralPath $outputPath -Force -ErrorAction SilentlyContinue
  Compress-Archive -Path (Join-Path $packageRoot '*') -DestinationPath $outputPath -CompressionLevel Optimal

  $archive = [System.IO.Compression.ZipFile]::OpenRead($outputPath)
  try {
    if ($null -eq $archive.GetEntry('manifest.json')) {
      throw 'The ZIP must contain manifest.json at its root.'
    }

    foreach ($relativePath in $requiredFiles) {
      $archivePath = $relativePath.Replace('\', '/')
      if ($null -eq $archive.GetEntry($archivePath)) {
        throw "The ZIP is missing required file: $archivePath"
      }
    }
  }
  finally {
    $archive.Dispose()
  }
}
finally {
  Remove-Item -LiteralPath $packageRoot -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Output "Created Chrome Web Store package: $outputPath"
