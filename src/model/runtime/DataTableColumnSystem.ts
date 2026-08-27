import type {
  DataTableColumnInput,
  DataTablePinnedColumns,
  DataTablePinnedColumnSide,
  DataTableResolvedColumn,
} from '@/model/types/datatable.types'

export type DataTableColumnGroupChild<Row extends Record<string, any> = Record<string, any>>
  = | string
    | DataTableColumnGroup<Row>

export interface DataTableColumnGroup<Row extends Record<string, any> = Record<string, any>> {
  id: string
  title?: string
  children: Array<DataTableColumnGroupChild<Row>>
}

export type DataTableColumnSystemPinRegion = DataTablePinnedColumnSide | 'center' | 'mixed'

export interface DataTableColumnSystemInput<Row extends Record<string, any> = Record<string, any>> {
  columns: Array<DataTableColumnInput<Row> | DataTableResolvedColumn<Row>>
  groups?: Array<DataTableColumnGroup<Row>>
  hidden?: Iterable<string>
  pinned?: DataTablePinnedColumns
  order?: Array<string>
}

export interface DataTableColumnLeafLayout<Row extends Record<string, any> = Record<string, any>> {
  columnId: string
  title: string
  column: DataTableColumnInput<Row> | DataTableResolvedColumn<Row>
  depth: number
  groupPath: Array<string>
  pinned: DataTableColumnSystemPinRegion
  x: number
  width: number
  index: number
}

export interface DataTableColumnGroupLayoutCell<Row extends Record<string, any> = Record<string, any>> {
  id: string
  title: string
  kind: 'group' | 'column'
  depth: number
  parentId?: string
  columnId?: string
  column?: DataTableColumnInput<Row> | DataTableResolvedColumn<Row>
  pinned: DataTableColumnSystemPinRegion
  x: number
  width: number
  colSpan: number
  rowSpan: number
  startIndex: number
  endIndex: number
}

export interface DataTableColumnGroupLayout<Row extends Record<string, any> = Record<string, any>> {
  rows: Array<Array<DataTableColumnGroupLayoutCell<Row>>>
  leaves: Array<DataTableColumnLeafLayout<Row>>
  maxDepth: number
  totalWidth: number
  visibleColumnIds: Array<string>
  hiddenColumnIds: Array<string>
  orphanColumnIds: Array<string>
}

export interface DataTableColumnChooserNode<Row extends Record<string, any> = Record<string, any>> {
  id: string
  title: string
  kind: 'group' | 'column'
  depth: number
  columnId?: string
  column?: DataTableColumnInput<Row> | DataTableResolvedColumn<Row>
  pinned: DataTableColumnSystemPinRegion
  hidden: boolean
  checked: boolean
  indeterminate: boolean
  leafCount: number
  visibleLeafCount: number
  children: Array<DataTableColumnChooserNode<Row>>
}

export interface DataTableColumnChooserState<Row extends Record<string, any> = Record<string, any>> {
  nodes: Array<DataTableColumnChooserNode<Row>>
  hidden: Array<string>
  pinned: Required<DataTablePinnedColumns>
  order: Array<string>
  visibleColumnIds: Array<string>
  allColumnIds: Array<string>
  layout: DataTableColumnGroupLayout<Row>
  input: {
    columns: Array<DataTableColumnInput<Row> | DataTableResolvedColumn<Row>>
    groups: Array<DataTableColumnGroup<Row>>
  }
}

export type DataTableColumnChooserAction
  = | { type: 'toggle-column', columnId: string, hidden?: boolean }
    | { type: 'toggle-group', groupId: string, hidden?: boolean }
    | { type: 'show-all' }
    | { type: 'hide-all' }
    | { type: 'pin-column', columnId: string, side: DataTablePinnedColumnSide }
    | { type: 'unpin-column', columnId: string }
    | { type: 'set-order', order: Array<string> }

interface NormalizedColumn<Row extends Record<string, any> = Record<string, any>> {
  id: string
  title: string
  width: number
  pinned: DataTableColumnSystemPinRegion
  source: DataTableColumnInput<Row> | DataTableResolvedColumn<Row>
  order: number
}

