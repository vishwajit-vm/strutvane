// Chart settings for Users. `node strut charts:sync` wrote this file once and never
// overwrites it: edit freely. Field names and suggestion ids are type-checked.
import { auto, defineResourceCharts } from '#strutvane/charts'

export default defineResourceCharts('users', {
  widgets: auto(),
  // Sign-ups are on the users screen; the home dashboard stays about the business.
  dashboard: false,
  aggregates: auto(),
})
