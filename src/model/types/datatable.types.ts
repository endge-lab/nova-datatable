import type { NovaMotionOptions, NovaSchema, RendererType } from '@endge/nova'
import type { NovaUiCommonProps, NovaUiCommonResolvedProps } from '@endge/nova-ui-kit'

export const DATATABLE_ROOT_SCHEMA_TYPE = 'NovaDataTable.Root'

export type DataTableRowId = string | number
export type DataTablePinnedColumnSide = 'left' | 'right'
export type DataTablePinnedRowPosition = 'top' | 'bottom'
export type DataTableColumnAlign = 'left' | 'center' | 'right'
export type DataTableViewMode = 'client' | 'server' | 'hybrid'
export type DataTableSortDirection = 'asc' | 'desc'
export type DataTableFilterPreset = 'text' | 'number' | 'date' | 'set' | 'boolean' | 'custom'
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
export type DataTableHoverMode = 'none' | 'row' | 'column' | 'cell' | 'row-column' | 'row-cell' | 'column-cell'
export type DataTableSelectionMode = 'none' | 'cell' | 'row' | 'column'
export type DataTableCellEnterMotion = 'none' | 'fade'
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

export interface DataTableQueryState {
  sort: DataTableSortState
  filters: DataTableFilterState
  rowOrder: Array<DataTableRowId>
  columnOrder: Array<string>
}

export type DataTableRowKey<Row extends Record<string, any>> = keyof Row | ((row: Row, index: number) => DataTableRowId)

export interface DataTableLazySource<Row extends Record<string, any>> {
  rowCount: number
  getRow?: (index: number) => Row | undefined
  loadRange?: (range: DataTableRange, query?: DataTableQueryState) => Promise<Array<Row> | void> | Array<Row> | void
}

export interface DataTableStoreOptions<Row extends Record<string, any>> {
  rowKey: DataTableRowKey<Row>
  rows?: Array<Row>
  estimateRowCount?: number
  source?: DataTableLazySource<Row>
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
  pinnedColumn?: DataTablePinnedColumnSide
  pinnedRow?: DataTablePinnedRowPosition
  sorted?: DataTableSortDirection
  sortPriority?: number
  filtered?: boolean
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
  zone: 'header' | 'body' | 'pinned-top' | 'pinned-bottom'
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

export interface DataTableSortConfig<Row extends Record<string, any> = Record<string, any>> {
  accessor?: (row: Row, index: number) => unknown
  compare?: (a: unknown, b: unknown, aRow: Row, bRow: Row) => number
  comparator?: string
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
  initial?: DataTableSortState
  controlled?: boolean
}

export interface DataTableViewFilteringOptions {
  mode?: DataTableViewMode
  initial?: DataTableFilterState
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

export interface DataTableViewOptions {
  sorting?: false | DataTableViewSortingOptions
  filtering?: false | DataTableViewFilteringOptions
  rowOrdering?: false | DataTableRowOrderingOptions
  columnOrdering?: false | DataTableColumnOrderingOptions
  filterUi?: false | DataTableFilterUiOptions
}

export interface DataTableResolvedViewOptions {
  sorting: false | Required<Omit<DataTableViewSortingOptions, 'initial'>> & { initial: DataTableSortState }
  filtering: false | Required<Omit<DataTableViewFilteringOptions, 'initial'>> & { initial: DataTableFilterState }
  rowOrdering: false | Required<DataTableRowOrderingOptions>
  columnOrdering: false | Required<DataTableColumnOrderingOptions>
  filterUi: false | Required<DataTableFilterUiOptions>
}

export interface DataTableViewState {
  sort: DataTableSortState
  filters: DataTableFilterState
  rowOrder: Array<DataTableRowId>
  columnOrder: Array<string>
  query: DataTableQueryState
  rowCount: number
  mode: {
    sorting: DataTableViewMode | 'off'
    filtering: DataTableViewMode | 'off'
  }
}

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
}

export interface DataTableRootProps<Row extends Record<string, any> = Record<string, any>>
  extends NovaUiCommonProps, DataTableRootOptions<Row> {
  store?: DataTableStoreApi<Row>
  rows?: Array<Row>
  rowKey?: DataTableRowKey<Row>
  cellTemplate?: DataTableTemplate<Row>
  headerTemplate?: DataTableTemplate<Row>
  interactionLayerTemplate?: DataTableInteractionLayerTemplate<Row>
  onViewportChange?: (viewport: DataTableViewport) => void
  onColumnResize?: (payload: DataTableColumnResizePayload<Row>) => void
  onSortChange?: (state: DataTableSortState) => void
  onFilterChange?: (state: DataTableFilterState) => void
  onQueryChange?: (query: DataTableQueryState) => void
  onRowOrderChange?: (payload: DataTableRowReorderPayload) => void
  onColumnOrderChange?: (payload: DataTableColumnReorderPayload) => void
  onCellEnter?: (context: DataTableCellContext<Row>) => void
  onCellLeave?: (context: DataTableCellContext<Row>) => void
  onCellClick?: (context: DataTableCellContext<Row>) => void
  onSelectionChange?: (selection: DataTableSelectionState | null) => void
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
  hoverAlpha: number
  selectionAlpha: number
  cellTemplate?: DataTableTemplate<Row>
  headerTemplate?: DataTableTemplate<Row>
  interactionLayerTemplate?: DataTableInteractionLayerTemplate<Row>
  onViewportChange?: (viewport: DataTableViewport) => void
  onColumnResize?: (payload: DataTableColumnResizePayload<Row>) => void
  onSortChange?: (state: DataTableSortState) => void
  onFilterChange?: (state: DataTableFilterState) => void
  onQueryChange?: (query: DataTableQueryState) => void
  onRowOrderChange?: (payload: DataTableRowReorderPayload) => void
  onColumnOrderChange?: (payload: DataTableColumnReorderPayload) => void
  onCellEnter?: (context: DataTableCellContext<Row>) => void
  onCellLeave?: (context: DataTableCellContext<Row>) => void
  onCellClick?: (context: DataTableCellContext<Row>) => void
  onSelectionChange?: (selection: DataTableSelectionState | null) => void
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
  setColumnWidth: (columnId: string, width: number) => boolean
  autosizeColumn: (columnId: string) => boolean
  autosizeColumns: (columnIds?: Array<string>) => void
  resetColumnWidth: (columnId: string) => boolean
  scrollTo: (x: number, y: number) => void
  scrollToRow: (rowIndex: number) => void
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
  clearFilter: (columnId?: string) => void
  reorderRows: (payload: DataTableRowReorderPayload) => void
  reorderColumns: (payload: DataTableColumnReorderPayload) => void
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
  patch: (rowId: DataTableRowId, patch: Partial<Row>) => void
  setCell: (rowId: DataTableRowId, columnId: string, value: unknown) => void
  remove: (rowId: DataTableRowId) => void
  removeMany: (rowIds: Array<DataTableRowId>) => void
  ensureRange: (range: DataTableRange, query?: DataTableQueryState) => Promise<void>
  batch: (callback: (store: DataTableStoreApi<Row>) => void) => void
  takeRevision: () => number
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
