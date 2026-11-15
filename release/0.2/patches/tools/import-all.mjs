// Import every exports subpath of the given packages from the app in cwd (Node ESM resolution).
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
const appUrl = pathToFileURL(join(process.cwd(), 'x.mjs'))
let bad = 0
for (const name of process.argv.slice(2)) {
  const pkg = JSON.parse(readFileSync(join(process.cwd(), 'node_modules', name, 'package.json'), 'utf8'))
  const optional = new Set(Object.keys(pkg.peerDependenciesMeta ?? {}))
  for (const sub of Object.keys(pkg.exports ?? {})) {
    if (sub.endsWith('.json')) continue
    const spec = sub === '.' ? name : `${name}/${sub.slice(2)}`
    try {
      const resolved = import.meta.resolve(spec)
      await import(resolved)
      console.log(`ok    ${spec}`)
    } catch (e) {
      const m = /Cannot find (?:package|module) '([^']+)'/.exec(String(e.message))
      const missing = m?.[1]?.replace(/^(@[^/]+\/[^/]+|[^@/][^/]*).*$/, '$1')
      const why = missing && optional.has(missing) ? `needs optional peer ${missing}` : String(e.message).split('\n')[0]
      const fail = !(missing && optional.has(missing))
      if (fail) bad++
      console.log(`${fail ? 'FAIL ' : 'peer '} ${spec}: ${why}`)
    }
  }
}
process.exit(bad ? 1 : 0)
