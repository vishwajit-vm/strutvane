/** Public surface of the spike, mirroring what @strutvane/ui would export. */
export type { ResourceApi } from './api.ts'
export { defaultRegistry } from './defaults.ts'
export { ApiProblemError, issuePathToFieldName, routeIssues } from './errors.ts'
export { FilterBar } from './FilterBar.tsx'
export { parseSearchString, toListQuery, toSearchString } from './list-query-url.ts'
export { defaultMessages, formatMessage } from './messages.ts'
export {
  type Cell,
  type CellProps,
  mergeRegistry,
  type Registry,
  type RegistryOverrides,
  resolveCell,
  resolveWidget,
  StrutvaneUIProvider,
  type Widget,
  type WidgetProps,
} from './registry.tsx'
export { ResourceForm } from './ResourceForm.tsx'
export { ResourceList } from './ResourceList.tsx'
export { useListQuery } from './useListQuery.ts'
