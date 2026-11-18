/* global ChromeUtils */
var { ExtensionCommon } = ChromeUtils.importESModule('resource://gre/modules/ExtensionCommon.sys.mjs')
var { AddonManager } = ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs')
// Parent-process scopes have no DOM window, so setTimeout comes from the platform module.
var { setTimeout, clearTimeout } = ChromeUtils.importESModule('resource://gre/modules/Timer.sys.mjs')

// Errors thrown here cross into the extension's scope; Thunderbird replaces any non-ExtensionError
// with "An unexpected error occurred". Every entry point therefore returns { ok, error } instead.
const TIMEOUT_MS = 20_000
const MAX_MESSAGE = 200

const clean = (error) =>
  String(error?.message ?? error ?? 'Unknown error')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_MESSAGE)

function statusMessage(status) {
  switch (status) {
    case AddonManager.UPDATE_STATUS_TIMEOUT:
      return 'The update check timed out. Check the connection and try again.'
    case AddonManager.UPDATE_STATUS_DOWNLOAD_ERROR:
      return 'Could not download the update feed. Check the connection; if it keeps failing, no release has been published for this branch yet (the "Release Thunderbird add-on" workflow creates the feed).'
    case AddonManager.UPDATE_STATUS_PARSE_ERROR:
      return 'The update feed is not valid JSON.'
    case AddonManager.UPDATE_STATUS_UNKNOWN_FORMAT:
      return 'The update feed uses an unknown format.'
    case AddonManager.UPDATE_STATUS_SECURITY_ERROR:
      return 'The update feed failed its security check.'
    case AddonManager.UPDATE_STATUS_CANCELLED:
      return 'The update check was cancelled.'
    default:
      return `The update check failed (status ${status}).`
  }
}

this.sentinelUpdates = class extends ExtensionCommon.ExtensionAPI {
  getAPI(context) {
    const manifest = context.extension.manifest
    const addonId = manifest.browser_specific_settings?.gecko?.id || context.extension.id
    const feed = manifest.browser_specific_settings?.gecko?.update_url || ''
    const repo = /^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\//.exec(feed)?.[1] ?? null

    /** Resolves to { ok, install?, version?, notes? } or { ok: false, error }. Never throws. */
    const find = async () => {
      try {
        const addon = await AddonManager.getAddonByID(addonId)
        if (!addon)
          return { ok: false, error: 'Sentinel is not registered with Thunderbird. Reinstall it from the repository.' }
        if (addon.temporarilyInstalled)
          return {
            ok: false,
            error:
              'This is a temporary developer install. Reload it from Debug Add-ons; repository updates need an installed XPI.',
          }
        if (!(addon.permissions & AddonManager.PERM_CAN_UPGRADE))
          return { ok: false, error: 'Updates for this add-on are managed by Thunderbird policy.' }
        if (!repo)
          return {
            ok: false,
            error:
              'This install has no repository update feed (pinned or unknown source). Reinstall from the branch you want to track.',
          }

        const result = await new Promise(resolve => {
          let candidate = null
          let settled = false
          let timer = null
          const finish = value => {
            if (settled) return
            settled = true
            clearTimeout(timer)
            resolve(value)
          }
          timer = setTimeout(() => finish({ kind: 'timeout' }), TIMEOUT_MS)
          try {
            addon.findUpdates(
              {
                onUpdateAvailable(_addon, install) {
                  candidate = install
                },
                onUpdateFinished(_addon, status) {
                  finish({ kind: status ? 'status' : 'done', status, candidate })
                },
              },
              AddonManager.UPDATE_WHEN_USER_REQUESTED
            )
          } catch (e) {
            finish({ kind: 'error', error: clean(e) })
          }
        })

        if (result.kind === 'timeout')
          return { ok: false, error: 'The update check timed out. Check the connection and try again.' }
        if (result.kind === 'error') return { ok: false, error: result.error }
        if (result.kind === 'status') return { ok: false, error: statusMessage(result.status) }

        const install = result.candidate
        if (install && !String(install.sourceURI?.spec ?? '').startsWith(`https://github.com/${repo}/releases/download/`))
          return { ok: false, error: 'The update package came from an unexpected source.' }
        return {
          ok: true,
          install,
          version: install?.version ?? null,
          notes: install?.releaseNotesURI?.spec ?? null,
          source: repo,
        }
      } catch (e) {
        return { ok: false, error: clean(e), source: repo }
      }
    }

    return {
      sentinelUpdates: {
        async check() {
          const found = await find()
          if (!found.ok) return { ok: false, error: found.error, source: found.source ?? repo }
          return { ok: true, version: found.version, notes: found.notes, source: repo }
        },

        async apply(version) {
          const found = await find()
          if (!found.ok) return { ok: false, error: found.error }
          const install = found.install
          if (!install || install.version !== version)
            return { ok: false, error: 'The available version changed. Check again.' }
          try {
            // Thrown from promptHandler to cancel; Thunderbird consumes it inside its own scope.
            install.promptHandler = async ({ existingAddon, addon }) => {
              if (addon.id !== addonId || addon.version !== version)
                throw new Error('Package identity or version does not match the requested update.')
              const { Extension } = ChromeUtils.importESModule('resource://gre/modules/Extension.sys.mjs')
              const extra = Extension.comparePermissions(existingAddon.userPermissions, addon.userPermissions)
              if (Object.values(extra).some(values => Array.isArray(values) && values.length))
                throw new Error('This release requests additional permissions. Review it in Thunderbird Add-ons Manager.')
            }
            await install.install()
            return { ok: true, version }
          } catch (e) {
            return { ok: false, error: clean(e) }
          }
        },
      },
    }
  }
}
