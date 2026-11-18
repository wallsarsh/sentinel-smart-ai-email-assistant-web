// Run inside the checked-out release branch. GitHub hosts both the authenticated
// HTTPS update feed and immutable-by-version package assets for this repository.
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { buildXpi } from './package-xpi.mjs'
const { GITHUB_REPOSITORY: repo, GITHUB_REF_NAME: branch, GITHUB_SHA: commit, ADDON_VERSION: version } = process.env
if (!repo || !branch || !commit || !/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Invalid release coordinates')
const id = 'sentinel-spike@example.invalid'
const channel = createHash('sha256').update(branch).digest('hex').slice(0, 16)
buildXpi('.', 'out/sentinel.xpi', { source: { repo, branch, commit }, version })
const digest = createHash('sha256').update(readFileSync('out/sentinel.xpi')).digest('hex')
const tag = 'sentinel-v' + version
const update = { version, update_link: `https://github.com/${repo}/releases/download/${tag}/sentinel.xpi`, update_hash: 'sha256:' + digest,
  applications: { gecko: { strict_min_version: '140.0' } } }
writeFileSync('out/updates.json', JSON.stringify({ addons: { [id]: { updates: [update] } } }))
writeFileSync('out/channel', 'sentinel-channel-' + channel)
