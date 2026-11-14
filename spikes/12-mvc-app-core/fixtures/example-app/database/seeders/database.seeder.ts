import { hashToken } from '#strutvane/auth'
import { Author } from '../../app/models/author.ts'
import { Post } from '../../app/models/post.ts'

/**
 * Development-only bearer tokens for the seeded authors. Real tokens are random, shown once and
 * stored hashed; these are fixed so the tests and the README examples can use them.
 */
export const demoTokens = {
  admin: 'demo-admin-token',
  alice: 'demo-alice-token',
  bob: 'demo-bob-token',
} as const

/** Seeds three authors and a few posts. Laravel's DatabaseSeeder. */
export class DatabaseSeeder {
  async run(): Promise<void> {
    // `api_token` is not part of `NewAuthor` on purpose (secret columns can't be mass-assigned
    // through typed `create`), so the seeder uses the explicit "already validated" path.
    const admin = await Author.createFromValidated({ name: 'Ada Admin', email: 'ada@example.test', is_admin: true, api_token: hashToken(demoTokens.admin) })
    const alice = await Author.createFromValidated({ name: 'Alice Writer', email: 'alice@example.test', bio: 'Writes about TypeScript.', api_token: hashToken(demoTokens.alice) })
    const bob = await Author.createFromValidated({ name: 'Bob Reader', email: 'bob@example.test', api_token: hashToken(demoTokens.bob) })
    await Post.create({ title: 'Hello World', body: 'The first post.', status: 'published', author_id: alice.id })
    await Post.create({ title: 'Routing like Laravel', body: 'Route.resource gives you seven routes.', status: 'published', author_id: alice.id })
    await Post.create({ title: 'Alice draft', body: 'Not ready yet.', status: 'draft', author_id: alice.id })
    await Post.create({ title: 'Bob on policies', body: 'Deny by default.', status: 'published', author_id: bob.id })
    await Post.create({ title: 'Admin notes', status: 'draft', author_id: admin.id })
  }
}
