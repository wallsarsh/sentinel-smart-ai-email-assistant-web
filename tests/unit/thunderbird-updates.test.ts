import { readFileSync } from 'node:fs'
import { createContext, runInContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

// The update experiment runs in Thunderbird's parent process. Loading it in a VM with stubs proves
// that every failure reaches the extension as a plain { ok: false, error } object. A thrown Error
// would cross the compartment boundary and become "An unexpected error occurred" in the UI.
const source = readFileSync('thunderbird/experiments/sentinel-updates/implementation.js', 'utf8')

const constants = {
  UPDATE_WHEN_USER_REQUESTED: 1,
  PERM_CAN_UPGRADE: 4,
  UPDATE_STATUS_TIMEOUT: -1,
  UPDATE_STATUS_DOWNLOAD_ERROR: -2,
  UPDATE_STATUS_PARSE_ERROR: -3,
  UPDATE_STATUS_UNKNOWN_FORMAT: -4,
  UPDATE_STATUS_SECURITY_ERROR: -5,
  UPDATE_STATUS_CANCELLED: -6,
}

const FEED = 'https://github.com/o/r/releases/download/sentinel-channel-0123456789abcdef/updates.json'

type Listener = {
  onUpdateAvailable?: (addon: object, install: object) => void
  onUpdateFinished?: (addon: object, status?: number) => void
}
type UpdateResult = { ok: boolean; version?: string | null; notes?: string | null; source?: string | null; error?: string }
type UpdateApi = { check: () => Promise<UpdateResult>; apply: (version: string) => Promise<UpdateResult> }

function load(
  findUpdates: (listener: Listener, reason: number) => void,
  addon: object = { temporarilyInstalled: false, permissions: constants.PERM_CAN_UPGRADE },
) {
  const manager = { ...constants, getAddonByID: async () => addon }
  const sandbox: Record<string, unknown> = {
    ChromeUtils: {
      importESModule: (url: string) => {
        if (url.includes('ExtensionCommon'))
          return { ExtensionCommon: { ExtensionAPI: class StubApi { getAPI() { return null } } } }
        if (url.includes('AddonManager')) return { AddonManager: manager }
        if (url.includes('Extension.sys.mjs')) return { Extension: { comparePermissions: () => ({}) } }
        throw new Error(`unexpected import ${url}`)
      },
    },
    setTimeout,
    clearTimeout,
    console,
  }
  createContext(sandbox)
  runInContext(`${source}\n;globalThis.__sentinelUpdates = this.sentinelUpdates;`, sandbox)
  const API = sandbox.__sentinelUpdates as new () => {
    getAPI: (context: unknown) => { sentinelUpdates: UpdateApi }
  }
  const context = {
    extension: {
      id: 'sentinel-spike@example.invalid',
      manifest: { browser_specific_settings: { gecko: { id: 'sentinel-spike@example.invalid', update_url: FEED } } },
    },
  }
  const api: UpdateApi = new API().getAPI(context).sentinelUpdates
  addon.findUpdates = findUpdates
  return api
}

const install = (overrides: Record<string, unknown> = {}) => ({
  version: '0.9.1',
  sourceURI: { spec: 'https://github.com/o/r/releases/download/sentinel-v0.9.1/sentinel.xpi' },
  releaseNotesURI: { spec: 'https://github.com/o/r/releases/tag/sentinel-v0.9.1' },
  async install() {},
  ...overrides,
})

describe('add-on update experiment', () => {
  it('returns the download failure as a readable result instead of throwing', async () => {
    const api = load((listener) => queueMicrotask(() => listener.onUpdateFinished({}, constants.UPDATE_STATUS_DOWNLOAD_ERROR)))
    await expect(api.check()).resolves.toMatchObject({
      ok: false,
      error: expect.stringMatching(/may not be published|download the update feed/i),
    })
  })

  it('reports an available release and its source', async () => {
    const api = load((listener) => {
      queueMicrotask(() => {
        listener.onUpdateAvailable({}, install())
        listener.onUpdateFinished({}, 0)
      })
    })
    await expect(api.check()).resolves.toEqual({
      ok: true,
      version: '0.9.1',
      notes: 'https://github.com/o/r/releases/tag/sentinel-v0.9.1',
      source: 'o/r',
    })
  })

  it('rejects a package from a different repository', async () => {
    const api = load((listener) => {
      queueMicrotask(() => {
        listener.onUpdateAvailable({}, install({ sourceURI: { spec: 'https://github.com/evil/repo/releases/download/x/a.xpi' } }))
        listener.onUpdateFinished({}, 0)
      })
    })
    await expect(api.check()).resolves.toMatchObject({ ok: false, error: /unexpected source/ })
  })

  it('turns a synchronous findUpdates error into a result', async () => {
    const api = load(() => {
      throw new Error('AddonManager exploded')
    })
    await expect(api.check()).resolves.toMatchObject({ ok: false, error: 'AddonManager exploded' })
  })

  it('explains temporary installs and policy restrictions', async () => {
    const temporary = load(() => {}, { temporarilyInstalled: true, permissions: constants.PERM_CAN_UPGRADE })
    await expect(temporary.check()).resolves.toMatchObject({ ok: false, error: /temporary developer install/i })
    const policy = load(() => {}, { temporarilyInstalled: false, permissions: 0 })
    await expect(policy.check()).resolves.toMatchObject({ ok: false, error: /policy/i })
  })

  it('applies only a version that is still available', async () => {
    const api = load((listener) => {
      queueMicrotask(() => {
        listener.onUpdateAvailable({}, install())
        listener.onUpdateFinished({}, 0)
      })
    })
    await expect(api.apply('0.9.0')).resolves.toMatchObject({ ok: false, error: /changed/ })
  })

  it('applies the matching package after checking its identity', async () => {
    let installed = false
    const packageInfo = install({
      async install() {
        installed = true
        await this.promptHandler({
          existingAddon: { userPermissions: {} },
          addon: { id: 'sentinel-spike@example.invalid', version: '0.9.1', userPermissions: {} },
        })
      },
    })
    const api = load((listener) => {
      queueMicrotask(() => {
        listener.onUpdateAvailable({}, packageInfo)
        listener.onUpdateFinished({}, 0)
      })
    })
    await expect(api.apply('0.9.1')).resolves.toEqual({ ok: true, version: '0.9.1' })
    expect(installed).toBe(true)
  })

  it('refuses a package whose identity does not match', async () => {
    const packageInfo = install({
      async install() {
        await this.promptHandler({
          existingAddon: { userPermissions: {} },
          addon: { id: 'other@example.invalid', version: '0.9.1', userPermissions: {} },
        })
      },
    })
    const api = load((listener) => {
      queueMicrotask(() => {
        listener.onUpdateAvailable({}, packageInfo)
        listener.onUpdateFinished({}, 0)
      })
    })
    await expect(api.apply('0.9.1')).resolves.toMatchObject({ ok: false, error: /identity or version/ })
  })
})
