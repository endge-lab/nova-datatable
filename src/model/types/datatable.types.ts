import type { NovaMotionOptions, NovaSchema, NovaTextRenderMode, RendererType } from '@endge/nova'
import type {
  NovaUiCommonProps,
  NovaUiCommonResolvedProps,
  TooltipAnimationOptions,
  TooltipCollisionOptions,
  TooltipContent,
  TooltipModifier,
  TooltipPlacement,
  NovaScrollbarAxis,
  NovaScrollbarGeometry,
  NovaScrollbarResolvedVisualOptions,
  NovaScrollbarVisibility,
  NovaScrollbarVisualOptions,
  NovaScrollbarVisualState,
} from '@endge/nova-ui-kit'

export const DATATABLE_ROOT_SCHEMA_TYPE = 'NovaDataTable.Root'

export type DataTableRowId = string | number
export type DataTablePinnedColumnSide = 'left' | 'right'
export type DataTablePinnedRowPosition = 'top' | 'bottom'
export type DataTableColumnAlign = 'left' | 'center' | 'right'
export type DataTableViewMode = 'client' | 'server' | 'hybrid'
export type DataTableSortDirection = 'asc' | 'desc'
export type DataTableSortHeaderClickMode = 'append' | 'replace'
export type DataTableGroupFooterPlacement = 'scroll' | 'pinned-bottom' | 'both'
export type DataTableFilterPreset = 'text' | 'number' | 'date' | 'set' | 'boolean' | 'custom'
export type DataTableFilterExpressionLogic = 'and' | 'or'
export type DataTableFilterOperator =
  | 'contains'
  | 'equals'
  | 'startsWith'
  | 'endsWith'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'between'
  | 'in'
  | 'notIn'
  | 'is'
  | 'isNot'
export type DataTableSearchScope = 'rows' | 'cells'
export type DataTableSearchMatchMode = 'contains' | 'startsWith' | 'equals' | 'regex'
export type DataTableSearchHighlightMode = 'none' | 'row' | 'cell' | 'text' | 'cell-text' | 'row-cell' | 'row-cell-text'
export type DataTableSearchDirection = 'next' | 'previous'
export type DataTableHoverMode = 'none' | 'row' | 'column' | 'cell' | 'row-column' | 'row-cell' | 'column-cell'
export type DataTableSelectionUnit = 'cell' | 'row' | 'column'
export type DataTableSelectionCardinality = 'single' | 'multiple'
export type DataTableSelectionMode = 'none' | DataTableSelectionUnit | 'mixed'
export type DataTableSelectionGroupRowsMode = 'none' | 'group-row-only' | 'children-visible'
export type DataTableClipboardFormat = 'plain' | 'tsv' | 'html'
export type DataTablePasteParseFormat = 'auto' | 'plain' | 'tsv' | 'csv' | 'html'
export type DataTablePasteOverflowPolicy = 'clip' | 'expand-rows' | 'reject'
export type DataTablePasteInvalidPolicy = 'reject' | 'skip-cell' | 'commit-valid'
export type DataTablePasteReadonlyPolicy = 'skip' | 'reject'
export type DataTablePasteCommitPolicy = 'optimistic' | 'transaction'
export type DataTableColumnType = 'text' | 'number' | 'boolean' | 'date' | 'datetime' | 'time' | 'enum' | 'json' | 'custom'
export type DataTableCellEnterMotion = 'none' | 'fade'
export type DataTableScrollbarVisibility = Extract<NovaScrollbarVisibility, 'always' | 'hover' | 'scroll'>
export type DataTableScrollbarAxis = NovaScrollbarAxis
export type DataTableZoomMode = 'density' | 'layout' | 'text' | 'custom'
export type DataTableZoomAffect = 'rows' | 'headers' | 'columns' | 'text' | 'icons'
export type DataTableEditTrigger = 'doubleClick' | 'enter' | 'programmatic'
export type DataTableEditorType = 'text' | 'number' | 'select' | 'checkbox' | 'date'
export type DataTableEditCommitStrategy = 'optimistic' | 'pessimistic' | 'controlled'
export type DataTableKeyboardTabAction = 'move' | 'commit-edit'
export type DataTableKeyboardEnterAction = 'edit' | 'move'
export type DataTableActiveCellDirection = 'up' | 'down' | 'left' | 'right' | 'page-up' | 'page-down' | 'home' | 'end'
export type DataTableGroupingPinnedPlacement = 'group-start' | 'group-end'
export type DataTableCommitSource = 'api' | 'edit' | 'paste' | 'fill' | 'clear' | 'rowOrder' | 'columnState' | 'server'
export type DataTableFillHandleMode = 'copy' | 'series' | 'auto'
export type DataTableFillDirection = 'down' | 'right' | 'up' | 'left'
export type DataTableAccessibilityMode = 'grid' | 'application'
export type DataTableColumnAutosizeMode = 'visible' | 'sampled' | 'all-loaded' | 'server-estimated'
export type NovaDataTableDevtoolsOption = boolean | {
  id?: string
  label?: string
}

export interface DataTableRange {
  start: number
  end: number
}

export interface DataTableSortRule {
  columnId: string
  direction: DataTableSortDirection
  priority?: number
}

export type DataTableSortState = Array<DataTableSortRule>

export interface DataTableFilterRule {
  columnId: string
  operator: DataTableFilterOperator
  value: unknown
}

export type DataTableFilterState = Array<DataTableFilterRule>

export interface DataTableFilterExpression {
  logic: DataTableFilterExpressionLogic
  rules: Array<DataTableFilterRule | DataTableFilterExpression>
}

export interface DataTableSearchRange {
  start: number
  end: number
}

export interface DataTableSearchQuery {
  text: string
  scope?: DataTableSearchScope
  match?: DataTableSearchMatchMode
  caseSensitive?: boolean
  columns?: Array<string>
  highlight?: DataTableSearchHighlightMode
  filter?: boolean
  highlightColor?: string
  activeHighlightColor?: string
}

export interface DataTableSearchMatch {
  rowId?: DataTableRowId
  rowIndex: number
  storeIndex?: number
  columnId?: string
  columnIndex?: number
  value: string
  ranges: Array<DataTableSearchRange>
}

export interface DataTableSearchResult {
  matches: Array<DataTableSearchMatch>
  total?: number
  cursor?: string
  previousCursor?: string
  hasMore?: boolean
}

export interface DataTableSearchState {
  query: DataTableSearchQuery
  matches: Array<DataTableSearchMatch>
  activeIndex: number
  activeMatch: DataTableSearchMatch | null
  total: number
  mode: DataTableViewMode | 'off'
  local: boolean
  loading: boolean
  cursor?: string
  previousCursor?: string
  hasMore: boolean
}

export interface DataTableSelectionAnchor {
  rowId: DataTableRowId
  rowIndex: number
  columnId: string
  columnIndex: number
}

export interface DataTableSelectionRange {
  id: string
  unit: DataTableSelectionUnit
  startRowIndex?: number
  endRowIndex?: number
  startRowId?: DataTableRowId
  endRowId?: DataTableRowId
  startColumnId?: string
  endColumnId?: string
  columnIds?: Array<string>
}

export interface DataTableSelectionState {
  mode: DataTableSelectionMode
  activeCell: DataTableSelectionAnchor | null
  anchor: DataTableSelectionAnchor | null
  ranges: Array<DataTableSelectionRange>
  previewRange: DataTableSelectionRange | null
  rowId?: DataTableRowId
  rowIndex?: number
  columnId?: string
  columnIndex?: number
}

export interface DataTableSelectionOptions {
  enabled?: boolean
  mode?: DataTableSelectionMode
  cardinality?: DataTableSelectionCardinality
  allowedUnits?: {
    cells?: boolean
    rows?: boolean
    columns?: boolean
  }
  gestures?: {
    dragRange?: boolean
    shiftRange?: boolean
    ctrlToggle?: boolean
    metaToggle?: boolean
    headerSelectColumn?: boolean
    rowSelect?: boolean
    autoScrollOnDrag?: boolean
  }
  behavior?: {
    clearOnPlainClick?: boolean
    selectOnMouseDown?: boolean
    preserveOnDrag?: boolean
    groupRows?: DataTableSelectionGroupRowsMode
  }
  visuals?: {
    fillColor?: string
    borderColor?: string
    activeCellBorderColor?: string
    previewFillColor?: string
  }
}

export interface DataTableResolvedSelectionOptions {
  enabled: boolean
  mode: DataTableSelectionMode
  cardinality: DataTableSelectionCardinality
  allowedUnits: {
    cells: boolean
    rows: boolean
    columns: boolean
  }
  gestures: {
    dragRange: boolean
    shiftRange: boolean
    ctrlToggle: boolean
    metaToggle: boolean
    headerSelectColumn: boolean
    rowSelect: boolean
    autoScrollOnDrag: boolean
  }
  behavior: {
    clearOnPlainClick: boolean
    selectOnMouseDown: boolean
    preserveOnDrag: boolean
    groupRows: DataTableSelectionGroupRowsMode
  }
  visuals: {
    fillColor: string
    borderColor: string
    activeCellBorderColor: string
    previewFillColor: string
  }
}

