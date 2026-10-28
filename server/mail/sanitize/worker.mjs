import { parentPort, workerData } from 'node:worker_threads'
import { sanitize } from './core.mjs'

parentPort.postMessage(sanitize(workerData.html, workerData.opts))
