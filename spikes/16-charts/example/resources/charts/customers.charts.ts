// Chart settings for Customers. `node strut charts:sync` wrote this file once and never
// overwrites it: edit freely. Field names and suggestion ids are type-checked.
import { auto, defineResourceCharts } from '#strutvane/charts'

export default defineResourceCharts('customers', {
  widgets: auto({ except: ['customers.per-period-by-country'], order: ['customers.by-country'] }),
  dashboard: auto(),
  aggregates: auto(),
  sort: 2,
})
