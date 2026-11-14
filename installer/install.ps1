<#
.SYNOPSIS
  Sentinel AI for Thunderbird - Windows 11 installer.

.DESCRIPTION
  Downloads Thunderbird (ESR) from Mozilla, verifies Mozilla's published SHA-512 checksum,
  installs it for the current user (no administrator rights needed) and installs the
  Sentinel AI add-on into a Thunderbird profile. Works with Windows PowerShell 5.1 and PowerShell 7.

  The add-on package is built from the committed thunderbird\dist folder, so Node.js is NOT required.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File installer\install.ps1

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File installer\install.ps1 -DryRun
#>
[CmdletBinding()]
param(
  [ValidateSet('esr', 'release')][string]$Channel = 'esr',   # unsigned add-ons only load on ESR
  [ValidatePattern('^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$')][string]$Lang = 'en-US',
  [string]$InstallDir,            # Thunderbird + dedicated profile location
  [string]$ProfileDir,            # install the add-on into this existing profile instead
  [switch]$UseSystem,             # do not download; use the Thunderbird already installed
  [string]$XpiPath,               # use a prebuilt add-on package
  [switch]$NoLaunch,
  [switch]$Yes,                   # answer yes to questions
  [switch]$DryRun,
  [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2
try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch { }
$ProgressPreference = 'SilentlyContinue'   # Invoke-WebRequest is far faster without the progress bar

$AddonId = 'sentinel-spike@example.invalid'
$RepoRoot = Split-Path -Parent $PSScriptRoot
$DataDir = if ($InstallDir) { $InstallDir } else { Join-Path $env:LOCALAPPDATA 'SentinelThunderbird' }
$DataDir = [IO.Path]::GetFullPath($DataDir)
$AppDir = Join-Path $DataDir 'app'
$AppExe = Join-Path $AppDir 'thunderbird.exe'
$ProfilesRoot = Join-Path $env:APPDATA 'Thunderbird'
$Programs = [Environment]::GetFolderPath('Programs')
if (-not $Programs) { $Programs = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs' }
$StartMenu = Join-Path $Programs 'Thunderbird (Sentinel AI).lnk'

function Say($m) { Write-Host "* $m" }
function Fail($m) { throw $m }

function Confirm-Action($question) {
  if ($Yes) { return $true }
  if (-not [Environment]::UserInteractive) { return $false }
  $a = Read-Host "$question [y/N]"
  return ($a -match '^(y|yes)$')
}

# ---- Mozilla download -------------------------------------------------------------------------

function Resolve-Download {
  $product = if ($Channel -eq 'esr') { 'thunderbird-esr-latest' } else { 'thunderbird-latest' }
  $entry = "https://download.mozilla.org/?product=$product&os=win64&lang=$([Uri]::EscapeDataString($Lang))"
  $req = [Net.HttpWebRequest]::Create($entry)
  $req.AllowAutoRedirect = $false
  $req.Method = 'HEAD'
  $req.UserAgent = 'SentinelInstaller'
  $res = $req.GetResponse()
  try {
    $status = [int]$res.StatusCode
    $location = $res.Headers['Location']
  } finally { $res.Close() }
  if (-not $location -or $status -lt 300 -or $status -gt 399) { Fail "Mozilla did not return a download location (HTTP $status)." }
  $uri = New-Object Uri ([Uri]'https://download.mozilla.org/'), $location
  if ($uri.Scheme -ne 'https' -or $uri.Host -notmatch '(^|\.)(mozilla\.org|mozilla\.net|mozilla\.com)$') { Fail "Refusing a download from $($uri.Host)." }
  $m = [regex]::Match($uri.AbsolutePath, '/releases/([^/]+)/(.+)$')
  if (-not $m.Success) { Fail 'The download location has an unexpected shape.' }
  $key = [Uri]::UnescapeDataString($m.Groups[2].Value)
  [pscustomobject]@{ Url = $uri.AbsoluteUri; Version = $m.Groups[1].Value; Key = $key; File = ($key -split '/')[-1] }
}

function Get-ExpectedChecksum($info) {
  foreach ($pair in @(@('SHA512SUMS', 'SHA512'), @('SHA256SUMS', 'SHA256'))) {
    try {
      $text = (Invoke-WebRequest -UseBasicParsing -Uri "https://archive.mozilla.org/pub/thunderbird/releases/$($info.Version)/$($pair[0])").Content
      if ($text -is [byte[]]) { $text = [Text.Encoding]::UTF8.GetString($text) }
    } catch { continue }
    foreach ($line in ($text -split "`r?`n")) {
      $m = [regex]::Match($line.Trim(), '^([0-9a-fA-F]{64}|[0-9a-fA-F]{128})\s+\*?(.+)$')
      if ($m.Success -and $m.Groups[2].Value -eq $info.Key) {
        return [pscustomobject]@{ Algorithm = $pair[1]; Hash = $m.Groups[1].Value.ToLowerInvariant() }
      }
    }
  }
  Fail "No published checksum found for $($info.Key). Refusing to install an unverified download."
}

# ---- Profiles ---------------------------------------------------------------------------------

function Get-DefaultProfile {
  $ini = Join-Path $ProfilesRoot 'profiles.ini'
  if (-not (Test-Path $ini)) { return $null }
  $profiles = @(); $cur = $null
  foreach ($raw in (Get-Content -LiteralPath $ini)) {
    $line = $raw.Trim()
    if ($line -match '^\[(.+)\]$') {
      $cur = @{ Name = $Matches[1] }
      if ($cur.Name -match '^Profile\d+$') { $profiles += , $cur }
    } elseif ($cur -and $line.Contains('=')) {
      $i = $line.IndexOf('='); $cur[$line.Substring(0, $i)] = $line.Substring($i + 1)
    }
  }
  $pick = $profiles | Where-Object { $_.ContainsKey('Default') -and $_.Default -eq '1' } | Select-Object -First 1
  if (-not $pick) { $pick = $profiles | Where-Object { $_.ContainsKey('Name') -and $_.Name -match 'default' } | Select-Object -First 1 }
  if (-not $pick -and $profiles.Count -eq 1) { $pick = $profiles[0] }
  if (-not $pick -or -not $pick.ContainsKey('Path')) { return $null }
  $p = $pick.Path -replace '/', '\'
  if ($pick.ContainsKey('IsRelative') -and $pick.IsRelative -eq '0') { return $p }
  return (Join-Path $ProfilesRoot $p)
}

$UserJsMarker = '// Written by the Sentinel AI installer.'
$UserJsBlock = @(
  $UserJsMarker,
  '// Lets Thunderbird (ESR) load the unsigned Sentinel add-on from this profile.',
  'user_pref("xpinstall.signatures.required", false);',
  'user_pref("extensions.autoDisableScopes", 0);'
) -join "`n"

function Set-UserJs($profile) {
  $file = Join-Path $profile 'user.js'
  $existing = if (Test-Path $file) { [IO.File]::ReadAllText($file) } else { '' }
  $clean = [regex]::Replace($existing, [regex]::Escape($UserJsMarker) + '[\s\S]*?autoDisableScopes", 0\);\r?\n?', '')
  if ($clean -and -not $clean.EndsWith("`n")) { $clean += "`n" }
  [IO.File]::WriteAllText($file, $clean + $UserJsBlock + "`n", (New-Object Text.UTF8Encoding($false)))
}

# ---- Add-on package ---------------------------------------------------------------------------

# An .xpi is a zip with forward-slash entry names. Compress-Archive in Windows PowerShell 5.1 writes
# backslashes, which Thunderbird rejects, so the archive is written by hand.
function New-Xpi($out) {
  $base = Join-Path $RepoRoot 'thunderbird'
  foreach ($need in 'manifest.json', 'dist\background.js', 'experiments') {
    if (-not (Test-Path (Join-Path $base $need))) { Fail "Missing $need under $base. Run the installer from a complete checkout." }
  }
  Add-Type -AssemblyName System.IO.Compression
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  if (Test-Path $out) { Remove-Item -Force $out }
  $zip = [IO.Compression.ZipFile]::Open($out, 'Create')
  try {
    $files = @(Get-Item (Join-Path $base 'manifest.json')) +
             @(Get-ChildItem (Join-Path $base 'dist') -Recurse -File) +
             @(Get-ChildItem (Join-Path $base 'experiments') -Recurse -File)
    foreach ($f in $files) {
      $name = $f.FullName.Substring($base.Length).TrimStart('\', '/') -replace '\\', '/'
      [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $f.FullName, $name, [IO.Compression.CompressionLevel]::Optimal)
    }
  } finally { $zip.Dispose() }
  return $out
}

function Get-Xpi($work) {
  if ($XpiPath) {
    if (-not (Test-Path $XpiPath)) { Fail "Add-on package not found: $XpiPath" }
    return (Resolve-Path $XpiPath).Path
  }
  $prebuilt = Join-Path $PSScriptRoot 'sentinel-ai.xpi'
  if (Test-Path $prebuilt) { return $prebuilt }
  Say 'Packaging the Sentinel add-on...'
  return New-Xpi (Join-Path $work 'sentinel-ai.xpi')
}

# ---- Uninstall --------------------------------------------------------------------------------

function Invoke-Uninstall {
  $profile = if ($ProfileDir) { $ProfileDir } else { Join-Path $DataDir 'profile' }
  $helper = Join-Path $AppDir 'uninstall\helper.exe'
  if (Test-Path $helper) {
    Say "$(if ($DryRun) { 'Would run' } else { 'Running' }) $helper /S"
    if (-not $DryRun) { Start-Process -FilePath $helper -ArgumentList '/S' -Wait }
  }
  foreach ($t in @($AppDir, $StartMenu, (Join-Path $profile "extensions\$AddonId.xpi"))) {
    if (Test-Path $t) {
      Say "$(if ($DryRun) { 'Would remove' } else { 'Removing' }) $t"
      if (-not $DryRun) { Remove-Item -Recurse -Force $t }
    }
  }
  Say "Your mail profile was not touched: $profile"
}

# ---- Main -------------------------------------------------------------------------------------

function Find-SystemThunderbird {
  foreach ($c in @("$env:ProgramFiles\Mozilla Thunderbird\thunderbird.exe",
                   "${env:ProgramFiles(x86)}\Mozilla Thunderbird\thunderbird.exe",
                   "$env:LOCALAPPDATA\Mozilla Thunderbird\thunderbird.exe")) {
    if ($c -and (Test-Path $c)) { return $c }
  }
  return $null
}

if ($Uninstall) { Invoke-Uninstall; return }

if (-not [Environment]::Is64BitOperatingSystem) { Fail 'A 64-bit Windows is required.' }
$work = Join-Path ([IO.Path]::GetTempPath()) ("sentinel-install-" + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $work | Out-Null
try {
  # 1. Thunderbird itself
  if ($UseSystem) {
    $AppExe = Find-SystemThunderbird
    if (-not $AppExe) { Fail 'No Thunderbird found. Remove -UseSystem to download it.' }
    Say "Using the Thunderbird at $AppExe"
  } else {
    $info = Resolve-Download
    Say "Latest $($Channel.ToUpper()): Thunderbird $($info.Version) ($($info.File))"
    if ($DryRun) {
      Say "Would download $($info.Url) and install it to $AppDir"
    } elseif (Test-Path $AppExe) {
      Say "Thunderbird is already installed at $AppExe."
    } else {
      $expected = Get-ExpectedChecksum $info
      $file = Join-Path $work $info.File
      Say 'Downloading...'
      Invoke-WebRequest -UseBasicParsing -Uri $info.Url -OutFile $file
      Say "Verifying $($expected.Algorithm) checksum..."
      if ((Get-FileHash -Algorithm $expected.Algorithm -LiteralPath $file).Hash.ToLowerInvariant() -ne $expected.Hash) {
        Fail 'Checksum mismatch - the download was discarded.'
      }
      Say 'Installing Thunderbird (this takes a minute)...'
      New-Item -ItemType Directory -Force -Path $DataDir | Out-Null
      $installerArgs = @('/S', "/InstallDirectoryPath=`"$AppDir`"", '/MaintenanceService=false', '/DesktopShortcut=false', '/TaskbarShortcut=false')
      $p = Start-Process -FilePath $file -ArgumentList $installerArgs -Wait -PassThru
      if ($p.ExitCode -ne 0) { Fail "The Thunderbird installer exited with code $($p.ExitCode)." }
      for ($i = 0; $i -lt 60 -and -not (Test-Path $AppExe); $i++) { Start-Sleep -Seconds 1 }
      if (-not (Test-Path $AppExe)) { Fail 'Thunderbird was installed but thunderbird.exe was not found.' }
    }
    if ($Channel -ne 'esr') { Write-Warning 'The release channel refuses unsigned add-ons; Sentinel may stay disabled. Use -Channel esr.' }
  }

  # 2. Profile
  $profile = $null
  if ($ProfileDir) { $profile = [IO.Path]::GetFullPath($ProfileDir) }
  else {
    $existing = Get-DefaultProfile
    if ($existing -and (Test-Path $existing) -and
        (Confirm-Action "Install into your existing Thunderbird profile ($existing)?`n  This turns off add-on signature checking in that profile.")) {
      $profile = $existing
    } else { $profile = Join-Path $DataDir 'profile' }
  }
  Say "Profile: $profile"
  if ($DryRun) { Say 'Dry run - nothing was changed.'; return }
  if (Get-Process -Name thunderbird -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $profile -ne (Join-Path $DataDir 'profile') }) {
    Fail 'Thunderbird is running. Close it and run the installer again.'
  }
  New-Item -ItemType Directory -Force -Path (Join-Path $profile 'extensions') | Out-Null

  # 3. The add-on
  Copy-Item -Force -LiteralPath (Get-Xpi $work) -Destination (Join-Path $profile "extensions\$AddonId.xpi")
  Set-UserJs $profile
  Say 'Sentinel AI add-on installed.'

  # 4. Start menu shortcut
  try {
    $sh = (New-Object -ComObject WScript.Shell).CreateShortcut($StartMenu)
    $sh.TargetPath = $AppExe
    $sh.Arguments = "--profile `"$profile`""
    $sh.WorkingDirectory = Split-Path -Parent $AppExe
    $sh.Description = 'Thunderbird with the Sentinel AI assistant'
    $sh.Save()
    Say 'Start menu shortcut: Thunderbird (Sentinel AI)'
  } catch { Write-Warning "Could not create the Start menu shortcut: $($_.Exception.Message)" }

  Write-Host ''
  Write-Host 'Done. Next steps:'
  Write-Host '  1. In Thunderbird add your mail account (if the profile is new).'
  Write-Host '  2. Open the Sentinel toolbar button > Provider settings, add your AI provider and choose a model.'
  if (-not $NoLaunch) {
    Say 'Starting Thunderbird...'
    Start-Process -FilePath $AppExe -ArgumentList @('--profile', "`"$profile`"")
  }
} catch {
  Write-Host ''
  Write-Host "x $($_.Exception.Message)" -ForegroundColor Red
  exit 1
} finally {
  Remove-Item -Recurse -Force $work -ErrorAction SilentlyContinue
}