interface ColumnTreeNode<Row extends Record<string, any> = Record<string, any>> {
  id: string
  title: string
  kind: 'group' | 'column'
  depth: number
  parentId?: string
  column?: NormalizedColumn<Row>
  children: Array<ColumnTreeNode<Row>>
  groupPath: Array<string>
}

const DEFAULT_COLUMN_WIDTH = 140

/**
 * Собирает header layout для вложенных групп колонок без обращения к DOM/canvas.
 */
export function createDataTableColumnGroupLayout<Row extends Record<string, any>>(
  input: DataTableColumnSystemInput<Row>,
): DataTableColumnGroupLayout<Row> {
  const context = createColumnSystemContext(input)
  const tree = createColumnTree(context)
  const visibleTree = filterVisibleColumnTree(tree, context.hidden)
  const maxDepth = resolveMaxDepth(visibleTree)
  const rows = Array.from({ length: maxDepth + 1 }, () => [] as Array<DataTableColumnGroupLayoutCell<Row>>)
  const leaves: Array<DataTableColumnLeafLayout<Row>> = []

  appendLayoutCells(visibleTree, rows, leaves, maxDepth)

  return {
    rows,
    leaves,
    maxDepth,
    totalWidth: leaves.reduce((sum, leaf) => sum + leaf.width, 0),
    visibleColumnIds: leaves.map(leaf => leaf.columnId),
    hiddenColumnIds: [...context.hidden],
    orphanColumnIds: context.orphanColumnIds,
  }
}

/**
 * Создает состояние chooser для колонок и групп с checked/indeterminate флагами.
 */
export function createDataTableColumnChooserState<Row extends Record<string, any>>(
  input: DataTableColumnSystemInput<Row>,
): DataTableColumnChooserState<Row> {
  const context = createColumnSystemContext(input)
  const tree = createColumnTree(context)
  const nodes = tree.map(node => createChooserNode(node, context.hidden))
  const layout = createDataTableColumnGroupLayout(input)

  return {
    nodes,
    hidden: [...context.hidden],
    pinned: {
      left: [...context.pinned.left],
      right: [...context.pinned.right],
    },
    order: context.order,
    visibleColumnIds: layout.visibleColumnIds,
    allColumnIds: context.allColumnIds,
    layout,
    input: {
      columns: [...input.columns],
      groups: input.groups ? cloneColumnGroups(input.groups) : [],
    },
  }
}

/**
 * Применяет action к chooser state и пересобирает производные layout/flags.
 */
export function reduceDataTableColumnChooserState<Row extends Record<string, any>>(
  state: DataTableColumnChooserState<Row>,
  action: DataTableColumnChooserAction,
): DataTableColumnChooserState<Row> {
  if (action.type === 'show-all') {
    return createDataTableColumnChooserState({
      columns: state.input.columns,
      groups: state.input.groups,
      hidden: [],
      pinned: state.pinned,
      order: state.order,
    })
  }
  if (action.type === 'hide-all') {
    return createDataTableColumnChooserState({
      columns: state.input.columns,
      groups: state.input.groups,
      hidden: state.allColumnIds,
      pinned: state.pinned,
      order: state.order,
    })
  }
  if (action.type === 'toggle-column') {
    const hidden = applyHiddenToggle(state.hidden, [action.columnId], action.hidden)
    return createDataTableColumnChooserState({
      columns: state.input.columns,
      groups: state.input.groups,
      hidden,
      pinned: state.pinned,
      order: state.order,
    })
  }
  if (action.type === 'toggle-group') {
    const node = findChooserNode(state.nodes, action.groupId)
    const columnIds = node ? collectChooserColumnIds(node) : []
    const hidden = applyHiddenToggle(state.hidden, columnIds, action.hidden)
    return createDataTableColumnChooserState({
      columns: state.input.columns,
      groups: state.input.groups,
      hidden,
      pinned: state.pinned,
      order: state.order,
    })
  }
  if (action.type === 'pin-column') {
    return createDataTableColumnChooserState({
      columns: state.input.columns,
      groups: state.input.groups,
      hidden: state.hidden,
      pinned: applyPinnedColumn(state.pinned, action.columnId, action.side),
      order: state.order,
    })
  }
  if (action.type === 'unpin-column') {
    return createDataTableColumnChooserState({
      columns: state.input.columns,
      groups: state.input.groups,
      hidden: state.hidden,
      pinned: applyPinnedColumn(state.pinned, action.columnId, undefined),
      order: state.order,
    })
  }
  if (action.type === 'set-order') {
    return createDataTableColumnChooserState({
      columns: state.input.columns,
      groups: state.input.groups,
      hidden: state.hidden,
      pinned: state.pinned,
      order: action.order,
    })
  }
  return state
}

