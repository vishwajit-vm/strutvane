/**
 * Parser comparison for the registry compiler: oxc-parser vs the TypeScript 6 compiler API.
 * Parses every file of a generated 200-file project (parse only, no analysis), 1 warm-up + 7
 * measured rounds, and prints min/median per parser.
 *
 * Run: node scripts/compare-parsers.ts
 */
import { readFileSync, rmSync } from 'node:fs'
import { parseSync } from 'oxc-parser'
import ts from 'typescript'
import { discover } from '../src/discover.ts'
import { median, stressProject } from '../test/helpers.ts'

const root = stressProject(200)
try {
  const files = discover(root).files.filter((f) => f.kind !== 'page')
  const sources = files.map((f) => ({ name: f.relPath, text: readFileSync(f.absPath, 'utf8') }))
  const bytes = sources.reduce((n, s) => n + s.text.length, 0)

  const bench = (label: string, parseAll: () => void) => {
    parseAll()
    const times: number[] = []
    for (let i = 0; i < 7; i++) {
      const started = performance.now()
      parseAll()
      times.push(performance.now() - started)
    }
    return { label, min: Math.min(...times), median: median(times) }
  }

  const results = [
    bench('oxc-parser 0.158.0', () => {
      for (const s of sources) parseSync(s.name, s.text, { sourceType: 'module' })
    }),
    bench(`typescript ${ts.version} createSourceFile`, () => {
      for (const s of sources) ts.createSourceFile(s.name, s.text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
    }),
  ]
  console.log(`parsed ${sources.length} files (${(bytes / 1024).toFixed(1)} KiB) per round`)
  console.log('| Parser | min | median |')
  console.log('|---|---|---|')
  for (const r of results) console.log(`| ${r.label} | ${r.min.toFixed(1)} ms | ${r.median.toFixed(1)} ms |`)
} finally {
  rmSync(root, { recursive: true, force: true })
}
