import { migration } from '#strutvane/schema'

/** Blog posts. The slug is built from the title by the CRUD layer when the client doesn't send one. */
export default migration({
  up(schema) {
    schema.create('posts', (t) => {
      t.id()
      t.string('title', 200)
      t.slug('slug').from('title')
      t.text('body').nullable()
      t.enum('status', ['draft', 'published']).default('draft').index()
      t.foreignId('author_id').constrained('authors').cascadeOnDelete()
      t.timestamp('published_at').nullable()
      t.timestamps()
      t.softDeletes()
    })
  },
  down(schema) {
    schema.dropIfExists('posts')
  },
})
