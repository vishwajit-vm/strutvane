/** Spawns the server and the load generator in separate processes and collects event-loop stats. */
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const fixtures = fileURLToPath(new URL('../test/fixtures/', import.meta.url))

export interface ElResult {
  mode: string
  p50: number
  p99: number
  max: number
  mean: number
  served: number
  rps: number
  errors: number
}

async function get(port: number, path: string): Promise<string> {
  const res = await fetch(`http://127.0.0.1:${port}${path}`)
  return res.text()
}

export async function runEventLoop(mode: 'none' | 'strutvane' | 'pino', durationMs: number, concurrency: number): Promise<ElResult> {
  const dir = mkdtempSync(join(tmpdir(), 'sv-el-'))
  const server = spawn(process.execPath, [join(fixtures, 'el-server.ts'), mode, dir], { stdio: ['ignore', 'pipe', 'inherit'] })
  try {
    const port = await new Promise<number>((resolve, reject) => {
      let buf = ''
      server.stdout.on('data', (d: Buffer) => {
        buf += d.toString()
        const m = /PORT (\d+)/.exec(buf)
        if (m) resolve(Number(m[1]))
      })
      server.once('exit', (code) => reject(new Error(`server exited early (${code})`)))
    })
    // Warm-up so JIT and file opening are not part of the measurement.
    await runLoad(port, 500, concurrency)
    await get(port, '/__start')
    const load = await runLoad(port, durationMs, concurrency)
    const stats = JSON.parse(await get(port, '/__stats')) as Omit<ElResult, 'mode' | 'rps' | 'errors'>
    return { mode, ...stats, rps: load.rps, errors: load.errors }
  } finally {
    server.kill()
    await new Promise((r) => setTimeout(r, 200))
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
}

function runLoad(port: number, durationMs: number, concurrency: number): Promise<{ requests: number; errors: number; rps: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(fixtures, 'load-gen.ts'), String(port), String(durationMs), String(concurrency)], { stdio: ['ignore', 'pipe', 'inherit'] })
    let out = ''
    child.stdout.on('data', (d: Buffer) => {
      out += d.toString()
    })
    child.once('exit', (code) => {
      if (code !== 0) reject(new Error(`load generator failed (${code})`))
      else resolve(JSON.parse(out.trim()) as { requests: number; errors: number; rps: number })
    })
  })
}

export function medianBy<T>(items: T[], key: (t: T) => number): T {
  const sorted = [...items].sort((a, b) => key(a) - key(b))
  return sorted[Math.floor(sorted.length / 2)] as T
}
