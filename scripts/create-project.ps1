param(
  [Parameter(Mandatory = $true)]
  [string]$Name,

  [Parameter(Mandatory = $true)]
  [string]$Slug,

  [string]$Out,
  [string]$AppLanguage,
  [string]$DbCollation,
  [string]$DbLocaleProvider,
  [string]$PortBase
)

$ErrorActionPreference = 'Stop'

function Suggest-Collation {
  param([string]$Language)

  switch -Regex ($Language) {
    '^(tr|TR)' { return 'tr-x-icu' }
    '^(fr|FR)' { return 'fr-x-icu' }
    '^(de|DE)' { return 'de-x-icu' }
    '^(es|ES)' { return 'es-x-icu' }
    '^(it|IT)' { return 'it-x-icu' }
    default { return 'en-x-icu' }
  }
}

function Prompt-WithDefault {
  param(
    [string]$Prompt,
    [string]$DefaultValue
  )

  $value = Read-Host "$Prompt [$DefaultValue]"
  if ([string]::IsNullOrWhiteSpace($value)) {
    return $DefaultValue
  }

  return $value
}

function Test-BinaryFile {
  param([string]$Path)

  $stream = [System.IO.File]::OpenRead($Path)
  try {
    $bufferSize = [Math]::Min(8192, [int]$stream.Length)
    if ($bufferSize -le 0) {
      return $false
    }

    $buffer = New-Object byte[] $bufferSize
    $read = $stream.Read($buffer, 0, $bufferSize)
    for ($i = 0; $i -lt $read; $i++) {
      if ($buffer[$i] -eq 0) {
        return $true
      }
    }

    return $false
  } finally {
    $stream.Dispose()
  }
}

function Update-TextFile {
  param(
    [string]$Path,
    [System.Collections.IDictionary]$Replacements
  )

  if (Test-BinaryFile -Path $Path) {
    return
  }

  $content = [System.IO.File]::ReadAllText($Path)
  $updated = $content

  foreach ($key in $Replacements.Keys) {
    $updated = $updated.Replace($key, [string]$Replacements[$key])
  }

  if ($updated -ne $content) {
    [System.IO.File]::WriteAllText($Path, $updated)
  }
}

function Rename-ProjectPaths {
  param(
    [string]$Root,
    [string]$ProjectSlug,
    [string]$ProjectUpper
  )

  Get-ChildItem -LiteralPath $Root -Recurse -Force |
    Sort-Object { $_.FullName.Length } -Descending |
    ForEach-Object {
      $newName = $_.Name.Replace('openmas', $ProjectSlug)
      $newName = $newName.Replace('OPENMAS', $ProjectUpper)
      $newName = $newName.Replace('PROJECT', $ProjectUpper)

      if ($newName -ne $_.Name) {
        $target = Join-Path $_.DirectoryName $newName
        Move-Item -LiteralPath $_.FullName -Destination $target
      }
    }
}

if ($Slug -notmatch '^[a-z0-9][a-z0-9-]*$') {
  throw 'Error: -Slug must match ^[a-z0-9][a-z0-9-]*$'
}

if ([string]::IsNullOrWhiteSpace($AppLanguage)) {
  $AppLanguage = Prompt-WithDefault -Prompt 'Primary product language / locale' -DefaultValue 'en-US'
}

if ([string]::IsNullOrWhiteSpace($DbLocaleProvider)) {
  $DbLocaleProvider = Prompt-WithDefault -Prompt 'Database locale provider' -DefaultValue 'icu'
}

if ([string]::IsNullOrWhiteSpace($DbCollation)) {
  $DbCollation = Prompt-WithDefault -Prompt 'Database collation' -DefaultValue (Suggest-Collation -Language $AppLanguage)
}

if ([string]::IsNullOrWhiteSpace($PortBase)) {
  $PortBase = Prompt-WithDefault -Prompt 'Local development starting port' -DefaultValue '7500'
}

if ($PortBase -notmatch '^[0-9]+$') {
  throw 'Error: -PortBase must be numeric.'
}

$scriptDir = Split-Path -Parent $PSCommandPath
$skeletonRoot = (Resolve-Path (Join-Path $scriptDir '..')).Path

if ([string]::IsNullOrWhiteSpace($Out)) {
  $Out = Join-Path (Split-Path -Parent $skeletonRoot) $Slug
}

$outFullPath = [System.IO.Path]::GetFullPath($Out)

if (Test-Path -LiteralPath $outFullPath) {
  throw "Error: target already exists: $outFullPath"
}

New-Item -ItemType Directory -Path $outFullPath | Out-Null

Write-Host 'Copying skeleton files...'
$robocopyArgs = @(
  $skeletonRoot,
  $outFullPath,
  '/E',
  '/XD', '.git', 'node_modules', '.turbo', 'dist', 'coverage', '.next', 'backup',
  '/XF', '.env', '.env.local',
  '/NFL', '/NDL', '/NJH', '/NJS', '/NP'
)

& robocopy @robocopyArgs | Out-Null
$robocopyExit = $LASTEXITCODE
if ($robocopyExit -ge 8) {
  throw "Error: robocopy failed with exit code $robocopyExit"
}

Remove-Item -LiteralPath (Join-Path $outFullPath '.github\.DS_Store') -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath (Join-Path $outFullPath 'docs\.DS_Store') -Force -ErrorAction SilentlyContinue

$projectUpper = $Slug.ToUpperInvariant().Replace('-', '_')

$replacements = [ordered]@{
  'Open Mas' = $Name
  'openmas' = $Slug
  'OPENMAS' = $projectUpper
  'tr-TR' = $AppLanguage
  'tr-x-icu' = $DbCollation
  'icu' = $DbLocaleProvider
  'openmas' = $Slug
  'OPENMAS' = $projectUpper
}

Write-Host 'Applying project placeholders...'
Get-ChildItem -LiteralPath $outFullPath -Recurse -Force -File |
  Where-Object {
    $_.FullName -notmatch '\\(\.git|node_modules|\.turbo|dist|coverage|\.next|backup)(\\|$)'
  } |
  ForEach-Object {
    Update-TextFile -Path $_.FullName -Replacements $replacements
  }

Write-Host 'Renaming project paths...'
Rename-ProjectPaths -Root $outFullPath -ProjectSlug $Slug -ProjectUpper $projectUpper

$projectDefaults = Join-Path $outFullPath '.project-defaults'
if (Test-Path -LiteralPath $projectDefaults) {
  $content = [System.IO.File]::ReadAllText($projectDefaults)
  $content = [regex]::Replace($content, '(?m)^DEV_PORT_BASE=.*$', "DEV_PORT_BASE=$PortBase")
  [System.IO.File]::WriteAllText($projectDefaults, $content)
}

Write-Host ''
Write-Host 'Project generated successfully.'
Write-Host "  Name: $Name"
Write-Host "  Slug: $Slug"
Write-Host "  Path: $outFullPath"
Write-Host "  App language: $AppLanguage"
Write-Host "  DB locale provider: $DbLocaleProvider"
Write-Host "  DB collation: $DbCollation"
Write-Host "  Local port base: $PortBase"
Write-Host ''
Write-Host 'Next steps:'
Write-Host "  cd `"$outFullPath`""
Write-Host '  git init'
Write-Host '  pnpm install'
