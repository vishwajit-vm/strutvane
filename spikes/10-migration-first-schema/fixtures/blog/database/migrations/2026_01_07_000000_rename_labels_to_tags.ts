import { migration } from '#strutvane/schema'

export default migration({
  up(schema) {
    schema.rename('labels', 'tags')
  },
  down(schema) {
    schema.rename('tags', 'labels')
  },
})