export interface DataTableSelectionUpdateOptions {
  append?: boolean
  toggle?: boolean
  focus?: boolean
  scrollIntoView?: boolean
}

export interface DataTableClipboardCopyOptions {
  format?: DataTableClipboardFormat
  includeHeaders?: boolean
  onlyVisibleColumns?: boolean
}

export interface DataTableClipboardPasteOptions {
  enabled?: boolean
  parseFormat?: DataTablePasteParseFormat
  overflow?: DataTablePasteOverflowPolicy
  invalid?: DataTablePasteInvalidPolicy
  readonly?: DataTablePasteReadonlyPolicy
  commit?: DataTablePasteCommitPolicy
}

export interface DataTableClipboardOptions<Row extends Record<string, any> = Record<string, any>> {
  copy?: boolean | DataTableClipboardCopyOptions
  paste?: false | DataTableClipboardPasteOptions
  onBeforeCopy?: (payload: DataTableCopyPayload<Row>) => string | false | void
  onCopy?: (payload: DataTableCopyPayload<Row> & { text: string }) => void
  onBeforePaste?: (payload: DataTablePastePayload<Row>) => false | Array<DataTableDelta<Row>> | void | Promise<false | Array<DataTableDelta<Row>> | void>
  onPasteCommit?: (result: DataTablePasteResult<Row>) => void
  onPasteError?: (error: DataTablePasteError<Row>) => void
}

export interface DataTableResolvedClipboardOptions<Row extends Record<string, any> = Record<string, any>> {
  copy: false | Required<DataTableClipboardCopyOptions>
  paste: false | Required<DataTableClipboardPasteOptions>
  onBeforeCopy?: DataTableClipboardOptions<Row>['onBeforeCopy']
  onCopy?: DataTableClipboardOptions<Row>['onCopy']
  onBeforePaste?: DataTableClipboardOptions<Row>['onBeforePaste']
  onPasteCommit?: DataTableClipboardOptions<Row>['onPasteCommit']
  onPasteError?: DataTableClipboardOptions<Row>['onPasteError']
}

export interface DataTableCopyPayload<Row extends Record<string, any> = Record<string, any>> {
  selection: DataTableSelectionState
  ranges: Array<DataTableSelectionRange>
  store: DataTableStoreApi<Row>
  api: DataTableRootApi<Row>
}

export interface DataTablePastePayload<Row extends Record<string, any> = Record<string, any>> {
  text: string
  matrix: Array<Array<string>>
  selection: DataTableSelectionState | null
  store: DataTableStoreApi<Row>
  api: DataTableRootApi<Row>
}

export interface DataTablePasteInvalidCell {
  rowId?: DataTableRowId
  rowIndex: number
  columnId: string
  raw: string
  message: string
}

export interface DataTablePasteResult<Row extends Record<string, any> = Record<string, any>> {
  committed: number
  skipped: number
  invalid: Array<DataTablePasteInvalidCell>
  deltas: Array<DataTableDelta<Row>>
}

export interface DataTablePasteError<Row extends Record<string, any> = Record<string, any>> {
  message: string
  error?: unknown
  result?: DataTablePasteResult<Row>
}

export type DataTableAggregator<Row extends Record<string, any> = Record<string, any>> =
  | 'count'
  | 'sum'
  | 'avg'
  | 'min'
  | 'max'
  | ((rows: Array<Row>, context: DataTableGroupContext<Row>) => unknown)

export interface DataTableGroupRule<Row extends Record<string, any> = Record<string, any>> {
  id: string
  title?: string
  field?: keyof Row | string
  value?: (row: Row, index: number) => unknown
  sort?: 'asc' | 'desc' | ((a: DataTableGroupNode<Row>, b: DataTableGroupNode<Row>) => number)
  aggregates?: Record<string, DataTableAggregator<Row>>
}

export interface DataTableGroupContext<Row extends Record<string, any> = Record<string, any>> {
  rule?: DataTableGroupRule<Row>
  groupId: string
  key: unknown
  label: string
  title: string
  depth: number
  rows: Array<Row>
  count: number
}

export interface DataTableGroupNode<Row extends Record<string, any> = Record<string, any>>
  extends DataTableGroupContext<Row> {
  parentId?: string
  aggregate: Record<string, unknown>
  expanded: boolean
  children: Array<DataTableGroupNode<Row> | DataTableDataViewRow<Row>>
}

export interface DataTableGroupingState<Row extends Record<string, any> = Record<string, any>> {
  enabled: boolean
  mode: DataTableViewMode | 'off'
  groups: Array<DataTableGroupRule<Row>>
  expanded: 'all' | 'none' | Array<string>
  expandedGroups: Array<string>
  footerPlacement: DataTableGroupFooterPlacement
}

export interface DataTableGroupingQueryState<Row extends Record<string, any> = Record<string, any>> {
  enabled: boolean
  groups: Array<DataTableGroupRule<Row>>
  expanded: 'all' | 'none' | Array<string>
  footerPlacement: DataTableGroupFooterPlacement
}

export interface DataTableGroupingPinnedRowsOptions {
  global?: 'show' | 'hide'
  insideGroup?: boolean
  placement?: DataTableGroupingPinnedPlacement
}

export interface DataTableResolvedGroupingPinnedRowsOptions {
  global: 'show' | 'hide'
  insideGroup: boolean
  placement: DataTableGroupingPinnedPlacement
}

export interface DataTableQueryState {
  sort: DataTableSortState
  filters: DataTableFilterState | DataTableFilterExpression
  search?: DataTableSearchQuery
  rowOrder: Array<DataTableRowId>
  columnOrder: Array<string>
  grouping?: DataTableGroupingQueryState
}

export interface DataTableSourceRequestContext {
  revision: number
  requestId: number
  signal?: AbortSignal
}

export type DataTableRowKey<Row extends Record<string, any>> = keyof Row | ((row: Row, index: number) => DataTableRowId)

export type DataTableDelta<Row extends Record<string, any> = Record<string, any>> =
  | { type: 'patch'; rowId: DataTableRowId; patch: Partial<Row> }
  | { type: 'setCell'; rowId: DataTableRowId; columnId: string; value: unknown }
  | { type: 'insert'; index?: number; rows: Array<Row> }
  | { type: 'remove'; rowIds: Array<DataTableRowId> }
  | { type: 'move'; rowId: DataTableRowId; toIndex: number }
  | { type: 'replaceRange'; start: number; rows: Array<Row> }

export interface DataTableTransaction<Row extends Record<string, any> = Record<string, any>> {
  id: string
  label?: string
  source: DataTableCommitSource
  deltas: Array<DataTableDelta<Row>>
  inverseDeltas: Array<DataTableDelta<Row>>
  timestamp: number
  status: 'pending' | 'committed' | 'failed' | 'reverted'
}

export interface DataTableHistoryOptions {
  enabled?: boolean
  maxEntries?: number
  mergeWindowMs?: number
  include?: Array<DataTableCommitSource>
}

export interface DataTableResolvedHistoryOptions {
  enabled: boolean
  maxEntries: number
  mergeWindowMs: number
  include: Array<DataTableCommitSource>
}

export interface DataTableHistoryState<Row extends Record<string, any> = Record<string, any>> {
  canUndo: boolean
  canRedo: boolean
  undoDepth: number
  redoDepth: number
  current?: DataTableTransaction<Row>
}

export interface DataTableFillHandleOptions {
  enabled?: boolean
  mode?: DataTableFillHandleMode
  directions?: Array<DataTableFillDirection>
}

export interface DataTableResolvedFillHandleOptions {
  enabled: boolean
  mode: DataTableFillHandleMode
  directions: Array<DataTableFillDirection>
}

export interface DataTableDirtyCell {
  rowId: DataTableRowId
  columnId: string
}

export interface DataTableDirtyState {
  pages: Array<number>
  rows: Array<DataTableRowId>
  cells: Array<DataTableDirtyCell>
  structural: boolean
  summary: boolean
  revision: number
  dataRevision: number
  structureRevision: number
}

export interface DataTablePerformanceOptions {
  pageSize?: number
  maxClientRows?: number
  deltaFrameBudgetMs?: number
  workerPipeline?: boolean
  workerThresholdRows?: number
  indexSearch?: boolean
  indexFilters?: boolean
  memoryBudgetMb?: number
  text?: false | DataTableTextPerformanceOptions
}

