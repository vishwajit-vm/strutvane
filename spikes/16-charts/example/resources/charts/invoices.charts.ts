// Chart settings for Invoices. `node strut charts:sync` wrote this file once and never
// overwrites it: edit freely. Field names and suggestion ids are type-checked.
import { auto, defineResourceCharts } from '#strutvane/charts'

export default defineResourceCharts('invoices', {
  // An explicit list: charts:sync reports new suggestions instead of adding them.
  widgets: [
    { id: 'invoices.revenue', kind: 'stat', title: 'Revenue', description: 'Invoiced in the last 30 days.', metric: 'sum', field: 'total', date: 'issued_on', days: 30, format: 'decimal' },
    'invoices.new',
    'invoices.per-period-by-status',
    {
      id: 'invoices.paid-vs-unpaid',
      kind: 'bar',
      title: 'Invoiced per month, paid and unpaid',
      metric: 'sum',
      field: 'total',
      groupBy: 'issued_on',
      interval: 'month',
      range: { last: 6, unit: 'month' },
      splitBy: 'paid',
      size: 'lg',
    },
    'invoices.sum-total',
    'invoices.by-status',
    'invoices.top-customer',
  ],
  dashboard: ['invoices.revenue', 'invoices.new', 'invoices.paid-vs-unpaid', 'invoices.by-status', 'invoices.top-customer'],
  aggregates: auto(),
  sort: 1,
})
