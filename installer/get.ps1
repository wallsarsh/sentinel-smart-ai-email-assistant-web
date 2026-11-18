<#
.SYNOPSIS
  One-line bootstrap for the Sentinel AI Windows installer.

.DESCRIPTION
  Meant to be run straight from GitHub:

    irm https://raw.githubusercontent.com/wallsarsh/sentinel-smart-ai-email-assistant-web/main/installer/get.ps1 | iex

  It downloads a small zip from GitHub into a temporary folder, then runs installer\install.ps1
  from it (which downloads Thunderbird ESR, verifies Mozilla's checksum and installs the add-on).
  The temporary folder is deleted afterwards.

  The zip is not the whole repository: .gitattributes marks everything except installer\ and
  thunderbird\{manifest.json,dist,experiments} as export-ignore, so the download is roughly
  150 KB instead of several MB. Nothing else is needed to install.

  Options for install.ps1 (-Yes, -DryRun, -NoLaunch, -Uninstall, -Channel, -Lang, -InstallDir,
  -ProfileDir, -UseSystem) can be given in either of two ways:

    # 1. an environment variable (works with the one-liner)
    $env:SENTINEL_ARGS = '-Yes -NoLaunch'; irm <url> | iex

    # 2. a script block (note the parentheses)
    & ([scriptblock]::Create((irm <url>))) -Yes -NoLaunch

  Other environment variables:
    SENTINEL_REF    branch, tag or commit to install from (default: main)
    SENTINEL_ZIP_URL  download this zip instead of the GitHub archive (mirror, or an internal copy)
    SENTINEL_REPO   owner/name of the GitHub repository (default: wallsarsh/sentinel-smart-ai-email-assistant-web)

  There is deliberately no param() block: that does not work when the text is piped to iex.
#>

& {
  $ErrorActionPreference = 'Stop'
  $ProgressPreference = 'SilentlyContinue'
  try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch { }

  $repo = if ($env:SENTINEL_REPO) { $env:SENTINEL_REPO } else { 'wallsarsh/sentinel-smart-ai-email-assistant-web' }
  $ref = if ($env:SENTINEL_REF) { $env:SENTINEL_REF } else { 'main' }
  if ($repo -notmatch '^[A-Za-z0-9._-]+/[A-Za-z0-9._-]+$') { throw "Invalid SENTINEL_REPO '$repo'." }
  if ($ref -notmatch '^[A-Za-z0-9._/-]+$') { throw "Invalid SENTINEL_REF '$ref'." }

  # Turn "-Yes -ProfileDir C:\x -Lang de" (from $args and/or $env:SENTINEL_ARGS) into a splattable hashtable.
  # Splatting a plain string array would pass '-Yes' as a positional value, not as a switch.
  $tokens = @($args) + @(if ($env:SENTINEL_ARGS) { $env:SENTINEL_ARGS -split '\s+' | Where-Object { $_ } })
  $allowed = @('Channel', 'Lang', 'InstallDir', 'ProfileDir', 'UseSystem', 'XpiPath', 'NoLaunch', 'Yes', 'Force', 'DryRun', 'Uninstall')
  $opts = @{}
  for ($i = 0; $i -lt $tokens.Count; $i++) {
    $t = [string]$tokens[$i]
    if ($t -notmatch '^-([A-Za-z]+)$' -or $allowed -notcontains $Matches[1]) { throw "Unknown option '$t'. Allowed: $($allowed -join ', ')." }
    $name = $Matches[1]
    if ($i + 1 -lt $tokens.Count -and ([string]$tokens[$i + 1]) -notmatch '^-[A-Za-z]') { $opts[$name] = [string]$tokens[++$i] }
    else { $opts[$name] = $true }
  }

  if ($PSVersionTable.PSVersion.Major -ge 6 -and -not $IsWindows) { throw 'This installer is for Windows.' }

  $work = Join-Path ([IO.Path]::GetTempPath()) ('sentinel-get-' + [Guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $work | Out-Null
  try {
    $branchInfo = $null
    $archiveRef = $ref
    if (-not $env:SENTINEL_ZIP_URL) {
      try {
        $item = Invoke-RestMethod -UseBasicParsing -Uri "https://api.github.com/repos/$repo/branches/$([Uri]::EscapeDataString($ref))" -ErrorAction Stop
        if ($item.name -ceq $ref -and $item.commit.sha -match '^[0-9a-f]{40}$') { $branchInfo = $item; $archiveRef = $item.commit.sha }
      } catch { Write-Host '* Branch metadata unavailable. Installing as a pinned package.' }
    }
    $zip = Join-Path $work 'repo.zip'
    $url = if ($env:SENTINEL_ZIP_URL) { $env:SENTINEL_ZIP_URL } else { "https://codeload.github.com/$repo/zip/$archiveRef" }
    Write-Host "* Downloading $repo@$ref ..."
    try { Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $zip }
    catch { throw "Could not download $url ($($_.Exception.Message)). The repository must be public and the branch/tag must exist." }
    Write-Host "* Downloaded $([math]::Round((Get-Item -LiteralPath $zip).Length / 1KB)) KB."

    Write-Host '* Unpacking...'
    $src = Join-Path $work 'src'
    Expand-Archive -LiteralPath $zip -DestinationPath $src -Force
    $root = Get-ChildItem -LiteralPath $src -Directory | Select-Object -First 1
    $script = if ($root) { Join-Path $root.FullName 'installer\install.ps1' } else { $null }
    if (-not $script -or -not (Test-Path -LiteralPath $script)) { throw 'installer\install.ps1 was not found in the downloaded repository.' }

    if ($branchInfo) {
      $env:SENTINEL_BUILD_REPO = $repo
      $env:SENTINEL_BUILD_BRANCH = $branchInfo.name
      $env:SENTINEL_BUILD_COMMIT = $branchInfo.commit.sha
    }
    try { & $script @opts }
    finally {
      Remove-Item Env:SENTINEL_BUILD_REPO, Env:SENTINEL_BUILD_BRANCH, Env:SENTINEL_BUILD_COMMIT -ErrorAction SilentlyContinue
    }
    if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { throw "The installer failed (exit code $LASTEXITCODE)." }
  } finally {
    Remove-Item -Recurse -Force -LiteralPath $work -ErrorAction SilentlyContinue
  }
} @args
