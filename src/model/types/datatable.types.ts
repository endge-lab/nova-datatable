import type { NovaMotionOptions, NovaSchema, RendererType } from '@endge/nova'
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
export type DataTableHoverMode = 'none' | 'row' | 'column' | 'cell' | 'row-column' | 'row-cell' | 'column-cell'
export type DataTableSelectionMode = 'none' | 'cell' | 'row' | 'column'
export type DataTableCellEnterMotion = 'none' | 'fade'
export type DataTableScrollbarVisibility = Extract<NovaScrollbarVisibility, 'always' | 'hover' | 'scroll'>
export type DataTableScrollbarAxis = NovaScrollbarAxis
export type DataTableZoomMode = 'density' | 'layout' | 'text' | 'custom'
export type DataTableZoomAffect = 'rows' | 'headers' | 'columns' | 'text' | 'icons'
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
}

export interface DataTableSearchState {
  query: DataTableSearchQuery
  matches: Array<DataTableSearchMatch>
  activeIndex: number
  activeMatch: DataTableSearchMatch | null
  total: number
  mode: DataTableViewMode | 'off'
  local: boolean
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

export interface DataTableQueryState {
  sort: DataTableSortState
  filters: DataTableFilterState | DataTableFilterExpression
  search?: DataTableSearchQuery
  rowOrder: Array<DataTableRowId>
  columnOrder: Array<string>
  grouping?: DataTableGroupingQueryState
}

export type DataTableRowKey<Row extends Record<string, any>> = keyof Row | ((row: Row, index: number) => DataTableRowId)

export type DataTableDelta<Row extends Record<string, any> = Record<string, any>> =
  | { type: 'patch'; rowId: DataTableRowId; patch: Partial<Row> }
  | { type: 'setCell'; rowId: DataTableRowId; columnId: string; value: unknown }
  | { type: 'insert'; index?: number; rows: Array<Row> }
  | { type: 'remove'; rowIds: Array<DataTableRowId> }
  | { type: 'move'; rowId: DataTableRowId; toIndex: number }
  | { type: 'replaceRange'; start: number; rows: Array<Row> }

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
}

export interface DataTableResolvedPerformanceOptions {
  pageSize: number
  maxClientRows: number
  deltaFrameBudgetMs: number
  workerPipeline: boolean
}

