import type {
  DataTableAccessibilityOptions,
  DataTableAccessibilityState,
  DataTableFilterExpression,
  DataTableFilterRule,
  DataTableFilterState,
  DataTableResolvedAccessibilityOptions,
  DataTableSearchState,
  DataTableSelectionAnchor,
  DataTableSelectionState,
  DataTableSortState,
  DataTableViewport,
} from '@/model/types/datatable.types'

export type DataTableAccessibilityPoliteness = 'off' | 'polite' | 'assertive'
export type DataTableAccessibilityReason =
  | 'idle'
  | 'focus'
  | 'selection'
  | 'sort'
  | 'filter'
  | 'search'
  | 'viewport'
  | 'columns'
  | 'grouping'
  | 'loading'
  | 'clipboard'
  | 'custom'

export interface DataTableAccessibilityColumn {
  id: string
  title?: string
}

export type DataTableAccessibilityOperation =
  | { type: 'focus'; activeCell: DataTableSelectionAnchor | null }
  | { type: 'selection'; selection: DataTableSelectionState | null }
  | { type: 'sort'; sort: DataTableSortState }
  | { type: 'filter'; filters: DataTableFilterState | DataTableFilterExpression }
  | { type: 'search'; search: DataTableSearchState }
  | { type: 'viewport'; viewport: Pick<DataTableViewport, 'rowRange' | 'centerColumnRange'> }
  | { type: 'columns'; visibleColumnCount: number; hiddenColumnCount: number }
  | { type: 'grouping'; expanded: 'all' | 'none' | Array<string> }
  | { type: 'loading'; loading: boolean }
  | { type: 'clipboard'; message: string; assertive?: boolean }
  | { type: 'custom'; message: string; politeness?: DataTableAccessibilityPoliteness }

export interface DataTableAccessibilityLiveMessage {
  id: string
  reason: DataTableAccessibilityReason
  politeness: DataTableAccessibilityPoliteness
  message: string
  createdAt: number
}

export interface DataTableAccessibilityGridStateInput {
  tableId?: string
  label?: string
  rowCount: number
  columns: Array<DataTableAccessibilityColumn>
  hiddenColumnCount?: number
  activeCell?: DataTableSelectionAnchor | null
  selection?: DataTableSelectionState | null
  sort?: DataTableSortState
  filters?: DataTableFilterState | DataTableFilterExpression
  search?: DataTableSearchState
  viewport?: Pick<DataTableViewport, 'rowRange' | 'centerColumnRange'>
  loading?: boolean
  operation?: DataTableAccessibilityOperation
  now?: number
}

export interface DataTableAccessibilityGridState {
  role: 'grid'
  tableId: string
  label: string
  ariaRowCount: number
  ariaColumnCount: number
  ariaBusy: boolean
  activeDescendant?: string
  live: DataTableAccessibilityLiveMessage
  summaries: {
    focus: string
    selection: string
    sort: string
    filter: string
    search: string
    viewport: string
    columns: string
  }
}

const DEFAULT_TABLE_ID = 'nova-datatable'

/**
 * Нормализует настройки accessibility layer.
 */
export function normalizeDataTableAccessibility(
  accessibility: false | DataTableAccessibilityOptions | undefined,
): false | DataTableResolvedAccessibilityOptions {
  if (accessibility === false) return false
  return {
    enabled: accessibility?.enabled ?? false,
    mode: accessibility?.mode ?? 'grid',
    announceSelection: accessibility?.announceSelection ?? true,
    announceEdits: accessibility?.announceEdits ?? true,
    highContrast: accessibility?.highContrast ?? false,
  }
}

/**
 * Собирает compact state для DOM accessibility layer без DOM-node на каждую ячейку.
 */
export function createDataTableAccessibilityState(
  options: false | DataTableResolvedAccessibilityOptions,
  input: {
    rowCount: number
    columnCount: number
    activeCell: DataTableSelectionAnchor | null
    selection: DataTableSelectionState | null
    editing: boolean
    lastAction?: string
  },
): DataTableAccessibilityState {
  const enabled = options !== false && options.enabled
  const activeDescription = input.activeCell
    ? `Row ${input.activeCell.rowIndex + 1}, column ${input.activeCell.columnIndex + 1}`
    : `Grid with ${input.rowCount} rows and ${input.columnCount} columns`
  const liveMessage = enabled
    ? createLiveMessage(options, input)
    : ''
  return {
    role: options !== false && options.mode === 'application' ? 'application' : 'grid',
    activeDescription,
    liveMessage,
    highContrast: options !== false && options.highContrast,
  }
}