export interface DataTableResolvedPerformanceOptions {
  pageSize: number
  maxClientRows: number
  deltaFrameBudgetMs: number
  workerPipeline: boolean
  workerThresholdRows: number
  indexSearch: boolean
  indexFilters: boolean
  memoryBudgetMb: number
  text: false | DataTableResolvedTextPerformanceOptions
}

export interface DataTableRenderDiagnostics {
  layerRebuilds: Record<string, number>
  templateCalls: number
  interactionRebuilds: number
  animatedLayerRebuilds: number
  schemaSegments: number
  schemaItems: number
  rectBatchSegments: number
  rectBatchItems: number
}

export interface DataTableServerRowModelOptions {
  enabled?: boolean
  authoritative?: boolean
  subscribe?: boolean
  loadSummary?: boolean
  conflictPolicy?: 'server-wins' | 'client-wins' | 'merge'
  retry?: false | {
    attempts?: number
    backoffMs?: number
  }
}

export interface DataTableResolvedServerRowModelOptions {
  enabled: boolean
  authoritative: boolean
  subscribe: boolean
  loadSummary: boolean
  conflictPolicy: 'server-wins' | 'client-wins' | 'merge'
  retry: false | {
    attempts: number
    backoffMs: number
  }
}

export interface DataTableKeyboardNavigationOptions {
  enabled?: boolean
  arrows?: boolean
  tab?: DataTableKeyboardTabAction | false
  enter?: DataTableKeyboardEnterAction | false
  pageKeys?: boolean
  homeEnd?: boolean
  shiftSelection?: boolean
  ctrlMetaShortcuts?: boolean
}

export interface DataTableResolvedKeyboardNavigationOptions {
  enabled: boolean
  arrows: boolean
  tab: DataTableKeyboardTabAction | false
  enter: DataTableKeyboardEnterAction | false
  pageKeys: boolean
  homeEnd: boolean
  shiftSelection: boolean
  ctrlMetaShortcuts: boolean
}

export interface DataTableColumnState {
  widths?: Record<string, number>
  order?: Array<string>
  hidden?: Array<string>
  pinned?: DataTablePinnedColumns
  groups?: Array<DataTableColumnGroupInput>
  autosizeMode?: DataTableColumnAutosizeMode
  version?: number
}

export interface DataTableResolvedColumnState {
  widths: Record<string, number>
  order: Array<string>
  hidden: Array<string>
  pinned: {
    left: Array<string>
    right: Array<string>
  }
  groups: Array<DataTableColumnGroupInput>
  autosizeMode: DataTableColumnAutosizeMode
  version: number
}

export interface DataTableColumnGroupInput {
  id: string
  title: string
  children: Array<string>
  pinned?: DataTablePinnedColumnSide
}

export type DataTableStateSlice =
  | 'columnState'
  | 'sort'
  | 'filters'
  | 'search'
  | 'grouping'

export interface DataTableStatePersistenceOptions {
  key: string
  storage?: 'localStorage' | 'sessionStorage'
  include?: Array<DataTableStateSlice>
  debounceMs?: number
  version?: number
  migrate?: (state: DataTablePersistedState, fromVersion: number) => DataTablePersistedState
}

export interface DataTableResolvedStatePersistenceOptions {
  key: string
  storage: 'localStorage' | 'sessionStorage'
  include: Array<DataTableStateSlice>
  debounceMs: number
  version: number
  migrate?: (state: DataTablePersistedState, fromVersion: number) => DataTablePersistedState
}

export interface DataTablePersistedState<Row extends Record<string, any> = Record<string, any>> {
  version: number
  savedAt: number
  columnState?: DataTableColumnState
  sort?: DataTableSortState
  filters?: DataTableFilterState | DataTableFilterExpression
  search?: DataTableSearchQuery
  grouping?: {
    enabled: boolean
    groups: Array<DataTableGroupRule<Row>>
    expanded: 'all' | 'none' | Array<string>
    footerPlacement?: DataTableGroupFooterPlacement
  }
}

export interface DataTableKeyboardAction {
  type: 'move' | 'select-all' | 'copy' | 'paste' | 'edit' | 'cancel' | 'commit'
  key: string
  direction?: DataTableActiveCellDirection
}

export interface DataTableSummaryState {
  values: Record<string, unknown>
  rowCount: number
  revision: number
  source: 'client' | 'server'
  loading: boolean
}

export type DataTableTextPerformanceMode = 'quality' | 'balanced' | 'fast' | 'ultra-fast'
export type DataTableTextPerformanceCache = 'none' | 'visible-reuse'
export type DataTableTextPerformanceRaster = 'sync' | 'deferred'
export type DataTableTextPerformanceTruncate = 'ellipsis' | 'clip'

export interface DataTableTextPerformanceOptions {
  visible?: boolean
  renderMode?: NovaTextRenderMode
  mode?: DataTableTextPerformanceMode
  cache?: DataTableTextPerformanceCache
  raster?: DataTableTextPerformanceRaster
  batchDefaultCells?: boolean
  maxTextRasterPerFrame?: number
  skipSubpixelText?: boolean
  disableTextSelectionIndexOnScroll?: boolean
  truncate?: DataTableTextPerformanceTruncate
  refineAfterZoomMs?: number
  refineAfterScrollMs?: number
}

export interface DataTableResolvedTextPerformanceOptions {
  visible: boolean
  renderMode: NovaTextRenderMode
  mode: DataTableTextPerformanceMode
  cache: DataTableTextPerformanceCache
  raster: DataTableTextPerformanceRaster
  batchDefaultCells: boolean
  maxTextRasterPerFrame: number
  skipSubpixelText: boolean
  disableTextSelectionIndexOnScroll: boolean
  truncate: DataTableTextPerformanceTruncate
  refineAfterZoomMs: number
  refineAfterScrollMs: number
}

export interface DataTableLazySource<Row extends Record<string, any>> {
  rowCount: number
  getRow?: (index: number) => Row | undefined
  loadRange?: (
    range: DataTableRange,
    query?: DataTableQueryState,
    context?: DataTableSourceRequestContext,
  ) => Promise<Array<Row> | void> | Array<Row> | void
  loadSummary?: (query?: DataTableQueryState) => Promise<Record<string, unknown> | void> | Record<string, unknown> | void
  loadFilterValues?: (
    columnId: string,
    query?: DataTableQueryState,
    cursor?: string,
  ) => Promise<{ values: Array<unknown>; cursor?: string; hasMore?: boolean } | void> | { values: Array<unknown>; cursor?: string; hasMore?: boolean } | void
  search?: (
    search: DataTableSearchQuery,
    query?: DataTableQueryState,
    cursor?: string,
    direction?: DataTableSearchDirection,
  ) => Promise<DataTableSearchResult | void> | DataTableSearchResult | void
  resolveRowIndex?: (rowId: DataTableRowId, query?: DataTableQueryState) => Promise<number | undefined> | number | undefined
  subscribe?: (query: DataTableQueryState, emitDelta: (delta: DataTableDelta<Row> | Array<DataTableDelta<Row>>) => void) => (() => void) | void
}

export interface DataTableStoreOptions<Row extends Record<string, any>> {
  rowKey: DataTableRowKey<Row>
  rows?: Array<Row>
  estimateRowCount?: number
  source?: DataTableLazySource<Row>
  performance?: DataTablePerformanceOptions
}

export interface DataTableAutoWidthOptions {
  mode: 'auto'
  min?: number
  max?: number
  sampleSize?: number
  includeHeader?: boolean
  padding?: number
}

export type DataTableColumnWidth = number | DataTableAutoWidthOptions

export interface DataTableCellState {
  rect: DataTableCellRect
  rowIndex: number
  viewRowIndex: number
  storeIndex?: number
  columnIndex: number
  selected: boolean
  selectionActive: boolean
  selectionRangeId?: string
  activeCell: boolean
  hovered: boolean
  cellHovered: boolean
  rowHovered: boolean
  columnHovered: boolean
  cellSelected: boolean
  rowSelected: boolean
  columnSelected: boolean
  hoverAlpha: number
  selectionAlpha: number
  zoom: number
  rowScale: number
  headerScale: number
  columnScale: number
  textScale: number
  iconScale: number
  pinnedColumn?: DataTablePinnedColumnSide
  pinnedRow?: DataTablePinnedRowPosition
  sorted?: DataTableSortDirection
  sortPriority?: number
  filtered?: boolean
  searchMatched: boolean
  searchActive: boolean
  searchRowMatched: boolean
  searchRowActive: boolean
  searchMatchIndex?: number
  searchRanges?: Array<DataTableSearchRange>
  editing: boolean
  editingInvalid: boolean
  editingDirty: boolean
  editingMessage?: string
  editPending?: boolean
  editError?: unknown
  editRollback?: boolean
  editTransactionId?: string
  dragging?: boolean
}

export interface DataTableCellRect {
  x: number
  y: number
  width: number
  height: number
}

