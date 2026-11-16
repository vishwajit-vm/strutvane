// Minimal Markdown → printable HTML for the delivery plan (headings, lists, tables, code, bold, links).
import { readFileSync, writeFileSync } from 'node:fs'

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const inline = (s) =>
  esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*]+)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')

const src = readFileSync(process.argv[2], 'utf8').replace(/```mermaid[\s\S]*?```/, '*(The Gantt chart renders on GitHub; the month-by-month table above shows the same timeline.)*')
const lines = src.split(/\r?\n/)
const out = []
let i = 0
while (i < lines.length) {
  const line = lines[i]
  if (/^```/.test(line)) {
    const buf = []
    i++
    while (i < lines.length && !/^```/.test(lines[i])) buf.push(esc(lines[i++]))
    i++
    out.push(`<pre>${buf.join('\n')}</pre>`)
    continue
  }
  const h = /^(#{1,4})\s+(.*)$/.exec(line)
  if (h) { out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); i++; continue }
  if (/^---\s*$/.test(line)) { out.push('<hr>'); i++; continue }
  if (/^\|/.test(line)) {
    const rows = []
    while (i < lines.length && /^\|/.test(lines[i])) rows.push(lines[i++])
    const cells = (r) => r.replace(/^\||\|$/g, '').split('|').map((c) => c.trim())
    const head = cells(rows[0])
    const body = rows.slice(2).map(cells)
    out.push(`<table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`)
    continue
  }
  if (/^\s*(-|\d+\.)\s+/.test(line)) {
    const ordered = /^\s*\d+\./.test(line)
    const items = []
    while (i < lines.length && /^\s*(-|\d+\.)\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*(-|\d+\.)\s+/, ''))
    out.push(`<${ordered ? 'ol' : 'ul'}>${items.map((t) => `<li>${inline(t)}</li>`).join('')}</${ordered ? 'ol' : 'ul'}>`)
    continue
  }
  if (line.trim() === '') { i++; continue }
  const para = []
  while (i < lines.length && lines[i].trim() !== '' && !/^(#|\||```|\s*-\s|\s*\d+\.\s|---)/.test(lines[i])) para.push(lines[i++])
  out.push(`<p>${inline(para.join(' '))}</p>`)
}

writeFileSync(process.argv[3], `<!doctype html><html><head><meta charset="utf-8"><title>Strutvane delivery plan</title><style>
body{font-family:'Segoe UI',Arial,sans-serif;font-size:10.5pt;line-height:1.45;color:#111;margin:0}
h1{font-size:20pt;border-bottom:2px solid #333;padding-bottom:4px;margin-top:0}
h2{font-size:15pt;margin-top:22px;border-bottom:1px solid #ccc;padding-bottom:2px}
h3{font-size:12pt;margin-top:16px}
table{border-collapse:collapse;width:100%;margin:8px 0 12px;font-size:9pt}
tr{page-break-inside:avoid}
th,td{border:1px solid #bbb;padding:4px 6px;text-align:left;vertical-align:top}
th{background:#eef1f5}
code{background:#f3f3f3;padding:0 3px;border-radius:3px;font-size:9pt}
pre{background:#f6f6f6;padding:8px;font-size:8.5pt;white-space:pre-wrap}
a{color:#1a4fbf;text-decoration:none}
@page{size:A4;margin:14mm}
</style></head><body>${out.join('\n')}</body></html>`)
