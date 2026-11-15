/**
 * Spike 13's installer reads `src/data/catalogue.json` (format 1). These tests pin down exactly
 * how it relates to format 2, both ways:
 * - format 2 projected to format 1 is accepted by spike 13's own parser (the superset claim);
 * - spike 13's fixture, read as format 2, differs in exactly the listed ways.
 *
 * Spike 13 is imported read-only; nothing in it is changed.
 */
import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { parseCatalogue } from '../../13-installer-v2/src/catalogue.ts'
import { CatalogueIndexError, parseCatalogueIndex } from '../src/catalogue/index-schema.ts'
import { compareWithV1, toV1 } from '../src/catalogue/v1-compat.ts'
import { seedIndex } from './helpers.ts'

const fixtureUrl = new URL('../../13-installer-v2/src/data/catalogue.json', import.meta.url)
const fixture = async (): Promise<Record<string, unknown> & { entries: { id: string; package: string; name: string }[] }> =>
  JSON.parse(await readFile(fixtureUrl, 'utf8')) as Record<string, unknown> & { entries: { id: string; package: string; name: string }[] }

describe('format 2 is a superset spike 13 can switch to', () => {
  it('projects the seed index to format 1, accepted by spike 13\'s parser with nothing skipped', async () => {
    const seed = await seedIndex()
    const { catalogue, dropped } = toV1(seed)
    const parsed = parseCatalogue(catalogue)
    expect(parsed.skipped).toEqual([])
    expect(parsed.catalogue.entries.map((e) => e.id)).toEqual(catalogue.entries.map((e) => e.id))
    // Format 1 has single-choice follow-ups only; these entries need the new installer.
    expect(dropped).toEqual([
      'activity-log: has a confirm question, which format 1 cannot express',
      'billing: has a confirm question, which format 1 cannot express',
      'inspector: has a confirm question, which format 1 cannot express',
      'invoicing: has a text question, which format 1 cannot express',
      'notification-channels: has a multiselect question, which format 1 cannot express',
      'observability: has a confirm question, which format 1 cannot express',
      'social-login: has a multiselect question, which format 1 cannot express',
      'translations: has a text question, which format 1 cannot express',
    ])
  })

  it('copies every v1 field from the v2 entry unchanged (no field is renamed or recomputed)', async () => {
    const seed = await seedIndex()
    for (const v1 of toV1(seed).catalogue.entries) {
      const v2 = seed.entries.find((entry) => entry.id === v1.id)
      expect(v2).toMatchObject({ ...v1, followUps: v1.followUps.map((question) => ({ ...question, type: 'select' })) })
    }
  })
})

describe('spike 13\'s current fixture, read as format 2', () => {
  it('is refused as a whole, with a version message (old readers likewise refuse format 2)', async () => {
    const raw = await fixture()
    expect(() => parseCatalogueIndex(raw)).toThrow(CatalogueIndexError)
    expect(() => parseCatalogueIndex(raw)).toThrow('The catalogue index has format version 1; this reader understands 2.')
    // And spike 13's reader refuses a format 2 file outright, so nobody reads it by accident.
    expect(() => parseCatalogue(JSON.parse(JSON.stringify(Object.assign({}, { ...raw, version: 2 }))))).toThrow('unknown version')
  })

  it('differs in exactly these structural ways (every entry passes the v2 rules once filled)', async () => {
    expect(compareWithV1(await fixture())).toEqual([
      'file: "version" is 1; format 2 needs 2',
      'file: unknown field "note"',
      'file: missing "generator"',
      'file: missing "manifestVersion"',
      'file: missing "frameworkLines"',
      'file: missing "history"',
      'categories: missing "pickable" on every category',
      'entries: every entry is missing kind, origin, tags, docs, version, verified, versions, compatibility, requires, conflicts, installs, status',
      'entries: follow-up questions have no "type" (format 2 says "select", "multiselect", "confirm" or "text")',
    ])
  })

  it('differs from the catalogue v2 package list in exactly these entries', async () => {
    const seed = await seedIndex()
    const seedPackage = new Map(seed.entries.map((entry) => [entry.id, entry.package]))
    const fixtureEntries = (await fixture()).entries
    expect(fixtureEntries.filter((e) => seedPackage.get(e.id) !== e.package).map((e) => `${e.id}: ${e.package} → ${seedPackage.get(e.id) ?? 'not in catalogue v2'}`)).toEqual([
      'log-viewer: @strutvane/logs → @strutvane/log-viewer',
      'backups: @strutvane/backups → not in catalogue v2',
      'ai-sdk: @strutvane/ai → not in catalogue v2',
      'sitemap: @strutvane/sitemap → not in catalogue v2',
      'geocoder: @strutvane/geocoder → not in catalogue v2',
      'virus-scanner: @strutvane/virus-scanner → not in catalogue v2',
      'calendar: @strutvane/calendar → not in catalogue v2',
      'legacy-exports: @strutvane/legacy-exports → not in catalogue v2',
      'spreadsheets: @strutvane/spreadsheets → not in catalogue v2',
    ])
    const inFixture = new Set(fixtureEntries.map((e) => e.package))
    expect(seed.entries.filter((e) => e.kind === 'package' && !inFixture.has(e.package)).map((e) => e.id)).toEqual([
      'agent-tools', 'auth', 'backup', 'browser-testing', 'cms', 'create-strutvane', 'dashboards', 'files', 'form-builder',
      'framework', 'geo', 'log-viewer', 'mail-templates', 'oauth-server', 'observability', 'payments', 'redis', 'resource-views',
      'social-login', 'sso', 'strutvane', 'ui',
    ])
  })
})