function createLiveMessage(
  options: DataTableResolvedAccessibilityOptions,
  input: {
    activeCell: DataTableSelectionAnchor | null
    selection: DataTableSelectionState | null
    editing: boolean
    lastAction?: string
  },
): string {
  if (input.editing && options.announceEdits) return 'Cell editor opened'
  if (input.selection && options.announceSelection) {
    return `Selection changed: ${input.selection.ranges.length} range${input.selection.ranges.length === 1 ? '' : 's'}`
  }
  return input.lastAction ?? ''
}

/**
 * Собирает accessibility state для canvas grid и live region.
 */
export function buildDataTableAccessibilityState(
  input: DataTableAccessibilityGridStateInput,
): DataTableAccessibilityGridState {
  const tableId = input.tableId ?? DEFAULT_TABLE_ID
  const activeDescendant = input.activeCell
    ? createDataTableCellAriaId(tableId, input.activeCell.rowIndex, input.activeCell.columnId)
    : undefined
  const summaries = {
    focus: formatFocusSummary(input.activeCell ?? null, input.columns),
    selection: formatSelectionSummary(input.selection ?? null, input.columns),
    sort: formatSortSummary(input.sort ?? [], input.columns),
    filter: formatFilterSummary(input.filters ?? []),
    search: input.search ? formatSearchSummary(input.search) : '',
    viewport: input.viewport ? formatViewportSummary(input.viewport) : '',
    columns: formatColumnsSummary(input.columns.length, input.hiddenColumnCount ?? 0),
  }

  return {
    role: 'grid',
    tableId,
    label: input.label ?? 'Data table',
    ariaRowCount: input.rowCount,
    ariaColumnCount: input.columns.length,
    ariaBusy: input.loading ?? false,
    activeDescendant,
    live: buildDataTableAccessibilityLiveMessage(input.operation ?? { type: 'custom', message: '' }, {
      columns: input.columns,
      now: input.now,
    }),
    summaries,
  }
}

/**
 * Создает live-region сообщение для операций таблицы.
 */
export function buildDataTableAccessibilityLiveMessage(
  operation: DataTableAccessibilityOperation,
  context: {
    columns?: Array<DataTableAccessibilityColumn>
    now?: number
  } = {},
): DataTableAccessibilityLiveMessage {
  const createdAt = context.now ?? Date.now()
  const reason = resolveLiveMessageReason(operation)
  const message = formatLiveMessage(operation, context.columns ?? [])
  return {
    id: `datatable-live-${createdAt}-${reason}`,
    reason,
    politeness: resolvePoliteness(operation),
    message,
    createdAt,
  }
}

/**
 * Создает стабильный DOM id активной ячейки для aria-activedescendant.
 */
export function createDataTableCellAriaId(tableId: string, rowIndex: number, columnId: string): string {
  return `${sanitizeAriaIdPart(tableId)}-cell-r${Math.max(0, rowIndex)}-${sanitizeAriaIdPart(columnId)}`
}

function resolveLiveMessageReason(operation: DataTableAccessibilityOperation): DataTableAccessibilityReason {
  return operation.type
}

function resolvePoliteness(operation: DataTableAccessibilityOperation): DataTableAccessibilityPoliteness {
  if (operation.type === 'custom') return operation.politeness ?? 'polite'
  if (operation.type === 'clipboard') return operation.assertive ? 'assertive' : 'polite'
  if (operation.type === 'loading') return operation.loading ? 'polite' : 'off'
  return 'polite'
}

