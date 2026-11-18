/**
 * The two graph algorithms the builder and the resolver share: a deterministic topological order
 * and a readable cycle finder, over "package → packages it requires" edges.
 *
 * Deterministic means: the same set of nodes always gives the same order, whatever order the
 * nodes or edges were given in. Ties are broken by id (plain code-unit order, which is the same
 * on every machine and locale).
 *
 * @module
 */

/** Plain code-unit order, identical in every locale (unlike `localeCompare`). */
export const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/**
 * Order `nodes` so that every node comes after the nodes it requires. Among nodes that are ready
 * at the same time, the smallest id goes first. Returns `undefined` when there is a cycle.
 *
 * Edges to nodes outside `nodes` are ignored (the caller checks for missing requirements).
 *
 * @example
 * topologicalOrder(['b', 'a', 'c'], (n) => (n === 'a' ? ['c'] : [])) // ['b', 'c', 'a']
 */
export function topologicalOrder(nodes: Iterable<string>, requires: (node: string) => readonly string[]): string[] | undefined {
  const all = new Set(nodes)
  const waitingOn = new Map<string, number>()
  const dependents = new Map<string, string[]>()
  for (const node of all) {
    const needs = [...new Set(requires(node))].filter((other) => all.has(other))
    waitingOn.set(node, needs.length)
    for (const need of needs) dependents.set(need, [...(dependents.get(need) ?? []), node])
  }
  const ready = [...all].filter((node) => waitingOn.get(node) === 0).sort(byCodeUnit)
  const order: string[] = []
  while (ready.length > 0) {
    const node = ready.shift() ?? ''
    order.push(node)
    for (const dependent of dependents.get(node) ?? []) {
      const left = (waitingOn.get(dependent) ?? 0) - 1
      waitingOn.set(dependent, left)
      if (left === 0) {
        // Keep `ready` sorted: at most ~100 packages, so a sorted insert is plenty fast.
        ready.push(dependent)
        ready.sort(byCodeUnit)
      }
    }
  }
  return order.length === all.size ? order : undefined
}

/**
 * One cycle among `nodes`, as a path that starts and ends with the same node and starts at the
 * smallest id in the cycle (so the message is the same every run), or `undefined`.
 *
 * @example
 * findCycle(['a', 'b'], (n) => (n === 'a' ? ['b'] : ['a'])) // ['a', 'b', 'a']
 */
export function findCycle(nodes: Iterable<string>, requires: (node: string) => readonly string[]): string[] | undefined {
  const all = [...new Set(nodes)].sort(byCodeUnit)
  const inGraph = new Set(all)
  const state = new Map<string, 'visiting' | 'done'>()
  const stack: string[] = []
  const visit = (node: string): string[] | undefined => {
    state.set(node, 'visiting')
    stack.push(node)
    for (const next of [...requires(node)].filter((other) => inGraph.has(other)).sort(byCodeUnit)) {
      if (state.get(next) === 'visiting') {
        const cycle = stack.slice(stack.indexOf(next))
        const start = cycle.indexOf([...cycle].sort(byCodeUnit)[0] ?? next)
        const rotated = [...cycle.slice(start), ...cycle.slice(0, start)]
        return [...rotated, rotated[0] ?? next]
      }
      if (state.get(next) === undefined) {
        const found = visit(next)
        if (found !== undefined) return found
      }
    }
    stack.pop()
    state.set(node, 'done')
    return undefined
  }
  for (const node of all) {
    if (state.get(node) === undefined) {
      const found = visit(node)
      if (found !== undefined) return found
    }
  }
  return undefined
}