export interface DataTableCellContext<Row extends Record<string, any> = Record<string, any>> {
  row: Row
  rowId: DataTableRowId
  rowIndex: number
  viewRowIndex: number
  storeIndex?: number
  column: DataTableResolvedColumn<Row>
  columnIndex: number
  value: unknown
  rect: DataTableCellRect
  state: DataTableCellState
  zone: 'header' | 'body' | 'pinned-top' | 'pinned-bottom' | 'group' | 'group-footer' | 'grand-footer'
  store: DataTableStoreApi<Row>
  api: DataTableRootApi<Row>
}

export type DataTableTemplate<Row extends Record<string, any> = Record<string, any>> = (
  context: DataTableCellContext<Row>,
) => NovaSchema

export interface DataTableEditorConfig<Row extends Record<string, any> = Record<string, any>> {
  type: DataTableEditorType
  options?: unknown
  parse?: (raw: unknown, context: DataTableEditContext<Row>) => unknown
  format?: (value: unknown, context: DataTableEditContext<Row>) => string
  validate?: (value: unknown, context: DataTableEditContext<Row>) => true | string | Promise<true | string>
}

export interface DataTableEditContext<Row extends Record<string, any> = Record<string, any>> {
  row: Row
  rowId: DataTableRowId
  rowIndex: number
  viewRowIndex: number
  storeIndex?: number
  column: DataTableResolvedColumn<Row>
  columnIndex: number
  value: unknown
  initialValue: unknown
  draft: unknown
  rect: DataTableCellRect
  state: DataTableCellState
  zone: DataTableCellContext<Row>['zone']
  store: DataTableStoreApi<Row>
  api: DataTableRootApi<Row>
}

export interface DataTableEditingState<Row extends Record<string, any> = Record<string, any>>
  extends DataTableEditContext<Row> {
  renderer: 'dom-overlay'
  mode: 'cell'
  active: true
  dirty: boolean
  invalid: boolean
  message?: string
  pending?: boolean
  error?: unknown
  rollback?: boolean
  transactionId?: string
}

export interface DataTableEditCommitPayload<Row extends Record<string, any> = Record<string, any>> {
  state: DataTableEditingState<Row>
  value: unknown
  previousValue: unknown
  rowId: DataTableRowId
  columnId: string
  row: Row
  draft: unknown
  parsedValue: unknown
  transactionId: string
  source: DataTableCommitSource
}

export interface DataTableEditError<Row extends Record<string, any> = Record<string, any>> {
  state: DataTableEditingState<Row>
  error: unknown
  message?: string
}

export interface DataTableDomEditorContext<Row extends Record<string, any> = Record<string, any>>
  extends DataTableEditingState<Row> {
  setDraft: (value: unknown) => void
  commit: (value?: unknown) => void | Promise<void>
  cancel: () => void
}

export type DataTableDomEditorTemplate<Row extends Record<string, any> = Record<string, any>> = (
  context: DataTableDomEditorContext<Row>,
) => unknown

export interface DataTableEditingOptions<Row extends Record<string, any> = Record<string, any>> {
  renderer?: 'dom-overlay'
  mode?: 'cell'
  trigger?: DataTableEditTrigger | Array<DataTableEditTrigger>
  commitOnBlur?: boolean
  commitOnEnter?: boolean
  cancelOnEscape?: boolean
  selectTextOnStart?: boolean
  optimistic?: boolean
  commitStrategy?: DataTableEditCommitStrategy
  className?: string
  onBeforeEditStart?: (context: DataTableCellContext<Row>) => boolean | void
  onEditStart?: (state: DataTableEditingState<Row>) => void
  onBeforeEditCommit?: (payload: DataTableEditCommitPayload<Row>) => true | string | Promise<true | string>
  onEditPending?: (payload: DataTableEditCommitPayload<Row>) => void
  onEditCommit?: (payload: DataTableEditCommitPayload<Row>) => void | Promise<void>
  onEditSuccess?: (payload: DataTableEditCommitPayload<Row>) => void
  onEditRollback?: (payload: DataTableEditCommitPayload<Row>) => void
  onEditCancel?: (state: DataTableEditingState<Row>) => void
  onEditError?: (error: DataTableEditError<Row>) => void
}

export interface DataTableResolvedEditingOptions<Row extends Record<string, any> = Record<string, any>> {
  renderer: 'dom-overlay'
  mode: 'cell'
  trigger: Array<DataTableEditTrigger>
  commitOnBlur: boolean
  commitOnEnter: boolean
  cancelOnEscape: boolean
  selectTextOnStart: boolean
  optimistic: boolean
  commitStrategy: DataTableEditCommitStrategy
  className: string
  onBeforeEditStart?: (context: DataTableCellContext<Row>) => boolean | void
  onEditStart?: (state: DataTableEditingState<Row>) => void
  onBeforeEditCommit?: (payload: DataTableEditCommitPayload<Row>) => true | string | Promise<true | string>
  onEditPending?: (payload: DataTableEditCommitPayload<Row>) => void
  onEditCommit?: (payload: DataTableEditCommitPayload<Row>) => void | Promise<void>
  onEditSuccess?: (payload: DataTableEditCommitPayload<Row>) => void
  onEditRollback?: (payload: DataTableEditCommitPayload<Row>) => void
  onEditCancel?: (state: DataTableEditingState<Row>) => void
  onEditError?: (error: DataTableEditError<Row>) => void
}

export interface DataTableAccessibilityOptions {
  enabled?: boolean
  mode?: DataTableAccessibilityMode
  announceSelection?: boolean
  announceEdits?: boolean
  highContrast?: boolean
}

export interface DataTableResolvedAccessibilityOptions {
  enabled: boolean
  mode: DataTableAccessibilityMode
  announceSelection: boolean
  announceEdits: boolean
  highContrast: boolean
}

export interface DataTableAccessibilityState {
  role: 'grid' | 'application'
  activeDescription: string
  liveMessage: string
  highContrast: boolean
}

export interface DataTableInteractionHoverOptions {
  mode?: DataTableHoverMode
  rowColor?: string
  columnColor?: string
  cellColor?: string
  pinned?: boolean
}

export interface DataTableInteractionSelectionOptions {
  mode?: DataTableSelectionMode
  color?: string
  borderColor?: string
}

export interface DataTableInteractionCellMotionOptions {
  enter?: DataTableCellEnterMotion
  duration?: number
  stagger?: number
  maxAnimatedCells?: number
}

export interface DataTableInteractionMotionOptions {
  hover?: NovaMotionOptions
  selection?: NovaMotionOptions
  cells?: false | DataTableInteractionCellMotionOptions
}

export interface DataTableInteractionOptions {
  hover?: false | DataTableInteractionHoverOptions
  selection?: false | DataTableInteractionSelectionOptions
  motion?: false | DataTableInteractionMotionOptions
}

export interface DataTableResolvedInteractionOptions {
  hover: false | Required<DataTableInteractionHoverOptions>
  selection: false | Required<DataTableInteractionSelectionOptions>
  motion: false | {
    hover: NovaMotionOptions
    selection: NovaMotionOptions
    cells: false | Required<DataTableInteractionCellMotionOptions>
  }
}

export interface DataTableInteractionTarget<Row extends Record<string, any> = Record<string, any>> {
  row?: Row
  rowId?: DataTableRowId
  rowIndex: number
  storeIndex?: number
  column: DataTableResolvedColumn<Row>
  columnIndex: number
  rect: DataTableCellRect
  zone: DataTableCellContext<Row>['zone']
  value?: unknown
}

export interface DataTableInteractionState<Row extends Record<string, any> = Record<string, any>> {
  hover: DataTableInteractionTarget<Row> | null
  selection: DataTableSelectionState | null
  hoverAlpha: number
  selectionAlpha: number
}

export interface DataTableInteractionLayerContext<Row extends Record<string, any> = Record<string, any>> {
  hover: DataTableInteractionTarget<Row> | null
  selection: DataTableSelectionState | null
  viewport: DataTableViewport
  rects: Array<DataTableCellRect>
  state: DataTableInteractionState<Row>
}

export type DataTableInteractionLayerTemplate<Row extends Record<string, any> = Record<string, any>> = (
  context: DataTableInteractionLayerContext<Row>,
) => NovaSchema

export interface DataTableTooltipContext<Row extends Record<string, any> = Record<string, any>> {
  cell: DataTableCellContext<Row>
  target: DataTableInteractionTarget<Row>
  viewport: DataTableViewport
  store: DataTableStoreApi<Row>
  api: DataTableRootApi<Row>
}

export type DataTableCellTooltip<Row extends Record<string, any> = Record<string, any>> =
  | TooltipContent
  | ((context: DataTableCellContext<Row>) => TooltipContent | null | undefined)

