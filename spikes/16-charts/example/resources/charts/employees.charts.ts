// Chart settings for Employees. `node strut charts:sync` wrote this file once and never
// overwrites it: edit freely. Field names and suggestion ids are type-checked.
import { auto, defineResourceCharts } from '#strutvane/charts'

export default defineResourceCharts('employees', {
  // Salaries are personal data: no sums, and averages only for groups of 5 or more.
  widgets: auto({ except: ['employees.sum-salary'] }),
  dashboard: ['employees.by-department', 'employees.avg-salary'],
  aggregates: { numeric: ['salary'], groupBy: ['department', 'remote', 'hired_on', 'created_at'] },
  privacy: { minGroupSize: 5 },
  sort: 3,
})