function createColumnSystemContext<Row extends Record<string, any>>(input: DataTableColumnSystemInput<Row>) {
  const hidden = new Set(input.hidden ?? [])
  const allColumnIds = input.columns.map(column => column.id)
  const order = resolveColumnOrder(allColumnIds, input.order)
  const rank = new Map(order.map((id, index) => [id, index]))
  const pinned = {
    left: [...(input.pinned?.left ?? [])],
    right: [...(input.pinned?.right ?? [])],
  }
  const normalized = new Map<string, NormalizedColumn<Row>>()

  for (const column of input.columns) {
    normalized.set(column.id, {
      id: column.id,
      title: column.title ?? column.id,
      width: resolveColumnWidth(column),
      pinned: resolvePinnedRegion(column.id, column.pinned, pinned),
      source: column,
      order: rank.get(column.id) ?? Number.MAX_SAFE_INTEGER,
    })
  }

  return {
    columns: normalized,
    groups: input.groups ? cloneColumnGroups(input.groups) : [],
    hidden,
    pinned,
    order,
    allColumnIds,
    orphanColumnIds: resolveOrphanColumnIds(allColumnIds, input.groups ?? []),
  }
}

function createColumnTree<Row extends Record<string, any>>(
  context: ReturnType<typeof createColumnSystemContext<Row>>,
): Array<ColumnTreeNode<Row>> {
  const nodes = context.groups
    .map(group => createGroupTreeNode(group, context, 0, undefined, []))
    .filter((node): node is ColumnTreeNode<Row> => !!node)
  const orphans = context.orphanColumnIds
    .map(columnId => createColumnTreeNode(columnId, context, 0, undefined, []))
    .filter((node): node is ColumnTreeNode<Row> => !!node)

  return sortColumnTreeNodes([...nodes, ...orphans])
}

function createGroupTreeNode<Row extends Record<string, any>>(
  group: DataTableColumnGroup<Row>,
  context: ReturnType<typeof createColumnSystemContext<Row>>,
  depth: number,
  parentId: string | undefined,
  groupPath: Array<string>,
): ColumnTreeNode<Row> | null {
  const path = [...groupPath, group.id]
  const children = group.children
    .map((child) => {
      if (typeof child === 'string') {
        return createColumnTreeNode(child, context, depth + 1, group.id, path)
      }
      return createGroupTreeNode(child, context, depth + 1, group.id, path)
    })
    .filter((node): node is ColumnTreeNode<Row> => !!node)

  if (children.length === 0) {
    return null
  }
  return {
    id: group.id,
    title: group.title ?? group.id,
    kind: 'group',
    depth,
    parentId,
    children: sortColumnTreeNodes(children),
    groupPath,
  }
}

function createColumnTreeNode<Row extends Record<string, any>>(
  columnId: string,
  context: ReturnType<typeof createColumnSystemContext<Row>>,
  depth: number,
  parentId: string | undefined,
  groupPath: Array<string>,
): ColumnTreeNode<Row> | null {
  const column = context.columns.get(columnId)
  if (!column) {
    return null
  }
  return {
    id: column.id,
    title: column.title,
    kind: 'column',
    depth,
    parentId,
    column,
    children: [],
    groupPath,
  }
}

function filterVisibleColumnTree<Row extends Record<string, any>>(
  nodes: Array<ColumnTreeNode<Row>>,
  hidden: Set<string>,
): Array<ColumnTreeNode<Row>> {
  return nodes
    .map((node) => {
      if (node.kind === 'column') {
        return hidden.has(node.id) ? null : node
      }
      const children = filterVisibleColumnTree(node.children, hidden)
      return children.length === 0 ? null : { ...node, children }
    })
    .filter((node): node is ColumnTreeNode<Row> => !!node)
}