export interface DataTableTooltipOptions<Row extends Record<string, any> = Record<string, any>> {
  enabled?: boolean
  modifier?: TooltipModifier | false
  placement?: TooltipPlacement
  delay?: number
  hideDelay?: number
  followCursor?: boolean
  collision?: TooltipCollisionOptions
  animation?: false | TooltipAnimationOptions
  className?: string | Array<string>
  contentClassName?: string | Array<string>
  width?: number
  height?: number
  background?: string
  color?: string
  border?: NovaUiCommonProps['border']
  padding?: NovaUiCommonProps['padding']
  fontFamily?: string
  fontSize?: number
  fontWeight?: NovaUiCommonProps['fontWeight']
  lineHeight?: number
  defaultContent?: boolean
  content?: (context: DataTableTooltipContext<Row>) => TooltipContent | null | undefined
}

export interface DataTableResolvedTooltipOptions<Row extends Record<string, any> = Record<string, any>>
  extends Required<Pick<DataTableTooltipOptions<Row>, 'enabled' | 'placement' | 'delay' | 'hideDelay' | 'followCursor' | 'defaultContent'>> {
  modifier: TooltipModifier | false
  collision: Required<TooltipCollisionOptions>
  animation: false | Required<TooltipAnimationOptions>
  className: string | Array<string>
  contentClassName: string | Array<string>
  width: number
  height: number
  background: string
  color: string
  border: NovaUiCommonProps['border']
  padding: NovaUiCommonProps['padding']
  fontFamily: string
  fontSize: number
  fontWeight: NovaUiCommonProps['fontWeight']
  lineHeight: number
  content?: (context: DataTableTooltipContext<Row>) => TooltipContent | null | undefined
}

export interface DataTableTextSelectionOptions {
  enabled?: boolean
  mode?: 'visible-cells' | 'explicit'
  cellText?: boolean
  headerText?: boolean
  pinnedRows?: boolean
  copyFormat?: 'plain' | 'tsv'
  selectionColor?: string
}

export interface DataTableResolvedTextSelectionOptions {
  enabled: boolean
  mode: 'visible-cells' | 'explicit'
  cellText: boolean
  headerText: boolean
  pinnedRows: boolean
  copyFormat: 'plain' | 'tsv'
  selectionColor: string
}

export interface DataTableZoomWheelOptions {
  enabled?: boolean
  modifier?: TooltipModifier | Array<TooltipModifier> | false
  pinch?: boolean
  step?: number
}

export interface DataTableResolvedZoomWheelOptions {
  enabled: boolean
  modifier: TooltipModifier | Array<TooltipModifier> | false
  pinch: boolean
  step: number
}

export interface DataTableZoomOptions {
  value?: number
  min?: number
  max?: number
  mode?: DataTableZoomMode
  affects?: Array<DataTableZoomAffect>
  rowScale?: number
  headerScale?: number
  columnScale?: number
  textScale?: number
  iconScale?: number
  preserveAnchor?: 'viewport' | 'pointer'
  wheel?: false | DataTableZoomWheelOptions
}

export interface DataTableResolvedZoomOptions {
  value: number
  min: number
  max: number
  mode: DataTableZoomMode
  affects: Array<DataTableZoomAffect>
  rowScale: number
  headerScale: number
  columnScale: number
  textScale: number
  iconScale: number
  preserveAnchor: 'viewport' | 'pointer'
  wheel: false | DataTableResolvedZoomWheelOptions
}

export interface DataTableZoomState {
  value: number
  mode: DataTableZoomMode
  affects: Array<DataTableZoomAffect>
  rowScale: number
  headerScale: number
  columnScale: number
  textScale: number
  iconScale: number
}

export interface DataTableScrollbarAxisOptions extends NovaScrollbarVisualOptions {
  visibility?: DataTableScrollbarVisibility
}

export interface DataTableScrollbarOptions extends DataTableScrollbarAxisOptions {
  hideDelay?: number
  horizontal?: false | DataTableScrollbarAxisOptions
  vertical?: false | DataTableScrollbarAxisOptions
  nativeRenderer?: boolean
}

export interface DataTableResolvedScrollbarAxisOptions extends NovaScrollbarResolvedVisualOptions {
  visibility: DataTableScrollbarVisibility
}

export interface DataTableResolvedScrollbarOptions extends DataTableResolvedScrollbarAxisOptions {
  hideDelay: number
  horizontal: false | DataTableResolvedScrollbarAxisOptions
  vertical: false | DataTableResolvedScrollbarAxisOptions
  nativeRenderer: boolean
}

export interface DataTableScrollbarGeometry extends Omit<NovaScrollbarGeometry, 'axis' | 'track' | 'thumb' | 'options'> {
  axis: DataTableScrollbarAxis
  track: DataTableCellRect
  thumb: DataTableCellRect
  options: DataTableResolvedScrollbarAxisOptions
}

export interface DataTableScrollbarState extends NovaScrollbarVisualState {
  hoveredAxis: DataTableScrollbarAxis | null
  draggingAxis: DataTableScrollbarAxis | null
  pointerInside: boolean
}

export interface DataTableScrollbarLayerContext<Row extends Record<string, any> = Record<string, any>> {
  horizontal: DataTableScrollbarGeometry | null
  vertical: DataTableScrollbarGeometry | null
  viewport: DataTableViewport
  state: DataTableScrollbarState
  actions: {
    scrollTo: (x: number, y: number) => void
    scrollBy: (dx: number, dy: number) => void
    startDrag: (axis: DataTableScrollbarAxis, event?: MouseEvent) => void
  }
  store: DataTableStoreApi<Row>
  api: DataTableRootApi<Row>
}

export type DataTableScrollbarLayerTemplate<Row extends Record<string, any> = Record<string, any>> = (
  context: DataTableScrollbarLayerContext<Row>,
) => NovaSchema

export interface DataTableGroupTemplateState {
  expanded: boolean
  hovered: boolean
  pinned: boolean
}

export interface DataTableGroupTemplateContext<Row extends Record<string, any> = Record<string, any>> {
  group?: DataTableGroupNode<Row>
  aggregate: Record<string, unknown>
  rows: Array<Row>
  viewport: DataTableViewport
  rect: DataTableCellRect
  zone: 'group' | 'group-footer' | 'grand-footer' | 'pinned-bottom'
  state: DataTableGroupTemplateState
  toggle: () => void
  api: DataTableRootApi<Row>
}

export type DataTableGroupTemplate<Row extends Record<string, any> = Record<string, any>> = (
  context: DataTableGroupTemplateContext<Row>,
) => NovaSchema

export interface DataTableSortConfig<Row extends Record<string, any> = Record<string, any>> {
  accessor?: (row: Row, index: number) => unknown
  compare?: (a: unknown, b: unknown, aRow: Row, bRow: Row) => number
  comparator?: string
  nulls?: 'first' | 'last'
}

export interface DataTableFilterContext<Row extends Record<string, any> = Record<string, any>> {
  row: Row
  rowId: DataTableRowId
  rowIndex: number
  column: DataTableResolvedColumn<Row>
  value: unknown
  operator: DataTableFilterOperator
  filterValue: unknown
}

export interface DataTableFilterConfig<Row extends Record<string, any> = Record<string, any>> {
  type?: DataTableFilterPreset | string
  operators?: Array<DataTableFilterOperator>
  defaultOperator?: DataTableFilterOperator
  defaultValue?: unknown
  options?: Array<unknown>
  predicate?: (context: DataTableFilterContext<Row>) => boolean
  serialize?: (value: unknown) => unknown
  filterTemplate?: DataTableTemplate<Row>
}

export interface DataTableViewSortingOptions {
  mode?: DataTableViewMode
  multi?: boolean
  headerClick?: DataTableSortHeaderClickMode
  initial?: DataTableSortState
  controlled?: boolean
}

export interface DataTableViewFilteringOptions {
  mode?: DataTableViewMode
  initial?: DataTableFilterState | DataTableFilterExpression
  controlled?: boolean
}

export interface DataTableViewSearchOptions extends Omit<DataTableSearchQuery, 'text'> {
  mode?: DataTableViewMode
  controlled?: boolean
}

export interface DataTableRowOrderingOptions {
  enabled?: boolean
  mode?: 'view' | 'store'
  manualLayer?: boolean
}

export interface DataTableColumnOrderingOptions {
  enabled?: boolean
  allowCrossPinned?: boolean
  order?: Array<string>
}

export interface DataTableFilterUiOptions {
  headerMenu?: boolean
  filterRow?: boolean
  advancedPanel?: boolean
  chips?: boolean
}

export interface DataTableViewGroupingOptions<Row extends Record<string, any> = Record<string, any>> {
  enabled?: boolean
  mode?: DataTableViewMode
  groups?: Array<DataTableGroupRule<Row>>
  expanded?: 'all' | 'none' | Array<string>
  showGroupRows?: boolean
  showGroupFooters?: boolean
  showGrandFooter?: boolean
  footerPlacement?: DataTableGroupFooterPlacement
  controlled?: boolean
}

