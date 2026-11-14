/**
 * What a test in a generated app looks like (Laravel's tests/Feature): build the app with a test
 * environment, refresh the database, seed, then make requests and assert.
 */
import { beforeEach, describe, it } from 'vitest'
import type { Application } from '#strutvane/foundation'
import { client, refreshDatabase } from '#strutvane/testing'
import { createApp } from '../../bootstrap/app.ts'
import { DatabaseSeeder, demoTokens } from '../../database/seeders/database.seeder.ts'

let app: Application

beforeEach(async () => {
  app = createApp({ APP_ENV: 'testing', APP_KEY: 'testing-key', DB_CONNECTION: 'sqlite', DB_DATABASE: ':memory:' })
  await refreshDatabase(app)
  await app.run(() => new DatabaseSeeder().run())
})

describe('posts', () => {
  it('lists published posts for guests', async () => {
    ;(await client(app).getJson('/api/posts')).assertStatus(200).assertJsonPath('meta.total', 3)
  })

  it('lets an author write a post', async () => {
    const response = await client(app).actingAs(demoTokens.alice).postJson('/api/posts', { title: 'My second post' })
    response.assertStatus(201).assertJsonPath('data.slug', 'my-second-post').assertJsonPath('data.status', 'draft')
  })

  it('stops other authors from editing it', async () => {
    ;(await client(app).actingAs(demoTokens.bob).patchJson('/api/posts/hello-world', { title: 'Mine now' })).assertProblem(403, 'forbidden')
  })
})