function formatLiveMessage(
  operation: DataTableAccessibilityOperation,
  columns: Array<DataTableAccessibilityColumn>,
): string {
  if (operation.type === 'focus') return formatFocusSummary(operation.activeCell, columns)
  if (operation.type === 'selection') return formatSelectionSummary(operation.selection, columns)
  if (operation.type === 'sort') return formatSortSummary(operation.sort, columns) || 'Sorting cleared'
  if (operation.type === 'filter') return formatFilterSummary(operation.filters) || 'Filters cleared'
  if (operation.type === 'search') return formatSearchSummary(operation.search)
  if (operation.type === 'viewport') return formatViewportSummary(operation.viewport)
  if (operation.type === 'columns') return formatColumnsSummary(operation.visibleColumnCount, operation.hiddenColumnCount)
  if (operation.type === 'grouping') return formatGroupingSummary(operation.expanded)
  if (operation.type === 'loading') return operation.loading ? 'Loading rows' : ''
  if (operation.type === 'clipboard') return operation.message
  return operation.message
}

function formatFocusSummary(
  activeCell: DataTableSelectionAnchor | null,
  columns: Array<DataTableAccessibilityColumn>,
): string {
  if (!activeCell) return ''
  return `Focus row ${activeCell.rowIndex + 1}, column ${resolveColumnTitle(columns, activeCell.columnId)}`
}

function formatSelectionSummary(
  selection: DataTableSelectionState | null,
  columns: Array<DataTableAccessibilityColumn>,
): string {
  if (!selection) return 'Selection cleared'
  if (selection.mode === 'cell' && selection.activeCell) return formatFocusSummary(selection.activeCell, columns)
  if (selection.mode === 'row' && selection.rowIndex !== undefined) return `Row ${selection.rowIndex + 1} selected`
  if (selection.mode === 'column' && selection.columnId) return `Column ${resolveColumnTitle(columns, selection.columnId)} selected`
  if (selection.ranges.length > 0) return `${selection.ranges.length} selection ranges`
  return 'Selection updated'
}

function formatSortSummary(
  sort: DataTableSortState,
  columns: Array<DataTableAccessibilityColumn>,
): string {
  if (sort.length === 0) return ''
  const rules = sort.map(rule => {
    const direction = rule.direction === 'asc' ? 'ascending' : 'descending'
    return `${resolveColumnTitle(columns, rule.columnId)} ${direction}`
  })
  return `Sorted by ${rules.join(', ')}`
}

function formatFilterSummary(filters: DataTableFilterState | DataTableFilterExpression): string {
  const count = countFilterRules(filters)
  if (count === 0) return ''
  return `${count} ${count === 1 ? 'filter' : 'filters'} applied`
}

function formatSearchSummary(search: DataTableSearchState): string {
  const text = search.query.text.trim()
  if (!text) return 'Search cleared'
  if (search.loading) return `Searching "${text}"`
  if (search.total === 0) return `No results for "${text}"`
  const active = search.activeIndex >= 0 ? search.activeIndex + 1 : 0
  return `Search "${text}": ${active} of ${search.total}`
}

function formatViewportSummary(viewport: Pick<DataTableViewport, 'rowRange' | 'centerColumnRange'>): string {
  const rowStart = viewport.rowRange.start + 1
  const rowEnd = viewport.rowRange.end
  const columnStart = viewport.centerColumnRange.start + 1
  const columnEnd = viewport.centerColumnRange.end
  return `Rows ${rowStart}-${rowEnd}, columns ${columnStart}-${columnEnd} visible`
}

function formatColumnsSummary(visibleColumnCount: number, hiddenColumnCount: number): string {
  if (hiddenColumnCount <= 0) return `${visibleColumnCount} columns visible`
  return `${visibleColumnCount} columns visible, ${hiddenColumnCount} hidden`
}

function formatGroupingSummary(expanded: 'all' | 'none' | Array<string>): string {
  if (expanded === 'all') return 'All groups expanded'
  if (expanded === 'none') return 'All groups collapsed'
  return `${expanded.length} groups expanded`
}

function countFilterRules(filters: DataTableFilterState | DataTableFilterExpression | DataTableFilterRule): number {
  if (Array.isArray(filters)) return filters.length
  if ('logic' in filters) return filters.rules.reduce((count, rule) => count + countFilterRules(rule), 0)
  return 1
}

function resolveColumnTitle(columns: Array<DataTableAccessibilityColumn>, columnId: string): string {
  return columns.find(column => column.id === columnId)?.title ?? columnId
}

function sanitizeAriaIdPart(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'datatable'
}