function appendLayoutCells<Row extends Record<string, any>>(
  nodes: Array<ColumnTreeNode<Row>>,
  rows: Array<Array<DataTableColumnGroupLayoutCell<Row>>>,
  leaves: Array<DataTableColumnLeafLayout<Row>>,
  maxDepth: number,
): void {
  for (const node of nodes) {
    if (node.kind === 'column' && node.column) {
      const x = leaves.reduce((sum, leaf) => sum + leaf.width, 0)
      const index = leaves.length
      const leaf: DataTableColumnLeafLayout<Row> = {
        columnId: node.column.id,
        title: node.title,
        column: node.column.source,
        depth: node.depth,
        groupPath: [...node.groupPath],
        pinned: node.column.pinned,
        x,
        width: node.column.width,
        index,
      }
      leaves.push(leaf)
      rows[node.depth]?.push({
        id: node.id,
        title: node.title,
        kind: 'column',
        depth: node.depth,
        parentId: node.parentId,
        columnId: node.column.id,
        column: node.column.source,
        pinned: node.column.pinned,
        x,
        width: node.column.width,
        colSpan: 1,
        rowSpan: maxDepth - node.depth + 1,
        startIndex: index,
        endIndex: index + 1,
      })
      continue
    }

    const startIndex = leaves.length
    appendLayoutCells(node.children, rows, leaves, maxDepth)
    const groupLeaves = leaves.slice(startIndex)
    if (groupLeaves.length === 0) {
      continue
    }
    rows[node.depth]?.push({
      id: node.id,
      title: node.title,
      kind: 'group',
      depth: node.depth,
      parentId: node.parentId,
      pinned: resolveGroupPinnedRegion(groupLeaves.map(leaf => leaf.pinned)),
      x: groupLeaves[0]?.x ?? 0,
      width: groupLeaves.reduce((sum, leaf) => sum + leaf.width, 0),
      colSpan: groupLeaves.length,
      rowSpan: 1,
      startIndex,
      endIndex: leaves.length,
    })
  }

  for (const row of rows) {
    row.sort((left, right) => left.startIndex - right.startIndex)
  }
}

function createChooserNode<Row extends Record<string, any>>(
  node: ColumnTreeNode<Row>,
  hidden: Set<string>,
): DataTableColumnChooserNode<Row> {
  if (node.kind === 'column' && node.column) {
    const isHidden = hidden.has(node.column.id)
    return {
      id: node.id,
      title: node.title,
      kind: 'column',
      depth: node.depth,
      columnId: node.column.id,
      column: node.column.source,
      pinned: node.column.pinned,
      hidden: isHidden,
      checked: !isHidden,
      indeterminate: false,
      leafCount: 1,
      visibleLeafCount: isHidden ? 0 : 1,
      children: [],
    }
  }

  const children = node.children.map(child => createChooserNode(child, hidden))
  const leafCount = children.reduce((sum, child) => sum + child.leafCount, 0)
  const visibleLeafCount = children.reduce((sum, child) => sum + child.visibleLeafCount, 0)
  return {
    id: node.id,
    title: node.title,
    kind: 'group',
    depth: node.depth,
    pinned: resolveGroupPinnedRegion(children.map(child => child.pinned)),
    hidden: visibleLeafCount === 0,
    checked: leafCount > 0 && visibleLeafCount === leafCount,
    indeterminate: visibleLeafCount > 0 && visibleLeafCount < leafCount,
    leafCount,
    visibleLeafCount,
    children,
  }
}

function sortColumnTreeNodes<Row extends Record<string, any>>(
  nodes: Array<ColumnTreeNode<Row>>,
): Array<ColumnTreeNode<Row>> {
  return [...nodes].sort((left, right) => resolveTreeRank(left) - resolveTreeRank(right))
}

function resolveTreeRank<Row extends Record<string, any>>(node: ColumnTreeNode<Row>): number {
  if (node.kind === 'column') {
    return node.column?.order ?? Number.MAX_SAFE_INTEGER
  }
  return Math.min(...node.children.map(resolveTreeRank))
}

function resolveMaxDepth<Row extends Record<string, any>>(nodes: Array<ColumnTreeNode<Row>>): number {
  if (nodes.length === 0) {
    return 0
  }
  return Math.max(...nodes.map(node => (
    node.children.length > 0 ? resolveMaxDepth(node.children) : node.depth
  )))
}

