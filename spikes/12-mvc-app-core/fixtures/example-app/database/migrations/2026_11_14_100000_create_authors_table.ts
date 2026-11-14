import { migration } from '#strutvane/schema'

/**
 * Authors write posts and are also the people who sign in to the API.
 * `api_token` holds a SHA-256 hash of the bearer token, never the token itself.
 */
export default migration({
  up(schema) {
    schema.create('authors', (t) => {
      t.id()
      t.string('name', 100)
      t.string('email').unique()
      t.text('bio').nullable()
      t.boolean('is_admin').default(false)
      t.string('api_token', 64).nullable().unique()
      t.timestamps()
    })
  },
  down(schema) {
    schema.dropIfExists('authors')
  },
})