export interface DataTableTreeDataOptions<Row extends Record<string, any> = Record<string, any>> {
  enabled?: boolean
  getParentId?: (row: Row) => DataTableRowId | null
  getChildren?: (row: Row) => Array<Row> | Promise<Array<Row>>
  expanded?: 'all' | 'none' | Array<DataTableRowId>
  mode?: DataTableViewMode
}

export interface DataTableResolvedTreeDataOptions<Row extends Record<string, any> = Record<string, any>> {
  enabled: boolean
  getParentId?: (row: Row) => DataTableRowId | null
  getChildren?: (row: Row) => Array<Row> | Promise<Array<Row>>
  expanded: 'all' | 'none' | Array<DataTableRowId>
  mode: DataTableViewMode
}

export interface DataTableDetailRowsOptions<Row extends Record<string, any> = Record<string, any>> {
  enabled?: boolean
  height?: number | ((context: DataTableCellContext<Row>) => number)
  template?: DataTableDetailTemplate<Row>
  expanded?: Array<DataTableRowId>
}

export interface DataTableResolvedDetailRowsOptions<Row extends Record<string, any> = Record<string, any>> {
  enabled: boolean
  height: number | ((context: DataTableCellContext<Row>) => number)
  template?: DataTableDetailTemplate<Row>
  expanded: Array<DataTableRowId>
}

export type DataTableDetailTemplate<Row extends Record<string, any> = Record<string, any>> = (
  context: DataTableCellContext<Row> & { expanded: boolean },
) => NovaSchema | Array<NovaSchema> | null | undefined

export interface DataTableViewOptions {
  sorting?: false | DataTableViewSortingOptions
  filtering?: false | DataTableViewFilteringOptions
  search?: false | DataTableViewSearchOptions
  serverRowModel?: false | DataTableServerRowModelOptions
  rowOrdering?: false | DataTableRowOrderingOptions
  columnOrdering?: false | DataTableColumnOrderingOptions
  filterUi?: false | DataTableFilterUiOptions
  grouping?: false | DataTableViewGroupingOptions
  groupingPinnedRows?: false | DataTableGroupingPinnedRowsOptions
  treeData?: false | DataTableTreeDataOptions
}

export interface DataTableResolvedViewOptions {
  sorting: false | Required<Omit<DataTableViewSortingOptions, 'initial'>> & { initial: DataTableSortState }
  filtering: false | Required<Omit<DataTableViewFilteringOptions, 'initial'>> & { initial: DataTableFilterState | DataTableFilterExpression }
  search: false | Required<DataTableViewSearchOptions>
  serverRowModel: false | DataTableResolvedServerRowModelOptions
  rowOrdering: false | Required<DataTableRowOrderingOptions>
  columnOrdering: false | Required<DataTableColumnOrderingOptions>
  filterUi: false | Required<DataTableFilterUiOptions>
  grouping: false | Required<Omit<DataTableViewGroupingOptions, 'groups' | 'expanded'>> & {
    groups: Array<DataTableGroupRule>
    expanded: 'all' | 'none' | Array<string>
  }
  groupingPinnedRows: false | DataTableResolvedGroupingPinnedRowsOptions
  treeData: false | DataTableResolvedTreeDataOptions
}

export interface DataTableViewState {
  sort: DataTableSortState
  filters: DataTableFilterState | DataTableFilterExpression
  search: DataTableSearchState
  rowOrder: Array<DataTableRowId>
  columnOrder: Array<string>
  grouping: DataTableGroupingState
  query: DataTableQueryState
  rowCount: number
  mode: {
    sorting: DataTableViewMode | 'off'
    filtering: DataTableViewMode | 'off'
    search: DataTableViewMode | 'off'
    grouping: DataTableViewMode | 'off'
  }
}

export interface DataTableDataViewRow<Row extends Record<string, any> = Record<string, any>> {
  kind: 'data'
  row?: Row
  rowId?: DataTableRowId
  storeIndex: number
  viewIndex: number
  depth: number
}

export interface DataTableGroupViewRow<Row extends Record<string, any> = Record<string, any>> {
  kind: 'group'
  group: DataTableGroupNode<Row>
  rowId: DataTableRowId
  storeIndex: number
  viewIndex: number
  depth: number
}

export interface DataTableGroupFooterViewRow<Row extends Record<string, any> = Record<string, any>> {
  kind: 'group-footer'
  group: DataTableGroupNode<Row>
  rowId: DataTableRowId
  storeIndex: number
  viewIndex: number
  depth: number
}

export interface DataTableGrandFooterViewRow<Row extends Record<string, any> = Record<string, any>> {
  kind: 'grand-footer'
  rowId: DataTableRowId
  storeIndex: number
  viewIndex: number
  depth: number
  aggregate: Record<string, unknown>
  rows: Array<Row>
}

export interface DataTableTreeViewRow<Row extends Record<string, any> = Record<string, any>> {
  kind: 'tree'
  row?: Row
  rowId?: DataTableRowId
  storeIndex: number
  viewIndex: number
  depth: number
  level: number
  expanded: boolean
}

export interface DataTableMasterViewRow<Row extends Record<string, any> = Record<string, any>> {
  kind: 'master'
  row?: Row
  rowId?: DataTableRowId
  storeIndex: number
  viewIndex: number
  depth: number
  detailExpanded: boolean
}

export interface DataTableDetailViewRow<Row extends Record<string, any> = Record<string, any>> {
  kind: 'detail'
  rowId: DataTableRowId
  storeIndex: number
  viewIndex: number
  depth: number
  sourceRow?: Row
  height: number
}

export type DataTableViewRow<Row extends Record<string, any> = Record<string, any>> =
  | DataTableDataViewRow<Row>
  | DataTableGroupViewRow<Row>
  | DataTableGroupFooterViewRow<Row>
  | DataTableGrandFooterViewRow<Row>
  | DataTableTreeViewRow<Row>
  | DataTableMasterViewRow<Row>
  | DataTableDetailViewRow<Row>

export interface DataTableRowReorderPayload {
  rowId: DataTableRowId
  fromIndex: number
  toIndex: number
  mode?: 'view' | 'store'
}

export interface DataTableColumnReorderPayload {
  columnId: string
  fromIndex: number
  toIndex: number
  order?: Array<string>
  reason?: 'drag' | 'api' | 'reset'
}

export interface DataTableColumnInput<Row extends Record<string, any> = Record<string, any>> {
  id: string
  title?: string
  type?: DataTableColumnType
  field?: keyof Row | string
  value?: (row: Row, index: number) => unknown
  width?: DataTableColumnWidth
  minWidth?: number
  maxWidth?: number
  pinned?: DataTablePinnedColumnSide
  resizable?: boolean
  align?: DataTableColumnAlign
  sortable?: boolean | DataTableSortConfig<Row>
  filter?: string | DataTableFilterConfig<Row>
  reorderable?: boolean
  animated?: boolean
  tooltip?: false | DataTableCellTooltip<Row>
  editable?: boolean | ((context: DataTableCellContext<Row>) => boolean)
  paste?: false | {
    enabled?: boolean
    emptyValue?: unknown
  }
  formatCopyValue?: (value: unknown, context: DataTableCellContext<Row>) => string
  parsePasteValue?: (raw: string, context: DataTableCellContext<Row>) => unknown
  validatePasteValue?: (value: unknown, context: DataTableCellContext<Row>) => true | string | Promise<true | string>
  editor?: DataTableEditorType | DataTableEditorConfig<Row>
  editorOptions?: unknown
  editorTemplate?: DataTableDomEditorTemplate<Row>
  parseEditValue?: (raw: unknown, context: DataTableEditContext<Row>) => unknown
  formatEditValue?: (value: unknown, context: DataTableEditContext<Row>) => string
  validateEditValue?: (value: unknown, context: DataTableEditContext<Row>) => true | string | Promise<true | string>
  cellTemplate?: DataTableTemplate<Row>
  headerTemplate?: DataTableTemplate<Row>
  filterTemplate?: DataTableTemplate<Row>
  measureCell?: (context: Omit<DataTableCellContext<Row>, 'api'>) => number
}

export interface DataTableResolvedColumn<Row extends Record<string, any> = Record<string, any>>
  extends Omit<DataTableColumnInput<Row>, 'width'> {
  width: DataTableColumnWidth
  minWidth: number
  maxWidth: number
  resolvedWidth: number
  pinned?: DataTablePinnedColumnSide
  resizable: boolean
  align: DataTableColumnAlign
}

export interface DataTablePinnedColumns {
  left?: Array<string>
  right?: Array<string>
}

export interface DataTablePinnedRows<Row extends Record<string, any> = Record<string, any>> {
  top?: Array<Row>
  bottom?: Array<Row>
}