export interface DataTableLazySource<Row extends Record<string, any>> {
  rowCount: number
  getRow?: (index: number) => Row | undefined
  loadRange?: (range: DataTableRange, query?: DataTableQueryState) => Promise<Array<Row> | void> | Array<Row> | void
  loadSummary?: (query?: DataTableQueryState) => Promise<Record<string, unknown> | void> | Record<string, unknown> | void
  search?: (
    search: DataTableSearchQuery,
    query?: DataTableQueryState,
    cursor?: string,
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

export interface DataTableSelectionState {
  mode: DataTableSelectionMode
  rowId?: DataTableRowId
  rowIndex?: number
  columnId?: string
  columnIndex?: number
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

export interface DataTableViewOptions {
  sorting?: false | DataTableViewSortingOptions
  filtering?: false | DataTableViewFilteringOptions
  search?: false | DataTableViewSearchOptions
  rowOrdering?: false | DataTableRowOrderingOptions
  columnOrdering?: false | DataTableColumnOrderingOptions
  filterUi?: false | DataTableFilterUiOptions
  grouping?: false | DataTableViewGroupingOptions
}

export interface DataTableResolvedViewOptions {
  sorting: false | Required<Omit<DataTableViewSortingOptions, 'initial'>> & { initial: DataTableSortState }
  filtering: false | Required<Omit<DataTableViewFilteringOptions, 'initial'>> & { initial: DataTableFilterState | DataTableFilterExpression }
  search: false | Required<DataTableViewSearchOptions>
  rowOrdering: false | Required<DataTableRowOrderingOptions>
  columnOrdering: false | Required<DataTableColumnOrderingOptions>
  filterUi: false | Required<DataTableFilterUiOptions>
  grouping: false | Required<Omit<DataTableViewGroupingOptions, 'groups' | 'expanded'>> & {
    groups: Array<DataTableGroupRule>
    expanded: 'all' | 'none' | Array<string>
  }
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

export type DataTableViewRow<Row extends Record<string, any> = Record<string, any>> =
  | DataTableDataViewRow<Row>
  | DataTableGroupViewRow<Row>
  | DataTableGroupFooterViewRow<Row>
  | DataTableGrandFooterViewRow<Row>

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
}

export interface DataTableColumnInput<Row extends Record<string, any> = Record<string, any>> {
  id: string
  title?: string
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
  pinnedColumns?: DataTablePinnedColumns
  pinnedRows?: DataTablePinnedRows<Row>
  rowHeight?: number
  headerHeight?: number
  overscanRows?: number
  overscanColumns?: number
  interaction?: DataTableInteractionOptions
  view?: DataTableViewOptions
  scrollbars?: false | DataTableScrollbarOptions
  tooltip?: false | DataTableTooltipOptions<Row>
  zoom?: false | DataTableZoomOptions
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
  onSortChange?: (state: DataTableSortState) => void
  onFilterChange?: (state: DataTableFilterState | DataTableFilterExpression) => void
  onSearchChange?: (state: DataTableSearchState) => void
  onQueryChange?: (query: DataTableQueryState) => void
  onRowOrderChange?: (payload: DataTableRowReorderPayload) => void
  onColumnOrderChange?: (payload: DataTableColumnReorderPayload) => void
  onGroupingChange?: (state: DataTableGroupingState<Row>) => void
  onGroupToggle?: (group: DataTableGroupNode<Row>) => void
  onCellEnter?: (context: DataTableCellContext<Row>) => void
  onCellLeave?: (context: DataTableCellContext<Row>) => void
  onCellClick?: (context: DataTableCellContext<Row>) => void
  onSelectionChange?: (selection: DataTableSelectionState | null) => void
  onZoomChange?: (state: DataTableZoomState) => void
}

export interface DataTableRootResolvedProps<Row extends Record<string, any> = Record<string, any>>
  extends NovaUiCommonResolvedProps, Required<Pick<DataTableRootOptions<Row>, 'rowHeight' | 'headerHeight' | 'overscanRows' | 'overscanColumns'>> {
  store?: DataTableStoreApi<Row>
  rows?: Array<Row>
  rowKey?: DataTableRowKey<Row>
  columns: Array<DataTableColumnInput<Row>>
  pinnedColumns: DataTablePinnedColumns
  pinnedRows: DataTablePinnedRows<Row>
  interaction: DataTableResolvedInteractionOptions
  view: DataTableResolvedViewOptions
  scrollbars: false | DataTableResolvedScrollbarOptions
  tooltip: false | DataTableResolvedTooltipOptions<Row>
  zoom: false | DataTableResolvedZoomOptions
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
  onSortChange?: (state: DataTableSortState) => void
  onFilterChange?: (state: DataTableFilterState | DataTableFilterExpression) => void
  onSearchChange?: (state: DataTableSearchState) => void
  onQueryChange?: (query: DataTableQueryState) => void
  onRowOrderChange?: (payload: DataTableRowReorderPayload) => void
  onColumnOrderChange?: (payload: DataTableColumnReorderPayload) => void
  onGroupingChange?: (state: DataTableGroupingState<Row>) => void
  onGroupToggle?: (group: DataTableGroupNode<Row>) => void
  onCellEnter?: (context: DataTableCellContext<Row>) => void
  onCellLeave?: (context: DataTableCellContext<Row>) => void
  onCellClick?: (context: DataTableCellContext<Row>) => void
  onSelectionChange?: (selection: DataTableSelectionState | null) => void
  onZoomChange?: (state: DataTableZoomState) => void
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
  scrollTo: (x: number, y: number) => void
  scrollToRow: (rowIndex: number) => void
  getZoom: () => DataTableZoomState
  setZoom: (value: number | DataTableZoomOptions) => void
  resetZoom: () => void
  refresh: () => void
  batch: (callback: (api: DataTableRootApi<Row>) => void) => void
  getViewport: () => DataTableViewport
  getInteraction: () => DataTableInteractionState<Row>
  clearHover: () => void
  selectCell: (rowId: DataTableRowId, columnId: string) => void
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
  ensureRange: (range: DataTableRange, query?: DataTableQueryState) => Promise<void>
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
