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

.NOTES
  Safe to run again at any time. If Sentinel is already installed the script compares what is installed
  with this version and changes only what differs: Thunderbird is upgraded only when Mozilla's ESR is
  newer, and the add-on is rewritten only when its files differ. Nothing to do means nothing is touched.
  -DryRun reports what would change. -Force rewrites the add-on regardless.
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
  [switch]$Force,                 # rewrite the add-on even when it is already up to date
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
$StateFile = Join-Path $DataDir 'state.json'
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
  $repo = $env:SENTINEL_BUILD_REPO
  $branch = $env:SENTINEL_BUILD_BRANCH
  $commit = $env:SENTINEL_BUILD_COMMIT
  if (-not $repo -and (Test-Path (Join-Path $RepoRoot '.git')) -and (Get-Command git -ErrorAction SilentlyContinue)) {
    $remote = (git -C $RepoRoot remote get-url origin 2>$null) -replace '\.git$', ''
    if ($remote -match '^(?:https://github\.com/|git@github\.com:)([\w.-]+/[\w.-]+)$') {
      $repo = $Matches[1]
      $branch = git -C $RepoRoot symbolic-ref --short HEAD 2>$null
      $commit = git -C $RepoRoot rev-parse HEAD 2>$null
    }
  }
  $tracked = $repo -match '^[\w.-]+/[\w.-]+$' -and $branch -and $commit -match '^[0-9a-f]{40}$'
  $zip = [IO.Compression.ZipFile]::Open($out, 'Create')
  try {
    $files = @(Get-Item (Join-Path $base 'manifest.json')) +
             @(Get-ChildItem (Join-Path $base 'dist') -Recurse -File) +
             @(Get-ChildItem (Join-Path $base 'experiments') -Recurse -File)
    foreach ($f in $files) {
      $name = $f.FullName.Substring($base.Length).TrimStart('\', '/') -replace '\\', '/'
      if ($tracked -and $name -eq 'manifest.json') {
        $channel = [BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($branch))).Replace('-', '').Substring(0,16).ToLowerInvariant()
        $manifest = Get-Content $f.FullName -Raw | ConvertFrom-Json
        $manifest.browser_specific_settings.gecko | Add-Member -Force -NotePropertyName update_url -NotePropertyValue "https://github.com/$repo/releases/download/sentinel-channel-$channel/updates.json"
        $writer = [IO.StreamWriter]::new($zip.CreateEntry('manifest.json').Open())
        try { $writer.Write(($manifest | ConvertTo-Json -Depth 20)) } finally { $writer.Dispose() }
        $writer = [IO.StreamWriter]::new($zip.CreateEntry('source.json').Open())
        try { $writer.Write((@{repo=$repo; branch=$branch; commit=$commit} | ConvertTo-Json)) } finally { $writer.Dispose() }
        continue
      }
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

# ---- Upgrade support --------------------------------------------------------------------------
# What is installed is compared with what would be installed, by content. Zip timestamps differ on
# every build, so the archives themselves are never compared - only the SHA-256 of each entry.

function Get-XpiMap($path) {
  Add-Type -AssemblyName System.IO.Compression
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $map = @{}
  $zip = [IO.Compression.ZipFile]::OpenRead($path)
  try {
    foreach ($e in $zip.Entries) {
      if ($e.FullName.EndsWith('/')) { continue }
      $stream = $e.Open()
      $sha = [Security.Cryptography.SHA256]::Create()
      try { $map[$e.FullName] = ([BitConverter]::ToString($sha.ComputeHash($stream)) -replace '-', '').ToLowerInvariant() }
      finally { $sha.Dispose(); $stream.Dispose() }
    }
  } finally { $zip.Dispose() }
  return $map
}

function Get-XpiVersion($path) {
  try {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [IO.Compression.ZipFile]::OpenRead($path)
    try {
      $entry = $zip.GetEntry('manifest.json')
      $reader = New-Object IO.StreamReader($entry.Open())
      try { return [string](($reader.ReadToEnd() | ConvertFrom-Json).version) } finally { $reader.Dispose() }
    } finally { $zip.Dispose() }
  } catch { return $null }
}

# Returns Added / Changed / Removed name lists. A missing or unreadable installed package counts as everything added.
function Compare-Addon($newXpi, $installedXpi) {
  $new = Get-XpiMap $newXpi
  $old = @{}
  if ($installedXpi -and (Test-Path -LiteralPath $installedXpi)) {
    try { $old = Get-XpiMap $installedXpi } catch { Write-Warning "The installed add-on could not be read and will be replaced: $($_.Exception.Message)" }
  }
  $added = @($new.Keys | Where-Object { -not $old.ContainsKey($_) } | Sort-Object)
  $changed = @($new.Keys | Where-Object { $old.ContainsKey($_) -and $old[$_] -ne $new[$_] } | Sort-Object)
  $removed = @($old.Keys | Where-Object { -not $new.ContainsKey($_) } | Sort-Object)
  [pscustomobject]@{ Added = $added; Changed = $changed; Removed = $removed; Same = (($added.Count + $changed.Count + $removed.Count) -eq 0) }
}

function Write-Diff($diff) {
  foreach ($group in @(@('added', $diff.Added), @('changed', $diff.Changed), @('removed', $diff.Removed))) {
    $names = @($group[1])
    if ($names.Count -eq 0) { continue }
    $shown = ($names | Select-Object -First 8) -join ', '
    $more = if ($names.Count -gt 8) { " (+$($names.Count - 8) more)" } else { '' }
    Say "  $($group[0]) $($names.Count): $shown$more"
  }
}

# "153.7.0esr" / "153.7.0" -> [version]; $null when it cannot be read.
function ConvertTo-TbVersion($text) {
  if (-not $text) { return $null }
  $m = [regex]::Match([string]$text, '^\s*(\d+(\.\d+){1,3})')
  if ($m.Success) { return [version]$m.Groups[1].Value }
  return $null
}

# application.ini ships in the app folder and reads the same on every OS; the exe's version info is the fallback.
function Get-InstalledTbVersion {
  $ini = Join-Path $AppDir 'application.ini'
  if (Test-Path -LiteralPath $ini) {
    $line = Get-Content -LiteralPath $ini | Where-Object { $_ -match '^Version=' } | Select-Object -First 1
    if ($line) { $v = ConvertTo-TbVersion ($line -replace '^Version=', ''); if ($v) { return $v } }
  }
  if (Test-Path -LiteralPath $AppExe) {
    try { return (ConvertTo-TbVersion ([Diagnostics.FileVersionInfo]::GetVersionInfo($AppExe).ProductVersion)) } catch { }
  }
  return $null
}

function Get-State {
  if (-not (Test-Path -LiteralPath $StateFile)) { return $null }
  try { return (Get-Content -Raw -LiteralPath $StateFile | ConvertFrom-Json) } catch { return $null }
}

function Save-State($profile, $tbVersion, $addonVersion) {
  New-Item -ItemType Directory -Force -Path $DataDir | Out-Null
  $state = [ordered]@{
    profile = $profile; thunderbird = "$tbVersion"; addon = "$addonVersion"
    updated = (Get-Date).ToUniversalTime().ToString('o')
  }
  $tmp = "$StateFile.tmp"
  [IO.File]::WriteAllText($tmp, ($state | ConvertTo-Json), (New-Object Text.UTF8Encoding($false)))
  Move-Item -Force -LiteralPath $tmp -Destination $StateFile
}

# Where an earlier run put the add-on, so a re-run updates it instead of asking again.
function Find-InstalledProfile {
  $rel = "extensions\$AddonId.xpi"
  $state = Get-State
  if ($state -and $state.profile -and (Test-Path -LiteralPath (Join-Path $state.profile $rel))) { return [string]$state.profile }
  $dedicated = Join-Path $DataDir 'profile'
  if (Test-Path -LiteralPath (Join-Path $dedicated $rel)) { return $dedicated }
  $default = Get-DefaultProfile
  if ($default -and (Test-Path -LiteralPath (Join-Path $default $rel))) { return $default }
  return $null
}

function Test-ThunderbirdRunning([bool]$anyCopy) {
  $procs = @(Get-Process -Name thunderbird -ErrorAction SilentlyContinue)
  if (-not $anyCopy) { $procs = @($procs | Where-Object { $_.Path -and $_.Path -eq $AppExe }) }
  return ($procs.Count -gt 0)
}

# ---- Uninstall --------------------------------------------------------------------------------

function Invoke-Uninstall {
  $profile = if ($ProfileDir) { $ProfileDir } elseif ($found = Find-InstalledProfile) { $found } else { Join-Path $DataDir 'profile' }
  $helper = Join-Path $AppDir 'uninstall\helper.exe'
  if (Test-Path $helper) {
    Say "$(if ($DryRun) { 'Would run' } else { 'Running' }) $helper /S"
    if (-not $DryRun) { Start-Process -FilePath $helper -ArgumentList '/S' -Wait }
  }
  foreach ($t in @($AppDir, $StartMenu, $StateFile, (Join-Path $profile "extensions\$AddonId.xpi"))) {
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
$changes = 0
try {
  # 1. Thunderbird: install when missing, upgrade when Mozilla's build is newer, otherwise leave alone.
  $tbVersion = $null
  $tbAction = 'none'          # none | install | upgrade
  $info = $null
  if ($UseSystem) {
    $AppExe = Find-SystemThunderbird
    if (-not $AppExe) { Fail 'No Thunderbird found. Remove -UseSystem to download it.' }
    $AppDir = Split-Path -Parent $AppExe
    $tbVersion = Get-InstalledTbVersion
    Say "Using the Thunderbird at $AppExe"
  } else {
    $installed = if (Test-Path -LiteralPath $AppExe) { Get-InstalledTbVersion } else { $null }
    try {
      $info = Resolve-Download
    } catch {
      if (-not (Test-Path -LiteralPath $AppExe)) { throw }
      Write-Warning "Could not check Mozilla for a newer Thunderbird ($($_.Exception.Message)). Keeping the installed one."
    }
    if (-not (Test-Path -LiteralPath $AppExe)) {
      $tbAction = 'install'
      Say "Thunderbird $($info.Version) will be installed."
    } elseif ($info) {
      $latest = ConvertTo-TbVersion $info.Version
      if ($installed -and $latest -and $installed -lt $latest) {
        $tbAction = 'upgrade'
        Say "Thunderbird $installed -> $latest will be upgraded."
      } else {
        Say "Thunderbird $installed is up to date (latest $($Channel.ToUpper()): $($info.Version))."
      }
    } else { Say "Thunderbird $installed is installed." }
    $tbVersion = if ($tbAction -eq 'none') { $installed } else { ConvertTo-TbVersion $info.Version }
    if ($Channel -ne 'esr') { Write-Warning 'The release channel refuses unsigned add-ons; Sentinel may stay disabled. Use -Channel esr.' }
  }

  # 2. Profile: reuse the one an earlier run used; only ask when this is a first install.
  $profile = $null
  if ($ProfileDir) { $profile = [IO.Path]::GetFullPath($ProfileDir) }
  elseif ($found = Find-InstalledProfile) { $profile = $found; Say "Sentinel is already installed in $profile" }
  else {
    $existing = Get-DefaultProfile
    if ($existing -and (Test-Path $existing) -and
        (Confirm-Action "Install into your existing Thunderbird profile ($existing)?`n  This turns off add-on signature checking in that profile.")) {
      $profile = $existing
    } else { $profile = Join-Path $DataDir 'profile' }
  }
  Say "Profile: $profile"
  $dedicatedProfile = ($profile -eq (Join-Path $DataDir 'profile'))

  # 3. Add-on: compare content with what is installed.
  $xpi = Get-Xpi $work
  $target = Join-Path $profile "extensions\$AddonId.xpi"
  $diff = Compare-Addon $xpi $target
  $newVer = Get-XpiVersion $xpi
  $oldVer = if (Test-Path -LiteralPath $target) { Get-XpiVersion $target } else { $null }
  $addonChange = (-not $diff.Same) -or $Force
  $userJsOk = $false
  $uj = Join-Path $profile 'user.js'
  if (Test-Path -LiteralPath $uj) { $userJsOk = ([IO.File]::ReadAllText($uj)).Contains($UserJsBlock) }
  if (-not (Test-Path -LiteralPath $target)) { Say "Sentinel add-on $newVer will be installed." }
  elseif ($diff.Same -and -not $Force) { Say "Sentinel add-on $oldVer is up to date." }
  else {
    Say "Sentinel add-on $oldVer -> $newVer$(if ($diff.Same) { ' (forced)' } else { '' }):"
    Write-Diff $diff
  }

  $needClose = ($tbAction -eq 'upgrade') -or $addonChange
  if ($DryRun) {
    $todo = @()
    if ($tbAction -ne 'none') { $todo += "$tbAction Thunderbird" }
    if ($addonChange) { $todo += 'update the add-on' }
    if (-not $userJsOk) { $todo += 'update user.js' }
    Say $(if ($todo.Count) { "Dry run - would: $($todo -join ', ')." } else { 'Dry run - already up to date, nothing to do.' })
    return
  }
  if ($needClose -and (Test-ThunderbirdRunning (-not $dedicatedProfile))) {
    Fail 'Thunderbird is running. Close it and run the installer again.'
  }

  # 4. Apply only what differs.
  if ($tbAction -ne 'none') {
    $expected = Get-ExpectedChecksum $info
    $file = Join-Path $work $info.File
    Say 'Downloading Thunderbird...'
    Invoke-WebRequest -UseBasicParsing -Uri $info.Url -OutFile $file
    Say "Verifying $($expected.Algorithm) checksum..."
    if ((Get-FileHash -Algorithm $expected.Algorithm -LiteralPath $file).Hash.ToLowerInvariant() -ne $expected.Hash) {
      Fail 'Checksum mismatch - the download was discarded.'
    }
    Say "$(if ($tbAction -eq 'upgrade') { 'Upgrading' } else { 'Installing' }) Thunderbird (this takes a minute)..."
    New-Item -ItemType Directory -Force -Path $DataDir | Out-Null
    $installerArgs = @('/S', "/InstallDirectoryPath=`"$AppDir`"", '/MaintenanceService=false', '/DesktopShortcut=false', '/TaskbarShortcut=false')
    $p = Start-Process -FilePath $file -ArgumentList $installerArgs -Wait -PassThru
    if ($p.ExitCode -ne 0) { Fail "The Thunderbird installer exited with code $($p.ExitCode)." }
    for ($i = 0; $i -lt 60 -and -not (Test-Path $AppExe); $i++) { Start-Sleep -Seconds 1 }
    if (-not (Test-Path $AppExe)) { Fail 'Thunderbird was installed but thunderbird.exe was not found.' }
    $changes++
  }

  New-Item -ItemType Directory -Force -Path (Join-Path $profile 'extensions') | Out-Null
  if ($addonChange) {
    # Write beside the target, then rename, so a crash never leaves a half-written add-on behind.
    $tmp = "$target.new"
    Copy-Item -Force -LiteralPath $xpi -Destination $tmp
    if (Test-Path -LiteralPath $target) { Copy-Item -Force -LiteralPath $target -Destination (Join-Path $profile 'sentinel-previous.xpi') }
    Move-Item -Force -LiteralPath $tmp -Destination $target
    Say 'Sentinel AI add-on updated.'
    $changes++
  }
  if (-not $userJsOk) { Set-UserJs $profile; Say 'Profile settings (user.js) updated.'; $changes++ }

  # 5. Shortcut and state: rewritten only when they differ.
  $wantArgs = "--profile `"$profile`""
  try {
    $sh = New-Object -ComObject WScript.Shell
    $current = if (Test-Path -LiteralPath $StartMenu) { $sh.CreateShortcut($StartMenu) } else { $null }
    if (-not $current -or $current.TargetPath -ne $AppExe -or $current.Arguments -ne $wantArgs) {
      $link = $sh.CreateShortcut($StartMenu)
      $link.TargetPath = $AppExe
      $link.Arguments = $wantArgs
      $link.WorkingDirectory = Split-Path -Parent $AppExe
      $link.Description = 'Thunderbird with the Sentinel AI assistant'
      $link.Save()
      Say 'Start menu shortcut: Thunderbird (Sentinel AI)'
      $changes++
    }
  } catch { Write-Warning "Could not create the Start menu shortcut: $($_.Exception.Message)" }

  $state = Get-State
  if (-not $state -or $state.profile -ne $profile -or $state.addon -ne "$newVer" -or $state.thunderbird -ne "$tbVersion") {
    Save-State $profile $tbVersion $newVer
  }

  Write-Host ''
  if ($changes -eq 0) { Say 'Already up to date - nothing was changed.' }
  elseif ($oldVer) { Say "Updated. Restart Thunderbird to load the new add-on." }
  else {
    Write-Host 'Done. Next steps:'
    Write-Host '  1. In Thunderbird add your mail account (if the profile is new).'
    Write-Host '  2. Open the Sentinel toolbar button > Provider settings, add your AI provider and choose a model.'
  }
  # Launch unless asked not to, or unless nothing changed and it is already running.
  if (-not $NoLaunch -and -not ($changes -eq 0 -and (Test-ThunderbirdRunning $true))) {
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