export interface DataTableViewportOptions {
  width: number
  height: number
  rowHeight: number
  headerHeight: number
  overscanRows: number
  overscanColumns: number
}

export interface DataTableViewport {
  width: number
  height: number
  scrollX: number
  scrollY: number
  bodyX: number
  bodyY: number
  bodyWidth: number
  bodyHeight: number
  contentWidth: number
  contentHeight: number
  maxScrollX: number
  maxScrollY: number
  rowRange: DataTableRange
  centerColumnRange: DataTableRange
  centerColumnOffset: number
  pinnedLeftWidth: number
  pinnedRightWidth: number
}

export interface DataTableRootOptions<Row extends Record<string, any> = Record<string, any>> {
  columns?: Array<DataTableColumnInput<Row>>
  columnGroups?: Array<DataTableColumnGroupInput>
  pinnedColumns?: DataTablePinnedColumns
  pinnedRows?: DataTablePinnedRows<Row>
  rowHeight?: number
  headerHeight?: number
  overscanRows?: number
  overscanColumns?: number
  interaction?: DataTableInteractionOptions
  selection?: false | DataTableSelectionOptions
  clipboard?: false | DataTableClipboardOptions<Row>
  view?: DataTableViewOptions
  scrollbars?: false | DataTableScrollbarOptions
  tooltip?: false | DataTableTooltipOptions<Row>
  textSelection?: false | DataTableTextSelectionOptions
  zoom?: false | DataTableZoomOptions
  editing?: false | DataTableEditingOptions<Row>
  keyboardNavigation?: false | DataTableKeyboardNavigationOptions
  history?: false | DataTableHistoryOptions
  fillHandle?: false | DataTableFillHandleOptions
  accessibility?: false | DataTableAccessibilityOptions
  detailRows?: false | DataTableDetailRowsOptions<Row>
  columnState?: DataTableColumnState
  statePersistence?: false | DataTableStatePersistenceOptions
  performance?: DataTablePerformanceOptions
}

export interface DataTableRootProps<Row extends Record<string, any> = Record<string, any>>
  extends NovaUiCommonProps, DataTableRootOptions<Row> {
  store?: DataTableStoreApi<Row>
  rows?: Array<Row>
  rowKey?: DataTableRowKey<Row>
  cellTemplate?: DataTableTemplate<Row>
  headerTemplate?: DataTableTemplate<Row>
  interactionLayerTemplate?: DataTableInteractionLayerTemplate<Row>
  scrollbarLayerTemplate?: DataTableScrollbarLayerTemplate<Row>
  groupRowTemplate?: DataTableGroupTemplate<Row>
  groupFooterTemplate?: DataTableGroupTemplate<Row>
  grandFooterTemplate?: DataTableGroupTemplate<Row>
  pinnedBottomTemplate?: DataTableGroupTemplate<Row>
  onViewportChange?: (viewport: DataTableViewport) => void
  onColumnResize?: (payload: DataTableColumnResizePayload<Row>) => void
  onColumnStateChange?: (state: DataTableResolvedColumnState) => void
  onSortChange?: (state: DataTableSortState) => void
  onFilterChange?: (state: DataTableFilterState | DataTableFilterExpression) => void
  onSearchChange?: (state: DataTableSearchState) => void
  onQueryChange?: (query: DataTableQueryState) => void
  onServerQueryChange?: (query: DataTableQueryState) => void
  onSummaryChange?: (summary: DataTableSummaryState) => void
  onRowOrderChange?: (payload: DataTableRowReorderPayload) => void
  onColumnOrderChange?: (payload: DataTableColumnReorderPayload) => void
  onGroupingChange?: (state: DataTableGroupingState<Row>) => void
  onGroupToggle?: (group: DataTableGroupNode<Row>) => void
  onCellEnter?: (context: DataTableCellContext<Row>) => void
  onCellLeave?: (context: DataTableCellContext<Row>) => void
  onCellClick?: (context: DataTableCellContext<Row>) => void
  onSelectionChange?: (selection: DataTableSelectionState | null) => void
  onSelectionPreviewChange?: (previewRange: DataTableSelectionRange | null) => void
  onActiveCellChange?: (activeCell: DataTableSelectionAnchor | null) => void
  onBeforeCopy?: DataTableClipboardOptions<Row>['onBeforeCopy']
  onCopy?: DataTableClipboardOptions<Row>['onCopy']
  onBeforePaste?: DataTableClipboardOptions<Row>['onBeforePaste']
  onPasteCommit?: DataTableClipboardOptions<Row>['onPasteCommit']
  onPasteError?: DataTableClipboardOptions<Row>['onPasteError']
  onZoomChange?: (state: DataTableZoomState) => void
  onEditingChange?: (state: DataTableEditingState<Row> | null) => void
  onKeyboardAction?: (action: DataTableKeyboardAction) => void
}

export interface DataTableRootResolvedProps<Row extends Record<string, any> = Record<string, any>>
  extends NovaUiCommonResolvedProps, Required<Pick<DataTableRootOptions<Row>, 'rowHeight' | 'headerHeight' | 'overscanRows' | 'overscanColumns'>> {
  store?: DataTableStoreApi<Row>
  rows?: Array<Row>
  rowKey?: DataTableRowKey<Row>
  columns: Array<DataTableColumnInput<Row>>
  columnGroups: Array<DataTableColumnGroupInput>
  pinnedColumns: DataTablePinnedColumns
  pinnedRows: DataTablePinnedRows<Row>
  interaction: DataTableResolvedInteractionOptions
  selection: false | DataTableResolvedSelectionOptions
  clipboard: false | DataTableResolvedClipboardOptions<Row>
  view: DataTableResolvedViewOptions
  scrollbars: false | DataTableResolvedScrollbarOptions
  tooltip: false | DataTableResolvedTooltipOptions<Row>
  textSelection: false | DataTableResolvedTextSelectionOptions
  zoom: false | DataTableResolvedZoomOptions
  editing: false | DataTableResolvedEditingOptions<Row>
  keyboardNavigation: false | DataTableResolvedKeyboardNavigationOptions
  history: false | DataTableResolvedHistoryOptions
  fillHandle: false | DataTableResolvedFillHandleOptions
  accessibility: false | DataTableResolvedAccessibilityOptions
  detailRows: false | DataTableResolvedDetailRowsOptions<Row>
  columnState: DataTableResolvedColumnState
  statePersistence: false | DataTableResolvedStatePersistenceOptions
  performance: DataTableResolvedPerformanceOptions
  hoverAlpha: number
  selectionAlpha: number
  tooltipAlpha: number
  cellTemplate?: DataTableTemplate<Row>
  headerTemplate?: DataTableTemplate<Row>
  interactionLayerTemplate?: DataTableInteractionLayerTemplate<Row>
  scrollbarLayerTemplate?: DataTableScrollbarLayerTemplate<Row>
  groupRowTemplate?: DataTableGroupTemplate<Row>
  groupFooterTemplate?: DataTableGroupTemplate<Row>
  grandFooterTemplate?: DataTableGroupTemplate<Row>
  pinnedBottomTemplate?: DataTableGroupTemplate<Row>
  onViewportChange?: (viewport: DataTableViewport) => void
  onColumnResize?: (payload: DataTableColumnResizePayload<Row>) => void
  onColumnStateChange?: (state: DataTableResolvedColumnState) => void
  onSortChange?: (state: DataTableSortState) => void
  onFilterChange?: (state: DataTableFilterState | DataTableFilterExpression) => void
  onSearchChange?: (state: DataTableSearchState) => void
  onQueryChange?: (query: DataTableQueryState) => void
  onServerQueryChange?: (query: DataTableQueryState) => void
  onSummaryChange?: (summary: DataTableSummaryState) => void
  onRowOrderChange?: (payload: DataTableRowReorderPayload) => void
  onColumnOrderChange?: (payload: DataTableColumnReorderPayload) => void
  onGroupingChange?: (state: DataTableGroupingState<Row>) => void
  onGroupToggle?: (group: DataTableGroupNode<Row>) => void
  onCellEnter?: (context: DataTableCellContext<Row>) => void
  onCellLeave?: (context: DataTableCellContext<Row>) => void
  onCellClick?: (context: DataTableCellContext<Row>) => void
  onSelectionChange?: (selection: DataTableSelectionState | null) => void
  onSelectionPreviewChange?: (previewRange: DataTableSelectionRange | null) => void
  onActiveCellChange?: (activeCell: DataTableSelectionAnchor | null) => void
  onBeforeCopy?: DataTableClipboardOptions<Row>['onBeforeCopy']
  onCopy?: DataTableClipboardOptions<Row>['onCopy']
  onBeforePaste?: DataTableClipboardOptions<Row>['onBeforePaste']
  onPasteCommit?: DataTableClipboardOptions<Row>['onPasteCommit']
  onPasteError?: DataTableClipboardOptions<Row>['onPasteError']
  onZoomChange?: (state: DataTableZoomState) => void
  onEditingChange?: (state: DataTableEditingState<Row> | null) => void
  onKeyboardAction?: (action: DataTableKeyboardAction) => void
}

