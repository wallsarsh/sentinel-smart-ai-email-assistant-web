import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

type Step = {
  run?: string
  uses?: string
  env?: Record<string, string>
  with?: Record<string, unknown>
}
type Job = {
  needs?: string | string[]
  if?: string
  environment?: string
  permissions?: Record<string, string>
  steps?: Step[]
  uses?: string
}
const wf = (n: string) =>
  parse(readFileSync(`.github/workflows/${n}.yml`, 'utf8')) as {
    on: Record<string, unknown>
    permissions?: Record<string, string>
    jobs: Record<string, Job>
  }

describe('release workflow', () => {
  const r = wf('release')
  it('runs only for version tags, with read-only default permissions', () => {
    expect(Object.keys(r.on)).toEqual(['push'])
    expect((r.on.push as { tags: string[] }).tags).toEqual([
      'v[0-9]+.[0-9]+.[0-9]+',
      'v[0-9]+.[0-9]+.[0-9]+-rc.[0-9]+',
    ])
    expect(r.permissions).toEqual({ contents: 'read' })
  })

  it('goes checks → image → staging → production, and production needs approval and skips release candidates', () => {
    expect(r.jobs.checks!.uses).toBe('./.github/workflows/ci.yml')
    expect(r.jobs.image!.needs).toBe('checks')
    expect(r.jobs.staging!.needs).toBe('image')
    expect(r.jobs.staging!.environment).toBe('staging')
    expect(r.jobs.production!.needs).toEqual(['image', 'staging'])
    expect(r.jobs.production!.environment).toBe('production')
    expect(r.jobs.production!.if).toContain('-rc.')
  })

  it('only the image job can write packages; the image carries the version tag, never latest; maps are stored as an artifact', () => {
    for (const [name, j] of Object.entries(r.jobs))
      if (name !== 'image') expect(j.permissions?.packages, name).toBeUndefined()
    expect(r.jobs.image!.permissions!.packages).toBe('write')
    const text = readFileSync('.github/workflows/release.yml', 'utf8')
    expect(text.replaceAll('ubuntu-latest', '')).not.toMatch(/latest/)
    expect(text).toContain('--target sourcemaps')
    expect(text).toMatch(/upload-artifact@v4[\s\S]*sourcemaps-/)
    expect(text).toContain('merge-base --is-ancestor')
  })

  it.each(['release', 'rollback'])(
    '%s never puts workflow expressions inside shell commands (no script injection)',
    (name) => {
      for (const [job, j] of Object.entries(wf(name).jobs))
        for (const s of j.steps ?? [])
          if (s.run) expect(s.run, `${job}: ${s.run}`).not.toContain('${{')
    },
  )
})

describe('rollback workflow', () => {
  const r = wf('rollback')
  it("is manual, validates the tag, uses that tag's manifests and the chosen environment", () => {
    expect(Object.keys(r.on)).toEqual(['workflow_dispatch'])
    const job = r.jobs.rollback!
    expect(job.environment).toBe('${{ inputs.environment }}')
    expect(job.steps![0]!.with!.ref).toBe('${{ inputs.version }}')
    expect(job.steps!.some((s) => s.run?.includes('grep -Eq'))).toBe(true)
  })
})

describe('CI is reusable by the release', () => {
  it('declares workflow_call', () => expect(Object.keys(wf('ci').on)).toContain('workflow_call'))
})

// deploy.sh against a fake kubectl that records what it is asked to do.
function run(args: string[], o: { failWait?: boolean } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'deploy-'))
  const log = join(dir, 'calls.log')
  writeFileSync(
    join(dir, 'kubectl'),
    `#!/usr/bin/env bash
echo "$*" >> "${log}"
if [[ "$*" == *"apply -f -"* ]]; then cat > "${dir}/applied.yaml"; fi
if [[ "$*" == *"wait --for=condition=complete"* && "${o.failWait ? '1' : ''}" == "1" ]]; then exit 1; fi
exit 0
`,
  )
  chmodSync(join(dir, 'kubectl'), 0o755)
  const r = spawnSync('bash', ['deploy/deploy.sh', ...args], {
    env: { PATH: `${dir}:${process.env.PATH}`, ROLLOUT_TIMEOUT: '5s' },
    encoding: 'utf8',
  })
  const calls = (() => {
    try {
      return readFileSync(log, 'utf8').trim().split('\n')
    } catch {
      return []
    }
  })()
  const applied = (() => {
    try {
      return readFileSync(join(dir, 'applied.yaml'), 'utf8')
    } catch {
      return ''
    }
  })()
  return { code: r.status, out: r.stdout + r.stderr, calls, applied }
}

describe('deploy/deploy.sh', () => {
  const image = 'ghcr.io/acme/sentinel:v1.4.0'

  it('migrates first, then rolls web, then the worker, each waiting for its rollout', () => {
    const r = run(['sentinel-staging', image])
    expect(r.code).toBe(0)
    expect(r.calls).toEqual([
      '-n sentinel-staging delete job sentinel-migrate --ignore-not-found --wait=true',
      '-n sentinel-staging apply -f - --selector app.kubernetes.io/component=migrate',
      '-n sentinel-staging wait --for=condition=complete job/sentinel-migrate --timeout=5s',
      `-n sentinel-staging set image deployment/sentinel-web web=${image}`,
      '-n sentinel-staging rollout status deployment/sentinel-web --timeout=5s',
      `-n sentinel-staging set image deployment/sentinel-worker worker=${image}`,
      '-n sentinel-staging rollout status deployment/sentinel-worker --timeout=5s',
    ])
    expect(r.applied).toContain(`image: ${image}`)
    expect(r.applied).not.toContain('image: IMAGE')
  })

  it('a failed migration stops everything: no image is changed and the exit code is non-zero', () => {
    const r = run(['sentinel-prod', image], { failWait: true })
    expect(r.code).toBe(1)
    expect(r.calls.some((c) => c.includes('set image'))).toBe(false)
    expect(r.out).toContain('migration failed')
  })

  it.each([
    'ghcr.io/acme/sentinel:latest',
    'ghcr.io/acme/sentinel',
    'registry:5000/sentinel',
    'sentinel:',
  ])('refuses %s (needs an explicit tag or digest) before touching the cluster', (bad) => {
    const r = run(['ns', bad])
    expect(r.code).toBe(2)
    expect(r.calls).toEqual([])
  })

  it.each([
    'ghcr.io/acme/sentinel@sha256:' + 'a'.repeat(64),
    'registry:5000/sentinel:v2',
    'sentinel:v1',
  ])('accepts %s', (good) => {
    expect(run(['ns', good]).code).toBe(0)
  })

  it('needs both arguments', () => {
    expect(run([]).code).not.toBe(0)
    expect(run(['ns']).code).not.toBe(0)
  })
})

describe('source maps stay out of the image', () => {
  const d = readFileSync('Dockerfile', 'utf8')
  it('are moved into their own stage and deleted from the runtime files', () => {
    expect(d).toMatch(/find \.output dist -name '\*\.map' -delete/)
    expect(d).toContain('FROM scratch AS sourcemaps')
  })
})
