import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parse, parseAllDocuments } from 'yaml'

const read = (p: string) => readFileSync(p, 'utf8')
const dockerfile = read('Dockerfile')

describe('Dockerfile', () => {
  it('is multi-stage, runs as the unprivileged node user and has a readiness health check', () => {
    expect(dockerfile.match(/^FROM /gm)!.length).toBeGreaterThanOrEqual(3)
    const lastUser = [...dockerfile.matchAll(/^USER (\S+)/gm)].at(-1)![1]
    expect(lastUser).toBe('node')
    expect(dockerfile).toMatch(/HEALTHCHECK[\s\S]*\/api\/ready/)
    expect(dockerfile).toMatch(/ENV NODE_ENV=production/)
    expect(dockerfile).toContain('CMD ["node", ".output/server/index.mjs"]')
  })

  it('installs only production dependencies in the runtime image and copies no source or secrets', () => {
    expect(dockerfile).toMatch(/npm ci --omit=dev/)
    const runtime = dockerfile.slice(dockerfile.lastIndexOf('FROM '))
    expect(runtime).not.toMatch(/COPY \. |COPY --from=build \/app\/(server|app|tests|\.env)/)
    expect(dockerfile).not.toMatch(/^(ENV|ARG) .*(SECRET|PASSWORD|TOKEN|KEK|PRIVATE)/im)
  })

  it('.dockerignore keeps env files, git history and tests out of the build context', () => {
    const ig = read('.dockerignore').split('\n')
    for (const p of ['.env', '.env.*', '.git', 'node_modules', 'tests']) expect(ig).toContain(p)
  })

  it('the worker and migrate commands the image runs are built by the build stage', () => {
    expect(dockerfile).toContain('node tools/build-worker.mjs')
    const tool = read('tools/build-worker.mjs')
    expect(tool).toMatch(/worker: 'worker\/index\.ts'/)
    expect(tool).toMatch(/migrate: 'server\/db\/migrate\.ts'/)
    expect(tool).toMatch(/cpSync\('server\/db\/migrations', 'dist\/migrations'/)
  })

  it('build-time-only packages are not production dependencies', () => {
    const pkg = JSON.parse(read('package.json')) as { dependencies: Record<string, string> }
    for (const p of ['nuxt', 'vue', 'vue-router', 'pinia', 'nuxt-security', 'playwright', 'vitest'])
      expect(pkg.dependencies[p], p).toBeUndefined()
    // what the worker imports at run time must be there
    for (const p of ['drizzle-orm', 'pg', 'pino', 'zod', 'imapflow', 'web-push', 'nodemailer'])
      expect(pkg.dependencies[p], p).toBeDefined()
  })
})

describe('compose', () => {
  const c = parse(read('deploy/compose.yml')) as {
    services: Record<string, Record<string, unknown>>
    'x-app': Record<string, unknown>
  }
  it('migrates before web and worker start, and hardens them', () => {
    expect(c['x-app'].depends_on).toEqual({
      migrate: { condition: 'service_completed_successfully' },
    })
    expect(c.services.migrate!.command).toEqual(['node', 'dist/migrate.mjs'])
    expect(c.services.migrate!.restart).toBe('no')
    expect(
      (c.services.migrate!.depends_on as Record<string, { condition: string }>).postgres!.condition,
    ).toBe('service_healthy')
    expect(c.services.worker!.command).toEqual(['node', 'dist/worker.mjs'])
    for (const name of ['web', 'worker'] as const) {
      const svc = c.services[name]!
      expect(svc.read_only ?? c['x-app'].read_only, name).toBe(true)
      expect(svc.cap_drop ?? c['x-app'].cap_drop, name).toEqual(['ALL'])
      expect(svc.security_opt ?? c['x-app'].security_opt, name).toContain('no-new-privileges:true')
      expect(JSON.stringify(svc.deploy), name).toMatch(/memory/)
    }
  })

  it('exposes only the web port, on localhost for a proxy, and puts no secret in the file', () => {
    expect(c.services.web!.ports).toEqual(['127.0.0.1:3000:3000'])
    expect(c.services.postgres!.ports).toBeUndefined()
    const text = read('deploy/compose.yml')
    expect(text).toMatch(/POSTGRES_PASSWORD: \$\{POSTGRES_PASSWORD:\?/) // required, no default
    expect(text).not.toMatch(/SESSION_SECRET|KEK_BASE64/)
  })
})

describe('deploy/.env.example', () => {
  const env = Object.fromEntries(
    read('deploy/.env.example')
      .split('\n')
      .filter((l) => /^[A-Z0-9_]+=/.test(l))
      .map((l) => [l.split('=')[0]!, l.slice(l.indexOf('=') + 1)]),
  )
  it('leaves every secret empty and uses obvious placeholders elsewhere', () => {
    for (const k of [
      'SESSION_SECRET',
      'KEK_BASE64',
      'VAPID_PRIVATE_KEY',
      'GOOGLE_CLIENT_SECRET',
      'MS_CLIENT_SECRET',
      'POSTGRES_PASSWORD',
      'METRICS_TOKEN',
    ])
      expect(env[k], k).toBe('')
    expect(env.NODE_ENV).toBe('production')
    expect(env.BASE_URL).toMatch(/^https:\/\//)
  })
  it('lists every variable the config reads', () => {
    const cfg = read('server/config/index.ts')
    const names = [...cfg.matchAll(/^\s+([A-Z][A-Z0-9_]+): z/gm)]
      .map((m) => m[1]!)
      .filter((n) => n !== 'NODE_ENV')
    for (const n of names) expect(Object.keys(env), n).toContain(n)
  })
})

describe('Kubernetes manifests', () => {
  type Doc = {
    kind: string
    metadata: { name: string }
    spec: Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
  }
  const docs = parseAllDocuments(read('deploy/k8s/sentinel.yaml')).map((d) => d.toJS() as Doc)
  const byKind = (k: string) => docs.filter((d) => d.kind === k)
  const podSpec = (d: Doc) =>
    (d.kind === 'Job' ? d.spec.template.spec : d.spec.template.spec) as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

  it('has migrate Job, web and worker Deployments, a Service and a PodDisruptionBudget', () => {
    expect(docs.map((d) => `${d.kind}/${d.metadata.name}`)).toEqual([
      'Job/sentinel-migrate',
      'Deployment/sentinel-web',
      'Deployment/sentinel-worker',
      'Service/sentinel-web',
      'PodDisruptionBudget/sentinel-web',
    ])
  })

  it('every workload runs non-root with a read-only filesystem, no privilege escalation, no capabilities, and limits', () => {
    for (const d of [...byKind('Job'), ...byKind('Deployment')]) {
      const pod = podSpec(d)
      expect(pod.securityContext.runAsNonRoot, d.metadata.name).toBe(true)
      expect(pod.securityContext.seccompProfile.type).toBe('RuntimeDefault')
      for (const c of pod.containers) {
        expect(c.securityContext.readOnlyRootFilesystem, c.name).toBe(true)
        expect(c.securityContext.allowPrivilegeEscalation, c.name).toBe(false)
        expect(c.securityContext.capabilities.drop, c.name).toEqual(['ALL'])
        expect(c.resources.limits.memory, c.name).toBeTruthy()
        expect(c.resources.requests.cpu, c.name).toBeTruthy()
        expect(c.image).toBe('IMAGE')
        // configuration comes from the Secret, never from literal values in the manifest
        expect(c.envFrom).toEqual([{ secretRef: { name: 'sentinel-env' } }])
        expect(c.env).toBeUndefined()
      }
    }
  })

  it('web has startup, readiness and liveness probes on the right endpoints and rolls without downtime', () => {
    const web = byKind('Deployment').find((d) => d.metadata.name === 'sentinel-web')!
    const c = podSpec(web).containers[0]
    expect(c.readinessProbe.httpGet.path).toBe('/api/ready')
    expect(c.livenessProbe.httpGet.path).toBe('/api/health')
    expect(c.startupProbe.httpGet.path).toBe('/api/health')
    expect(web.spec.strategy.rollingUpdate).toEqual({ maxUnavailable: 0, maxSurge: 1 })
    expect(web.spec.replicas).toBeGreaterThanOrEqual(2)
    expect(byKind('PodDisruptionBudget')[0]!.spec.minAvailable).toBe(1)
  })

  it('migrations and the worker use the same image with their own commands', () => {
    const job = byKind('Job')[0]!
    expect(podSpec(job).containers[0].command).toEqual(['node', 'dist/migrate.mjs'])
    expect(podSpec(job).restartPolicy).toBe('Never')
    const worker = byKind('Deployment').find((d) => d.metadata.name === 'sentinel-worker')!
    expect(podSpec(worker).containers[0].command).toEqual(['node', 'dist/worker.mjs'])
  })

  it('the Service selects the web pods', () => {
    const svc = byKind('Service')[0]!
    const web = byKind('Deployment').find((d) => d.metadata.name === 'sentinel-web')!
    for (const [k, v] of Object.entries(svc.spec.selector))
      expect(web.spec.template.metadata.labels[k]).toBe(v)
  })
})