function resolveColumnOrder(allColumnIds: Array<string>, order: Array<string> | undefined): Array<string> {
  const known = new Set(allColumnIds)
  const ordered = (order ?? []).filter(id => known.has(id))
  const used = new Set(ordered)
  return [...ordered, ...allColumnIds.filter(id => !used.has(id))]
}

function resolveColumnWidth<Row extends Record<string, any>>(
  column: DataTableColumnInput<Row> | DataTableResolvedColumn<Row>,
): number {
  if ('resolvedWidth' in column) {
    return column.resolvedWidth
  }
  if (typeof column.width === 'number') {
    return column.width
  }
  return DEFAULT_COLUMN_WIDTH
}

function resolvePinnedRegion(
  columnId: string,
  columnPinned: DataTablePinnedColumnSide | undefined,
  pinned: Required<DataTablePinnedColumns>,
): DataTableColumnSystemPinRegion {
  if (pinned.left.includes(columnId)) {
    return 'left'
  }
  if (pinned.right.includes(columnId)) {
    return 'right'
  }
  return columnPinned ?? 'center'
}

function resolveGroupPinnedRegion(regions: Array<DataTableColumnSystemPinRegion>): DataTableColumnSystemPinRegion {
  const normalized = new Set(regions)
  normalized.delete('mixed')
  if (normalized.size === 0) {
    return 'center'
  }
  if (normalized.size === 1) {
    return [...normalized][0] ?? 'center'
  }
  return 'mixed'
}

function resolveOrphanColumnIds<Row extends Record<string, any>>(
  allColumnIds: Array<string>,
  groups: Array<DataTableColumnGroup<Row>>,
): Array<string> {
  const grouped = new Set<string>()
  for (const group of groups) {
    collectGroupColumnIds(group, grouped)
  }
  return allColumnIds.filter(id => !grouped.has(id))
}

function collectGroupColumnIds<Row extends Record<string, any>>(
  group: DataTableColumnGroup<Row>,
  target: Set<string>,
): void {
  for (const child of group.children) {
    if (typeof child === 'string') {
      target.add(child)
    }
    else { collectGroupColumnIds(child, target) }
  }
}

function cloneColumnGroups<Row extends Record<string, any>>(
  groups: Array<DataTableColumnGroup<Row>>,
): Array<DataTableColumnGroup<Row>> {
  return groups.map(group => ({
    id: group.id,
    title: group.title,
    children: group.children.map(child => typeof child === 'string' ? child : cloneColumnGroups([child])[0]!),
  }))
}

function findChooserNode<Row extends Record<string, any>>(
  nodes: Array<DataTableColumnChooserNode<Row>>,
  id: string,
): DataTableColumnChooserNode<Row> | null {
  for (const node of nodes) {
    if (node.id === id) {
      return node
    }
    const child = findChooserNode(node.children, id)
    if (child) {
      return child
    }
  }
  return null
}

function collectChooserColumnIds<Row extends Record<string, any>>(
  node: DataTableColumnChooserNode<Row>,
): Array<string> {
  if (node.kind === 'column') {
    return node.columnId ? [node.columnId] : []
  }
  return node.children.flatMap(collectChooserColumnIds)
}

function applyHiddenToggle(
  current: Array<string>,
  columnIds: Array<string>,
  hidden: boolean | undefined,
): Array<string> {
  const next = new Set(current)
  const shouldHide = hidden ?? columnIds.some(columnId => !next.has(columnId))
  for (const columnId of columnIds) {
    if (shouldHide) {
      next.add(columnId)
    }
    else { next.delete(columnId) }
  }
  return [...next]
}

function applyPinnedColumn(
  current: Required<DataTablePinnedColumns>,
  columnId: string,
  side: DataTablePinnedColumnSide | undefined,
): Required<DataTablePinnedColumns> {
  const left = current.left.filter(id => id !== columnId)
  const right = current.right.filter(id => id !== columnId)
  if (side === 'left') {
    left.push(columnId)
  }
  if (side === 'right') {
    right.push(columnId)
  }
  return { left, right }
}
