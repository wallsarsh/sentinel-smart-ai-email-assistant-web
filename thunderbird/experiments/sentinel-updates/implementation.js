/* global ChromeUtils */
var { ExtensionCommon } = ChromeUtils.importESModule('resource://gre/modules/ExtensionCommon.sys.mjs')
var { AddonManager } = ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs')

// Only Thunderbird's own update for this installed add-on may be applied.
this.sentinelUpdates = class extends ExtensionCommon.ExtensionAPI {
  getAPI(context) {
    const check = async () => {
      const addon = await AddonManager.getAddonByID(context.extension.id)
      if (!addon || addon.temporarilyInstalled) throw new Error('Temporary installation. Reload the development checkout to update.')
      if (!(addon.permissions & AddonManager.PERM_CAN_UPGRADE)) throw new Error('Updates are managed by Thunderbird policy.')
      const feed = context.extension.manifest.browser_specific_settings?.gecko?.update_url
      const source = /^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/releases\/download\/sentinel-channel-[a-f0-9]{16}\/updates\.json$/.exec(feed || '')
      if (!source) throw new Error('Update source unknown or pinned. Reinstall from the branch you want to track.')
      let candidate
      await new Promise((resolve, reject) => {
        addon.findUpdates({
          onUpdateAvailable(_addon, install) { candidate = install },
          onUpdateFinished(_addon, status) {
            if (status) reject(new Error('Update check failed (' + status + '). Check the repository connection.'))
            else resolve()
          },
        }, AddonManager.UPDATE_WHEN_USER_REQUESTED)
      })
      if (candidate && !candidate.sourceURI.spec.startsWith('https://github.com/' + source[1] + '/releases/download/sentinel-v'))
        throw new Error('Update package came from an unexpected source.')
      return candidate
    }
    return { sentinelUpdates: {
      async check() {
        const install = await check()
        return { version: install?.version || null, notes: install?.releaseNotesURI?.spec || null }
      },
      async apply(version) {
        const install = await check()
        if (!install || install.version !== version) throw new Error('Available version changed. Check again.')
        install.promptHandler = async ({ existingAddon, addon }) => {
          if (addon.id !== context.extension.id || addon.version !== version)
            throw new Error('Package identity or version does not match the requested update.')
          const { Extension } = ChromeUtils.importESModule('resource://gre/modules/Extension.sys.mjs')
          const extra = Extension.comparePermissions(existingAddon.userPermissions, addon.userPermissions)
          if (Object.values(extra).some((values) => Array.isArray(values) && values.length))
            throw new Error('This release requests additional permissions. Review it in Thunderbird Add-ons Manager.')
        }
        await install.install()
      },
    } }
  }
}
