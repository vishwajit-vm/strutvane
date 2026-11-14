import { migration } from '#strutvane/schema'

export default migration({
  up(schema) {
    schema.create('labels', (t) => {
      t.id()
      t.string('name', 50).unique()
      t.integer('position').default(0)
    })
  },
  down(schema) {
    schema.dropIfExists('labels')
  },
})
