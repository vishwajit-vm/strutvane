/**
 * Deterministic demo data for the blog app (spike 10's fixture schema), so the dev server and the
 * UI tests show realistic lists: several pages of posts, relations, NULLs and soft-deleted rows.
 *
 * Deterministic (no randomness, fixed dates) so a test can say "page 2 starts with X".
 *
 * @module
 */
import { slugify } from '../shared/slug.ts'
import type { MockApi } from './mock-api.ts'

/** Fixed origin for seeded timestamps: one row per hour going back from here. */
const SEED_ORIGIN = Date.parse('2026-11-01T09:00:00.000Z')
const HOUR = 60 * 60 * 1000

const USERS = [
  { name: 'Asha Rao', email: 'asha@example.com' },
  { name: 'Ben Okafor', email: 'ben@example.com' },
  { name: 'Chen Li', email: 'chen@example.com' },
] as const

const CATEGORIES = ['Engineering', 'Design', 'Product', 'Company news'] as const

const TOPICS = ['Shipping', 'Testing', 'Pricing', 'Hiring', 'Roadmap', 'Security', 'Onboarding', 'Billing', 'Search', 'Theming'] as const
const ANGLES = ['notes', 'in practice', 'lessons learned', 'a checklist'] as const

const TAGS = ['news', 'how-to', 'release', 'opinion', 'deep-dive', 'video', 'beginner', 'advanced', 'case-study', 'interview', 'tips', 'faq'] as const

/** How many posts the seed creates: enough for several pages at every page size but 100. */
export const SEEDED_POST_COUNT = 37

/**
 * Fill a mock API with the demo data. Only tables that exist in the metadata are seeded.
 *
 * @example
 * const api = createMockApi(metadata)
 * seedBlog(api)
 */
export function seedBlog(api: MockApi): void {
  const at = (hoursAgo: number): string => new Date(SEED_ORIGIN - hoursAgo * HOUR).toISOString()
  const users = api.table('users')
  USERS.forEach((user, index) => users?.insertRaw({ ...user, password: 'never-returned', created_at: at(500 + index), updated_at: at(500 + index) }))

  const categories = api.table('categories')
  CATEGORIES.forEach((name, index) => categories?.insertRaw({ name, slug: slugify(name), created_at: at(400 + index), updated_at: at(400 + index) }))

  const posts = api.table('posts')
  for (let index = 0; index < SEEDED_POST_COUNT; index++) {
    posts?.insertRaw(seedPost(index, at(index)))
  }

  const tags = api.table('tags')
  TAGS.forEach((name, index) => tags?.insertRaw({ name, position: index + 1 }))
}

/** Post number `index`: varied enough to exercise every column type, filter and NULL. */
function seedPost(index: number, createdAt: string): Record<string, string | number | boolean | null> {
  const topic = TOPICS[index % TOPICS.length] ?? 'Notes'
  const angle = ANGLES[Math.floor(index / TOPICS.length) % ANGLES.length] ?? 'notes'
  const title = `${topic}: ${angle}`
  return {
    title,
    slug: slugify(title),
    content: `A short post about ${topic.toLowerCase()}.`,
    price: ((index * 7) % 50).toFixed(2),
    status: index % 3 === 0 ? 'draft' : 'published',
    author_id: (index % USERS.length) + 1,
    featured: index % 5 === 0,
    published_on: index % 3 === 0 ? null : `2026-10-${String((index % 28) + 1).padStart(2, '0')}`,
    meta: null,
    created_at: createdAt,
    updated_at: createdAt,
    // Two posts start in the trash, so the "Deleted" filter has something to show.
    deleted_at: index === 4 || index === 11 ? createdAt : null,
    subtitle: index % 4 === 0 ? null : `Part ${index + 1}`,
    category_id: index % 6 === 5 ? null : (index % CATEGORIES.length) + 1,
  }
}