export interface DataTableColumnResizePayload<Row extends Record<string, any> = Record<string, any>> {
  column: DataTableResolvedColumn<Row>
  width: number
  previousWidth: number
}

export interface DataTableRootApi<Row extends Record<string, any> = Record<string, any>> {
  options: (options?: Partial<DataTableRootOptions<Row>>) => DataTableRootOptions<Row>
  data: (rows?: Array<Row>) => Array<Row>
  add: (row: Row | Array<Row>) => void
  update: (items: Array<Partial<Row> & { id: DataTableRowId }> | Partial<Row> & { id: DataTableRowId }) => void
  remove: (ids: DataTableRowId | Array<DataTableRowId>) => void
  setRows: (rows: Array<Row>) => void
  replaceRange: (start: number, rows: Array<Row>) => void
  applyDeltas: (deltas: DataTableDelta<Row> | Array<DataTableDelta<Row>>) => void
  flushDeltas: () => void
  setColumnWidth: (columnId: string, width: number) => boolean
  autosizeColumn: (columnId: string) => boolean
  autosizeColumns: (columnIds?: Array<string>) => void
  resetColumnWidth: (columnId: string) => boolean
  getColumnState: () => DataTableResolvedColumnState
  setColumnState: (state: DataTableColumnState) => void
  resetColumnState: () => void
  hideColumn: (columnId: string) => void
  showColumn: (columnId: string) => void
  pinColumn: (columnId: string, side: DataTablePinnedColumnSide) => void
  unpinColumn: (columnId: string) => void
  getPersistedState: () => DataTablePersistedState<Row> | null
  saveState: () => DataTablePersistedState<Row> | null
  restoreState: () => boolean
  resetPersistedState: () => void
  scrollTo: (x: number, y: number) => void
  scrollToRow: (rowIndex: number) => void
  focusCell: (rowId: DataTableRowId, columnId: string) => boolean
  moveActiveCell: (direction: DataTableActiveCellDirection, options?: { extend?: boolean }) => boolean
  getZoom: () => DataTableZoomState
  setZoom: (value: number | DataTableZoomOptions) => void
  resetZoom: () => void
  startEdit: (rowId: DataTableRowId, columnId: string) => boolean
  commitEdit: (value?: unknown) => Promise<void>
  cancelEdit: () => void
  getEditingState: () => DataTableEditingState<Row> | null
  undo: () => boolean
  redo: () => boolean
  canUndo: () => boolean
  canRedo: () => boolean
  clearHistory: () => void
  getHistoryState: () => DataTableHistoryState<Row>
  clearSelectionValues: () => DataTableTransaction<Row> | null
  fillSelection: (direction: DataTableFillDirection, options?: Partial<DataTableFillHandleOptions>) => DataTableTransaction<Row> | null
  getAccessibilityState: () => DataTableAccessibilityState
  getRenderDiagnostics: () => DataTableRenderDiagnostics
  refresh: () => void
  batch: (callback: (api: DataTableRootApi<Row>) => void) => void
  getViewport: () => DataTableViewport
  getInteraction: () => DataTableInteractionState<Row>
  clearHover: () => void
  getSelection: () => DataTableSelectionState | null
  setSelection: (selection: DataTableSelectionState | null) => void
  selectCell: (rowId: DataTableRowId, columnId: string, options?: DataTableSelectionUpdateOptions) => void
  selectRow: (rowId: DataTableRowId, options?: DataTableSelectionUpdateOptions) => void
  selectColumn: (columnId: string, options?: DataTableSelectionUpdateOptions) => void
  selectRange: (range: DataTableSelectionRange, options?: DataTableSelectionUpdateOptions) => void
  addSelectionRange: (range: DataTableSelectionRange) => void
  removeSelectionRange: (rangeId: string) => void
  isCellSelected: (rowId: DataTableRowId, columnId: string) => boolean
  isRowSelected: (rowId: DataTableRowId) => boolean
  isColumnSelected: (columnId: string) => boolean
  copySelection: () => string
  pasteClipboard: (text?: string) => Promise<DataTablePasteResult<Row>>
  clearSelection: () => void
  getViewState: () => DataTableViewState
  setSort: (sort: DataTableSortState | DataTableSortRule) => void
  clearSort: (columnId?: string) => void
  setFilter: (columnId: string, filter: Omit<DataTableFilterRule, 'columnId'> | DataTableFilterRule) => void
  setFilters: (filters: DataTableFilterState | DataTableFilterExpression) => void
  patchFilter: (columnId: string, filter: Omit<DataTableFilterRule, 'columnId'> | DataTableFilterRule) => void
  clearFilter: (columnId?: string) => void
  clearFilters: (columnId?: string) => void
  setSearch: (query: string | DataTableSearchQuery) => void
  clearSearch: () => void
  findNext: () => DataTableSearchMatch | null
  findPrevious: () => DataTableSearchMatch | null
  focusSearchMatch: (index: number) => DataTableSearchMatch | null
  getSearchState: () => DataTableSearchState
  reorderRows: (payload: DataTableRowReorderPayload) => void
  reorderColumns: (payload: DataTableColumnReorderPayload) => void
  setColumnOrder: (order: Array<string>) => void
  resetColumnOrder: () => void
  getGroupingState: () => DataTableGroupingState<Row>
  setGrouping: (groups: Array<DataTableGroupRule<Row>>) => void
  clearGrouping: () => void
  toggleGroup: (groupId: string) => void
  expandGroup: (groupId: string) => void
  collapseGroup: (groupId: string) => void
  expandAllGroups: () => void
  collapseAllGroups: () => void
  resetView: () => void
  setChildren: (children: Array<unknown>) => void
}

export interface DataTableStoreApi<Row extends Record<string, any> = Record<string, any>> {
  readonly rowCount: number
  readonly loadedRowCount: number
  getRows: () => Array<Row>
  getRow: (id: DataTableRowId) => Row | undefined
  getRowAt: (index: number) => Row | undefined
  getRowIdAt: (index: number) => DataTableRowId | undefined
  getRowIndex: (id: DataTableRowId) => number | undefined
  getCell: (rowId: DataTableRowId, columnId: string) => unknown
  setRows: (rows: Array<Row>) => void
  replaceRange: (start: number, rows: Array<Row>) => void
  insert: (row: Row, index?: number) => void
  insertMany: (rows: Array<Row>, index?: number) => void
  move: (rowId: DataTableRowId, toIndex: number) => void
  patch: (rowId: DataTableRowId, patch: Partial<Row>) => void
  setCell: (rowId: DataTableRowId, columnId: string, value: unknown) => void
  remove: (rowId: DataTableRowId) => void
  removeMany: (rowIds: Array<DataTableRowId>) => void
  applyDeltaBatch: (deltas: DataTableDelta<Row> | Array<DataTableDelta<Row>>) => void
  getDirtyState: () => DataTableDirtyState
  clearDirtyState: () => void
  ensureRange: (range: DataTableRange, query?: DataTableQueryState, context?: DataTableSourceRequestContext) => Promise<void>
  loadSummary: (query?: DataTableQueryState) => Promise<Record<string, unknown> | undefined>
  loadFilterValues: (
    columnId: string,
    query?: DataTableQueryState,
    cursor?: string,
  ) => Promise<{ values: Array<unknown>; cursor?: string; hasMore?: boolean } | undefined>
  searchSource: (
    search: DataTableSearchQuery,
    query?: DataTableQueryState,
    cursor?: string,
    direction?: DataTableSearchDirection,
  ) => Promise<DataTableSearchResult | undefined>
  resolveSourceRowIndex: (rowId: DataTableRowId, query?: DataTableQueryState) => Promise<number | undefined>
  subscribe: (query: DataTableQueryState, emitDelta: (delta: DataTableDelta<Row> | Array<DataTableDelta<Row>>) => void) => (() => void) | void
  batch: (callback: (store: DataTableStoreApi<Row>) => void) => void
  takeRevision: () => number
  takeDataRevision: () => number
  takeStructureRevision: () => number
}

export interface NovaDataTableProps<Row extends Record<string, any> = Record<string, any>>
  extends Omit<DataTableRootProps<Row>, 'width' | 'height'> {
  data?: Array<Row>
  width?: number | string
  height?: number | string
  maxDpr?: number
  renderer?: RendererType | 'webgl' | 'web2d' | '2d'
  loop?: boolean
  devtools?: NovaDataTableDevtoolsOption
}

export type NovaDataTableRef<Row extends Record<string, any> = Record<string, any>> = DataTableRootApi<Row>

export const NovaDataTableSchema = {
  Root: DATATABLE_ROOT_SCHEMA_TYPE,
} as const
