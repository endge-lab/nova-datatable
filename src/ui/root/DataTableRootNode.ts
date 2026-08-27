import type { NovaApp, NovaDragEventMeta, NovaRectBatch, NovaSchema, NovaSurface, NovaTextBatch, NovaTextSelectionRange } from '@endge/nova'
import type { NovaUiLayoutRect, TooltipContent, TooltipModifier, TooltipProps } from '@endge/nova-ui-kit'
import type { EventList } from '@endge/utils'
import type { DataTableClipboardFeedbackState } from '@/model/runtime/DataTableClipboardFeedback'
import type { DataTableSummaryRule } from '@/model/runtime/DataTableSummaryEngine'
import type {
  DataTableAccessibilityState,
  DataTableActiveCellDirection,
  DataTableCellContext,
  DataTableCellRect,
  DataTableClipboardFormat,
  DataTableColumnInput,
  DataTableColumnState,
  DataTableDelta,
  DataTableDirtyState,
  DataTableEditCommitPayload,
  DataTableEditContext,
  DataTableEditingState,
  DataTableEditorType,
  DataTableFillDirection,
  DataTableFillHandleOptions,
  DataTableFilterOperator,
  DataTableFilterRule,
  DataTableGroupNode,
  DataTableGroupTemplateContext,
  DataTableHoverMode,
  DataTableInteractionState,
  DataTableInteractionTarget,
  DataTableKeyboardAction,
  DataTablePasteInvalidCell,
  DataTablePasteParseFormat,
  DataTablePasteResult,
  DataTablePersistedState,
  DataTablePinnedRowPosition,
  DataTableQueryState,
  DataTableRenderDiagnostics,
  DataTableResolvedClipboardOptions,
  DataTableResolvedColumn,
  DataTableResolvedColumnState,
  DataTableResolvedScrollbarAxisOptions,
  DataTableResolvedZoomWheelOptions,
  DataTableRootApi,
  DataTableRootOptions,
  DataTableRootProps,
  DataTableRootResolvedProps,
  DataTableRowId,
  DataTableScrollbarAxis,
  DataTableScrollbarGeometry,
  DataTableScrollbarLayerContext,
  DataTableScrollbarState,
  DataTableScrollbarVisibility,
  DataTableSearchDirection,
  DataTableSearchHighlightMode,
  DataTableSelectionAnchor,
  DataTableSelectionRange,
  DataTableSelectionState,
  DataTableSelectionUnit,
  DataTableSelectionUpdateOptions,
  DataTableStateSlice,
  DataTableStoreApi,
  DataTableSummaryState,
  DataTableTooltipContext,
  DataTableTransaction,
  DataTableViewport,
  DataTableViewRow,
  DataTableViewState,
  DataTableZoomOptions,
  DataTableZoomState,
} from '@/model/types/datatable.types'
import type { DataTableRootDescriptor } from '@/ui/root/datatable-root.config'
import {

  NovaTextSelectionService,
  parseNovaColor,
} from '@endge/nova'
import {
  buildBoxSchema,
  createNovaScrollbarGeometry,
  createNovaScrollbarSchema,
  hitNovaScrollbarRect,
  mapNovaScrollbarDragValue,
  NovaUiComponentNode,
  NovaUIKit,

} from '@endge/nova-ui-kit'
import { createDataTableStore } from '@/model/module/DataTableStore'
import {
  autosizeDataTableColumn,
  clampWidth,
  resolveDataTableColumns,
  resolveDataTableValue,
} from '@/model/runtime/datatable-columns'
import { createDataTableViewport } from '@/model/runtime/datatable-layout'
import { createDataTableAccessibilityState } from '@/model/runtime/DataTableAccessibility'
import {
  createDataTableClipboardFeedbackHidden,
  createDataTableClipboardPasteErrorFeedback,
  createDataTableClipboardPasteFeedback,

} from '@/model/runtime/DataTableClipboardFeedback'
import { createDataTableFillDeltas } from '@/model/runtime/DataTableFillHandle'
import { parseDataTableClipboardMatrix } from '@/model/runtime/DataTableFillMatrix'
import { DataTableInvalidationScope } from '@/model/runtime/DataTableInvalidationScope'
import { DataTableRuntimeActions } from '@/model/runtime/DataTableRuntimeActions'
import { DataTableServerRowModel } from '@/model/runtime/DataTableServerRowModel'
import { DataTableSummaryEngine } from '@/model/runtime/DataTableSummaryEngine'
import { DataTableTransactionHistory } from '@/model/runtime/DataTableTransactionHistory'
import { DataTableViewPipeline } from '@/model/runtime/DataTableViewPipeline'
import { DataTableStatePersistence_Service } from '@/model/services/DataTableStatePersistence_Service'
import {
  DATATABLE_ROOT_NODE_DESCRIPTOR,

  normalizeDataTableRootProps,
} from '@/ui/root/datatable-root.config'

interface ResizeState<Row extends Record<string, any>> {
  column: DataTableResolvedColumn<Row>
  startX: number
  startWidth: number
}

interface ColumnDragState<Row extends Record<string, any>> {
  column: DataTableResolvedColumn<Row>
  startIndex: number
  targetIndex: number
  pinned: DataTableResolvedColumn<Row>['pinned']
  active: boolean
  pointerX: number
  pointerY: number
  grabOffsetX: number
}

interface ColumnDragLayoutMotion {
  from: number
  startedAt: number
  duration: number
}

interface VisibleColumnRect<Row extends Record<string, any>> {
  column: DataTableResolvedColumn<Row>
  columnIndex: number
  x: number
  width: number
}

interface FilterUiTarget<Row extends Record<string, any>> {
  column: DataTableResolvedColumn<Row>
  rect: DataTableCellRect
  action: 'operator' | 'value' | 'clear'
}

type ColumnMenuActionId
  = | 'sort-asc'
    | 'sort-desc'
    | 'clear-sort'
    | 'filter'
    | 'clear-filter'
    | 'pin-left'
    | 'pin-right'
    | 'unpin'
    | 'hide'
    | 'autosize'
    | 'reset-columns'

interface ColumnMenuAction {
  id: ColumnMenuActionId
  label: string
  disabled?: boolean
}

interface ColumnMenuState<Row extends Record<string, any>> {
  column: DataTableResolvedColumn<Row>
  rect: DataTableCellRect
  x: number
  y: number
  width: number
  itemHeight: number
  actions: Array<ColumnMenuAction>
}

interface ScrollbarDragState {
  axis: DataTableScrollbarAxis
  startScrollX: number
  startScrollY: number
}

interface SelectionDragState {
  anchor: DataTableSelectionAnchor
  target: DataTableSelectionAnchor
  unit: DataTableSelectionUnit
  active: boolean
}

type VisibleColumnRegion = 'all' | 'left' | 'center' | 'right'

interface DataTableTextSelectionContext {
  rowId?: DataTableRowId
  rowIndex: number
  columnId: string
  columnIndex: number
  zone: DataTableCellContext['zone']
}

interface DataTableGestureEvent extends Event {
  scale?: number
  clientX?: number
  clientY?: number
  preventDefault: () => void
  stopPropagation: () => void
}

interface RenderedRow<Row extends Record<string, any>> {
  kind: 'data'
  row: Row
  rowId: DataTableRowId
  rowIndex: number
  storeIndex?: number
  zone: DataTableCellContext<Row>['zone']
}

interface RenderedGroupRow<Row extends Record<string, any>> {
  kind: 'group' | 'group-footer' | 'grand-footer'
  rowId: DataTableRowId
  rowIndex: number
  storeIndex?: number
  zone: DataTableCellContext<Row>['zone']
  group?: DataTableGroupNode<Row>
  aggregate: Record<string, unknown>
  rows: Array<Row>
}

type RenderedTableRow<Row extends Record<string, any>> = RenderedRow<Row> | RenderedGroupRow<Row>

type DataTableRenderLayerId
  = | 'base'
    | 'header'
    | 'body-static'
    | 'body-animated'
    | 'pinned'
    | 'group-summary'
    | 'search'
    | 'selection'
    | 'interaction'
    | 'drag-menu-tooltip'
    | 'scrollbars'

interface DataTableSchemaRenderSegment {
  kind: 'schema'
  schema: NovaSchema
  clip?: DataTableCellRect
}

interface DataTableRectBatchRenderSegment {
  kind: 'rect-batch'
  rectBatch: NovaRectBatch
  schema: NovaSchema
  clip?: DataTableCellRect
}

interface DataTableTextBatchRenderSegment {
  kind: 'text-batch'
  textBatch: NovaTextBatch
  schema: NovaSchema
  clip?: DataTableCellRect
}

type DataTableRenderSegment = DataTableSchemaRenderSegment | DataTableRectBatchRenderSegment | DataTableTextBatchRenderSegment

interface DataTableTextBatchBuilder {
  align?: NovaTextBatch['align']
  font?: NovaTextBatch['font']
  lineHeight?: number
  padding?: NovaTextBatch['padding']
  ellipsis?: boolean
  meta?: NovaTextBatch['meta']
  clip: boolean
  text: Array<string>
  x: Array<number>
  y: Array<number>
  width: Array<number>
  height: Array<number>
  clipX: Array<number>
  clipY: Array<number>
  clipWidth: Array<number>
  clipHeight: Array<number>
  color: Array<string>
}

type DataTableBatchableRect = Extract<NovaSchema[number], { type: 'rect' }>

interface DataTableCellTemplateFragment {
  schema: NovaSchema
  width: number
  height: number
  createdAt: number
}

interface DataTableRenderColumnPartitions<Row extends Record<string, any>> {
  left: Array<DataTableResolvedColumn<Row>>
  center: Array<DataTableResolvedColumn<Row>>
  right: Array<DataTableResolvedColumn<Row>>
}

interface DataTableRowBackgroundBand {
  offsetX: number
  width: number
  background: string
}

interface DataTableRowBandCacheEntry {
  spans: Array<DataTableRowBackgroundBand>
  createdAt: number
}

interface DataTableRenderLayerCache {
  id: DataTableRenderLayerId
  segments: Array<DataTableRenderSegment>
  dirty: boolean
  initialized: boolean
  rebuilds: number
}

interface DataTableRenderLayerDiagnostics extends DataTableRenderDiagnostics {
  layerRebuilds: Record<DataTableRenderLayerId, number>
}

const DATA_TABLE_RENDER_LAYER_IDS: Array<DataTableRenderLayerId> = [
  'base',
  'header',
  'body-static',
  'body-animated',
  'pinned',
  'group-summary',
  'search',
  'selection',
  'interaction',
  'drag-menu-tooltip',
  'scrollbars',
]

const _DATA_TABLE_GRID_RENDER_LAYERS: Array<DataTableRenderLayerId> = [
  'base',
  'header',
  'body-static',
  'body-animated',
  'pinned',
  'group-summary',
]

const DATA_TABLE_TEXT_SELECTION_SOURCE_LAYERS: Array<DataTableRenderLayerId> = [
  'header',
  'body-static',
  'body-animated',
  'pinned',
]

const DATA_TABLE_OVERLAY_RENDER_LAYERS: Array<DataTableRenderLayerId> = [
  'search',
  'selection',
  'interaction',
  'drag-menu-tooltip',
  'scrollbars',
]
const DATA_TABLE_HOVER_OVERLAY_BATCH_CAPACITY = 8
const DATA_TABLE_BATCHABLE_NAMED_COLORS = new Set(['black', 'white', 'red', 'green', 'blue', 'transparent'])

/**
 * Проверяет, что background можно представить как solid RGBA в NovaRectBatch.
 */
function isBatchableRectBackground(background: string): boolean {
  const value = background.trim().toLowerCase()
  return value.startsWith('#')
    || value.startsWith('rgb(')
    || value.startsWith('rgba(')
    || DATA_TABLE_BATCHABLE_NAMED_COLORS.has(value)
}

/**
 * Создает внутренний render-layer cache.
 */
function createRenderLayerCache(): Map<DataTableRenderLayerId, DataTableRenderLayerCache> {
  return new Map(DATA_TABLE_RENDER_LAYER_IDS.map(id => [id, {
    id,
    segments: [],
    dirty: true,
    initialized: false,
    rebuilds: 0,
  }]))
}

/**
 * Создает диагностику внутренних render layers.
 */
function createRenderLayerDiagnostics(): DataTableRenderLayerDiagnostics {
  return {
    layerRebuilds: Object.fromEntries(DATA_TABLE_RENDER_LAYER_IDS.map(id => [id, 0])) as Record<DataTableRenderLayerId, number>,
    templateCalls: 0,
    templateCacheHits: 0,
    templateCacheMisses: 0,
    interactionRebuilds: 0,
    animatedLayerRebuilds: 0,
    schemaSegments: 0,
    schemaItems: 0,
    rectBatchSegments: 0,
    rectBatchItems: 0,
    textBatchSegments: 0,
    textBatchItems: 0,
  }
}

function createEmptyOverlayRectBatch(capacity: number): NovaRectBatch {
  return {
    count: capacity,
    x: new Float32Array(capacity),
    y: new Float32Array(capacity),
    width: new Float32Array(capacity),
    height: new Float32Array(capacity),
    colors: new Float32Array(capacity * 4),
    states: new Float32Array(capacity),
    revision: 1,
    staticRevision: 1,
  }
}

/**
 * Корневой Nova-node таблицы, который владеет store, viewport, column widths и render pass.
 */
export class DataTableRootNode<
  Row extends Record<string, any> = Record<string, any>,
  E extends EventList = Record<string, any>,
>
  extends NovaUiComponentNode<
    DataTableRootResolvedProps<Row>,
    DataTableRootApi<Row>,
    DataTableRootProps<Row>,
    E
  > {
  readonly invalidation = new DataTableInvalidationScope()
  readonly actions = new DataTableRuntimeActions<Row>(this)
  store: DataTableStoreApi<Row>

  private readonly _api: DataTableRootApi<Row>
  private _viewPipeline: DataTableViewPipeline<Row>
  private _serverRowModel: DataTableServerRowModel<Row>
  private readonly _textSelection = new NovaTextSelectionService<DataTableTextSelectionContext>()
  private readonly _summaryEngine = new DataTableSummaryEngine<Row>()
  private readonly _statePersistenceService = new DataTableStatePersistence_Service()
  private _transactionHistory!: DataTableTransactionHistory<Row>
  private readonly _widthOverrides = new Map<string, number>()
  private _columnStateOverride: DataTableColumnState | null = null
  private readonly _columnIndexById = new Map<string, number>()
  private _statePersistenceTimer: ReturnType<typeof setTimeout> | null = null
  private readonly _pendingDeltas: Array<DataTableDelta<Row>> = []
  private _resolvedColumns: Array<DataTableResolvedColumn<Row>> = []
  private _viewport: DataTableViewport
  private _resizeState: ResizeState<Row> | null = null
  private _columnDragState: ColumnDragState<Row> | null = null
  private _columnMenuState: ColumnMenuState<Row> | null = null
  private readonly _columnDragLayoutMotion = new Map<string, ColumnDragLayoutMotion>()
  private _textSelectionActive = false
  private _suppressNextHeaderClick = false
  private _hoverTarget: DataTableInteractionTarget<Row> | null = null
  private _hoverActive = false
  private _selection: DataTableSelectionState | null = null
  private _selectionActive = false
  private _selectionDragState: SelectionDragState | null = null
  private _selectionIdCounter = 0
  private _clipboardFeedback: DataTableClipboardFeedbackState<Row> = createDataTableClipboardFeedbackHidden() as DataTableClipboardFeedbackState<Row>
  private _clipboardFeedbackHideTimer: ReturnType<typeof setTimeout> | null = null
  private _visibleCellKeys = new Set<string>()
  private _nextVisibleCellKeys = new Set<string>()
  private _cellEnterStartedAt = new Map<string, number>()
  private _cellEnterRenderCount = 0
  private _suppressCellEnterUntil = 0
  private _suppressTextSelectionIndexUntil = 0
  private _textRefinementUntil = 0
  private _visibleAnimatedCells = false
  private _activeRenderLayerId: DataTableRenderLayerId | null = null
  private _activeRenderClip: DataTableCellRect | null = null
  private _renderViewState: DataTableViewState | null = null
  private _renderColumnPartitions: DataTableRenderColumnPartitions<Row> | null = null
  private readonly _renderCellTemplateByColumnZone = new Map<string, ((context: DataTableCellContext<Row>) => NovaSchema) | false>()
  private readonly _renderVisibleColumnRects = new Map<string, Array<VisibleColumnRect<Row>>>()
  private readonly _renderSortIndexByColumn = new Map<string, number>()
  private readonly _renderFilteredColumnIds = new Set<string>()
  private readonly _renderLayers = createRenderLayerCache()
  private readonly _renderLayerDiagnostics = createRenderLayerDiagnostics()
  private readonly _hoverOverlayBatch = createEmptyOverlayRectBatch(DATA_TABLE_HOVER_OVERLAY_BATCH_CAPACITY)
  private readonly _cellTemplateIds = new WeakMap<(context: DataTableCellContext<Row>) => NovaSchema, number>()
  private readonly _cellTemplateFragmentCache = new Map<string, DataTableCellTemplateFragment>()
  private readonly _rowBandBackgroundCache = new Map<string, DataTableRowBandCacheEntry>()
  private readonly _rectBatchColorCache = new Map<string, [number, number, number, number]>()
  private _nextCellTemplateId = 1
  private _animationLoopLease: { release: () => void } | null = null
  private _animationLoopSyncQueued = false
  private _lastPointerPosition: { x: number, y: number } | null = null
  private _pointerInside = false
  private _hoveredScrollbarAxis: DataTableScrollbarAxis | null = null
  private _scrollbarDragState: ScrollbarDragState | null = null
  private _scrollbarAlpha = 0
  private _scrollbarHideTimer: ReturnType<typeof setTimeout> | null = null
  private _tooltipTarget: DataTableInteractionTarget<Row> | null = null
  private _tooltipOpenTimer: ReturnType<typeof setTimeout> | null = null
  private _tooltipHideTimer: ReturnType<typeof setTimeout> | null = null
  private _editingState: DataTableEditingState<Row> | null = null
  private _keyboardFocusActive = false
  private _summaryState: DataTableSummaryState = {
    values: {},
    rowCount: 0,
    revision: 0,
    source: 'client',
    loading: false,
  }

  private _serverSummaryRequestId = 0
  private _serverSearchRequestId = 0
  private _serverSearchCursor: string | undefined
  private _serverSearchPreviousCursor: string | undefined
  private _serverSearchHasMore = false
  private _serverSearchInFlight = false
  private _serverSearchResolveRequestId = 0
  private _gestureStartZoomValue = 1
  private _gestureActive = false
  private _pendingWheelScroll: { x: number, y: number } | null = null
  private _wheelScrollFrame = 0
  private _scrollLodUntil = 0
  private _scrollLodTimer: ReturnType<typeof setTimeout> | null = null
  private _deltaFlushQueued = false
  private readonly _handleEditingKeydown = (event: KeyboardEvent) => this._handleEditingKeydownEvent(event)
  private readonly _handleKeyboardNavigationKeydown = (event: KeyboardEvent) => this._handleKeyboardNavigationKeydownEvent(event)
  private readonly _handleKeyboardNavigationPointerDown = (event: PointerEvent) => this._handleKeyboardNavigationPointerDownEvent(event)
  private readonly _handleTextSelectionKeydown = (event: KeyboardEvent) => this._handleTextSelectionKeydownEvent(event)
  private readonly _handleTrackpadWheelCapture = (event: WheelEvent) => this._handleTrackpadWheelCaptureEvent(event)
  private readonly _handleGestureStart = (event: Event) => this._handleTrackpadGestureStart(event as DataTableGestureEvent)
  private readonly _handleGestureChange = (event: Event) => this._handleTrackpadGestureChange(event as DataTableGestureEvent)
  private readonly _handleGestureEnd = (event: Event) => this._handleTrackpadGestureEnd(event as DataTableGestureEvent)
  private readonly _tooltipModifiers = {
    ctrl: false,
    meta: false,
    shift: false,
    alt: false,
  }

  scrollX = 0
  scrollY = 0

  /**
   * Создает root node и подготавливает публичный API.
   */
  constructor(
    app: NovaApp<E>,
    surface: NovaSurface<E>,
    props: DataTableRootResolvedProps<Row>,
    options: { componentId?: string, children?: Array<unknown> } = {},
    descriptor: DataTableRootDescriptor = DATATABLE_ROOT_NODE_DESCRIPTOR,
  ) {
    super(app, surface, descriptor as never, props, options)

    this.store = props.store ?? createDataTableStore<Row>({
      rowKey: props.rowKey ?? ('id' as keyof Row),
      rows: props.rows ?? [],
      performance: props.performance,
    })
    this._viewPipeline = new DataTableViewPipeline(this.store)
    this._serverRowModel = new DataTableServerRowModel(this.store, delta => this._applyDeltas(delta))
    this._transactionHistory = new DataTableTransactionHistory(this.store, props.history)
    this._textSelection.configure(resolveCoreTextSelectionOptions(props.textSelection))
    const persistedState = this._readPersistedState()
    this._applyPersistedColumnState(persistedState)
    this._resolvedColumns = this._resolveColumns()
    this._syncViewPipeline()
    this._applyPersistedViewState(persistedState)
    this._viewport = this._createViewport()
    this.options({
      interactive: true,
      cursor: { hover: 'default', dragging: 'col-resize' },
    })
    this._setupEvents()
    this._setupTextSelectionKeyboardEvents()
    this._setupKeyboardNavigationEvents()
    this._setupTooltipKeyboardEvents()
    this._setupEditingKeyboardEvents()
    this.addDisposer(() => {
      this._cancelPendingWheelScroll()
      this._clearScrollLodTimer()
      this._releaseAnimationLoop()
      this._serverRowModel.dispose()
      this._teardownTrackpadGestureEvents()
      this._teardownTextSelectionKeyboardEvents()
      this._teardownKeyboardNavigationEvents()
      this._clearScrollbarHideTimer()
      this._clearStatePersistenceTimer()
      this._clearClipboardFeedbackTimer()
      this._clearTooltipTimers()
      this._teardownEditingKeyboardEvents()
    })

    this._api = {
      options: next => this._tableOptions(next),
      data: rows => this._tableData(rows),
      add: row => this._addRows(row),
      update: items => this._updateRows(items),
      remove: ids => this._removeRows(ids),
      setRows: rows => this._setRows(rows),
      replaceRange: (start, rows) => this._replaceRange(start, rows),
      applyDeltas: deltas => this._applyDeltas(deltas),
      flushDeltas: () => this._flushDeltas(),
      setColumnWidth: (columnId, width) => this.applyColumnWidth(columnId, width),
      autosizeColumn: columnId => this.autosizeColumn(columnId),
      autosizeColumns: columnIds => this.autosizeColumns(columnIds),
      resetColumnWidth: columnId => this.resetColumnWidth(columnId),
      getColumnState: () => this._getColumnState(),
      setColumnState: state => this._setColumnState(state),
      resetColumnState: () => this._resetColumnState(),
      hideColumn: columnId => this._hideColumn(columnId),
      showColumn: columnId => this._showColumn(columnId),
      pinColumn: (columnId, side) => this._pinColumn(columnId, side),
      unpinColumn: columnId => this._unpinColumn(columnId),
      getPersistedState: () => this._getPersistedState(),
      saveState: () => this._saveState(),
      restoreState: () => this._restoreState(),
      resetPersistedState: () => this._resetPersistedState(),
      scrollTo: (x, y) => this.setScroll(x, y),
      scrollToRow: rowIndex => this.setScroll(this.scrollX, rowIndex * this.rowHeight),
      focusCell: (rowId, columnId) => this._focusCell(rowId, columnId),
      moveActiveCell: (direction, options) => this._moveActiveCell(direction, options),
      getZoom: () => this._getZoomState(),
      setZoom: value => this._setZoom(value),
      resetZoom: () => this._resetZoom(),
      startEdit: (rowId, columnId) => this._startEdit(rowId, columnId),
      commitEdit: value => this._commitEdit(value),
      cancelEdit: () => this._cancelEdit(),
      getEditingState: () => this._cloneEditingState(),
      undo: () => this._undo(),
      redo: () => this._redo(),
      canUndo: () => this._transactionHistory.canUndo(),
      canRedo: () => this._transactionHistory.canRedo(),
      clearHistory: () => this._transactionHistory.clear(),
      getHistoryState: () => this._transactionHistory.state(),
      clearSelectionValues: () => this._clearSelectionValues(),
      fillSelection: (direction, options) => this._fillSelection(direction, options),
      getAccessibilityState: () => this._getAccessibilityState(),
      getRenderDiagnostics: () => this.__getRenderLayerDiagnostics(),
      refresh: () => this._refresh(),
      batch: callback => this._batch(callback),
      getViewport: () => ({ ...this._viewport }),
      getInteraction: () => this._getInteractionState(),
      clearHover: () => this._clearHover(),
      getSelection: () => this._cloneSelectionState(),
      setSelection: selection => this._setSelection(selection),
      selectCell: (rowId, columnId, options) => this._selectCell(rowId, columnId, options),
      selectRow: (rowId, options) => this._selectRow(rowId, options),
      selectColumn: (columnId, options) => this._selectColumn(columnId, options),
      selectRange: (range, options) => this._selectRange(range, options),
      addSelectionRange: range => this._addSelectionRange(range),
      removeSelectionRange: rangeId => this._removeSelectionRange(rangeId),
      isCellSelected: (rowId, columnId) => this._isCellSelected(rowId, columnId),
      isRowSelected: rowId => this._isRowSelected(rowId),
      isColumnSelected: columnId => this._isColumnSelected(columnId),
      copySelection: () => this._copySelection(),
      pasteClipboard: text => this._pasteClipboard(text),
      clearSelection: () => this._clearSelection(),
      getViewState: () => this._getViewState(),
      setSort: sort => this._setSort(sort),
      clearSort: columnId => this._clearSort(columnId),
      setFilter: (columnId, filter) => this._setFilter(columnId, filter),
      setFilters: filters => this._setFilters(filters),
      patchFilter: (columnId, filter) => this._setFilter(columnId, filter),
      clearFilter: columnId => this._clearFilter(columnId),
      clearFilters: columnId => this._clearFilter(columnId),
      setSearch: query => this._setSearch(query),
      clearSearch: () => this._clearSearch(),
      findNext: () => this._findNextSearchMatch(),
      findPrevious: () => this._findPreviousSearchMatch(),
      focusSearchMatch: index => this._focusSearchMatch(index),
      getSearchState: () => this._viewPipeline.getSearchState(),
      reorderRows: payload => this._reorderRows(payload),
      reorderColumns: payload => this._reorderColumns(payload),
      setColumnOrder: order => this._setColumnOrder(order, 'api'),
      resetColumnOrder: () => this._resetColumnOrder(),
      getGroupingState: () => this._viewPipeline.getGroupingState(),
      setGrouping: groups => this._setGrouping(groups),
      clearGrouping: () => this._clearGrouping(),
      toggleGroup: groupId => this._toggleGroup(groupId),
      expandGroup: groupId => this._expandGroup(groupId),
      collapseGroup: groupId => this._collapseGroup(groupId),
      expandAllGroups: () => this._expandAllGroups(),
      collapseAllGroups: () => this._collapseAllGroups(),
      resetView: () => this._resetView(),
      setChildren: children => this.setChildren(children),
    }
  }

  /**
   * Обрабатывает входящее событие DataTableRootNode.
   */
  protected override onMount(): void {
    super.onMount()
    this._setupTrackpadGestureEvents()
  }

  /**
   * Обрабатывает входящее событие DataTableRootNode.
   */
  protected override onUnmount(): void {
    this._teardownTrackpadGestureEvents()
    super.onUnmount()
  }

  /**
   * Возвращает текущую alpha hover overlay.
   */
  get hoverAlpha(): number {
    return this.props.hoverAlpha
  }

  /**
   * Обновляет alpha hover overlay.
   */
  set hoverAlpha(value: number) {
    this.setProps({ hoverAlpha: clampUnit(value) } as Partial<DataTableRootResolvedProps<Row>>)
  }

  /**
   * Возвращает текущую alpha selection overlay.
   */
  get selectionAlpha(): number {
    return this.props.selectionAlpha
  }

  /**
   * Обновляет alpha selection overlay.
   */
  set selectionAlpha(value: number) {
    this.setProps({ selectionAlpha: clampUnit(value) } as Partial<DataTableRootResolvedProps<Row>>)
  }

  /**
   * Возвращает текущую alpha tooltip overlay.
   */
  get tooltipAlpha(): number {
    return this.props.tooltipAlpha
  }

  /**
   * Обновляет alpha tooltip overlay.
   */
  set tooltipAlpha(value: number) {
    this.setProps({ tooltipAlpha: clampUnit(value) } as Partial<DataTableRootResolvedProps<Row>>)
  }

  /**
   * Возвращает высоту строки.
   */
  get rowHeight(): number {
    return Math.max(18, Math.round(this.props.rowHeight * this._zoomRowScale))
  }

  /**
   * Возвращает текущую высоту header с учетом zoom.
   */
  get headerHeight(): number {
    return Math.max(24, Math.round(this.props.headerHeight * this._zoomHeaderScale))
  }

  /**
   * Возвращает высоту встроенной filter row внутри header зоны.
   */
  private get _filterRowHeight(): number {
    if (!this.props.view.filterUi || !this.props.view.filterUi.filterRow) {
      return 0
    }
    const available = this.headerHeight - 24
    if (available < 14) {
      return 0
    }
    return Math.max(14, Math.min(24, available))
  }

  /**
   * Возвращает zoom Value для DataTableRootNode.
   */
  private get _zoomValue(): number {
    return this.props.zoom ? this.props.zoom.value : 1
  }

  /**
   * Возвращает zoom Row Scale для DataTableRootNode.
   */
  private get _zoomRowScale(): number {
    return this.props.zoom ? this.props.zoom.rowScale : 1
  }

  /**
   * Возвращает zoom Header Scale для DataTableRootNode.
   */
  private get _zoomHeaderScale(): number {
    return this.props.zoom ? this.props.zoom.headerScale : 1
  }

  /**
   * Возвращает zoom Column Scale для DataTableRootNode.
   */
  private get _zoomColumnScale(): number {
    return this.props.zoom ? this.props.zoom.columnScale : 1
  }

  /**
   * Возвращает zoom Text Scale для DataTableRootNode.
   */
  private get _zoomTextScale(): number {
    return this.props.zoom ? this.props.zoom.textScale : 1
  }

  /**
   * Возвращает zoom Icon Scale для DataTableRootNode.
   */
  private get _zoomIconScale(): number {
    return this.props.zoom ? this.props.zoom.iconScale : 1
  }

  /**
   * Возвращает font Size для DataTableRootNode.
   */
  private get _fontSize(): number {
    return Math.max(9, Math.round((this.props.fontSize ?? 13) * this._zoomTextScale))
  }

  /**
   * Возвращает line Height для DataTableRootNode.
   */
  private get _lineHeight(): number {
    return Math.max(10, Math.round((this.props.lineHeight ?? 18) * this._zoomTextScale))
  }

  /**
   * Отдает публичный API наружу.
   */
  override getApi(): DataTableRootApi<Row> {
    return this._api
  }

  /**
   * Синхронизирует размеры root node с layout-родителем.
   */
  override applyLayoutRect(rect: NovaUiLayoutRect): boolean {
    const changed = super.applyLayoutRect(rect)
    if (!changed) {
      return false
    }

    this.props.width = rect.width
    this.props.height = rect.height
    this._refresh(['layout', 'viewport'])
    return true
  }

  /**
   * Пересчитывает runtime перед кадром.
   */
  override update(): void {
    this._resolvedColumns = this._resolveColumns()
    this._syncViewPipeline()
    this._viewport = this._createViewport()
    this._syncServerRowModel()
    const revisionBeforeRangeLoad = this.store.takeRevision()
    const rangeLoader = this._isServerRowModelActive()
      ? this._serverRowModel.ensureRange(this._viewport.rowRange)
      : this.store.ensureRange(this._viewport.rowRange, this._resolveSourceQuery()).then(() => true)
    void rangeLoader.then((fresh) => {
      if (fresh && this.store.takeRevision() !== revisionBeforeRangeLoad) {
        this._refresh(['data'])
        this.store.clearDirtyState()
      }
      return undefined
    })
    this.props.onViewportChange?.({ ...this._viewport })
    this._syncSummaryState()
  }

  /**
   * Рендерит все видимые зоны таблицы.
   */
  override render(): void {
    this._textSelection.configure(resolveCoreTextSelectionOptions(this.props.textSelection))
    if (this._shouldRebuildTextSelectionTargets()) {
      this._textSelection.beginFrame()
    }
    this._renderGrid()
    this._continueTextRefinementIfNeeded()
  }

  /**
   * Реагирует на новые props.
   */
  protected override onPropsChanged(changedKeys: Array<keyof DataTableRootResolvedProps<Row>>): void {
    this.props = normalizeDataTableRootProps(this.props)
    this._textSelection.configure(resolveCoreTextSelectionOptions(this.props.textSelection))
    this.applyCommonPropsChanged(changedKeys)
    if (changedKeys.includes('store') && this.props.store && this.props.store !== this.store) {
      this.store = this.props.store
      this._viewPipeline = new DataTableViewPipeline(this.store)
      this._serverRowModel.dispose()
      this._serverRowModel = new DataTableServerRowModel(this.store, delta => this._applyDeltas(delta))
      this._transactionHistory = new DataTableTransactionHistory(this.store, this.props.history)
      this.scrollX = 0
      this.scrollY = 0
      this._hoverTarget = null
      this._selection = null
      this._selectionActive = false
      this._selectionDragState = null
      this._cancelEdit()
    }
    if (changedKeys.includes('columnState')) {
      this._columnStateOverride = null
      this._widthOverrides.clear()
      if (this.props.columnState.order.length > 0) {
        this._viewPipeline.setColumnOrder(this.props.columnState.order, this._getColumnStateInputColumns())
      }
    }
    if (
      changedKeys.includes('selection')
      && (this.props.selection === false || !this.props.selection.enabled || this.props.selection.mode === 'none')
    ) {
      this._clearSelection()
    }
    if (changedKeys.includes('scrollbars')) {
      this._clearScrollbarHideTimer()
      this._hoveredScrollbarAxis = null
      this._scrollbarDragState = null
      this._scrollbarAlpha = 0
    }
    if (changedKeys.includes('tooltip')) {
      this._clearTooltipTimers()
      this._tooltipTarget = null
      this.tooltipAlpha = 0
    }
    if (changedKeys.includes('statePersistence')) {
      this._clearStatePersistenceTimer()
      if (this.props.statePersistence) {
        this._restoreState()
      }
    }
    if (changedKeys.includes('history')) {
      this._transactionHistory.configure(this.props.history)
    }
    if (changedKeys.includes('editing') && this.props.editing === false) {
      this._cancelEdit()
    }
    if (changedKeys.includes('rows') && this.props.rows && !this.props.store) {
      this.store.setRows(this.props.rows)
    }
    this._refresh(this._resolveRefreshKindsForProps(changedKeys))
  }

  /**
   * Обновляет scroll с clamping.
   */
  setScroll(x: number, y: number): void {
    const previousViewport = this._viewport
    const previousScrollX = this.scrollX
    const previousScrollY = this.scrollY
    this.scrollX = x
    this.scrollY = y
    const requestedDelta = Math.abs(x - previousScrollX) + Math.abs(y - previousScrollY)
    if (requestedDelta > 0) {
      this._activateScrollLod(requestedDelta)
    }
    this._viewport = this._createViewport()
    this.scrollX = this._viewport.scrollX
    this.scrollY = this._viewport.scrollY
    const delta = Math.abs(this.scrollX - previousScrollX) + Math.abs(this.scrollY - previousScrollY)
    if (delta > this.rowHeight * 4) {
      this._suppressCellEnterUntil = performance.now() + 160
    }
    if (delta > 0) {
      this._suppressTextSelectionIndexFor('scroll')
      this._requestTextRefinement('scroll')
      this._columnMenuState = null
    }
    if (delta > 0) {
      this._revealScrollbars('scroll')
    }
    this._syncHoverAfterViewportChange()
    this._syncEditingRect()
    this._refresh(this._resolveViewportScrollRefreshKinds(previousViewport, this._viewport))
  }

  /**
   * Разделяет scroll invalidation по осям, чтобы вертикальный scroll не пересобирал header/pinned layers.
   */
  private _resolveViewportScrollRefreshKinds(
    previous: DataTableViewport,
    next: DataTableViewport,
  ): Array<string> {
    const kinds: Array<string> = []
    if (previous.scrollX !== next.scrollX
      || previous.centerColumnOffset !== next.centerColumnOffset
      || previous.centerColumnRange.start !== next.centerColumnRange.start
      || previous.centerColumnRange.end !== next.centerColumnRange.end) {
      kinds.push('viewport-scroll-x')
    }
    if (previous.scrollY !== next.scrollY
      || previous.rowRange.start !== next.rowRange.start
      || previous.rowRange.end !== next.rowRange.end) {
      kinds.push('viewport-scroll-y')
    }
    return kinds.length > 0 ? kinds : ['scrollbar']
  }

  /**
   * Коалесцирует wheel burst до одного scroll update за animation frame.
   */
  private _scheduleWheelScroll(x: number, y: number): void {
    this._pendingWheelScroll = { x, y }
    if (this._wheelScrollFrame !== 0) {
      return
    }

    if (typeof requestAnimationFrame !== 'function') {
      this._flushPendingWheelScroll()
      return
    }

    this._wheelScrollFrame = requestAnimationFrame(() => {
      this._wheelScrollFrame = 0
      this._flushPendingWheelScroll()
    })
  }

  /**
   * Применяет последний накопленный wheel scroll target.
   */
  private _flushPendingWheelScroll(): void {
    const pending = this._pendingWheelScroll
    this._pendingWheelScroll = null
    if (!pending) {
      return
    }
    this.setScroll(pending.x, pending.y)
  }

  /**
   * Сбрасывает отложенный wheel scroll при unmount.
   */
  private _cancelPendingWheelScroll(): void {
    if (this._wheelScrollFrame !== 0 && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this._wheelScrollFrame)
    }
    this._wheelScrollFrame = 0
    this._pendingWheelScroll = null
  }

  /**
   * Временно уменьшает overscan на активной прокрутке, чтобы scroll frame не
   * строил offscreen ячейки, которые пользователь не видит.
   */
  private _activateScrollLod(delta: number): void {
    if (!this._canUseScrollLod()) {
      return
    }

    const text = this.props.performance.text
    const baseDuration = text ? text.refineAfterScrollMs : 120
    const duration = Math.max(90, Math.min(220, baseDuration + (delta > this.rowHeight * 4 ? 60 : 0)))
    this._scrollLodUntil = Math.max(this._scrollLodUntil, performance.now() + duration)
    this._scheduleScrollLodExit(duration)
  }

  /**
   * Проверяет, можно ли включать scroll LOD для текущего performance profile.
   */
  private _canUseScrollLod(): boolean {
    const text = this.props.performance.text
    return !text || text.mode !== 'quality'
  }

  /**
   * Возвращает true, пока таблица находится в активной scroll/pan фазе.
   */
  private _isScrollLodActive(): boolean {
    return this._canUseScrollLod() && performance.now() < this._scrollLodUntil
  }

  /**
   * Планирует восстановление нормального overscan после завершения scroll burst.
   */
  private _scheduleScrollLodExit(delay: number): void {
    this._clearScrollLodTimer()
    this._scrollLodTimer = setTimeout(() => this._finishScrollLodIfIdle(), Math.max(16, delay))
  }

  /**
   * Восстанавливает обычный overscan, если scroll burst действительно завершился.
   */
  private _finishScrollLodIfIdle(): void {
    this._scrollLodTimer = null
    const remaining = this._scrollLodUntil - performance.now()
    if (remaining > 0) {
      this._scheduleScrollLodExit(remaining)
      return
    }
    this._refresh(['viewport'])
  }

  /**
   * Очищает timer scroll LOD.
   */
  private _clearScrollLodTimer(): void {
    if (!this._scrollLodTimer) {
      return
    }
    clearTimeout(this._scrollLodTimer)
    this._scrollLodTimer = null
  }

  /**
   * Применяет пользовательскую ширину колонки.
   */
  applyColumnWidth(columnId: string, width: number): boolean {
    const column = this._resolvedColumns.find(item => item.id === columnId)
    const input = this.props.columns.find(item => item.id === columnId)
    if (!column || !input) {
      return false
    }

    const previousWidth = column.resolvedWidth
    const nextWidth = clampWidth(width, column.minWidth, column.maxWidth)
    if (previousWidth === nextWidth) {
      return false
    }

    this._widthOverrides.set(columnId, nextWidth / this._zoomColumnScale)
    this._resolvedColumns = this._resolveColumns()
    const nextColumn = this._resolvedColumns.find(item => item.id === columnId) ?? column
    this.props.onColumnResize?.({
      column: nextColumn,
      width: nextWidth,
      previousWidth,
    })
    this._emitColumnStateChange()
    this._refresh(['layout', 'columns'])
    return true
  }

  /**
   * Автоматически подбирает ширину одной колонки.
   */
  autosizeColumn(columnId: string): boolean {
    const column = this.props.columns.find(item => item.id === columnId)
    if (!column) {
      return false
    }

    this._widthOverrides.set(columnId, autosizeDataTableColumn(column, this.store))
    this._emitColumnStateChange()
    this._refresh(['layout', 'columns'])
    return true
  }

  /**
   * Автоматически подбирает ширины набора колонок.
   */
  autosizeColumns(columnIds?: Array<string>): void {
    const ids = new Set(columnIds ?? this.props.columns.map(column => column.id))
    for (const column of this.props.columns) {
      if (ids.has(column.id)) {
        this._widthOverrides.set(column.id, autosizeDataTableColumn(column, this.store))
      }
    }
    this._emitColumnStateChange()
    this._refresh(['layout', 'columns'])
  }

  /**
   * Сбрасывает пользовательскую ширину колонки.
   */
  resetColumnWidth(columnId: string): boolean {
    const changed = this._widthOverrides.delete(columnId)
    if (changed) {
      this._emitColumnStateChange()
      this._refresh(['layout', 'columns'])
    }
    return changed
  }

  /**
   * Возвращает состояние из configured storage.
   */
  private _getPersistedState(): DataTablePersistedState<Row> | null {
    return this._readPersistedState()
  }

  /**
   * Сохраняет текущие runtime-срезы состояния.
   */
  private _saveState(): DataTablePersistedState<Row> | null {
    const persistence = this.props.statePersistence
    if (!persistence) {
      return null
    }

    const state = this._createPersistedState()
    return this._statePersistenceService.write(persistence, JSON.stringify(state)) ? state : null
  }

  /**
   * Восстанавливает состояние из configured storage.
   */
  private _restoreState(): boolean {
    const state = this._readPersistedState()
    if (!state) {
      return false
    }

    this._applyPersistedColumnState(state)
    this._resolvedColumns = this._resolveColumns()
    this._syncViewPipeline()
    this._applyPersistedViewState(state)
    this._emitColumnStateChange()
    this._emitViewQuery('all')
    this._refresh(['columns', 'layout', 'data'])
    return true
  }

  /**
   * Удаляет сохраненное состояние.
   */
  private _resetPersistedState(): void {
    const persistence = this.props.statePersistence
    this._clearStatePersistenceTimer()
    if (!persistence) {
      return
    }
    this._statePersistenceService.remove(persistence)
  }

  /**
   * Собирает serializable snapshot текущего runtime state.
   */
  private _createPersistedState(): DataTablePersistedState<Row> {
    const viewState = this._viewPipeline.getState()
    const state: DataTablePersistedState<Row> = {
      version: this.props.statePersistence ? this.props.statePersistence.version : 1,
      savedAt: Date.now(),
    }
    if (this._isStateSliceIncluded('columnState')) {
      state.columnState = this._toColumnStateInput(this._getColumnState())
    }
    if (this._isStateSliceIncluded('sort')) {
      state.sort = [...viewState.sort]
    }
    if (this._isStateSliceIncluded('filters')) {
      state.filters = cloneSerializable(viewState.filters)
    }
    if (this._isStateSliceIncluded('search')) {
      state.search = cloneSerializable(viewState.search.query)
    }
    if (this._isStateSliceIncluded('grouping')) {
      state.grouping = {
        enabled: viewState.grouping.enabled,
        groups: cloneSerializable(viewState.grouping.groups),
        expanded: cloneSerializable(viewState.grouping.expanded),
        footerPlacement: viewState.grouping.footerPlacement,
      }
    }
    return state
  }

  /**
   * Планирует debounced save для state persistence.
   */
  private _scheduleStatePersistence(): void {
    const persistence = this.props.statePersistence
    if (!persistence) {
      return
    }
    this._clearStatePersistenceTimer()
    if (persistence.debounceMs <= 0) {
      this._saveState()
      return
    }
    this._statePersistenceTimer = setTimeout(() => {
      this._statePersistenceTimer = null
      this._saveState()
    }, persistence.debounceMs)
  }

  /**
   * Очищает отложенный persistence timer.
   */
  private _clearStatePersistenceTimer(): void {
    if (!this._statePersistenceTimer) {
      return
    }
    clearTimeout(this._statePersistenceTimer)
    this._statePersistenceTimer = null
  }

  /**
   * Проверяет, входит ли срез в configured persistence include.
   */
  private _isStateSliceIncluded(slice: DataTableStateSlice): boolean {
    return !!this.props.statePersistence && this.props.statePersistence.include.includes(slice)
  }

  /**
   * Читает persisted state без выброса исключений наружу.
   */
  private _readPersistedState(): DataTablePersistedState<Row> | null {
    const persistence = this.props.statePersistence
    if (!persistence) {
      return null
    }

    try {
      const raw = this._statePersistenceService.read(persistence)
      if (!raw) {
        return null
      }
      const parsed = JSON.parse(raw) as Partial<DataTablePersistedState<Row>>
      if (typeof parsed.version !== 'number') {
        return null
      }
      if (parsed.version !== persistence.version) {
        return persistence.migrate
          ? persistence.migrate(parsed as DataTablePersistedState<Row>, parsed.version) as DataTablePersistedState<Row>
          : null
      }
      return parsed as DataTablePersistedState<Row>
    }
    catch {
      return null
    }
  }

  /**
   * Применяет persisted column state до resolution колонок.
   */
  private _applyPersistedColumnState(state: DataTablePersistedState<Row> | null): void {
    if (!state?.columnState || !this._isStateSliceIncluded('columnState')) {
      return
    }
    this._columnStateOverride = cloneColumnStateInput(state.columnState)
    this._widthOverrides.clear()
  }

  /**
   * Применяет persisted view state после sync pipeline.
   */
  private _applyPersistedViewState(state: DataTablePersistedState<Row> | null): void {
    if (!state) {
      return
    }
    if (state.sort && this._isStateSliceIncluded('sort') && this.props.view.sorting) {
      this._viewPipeline.setSort(state.sort)
    }
    if (state.filters && this._isStateSliceIncluded('filters') && this.props.view.filtering) {
      this._viewPipeline.setFilters(state.filters)
    }
    if (state.search && this._isStateSliceIncluded('search') && this.props.view.search) {
      this._viewPipeline.setSearch(state.search)
    }
    if (state.grouping && this._isStateSliceIncluded('grouping') && this.props.view.grouping) {
      this._viewPipeline.setGrouping(state.grouping.enabled ? state.grouping.groups : [])
      this._viewPipeline.setGroupingExpanded(state.grouping.expanded)
    }
  }

  /**
   * Возвращает сохраненное состояние колонок с учетом runtime override.
   */
  private _getColumnState(): DataTableResolvedColumnState {
    const merged = this._resolveMergedColumnState()
    const widths: Record<string, number> = { ...merged.widths }
    for (const [columnId, width] of this._widthOverrides) {
      widths[columnId] = width
    }
    const runtimeOrder = this._viewPipeline.getState().columnOrder
    return {
      widths,
      order: this._resolveColumnStateOrder(runtimeOrder, merged),
      hidden: [...merged.hidden],
      pinned: {
        left: [...merged.pinned.left],
        right: [...merged.pinned.right],
      },
      groups: [...merged.groups],
      autosizeMode: merged.autosizeMode,
      version: merged.version,
    }
  }

  /**
   * Программно заменяет состояние ширин, порядка, скрытия и pinning колонок.
   */
  private _setColumnState(state: DataTableColumnState): void {
    this._columnStateOverride = cloneColumnStateInput(state)
    this._widthOverrides.clear()
    this._viewPipeline.setColumnOrder(state.order ?? [], this._getColumnStateInputColumns(state))
    this._resolvedColumns = this._resolveColumns()
    this._emitColumnStateChange()
    this._emitViewQuery('column')
    this._refresh(['columns', 'layout'])
  }

  /**
   * Сбрасывает runtime-состояние колонок к props/default.
   */
  private _resetColumnState(): void {
    this._columnStateOverride = null
    this._widthOverrides.clear()
    this._viewPipeline.resetColumnOrder()
    this._resolvedColumns = this._resolveColumns()
    this._emitColumnStateChange()
    this._emitViewQuery('column')
    this._refresh(['columns', 'layout'])
  }

  /**
   * Скрывает колонку без удаления ее definition.
   */
  private _hideColumn(columnId: string): void {
    const state = this._toColumnStateInput(this._getColumnState())
    state.hidden = [...new Set([...(state.hidden ?? []), columnId])]
    this._setColumnState(state)
  }

  /**
   * Показывает ранее скрытую колонку.
   */
  private _showColumn(columnId: string): void {
    const state = this._toColumnStateInput(this._getColumnState())
    state.hidden = (state.hidden ?? []).filter(id => id !== columnId)
    this._setColumnState(state)
  }

  /**
   * Закрепляет колонку слева или справа.
   */
  private _pinColumn(columnId: string, side: DataTableResolvedColumn<Row>['pinned']): void {
    if (!side) {
      return
    }
    const state = this._toColumnStateInput(this._getColumnState())
    const pinned = {
      left: (state.pinned?.left ?? []).filter(id => id !== columnId),
      right: (state.pinned?.right ?? []).filter(id => id !== columnId),
    }
    pinned[side] = [...pinned[side], columnId]
    state.pinned = pinned
    this._setColumnState(state)
  }

  /**
   * Снимает закрепление с колонки.
   */
  private _unpinColumn(columnId: string): void {
    const state = this._toColumnStateInput(this._getColumnState())
    state.pinned = {
      left: (state.pinned?.left ?? []).filter(id => id !== columnId),
      right: (state.pinned?.right ?? []).filter(id => id !== columnId),
    }
    this._setColumnState(state)
  }

  /**
   * Инвалидирует области таблицы и runtime.
   */
  invalidateDataTable(kinds: Array<string>): void {
    this._refresh(kinds)
  }

  /**
   * Заменяет runtime children.
   */
  setChildren(children: Array<unknown>): void {
    void children
    this._refresh(['custom'])
  }

  /**
   * Выполняет внутренний шаг tableOptions для DataTableRootNode.
   */
  private _tableOptions(next?: Partial<DataTableRootOptions<Row>>): DataTableRootOptions<Row> {
    if (!next) {
      return {
        columns: this.props.columns,
        pinnedColumns: this.props.pinnedColumns,
        pinnedRows: this.props.pinnedRows,
        rowHeight: this.props.rowHeight,
        headerHeight: this.props.headerHeight,
        overscanRows: this.props.overscanRows,
        overscanColumns: this.props.overscanColumns,
        interaction: this.props.interaction,
        selection: this.props.selection,
        clipboard: this.props.clipboard,
        view: this.props.view,
        scrollbars: this.props.scrollbars,
        tooltip: this.props.tooltip,
        textSelection: this.props.textSelection,
        zoom: this.props.zoom,
        editing: this.props.editing,
        keyboardNavigation: this.props.keyboardNavigation,
        columnState: this._getColumnState(),
        statePersistence: this.props.statePersistence,
        performance: this.props.performance,
      }
    }

    this.setProps(next as Partial<DataTableRootResolvedProps<Row>>)
    return this._tableOptions()
  }

  /**
   * Возвращает значение состояния DataTableRootNode.
   */
  private _getZoomState(): DataTableZoomState {
    return {
      value: this._zoomValue,
      mode: this.props.zoom ? this.props.zoom.mode : 'density',
      affects: this.props.zoom ? [...this.props.zoom.affects] : ['rows', 'headers', 'text', 'icons'],
      rowScale: this._zoomRowScale,
      headerScale: this._zoomHeaderScale,
      columnScale: this._zoomColumnScale,
      textScale: this._zoomTextScale,
      iconScale: this._zoomIconScale,
    }
  }

  /**
   * Обновляет значение состояния DataTableRootNode.
   */
  private _setZoom(value: number | DataTableZoomOptions): void {
    const current = this.props.zoom
    const nextValue = typeof value === 'number' ? value : value.value ?? current?.value ?? 1
    const nextZoom: DataTableZoomOptions = typeof value === 'number'
      ? {
          value: nextValue,
          min: current ? current.min : undefined,
          max: current ? current.max : undefined,
          mode: current ? current.mode : undefined,
          affects: current ? [...current.affects] : undefined,
          preserveAnchor: current ? current.preserveAnchor : undefined,
          wheel: current ? current.wheel : undefined,
        }
      : value

    this._applyZoom(nextZoom)
  }

  /**
   * Сбрасывает состояние к базовым значениям DataTableRootNode.
   */
  private _resetZoom(): void {
    this._applyZoom({ value: 1 })
  }

  /**
   * Применяет подготовленное состояние DataTableRootNode.
   */
  private _applyZoom(zoom: DataTableZoomOptions): void {
    const previousViewport = this._viewport
    const pointer = this._lastPointerPosition
    const preservePointer = (zoom.preserveAnchor ?? this.props.zoom?.preserveAnchor ?? 'pointer') === 'pointer' && pointer
    const relativeX = preservePointer
      ? Math.max(0, pointer.x - previousViewport.bodyX)
      : previousViewport.bodyWidth / 2
    const relativeY = preservePointer
      ? Math.max(0, pointer.y - previousViewport.bodyY)
      : previousViewport.bodyHeight / 2
    const anchorXRatio = previousViewport.contentWidth > 0
      ? (this.scrollX + relativeX) / previousViewport.contentWidth
      : 0
    const anchorYRatio = previousViewport.contentHeight > 0
      ? (this.scrollY + relativeY) / previousViewport.contentHeight
      : 0

    this.setProps({ zoom } as Partial<DataTableRootResolvedProps<Row>>)
    this._resolvedColumns = this._resolveColumns()
    this._syncViewPipeline()
    this._viewport = this._createViewport()
    const nextX = this._viewport.contentWidth * anchorXRatio - relativeX
    const nextY = this._viewport.contentHeight * anchorYRatio - relativeY
    this.setScroll(nextX, nextY)
    this._refresh(['layout', 'viewport'])
    this._suppressTextSelectionIndexFor('zoom')
    this._requestTextRefinement('zoom')
    this.props.onZoomChange?.(this._getZoomState())
  }

  /**
   * Выполняет внутренний шаг tableData для DataTableRootNode.
   */
  private _tableData(rows?: Array<Row>): Array<Row> {
    if (rows) {
      this._setRows(rows)
    }
    return this.store.getRows()
  }

  /**
   * Выполняет внутренний шаг addRows для DataTableRootNode.
   */
  private _addRows(row: Row | Array<Row>): void {
    if (Array.isArray(row)) {
      this.store.insertMany(row)
    }
    else { this.store.insert(row) }
    this._refresh(['data', 'layout'])
  }

  /**
   * Обновляет runtime-состояние DataTableRootNode.
   */
  private _updateRows(items: Array<Partial<Row> & { id: DataTableRowId }> | Partial<Row> & { id: DataTableRowId }): void {
    const patches = Array.isArray(items) ? items : [items]
    for (const patch of patches) {
      const { id, ...rest } = patch
      this.store.patch(id, rest as unknown as Partial<Row>)
    }
    this._refresh(['data'])
  }

  /**
   * Удаляет сущность из runtime-коллекции DataTableRootNode.
   */
  private _removeRows(ids: DataTableRowId | Array<DataTableRowId>): void {
    if (Array.isArray(ids)) {
      this.store.removeMany(ids)
    }
    else { this.store.remove(ids) }
    this._refresh(['data', 'layout'])
  }

  /**
   * Обновляет значение состояния DataTableRootNode.
   */
  private _setRows(rows: Array<Row>): void {
    this.store.setRows(rows)
    this._refresh(['data', 'layout'])
  }

  /**
   * Выполняет внутренний шаг replaceRange для DataTableRootNode.
   */
  private _replaceRange(start: number, rows: Array<Row>): void {
    this.store.replaceRange(start, rows)
    this._refresh(['data', 'layout'])
  }

  /**
   * Применяет подготовленное состояние DataTableRootNode.
   */
  private _applyDeltas(deltas: DataTableDelta<Row> | Array<DataTableDelta<Row>>): void {
    const items = Array.isArray(deltas) ? deltas : [deltas]
    if (items.length === 0) {
      return
    }

    this._pendingDeltas.push(...items)
    if (this._deltaFlushQueued) {
      return
    }

    this._deltaFlushQueued = true
    this._scheduleDeltaFlush()
  }

  /**
   * Принудительно завершает накопленные изменения DataTableRootNode.
   */
  private _flushDeltas(): void {
    this._deltaFlushQueued = false
    this._flushDeltaQueue(false)
  }

  /**
   * Принудительно завершает накопленные изменения DataTableRootNode.
   */
  private _flushDeltasWithinBudget(): void {
    this._deltaFlushQueued = false
    this._flushDeltaQueue(true)
  }

  /**
   * Принудительно завершает накопленные изменения DataTableRootNode.
   */
  private _flushDeltaQueue(useBudget: boolean): void {
    if (this._pendingDeltas.length === 0) {
      return
    }

    const startedAt = performance.now()
    const budget = Math.max(1, this.props.performance.deltaFrameBudgetMs)
    do {
      const count = useBudget ? Math.min(this._pendingDeltas.length, 5_000) : this._pendingDeltas.length
      const deltas = this._pendingDeltas.splice(0, count)
      this.store.applyDeltaBatch(deltas)
      const dirty = this.store.getDirtyState()
      if (dirty.structural) {
        this._refresh(['data', 'layout', 'view', 'summary'])
      }
      else if (this._isDirtyStateVisible(dirty)) {
        this._refresh(['data', 'summary'])
      }
      this.store.clearDirtyState()
      this._syncSummaryState()
    } while (this._pendingDeltas.length > 0 && performance.now() - startedAt < budget)

    if (this._pendingDeltas.length > 0 && useBudget) {
      this._deltaFlushQueued = true
      this._scheduleDeltaFlush()
    }
  }

  /**
   * Применяет пользовательскую transaction и записывает ее в history.
   */
  private _commitDeltas(
    deltas: DataTableDelta<Row> | Array<DataTableDelta<Row>>,
    options: { source: DataTableTransaction<Row>['source'], label?: string, record?: boolean },
  ): DataTableTransaction<Row> | null {
    const transaction = this._transactionHistory.commit(deltas, options)
    this._refresh(['data', 'layout', 'summary', 'interaction'])
    return transaction
  }

  /**
   * Откатывает последнюю пользовательскую transaction.
   */
  private _undo(): boolean {
    const changed = this._transactionHistory.undo()
    if (changed) {
      this._refresh(['data', 'layout', 'summary', 'interaction'])
    }
    return changed
  }

  /**
   * Повторяет последнюю отмененную transaction.
   */
  private _redo(): boolean {
    const changed = this._transactionHistory.redo()
    if (changed) {
      this._refresh(['data', 'layout', 'summary', 'interaction'])
    }
    return changed
  }

  /**
   * Планирует применение server/SSE deltas не чаще одного раза за frame.
   */
  private _scheduleDeltaFlush(): void {
    if (!this.nova.raph.loopEnabled && typeof queueMicrotask === 'function') {
      queueMicrotask(() => this._flushDeltasWithinBudget())
      return
    }
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => this._flushDeltasWithinBudget())
      return
    }
    setTimeout(() => this._flushDeltasWithinBudget(), 0)
  }

  /**
   * Выполняет внутренний шаг isDirtyStateVisible для DataTableRootNode.
   */
  private _isDirtyStateVisible(dirty: DataTableDirtyState): boolean {
    if (dirty.structural) {
      return true
    }

    const pageSize = this.props.performance.pageSize
    for (const page of dirty.pages) {
      const start = page * pageSize
      const end = start + pageSize
      if (end >= this._viewport.rowRange.start && start <= this._viewport.rowRange.end) {
        return true
      }
    }

    for (const rowId of dirty.rows) {
      const rowIndex = this._viewPipeline.findViewIndexByRowId(rowId)
      if (rowIndex !== undefined && rowIndex >= this._viewport.rowRange.start && rowIndex < this._viewport.rowRange.end) {
        return true
      }
    }
    return false
  }

  /**
   * Выполняет внутренний шаг batch для DataTableRootNode.
   */
  private _batch(callback: (api: DataTableRootApi<Row>) => void): void {
    this.store.batch(() => callback(this._api))
    this._refresh(['data', 'layout'])
  }

  /**
   * Возвращает значение состояния DataTableRootNode.
   */
  private _getViewState(): DataTableViewState {
    return this._viewPipeline.getState()
  }

  /**
   * Обновляет значение состояния DataTableRootNode.
   */
  private _setSort(sort: Parameters<DataTableRootApi<Row>['setSort']>[0]): void {
    this._viewPipeline.setSort(sort)
    this._emitViewQuery('sort')
    this.setScroll(this.scrollX, 0)
    this._refresh(['data', 'layout'])
  }

  /**
   * Очищает накопленное состояние DataTableRootNode.
   */
  private _clearSort(columnId?: string): void {
    this._viewPipeline.clearSort(columnId)
    this._emitViewQuery('sort')
    this.setScroll(this.scrollX, 0)
    this._refresh(['data', 'layout'])
  }

  /**
   * Обновляет значение состояния DataTableRootNode.
   */
  private _setFilter(columnId: string, filter: Parameters<DataTableRootApi<Row>['setFilter']>[1]): void {
    this._viewPipeline.setFilter(columnId, filter)
    this._emitViewQuery('filter')
    this.setScroll(this.scrollX, 0)
    this._refresh(['data', 'layout'])
  }

  /**
   * Обновляет значение состояния DataTableRootNode.
   */
  private _setFilters(filters: Parameters<DataTableRootApi<Row>['setFilters']>[0]): void {
    this._viewPipeline.setFilters(filters)
    this._emitViewQuery('filter')
    this.setScroll(this.scrollX, 0)
    this._refresh(['data', 'layout'])
  }

  /**
   * Очищает накопленное состояние DataTableRootNode.
   */
  private _clearFilter(columnId?: string): void {
    this._viewPipeline.clearFilter(columnId)
    this._emitViewQuery('filter')
    this.setScroll(this.scrollX, 0)
    this._refresh(['data', 'layout'])
  }

  /**
   * Обновляет значение состояния DataTableRootNode.
   */
  private _setSearch(query: Parameters<DataTableRootApi<Row>['setSearch']>[0]): void {
    this._viewPipeline.setSearch(query)
    this._serverSearchCursor = undefined
    this._serverSearchPreviousCursor = undefined
    this._serverSearchHasMore = false
    this._emitViewQuery('search')
    this._requestServerSearchIfNeeded(0)
    this._refresh(['data', 'layout'])
  }

  /**
   * Очищает накопленное состояние DataTableRootNode.
   */
  private _clearSearch(): void {
    this._viewPipeline.clearSearch()
    this._serverSearchRequestId += 1
    this._serverSearchResolveRequestId += 1
    this._serverSearchCursor = undefined
    this._serverSearchPreviousCursor = undefined
    this._serverSearchHasMore = false
    this._serverSearchInFlight = false
    this._emitViewQuery('search')
    this._refresh(['data', 'layout'])
  }

  /**
   * Находит сущность по runtime-критериям DataTableRootNode.
   */
  private _findNextSearchMatch(): ReturnType<DataTableRootApi<Row>['findNext']> {
    if (this._isServerRowModelActive() && (this._serverSearchCursor || this._serverSearchHasMore)) {
      const state = this._viewPipeline.getSearchState()
      if (state.matches.length === 0 || state.activeIndex >= state.matches.length - 1) {
        this._requestServerSearchPage({ mode: 'append', activeIndex: state.matches.length })
        this._emitViewQuery('search')
        this._refresh(['data', 'layout'])
        return state.activeMatch
      }
    }

    const match = this._viewPipeline.findNext()
    if (match) {
      this._scrollToSearchMatch(match)
    }
    this._emitViewQuery('search')
    this._refresh(['data', 'layout'])
    return match
  }

  /**
   * Находит сущность по runtime-критериям DataTableRootNode.
   */
  private _findPreviousSearchMatch(): ReturnType<DataTableRootApi<Row>['findPrevious']> {
    if (this._isServerRowModelActive() && this._serverSearchPreviousCursor) {
      const state = this._viewPipeline.getSearchState()
      if (state.matches.length === 0 || state.activeIndex <= 0) {
        this._requestServerSearchPage({ mode: 'prepend' })
        this._emitViewQuery('search')
        this._refresh(['data', 'layout'])
        return state.activeMatch
      }
    }

    const match = this._viewPipeline.findPrevious()
    if (match) {
      this._scrollToSearchMatch(match)
    }
    this._emitViewQuery('search')
    this._refresh(['data', 'layout'])
    return match
  }

  /**
   * Переводит focus в целевое состояние DataTableRootNode.
   */
  private _focusSearchMatch(index: number): ReturnType<DataTableRootApi<Row>['focusSearchMatch']> {
    const match = this._viewPipeline.focusSearchMatch(index)
    if (match) {
      this._scrollToSearchMatch(match)
    }
    this._emitViewQuery('search')
    this._refresh(['data', 'layout'])
    return match
  }

  /**
   * Выполняет внутренний шаг scrollToSearchMatch для DataTableRootNode.
   */
  private _scrollToSearchMatch(match: NonNullable<ReturnType<DataTableRootApi<Row>['findNext']>>): void {
    if (this._isServerRowModelActive() && match.rowId !== undefined) {
      this._resolveServerSearchRowAndScroll(match)
      return
    }

    let nextScrollX = this.scrollX
    if (match.columnId) {
      const centerColumns = this._resolvedColumns.filter(column => !column.pinned)
      let columnX = 0
      for (const column of centerColumns) {
        if (column.id === match.columnId) {
          break
        }
        columnX += column.resolvedWidth
      }
      const column = centerColumns.find(item => item.id === match.columnId)
      if (column) {
        if (columnX < this.scrollX) {
          nextScrollX = columnX
        }
        else if (columnX + column.resolvedWidth > this.scrollX + this._viewport.bodyWidth) {
          nextScrollX = columnX + column.resolvedWidth - this._viewport.bodyWidth
        }
      }
    }

    this.setScroll(nextScrollX, match.rowIndex * this.rowHeight)
  }

  /**
   * Фокусирует server-side search match через source.resolveRowIndex без локального скана.
   */
  private _resolveServerSearchRowAndScroll(match: DataTableSearchState['activeMatch']): void {
    if (!match || match.rowId === undefined) {
      return
    }
    const requestId = ++this._serverSearchResolveRequestId
    void this._serverRowModel.resolveRowIndex(match.rowId).then((rowIndex) => {
      if (requestId !== this._serverSearchResolveRequestId) {
        return
      }
      this._scrollToResolvedSearchPosition({ ...match, rowIndex: rowIndex ?? match.rowIndex })
    })
  }

  /**
   * Прокручивает таблицу к найденной строке/ячейке.
   */
  private _scrollToResolvedSearchPosition(match: NonNullable<DataTableSearchState['activeMatch']>): void {
    let nextScrollX = this.scrollX
    if (match.columnId) {
      const centerColumns = this._resolvedColumns.filter(column => !column.pinned)
      let columnX = 0
      for (const column of centerColumns) {
        if (column.id === match.columnId) {
          break
        }
        columnX += column.resolvedWidth
      }
      const column = centerColumns.find(item => item.id === match.columnId)
      if (column) {
        if (columnX < this.scrollX) {
          nextScrollX = columnX
        }
        else if (columnX + column.resolvedWidth > this.scrollX + this._viewport.bodyWidth) {
          nextScrollX = columnX + column.resolvedWidth - this._viewport.bodyWidth
        }
      }
    }

    this.setScroll(nextScrollX, match.rowIndex * this.rowHeight)
  }

  /**
   * Выполняет внутренний шаг reorderRows для DataTableRootNode.
   */
  private _reorderRows(payload: Parameters<DataTableRootApi<Row>['reorderRows']>[0]): void {
    const mode = payload.mode ?? ((this.props.view.rowOrdering && this.props.view.rowOrdering.mode) || 'view')
    if (mode === 'store') {
      const rows = this.store.getRows()
      const [row] = rows.splice(payload.fromIndex, 1)
      if (row) {
        rows.splice(payload.toIndex, 0, row)
      }
      this.store.setRows(rows)
    }
    const next = this._viewPipeline.reorderRows({ ...payload, mode })
    this.props.onRowOrderChange?.(next)
    this._emitViewQuery('row')
    this._refresh(['data', 'layout'])
  }

  /**
   * Выполняет внутренний шаг reorderColumns для DataTableRootNode.
   */
  private _reorderColumns(payload: Parameters<DataTableRootApi<Row>['reorderColumns']>[0]): void {
    const next = this._viewPipeline.reorderColumns(payload, this._getColumnStateInputColumns())
    this._columnStateOverride = {
      ...this._toColumnStateInput(this._getColumnState()),
      order: next.order,
    }
    this.props.onColumnOrderChange?.(next)
    this._emitColumnStateChange()
    this._emitViewQuery('column')
    this._refresh(['columns', 'layout'])
  }

  /**
   * Обновляет значение состояния DataTableRootNode.
   */
  private _setColumnOrder(order: Array<string>, reason: 'drag' | 'api' = 'api'): void {
    const nextOrder = this._viewPipeline.setColumnOrder(order, this._getColumnStateInputColumns())
    this._columnStateOverride = {
      ...this._toColumnStateInput(this._getColumnState()),
      order: nextOrder,
    }
    this.props.onColumnOrderChange?.({
      columnId: '',
      fromIndex: -1,
      toIndex: -1,
      order: nextOrder,
      reason,
    })
    this._emitColumnStateChange()
    this._emitViewQuery('column')
    this._refresh(['columns', 'layout'])
  }

  /**
   * Сбрасывает состояние к базовым значениям DataTableRootNode.
   */
  private _resetColumnOrder(): void {
    this._viewPipeline.resetColumnOrder()
    const state = this._toColumnStateInput(this._getColumnState())
    state.order = []
    this._columnStateOverride = state
    this.props.onColumnOrderChange?.({
      columnId: '',
      fromIndex: -1,
      toIndex: -1,
      order: [],
      reason: 'reset',
    })
    this._emitColumnStateChange()
    this._emitViewQuery('column')
    this._refresh(['columns', 'layout'])
  }

  /**
   * Обновляет значение состояния DataTableRootNode.
   */
  private _setGrouping(groups: Parameters<DataTableRootApi<Row>['setGrouping']>[0]): void {
    this._viewPipeline.setGrouping(groups)
    this._emitViewQuery('grouping')
    this.setScroll(this.scrollX, 0)
    this._refresh(['data', 'layout'])
  }

  /**
   * Очищает накопленное состояние DataTableRootNode.
   */
  private _clearGrouping(): void {
    this._viewPipeline.clearGrouping()
    this._emitViewQuery('grouping')
    this.setScroll(this.scrollX, 0)
    this._refresh(['data', 'layout'])
  }

  /**
   * Переключает флаг состояния DataTableRootNode.
   */
  private _toggleGroup(groupId: string): void {
    const group = this._viewPipeline.toggleGroup(groupId)
    if (group) {
      this.props.onGroupToggle?.(group)
    }
    this._emitViewQuery('grouping')
    this._refresh(['data', 'layout'])
  }

  /**
   * Выполняет внутренний шаг expandGroup для DataTableRootNode.
   */
  private _expandGroup(groupId: string): void {
    this._viewPipeline.expandGroup(groupId)
    this._emitViewQuery('grouping')
    this._refresh(['data', 'layout'])
  }

  /**
   * Выполняет внутренний шаг collapseGroup для DataTableRootNode.
   */
  private _collapseGroup(groupId: string): void {
    this._viewPipeline.collapseGroup(groupId)
    this._emitViewQuery('grouping')
    this._refresh(['data', 'layout'])
  }

  /**
   * Выполняет внутренний шаг expandAllGroups для DataTableRootNode.
   */
  private _expandAllGroups(): void {
    this._viewPipeline.expandAllGroups()
    this._emitViewQuery('grouping')
    this._refresh(['data', 'layout'])
  }

  /**
   * Выполняет внутренний шаг collapseAllGroups для DataTableRootNode.
   */
  private _collapseAllGroups(): void {
    this._viewPipeline.collapseAllGroups()
    this._emitViewQuery('grouping')
    this._refresh(['data', 'layout'])
  }

  /**
   * Сбрасывает состояние к базовым значениям DataTableRootNode.
   */
  private _resetView(): void {
    this._viewPipeline.reset()
    this._emitViewQuery('all')
    this.setScroll(0, 0)
    this._refresh(['data', 'columns', 'layout'])
  }

  /**
   * Публикует событие во внутренний event bus DataTableRootNode.
   */
  private _emitViewQuery(kind: 'sort' | 'filter' | 'search' | 'row' | 'column' | 'grouping' | 'all'): void {
    const state = this._viewPipeline.getState()
    if (kind === 'sort' || kind === 'all') {
      this.props.onSortChange?.(state.sort)
    }
    if (kind === 'filter' || kind === 'all') {
      this.props.onFilterChange?.(state.filters)
    }
    if (kind === 'search' || kind === 'all') {
      this.props.onSearchChange?.(state.search)
    }
    if (kind === 'grouping' || kind === 'all') {
      this.props.onGroupingChange?.(state.grouping)
    }
    this.props.onQueryChange?.(state.query)
    if (kind === 'sort' || kind === 'filter' || kind === 'search' || kind === 'grouping' || kind === 'all') {
      this._scheduleStatePersistence()
    }
  }

  /**
   * Нормализует и возвращает итоговое значение DataTableRootNode.
   */
  private _resolveSourceQuery(): DataTableQueryState | undefined {
    return this._viewPipeline.isServerControlled() ? undefined : this._viewPipeline.getQuery()
  }

  /**
   * Возвращает query для авторитетной server-side модели.
   */
  private _resolveServerSourceQuery(): DataTableQueryState {
    return this._viewPipeline.getQuery()
  }

  /**
   * Возвращает true, когда lazy/server source должен быть авторитетным view.
   */
  private _isServerRowModelActive(): boolean {
    const options = this.props.view.serverRowModel
    if (!options || !options.enabled) {
      return false
    }
    if (options.authoritative) {
      return true
    }
    const state = this._viewPipeline.getState()
    return this.store.rowCount > this.props.performance.maxClientRows
      || state.mode.sorting === 'server'
      || state.mode.filtering === 'server'
      || state.mode.search === 'server'
      || state.mode.grouping === 'server'
  }

  /**
   * Синхронизирует server-side query, summary и SSE subscription.
   */
  private _syncServerRowModel(): void {
    const options = this.props.view.serverRowModel
    if (!options || !options.enabled || !this._isServerRowModelActive()) {
      this._serverRowModel.dispose()
      return
    }

    const query = this._resolveServerSourceQuery()
    const changed = this._serverRowModel.sync(query, { subscribe: options.subscribe })
    if (changed) {
      this.props.onServerQueryChange?.(query)
    }
    if (options.loadSummary && (changed || this._summaryState.source !== 'server')) {
      this._requestServerSummary()
    }
  }

  /**
   * Запрашивает summary у server-side source с защитой от устаревших ответов.
   */
  private _requestServerSummary(): void {
    const requestId = ++this._serverSummaryRequestId
    this._summaryState = {
      values: { ...this._summaryState.values },
      rowCount: this.store.rowCount,
      revision: requestId,
      source: 'server',
      loading: true,
    }
    this.props.onSummaryChange?.({ ...this._summaryState, values: { ...this._summaryState.values } })

    void this._serverRowModel.loadSummary().then((summary) => {
      if (!summary || requestId !== this._serverSummaryRequestId) {
        return
      }
      this._summaryState = summary
      this.props.onSummaryChange?.({ ...summary, values: { ...summary.values } })
      this._refresh(['summary'])
    })
  }

  /**
   * Синхронизирует summary для server и client режимов без участия render pass.
   */
  private _syncSummaryState(): void {
    if (this._isServerRowModelActive()) {
      if (this.props.view.serverRowModel && this.props.view.serverRowModel.loadSummary) {
        return
      }
      const revision = this.store.takeRevision()
      if (this._summaryState.source === 'server'
        && !this._summaryState.loading
        && this._summaryState.revision === revision
        && this._summaryState.rowCount === this.store.rowCount) {
        return
      }
      this._summaryState = {
        values: { rowCount: this.store.rowCount },
        rowCount: this.store.rowCount,
        revision,
        source: 'server',
        loading: false,
      }
      this.props.onSummaryChange?.({ ...this._summaryState, values: { ...this._summaryState.values } })
      return
    }

    if (this._shouldUseSparseClientSummary()) {
      this._syncSparseClientSummaryState()
      return
    }

    const revision = this.store.takeRevision()
    if (this._summaryState.source === 'client'
      && !this._summaryState.loading
      && this._summaryState.revision === revision
      && this._summaryState.rowCount === this._viewPipeline.rowCount) {
      return
    }

    const rows = this._viewPipeline.getViewRows()
      .filter((row): row is Extract<DataTableViewRow<Row>, { kind: 'data' }> => row.kind === 'data' && !!row.row)
      .map(row => row.row as Row)
    const result = this._summaryEngine.compute(rows, this._resolveSummaryRules(rows))
    this._summaryState = {
      values: { ...result.values, rowCount: result.rowCount },
      rowCount: result.rowCount,
      revision,
      source: 'client',
      loading: false,
    }
    this.props.onSummaryChange?.({ ...this._summaryState, values: { ...this._summaryState.values } })
  }

  /**
   * Проверяет, можно ли считать client summary без materialized прохода по строкам.
   */
  private _shouldUseSparseClientSummary(): boolean {
    return this.store.rowCount >= this.props.performance.maxClientRows
      || this.store.loadedRowCount < this.store.rowCount
  }

  /**
   * Для lazy/large таблиц summary не должен сканировать viewRows на scroll.
   */
  private _syncSparseClientSummaryState(): void {
    const revision = this.store.takeStructureRevision()
    if (this._summaryState.source === 'client'
      && !this._summaryState.loading
      && this._summaryState.revision === revision
      && this._summaryState.rowCount === this.store.rowCount) {
      return
    }
    this._summaryState = {
      values: {
        rowCount: this.store.rowCount,
        loadedRowCount: this.store.loadedRowCount,
      },
      rowCount: this.store.rowCount,
      revision,
      source: 'client',
      loading: false,
    }
    this.props.onSummaryChange?.({ ...this._summaryState, values: { ...this._summaryState.values } })
  }

  /**
   * Подбирает компактный набор summary-правил для client-mode runtime.
   */
  private _resolveSummaryRules(rows: Array<Row>): Array<DataTableSummaryRule<Row>> {
    const rules: Array<DataTableSummaryRule<Row>> = [{ id: 'rowCount', aggregate: 'count' }]
    const sample = rows.slice(0, 50)
    for (const column of this._resolvedColumns) {
      if (rules.length >= 10) {
        break
      }
      const candidate = column.field ?? column.id
      const numeric = column.type === 'number'
        || sample.some(row => Number.isFinite(Number(row[candidate as keyof Row])))
      if (!numeric) {
        continue
      }
      rules.push({
        id: `${column.id}:sum`,
        field: candidate,
        aggregate: 'sum',
      })
    }
    return rules
  }

  /**
   * Делегирует поиск server-side source, когда локальный pipeline не должен сканировать строки.
   */
  private _requestServerSearchIfNeeded(activeIndex = this._viewPipeline.getSearchState().activeIndex): void {
    this._requestServerSearchPage({ mode: 'replace', activeIndex })
  }

  /**
   * Запрашивает страницу server-side поиска и обновляет navigation state.
   */
  private _requestServerSearchPage(options: { mode: 'replace' | 'append' | 'prepend', activeIndex?: number }): void {
    const search = this._viewPipeline.getSearchState().query
    if (!search.text || !this._isServerRowModelActive()) {
      return
    }
    if (this._serverSearchInFlight) {
      return
    }

    this._syncServerRowModel()
    const requestId = ++this._serverSearchRequestId
    this._serverSearchInFlight = true
    this._viewPipeline.setServerSearchLoading(true)
    this.props.onSearchChange?.(this._viewPipeline.getSearchState())
    const direction: DataTableSearchDirection = options.mode === 'prepend' ? 'previous' : 'next'
    const cursor = options.mode === 'prepend' ? this._serverSearchPreviousCursor : this._serverSearchCursor
    void this._serverRowModel.search(search, cursor, direction).then((result) => {
      if (!result || requestId !== this._serverSearchRequestId) {
        return
      }
      this._serverSearchCursor = result.cursor
      this._serverSearchPreviousCursor = result.previousCursor
      this._serverSearchHasMore = result.hasMore ?? !!result.cursor
      if (options.mode === 'append') {
        this._viewPipeline.appendServerSearchResult(result, options.activeIndex)
      }
      else if (options.mode === 'prepend') {
        this._viewPipeline.prependServerSearchResult(result, options.activeIndex)
      }
      else {
        this._viewPipeline.setServerSearchResult(result, Math.max(0, options.activeIndex ?? 0))
      }
      const match = this._viewPipeline.getSearchState().activeMatch
      if (match) {
        this._scrollToSearchMatch(match)
      }
      this.props.onSearchChange?.(this._viewPipeline.getSearchState())
      this._refresh(['data', 'interaction'])
    }).finally(() => {
      if (requestId === this._serverSearchRequestId) {
        this._serverSearchInFlight = false
        this._viewPipeline.setServerSearchLoading(false)
        this.props.onSearchChange?.(this._viewPipeline.getSearchState())
      }
    })
  }

  /**
   * Синхронизирует актуальное состояние DataTableRootNode.
   */
  private _refresh(kinds: Array<string> = ['data', 'layout', 'viewport']): void {
    this.invalidation.bumpMany(kinds)
    this._invalidateCellTemplateFragmentCacheForRefresh(kinds)
    const requiresRuntimeSync = this._refreshRequiresRuntimeSync(kinds)
    if (requiresRuntimeSync) {
      this._resolvedColumns = this._resolveColumns()
      this._syncViewPipeline()
      this._viewport = this._createViewport()
      this._syncEditingRect()
    }
    this._markRenderLayersDirtyForRefresh(kinds)
    if (!requiresRuntimeSync && this._canRefreshRetainedHoverOverlay(kinds)) {
      this._updateHoverOverlayBatch()
      this.dirtyRetainedRender()
      this.nova.invalidate()
      return
    }
    this.dirty({ update: requiresRuntimeSync, render: true })
    this.nova.invalidate()
  }

  /**
   * Определяет набор dirty-слоев из изменившихся props.
   */
  private _resolveRefreshKindsForProps(changedKeys: Array<keyof DataTableRootResolvedProps<Row>>): Array<string> {
    if (changedKeys.length > 0 && changedKeys.every(key => key === 'hoverAlpha')) {
      return ['hover']
    }
    if (changedKeys.length > 0 && changedKeys.every(key => key === 'selectionAlpha')) {
      return ['selection']
    }
    if (changedKeys.length > 0 && changedKeys.every(key => key === 'tooltipAlpha')) {
      return ['tooltip']
    }
    if (changedKeys.length > 0 && changedKeys.every(key => key === 'hoverAlpha' || key === 'selectionAlpha' || key === 'tooltipAlpha')) {
      return ['interaction']
    }
    return ['layout', 'data']
  }

  /**
   * Проверяет, можно ли обновить hover через retained batch без render-frame rebuild.
   */
  private _canRefreshRetainedHoverOverlay(kinds: Array<string>): boolean {
    return kinds.length > 0
      && kinds.every(kind => kind === 'hover')
      && !this.props.interactionLayerTemplate
      && !this._columnDragState?.active
      && this._columnDragLayoutMotion.size === 0
  }

  /**
   * Проверяет, нужен ли runtime-sync для текущего refresh.
   */
  private _refreshRequiresRuntimeSync(kinds: Array<string>): boolean {
    if (kinds.length === 0) {
      return true
    }
    if (this._columnDragState?.active || this._columnDragLayoutMotion.size > 0) {
      return true
    }
    if (kinds.every(kind => kind === 'viewport-scroll-x' || kind === 'viewport-scroll-y' || kind === 'scrollbar')) {
      return false
    }
    return kinds.some(kind => !['interaction', 'hover', 'selection', 'tooltip', 'scrollbar'].includes(kind))
  }

  /**
   * Помечает render layers грязными по типам invalidation.
   */
  private _markRenderLayersDirtyForRefresh(kinds: Array<string>): void {
    if (kinds.length === 0 || kinds.some(kind => ['data', 'layout', 'columns', 'viewport', 'view', 'zoom', 'custom'].includes(kind))) {
      this._markRenderLayersDirty(DATA_TABLE_RENDER_LAYER_IDS)
      return
    }

    if (kinds.some(kind => kind === 'viewport-scroll-x' || kind === 'viewport-scroll-y')) {
      this._markViewportScrollLayersDirty(kinds)
      return
    }

    if (kinds.includes('summary')) {
      this._markRenderLayersDirty(['group-summary', 'search', 'selection', 'interaction'])
    }

    if (kinds.some(kind => ['interaction', 'hover', 'selection', 'tooltip', 'scrollbar'].includes(kind))) {
      if (this._columnDragState?.active || this._columnDragLayoutMotion.size > 0) {
        this._markRenderLayersDirty(DATA_TABLE_RENDER_LAYER_IDS)
        return
      }
      this._markRenderLayersDirty(DATA_TABLE_OVERLAY_RENDER_LAYERS)
    }
  }

  /**
   * Сбрасывает cache пользовательских cell fragments только для изменений, которые
   * реально меняют данные, view или геометрию. Pixel-scroll оставляет cache живым.
   */
  private _invalidateCellTemplateFragmentCacheForRefresh(kinds: Array<string>): void {
    if (kinds.length === 0 || kinds.some(kind => [
      'data',
      'layout',
      'columns',
      'view',
      'zoom',
      'custom',
    ].includes(kind))) {
      this._cellTemplateFragmentCache.clear()
      this._rowBandBackgroundCache.clear()
    }
  }

  /**
   * Помечает только слои, которые реально зависят от pixel scroll по соответствующей оси.
   */
  private _markViewportScrollLayersDirty(kinds: Array<string>): void {
    const layers = new Set<DataTableRenderLayerId>([
      'body-static',
      'body-animated',
      'search',
      'selection',
      'interaction',
      'drag-menu-tooltip',
      'scrollbars',
    ])
    if (kinds.includes('viewport-scroll-x')) {
      layers.add('header')
      layers.add('pinned')
      layers.add('group-summary')
    }
    this._markRenderLayersDirty([...layers])
  }

  /**
   * Помечает конкретные render layers грязными.
   */
  private _markRenderLayersDirty(layers: Array<DataTableRenderLayerId>): void {
    for (const id of layers) {
      const layer = this._renderLayers.get(id)
      if (layer) {
        layer.dirty = true
      }
    }
  }

  /**
   * Проверяет, будет ли пересобираться индекс выделяемого текста.
   */
  private _shouldRebuildTextSelectionTargets(): boolean {
    if (!this.props.textSelection || !this.props.textSelection.enabled) {
      return false
    }
    return DATA_TABLE_TEXT_SELECTION_SOURCE_LAYERS.some((id) => {
      const layer = this._renderLayers.get(id)
      return !layer || layer.dirty || !layer.initialized
    })
  }

  /**
   * Проверяет, будут ли пересобраны указанные render layers.
   */
  private _willRebuildLayers(layers: Array<DataTableRenderLayerId>): boolean {
    return layers.some((id) => {
      const layer = this._renderLayers.get(id)
      return !layer || layer.dirty || !layer.initialized
    })
  }

  /**
   * Выполняет внутренний шаг suppressTextSelectionIndexFor для DataTableRootNode.
   */
  private _suppressTextSelectionIndexFor(reason: 'scroll' | 'zoom'): void {
    const text = this.props.performance.text
    if (!text || !text.disableTextSelectionIndexOnScroll || this._textSelectionActive) {
      return
    }

    const duration = reason === 'zoom'
      ? Math.max(text.refineAfterZoomMs, 120)
      : Math.max(text.refineAfterScrollMs, 80)
    this._suppressTextSelectionIndexUntil = Math.max(this._suppressTextSelectionIndexUntil, performance.now() + duration)
  }

  /**
   * Выполняет внутренний шаг requestTextRefinement для DataTableRootNode.
   */
  private _requestTextRefinement(reason: 'scroll' | 'zoom'): void {
    const text = this.props.performance.text
    if (!text || text.raster !== 'deferred') {
      return
    }

    const duration = reason === 'zoom' ? text.refineAfterZoomMs : text.refineAfterScrollMs
    if (duration <= 0) {
      return
    }

    this._textRefinementUntil = Math.max(this._textRefinementUntil, performance.now() + duration)
    this.nova.invalidate()
  }

  /**
   * Выполняет внутренний шаг continueTextRefinementIfNeeded для DataTableRootNode.
   */
  private _continueTextRefinementIfNeeded(): void {
    if (performance.now() >= this._textRefinementUntil) {
      return
    }
    this.nova.invalidate()
  }

  /**
   * Нормализует и возвращает итоговое значение DataTableRootNode.
   */
  private _resolveColumns(): Array<DataTableResolvedColumn<Row>> {
    const columns = resolveDataTableColumns(
      this._viewPipeline.orderColumns(this._getColumnStateInputColumns()),
      this._resolveEffectivePinnedColumns(),
      this._createEffectiveWidthOverrides(),
      this.store,
    )
    const scale = this._zoomColumnScale
    const resolved = scale === 1
      ? columns
      : columns.map(column => ({
          ...column,
          minWidth: Math.max(24, Math.round(column.minWidth * scale)),
          maxWidth: Math.max(24, Math.round(column.maxWidth * scale)),
          resolvedWidth: Math.max(24, Math.round(column.resolvedWidth * scale)),
        }))

    this._columnIndexById.clear()
    resolved.forEach((column, index) => this._columnIndexById.set(column.id, index))
    return resolved
  }

  /**
   * Возвращает columns input с примененными hidden/pinned state override.
   */
  private _getColumnStateInputColumns(state: DataTableColumnState = this._resolveMergedColumnState()): Array<DataTableColumnInput<Row>> {
    const hidden = new Set(state.hidden ?? [])
    const pinned = this._resolvePinnedSideByColumn(state)
    const columns = this.props.columns
      .filter(column => !hidden.has(column.id))
      .map((column) => {
        const side = pinned.get(column.id)
        return side ? { ...column, pinned: side } : column
      })
    return this._orderColumnInputsByState(columns, state.order ?? [])
  }

  /**
   * Возвращает pinnedColumns с учетом columnState.
   */
  private _resolveEffectivePinnedColumns(): DataTableRootResolvedProps<Row>['pinnedColumns'] {
    const state = this._resolveMergedColumnState()
    if (state.pinned.left.length > 0 || state.pinned.right.length > 0) {
      return {
        left: [...state.pinned.left],
        right: [...state.pinned.right],
      }
    }
    return this.props.pinnedColumns
  }

  /**
   * Возвращает pinnedRows с учетом группировочной политики.
   */
  private _resolveEffectivePinnedRows(): DataTableRootResolvedProps<Row>['pinnedRows'] {
    const grouping = this.props.view.grouping
    const pinnedPolicy = this.props.view.groupingPinnedRows
    if (grouping && grouping.enabled && pinnedPolicy && pinnedPolicy.global === 'hide') {
      return { top: [], bottom: [] }
    }
    return this.props.pinnedRows
  }

  /**
   * Собирает width overrides из props columnState и runtime resize map.
   */
  private _createEffectiveWidthOverrides(): Map<string, number> {
    const widths = new Map<string, number>()
    const state = this._resolveMergedColumnState()
    for (const [columnId, width] of Object.entries(state.widths)) {
      widths.set(columnId, width)
    }
    for (const [columnId, width] of this._widthOverrides) {
      widths.set(columnId, width)
    }
    return widths
  }

  /**
   * Объединяет controlled props и локальное runtime состояние колонок.
   */
  private _resolveMergedColumnState(): DataTableResolvedColumnState {
    const base = this.props.columnState
    const override = this._columnStateOverride
    return {
      widths: {
        ...base.widths,
        ...(override?.widths ?? {}),
      },
      order: override?.order ? [...override.order] : [...base.order],
      hidden: override?.hidden ? [...override.hidden] : [...base.hidden],
      pinned: {
        left: override?.pinned?.left ? [...override.pinned.left] : [...base.pinned.left],
        right: override?.pinned?.right ? [...override.pinned.right] : [...base.pinned.right],
      },
      groups: override?.groups ? [...override.groups] : [...base.groups],
      autosizeMode: override?.autosizeMode ?? base.autosizeMode,
      version: override?.version ?? base.version,
    }
  }

  /**
   * Приводит resolved column state к публичному input state.
   */
  private _toColumnStateInput(state: DataTableResolvedColumnState): DataTableColumnState {
    return {
      widths: { ...state.widths },
      order: [...state.order],
      hidden: [...state.hidden],
      pinned: {
        left: [...state.pinned.left],
        right: [...state.pinned.right],
      },
      groups: [...state.groups],
      autosizeMode: state.autosizeMode,
      version: state.version,
    }
  }

  /**
   * Возвращает публичный порядок колонок, сохраняя hidden columns в columnState.
   */
  private _resolveColumnStateOrder(
    runtimeOrder: Array<string>,
    merged: DataTableResolvedColumnState,
  ): Array<string> {
    const allColumnIds = this.props.columns.map(column => column.id)
    const baseline = merged.order.length > 0
      ? this._mergeColumnOrderWithAllColumns(merged.order, allColumnIds)
      : allColumnIds
    if (runtimeOrder.length === 0) {
      return baseline
    }
    return this._mergeColumnOrderWithAllColumns(runtimeOrder, baseline)
  }

  /**
   * Дополняет order отсутствующими колонками без потери исходного порядка.
   */
  private _mergeColumnOrderWithAllColumns(order: Array<string>, allColumnIds: Array<string>): Array<string> {
    const columnSet = new Set(allColumnIds)
    const seen = new Set<string>()
    const result: Array<string> = []
    for (const columnId of order) {
      if (!columnSet.has(columnId) || seen.has(columnId)) {
        continue
      }
      seen.add(columnId)
      result.push(columnId)
    }
    for (const columnId of allColumnIds) {
      if (seen.has(columnId)) {
        continue
      }
      seen.add(columnId)
      result.push(columnId)
    }
    return result
  }

  /**
   * Публикует изменение columnState.
   */
  private _emitColumnStateChange(): void {
    this.props.onColumnStateChange?.(this._getColumnState())
    this._scheduleStatePersistence()
  }

  /**
   * Собирает быстрый lookup side для pinned columns.
   */
  private _resolvePinnedSideByColumn(state: DataTableColumnState): Map<string, DataTableResolvedColumn<Row>['pinned']> {
    const result = new Map<string, DataTableResolvedColumn<Row>['pinned']>()
    for (const id of state.pinned?.left ?? []) {
      result.set(id, 'left')
    }
    for (const id of state.pinned?.right ?? []) {
      result.set(id, 'right')
    }
    return result
  }

  /**
   * Стабильно сортирует column inputs по сохраненному order.
   */
  private _orderColumnInputsByState(
    columns: Array<DataTableColumnInput<Row>>,
    order: Array<string>,
  ): Array<DataTableColumnInput<Row>> {
    if (order.length === 0) {
      return columns
    }
    const rank = new Map(order.map((id, index) => [id, index]))
    return [...columns].sort((left, right) => {
      const leftRank = rank.get(left.id) ?? Number.MAX_SAFE_INTEGER
      const rightRank = rank.get(right.id) ?? Number.MAX_SAFE_INTEGER
      if (leftRank !== rightRank) {
        return leftRank - rightRank
      }
      return columns.indexOf(left) - columns.indexOf(right)
    })
  }

  /**
   * Синхронизирует состояние между слоями DataTableRootNode.
   */
  private _syncViewPipeline(): void {
    this._viewPipeline.sync({
      columns: this._resolvedColumns,
      view: this.props.view,
      performance: this.props.performance,
    })
  }

  /**
   * Создает runtime-сущность DataTableRootNode.
   */
  private _createViewport(): DataTableViewport {
    const pinnedRows = this._resolveEffectivePinnedRows()
    return createDataTableViewport({
      width: this.width || this.props.width,
      height: this.height || this.props.height,
      rowHeight: this.rowHeight,
      headerHeight: this.headerHeight,
      overscanRows: this._resolveEffectiveOverscanRows(),
      overscanColumns: this._resolveEffectiveOverscanColumns(),
      rowCount: this._viewPipeline.rowCount,
      columns: this._resolvedColumns,
      pinnedTopCount: pinnedRows.top?.length ?? 0,
      pinnedBottomCount: pinnedRows.bottom?.length ?? 0,
      scrollX: this.scrollX,
      scrollY: this.scrollY,
    })
  }

  /**
   * Возвращает overscan строк с учетом активной scroll/pan LOD-фазы.
   */
  private _resolveEffectiveOverscanRows(): number {
    if (!this._isScrollLodActive()) {
      return this.props.overscanRows
    }
    return Math.min(this.props.overscanRows, 2)
  }

  /**
   * Возвращает overscan колонок с учетом активной scroll/pan LOD-фазы.
   */
  private _resolveEffectiveOverscanColumns(): number {
    if (!this._isScrollLodActive()) {
      return this.props.overscanColumns
    }
    return Math.min(this.props.overscanColumns, 1)
  }

  /**
   * Обновляет значение состояния DataTableRootNode.
   */
  private _setupEvents(): void {
    this.on('wheel', (event) => {
      this._trackTooltipModifiers(event)
      this._lastPointerPosition = this._toLocalPointerPosition(event)
      if (this._handleZoomWheel(event)) {
        event.preventDefault()
        event.cancelBubble = true
        return
      }
      const baseX = this._pendingWheelScroll?.x ?? this.scrollX
      const baseY = this._pendingWheelScroll?.y ?? this.scrollY
      const nextX = baseX + event.deltaX + (event.shiftKey ? event.deltaY : 0)
      const nextY = baseY + (event.shiftKey ? 0 : event.deltaY)
      this._scheduleWheelScroll(nextX, nextY)
      event.preventDefault()
      event.cancelBubble = true
    })

    this.on('mousemove', (event) => {
      this._trackTooltipModifiers(event)
      const [x, y] = this._trackPointerPosition(event)
      if (this._resizeState) {
        this._syncNativeCursor(x, y)
        return
      }
      this._pointerInside = true
      this._revealScrollbars('hover')
      this._updateHoveredScrollbarAxis(x, y)
      this._syncNativeCursor(x, y)
      const nextHover = this._resolveInteractionTargetAt(x, y)
      this._updateHover(nextHover)
    })

    this.on('mouseleave', () => {
      this._lastPointerPosition = null
      this._pointerInside = false
      this._hoveredScrollbarAxis = null
      this._scheduleScrollbarHide('hover')
      this._clearHover()
      this._scheduleTooltipClose()
      this.nova.cursor('default')
    })

    this.on('mousedown', (event) => {
      this._trackTooltipModifiers(event)
      this._keyboardFocusActive = true
      const [x, y] = this._trackPointerPosition(event)
      const scrollbarAxis = this._hitScrollbar(x, y)
      if (scrollbarAxis) {
        this._startScrollbarDrag(scrollbarAxis, event)
        event.cancelBubble = true
        return
      }

      const resizeColumn = this._hitResizeHandle(x, y)
      if (resizeColumn) {
        this.nova.cursor('col-resize')
        this._resizeState = {
          column: resizeColumn.column,
          startX: x,
          startWidth: resizeColumn.column.resolvedWidth,
        }
        this.capturePointer(event)
        event.cancelBubble = true
        return
      }

      if (this._handleColumnMenuPointerDown(x, y, event)) {
        event.cancelBubble = true
        return
      }

      const target = this._resolveInteractionTargetAt(x, y)
      if (target) {
        if (target.zone === 'header') {
          if (this._resolveColumnMenuHeaderTarget(target, x, y)) {
            this._openColumnMenu(target)
            event.cancelBubble = true
            return
          }
          const filterTarget = this._resolveFilterUiTarget(target, x, y, event)
          if (filterTarget && this._handleFilterUiAction(filterTarget)) {
            event.cancelBubble = true
            return
          }
          if (this._filterRowHeight > 0 && y >= this.headerHeight - this._filterRowHeight) {
            event.cancelBubble = true
            return
          }
          if (this._startColumnDrag(target, event)) {
            event.cancelBubble = true
            return
          }
          if (this._tryHeaderSelection(target, event)) {
            event.cancelBubble = true
            return
          }
          this._handleHeaderAction(target, event)
          event.cancelBubble = true
          return
        }
        if (target.zone === 'group' && typeof target.rowId === 'string') {
          this._toggleGroup(target.rowId)
          event.cancelBubble = true
          return
        }
        const tableSelectionEnabled = this.props.selection !== false && this.props.selection.enabled
        if ((!tableSelectionEnabled || event.altKey) && this._startTextSelectionAt(x, y, event)) {
          event.cancelBubble = true
          return
        }
        if (tableSelectionEnabled) {
          this._updateSelection(target, event)
          this._startSelectionDrag(target, event)
        }
        const context = this._createCellContext(target)
        if (context) {
          this.props.onCellClick?.(context)
        }
      }
      event.cancelBubble = true
    })

    this.on('click', (event) => {
      if (!this.props.view.columnOrdering || !this.props.view.columnOrdering.enabled) {
        return
      }
      this._trackTooltipModifiers(event)
      const [x, y] = this._trackPointerPosition(event)
      const target = this._resolveInteractionTargetAt(x, y)
      if (!target || target.zone !== 'header') {
        return
      }

      if (this._suppressNextHeaderClick) {
        this._suppressNextHeaderClick = false
        event.cancelBubble = true
        return
      }

      if (!this._columnDragState) {
        return
      }
      this._columnDragState = null
      this.releasePointerCapture(event)
      this._handleHeaderAction(target, event)
      event.cancelBubble = true
    })

    this.on('mouseup', (event) => {
      if (!this._textSelectionActive) {
        return
      }
      this._textSelectionActive = false
      this._textSelection.end()
      this.releasePointerCapture(event)
      this._refresh(['interaction'])
      event.cancelBubble = true
    })

    this.on('dblclick', (event) => {
      this._trackTooltipModifiers(event)
      const [x, y] = this._trackPointerPosition(event)
      if (this._hitScrollbar(x, y) || this._hitResizeHandle(x, y)) {
        return
      }
      const target = this._resolveInteractionTargetAt(x, y)
      if (target && this._startEditFromTarget(target, 'doubleClick')) {
        event.cancelBubble = true
      }
    })

    this.on('dragmove', (event, _dx, _dy, meta) => {
      if (this._scrollbarDragState) {
        this._updateScrollbarDrag(meta.totalDx, meta.totalDy)
        event.cancelBubble = true
        return
      }
      if (this._columnDragState) {
        this._updateColumnDrag(meta)
        event.cancelBubble = true
        return
      }
      if (this._selectionDragState) {
        this._updateSelectionDrag(meta)
        event.cancelBubble = true
        return
      }
      if (this._textSelectionActive) {
        this._updateTextSelectionAt(meta.x, meta.y)
        event.cancelBubble = true
        return
      }
      if (!this._resizeState) {
        return
      }
      const nextWidth = this._resizeState.startWidth + meta.totalDx
      const [x, y] = this.toLocal(meta.x, meta.y)
      this._lastPointerPosition = { x, y }
      this._syncNativeCursor(x, y)
      this.applyColumnWidth(this._resizeState.column.id, nextWidth)
      event.cancelBubble = true
    })

    this.on('dragend', (event, meta) => {
      if (this._scrollbarDragState) {
        this._updateScrollbarDrag(meta.totalDx, meta.totalDy)
        this._scrollbarDragState = null
        this.releasePointerCapture(event)
        this._scheduleScrollbarHide('scroll')
        event.cancelBubble = true
        return
      }
      if (this._columnDragState) {
        this._commitColumnDrag(meta)
        this.releasePointerCapture(event)
        event.cancelBubble = true
        return
      }
      if (this._selectionDragState) {
        this._commitSelectionDrag()
        this.releasePointerCapture(event)
        event.cancelBubble = true
        return
      }
      if (this._textSelectionActive) {
        this._textSelectionActive = false
        this._textSelection.end()
        this.releasePointerCapture(event)
        this._refresh(['interaction'])
        event.cancelBubble = true
        return
      }
      if (!this._resizeState) {
        return
      }
      this._resizeState = null
      this._syncHoverAfterViewportChange()
      this._syncNativeCursorFromLastPosition()
      this.releasePointerCapture(event)
      event.cancelBubble = true
    })
  }

  /**
   * Подключает keyboard navigation, пока таблица имеет runtime focus.
   */
  private _setupKeyboardNavigationEvents(): void {
    if (typeof window === 'undefined') {
      return
    }
    window.addEventListener('keydown', this._handleKeyboardNavigationKeydown)
    window.addEventListener('pointerdown', this._handleKeyboardNavigationPointerDown, true)
  }

  /**
   * Отключает keyboard navigation.
   */
  private _teardownKeyboardNavigationEvents(): void {
    if (typeof window === 'undefined') {
      return
    }
    window.removeEventListener('keydown', this._handleKeyboardNavigationKeydown)
    window.removeEventListener('pointerdown', this._handleKeyboardNavigationPointerDown, true)
  }

  /**
   * Сбрасывает keyboard focus, когда пользователь уходит за пределы canvas.
   */
  private _handleKeyboardNavigationPointerDownEvent(event: PointerEvent): void {
    const target = event.target
    if (target instanceof Node && this.canvas.element.contains(target)) {
      return
    }
    this._keyboardFocusActive = false
  }

  /**
   * Обрабатывает клавиатурную навигацию active cell.
   */
  private _handleKeyboardNavigationKeydownEvent(event: KeyboardEvent): void {
    const options = this.props.keyboardNavigation
    if (!options || !options.enabled || !this._keyboardFocusActive) {
      return
    }
    if (isEditableKeyboardTarget(event.target)) {
      return
    }

    if (this._editingState) {
      if (event.key === 'Escape' && this.props.editing !== false && this.props.editing.cancelOnEscape) {
        this._cancelEdit()
        this._emitKeyboardAction({ type: 'cancel', key: event.key })
        event.preventDefault()
      }
      else if (event.key === 'Enter' && this.props.editing !== false && this.props.editing.commitOnEnter) {
        void this._commitEdit()
        this._emitKeyboardAction({ type: 'commit', key: event.key })
        event.preventDefault()
      }
      else if (event.key === 'Tab' && options.tab === 'commit-edit') {
        void this._commitEdit()
        this._emitKeyboardAction({ type: 'commit', key: event.key })
        event.preventDefault()
      }
      return
    }

    if (options.ctrlMetaShortcuts && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
      if (this._selectAllByKeyboard()) {
        this._emitKeyboardAction({ type: 'select-all', key: event.key })
        event.preventDefault()
      }
      return
    }

    const extend = !!event.shiftKey && options.shiftSelection
    const direction = this._resolveKeyboardDirection(event, options)
    if (direction) {
      if (this._moveActiveCell(direction, { extend })) {
        this._emitKeyboardAction({ type: 'move', key: event.key, direction })
        event.preventDefault()
      }
      return
    }

    if (event.key === 'F2' || (event.key === 'Enter' && options.enter === 'edit')) {
      const active = this._selection?.activeCell
      if (active && this._startEdit(active.rowId, active.columnId)) {
        this._emitKeyboardAction({ type: 'edit', key: event.key })
        event.preventDefault()
      }
      return
    }

    if (event.key === 'Enter' && options.enter === 'move') {
      if (this._moveActiveCell('down', { extend: false })) {
        this._emitKeyboardAction({ type: 'move', key: event.key, direction: 'down' })
        event.preventDefault()
      }
      return
    }

    if (event.key === 'Escape' && this._selection?.previewRange) {
      this._commitSelectionState({ ...this._selection, previewRange: null }, { emitActive: false })
      this._emitKeyboardAction({ type: 'cancel', key: event.key })
      event.preventDefault()
    }
  }

  /**
   * Возвращает направление keyboard navigation для события.
   */
  private _resolveKeyboardDirection(
    event: KeyboardEvent,
    options: Exclude<DataTableRootResolvedProps<Row>['keyboardNavigation'], false>,
  ): DataTableActiveCellDirection | null {
    if (options.arrows) {
      if (event.key === 'ArrowUp') {
        return 'up'
      }
      if (event.key === 'ArrowDown') {
        return 'down'
      }
      if (event.key === 'ArrowLeft') {
        return 'left'
      }
      if (event.key === 'ArrowRight') {
        return 'right'
      }
    }
    if (options.tab === 'move' && event.key === 'Tab') {
      return event.shiftKey ? 'left' : 'right'
    }
    if (options.pageKeys) {
      if (event.key === 'PageUp') {
        return 'page-up'
      }
      if (event.key === 'PageDown') {
        return 'page-down'
      }
    }
    if (options.homeEnd) {
      if (event.key === 'Home') {
        return 'home'
      }
      if (event.key === 'End') {
        return 'end'
      }
    }
    return null
  }

  /**
   * Публикует keyboard action callback.
   */
  private _emitKeyboardAction(action: DataTableKeyboardAction): void {
    this.props.onKeyboardAction?.(action)
  }

  /**
   * Обрабатывает runtime-событие DataTableRootNode.
   */
  private _handleZoomWheel(event: WheelEvent): boolean {
    const zoom = this.props.zoom
    if (!zoom || !zoom.wheel || !zoom.wheel.enabled) {
      return false
    }
    const pinchWheel = this._isTrackpadPinchWheel(event, zoom.wheel)
    const modifier = zoom.wheel.modifier
    if (!pinchWheel && modifier && !this._isWheelModifierActive(event, modifier)) {
      return false
    }

    const nextValue = pinchWheel
      ? zoom.value * Math.exp(-event.deltaY * zoom.wheel.step * 0.04)
      : zoom.value + (event.deltaY > 0 ? -1 : 1) * zoom.wheel.step
    this._applyZoomValue(nextValue)
    return true
  }

  /**
   * Выполняет внутренний шаг isTrackpadPinchWheel для DataTableRootNode.
   */
  private _isTrackpadPinchWheel(event: WheelEvent, options: DataTableResolvedZoomWheelOptions): boolean {
    return options.pinch && event.ctrlKey && Number.isFinite(event.deltaY) && event.deltaY !== 0
  }

  /**
   * Обновляет значение состояния DataTableRootNode.
   */
  private _setupTrackpadGestureEvents(): void {
    const element = this.canvas.element
    element.removeEventListener('wheel', this._handleTrackpadWheelCapture, true)
    element.addEventListener('wheel', this._handleTrackpadWheelCapture, { passive: false, capture: true })
    this._removeWindowGestureEvents()
    this._addWindowGestureEvents()
  }

  /**
   * Выполняет внутренний шаг teardownTrackpadGestureEvents для DataTableRootNode.
   */
  private _teardownTrackpadGestureEvents(): void {
    const element = this.canvas.element
    element.removeEventListener('wheel', this._handleTrackpadWheelCapture, true)
    this._removeWindowGestureEvents()
    this._gestureActive = false
  }

  /**
   * Выполняет внутренний шаг addWindowGestureEvents для DataTableRootNode.
   */
  private _addWindowGestureEvents(): void {
    if (typeof window === 'undefined') {
      return
    }
    window.addEventListener('gesturestart', this._handleGestureStart, { passive: false, capture: true })
    window.addEventListener('gesturechange', this._handleGestureChange, { passive: false, capture: true })
    window.addEventListener('gestureend', this._handleGestureEnd, true)
  }

  /**
   * Удаляет сущность из runtime-коллекции DataTableRootNode.
   */
  private _removeWindowGestureEvents(): void {
    if (typeof window === 'undefined') {
      return
    }
    window.removeEventListener('gesturestart', this._handleGestureStart, true)
    window.removeEventListener('gesturechange', this._handleGestureChange, true)
    window.removeEventListener('gestureend', this._handleGestureEnd, true)
  }

  /**
   * Обрабатывает runtime-событие DataTableRootNode.
   */
  private _handleTrackpadWheelCaptureEvent(event: WheelEvent): void {
    const zoom = this.props.zoom
    if (!zoom || !zoom.wheel || !zoom.wheel.enabled || !this._isTrackpadPinchWheel(event, zoom.wheel)) {
      return
    }
    if (!this._trackGesturePointerPosition(event)) {
      return
    }
    const nextValue = zoom.value * Math.exp(-event.deltaY * zoom.wheel.step * 0.04)
    this._applyZoomValue(nextValue)
    event.preventDefault()
    event.stopPropagation()
    event.cancelBubble = true
  }

  /**
   * Обрабатывает runtime-событие DataTableRootNode.
   */
  private _handleTrackpadGestureStart(event: DataTableGestureEvent): void {
    const zoom = this.props.zoom
    if (!zoom || !zoom.wheel || !zoom.wheel.enabled || !zoom.wheel.pinch) {
      return
    }
    if (!this._trackGesturePointerPosition(event)) {
      return
    }
    this._gestureStartZoomValue = zoom.value
    this._gestureActive = true
    event.preventDefault()
    event.stopPropagation()
    event.cancelBubble = true
  }

  /**
   * Обрабатывает runtime-событие DataTableRootNode.
   */
  private _handleTrackpadGestureChange(event: DataTableGestureEvent): void {
    const zoom = this.props.zoom
    if (!zoom || !zoom.wheel || !zoom.wheel.enabled || !zoom.wheel.pinch || !this._gestureActive) {
      return
    }
    const scale = typeof event.scale === 'number' && Number.isFinite(event.scale) ? event.scale : 1
    this._trackGesturePointerPosition(event)
    this._applyZoomValue(this._gestureStartZoomValue * scale)
    event.preventDefault()
    event.stopPropagation()
    event.cancelBubble = true
  }

  /**
   * Обрабатывает runtime-событие DataTableRootNode.
   */
  private _handleTrackpadGestureEnd(event: DataTableGestureEvent): void {
    if (!this._gestureActive) {
      return
    }
    this._gestureActive = false
    event.preventDefault()
    event.stopPropagation()
    event.cancelBubble = true
  }

  /**
   * Применяет подготовленное состояние DataTableRootNode.
   */
  private _applyZoomValue(value: number): void {
    const zoom = this.props.zoom
    if (!zoom || !zoom.wheel) {
      return
    }
    this._applyZoom({
      value: Math.max(zoom.min, Math.min(zoom.max, value)),
      min: zoom.min,
      max: zoom.max,
      mode: zoom.mode,
      affects: [...zoom.affects],
      preserveAnchor: zoom.preserveAnchor,
      wheel: zoom.wheel,
    })
  }

  /**
   * Выполняет внутренний шаг isWheelModifierActive для DataTableRootNode.
   */
  private _isWheelModifierActive(event: WheelEvent, modifier: TooltipModifier | Array<TooltipModifier>): boolean {
    if (Array.isArray(modifier)) {
      return modifier.some(item => this._isWheelModifierActive(event, item))
    }
    if (modifier === 'ctrl') {
      return event.ctrlKey
    }
    if (modifier === 'meta') {
      return event.metaKey
    }
    if (modifier === 'shift') {
      return event.shiftKey
    }
    if (modifier === 'alt') {
      return event.altKey
    }
    return false
  }

  /**
   * Выполняет внутренний шаг trackGesturePointerPosition для DataTableRootNode.
   */
  private _trackGesturePointerPosition(event: DataTableGestureEvent): boolean {
    if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) {
      return this._pointerInside
    }
    const rect = this.canvas.element.getBoundingClientRect()
    const x = (event.clientX ?? rect.left + rect.width / 2) - rect.left
    const y = (event.clientY ?? rect.top + rect.height / 2) - rect.top
    const position = this.toLocal(x, y)
    if (!this._isLocalPointInsideRoot(position[0], position[1])) {
      return false
    }
    this._lastPointerPosition = { x: position[0], y: position[1] }
    return true
  }

  /**
   * Выполняет внутренний шаг isLocalPointInsideRoot для DataTableRootNode.
   */
  private _isLocalPointInsideRoot(x: number, y: number): boolean {
    return x >= 0 && x <= this.width && y >= 0 && y <= this.height
  }

  /**
   * Обновляет значение состояния DataTableRootNode.
   */
  private _setupTooltipKeyboardEvents(): void {
    if (typeof window === 'undefined') {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!this._updateTooltipModifierFromKey(event, true)) {
        return
      }
      this._syncTooltipTarget()
    }
    const handleKeyUp = (event: KeyboardEvent) => {
      if (!this._updateTooltipModifierFromKey(event, false)) {
        return
      }
      this._syncTooltipTarget()
    }
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    this.addDisposer(() => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    })
  }

  /**
   * Обрабатывает pointer по открытому header menu.
   */
  private _handleColumnMenuPointerDown(x: number, y: number, event: MouseEvent): boolean {
    void event
    const menu = this._columnMenuState
    if (!menu) {
      return false
    }

    const height = menu.actions.length * menu.itemHeight + 8
    const inside = x >= menu.x && x <= menu.x + menu.width && y >= menu.y && y <= menu.y + height
    if (!inside) {
      this._columnMenuState = null
      this._refresh(['interaction'])
      return false
    }

    const index = Math.floor((y - menu.y - 4) / menu.itemHeight)
    const action = menu.actions[index]
    if (!action) {
      return true
    }
    if (!action.disabled) {
      this._executeColumnMenuAction(menu.column, action.id)
      this._columnMenuState = null
      this._refresh(['columns', 'layout', 'data'])
    }
    return true
  }

  /**
   * Определяет header zone для открытия column menu.
   */
  private _resolveColumnMenuHeaderTarget(target: DataTableInteractionTarget<Row>, x: number, y: number): boolean {
    if (target.zone !== 'header') {
      return false
    }
    const headerMainHeight = this.headerHeight - this._filterRowHeight
    return y >= 0
      && y < headerMainHeight
      && x >= target.rect.x + Math.max(0, target.rect.width - 24)
      && x <= target.rect.x + target.rect.width
  }

  /**
   * Открывает menu действий для колонки.
   */
  private _openColumnMenu(target: DataTableInteractionTarget<Row>): void {
    const actions = this._createColumnMenuActions(target.column)
    const width = 188
    const itemHeight = 26
    const height = actions.length * itemHeight + 8
    const x = clampInteger(target.rect.x + target.rect.width - width, 4, Math.max(4, this.width - width - 4))
    const y = clampInteger(this.headerHeight, 4, Math.max(4, this.height - height - 4))
    this._columnMenuState = {
      column: target.column,
      rect: { ...target.rect },
      x,
      y,
      width,
      itemHeight,
      actions,
    }
    this._refresh(['interaction'])
  }

  /**
   * Формирует список production actions для header menu.
   */
  private _createColumnMenuActions(column: DataTableResolvedColumn<Row>): Array<ColumnMenuAction> {
    const sortEnabled = !!(this.props.view.sorting && column.sortable)
    const filtered = filterStateHasColumn(this._viewPipeline.getState().filters, column.id)
    const filterEnabled = !!(this.props.view.filtering && column.filter)
    return [
      { id: 'sort-asc', label: 'Sort ascending', disabled: !sortEnabled },
      { id: 'sort-desc', label: 'Sort descending', disabled: !sortEnabled },
      { id: 'clear-sort', label: 'Clear sort', disabled: !this._viewPipeline.getState().sort.some(rule => rule.columnId === column.id) },
      { id: 'filter', label: filtered ? 'Next filter value' : 'Apply filter', disabled: !filterEnabled },
      { id: 'clear-filter', label: 'Clear filter', disabled: !filtered },
      { id: 'pin-left', label: 'Pin left', disabled: column.pinned === 'left' },
      { id: 'pin-right', label: 'Pin right', disabled: column.pinned === 'right' },
      { id: 'unpin', label: 'Unpin', disabled: !column.pinned },
      { id: 'hide', label: 'Hide column', disabled: this._resolvedColumns.length <= 1 },
      { id: 'autosize', label: 'Autosize column' },
      { id: 'reset-columns', label: 'Reset column state' },
    ]
  }

  /**
   * Выполняет выбранное действие header menu.
   */
  private _executeColumnMenuAction(column: DataTableResolvedColumn<Row>, action: ColumnMenuActionId): void {
    if (action === 'sort-asc' || action === 'sort-desc') {
      this._setColumnSortDirection(column.id, action === 'sort-asc' ? 'asc' : 'desc')
      return
    }
    if (action === 'clear-sort') {
      this._clearSort(column.id)
      return
    }
    if (action === 'filter') {
      this._handleFilterUiAction({
        column,
        rect: this._columnMenuState?.rect ?? { x: 0, y: 0, width: 0, height: 0 },
        action: 'value',
      })
      return
    }
    if (action === 'clear-filter') {
      this._clearFilter(column.id)
      return
    }
    if (action === 'pin-left' || action === 'pin-right') {
      this._pinColumn(column.id, action === 'pin-left' ? 'left' : 'right')
      return
    }
    if (action === 'unpin') {
      this._unpinColumn(column.id)
      return
    }
    if (action === 'hide') {
      this._hideColumn(column.id)
      return
    }
    if (action === 'autosize') {
      this.autosizeColumn(column.id)
      return
    }
    this._resetColumnState()
  }

  /**
   * Устанавливает direction для одной колонки без потери multi-sort chain.
   */
  private _setColumnSortDirection(columnId: string, direction: 'asc' | 'desc'): void {
    if (!this.props.view.sorting) {
      return
    }
    const current = this._viewPipeline.getState().sort.filter(rule => rule.columnId !== columnId)
    const next = this.props.view.sorting.multi
      ? [...current, { columnId, direction }]
      : [{ columnId, direction }]
    this._viewPipeline.setSort(next)
    this._emitViewQuery('sort')
    this.setScroll(this.scrollX, 0)
    this._refresh(['data', 'layout'])
  }

  /**
   * Обрабатывает runtime-событие DataTableRootNode.
   */
  private _handleHeaderAction(target: DataTableInteractionTarget<Row>, event: MouseEvent): void {
    if (!target.column.sortable || !this.props.view.sorting) {
      return
    }
    this._viewPipeline.cycleSort(target.column.id, event.shiftKey)
    this._emitViewQuery('sort')
    this.setScroll(this.scrollX, 0)
    this._refresh(['data', 'layout'])
  }

  /**
   * Определяет интерактивную область filter UI в header.
   */
  private _resolveFilterUiTarget(
    target: DataTableInteractionTarget<Row>,
    x: number,
    y: number,
    event: MouseEvent,
  ): FilterUiTarget<Row> | null {
    if (!this.props.view.filterUi || !target.column.filter) {
      return null
    }
    const filterRowHeight = this._filterRowHeight
    const headerMainHeight = this.headerHeight - filterRowHeight
    const rect: DataTableCellRect = {
      x: target.rect.x,
      y: 0,
      width: target.rect.width,
      height: this.headerHeight,
    }

    if (filterRowHeight > 0 && y >= headerMainHeight && this.props.view.filterUi.filterRow) {
      rect.y = headerMainHeight
      rect.height = filterRowHeight
      const active = filterStateHasColumn(this._viewPipeline.getState().filters, target.column.id)
      if ((active && x >= rect.x + rect.width - 18) || event.altKey || event.metaKey) {
        return { column: target.column, rect, action: 'clear' }
      }
      if (x <= rect.x + Math.min(58, rect.width * 0.42)) {
        return { column: target.column, rect, action: 'operator' }
      }
      return { column: target.column, rect, action: 'value' }
    }

    if (this.props.view.filterUi.headerMenu && y < headerMainHeight && x >= rect.x + rect.width - 28) {
      rect.height = headerMainHeight
      return {
        column: target.column,
        rect,
        action: filterStateHasColumn(this._viewPipeline.getState().filters, target.column.id) && event.altKey
          ? 'clear'
          : 'value',
      }
    }
    return null
  }

  /**
   * Применяет быстрый built-in filter UI action.
   */
  private _handleFilterUiAction(target: FilterUiTarget<Row>): boolean {
    const active = resolveColumnFilterRule(this._viewPipeline.getState().filters, target.column.id)
    if (target.action === 'clear') {
      this._clearFilter(target.column.id)
      return true
    }

    const filter = target.column.filter
    const operator = target.action === 'operator'
      ? resolveNextFilterOperator(filter, active?.operator)
      : active?.operator ?? resolveDefaultFilterOperator(filter)
    const value = target.action === 'value'
      ? resolveNextFilterValue(filter, active?.value)
      : active?.value ?? resolveDefaultFilterValue(filter)
    this._setFilter(target.column.id, { operator, value })
    return true
  }

  /**
   * Запускает runtime-процесс DataTableRootNode.
   */
  private _startColumnDrag(target: DataTableInteractionTarget<Row>, event: MouseEvent): boolean {
    if (!this._canDragColumn(target)) {
      return false
    }

    const [x, y] = this._trackPointerPosition(event)
    const startIndex = this._resolvedColumns.findIndex(column => column.id === target.column.id)
    if (startIndex < 0) {
      return false
    }
    this._columnDragState = {
      column: target.column,
      startIndex,
      targetIndex: startIndex,
      pinned: target.column.pinned,
      active: false,
      pointerX: x,
      pointerY: y,
      grabOffsetX: x - target.rect.x,
    }
    this._columnDragLayoutMotion.clear()
    this.capturePointer(event)
    return true
  }

  /**
   * Выполняет внутренний шаг canDragColumn для DataTableRootNode.
   */
  private _canDragColumn(target: DataTableInteractionTarget<Row>): boolean {
    return target.zone === 'header'
      && !!this.props.view.columnOrdering
      && this.props.view.columnOrdering.enabled
      && target.column.reorderable !== false
  }

  /**
   * Обновляет runtime-состояние DataTableRootNode.
   */
  private _updateColumnDrag(meta: NovaDragEventMeta): void {
    const drag = this._columnDragState
    if (!drag) {
      return
    }

    const [x, y] = this.toLocal(meta.x, meta.y)
    this._lastPointerPosition = { x, y }
    drag.pointerX = x
    drag.pointerY = y
    if (!drag.active && Math.abs(meta.totalDx) < 6) {
      return
    }
    const wasActive = drag.active
    drag.active = true
    this._autoScrollColumnDrag(x)
    const targetIndex = this._resolveColumnDragTargetIndex(meta)
    if (targetIndex === undefined || targetIndex === drag.targetIndex) {
      if (!wasActive) {
        this._refresh(['interaction'])
        this._queueAnimationLoopSync()
      }
      return
    }

    const before = this._captureColumnXById()
    drag.targetIndex = targetIndex
    const after = this._captureColumnXById()
    this._startColumnLayoutMotion(before, after, drag.column.id)
    this._refresh(['interaction'])
  }

  /**
   * Фиксирует подготовленные изменения DataTableRootNode.
   */
  private _commitColumnDrag(meta: NovaDragEventMeta): void {
    const drag = this._columnDragState
    if (!drag) {
      return
    }

    if (drag.active) {
      this._suppressNextHeaderClickOnce()
    }
    if (!drag.active) {
      this._columnDragState = null
      this._columnDragLayoutMotion.clear()
      return
    }

    const fromIndex = this._resolvedColumns.findIndex(column => column.id === drag.column.id)
    const toIndex = this._resolveColumnDragTargetIndex(meta) ?? drag.targetIndex
    this._columnDragState = null
    this._columnDragLayoutMotion.clear()
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
      return
    }

    const order = this._resolvedColumns.map(column => column.id)
    const [id] = order.splice(fromIndex, 1)
    if (!id) {
      return
    }
    order.splice(toIndex, 0, id)

    const next = this._viewPipeline.reorderColumns({
      columnId: drag.column.id,
      fromIndex,
      toIndex,
      order,
      reason: 'drag',
    }, this._getColumnStateInputColumns())
    this._columnStateOverride = {
      ...this._toColumnStateInput(this._getColumnState()),
      order: next.order,
    }
    this.props.onColumnOrderChange?.(next)
    this._emitColumnStateChange()
    this._emitViewQuery('column')
    this._refresh(['columns', 'layout'])
  }

  /**
   * Выполняет внутренний шаг suppressNextHeaderClickOnce для DataTableRootNode.
   */
  private _suppressNextHeaderClickOnce(): void {
    this._suppressNextHeaderClick = true
    setTimeout(() => {
      this._suppressNextHeaderClick = false
    }, 0)
  }

  /**
   * Нормализует и возвращает итоговое значение DataTableRootNode.
   */
  private _resolveColumnDragTargetIndex(meta: NovaDragEventMeta): number | undefined {
    const drag = this._columnDragState
    if (!drag) {
      return undefined
    }

    const [x] = this.toLocal(meta.x, meta.y)
    const target = this._resolveColumnAt(x)
    const allowCrossPinned = !!(this.props.view.columnOrdering && this.props.view.columnOrdering.allowCrossPinned)
    if (!target) {
      return this._resolveColumnDragEdgeTargetIndex(x, allowCrossPinned)
    }
    if (!allowCrossPinned && target.column.pinned !== drag.pinned) {
      return drag.targetIndex
    }
    if (target.column.reorderable === false) {
      return drag.targetIndex
    }

    const targetIndex = this._resolvedColumns.findIndex(column => column.id === target.column.id)
    if (targetIndex < 0) {
      return drag.targetIndex
    }
    return this._resolveColumnDragInsertionIndex(targetIndex, x >= target.x + target.width / 2)
  }

  /**
   * Нормализует и возвращает итоговое значение DataTableRootNode.
   */
  private _resolveColumnDragEdgeTargetIndex(x: number, allowCrossPinned: boolean): number | undefined {
    const drag = this._columnDragState
    if (!drag) {
      return undefined
    }
    const visible = this._visibleColumnRects('all', false)
      .filter(item => item.column.id !== drag.column.id)
      .filter(item => (allowCrossPinned || item.column.pinned === drag.pinned) && item.column.reorderable !== false)
    if (visible.length === 0) {
      return drag.targetIndex
    }
    if (x < 0) {
      return this._resolveColumnDragInsertionIndex(this._resolvedColumns.findIndex(column => column.id === visible[0]?.column.id), false)
    }
    if (x > this.width) {
      return this._resolveColumnDragInsertionIndex(this._resolvedColumns.findIndex(column => column.id === visible[visible.length - 1]?.column.id), true)
    }
    return drag.targetIndex
  }

  /**
   * Нормализует и возвращает итоговое значение DataTableRootNode.
   */
  private _resolveColumnDragInsertionIndex(targetIndex: number, after: boolean): number {
    const drag = this._columnDragState
    if (!drag || targetIndex < 0) {
      return targetIndex
    }
    let insertionIndex = after ? targetIndex + 1 : targetIndex
    const fromIndex = this._resolvedColumns.findIndex(column => column.id === drag.column.id)
    if (fromIndex >= 0 && fromIndex < insertionIndex) {
      insertionIndex -= 1
    }
    return Math.max(0, Math.min(this._resolvedColumns.length - 1, insertionIndex))
  }

  /**
   * Выполняет внутренний шаг autoScrollColumnDrag для DataTableRootNode.
   */
  private _autoScrollColumnDrag(x: number): void {
    const drag = this._columnDragState
    if (!drag || drag.pinned) {
      return
    }
    const edge = 28
    let nextX = this.scrollX
    if (x < this._viewport.bodyX + edge) {
      nextX -= Math.max(24, this._viewport.bodyWidth * 0.08)
    }
    else if (x > this._viewport.bodyX + this._viewport.bodyWidth - edge) {
      nextX += Math.max(24, this._viewport.bodyWidth * 0.08)
    }
    if (nextX !== this.scrollX) {
      this.setScroll(nextX, this.scrollY)
    }
  }

  /**
   * Возвращает внутреннюю диагностику render layers для unit/bench проверок.
   */
  __getRenderLayerDiagnostics(): DataTableRenderLayerDiagnostics {
    return {
      layerRebuilds: { ...this._renderLayerDiagnostics.layerRebuilds },
      templateCalls: this._renderLayerDiagnostics.templateCalls,
      templateCacheHits: this._renderLayerDiagnostics.templateCacheHits,
      templateCacheMisses: this._renderLayerDiagnostics.templateCacheMisses,
      interactionRebuilds: this._renderLayerDiagnostics.interactionRebuilds,
      animatedLayerRebuilds: this._renderLayerDiagnostics.animatedLayerRebuilds,
      schemaSegments: this._renderLayerDiagnostics.schemaSegments,
      schemaItems: this._renderLayerDiagnostics.schemaItems,
      rectBatchSegments: this._renderLayerDiagnostics.rectBatchSegments,
      rectBatchItems: this._renderLayerDiagnostics.rectBatchItems,
      textBatchSegments: this._renderLayerDiagnostics.textBatchSegments,
      textBatchItems: this._renderLayerDiagnostics.textBatchItems,
    }
  }

  /**
   * Сбрасывает внутреннюю диагностику render layers.
   */
  __resetRenderLayerDiagnostics(): void {
    const next = createRenderLayerDiagnostics()
    Object.assign(this._renderLayerDiagnostics.layerRebuilds, next.layerRebuilds)
    this._renderLayerDiagnostics.templateCalls = 0
    this._renderLayerDiagnostics.templateCacheHits = 0
    this._renderLayerDiagnostics.templateCacheMisses = 0
    this._renderLayerDiagnostics.interactionRebuilds = 0
    this._renderLayerDiagnostics.animatedLayerRebuilds = 0
    this._renderLayerDiagnostics.schemaSegments = 0
    this._renderLayerDiagnostics.schemaItems = 0
    this._renderLayerDiagnostics.rectBatchSegments = 0
    this._renderLayerDiagnostics.rectBatchItems = 0
    this._renderLayerDiagnostics.textBatchSegments = 0
    this._renderLayerDiagnostics.textBatchItems = 0
  }

  /**
   * Рендерит слой из cache или пересобирает его при необходимости.
   */
  private _renderLayer(id: DataTableRenderLayerId, render: () => void): void {
    const layer = this._renderLayers.get(id)
    if (!layer) {
      return
    }

    if (layer.dirty || !layer.initialized) {
      const previousLayer = this._activeRenderLayerId
      const previousClip = this._activeRenderClip
      this._activeRenderLayerId = id
      this._activeRenderClip = null
      layer.segments = []
      try {
        render()
      }
      finally {
        this._activeRenderLayerId = previousLayer
        this._activeRenderClip = previousClip
      }
      layer.initialized = true
      layer.dirty = false
      layer.rebuilds += 1
      this._renderLayerDiagnostics.layerRebuilds[id] += 1
      if (id === 'interaction') {
        this._renderLayerDiagnostics.interactionRebuilds += 1
      }
      if (id === 'body-animated') {
        this._renderLayerDiagnostics.animatedLayerRebuilds += 1
      }
    }

    for (const segment of layer.segments) {
      this._emitRenderSegment(segment)
    }
    if (id === 'body-animated' && layer.segments.length > 0) {
      this._visibleAnimatedCells = true
    }
  }

  /**
   * Добавляет schema в текущий render layer или сразу в renderer.
   */
  private _emitSchema(schema: NovaSchema): void {
    if (schema.length === 0) {
      return
    }
    this._emitSchemaPrimitiveBatches(schema)
  }

  /**
   * Делит schema на последовательные schema/rect-batch segments, сохраняя порядок.
   */
  private _emitSchemaPrimitiveBatches(schema: NovaSchema): void {
    let schemaRun: NovaSchema = []
    let rectRun: Array<DataTableBatchableRect> = []

    const flushSchemaRun = () => {
      if (schemaRun.length === 0) {
        return
      }
      this._emitSchemaSegment(schemaRun)
      schemaRun = []
    }

    const flushRectRun = () => {
      if (rectRun.length === 0) {
        return
      }
      this._emitRectBatch(this._createRectBatchFromSchemaRects(rectRun))
      rectRun = []
    }

    for (const item of schema) {
      if (this._isBatchableSchemaRect(item)) {
        flushSchemaRun()
        rectRun.push(item)
        continue
      }
      flushRectRun()
      schemaRun.push(item)
    }

    flushSchemaRun()
    flushRectRun()
  }

  /**
   * Добавляет обычный schema segment в текущий layer.
   */
  private _emitSchemaSegment(schema: NovaSchema): void {
    const segment: DataTableRenderSegment = {
      kind: 'schema',
      schema,
      clip: this._activeRenderClip ? { ...this._activeRenderClip } : undefined,
    }
    const layer = this._activeRenderLayerId ? this._renderLayers.get(this._activeRenderLayerId) : null
    if (layer) {
      layer.segments.push(segment)
      return
    }
    this._emitRenderSegment(segment)
  }

  /**
   * Простые rects без border/radius/opacity можно рисовать одним batch.
   */
  private _isBatchableSchemaRect(item: NovaSchema[number] | undefined): item is DataTableBatchableRect {
    if (!item || item.type !== 'rect' || item.active === false) {
      return false
    }
    if (item.width <= 0 || item.height <= 0) {
      return false
    }

    const styles = item.styles
    if (!styles || typeof styles.background !== 'string') {
      return false
    }
    if (!isBatchableRectBackground(styles.background)) {
      return false
    }
    if (styles.border) {
      return false
    }
    if (styles.radius !== undefined && styles.radius !== 0) {
      return false
    }
    if (styles.opacity !== undefined && styles.opacity !== 1) {
      return false
    }
    return true
  }

  /**
   * Собирает NovaRectBatch из последовательного run простых rect items.
   */
  private _createRectBatchFromSchemaRects(items: Array<DataTableBatchableRect>): NovaRectBatch {
    const count = items.length
    const colors = new Float32Array(count * 4)
    const states = new Float32Array(count)
    const x = new Float32Array(count)
    const y = new Float32Array(count)
    const width = new Float32Array(count)
    const height = new Float32Array(count)

    items.forEach((item, index) => {
      const color = this._resolveRectBatchColor(item.styles?.background)
      x[index] = item.x
      y[index] = item.y
      width[index] = item.width
      height[index] = item.height
      colors[index * 4] = color[0]
      colors[index * 4 + 1] = color[1]
      colors[index * 4 + 2] = color[2]
      colors[index * 4 + 3] = color[3]
    })

    return {
      count,
      x,
      y,
      width,
      height,
      colors,
      states,
      revision: this.store.takeDataRevision() + this.invalidation.get('viewport') + this.invalidation.get('zoom') + 1,
      staticRevision: this.store.takeStructureRevision() + this.invalidation.get('columns') + this.invalidation.get('layout') + 1,
    }
  }

  /**
   * Возвращает RGBA для solid rect batch с cache по строке цвета.
   */
  private _resolveRectBatchColor(background: string | undefined): [number, number, number, number] {
    const key = background ?? 'transparent'
    const cached = this._rectBatchColorCache.get(key)
    if (cached) {
      return cached
    }

    const color = parseNovaColor(background)
    const tuple: [number, number, number, number] = [color.r, color.g, color.b, color.a]
    this._rectBatchColorCache.set(key, tuple)
    return tuple
  }

  /**
   * Добавляет rect batch в текущий render layer или сразу в renderer.
   */
  private _emitRectBatch(rectBatch: NovaRectBatch): void {
    if (rectBatch.count <= 0) {
      return
    }
    const segment: DataTableRenderSegment = {
      kind: 'rect-batch',
      rectBatch,
      schema: [] as unknown as NovaSchema,
      clip: this._activeRenderClip ? { ...this._activeRenderClip } : undefined,
    }
    const layer = this._activeRenderLayerId ? this._renderLayers.get(this._activeRenderLayerId) : null
    if (layer) {
      layer.segments.push(segment)
      return
    }
    this._emitRenderSegment(segment)
  }

  /**
   * Добавляет text batch в текущий render layer или сразу в renderer.
   */
  private _emitTextBatch(textBatch: NovaTextBatch): void {
    if (textBatch.count <= 0) {
      return
    }
    const segment: DataTableRenderSegment = {
      kind: 'text-batch',
      textBatch,
      schema: [] as unknown as NovaSchema,
      clip: this._activeRenderClip ? { ...this._activeRenderClip } : undefined,
    }
    const layer = this._activeRenderLayerId ? this._renderLayers.get(this._activeRenderLayerId) : null
    if (layer) {
      layer.segments.push(segment)
      return
    }
    this._emitRenderSegment(segment)
  }

  /**
   * Выполняет отрисовку render segment.
   */
  private _emitRenderSegment(segment: DataTableRenderSegment): void {
    const render = () => {
      if (segment.kind === 'schema') {
        this._renderLayerDiagnostics.schemaSegments += 1
        this._renderLayerDiagnostics.schemaItems += segment.schema.length
        this.renderer.schema(segment.schema)
        return
      }
      if (segment.kind === 'rect-batch') {
        this._renderLayerDiagnostics.rectBatchSegments += 1
        this._renderLayerDiagnostics.rectBatchItems += segment.rectBatch.count
        this.renderer.rects(segment.rectBatch)
        return
      }
      this._renderLayerDiagnostics.textBatchSegments += 1
      this._renderLayerDiagnostics.textBatchItems += segment.textBatch.count
      this.renderer.texts(segment.textBatch)
    }

    if (segment.clip) {
      this.renderer.clip(segment.clip.x, segment.clip.y, segment.clip.width, segment.clip.height)
      render()
      this.renderer.clearClip()
      return
    }
    render()
  }

  /**
   * Применяет clip к schema, созданным внутри callback.
   */
  private _withRenderClip(clip: DataTableCellRect, render: () => void): void {
    if (clip.width <= 0 || clip.height <= 0) {
      return
    }
    const previousClip = this._activeRenderClip
    this._activeRenderClip = clip
    try {
      render()
    }
    finally {
      this._activeRenderClip = previousClip
    }
  }

  /**
   * Выполняет отрисовку DataTableRootNode.
   */
  private _renderGrid(): void {
    const rebuildsCellLayers = this._willRebuildLayers(DATA_TABLE_TEXT_SELECTION_SOURCE_LAYERS)
    if (rebuildsCellLayers) {
      this._nextVisibleCellKeys = new Set()
      this._cellEnterRenderCount = 0
    }
    this._visibleAnimatedCells = false
    const previousViewState = this._renderViewState
    this._renderViewState = this._viewPipeline.getState()
    this._prepareRenderPassIndexes(this._renderViewState)

    try {
      this._renderLayer('base', () => this._emitSchema(buildBoxSchema(this.props, this.width, this.height)))
      this._renderLayer('header', () => this._renderHeaderLayer())
      this._renderLayer('pinned', () => this._renderPinnedLayer())
      this._renderLayer('body-static', () => this._renderBodyRows(false))
      this._renderLayer('body-animated', () => this._renderBodyRows(true))
      this._renderLayer('group-summary', () => this._renderPinnedBottomGroupPanel())
      this._renderLayer('search', () => this._renderSearchOverlay())
      this._renderLayer('selection', () => {
        this._renderClipboardFeedbackOverlay()
        this._renderTextSelectionOverlay()
        this._renderSelectionOverlay()
      })
      this._renderLayer('interaction', () => {
        this._renderHoverOverlay()
        this._renderInteractionLayer()
      })
      this._renderLayer('drag-menu-tooltip', () => {
        this._renderColumnDragOverlay()
        this._renderColumnMenu()
        this._renderTooltipLayer()
      })
      this._renderLayer('scrollbars', () => {
        this._renderScrollbars()
        this._renderScrollbarLayer()
      })
    }
    finally {
      this._clearRenderPassIndexes()
      this._renderViewState = previousViewState
    }

    if (rebuildsCellLayers) {
      this._finalizeVisibleCellKeys()
    }
    this._queueAnimationLoopSync()
  }

  /**
   * Подготавливает дешевые lookup-структуры на один render pass.
   */
  private _prepareRenderPassIndexes(viewState: DataTableViewState): void {
    this._renderVisibleColumnRects.clear()
    this._renderCellTemplateByColumnZone.clear()
    this._renderSortIndexByColumn.clear()
    this._renderFilteredColumnIds.clear()
    this._renderColumnPartitions = this._createColumnPartitions(this._resolvedColumns)

    viewState.sort.forEach((rule, index) => {
      this._renderSortIndexByColumn.set(rule.columnId, index)
    })
    collectFilterStateColumnIds(viewState.filters, this._renderFilteredColumnIds)
  }

  /**
   * Очищает lookup-структуры render pass.
   */
  private _clearRenderPassIndexes(): void {
    this._renderVisibleColumnRects.clear()
    this._renderCellTemplateByColumnZone.clear()
    this._renderSortIndexByColumn.clear()
    this._renderFilteredColumnIds.clear()
    this._renderColumnPartitions = null
  }

  /**
   * Рендерит header слой.
   */
  private _renderHeaderLayer(): void {
    const headerY = 0
    const filterRowHeight = this._filterRowHeight
    const headerMainHeight = this.headerHeight - filterRowHeight
    this._renderPartitionedRowZone('header', [{} as Row], headerY, headerMainHeight, false)
    if (filterRowHeight > 0) {
      this._renderFilterRow(headerY + headerMainHeight, filterRowHeight)
    }
  }

  /**
   * Рендерит pinned rows слой.
   */
  private _renderPinnedLayer(): void {
    const pinnedRows = this._resolveEffectivePinnedRows()
    const topRows = pinnedRows.top ?? []
    const bottomRows = pinnedRows.bottom ?? []

    if (topRows.length > 0) {
      this._renderPartitionedRowZone('pinned-top', topRows, this.headerHeight, this.rowHeight, false)
    }

    if (bottomRows.length > 0) {
      this._renderPartitionedRowZone(
        'pinned-bottom',
        bottomRows,
        this.height - bottomRows.length * this.rowHeight,
        this.rowHeight,
        false,
      )
    }
  }

  /**
   * Выполняет отрисовку DataTableRootNode.
   */
  private _renderPartitionedRowZone(
    zone: DataTableCellContext<Row>['zone'],
    rows: Array<Row> | Array<RenderedTableRow<Row>>,
    yStart: number,
    rowHeight: number,
    useBodyIndex: boolean,
    columnPredicate?: (column: DataTableResolvedColumn<Row>) => boolean,
    includeGroupRows = true,
  ): void {
    const clipHeight = zone === 'body'
      ? this._viewport.bodyHeight
      : rows.length * rowHeight
    const clipY = zone === 'body'
      ? this._viewport.bodyY
      : yStart

    this._renderClippedRowZone(
      zone,
      rows,
      yStart,
      rowHeight,
      useBodyIndex,
      'center',
      this._viewport.bodyX,
      clipY,
      this._viewport.bodyWidth,
      clipHeight,
      columnPredicate,
      includeGroupRows,
    )

    if (this._viewport.pinnedLeftWidth > 0) {
      this._renderClippedRowZone(
        zone,
        rows,
        yStart,
        rowHeight,
        useBodyIndex,
        'left',
        0,
        clipY,
        this._viewport.pinnedLeftWidth,
        clipHeight,
        columnPredicate,
        includeGroupRows,
      )
    }

    if (this._viewport.pinnedRightWidth > 0) {
      this._renderClippedRowZone(
        zone,
        rows,
        yStart,
        rowHeight,
        useBodyIndex,
        'right',
        this.width - this._viewport.pinnedRightWidth,
        clipY,
        this._viewport.pinnedRightWidth,
        clipHeight,
        columnPredicate,
        includeGroupRows,
      )
    }
  }

  /**
   * Выполняет отрисовку DataTableRootNode.
   */
  private _renderBodyRows(animatedOnly: boolean): void {
    const rows: Array<RenderedTableRow<Row>> = []
    for (let rowIndex = this._viewport.rowRange.start; rowIndex < this._viewport.rowRange.end; rowIndex += 1) {
      const viewRow = this._viewPipeline.getViewRowAt(rowIndex)
      if (!viewRow) {
        continue
      }
      const renderedRow = this._createRenderedBodyRow(viewRow, rowIndex)
      if (renderedRow) {
        rows.push(renderedRow)
      }
    }
    if (rows.length === 0) {
      return
    }

    this._renderPartitionedRowZone(
      'body',
      rows,
      this._viewport.bodyY,
      this.rowHeight,
      true,
      column => animatedOnly ? !!column.animated : !column.animated,
      !animatedOnly,
    )
  }

  /**
   * Рисует встроенную canvas filter row под header captions.
   */
  private _renderFilterRow(y: number, height: number): void {
    this._renderFilterRowRegion('center', y, height, this._viewport.bodyX, this._viewport.bodyWidth)
    if (this._viewport.pinnedLeftWidth > 0) {
      this._renderFilterRowRegion('left', y, height, 0, this._viewport.pinnedLeftWidth)
    }
    if (this._viewport.pinnedRightWidth > 0) {
      this._renderFilterRowRegion('right', y, height, this.width - this._viewport.pinnedRightWidth, this._viewport.pinnedRightWidth)
    }
  }

  /**
   * Рисует filter row для отдельного pinned/center региона.
   */
  private _renderFilterRowRegion(
    region: VisibleColumnRegion,
    y: number,
    height: number,
    clipX: number,
    clipWidth: number,
  ): void {
    if (clipWidth <= 0 || height <= 0) {
      return
    }

    const schema: NovaSchema = []
    const viewState = this._viewPipeline.getState()
    for (const columnRect of this._visibleColumnRects(region)) {
      const rect = {
        x: columnRect.x,
        y,
        width: columnRect.width,
        height,
      }
      const active = filterStateHasColumn(viewState.filters, columnRect.column.id)
      schema.push({
        type: 'rect',
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        styles: {
          background: active ? '#eaf3ff' : '#f8fafc',
          border: { color: '#d8e0ea', width: 1 },
        },
      })

      const context = this._createFilterRowContext(columnRect, rect)
      const template = columnRect.column.filterTemplate
      if (template) {
        schema.push(...template(context))
        continue
      }

      const rule = resolveColumnFilterRule(viewState.filters, columnRect.column.id)
      const operatorLabel = rule
        ? formatFilterOperator(rule.operator)
        : formatFilterOperator(resolveDefaultFilterOperator(columnRect.column.filter))
      const valueLabel = rule
        ? formatFilterValue(rule.value)
        : resolveFilterPlaceholder(columnRect.column.filter)
      const label = valueLabel
      if (!label) {
        continue
      }

      const chipWidth = Math.min(54, Math.max(32, Math.floor(rect.width * 0.36)))
      schema.push({
        type: 'rect',
        x: rect.x + 4,
        y: rect.y + 3,
        width: chipWidth,
        height: Math.max(0, rect.height - 6),
        styles: {
          background: active ? '#dbeafe' : '#eef2f7',
          border: { color: active ? '#93c5fd' : '#d8e0ea', width: 1 },
          radius: 4,
        },
      })
      schema.push({
        type: 'text',
        text: operatorLabel,
        x: rect.x + 8,
        y: rect.y,
        width: Math.max(0, chipWidth - 8),
        height: rect.height,
        styles: {
          color: active ? '#1d4ed8' : '#64748b',
          font: {
            family: this.props.fontFamily ?? 'Inter, Arial, sans-serif',
            size: Math.max(9, this._fontSize - 3),
            weight: '700',
          },
          lineHeight: Math.max(10, this._lineHeight - 3),
          align: { horizontal: 'center', vertical: 'middle' },
          ellipsis: true,
        },
      })

      schema.push({
        type: 'text',
        text: label,
        x: rect.x + chipWidth + 10,
        y: rect.y,
        width: Math.max(0, rect.width - chipWidth - (active ? 30 : 16)),
        height: rect.height,
        styles: {
          color: active ? '#1d4ed8' : '#64748b',
          font: {
            family: this.props.fontFamily ?? 'Inter, Arial, sans-serif',
            size: Math.max(10, this._fontSize - 2),
            weight: active ? '700' : '500',
          },
          lineHeight: Math.max(10, this._lineHeight - 2),
          align: { horizontal: 'left', vertical: 'middle' },
          ellipsis: true,
        },
      })

      if (active) {
        schema.push({
          type: 'text',
          text: 'x',
          x: rect.x + rect.width - 18,
          y: rect.y,
          width: 14,
          height: rect.height,
          styles: {
            color: '#64748b',
            font: {
              family: this.props.fontFamily ?? 'Inter, Arial, sans-serif',
              size: Math.max(12, this._fontSize),
              weight: '800',
            },
            lineHeight: Math.max(10, this._lineHeight),
            align: { horizontal: 'center', vertical: 'middle' },
          },
        })
      }
    }

    this._withRenderClip({ x: clipX, y, width: clipWidth, height }, () => this._emitSchema(schema))
  }

  /**
   * Собирает context для пользовательского #filter slot.
   */
  private _createFilterRowContext(
    columnRect: VisibleColumnRect<Row>,
    rect: DataTableCellRect,
  ): DataTableCellContext<Row> {
    const row = {} as Row
    const rowId = `__filter__:${columnRect.column.id}`
    return {
      row,
      rowId,
      rowIndex: -1,
      viewRowIndex: -1,
      column: columnRect.column,
      columnIndex: columnRect.columnIndex,
      value: summarizeColumnFilters(this._viewPipeline.getState().filters, columnRect.column.id),
      rect,
      state: this._createCellState(rect, rowId, -1, undefined, columnRect, 'header'),
      zone: 'header',
      store: this.store,
      api: this._api,
    }
  }

  /**
   * Создает runtime-сущность DataTableRootNode.
   */
  private _createRenderedBodyRow(viewRow: DataTableViewRow<Row>, rowIndex: number): RenderedTableRow<Row> | null {
    if (viewRow.kind === 'data') {
      if (!viewRow.row) {
        return null
      }
      return {
        kind: 'data',
        row: viewRow.row,
        rowId: viewRow.rowId ?? this._resolveRenderedRowId('body', viewRow.row, rowIndex),
        rowIndex,
        storeIndex: viewRow.storeIndex,
        zone: 'body',
      }
    }

    if (viewRow.kind === 'grand-footer') {
      return {
        kind: 'grand-footer',
        rowId: viewRow.rowId,
        rowIndex,
        storeIndex: viewRow.storeIndex,
        zone: 'grand-footer',
        aggregate: viewRow.aggregate,
        rows: viewRow.rows,
      }
    }

    return {
      kind: viewRow.kind,
      rowId: viewRow.rowId,
      rowIndex,
      storeIndex: viewRow.storeIndex,
      zone: viewRow.kind,
      group: viewRow.group,
      aggregate: viewRow.group.aggregate,
      rows: viewRow.group.rows,
    }
  }

  /**
   * Выполняет отрисовку DataTableRootNode.
   */
  private _renderClippedRowZone(
    zone: DataTableCellContext<Row>['zone'],
    rows: Array<Row> | Array<RenderedTableRow<Row>>,
    yStart: number,
    rowHeight: number,
    useBodyIndex: boolean,
    columnRegion: VisibleColumnRegion,
    clipX: number,
    clipY: number,
    clipWidth: number,
    clipHeight: number,
    columnPredicate?: (column: DataTableResolvedColumn<Row>) => boolean,
    includeGroupRows = true,
  ): void {
    if (clipWidth <= 0 || clipHeight <= 0) {
      return
    }

    this._withRenderClip({ x: clipX, y: clipY, width: clipWidth, height: clipHeight }, () => {
      this._renderRowZone(zone, rows, yStart, rowHeight, useBodyIndex, columnRegion, columnPredicate, includeGroupRows)
    })
  }

  /**
   * Выполняет отрисовку DataTableRootNode.
   */
  private _renderRowZone(
    zone: DataTableCellContext<Row>['zone'],
    rows: Array<Row> | Array<RenderedTableRow<Row>>,
    yStart: number,
    rowHeight: number,
    useBodyIndex: boolean,
    columnRegion: VisibleColumnRegion = 'all',
    columnPredicate?: (column: DataTableResolvedColumn<Row>) => boolean,
    includeGroupRows = true,
  ): void {
    const backgroundSchema: NovaSchema = []
    const contentSchema: NovaSchema = []
    const textBatchBuilders = new Map<string, DataTableTextBatchBuilder>()
    const columnRects = this._visibleColumnRects(columnRegion).filter(rect => !columnPredicate || columnPredicate(rect.column))
    const gridRowTops: Array<number> = []

    rows.forEach((rowInput, localIndex) => {
      const renderedRow = this._normalizeRenderedRow(zone, rowInput, localIndex, useBodyIndex)
      const { rowIndex, storeIndex } = renderedRow
      const y = zone === 'body'
        ? this._viewport.bodyY + rowIndex * this.rowHeight - this.scrollY
        : yStart + localIndex * rowHeight

      if (renderedRow.kind !== 'data') {
        if (includeGroupRows) {
          this._renderGroupLikeRow(contentSchema, renderedRow, y, rowHeight, columnRegion)
        }
        return
      }

      const { row, rowId } = renderedRow
      gridRowTops.push(y)
      const cachedBackgroundBand = this._resolveRowBackgroundBand(columnRects, zone, rowIndex, rowHeight)
      if (cachedBackgroundBand) {
        this._appendRowBackgroundBand(backgroundSchema, cachedBackgroundBand, columnRects[0]?.x ?? 0, y, rowHeight)
      }
      let activeBackground: { x: number, y: number, width: number, height: number, background: string } | null = null
      const flushBackground = () => {
        if (cachedBackgroundBand) {
          return
        }
        if (!activeBackground) {
          return
        }
        backgroundSchema.push({
          type: 'rect',
          x: activeBackground.x,
          y: activeBackground.y,
          width: activeBackground.width,
          height: activeBackground.height,
          styles: { background: activeBackground.background },
        })
        activeBackground = null
      }

      for (const columnRect of columnRects) {
        const rect: DataTableCellRect = {
          x: columnRect.x,
          y,
          width: columnRect.width,
          height: rowHeight,
        }
        const context: DataTableCellContext<Row> = {
          row,
          rowId,
          rowIndex,
          viewRowIndex: rowIndex,
          storeIndex,
          column: columnRect.column,
          columnIndex: columnRect.columnIndex,
          value: zone === 'header'
            ? columnRect.column.title ?? columnRect.column.id
            : resolveDataTableValue(row, storeIndex ?? rowIndex, columnRect.column),
          rect,
          state: this._createCellState(rect, rowId, rowIndex, storeIndex, columnRect, zone),
          zone,
          store: this.store,
          api: this._api,
        }
        const template = this._resolveCellTemplate(context)
        const backgroundPainted = !template
        if (!cachedBackgroundBand && backgroundPainted) {
          const background = this._resolveDefaultCellVisualBackground(context)
          if (activeBackground
            && activeBackground.background === background
            && Math.abs(activeBackground.y - rect.y) < 0.5
            && Math.abs(activeBackground.height - rect.height) < 0.5
            && Math.abs(activeBackground.x + activeBackground.width - rect.x) < 0.5) {
            activeBackground.width += rect.width
          }
          else {
            flushBackground()
            activeBackground = {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height,
              background,
            }
          }
        }
        else if (!cachedBackgroundBand) {
          flushBackground()
        }
        if (this._canRenderDefaultCellAsTextBatch(context, template)) {
          this._appendDefaultCellTextBatch(textBatchBuilders, context)
          this._registerDefaultCellTextSelectionTarget(context)
          continue
        }
        this._renderCell(contentSchema, context, backgroundPainted, textBatchBuilders, template)
      }
      flushBackground()
    })

    this._emitSchema(backgroundSchema)
    this._emitSchema(contentSchema)
    this._emitRowZoneGridBatch(columnRects, gridRowTops, rowHeight)
    this._emitDefaultCellTextBatches(textBatchBuilders)
  }

  /**
   * Рисует плотную сетку отдельными line-batches вместо border на каждой ячейке.
   */
  private _emitRowZoneGridBatch(
    columnRects: Array<VisibleColumnRect<Row>>,
    rowTops: Array<number>,
    rowHeight: number,
  ): void {
    if (columnRects.length === 0 || rowTops.length === 0) {
      return
    }

    const firstColumn = columnRects[0]
    const lastColumn = columnRects[columnRects.length - 1]
    if (!firstColumn || !lastColumn) {
      return
    }

    const x1 = firstColumn.x
    const x2 = lastColumn.x + lastColumn.width
    const y1 = rowTops[0] ?? 0
    const y2 = (rowTops[rowTops.length - 1] ?? y1) + rowHeight
    const horizontalCount = rowTops.length + 1
    const verticalCount = columnRects.length + 1
    const count = horizontalCount + verticalCount
    const batch = this._createEmptyRectBatch(count)
    const color = this._resolveRectBatchColor('#d8e0ea')
    const rowWidth = Math.max(0, x2 - x1)
    const columnHeight = Math.max(0, y2 - y1)

    let index = 0
    const write = (x: number, y: number, width: number, height: number) => {
      batch.x[index] = x
      batch.y[index] = y
      batch.width[index] = width
      batch.height[index] = height
      batch.colors[index * 4] = color[0]
      batch.colors[index * 4 + 1] = color[1]
      batch.colors[index * 4 + 2] = color[2]
      batch.colors[index * 4 + 3] = color[3]
      index += 1
    }

    write(x1, y1, rowWidth, 1)
    for (const y of rowTops) {
      write(x1, y + rowHeight, rowWidth, 1)
    }
    write(x1, y1, 1, columnHeight)
    for (const columnRect of columnRects) {
      write(columnRect.x + columnRect.width, y1, 1, columnHeight)
    }

    this._emitRectBatch(batch)
  }

  /**
   * Создает пустой rect batch заданного размера.
   */
  private _createEmptyRectBatch(count: number): NovaRectBatch {
    return {
      count,
      x: new Float32Array(count),
      y: new Float32Array(count),
      width: new Float32Array(count),
      height: new Float32Array(count),
      colors: new Float32Array(count * 4),
      states: new Float32Array(count),
      revision: this.store.takeDataRevision() + this.invalidation.get('viewport') + this.invalidation.get('zoom') + 1,
      staticRevision: this.store.takeStructureRevision() + this.invalidation.get('columns') + this.invalidation.get('layout') + 1,
    }
  }

  /**
   * Объединяет соседние фоны default cells в row spans.
   */
  private _renderDefaultCellBackgroundSpans(
    schema: NovaSchema,
    contexts: Array<DataTableCellContext<Row>>,
  ): void {
    let active: { x: number, y: number, width: number, height: number, background: string } | null = null

    const flush = () => {
      if (!active) {
        return
      }
      schema.push({
        type: 'rect',
        x: active.x,
        y: active.y,
        width: active.width,
        height: active.height,
        styles: { background: active.background },
      })
      active = null
    }

    for (const context of contexts) {
      if (!this._canBatchDefaultCellBackground(context)) {
        flush()
        continue
      }
      const rect = context.rect
      const background = this._resolveDefaultCellVisualBackground(context)
      if (active
        && active.background === background
        && Math.abs(active.y - rect.y) < 0.5
        && Math.abs(active.height - rect.height) < 0.5
        && Math.abs(active.x + active.width - rect.x) < 0.5) {
        active.width += rect.width
        continue
      }
      flush()
      active = {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        background,
      }
    }

    flush()
  }

  /**
   * Проверяет, можно ли рисовать фон default cell в объединенном row span.
   */
  private _canBatchDefaultCellBackground(context: DataTableCellContext<Row>): boolean {
    return !this._resolveCellTemplate(context)
  }

  /**
   * Возвращает кэшированную фоновую полосу строки для default cells.
   */
  private _resolveRowBackgroundBand(
    columnRects: Array<VisibleColumnRect<Row>>,
    zone: DataTableCellContext<Row>['zone'],
    rowIndex: number,
    rowHeight: number,
  ): DataTableRowBandCacheEntry | null {
    if (!this._canUseRowBackgroundBandCache(zone)) {
      return null
    }
    if (columnRects.length === 0) {
      return null
    }

    const key = this._createRowBackgroundBandCacheKey(columnRects, zone, rowIndex, rowHeight)
    const cached = this._rowBandBackgroundCache.get(key)
    if (cached) {
      cached.createdAt = performance.now()
      return cached
    }

    const baseX = columnRects[0]?.x ?? 0
    const spans: Array<DataTableRowBackgroundBand> = []
    let active: DataTableRowBackgroundBand | null = null

    const flush = () => {
      if (!active) {
        return
      }
      spans.push(active)
      active = null
    }

    for (const columnRect of columnRects) {
      if (this._resolveCellTemplateForColumn(zone, columnRect.column)) {
        flush()
        continue
      }
      const background = this._resolveDefaultCellBackgroundForColumn(zone, columnRect.column, rowIndex)
      const offsetX = columnRect.x - baseX
      if (active
        && active.background === background
        && Math.abs(active.offsetX + active.width - offsetX) < 0.5) {
        active.width += columnRect.width
        continue
      }
      flush()
      active = {
        offsetX,
        width: columnRect.width,
        background,
      }
    }
    flush()

    const entry = {
      spans,
      createdAt: performance.now(),
    }
    this._rowBandBackgroundCache.set(key, entry)
    this._trimRowBandBackgroundCache()
    return entry
  }

  /**
   * Проверяет, можно ли использовать row band cache без изменения визуального поведения.
   */
  private _canUseRowBackgroundBandCache(zone: DataTableCellContext<Row>['zone']): boolean {
    if (this._columnDragState?.active || this._columnDragLayoutMotion.size > 0) {
      return false
    }
    const searchState = this._getRenderViewState().search
    const searchHighlight = searchState.query.highlight ?? 'cell-text'
    if (!this._isHeaderZone(zone) && searchState.query.text && searchHighlightHasCell(searchHighlight)) {
      return false
    }
    return true
  }

  /**
   * Создает ключ row band cache.
   */
  private _createRowBackgroundBandCacheKey(
    columnRects: Array<VisibleColumnRect<Row>>,
    zone: DataTableCellContext<Row>['zone'],
    rowIndex: number,
    rowHeight: number,
  ): string {
    const isHeader = this._isHeaderZone(zone)
    const parity = isHeader ? 0 : rowIndex % 2
    return [
      zone,
      parity,
      Math.round(rowHeight * 10) / 10,
      columnRects.map((rect) => {
        const template = this._resolveCellTemplateForColumn(zone, rect.column) ? 1 : 0
        return `${rect.column.id}:${Math.round(rect.width * 10) / 10}:${rect.column.pinned ?? 'center'}:${template}`
      }).join(','),
    ].join('|')
  }

  /**
   * Добавляет кэшированную фоновую полосу строки в schema.
   */
  private _appendRowBackgroundBand(
    schema: NovaSchema,
    band: DataTableRowBandCacheEntry,
    baseX: number,
    y: number,
    rowHeight: number,
  ): void {
    for (const span of band.spans) {
      schema.push({
        type: 'rect',
        x: baseX + span.offsetX,
        y,
        width: span.width,
        height: rowHeight,
        styles: { background: span.background },
      })
    }
  }

  /**
   * Ограничивает row band cache.
   */
  private _trimRowBandBackgroundCache(): void {
    const limit = 512
    while (this._rowBandBackgroundCache.size > limit) {
      const first = this._rowBandBackgroundCache.keys().next().value as string | undefined
      if (!first) {
        return
      }
      this._rowBandBackgroundCache.delete(first)
    }
  }

  /**
   * Проверяет, можно ли вывести default text cell через retained text batch.
   */
  private _canRenderDefaultCellAsTextBatch(
    context: DataTableCellContext<Row>,
    template: ((context: DataTableCellContext<Row>) => NovaSchema) | undefined = this._resolveCellTemplate(context),
  ): boolean {
    const textOptions = this.props.performance.text
    if (!textOptions || !textOptions.batchDefaultCells) {
      return false
    }
    if (!textOptions.visible) {
      return false
    }
    if (template) {
      return false
    }
    if (context.zone === 'header') {
      return false
    }
    if (context.column.animated) {
      return false
    }
    if (this._columnDragState?.active || this._columnDragLayoutMotion.size > 0) {
      return false
    }
    if (this.props.interaction.motion && this.props.interaction.motion.cells) {
      return false
    }

    const searchState = this._getRenderViewState().search
    const searchHighlight = searchState.query.highlight ?? 'cell-text'
    return !(context.state.searchRanges?.length && searchHighlightHasText(searchHighlight))
  }

  /**
   * Добавляет default text cell в retained text batch.
   */
  private _appendDefaultCellTextBatch(
    builders: Map<string, DataTableTextBatchBuilder>,
    context: DataTableCellContext<Row>,
  ): void {
    const textOptions = this.props.performance.text
    if (textOptions && !textOptions.visible) {
      return
    }

    const { rect, value, column } = context
    const textRect = {
      x: rect.x + 10,
      y: rect.y,
      width: Math.max(0, rect.width - 20),
      height: rect.height,
    }
    const x = textOptions?.skipSubpixelText ? Math.round(textRect.x) : textRect.x
    const y = textOptions?.skipSubpixelText ? Math.round(textRect.y) : textRect.y
    const builder = this._resolveDefaultCellTextBatchBuilder(builders, column.align)

    builder.text.push(String(value ?? ''))
    builder.x.push(x)
    builder.y.push(y)
    builder.width.push(textRect.width)
    builder.height.push(textRect.height)
    builder.clipX.push(x)
    builder.clipY.push(y)
    builder.clipWidth.push(textRect.width)
    builder.clipHeight.push(textRect.height)
    builder.color.push('#263142')
  }

  /**
   * Возвращает builder для default text cells без JSON.stringify на каждую ячейку.
   */
  private _resolveDefaultCellTextBatchBuilder(
    builders: Map<string, DataTableTextBatchBuilder>,
    horizontalAlign: DataTableResolvedColumn<Row>['align'],
  ): DataTableTextBatchBuilder {
    const textOptions = this.props.performance.text
    const fontFamily = this.props.fontFamily ?? 'Inter, Arial, sans-serif'
    const renderMode = textOptions && textOptions.renderMode ? textOptions.renderMode : 'run-atlas'
    const ellipsis = textOptions?.truncate !== 'clip'
    const key = `default:${horizontalAlign}:${fontFamily}:${this._fontSize}:${this._lineHeight}:${ellipsis ? 1 : 0}:${renderMode}`
    const current = builders.get(key)
    if (current) {
      return current
    }

    const next: DataTableTextBatchBuilder = {
      align: {
        horizontal: horizontalAlign,
        vertical: 'middle',
      },
      font: {
        family: fontFamily,
        size: this._fontSize,
        weight: '500',
        style: 'normal',
      },
      lineHeight: this._lineHeight,
      ellipsis,
      clip: true,
      meta: {
        textMode: renderMode,
        textRole: 'ui-label',
        textLod: 'always',
      },
      text: [],
      x: [],
      y: [],
      width: [],
      height: [],
      clipX: [],
      clipY: [],
      clipWidth: [],
      clipHeight: [],
      color: [],
    }
    builders.set(key, next)
    return next
  }

  /**
   * Возвращает builder для одной группы text batch с общим align.
   */
  private _resolveTextBatchBuilder(
    builders: Map<string, DataTableTextBatchBuilder>,
    options: Pick<DataTableTextBatchBuilder, 'align' | 'font' | 'lineHeight' | 'padding' | 'ellipsis' | 'clip' | 'meta'>,
  ): DataTableTextBatchBuilder {
    const key = this._createTextBatchBuilderKey(options)
    const current = builders.get(key)
    if (current) {
      return current
    }

    const next: DataTableTextBatchBuilder = {
      align: options.align,
      font: options.font,
      lineHeight: options.lineHeight,
      padding: options.padding,
      ellipsis: options.ellipsis,
      clip: options.clip,
      meta: options.meta,
      text: [],
      x: [],
      y: [],
      width: [],
      height: [],
      clipX: [],
      clipY: [],
      clipWidth: [],
      clipHeight: [],
      color: [],
    }
    builders.set(key, next)
    return next
  }

  /**
   * Создает ключ группировки retained text batch.
   */
  private _createTextBatchBuilderKey(
    options: Pick<DataTableTextBatchBuilder, 'align' | 'font' | 'lineHeight' | 'padding' | 'ellipsis' | 'clip' | 'meta'>,
  ): string {
    return JSON.stringify({
      align: options.align ?? null,
      font: options.font ?? null,
      lineHeight: options.lineHeight ?? null,
      padding: options.padding ?? null,
      ellipsis: options.ellipsis ?? null,
      clip: options.clip,
      meta: options.meta ?? null,
    })
  }

  /**
   * Отправляет retained text batches после сборки row zone.
   */
  private _emitDefaultCellTextBatches(builders: Map<string, DataTableTextBatchBuilder>): void {
    for (const builder of builders.values()) {
      if (builder.text.length === 0) {
        continue
      }
      const batch: NovaTextBatch = {
        count: builder.text.length,
        text: builder.text,
        x: Float32Array.from(builder.x),
        y: Float32Array.from(builder.y),
        width: Float32Array.from(builder.width),
        height: Float32Array.from(builder.height),
        color: builder.color,
        font: builder.font,
        lineHeight: builder.lineHeight,
        padding: builder.padding,
        align: builder.align,
        ellipsis: builder.ellipsis,
        meta: builder.meta,
        revision: this.store.takeDataRevision() + this.invalidation.get('zoom') + 1,
        staticRevision: this.store.takeStructureRevision() + this.invalidation.get('columns') + 1,
      }
      if (builder.clip) {
        batch.clipX = Float32Array.from(builder.clipX)
        batch.clipY = Float32Array.from(builder.clipY)
        batch.clipWidth = Float32Array.from(builder.clipWidth)
        batch.clipHeight = Float32Array.from(builder.clipHeight)
      }
      this._emitTextBatch(batch)
    }
  }

  /**
   * Нормализует входные данные DataTableRootNode.
   */
  private _normalizeRenderedRow(
    zone: DataTableCellContext<Row>['zone'],
    rowInput: Row | RenderedTableRow<Row>,
    localIndex: number,
    useBodyIndex: boolean,
  ): RenderedTableRow<Row> {
    if (isRenderedRow(rowInput)) {
      return rowInput
    }

    const rowIndex = zone === 'body' && useBodyIndex
      ? this._viewport.rowRange.start + localIndex
      : localIndex
    const rowId = zone === 'header'
      ? '__header__'
      : this._resolveRenderedRowId(zone, rowInput, rowIndex)
    return {
      kind: 'data',
      row: rowInput,
      rowId,
      rowIndex,
      storeIndex: rowIndex,
      zone,
    }
  }

  /**
   * Выполняет отрисовку DataTableRootNode.
   */
  private _renderGroupLikeRow(
    schema: NovaSchema,
    row: RenderedGroupRow<Row>,
    y: number,
    height: number,
    columnRegion: VisibleColumnRegion,
  ): void {
    const rect = this._createRegionRect(columnRegion, y, height)
    if (!rect) {
      return
    }

    const template = row.kind === 'group'
      ? this.props.groupRowTemplate
      : row.kind === 'group-footer'
        ? this.props.groupFooterTemplate
        : this.props.grandFooterTemplate

    if (template) {
      schema.push(...template(this._createGroupTemplateContext(row, rect, false)))
      return
    }

    if (row.kind === 'grand-footer') {
      return
    }
    schema.push(...this._renderDefaultGroupRow(row, rect))
  }

  /**
   * Создает runtime-сущность DataTableRootNode.
   */
  private _createRegionRect(columnRegion: VisibleColumnRegion, y: number, height: number): DataTableCellRect | null {
    if (columnRegion === 'left') {
      if (this._viewport.pinnedLeftWidth <= 0) {
        return null
      }
      return { x: 0, y, width: this._viewport.pinnedLeftWidth, height }
    }
    if (columnRegion === 'right') {
      if (this._viewport.pinnedRightWidth <= 0) {
        return null
      }
      return { x: this.width - this._viewport.pinnedRightWidth, y, width: this._viewport.pinnedRightWidth, height }
    }
    return { x: this._viewport.bodyX, y, width: this._viewport.bodyWidth, height }
  }

  /**
   * Создает runtime-сущность DataTableRootNode.
   */
  private _createGroupTemplateContext(
    row: RenderedGroupRow<Row>,
    rect: DataTableCellRect,
    pinned: boolean,
  ): DataTableGroupTemplateContext<Row> {
    return {
      group: row.group,
      aggregate: row.aggregate,
      rows: row.rows,
      viewport: this._viewport,
      rect,
      zone: pinned ? 'pinned-bottom' : row.zone as DataTableGroupTemplateContext<Row>['zone'],
      state: {
        expanded: row.group?.expanded ?? true,
        hovered: this._hoverActive && this._hoverTarget?.rowId === row.rowId,
        pinned,
      },
      toggle: () => {
        if (row.group) {
          this._toggleGroup(row.group.groupId)
        }
      },
      api: this._api,
    }
  }

  /**
   * Возвращает snapshot view state текущего render-pass без повторного клонирования на каждую ячейку.
   */
  private _getRenderViewState(): DataTableViewState {
    return this._renderViewState ?? this._viewPipeline.getState()
  }

  /**
   * Выполняет отрисовку DataTableRootNode.
   */
  private _renderDefaultGroupRow(row: RenderedGroupRow<Row>, rect: DataTableCellRect): NovaSchema {
    const group = row.group
    const depthOffset = (group?.depth ?? 0) * 14
    const isFooter = row.kind === 'group-footer'
    const label = group
      ? `${isFooter ? 'Total' : group.title}: ${group.label} · ${group.count}`
      : `Total · ${row.rows.length}`
    return [
      {
        type: 'rect',
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        styles: {
          background: isFooter ? '#f8fafc' : '#eef3f8',
          border: { color: '#d8e0ea', width: 1 },
        },
      },
      {
        type: 'text',
        text: `${group && !isFooter ? group.expanded ? '▾ ' : '▸ ' : ''}${label}`,
        x: rect.x + 10 + depthOffset,
        y: rect.y,
        width: Math.max(0, rect.width - 20 - depthOffset),
        height: rect.height,
        styles: {
          color: '#172033',
          font: {
            family: this.props.fontFamily ?? 'Inter, Arial, sans-serif',
            size: this._fontSize,
            weight: isFooter ? '700' : '800',
          },
          lineHeight: this._lineHeight,
          align: { horizontal: 'left', vertical: 'middle' },
          ellipsis: true,
        },
      },
    ]
  }

  /**
   * Создает runtime-сущность DataTableRootNode.
   */
  private _createCellState(
    rect: DataTableCellRect,
    rowId: DataTableRowId,
    rowIndex: number,
    storeIndex: number | undefined,
    columnRect: VisibleColumnRect<Row>,
    zone: DataTableCellContext<Row>['zone'],
  ): DataTableCellContext<Row>['state'] {
    const hover = this._hoverActive ? this._hoverTarget : null
    const selection = this._selectionActive ? this._selection : null
    const viewState = this._getRenderViewState()
    const useRenderIndexes = !!this._renderViewState
    const sortIndex = useRenderIndexes
      ? this._renderSortIndexByColumn.get(columnRect.column.id) ?? -1
      : viewState.sort.findIndex(rule => rule.columnId === columnRect.column.id)
    const filtered = useRenderIndexes
      ? this._renderFilteredColumnIds.has(columnRect.column.id)
      : filterStateHasColumn(viewState.filters, columnRect.column.id)
    const searchHit = this._viewPipeline.getSearchMatchForCell(rowId, columnRect.column.id)
    const searchRowHit = this._viewPipeline.getSearchMatchForRow(rowId)
    const editing = this._editingState
    const columnDrag = this._columnDragState
    const editingActive = !!editing
      && editing.rowId === rowId
      && editing.column.id === columnRect.column.id
      && editing.zone === zone
    const hoverAffectsCells = !!hover && !isGroupInteractionZone(hover.zone)
    const hovered = hoverAffectsCells && hover.zone === zone && hover.rowId === rowId && hover.column.id === columnRect.column.id
    const rowHovered = hoverAffectsCells && hover.zone === zone && hover.rowId === rowId
    const columnHovered = hoverAffectsCells && hover.column.id === columnRect.column.id
    const selectionHit = this._resolveSelectionHit(rowId, rowIndex, columnRect.column.id)
    const selected = selectionHit.selected
    const rowSelected = selectionHit.rowSelected
    const columnSelected = selectionHit.columnSelected
    const activeCell = !!selection?.activeCell
      && selection.activeCell.rowId === rowId
      && selection.activeCell.columnId === columnRect.column.id

    return {
      rect,
      rowIndex,
      viewRowIndex: rowIndex,
      storeIndex,
      columnIndex: columnRect.columnIndex,
      selected,
      selectionActive: !!selection,
      selectionRangeId: selectionHit.rangeId,
      activeCell,
      hovered,
      cellHovered: hovered,
      rowHovered,
      columnHovered,
      cellSelected: selected,
      rowSelected,
      columnSelected,
      hoverAlpha: this.props.hoverAlpha,
      selectionAlpha: this.props.selectionAlpha,
      zoom: this._zoomValue,
      rowScale: this._zoomRowScale,
      headerScale: this._zoomHeaderScale,
      columnScale: this._zoomColumnScale,
      textScale: this._zoomTextScale,
      iconScale: this._zoomIconScale,
      pinnedColumn: columnRect.column.pinned,
      pinnedRow: zone === 'pinned-top' || zone === 'pinned-bottom' ? zone.replace('pinned-', '') as DataTablePinnedRowPosition : undefined,
      sorted: sortIndex >= 0 ? viewState.sort[sortIndex]?.direction : undefined,
      sortPriority: sortIndex >= 0 ? sortIndex : undefined,
      filtered,
      searchMatched: !!searchHit,
      searchActive: !!searchHit && viewState.search.activeIndex === searchHit.index,
      searchRowMatched: !!searchRowHit,
      searchRowActive: !!searchRowHit && viewState.search.activeIndex === searchRowHit.index,
      searchMatchIndex: searchHit?.index,
      searchRanges: searchHit?.match.ranges,
      editing: editingActive,
      editingInvalid: editingActive ? editing.invalid : false,
      editingDirty: editingActive ? editing.dirty : false,
      editingMessage: editingActive ? editing.message : undefined,
      editPending: editingActive ? editing.pending : false,
      editError: editingActive ? editing.error : undefined,
      editRollback: editingActive ? editing.rollback : false,
      editTransactionId: editingActive ? editing.transactionId : undefined,
      dragging: zone === 'header' && !!columnDrag?.active && columnDrag.column.id === columnRect.column.id,
    }
  }

  /**
   * Выполняет отрисовку DataTableRootNode.
   */
  private _renderCell(
    schema: NovaSchema,
    context: DataTableCellContext<Row>,
    defaultBackgroundPainted = false,
    textBatchBuilders?: Map<string, DataTableTextBatchBuilder>,
    resolvedTemplate?: ((context: DataTableCellContext<Row>) => NovaSchema),
  ): void {
    const startIndex = schema.length
    const template = resolvedTemplate ?? this._resolveCellTemplate(context)
    if (context.zone !== 'header' && context.column.animated) {
      this._visibleAnimatedCells = true
    }

    if (template) {
      this._appendCellTemplateSchema(schema, context, template)
      this._applyTextPerformanceHints(schema, startIndex)
      this._applyCellEnterOpacity(schema, context, startIndex)
      this._applyColumnDragCellOpacity(schema, context, startIndex)
      this._extractBatchableTemplateText(schema, context, startIndex, textBatchBuilders)
      this._registerTextSelectionTargets(schema, context, startIndex)
      return
    }

    this._renderDefaultCell(schema, context, defaultBackgroundPainted)
    this._applyTextPerformanceHints(schema, startIndex)
    this._applyCellEnterOpacity(schema, context, startIndex)
    this._applyColumnDragCellOpacity(schema, context, startIndex)
    this._registerTextSelectionTargets(schema, context, startIndex)
  }

  /**
   * Возвращает template для ячейки с учетом header/body precedence.
   */
  private _resolveCellTemplate(context: DataTableCellContext<Row>): ((context: DataTableCellContext<Row>) => NovaSchema) | undefined {
    return this._resolveCellTemplateForColumn(context.zone, context.column)
  }

  /**
   * Возвращает template для пары zone/column с cache на render pass.
   */
  private _resolveCellTemplateForColumn(
    zone: DataTableCellContext<Row>['zone'],
    column: DataTableResolvedColumn<Row>,
  ): ((context: DataTableCellContext<Row>) => NovaSchema) | undefined {
    if (!this._renderViewState) {
      return zone === 'header'
        ? column.headerTemplate ?? this.props.headerTemplate
        : column.cellTemplate ?? this.props.cellTemplate
    }

    const key = `${zone}:${column.id}`
    const cached = this._renderCellTemplateByColumnZone.get(key)
    if (cached !== undefined) {
      return cached || undefined
    }

    const template = zone === 'header'
      ? column.headerTemplate ?? this.props.headerTemplate
      : column.cellTemplate ?? this.props.cellTemplate
    this._renderCellTemplateByColumnZone.set(key, template ?? false)
    return template
  }

  /**
   * Компилирует безопасный tail из text items custom DSL в retained text batch.
   */
  private _extractBatchableTemplateText(
    schema: NovaSchema,
    context: DataTableCellContext<Row>,
    startIndex: number,
    textBatchBuilders?: Map<string, DataTableTextBatchBuilder>,
  ): void {
    const textOptions = this.props.performance.text
    if (!textBatchBuilders || !textOptions || !textOptions.batchDefaultCells || !textOptions.visible) {
      return
    }
    if (this.props.textSelection && this.props.textSelection.enabled) {
      return
    }
    if (context.zone === 'header') {
      return
    }
    if (context.column.animated) {
      return
    }
    if (this._columnDragState?.active || this._columnDragLayoutMotion.size > 0) {
      return
    }
    if (this.props.interaction.motion && this.props.interaction.motion.cells) {
      return
    }

    const length = schema.length - startIndex
    if (length <= 0) {
      return
    }

    let firstTextIndex = -1
    for (let index = startIndex; index < schema.length; index += 1) {
      const item = schema[index]
      if (item?.type === 'text') {
        if (firstTextIndex < 0) {
          firstTextIndex = index
        }
        continue
      }
      if (firstTextIndex >= 0) {
        return
      }
    }
    if (firstTextIndex < 0) {
      return
    }

    const textItems = schema.slice(firstTextIndex)
    for (const item of textItems) {
      if (!this._canCompileSchemaTextItem(item)) {
        return
      }
    }

    for (const item of textItems) {
      this._appendSchemaTextItemToBatch(textBatchBuilders, item)
    }
    schema.splice(firstTextIndex, schema.length - firstTextIndex)
  }

  /**
   * Проверяет, можно ли перенести schema text item в retained batch.
   */
  private _canCompileSchemaTextItem(item: NovaSchema[number]): boolean {
    if (!item || item.type !== 'text') {
      return false
    }
    if (item.active === false) {
      return false
    }
    const candidate = item as { text?: unknown, parser?: unknown, clip?: unknown }
    if (typeof candidate.text !== 'string') {
      return false
    }
    if (candidate.parser) {
      return false
    }
    const clip = candidate.clip
    return clip === undefined || clip === true || (clip !== false && typeof clip === 'object')
  }

  /**
   * Добавляет schema text item в retained text batch builder.
   */
  private _appendSchemaTextItemToBatch(
    builders: Map<string, DataTableTextBatchBuilder>,
    item: NovaSchema[number],
  ): void {
    const textItem = item as Extract<NovaSchema[number], { type: 'text' }>
    const clip = textItem.clip
    const clipRect = clip && typeof clip === 'object'
      ? clip
      : {
          x: textItem.x,
          y: textItem.y,
          width: textItem.width,
          height: textItem.height,
        }
    const builder = this._resolveTextBatchBuilder(builders, {
      align: textItem.styles?.align,
      font: textItem.styles?.font,
      lineHeight: textItem.styles?.lineHeight,
      padding: textItem.styles?.padding,
      ellipsis: textItem.styles?.ellipsis,
      clip: !!clip || textItem.styles?.ellipsis === true,
      meta: textItem.meta,
    })

    builder.text.push(textItem.text)
    builder.x.push(textItem.x)
    builder.y.push(textItem.y)
    builder.width.push(textItem.width)
    builder.height.push(textItem.height)
    builder.clipX.push(clipRect.x)
    builder.clipY.push(clipRect.y)
    builder.clipWidth.push(clipRect.width)
    builder.clipHeight.push(clipRect.height)
    builder.color.push(textItem.styles?.color ?? '#263142')
  }

  /**
   * Добавляет schema пользовательского template с cache по visible cell fragment.
   */
  private _appendCellTemplateSchema(
    schema: NovaSchema,
    context: DataTableCellContext<Row>,
    template: (context: DataTableCellContext<Row>) => NovaSchema,
  ): void {
    if (!this._canUseCellTemplateFragmentCache(context)) {
      this._renderLayerDiagnostics.templateCalls += 1
      schema.push(...template(context))
      return
    }

    const cacheKey = this._createCellTemplateFragmentCacheKey(context, template)
    const cached = this._cellTemplateFragmentCache.get(cacheKey)
    if (cached && Math.abs(cached.width - context.rect.width) < 0.5 && Math.abs(cached.height - context.rect.height) < 0.5) {
      this._renderLayerDiagnostics.templateCacheHits += 1
      this._touchCellTemplateFragmentCache(cached)
      this._appendAbsoluteSchemaFromCellFragment(schema, cached.schema, context.rect)
      return
    }

    this._renderLayerDiagnostics.templateCalls += 1
    this._renderLayerDiagnostics.templateCacheMisses += 1
    const rendered = template(context)
    schema.push(...rendered)
    this._storeCellTemplateFragment(cacheKey, rendered, context.rect)
  }

  /**
   * Проверяет, можно ли cache'ировать template ячейки без изменения поведения.
   */
  private _canUseCellTemplateFragmentCache(context: DataTableCellContext<Row>): boolean {
    const textPerformance = this.props.performance.text
    if (!textPerformance || textPerformance.cache === 'none') {
      return false
    }
    if (context.zone !== 'header' && context.column.animated) {
      return false
    }
    if (this._columnDragState?.active || this._columnDragLayoutMotion.size > 0) {
      return false
    }
    return true
  }

  /**
   * Создает стабильный ключ fragment cache для текущей ячейки.
   */
  private _createCellTemplateFragmentCacheKey(
    context: DataTableCellContext<Row>,
    template: (context: DataTableCellContext<Row>) => NovaSchema,
  ): string {
    return [
      this._getCellTemplateId(template),
      context.zone,
      String(context.rowId),
      context.column.id,
      Math.round(context.rect.width * 10) / 10,
      Math.round(context.rect.height * 10) / 10,
      context.zone === 'header' ? this.invalidation.get('columns') : this.store.takeDataRevision(),
      this.invalidation.get('view'),
      this.invalidation.get('zoom'),
      this._createCellTemplateStateSignature(context),
    ].join('|')
  }

  /**
   * Возвращает короткий id template-функции для cache key.
   */
  private _getCellTemplateId(template: (context: DataTableCellContext<Row>) => NovaSchema): number {
    const current = this._cellTemplateIds.get(template)
    if (current) {
      return current
    }
    const next = this._nextCellTemplateId
    this._nextCellTemplateId += 1
    this._cellTemplateIds.set(template, next)
    return next
  }

  /**
   * Собирает только те state-флаги, которые пользовательский DSL может читать.
   */
  private _createCellTemplateStateSignature(context: DataTableCellContext<Row>): string {
    const state = context.state
    return [
      state.hovered ? 1 : 0,
      state.rowHovered ? 1 : 0,
      state.columnHovered ? 1 : 0,
      state.selected ? 1 : 0,
      state.rowSelected ? 1 : 0,
      state.columnSelected ? 1 : 0,
      state.activeCell ? 1 : 0,
      state.searchMatched ? 1 : 0,
      state.searchActive ? 1 : 0,
      state.searchRowMatched ? 1 : 0,
      state.searchRowActive ? 1 : 0,
      state.editing ? 1 : 0,
      state.editingInvalid ? 1 : 0,
      state.editPending ? 1 : 0,
      state.dragging ? 1 : 0,
      state.sorted ?? '',
      state.sortPriority ?? '',
      state.filtered ? 1 : 0,
      state.searchMatchIndex ?? '',
      state.searchRanges?.map(range => `${range.start}-${range.end}`).join(',') ?? '',
    ].join(':')
  }

  /**
   * Сохраняет schema в координатах ячейки, если fragment не использует внешнюю сцену.
   */
  private _storeCellTemplateFragment(cacheKey: string, schema: NovaSchema, rect: DataTableCellRect): void {
    if (!this._isCellTemplateSchemaLocal(schema, rect)) {
      return
    }
    this._cellTemplateFragmentCache.set(cacheKey, {
      schema: this._createRelativeSchemaForCellFragment(schema, rect),
      width: rect.width,
      height: rect.height,
      createdAt: performance.now(),
    })
    this._trimCellTemplateFragmentCache()
  }

  /**
   * Проверяет, что пользовательский template рисует внутри или около ячейки.
   */
  private _isCellTemplateSchemaLocal(schema: NovaSchema, rect: DataTableCellRect): boolean {
    const margin = Math.max(32, Math.min(96, rect.width))
    const minX = rect.x - margin
    const maxX = rect.x + rect.width + margin
    const minY = rect.y - margin
    const maxY = rect.y + rect.height + margin

    return schema.every((item) => {
      const candidate = item as { x?: unknown, y?: unknown }
      if (typeof candidate.x === 'number' && (candidate.x < minX || candidate.x > maxX)) {
        return false
      }
      if (typeof candidate.y === 'number' && (candidate.y < minY || candidate.y > maxY)) {
        return false
      }
      return true
    })
  }

  /**
   * Переводит absolute schema ячейки в локальные координаты fragment cache.
   */
  private _createRelativeSchemaForCellFragment(schema: NovaSchema, rect: DataTableCellRect): NovaSchema {
    return schema.map((item) => {
      const next = this._cloneSchemaItem(item)
      const positional = next as { x?: unknown, y?: unknown }
      if (typeof positional.x === 'number') {
        positional.x -= rect.x
      }
      if (typeof positional.y === 'number') {
        positional.y -= rect.y
      }
      return next
    })
  }

  /**
   * Создает absolute schema из локального fragment cache.
   */
  private _appendAbsoluteSchemaFromCellFragment(
    target: NovaSchema,
    schema: NovaSchema,
    rect: DataTableCellRect,
  ): void {
    for (const item of schema) {
      const next = this._cloneSchemaItem(item)
      const positional = next as { x?: unknown, y?: unknown }
      if (typeof positional.x === 'number') {
        positional.x += rect.x
      }
      if (typeof positional.y === 'number') {
        positional.y += rect.y
      }
      target.push(next)
    }
  }

  /**
   * Клонирует schema item так, чтобы последующие opacity/text hints не мутировали cache.
   */
  private _cloneSchemaItem<T extends NovaSchema[number]>(item: T): T {
    const source = item as Record<string, any>
    const styles = source.styles && typeof source.styles === 'object'
      ? {
          ...source.styles,
          font: source.styles.font && typeof source.styles.font === 'object' ? { ...source.styles.font } : source.styles.font,
          align: source.styles.align && typeof source.styles.align === 'object' ? { ...source.styles.align } : source.styles.align,
          border: source.styles.border && typeof source.styles.border === 'object' ? { ...source.styles.border } : source.styles.border,
        }
      : source.styles
    const meta = source.meta && typeof source.meta === 'object'
      ? {
          ...source.meta,
          textSelection: source.meta.textSelection && typeof source.meta.textSelection === 'object'
            ? { ...source.meta.textSelection }
            : source.meta.textSelection,
        }
      : source.meta
    return {
      ...source,
      styles,
      meta,
    } as T
  }

  /**
   * Обновляет LRU-порядок fragment cache.
   */
  private _touchCellTemplateFragmentCache(fragment: DataTableCellTemplateFragment): void {
    fragment.createdAt = performance.now()
  }

  /**
   * Ограничивает fragment cache по memory budget и не дает ему расти при длинном scroll.
   */
  private _trimCellTemplateFragmentCache(): void {
    const limit = Math.max(1_000, Math.min(30_000, Math.floor(this.props.performance.memoryBudgetMb * 64)))
    while (this._cellTemplateFragmentCache.size > limit) {
      const first = this._cellTemplateFragmentCache.keys().next().value as string | undefined
      if (!first) {
        return
      }
      this._cellTemplateFragmentCache.delete(first)
    }
  }

  /**
   * Применяет подготовленное состояние DataTableRootNode.
   */
  private _applyTextPerformanceHints(schema: NovaSchema, startIndex: number): void {
    const textOptions = this.props.performance.text
    if (!textOptions) {
      return
    }

    for (let index = startIndex; index < schema.length; index += 1) {
      const item = schema[index]
      if (!item || item.type !== 'text') {
        continue
      }
      if (!textOptions.visible) {
        item.active = false
        continue
      }

      item.meta = {
        ...item.meta,
        textMode: item.meta?.textMode ?? textOptions.renderMode,
        textRole: item.meta?.textRole ?? 'ui-label',
        textLod: item.meta?.textLod ?? 'always',
      }

      if (textOptions.skipSubpixelText) {
        item.x = Math.round(item.x)
        item.y = Math.round(item.y)
      }

      if (textOptions.truncate === 'clip') {
        item.clip = item.clip ?? true
        if (item.styles?.ellipsis) {
          item.styles = {
            ...item.styles,
            ellipsis: false,
          }
        }
      }
    }
  }

  /**
   * Применяет подготовленное состояние DataTableRootNode.
   */
  private _applyColumnDragCellOpacity(
    schema: NovaSchema,
    context: DataTableCellContext<Row>,
    startIndex: number,
  ): void {
    const drag = this._columnDragState
    if (!drag?.active || drag.column.id !== context.column.id) {
      return
    }
    const alpha = context.zone === 'header' ? 0.18 : 0.22
    for (let index = startIndex; index < schema.length; index += 1) {
      const item = schema[index]
      if (!item) {
        continue
      }
      item.styles = item.styles ?? {}
      const currentOpacity = typeof item.styles.opacity === 'number' ? item.styles.opacity : 1
      item.styles.opacity = currentOpacity * alpha
    }
  }

  /**
   * Применяет подготовленное состояние DataTableRootNode.
   */
  private _applyCellEnterOpacity(
    schema: NovaSchema,
    context: DataTableCellContext<Row>,
    startIndex: number,
  ): void {
    const alpha = this._resolveCellEnterAlpha(context)
    if (alpha >= 1) {
      return
    }

    for (let index = startIndex; index < schema.length; index += 1) {
      const item = schema[index]
      if (!item?.styles) {
        continue
      }
      const currentOpacity = typeof item.styles.opacity === 'number' ? item.styles.opacity : 1
      item.styles.opacity = currentOpacity * alpha
    }
  }

  /**
   * Нормализует и возвращает итоговое значение DataTableRootNode.
   */
  private _resolveCellEnterAlpha(context: DataTableCellContext<Row>): number {
    const cellsMotion = this.props.interaction.motion && this.props.interaction.motion.cells
    if (!cellsMotion || cellsMotion.enter === 'none' || context.zone === 'header') {
      return 1
    }
    if (!this.nova.raph.loopEnabled) {
      return 1
    }

    const key = this._createCellKey(context)
    this._nextVisibleCellKeys.add(key)
    if (this._visibleCellKeys.has(key) || performance.now() < this._suppressCellEnterUntil) {
      return 1
    }
    if (!this._cellEnterStartedAt.has(key)) {
      if (this._cellEnterRenderCount >= cellsMotion.maxAnimatedCells) {
        return 1
      }
      this._cellEnterStartedAt.set(key, performance.now() + this._cellEnterRenderCount * cellsMotion.stagger)
      this._cellEnterRenderCount += 1
    }

    const startedAt = this._cellEnterStartedAt.get(key) ?? performance.now()
    const progress = Math.max(0, Math.min(1, (performance.now() - startedAt) / Math.max(1, cellsMotion.duration)))
    if (progress < 1) {
      this.nova.invalidate()
    }
    return progress
  }

  /**
   * Выполняет внутренний шаг finalizeVisibleCellKeys для DataTableRootNode.
   */
  private _finalizeVisibleCellKeys(): void {
    this._visibleCellKeys = this._nextVisibleCellKeys
    for (const key of [...this._cellEnterStartedAt.keys()]) {
      if (!this._visibleCellKeys.has(key)) {
        this._cellEnterStartedAt.delete(key)
      }
    }
  }

  /**
   * Создает runtime-сущность DataTableRootNode.
   */
  private _createCellKey(context: DataTableCellContext<Row>): string {
    return `${context.zone}:${String(context.rowId)}:${context.column.id}`
  }

  /**
   * Добавляет действие в очередь выполнения DataTableRootNode.
   */
  private _queueAnimationLoopSync(): void {
    if (this._animationLoopSyncQueued) {
      return
    }
    this._animationLoopSyncQueued = true
    queueMicrotask(() => {
      this._animationLoopSyncQueued = false
      this._syncAnimationLoop()
    })
  }

  /**
   * Синхронизирует состояние между слоями DataTableRootNode.
   */
  private _syncAnimationLoop(): void {
    if (this.lifecycleState === 'destroyed') {
      return
    }

    if (this._visibleAnimatedCells || this._columnDragState?.active || this._columnDragLayoutMotion.size > 0) {
      if (!this._animationLoopLease) {
        this._animationLoopLease = this.nova.raph.acquireLoop('nova-datatable:animated-cells')
      }
      if (this._visibleAnimatedCells) {
        this._markRenderLayersDirty(['body-animated'])
      }
      if (this._columnDragState?.active || this._columnDragLayoutMotion.size > 0) {
        this._markRenderLayersDirty(DATA_TABLE_RENDER_LAYER_IDS)
      }
      this._visibleAnimatedCells = false
      this.dirty({ render: true })
      this.nova.invalidate()
      return
    }

    this._releaseAnimationLoop()
  }

  /**
   * Выполняет внутренний шаг releaseAnimationLoop для DataTableRootNode.
   */
  private _releaseAnimationLoop(): void {
    this._animationLoopLease?.release()
    this._animationLoopLease = null
  }

  /**
   * Выполняет отрисовку DataTableRootNode.
   */
  private _renderDefaultCell(schema: NovaSchema, context: DataTableCellContext<Row>, backgroundPainted = false): void {
    const { rect, value, column, zone, rowIndex: _rowIndex } = context
    const isHeader = zone === 'header'
    const searchState = this._getRenderViewState().search
    const searchHighlight = searchState.query.highlight ?? 'cell-text'
    const background = this._resolveDefaultCellVisualBackground(context)
    const color = isHeader ? '#172033' : '#263142'
    const text = String(value ?? '')
    const textRect = {
      x: rect.x + 10,
      y: rect.y,
      width: Math.max(0, rect.width - 20),
      height: rect.height,
    }
    const fontSize = this._fontSize
    const fontWeight = isHeader ? '700' : '500'

    if (!backgroundPainted) {
      schema.push({
        type: 'rect',
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        styles: {
          background,
        },
      })
    }

    schema.push({
      type: 'text',
      text,
      ...textRect,
      styles: {
        color,
        font: {
          family: this.props.fontFamily ?? 'Inter, Arial, sans-serif',
          size: fontSize,
          weight: fontWeight,
          style: 'normal',
        },
        lineHeight: this._lineHeight,
        align: {
          horizontal: column.align,
          vertical: 'middle',
        },
        ellipsis: true,
      },
    })

    if (!isHeader && context.state.searchRanges?.length && searchHighlightHasText(searchHighlight)) {
      schema.push(...this._renderDefaultCellSearchTextHighlights(
        text,
        textRect,
        column.align,
        context.state.searchRanges,
        context.state.searchActive,
        searchState.query.highlightColor ?? '#b45309',
        searchState.query.activeHighlightColor ?? '#be123c',
        fontSize,
        fontWeight,
      ))
    }

    if (isHeader && (context.state.sorted || context.state.filtered)) {
      schema.push({
        type: 'text',
        text: `${context.state.sortPriority !== undefined ? context.state.sortPriority + 1 : ''}${context.state.sorted === 'asc' ? '↑' : context.state.sorted === 'desc' ? '↓' : ''}${context.state.filtered ? '•' : ''}`,
        x: rect.x + rect.width - 48,
        y: rect.y,
        width: 24,
        height: rect.height,
        styles: {
          color: context.state.filtered ? '#2563eb' : '#64748b',
          font: {
            family: this.props.fontFamily ?? 'Inter, Arial, sans-serif',
            size: 12,
            weight: '800',
          },
          align: {
            horizontal: 'right',
            vertical: 'middle',
          },
        },
      })
    }
    if (isHeader) {
      schema.push({
        type: 'text',
        text: '...',
        x: rect.x + rect.width - 22,
        y: rect.y,
        width: 16,
        height: rect.height,
        styles: {
          color: '#64748b',
          font: {
            family: this.props.fontFamily ?? 'Inter, Arial, sans-serif',
            size: 12,
            weight: '800',
          },
          align: {
            horizontal: 'right',
            vertical: 'middle',
          },
        },
      })
    }
  }

  /**
   * Регистрирует сущность в runtime-слое DataTableRootNode.
   */
  private _registerTextSelectionTargets(schema: NovaSchema, context: DataTableCellContext<Row>, startIndex: number): void {
    if (!this.props.textSelection || !this.props.textSelection.enabled) {
      return
    }
    if (this._isTextSelectionIndexSuppressed()) {
      return
    }
    if (!this._isTextSelectionZoneEnabled(context.zone)) {
      return
    }

    for (let index = startIndex; index < schema.length; index += 1) {
      const item = schema[index]
      if (!item || item.type !== 'text' || item.active === false || typeof item.text !== 'string' || item.text.length === 0) {
        continue
      }
      const metaSelection = item.meta?.textSelection as { selectable?: boolean, copyable?: boolean, scope?: string } | undefined
      const selectable = this.props.textSelection.mode === 'visible-cells'
        ? true
        : metaSelection?.selectable === true
      if (!selectable) {
        continue
      }

      this._textSelection.register({
        id: `${context.zone}:${String(context.rowId)}:${context.column.id}:${index}`,
        text: item.text,
        rect: {
          x: item.x,
          y: item.y,
          width: item.width,
          height: item.height,
        },
        selectable,
        copyable: metaSelection?.copyable ?? true,
        scope: metaSelection?.scope ?? `${context.zone}:${context.column.id}`,
        ownerId: `${String(context.rowId)}:${context.column.id}`,
        order: context.rowIndex * 100_000 + context.columnIndex * 100 + index,
        context: {
          rowId: context.rowId,
          rowIndex: context.rowIndex,
          columnId: context.column.id,
          columnIndex: context.columnIndex,
          zone: context.zone,
        },
        copyText: item.text,
      })
    }
  }

  /**
   * Регистрирует selectable target для default text batch без schema item.
   */
  private _registerDefaultCellTextSelectionTarget(context: DataTableCellContext<Row>): void {
    if (!this.props.textSelection || !this.props.textSelection.enabled) {
      return
    }
    if (this.props.performance.text && !this.props.performance.text.visible) {
      return
    }
    if (this._isTextSelectionIndexSuppressed()) {
      return
    }
    if (!this._isTextSelectionZoneEnabled(context.zone)) {
      return
    }
    if (this.props.textSelection.mode !== 'visible-cells') {
      return
    }

    const rect = {
      x: context.rect.x + 10,
      y: context.rect.y,
      width: Math.max(0, context.rect.width - 20),
      height: context.rect.height,
    }
    const text = String(context.value ?? '')
    if (!text) {
      return
    }

    this._textSelection.register({
      id: `${context.zone}:${String(context.rowId)}:${context.column.id}:default-text-batch`,
      text,
      rect,
      selectable: true,
      copyable: true,
      scope: `${context.zone}:${context.column.id}`,
      ownerId: `${String(context.rowId)}:${context.column.id}`,
      order: context.rowIndex * 100_000 + context.columnIndex * 100,
      context: {
        rowId: context.rowId,
        rowIndex: context.rowIndex,
        columnId: context.column.id,
        columnIndex: context.columnIndex,
        zone: context.zone,
      },
      copyText: text,
    })
  }

  /**
   * Выполняет внутренний шаг isTextSelectionIndexSuppressed для DataTableRootNode.
   */
  private _isTextSelectionIndexSuppressed(): boolean {
    return !this._textSelectionActive && performance.now() < this._suppressTextSelectionIndexUntil
  }

  /**
   * Выполняет внутренний шаг isTextSelectionZoneEnabled для DataTableRootNode.
   */
  private _isTextSelectionZoneEnabled(zone: DataTableCellContext<Row>['zone']): boolean {
    const options = this.props.textSelection
    if (!options || !options.enabled) {
      return false
    }
    if (zone === 'header') {
      return options.headerText
    }
    if (zone === 'body') {
      return options.cellText
    }
    if (zone === 'pinned-top' || zone === 'pinned-bottom') {
      return options.pinnedRows
    }
    return false
  }

  /**
   * Выполняет отрисовку DataTableRootNode.
   */
  private _renderTextSelectionOverlay(): void {
    if (!this.props.textSelection || !this.props.textSelection.enabled) {
      return
    }
    if (this._isScrollLodActive() && !this._textSelectionActive) {
      return
    }
    const ranges = this._textSelection.getRanges()
    if (ranges.length === 0) {
      return
    }

    const color = this.props.textSelection.selectionColor
    const schema: NovaSchema = ranges.flatMap((item) => {
      const start = Math.max(0, Math.min(item.target.text.length, item.range.start))
      const end = Math.max(start, Math.min(item.target.text.length, item.range.end))
      if (start === end) {
        return []
      }

      const ratioStart = start / Math.max(1, item.target.text.length)
      const ratioEnd = end / Math.max(1, item.target.text.length)
      const x = item.target.rect.x + item.target.rect.width * ratioStart
      const width = Math.max(2, item.target.rect.width * (ratioEnd - ratioStart))
      return [{
        type: 'rect',
        x,
        y: item.target.rect.y,
        width,
        height: item.target.rect.height,
        styles: {
          background: color,
        },
      }]
    })
    this._emitSchema(schema)
  }

  /**
   * Выполняет отрисовку DataTableRootNode.
   */
  private _renderDefaultCellSearchTextHighlights(
    text: string,
    rect: DataTableCellRect,
    align: DataTableResolvedColumn<Row>['align'],
    ranges: Array<{ start: number, end: number }>,
    active: boolean,
    highlightColor: string,
    activeHighlightColor: string,
    fontSize: number,
    fontWeight: string,
  ): NovaSchema {
    const schema: NovaSchema = []
    const textWidth = estimateSearchTextWidth(text, fontSize)
    const originX = align === 'right'
      ? rect.x + rect.width - textWidth
      : align === 'center'
        ? rect.x + Math.max(0, (rect.width - textWidth) / 2)
        : rect.x
    const color = active ? activeHighlightColor : highlightColor
    for (const range of ranges.slice(0, 4)) {
      const start = Math.max(0, Math.min(text.length, range.start))
      const end = Math.max(start, Math.min(text.length, range.end))
      const prefix = text.slice(0, start)
      const part = text.slice(start, end)
      if (!part) {
        continue
      }
      const x = originX + estimateSearchTextWidth(prefix, fontSize)
      schema.push({
        type: 'text',
        text: part,
        x,
        y: rect.y,
        width: Math.min(rect.x + rect.width - x, Math.max(0, estimateSearchTextWidth(part, fontSize) + 2)),
        height: rect.height,
        styles: {
          color,
          font: {
            family: this.props.fontFamily ?? 'Inter, Arial, sans-serif',
            size: fontSize,
            weight: active ? '800' : fontWeight,
            style: 'normal',
          },
          lineHeight: this._lineHeight,
          align: {
            horizontal: 'left',
            vertical: 'middle',
          },
          ellipsis: false,
        },
      })
    }
    return schema
  }

  /**
   * Нормализует и возвращает итоговое значение DataTableRootNode.
   */
  private _resolveDefaultCellBackground(
    context: DataTableCellContext<Row>,
    isHeader: boolean,
    isPinnedRow: boolean,
    rowIndex: number,
  ): string {
    return this._resolveDefaultCellBackgroundForColumn(context.zone, context.column, rowIndex)
  }

  /**
   * Возвращает базовый фон default cell без создания полного cell context.
   */
  private _resolveDefaultCellBackgroundForColumn(
    zone: DataTableCellContext<Row>['zone'],
    column: DataTableResolvedColumn<Row>,
    rowIndex: number,
  ): string {
    const isHeader = this._isHeaderZone(zone)
    const isPinnedRow = zone === 'pinned-top' || zone === 'pinned-bottom'
    const pinnedColumn = !!column.pinned
    if (pinnedColumn && isPinnedRow) {
      return '#fff2c4'
    }
    if (pinnedColumn && isHeader) {
      return '#fff6d8'
    }
    if (pinnedColumn) {
      return '#fffbea'
    }
    if (isPinnedRow) {
      return '#fff8df'
    }
    if (isHeader) {
      return '#eef3f8'
    }
    return rowIndex % 2 === 0 ? '#ffffff' : '#fbfcfe'
  }

  /**
   * Проверяет header zone.
   */
  private _isHeaderZone(zone: DataTableCellContext<Row>['zone']): boolean {
    return zone === 'header'
  }

  /**
   * Возвращает визуальный фон default cell с учетом search/drag states.
   */
  private _resolveDefaultCellVisualBackground(context: DataTableCellContext<Row>): string {
    const isHeader = context.zone === 'header'
    const isPinned = context.zone === 'pinned-top' || context.zone === 'pinned-bottom'
    const searchState = this._getRenderViewState().search
    const searchHighlight = searchState.query.highlight ?? 'cell-text'
    const cellSearchHighlighted = !isHeader
      && context.state.searchMatched
      && searchHighlightHasCell(searchHighlight)

    if (isHeader && context.state.dragging) {
      return '#dbeafe'
    }
    if (cellSearchHighlighted) {
      return context.state.searchActive ? '#fff1f2' : '#fef3c7'
    }
    return this._resolveDefaultCellBackground(context, isHeader, isPinned, context.rowIndex)
  }

  /**
   * Выполняет внутренний шаг visibleColumnRects для DataTableRootNode.
   */
  private _visibleColumnRects(region: VisibleColumnRegion = 'all', animated = true): Array<VisibleColumnRect<Row>> {
    const cacheKey = this._renderViewState
      ? `${this._columnDragState?.active ? 'drag' : 'normal'}:${region}:${animated ? 1 : 0}`
      : ''
    if (cacheKey) {
      const cached = this._renderVisibleColumnRects.get(cacheKey)
      if (cached) {
        return cached
      }
    }

    if (this._columnDragState?.active) {
      const dragRects = this._visibleColumnRectsForDrag(region, animated)
      if (cacheKey) {
        this._renderVisibleColumnRects.set(cacheKey, dragRects)
      }
      return dragRects
    }

    const { left, center, right } = this._renderColumnPartitions ?? this._createColumnPartitions(this._resolvedColumns)
    const rects: Array<VisibleColumnRect<Row>> = []

    if (region === 'all' || region === 'left') {
      let x = 0
      for (const column of left) {
        rects.push({ column, columnIndex: this._columnIndexById.get(column.id) ?? 0, x: x + (animated ? this._resolveColumnDragLayoutOffset(column.id) : 0), width: column.resolvedWidth })
        x += column.resolvedWidth
      }
    }

    if (region === 'all' || region === 'center') {
      let centerOffset = this._viewport.centerColumnOffset
      for (let index = this._viewport.centerColumnRange.start; index < this._viewport.centerColumnRange.end; index += 1) {
        const column = center[index]
        if (!column) {
          continue
        }
        rects.push({
          column,
          columnIndex: this._columnIndexById.get(column.id) ?? 0,
          x: this._viewport.bodyX + centerOffset - this.scrollX + (animated ? this._resolveColumnDragLayoutOffset(column.id) : 0),
          width: column.resolvedWidth,
        })
        centerOffset += column.resolvedWidth
      }
    }

    if (region === 'all' || region === 'right') {
      let x = this.width - this._viewport.pinnedRightWidth
      for (const column of right) {
        rects.push({ column, columnIndex: this._columnIndexById.get(column.id) ?? 0, x: x + (animated ? this._resolveColumnDragLayoutOffset(column.id) : 0), width: column.resolvedWidth })
        x += column.resolvedWidth
      }
    }

    if (cacheKey) {
      this._renderVisibleColumnRects.set(cacheKey, rects)
    }
    return rects
  }

  /**
   * Делит колонки на pinned/center один раз для render pass.
   */
  private _createColumnPartitions(
    columns: Array<DataTableResolvedColumn<Row>>,
  ): DataTableRenderColumnPartitions<Row> {
    const partitions: DataTableRenderColumnPartitions<Row> = {
      left: [],
      center: [],
      right: [],
    }
    for (const column of columns) {
      if (column.pinned === 'left') {
        partitions.left.push(column)
      }
      else if (column.pinned === 'right') {
        partitions.right.push(column)
      }
      else { partitions.center.push(column) }
    }
    return partitions
  }

  /**
   * Выполняет внутренний шаг visibleColumnRectsForDrag для DataTableRootNode.
   */
  private _visibleColumnRectsForDrag(region: VisibleColumnRegion, animated: boolean): Array<VisibleColumnRect<Row>> {
    const columns = this._resolveColumnDragPreviewColumns()
    const left = columns.filter(column => column.pinned === 'left')
    const center = columns.filter(column => !column.pinned)
    const right = columns.filter(column => column.pinned === 'right')
    const rects: Array<VisibleColumnRect<Row>> = []

    if (region === 'all' || region === 'left') {
      let x = 0
      for (const column of left) {
        const animatedX = x + (animated ? this._resolveColumnDragLayoutOffset(column.id) : 0)
        rects.push({ column, columnIndex: this._columnIndexById.get(column.id) ?? 0, x: animatedX, width: column.resolvedWidth })
        x += column.resolvedWidth
      }
    }

    if (region === 'all' || region === 'center') {
      let x = this._viewport.bodyX - this.scrollX
      for (const column of center) {
        const visible = x + column.resolvedWidth >= this._viewport.bodyX && x <= this._viewport.bodyX + this._viewport.bodyWidth
        if (visible) {
          const animatedX = x + (animated ? this._resolveColumnDragLayoutOffset(column.id) : 0)
          rects.push({ column, columnIndex: this._columnIndexById.get(column.id) ?? 0, x: animatedX, width: column.resolvedWidth })
        }
        x += column.resolvedWidth
      }
    }

    if (region === 'all' || region === 'right') {
      let x = this.width - this._viewport.pinnedRightWidth
      for (const column of right) {
        const animatedX = x + (animated ? this._resolveColumnDragLayoutOffset(column.id) : 0)
        rects.push({ column, columnIndex: this._columnIndexById.get(column.id) ?? 0, x: animatedX, width: column.resolvedWidth })
        x += column.resolvedWidth
      }
    }

    return rects
  }

  /**
   * Нормализует и возвращает итоговое значение DataTableRootNode.
   */
  private _resolveColumnDragPreviewColumns(): Array<DataTableResolvedColumn<Row>> {
    const drag = this._columnDragState
    if (!drag?.active) {
      return this._resolvedColumns
    }
    const columns = [...this._resolvedColumns]
    const fromIndex = columns.findIndex(column => column.id === drag.column.id)
    if (fromIndex < 0) {
      return columns
    }
    const [column] = columns.splice(fromIndex, 1)
    if (!column) {
      return columns
    }
    columns.splice(Math.max(0, Math.min(columns.length, drag.targetIndex)), 0, column)
    return columns
  }

  /**
   * Выполняет внутренний шаг captureColumnXById для DataTableRootNode.
   */
  private _captureColumnXById(): Map<string, number> {
    const result = new Map<string, number>()
    for (const rect of this._visibleColumnRects('all', false)) {
      result.set(rect.column.id, rect.x)
    }
    return result
  }

  /**
   * Запускает runtime-процесс DataTableRootNode.
   */
  private _startColumnLayoutMotion(before: Map<string, number>, after: Map<string, number>, draggedColumnId: string): void {
    const now = performance.now()
    for (const [columnId, previousX] of before) {
      if (columnId === draggedColumnId) {
        continue
      }
      const nextX = after.get(columnId)
      if (nextX === undefined) {
        continue
      }
      const delta = previousX - nextX
      if (Math.abs(delta) < 0.5) {
        continue
      }
      this._columnDragLayoutMotion.set(columnId, {
        from: delta,
        startedAt: now,
        duration: 130,
      })
    }
    this._queueAnimationLoopSync()
  }

  /**
   * Нормализует и возвращает итоговое значение DataTableRootNode.
   */
  private _resolveColumnDragLayoutOffset(columnId: string): number {
    const motion = this._columnDragLayoutMotion.get(columnId)
    if (!motion) {
      return 0
    }
    const progress = Math.max(0, Math.min(1, (performance.now() - motion.startedAt) / motion.duration))
    if (progress >= 1) {
      this._columnDragLayoutMotion.delete(columnId)
      return 0
    }
    const eased = 1 - (1 - progress) ** 3
    return motion.from * (1 - eased)
  }

  /**
   * Нормализует и возвращает итоговое значение DataTableRootNode.
   */
  private _resolveColumnDragDropIndicatorX(): number | null {
    const drag = this._columnDragState
    if (!drag?.active) {
      return null
    }
    const rect = this._visibleColumnRects('all', false).find(item => item.column.id === drag.column.id)
    return rect ? rect.x : null
  }

  /**
   * Выполняет отрисовку DataTableRootNode.
   */
  private _renderInteractionOverlay(): void {
    this._renderHoverOverlay()
    this._renderSelectionOverlay()
  }

  /**
   * Выполняет отрисовку DataTableRootNode.
   */
  private _renderSearchOverlay(): void {
    if (this._isScrollLodActive()) {
      return
    }
    const searchState = this._getRenderViewState().search
    const highlight = searchState.query.highlight ?? 'cell-text'
    if (!searchState.query.text || !searchHighlightHasRow(highlight)) {
      return
    }

    const schema: NovaSchema = []
    const activeRowIds = new Set<DataTableRowId>()
    const matchedRowIds = new Set<DataTableRowId>()
    for (let index = 0; index < searchState.matches.length; index += 1) {
      const match = searchState.matches[index]!
      if (match.rowId === undefined) {
        continue
      }
      matchedRowIds.add(match.rowId)
      if (index === searchState.activeIndex) {
        activeRowIds.add(match.rowId)
      }
    }

    for (let rowIndex = this._viewport.rowRange.start; rowIndex < this._viewport.rowRange.end; rowIndex += 1) {
      const viewRow = this._viewPipeline.getViewRowAt(rowIndex)
      if (!viewRow || viewRow.kind !== 'data' || viewRow.rowId === undefined || !matchedRowIds.has(viewRow.rowId)) {
        continue
      }
      const y = this._viewport.bodyY + rowIndex * this.rowHeight - this.scrollY
      const color = activeRowIds.has(viewRow.rowId)
        ? 'rgba(219, 39, 119, 0.10)'
        : 'rgba(37, 99, 235, 0.07)'
      schema.push(...this._createRowOverlayRectsFromRect({ x: this._viewport.bodyX, y, width: this._viewport.bodyWidth, height: this.rowHeight }, color, 1, true))
    }

    if (searchHighlightHasCell(highlight)) {
      const allColumnRects = this._visibleColumnRects('all')
      for (const match of searchState.matches) {
        if (match.columnId === undefined || match.rowIndex < this._viewport.rowRange.start || match.rowIndex >= this._viewport.rowRange.end) {
          continue
        }
        const columnRect = allColumnRects.find(candidate => candidate.column.id === match.columnId)
        if (!columnRect) {
          continue
        }
        const rect = this._clipRectToColumnRegion({
          x: columnRect.x,
          y: this._viewport.bodyY + match.rowIndex * this.rowHeight - this.scrollY,
          width: columnRect.width,
          height: this.rowHeight,
        }, columnRect.column, 'body')
        if (!rect) {
          continue
        }
        const active = searchState.activeIndex >= 0 && searchState.matches[searchState.activeIndex] === match
        schema.push(this._createOverlayRect(rect, active ? 'rgba(244, 63, 94, 0.14)' : 'rgba(250, 204, 21, 0.14)', 1))
      }
    }

    this._emitSchema(schema)
  }

  /**
   * Выполняет отрисовку DataTableRootNode.
   */
  private _renderClipboardFeedbackOverlay(): void {
    const feedback = this._clipboardFeedback
    if (!feedback.visible && feedback.invalid.length === 0) {
      return
    }

    const schema: NovaSchema = []
    if (feedback.invalid.length > 0) {
      schema.push(...this._createClipboardInvalidCellMarkers(feedback.invalid))
    }

    if (feedback.visible) {
      const palette = resolveClipboardFeedbackPalette(feedback.tone)
      const label = `${feedback.message} · ${feedback.committed}/${feedback.skipped}/${feedback.invalid.length}`
      const width = Math.min(Math.max(240, label.length * 7 + 28), Math.max(240, this.width - 24))
      const x = Math.min(Math.max(8, this._viewport.bodyX + 8), Math.max(8, this.width - width - 8))
      const y = Math.min(Math.max(this.headerHeight + 8, this.height - 46), Math.max(8, this.height - 46))

      schema.push(
        {
          type: 'rect',
          x,
          y,
          width,
          height: 34,
          styles: {
            background: palette.background,
            border: { color: palette.border, width: 1 },
            radius: 7,
            opacity: 0.96,
          },
        },
        {
          type: 'rect',
          x: x + 8,
          y: y + 10,
          width: 4,
          height: 14,
          styles: {
            background: palette.accent,
            radius: 4,
          },
        },
        {
          type: 'text',
          text: label,
          x: x + 18,
          y,
          width: Math.max(0, width - 28),
          height: 34,
          styles: {
            color: palette.color,
            font: {
              family: this.props.fontFamily ?? 'Inter, Arial, sans-serif',
              size: Math.max(10, this._fontSize - 1),
              weight: '700',
            },
            lineHeight: this._lineHeight,
            align: { horizontal: 'left', vertical: 'middle' },
            ellipsis: true,
          },
        },
      )
    }

    this._emitSchema(schema)
  }

  /**
   * Создает runtime-сущность DataTableRootNode.
   */
  private _createClipboardInvalidCellMarkers(invalid: Array<DataTablePasteInvalidCell>): NovaSchema {
    const schema: NovaSchema = []
    const columnRects = this._visibleColumnRects('all')

    for (const cell of invalid) {
      if (!cell.columnId || cell.rowIndex < this._viewport.rowRange.start || cell.rowIndex >= this._viewport.rowRange.end) {
        continue
      }
      const columnRect = columnRects.find(candidate => candidate.column.id === cell.columnId)
      if (!columnRect) {
        continue
      }
      const rect = this._clipRectToColumnRegion({
        x: columnRect.x,
        y: this._viewport.bodyY + cell.rowIndex * this.rowHeight - this.scrollY,
        width: columnRect.width,
        height: this.rowHeight,
      }, columnRect.column, 'body')
      if (!rect) {
        continue
      }

      schema.push(
        this._createOverlayRect(rect, 'rgba(248, 113, 113, 0.16)', 1, '#dc2626'),
        {
          type: 'rect',
          x: rect.x + 2,
          y: rect.y + 2,
          width: Math.min(18, Math.max(0, rect.width - 4)),
          height: 3,
          styles: {
            background: '#dc2626',
            radius: 3,
          },
        },
      )
    }

    return schema
  }

  /**
   * Выполняет отрисовку DataTableRootNode.
   */
  private _renderPinnedBottomGroupPanel(): void {
    const template = this.props.pinnedBottomTemplate
    const grouping = this.props.view.grouping
    if (!template || !grouping || !grouping.enabled) {
      return
    }
    if (grouping.footerPlacement !== 'pinned-bottom' && grouping.footerPlacement !== 'both') {
      return
    }

    const rows = this.store.getRows()
    const pinnedRows = this._resolveEffectivePinnedRows()
    const rect = {
      x: this._viewport.bodyX,
      y: Math.max(this._viewport.bodyY, this.height - (pinnedRows.bottom?.length ?? 0) * this.rowHeight - 124),
      width: this._viewport.bodyWidth,
      height: 112,
    }
    if (rect.width <= 0 || rect.height <= 0) {
      return
    }

    const rendered: RenderedGroupRow<Row> = {
      kind: 'grand-footer',
      rowId: '__pinned-bottom-group-panel__',
      rowIndex: -1,
      storeIndex: -1,
      zone: 'grand-footer',
      aggregate: { count: rows.length },
      rows,
    }
    const schema = template(this._createGroupTemplateContext(rendered, rect, true))
    if (schema.length === 0) {
      return
    }

    this._withRenderClip(rect, () => this._emitSchema(schema))
  }

  /**
   * Выполняет отрисовку DataTableRootNode.
   */
  private _renderHoverOverlay(): void {
    this._updateHoverOverlayBatch()
    this.renderer.rects(this._hoverOverlayBatch)
  }

  /**
   * Обновляет retained hover batch без пересборки grid render frame.
   */
  private _updateHoverOverlayBatch(): void {
    const hover = this._hoverTarget
    const options = this.props.interaction.hover
    const schema: NovaSchema = []
    if (!this._resizeState && hover && options && options.mode !== 'none' && this.props.hoverAlpha > 0) {
      const alpha = this.props.hoverAlpha
      if (isGroupInteractionZone(hover.zone)) {
        schema.push(...this._createRowOverlayRects(hover, options.rowColor, alpha, options.pinned))
      }
      else {
        if (modeHasRow(options.mode)) {
          schema.push(...this._createRowOverlayRects(hover, options.rowColor, alpha, options.pinned))
        }
        if (modeHasColumn(options.mode)) {
          schema.push(...this._createColumnOverlayRects(hover, options.columnColor, alpha, options.pinned))
        }
        if (modeHasCell(options.mode) && options.cellColor) {
          const cellRect = this._clipRectToColumnRegion(hover.rect, hover.column, hover.zone)
          if (cellRect) {
            schema.push(this._createOverlayRect(cellRect, options.cellColor, alpha))
          }
        }
      }
    }

    this._writeOverlaySchemaToRectBatch(schema, this._hoverOverlayBatch)
  }

  /**
   * Записывает простые rect overlay в retained batch.
   */
  private _writeOverlaySchemaToRectBatch(schema: NovaSchema, batch: NovaRectBatch): void {
    for (let index = 0; index < batch.count; index += 1) {
      const item = schema[index]
      const colorOffset = index * 4
      if (!item || item.type !== 'rect') {
        batch.x[index] = 0
        batch.y[index] = 0
        batch.width[index] = 0
        batch.height[index] = 0
        batch.colors[colorOffset] = 0
        batch.colors[colorOffset + 1] = 0
        batch.colors[colorOffset + 2] = 0
        batch.colors[colorOffset + 3] = 0
        continue
      }
      const color = parseNovaColor(item.styles?.background, 0x00000000)
      batch.x[index] = item.x
      batch.y[index] = item.y
      batch.width[index] = Math.max(0, item.width)
      batch.height[index] = Math.max(0, item.height)
      batch.colors[colorOffset] = color.r
      batch.colors[colorOffset + 1] = color.g
      batch.colors[colorOffset + 2] = color.b
      batch.colors[colorOffset + 3] = color.a * (item.styles?.opacity ?? 1)
    }
    batch.revision = (batch.revision ?? 0) + 1
    batch.staticRevision = (batch.staticRevision ?? 0) + 1
  }

  /**
   * Выполняет отрисовку DataTableRootNode.
   */
  private _renderSelectionOverlay(): void {
    const selection = this._selection
    if (!selection || this.props.selection === false || !this.props.selection.enabled || this.props.selectionAlpha <= 0) {
      return
    }
    const alpha = this.props.selectionAlpha
    const schema: NovaSchema = []
    for (const range of selection.ranges) {
      schema.push(...this._createSelectionRangeOverlayRects(range, this.props.selection.visuals.fillColor, alpha))
    }
    if (selection.previewRange) {
      schema.push(...this._createSelectionRangeOverlayRects(selection.previewRange, this.props.selection.visuals.previewFillColor, Math.max(alpha, 0.72)))
    }
    const activeCell = selection.activeCell
    if (activeCell) {
      const rect = this._resolveSelectionCellRect(activeCell.rowIndex, activeCell.columnId)
      if (rect) {
        schema.push(this._createOverlayRect(rect, 'rgba(37, 99, 235, 0.03)', 1, this.props.selection.visuals.activeCellBorderColor))
      }
    }
    this._emitSchema(schema)
  }

  /**
   * Выполняет отрисовку DataTableRootNode.
   */
  private _renderInteractionLayer(): void {
    const template = this.props.interactionLayerTemplate
    if (!template) {
      return
    }
    if (this._isScrollLodActive()) {
      return
    }

    const state = this._getInteractionState()
    const hoverTarget = this._resizeState ? null : this._hoverTarget
    const hoverCellRect = hoverTarget && !isGroupInteractionZone(hoverTarget.zone)
      ? this._clipRectToColumnRegion(hoverTarget.rect, hoverTarget.column, hoverTarget.zone)
      : null
    const hoverRects = hoverTarget
      ? isGroupInteractionZone(hoverTarget.zone)
        ? this._createRowRects(hoverTarget, true)
        : [...this._createRowRects(hoverTarget, true), ...(hoverCellRect ? [hoverCellRect] : [])]
      : []
    const schema = template({
      hover: this._resizeState ? null : state.hover,
      selection: state.selection,
      viewport: this._viewport,
      rects: hoverRects,
      state,
    })
    this._emitSchema(schema)
  }

  /**
   * Выполняет отрисовку DataTableRootNode.
   */
  private _renderColumnDragOverlay(): void {
    const drag = this._columnDragState
    if (!drag?.active) {
      return
    }

    const width = drag.column.resolvedWidth
    const x = drag.pointerX - drag.grabOffsetX
    const ghostRect = {
      x,
      y: 0,
      width,
      height: this.height,
    }
    const title = drag.column.title ?? drag.column.id
    const schema: NovaSchema = [
      {
        type: 'rect',
        ...ghostRect,
        styles: {
          background: 'rgba(248, 250, 252, 0.72)',
          opacity: 0.92,
          border: { color: '#2563eb', width: 1 },
        },
      },
      {
        type: 'rect',
        x,
        y: 0,
        width,
        height: this.headerHeight,
        styles: {
          background: 'rgba(219, 234, 254, 0.94)',
          border: { color: '#2563eb', width: 1 },
        },
      },
      {
        type: 'text',
        text: title,
        x: x + 10,
        y: 0,
        width: Math.max(0, width - 20),
        height: this.headerHeight,
        styles: {
          color: '#172033',
          font: {
            family: this.props.fontFamily ?? 'Inter, Arial, sans-serif',
            size: this._fontSize,
            weight: '800',
          },
          lineHeight: this._lineHeight,
          align: { horizontal: drag.column.align, vertical: 'middle' },
          ellipsis: true,
        },
      },
    ]

    const dropX = this._resolveColumnDragDropIndicatorX()
    if (dropX !== null) {
      schema.push({
        type: 'rect',
        x: dropX - 1,
        y: 0,
        width: 2,
        height: this.height,
        styles: {
          background: '#2563eb',
          opacity: 0.88,
        },
      })
    }

    this._emitSchema(schema)
  }

  /**
   * Выполняет отрисовку DataTableRootNode.
   */
  private _renderColumnMenu(): void {
    const menu = this._columnMenuState
    if (!menu) {
      return
    }

    const height = menu.actions.length * menu.itemHeight + 8
    const schema: NovaSchema = [
      {
        type: 'rect',
        x: menu.x,
        y: menu.y,
        width: menu.width,
        height,
        styles: {
          background: '#ffffff',
          opacity: 0.98,
          border: { color: '#cbd5e1', width: 1, radius: 6 },
        },
      },
    ]

    menu.actions.forEach((action, index) => {
      const y = menu.y + 4 + index * menu.itemHeight
      schema.push(
        {
          type: 'rect',
          x: menu.x + 4,
          y,
          width: menu.width - 8,
          height: menu.itemHeight,
          styles: {
            background: index % 2 === 0 ? '#ffffff' : '#f8fafc',
            opacity: action.disabled ? 0.48 : 1,
          },
        },
        {
          type: 'text',
          text: action.label,
          x: menu.x + 12,
          y,
          width: menu.width - 24,
          height: menu.itemHeight,
          styles: {
            color: action.disabled ? '#94a3b8' : '#172033',
            font: {
              family: this.props.fontFamily ?? 'Inter, Arial, sans-serif',
              size: 12,
              weight: '700',
            },
            lineHeight: 16,
            align: { horizontal: 'left', vertical: 'middle' },
            ellipsis: true,
          },
        },
      )
    })

    this._emitSchema(schema)
  }

  /**
   * Выполняет отрисовку DataTableRootNode.
   */
  private _renderTooltipLayer(): void {
    const options = this.props.tooltip
    const target = this._tooltipTarget
    const alpha = this.props.tooltipAlpha
    if (!options || !target || alpha <= 0) {
      return
    }
    if (this._isScrollLodActive()) {
      return
    }

    const cell = this._createCellContext(target)
    if (!cell || cell.zone === 'header') {
      return
    }

    const content = this._resolveTooltipContent(cell, target)
    if (!content) {
      return
    }

    const pointer = this._lastPointerPosition
    const useCursor = options.placement === 'cursor' || options.followCursor
    const x = useCursor && pointer ? pointer.x : target.rect.x
    const y = useCursor && pointer ? pointer.y : target.rect.y
    const schema = NovaUIKit.tooltipSchema({
      x,
      y,
      width: options.width,
      height: options.height,
      open: true,
      trigger: options.modifier === false
        ? 'hover'
        : {
            pointer: 'hover',
            modifier: options.modifier,
          },
      placement: options.placement,
      followCursor: options.followCursor,
      collision: options.collision,
      animation: options.animation,
      content,
      className: options.className,
      contentClassName: options.contentClassName,
      background: options.background,
      color: options.color,
      border: options.border,
      padding: options.padding,
      fontFamily: options.fontFamily,
      fontSize: options.fontSize,
      fontWeight: options.fontWeight,
      lineHeight: options.lineHeight,
      opacity: alpha,
    } satisfies TooltipProps)
    this._applyTooltipMotion(schema, alpha)
    this._emitSchema(schema)
  }

  /**
   * Применяет подготовленное состояние DataTableRootNode.
   */
  private _applyTooltipMotion(schema: NovaSchema, alpha: number): void {
    const offsetY = Math.round((1 - alpha) * 5)
    for (const item of schema) {
      const shape = item as Record<string, any>
      shape.y = Number(shape.y ?? 0) + offsetY
      if (!shape.styles) {
        continue
      }
      const currentOpacity = typeof shape.styles.opacity === 'number' ? shape.styles.opacity : 1
      shape.styles.opacity = currentOpacity * alpha
    }
  }

  /**
   * Нормализует и возвращает итоговое значение DataTableRootNode.
   */
  private _resolveTooltipContent(
    cell: DataTableCellContext<Row>,
    target: DataTableInteractionTarget<Row>,
  ): TooltipContent | null {
    const columnTooltip = cell.column.tooltip
    if (columnTooltip === false) {
      return null
    }
    if (typeof columnTooltip === 'function') {
      return columnTooltip(cell) ?? null
    }
    if (columnTooltip) {
      return columnTooltip
    }

    const options = this.props.tooltip
    if (!options) {
      return null
    }
    const custom = options.content?.({
      cell,
      target,
      viewport: this._viewport,
      store: this.store,
      api: this._api,
    } satisfies DataTableTooltipContext<Row>)
    if (custom) {
      return custom
    }
    if (!options.defaultContent) {
      return null
    }

    const title = cell.column.title ?? cell.column.id
    const value = cell.value === null || cell.value === undefined ? 'empty' : String(cell.value)
    return {
      markdown: `**${escapeTooltipMarkdown(title)}**\n${escapeTooltipMarkdown(value)}\nRow ${cell.rowIndex + 1} · Column ${cell.columnIndex + 1}`,
    }
  }

  /**
   * Создает runtime-сущность DataTableRootNode.
   */
  private _createRowOverlayRects(
    target: DataTableInteractionTarget<Row>,
    color: string,
    opacity: number,
    includePinned: boolean,
  ): NovaSchema {
    return this._createRowRects(target, includePinned).map(rect => this._createOverlayRect(rect, color, opacity))
  }

  /**
   * Создает runtime-сущность DataTableRootNode.
   */
  private _createSelectionRangeOverlayRects(
    range: DataTableSelectionRange,
    color: string,
    opacity: number,
  ): NovaSchema {
    const schema: NovaSchema = []
    const startRow = Math.max(this._viewport.rowRange.start, range.startRowIndex ?? this._viewport.rowRange.start)
    const endRow = Math.min(this._viewport.rowRange.end - 1, range.endRowIndex ?? this._viewport.rowRange.end - 1)
    if (endRow < startRow) {
      return schema
    }

    if (range.unit === 'row') {
      for (let rowIndex = startRow; rowIndex <= endRow; rowIndex += 1) {
        const y = this._viewport.bodyY + rowIndex * this.rowHeight - this.scrollY
        schema.push(...this._createRowOverlayRectsFromRect({ x: this._viewport.bodyX, y, width: this._viewport.bodyWidth, height: this.rowHeight }, color, opacity, true, 'body'))
      }
      return schema
    }

    const columnIds = range.columnIds?.length ? range.columnIds : this._normalizeSelectionColumns(range)
    if (range.unit === 'column') {
      for (const columnId of columnIds) {
        const columnRect = this._visibleColumnRects().find(item => item.column.id === columnId)
        if (!columnRect) {
          continue
        }
        const rect = this._clipRectToColumnRegion({
          x: columnRect.x,
          y: this._viewport.bodyY,
          width: columnRect.width,
          height: this._viewport.bodyHeight,
        }, columnRect.column, 'body')
        if (rect) {
          schema.push(this._createOverlayRect(rect, color, opacity))
        }
      }
      return schema
    }

    const visibleColumns = this._visibleColumnRects().filter(item => columnIds.includes(item.column.id))
    for (let rowIndex = startRow; rowIndex <= endRow; rowIndex += 1) {
      const y = this._viewport.bodyY + rowIndex * this.rowHeight - this.scrollY
      for (const columnRect of visibleColumns) {
        const columnClippedRect = this._clipRectToColumnRegion({
          x: columnRect.x,
          y,
          width: columnRect.width,
          height: this.rowHeight,
        }, columnRect.column, 'body')
        const rect = columnClippedRect ? this._clipRectToVerticalRegion(columnClippedRect, 'body') : null
        if (rect) {
          schema.push(this._createOverlayRect(rect, color, opacity))
        }
      }
    }
    return schema
  }

  /**
   * Нормализует и возвращает итоговое значение DataTableRootNode.
   */
  private _resolveSelectionCellRect(rowIndex: number, columnId: string): DataTableCellRect | null {
    if (rowIndex < this._viewport.rowRange.start || rowIndex >= this._viewport.rowRange.end) {
      return null
    }
    const columnRect = this._visibleColumnRects().find(item => item.column.id === columnId)
    if (!columnRect) {
      return null
    }
    const columnClippedRect = this._clipRectToColumnRegion({
      x: columnRect.x,
      y: this._viewport.bodyY + rowIndex * this.rowHeight - this.scrollY,
      width: columnRect.width,
      height: this.rowHeight,
    }, columnRect.column, 'body')
    return columnClippedRect ? this._clipRectToVerticalRegion(columnClippedRect, 'body') : null
  }

  /**
   * Создает runtime-сущность DataTableRootNode.
   */
  private _createRowOverlayRectsFromRect(
    rect: DataTableCellRect,
    color: string,
    opacity: number,
    includePinned: boolean,
    zone: DataTableCellContext<Row>['zone'] = 'body',
  ): NovaSchema {
    const clippedRect = this._clipRectToVerticalRegion(rect, zone)
    if (!clippedRect) {
      return []
    }

    const segments: Array<DataTableCellRect> = []
    if (includePinned && this._viewport.pinnedLeftWidth > 0) {
      segments.push({ x: 0, y: clippedRect.y, width: this._viewport.pinnedLeftWidth, height: clippedRect.height })
    }
    segments.push({ x: this._viewport.bodyX, y: clippedRect.y, width: this._viewport.bodyWidth, height: clippedRect.height })
    if (includePinned && this._viewport.pinnedRightWidth > 0) {
      segments.push({
        x: this.width - this._viewport.pinnedRightWidth,
        y: clippedRect.y,
        width: this._viewport.pinnedRightWidth,
        height: clippedRect.height,
      })
    }
    return segments.map(segment => this._createOverlayRect(segment, color, opacity))
  }

  /**
   * Создает runtime-сущность DataTableRootNode.
   */
  private _createColumnOverlayRects(
    target: DataTableInteractionTarget<Row>,
    color: string,
    opacity: number,
    includePinned: boolean,
  ): NovaSchema {
    const columnPinned = target.column.pinned
    if (columnPinned && !includePinned) {
      return []
    }

    const visibleRect = this._clipRectToColumnRegion(target.rect, target.column)
    if (!visibleRect) {
      return []
    }
    const top = 0
    const height = this.height
    const rect = {
      x: visibleRect.x,
      y: top,
      width: visibleRect.width,
      height,
    }
    return [this._createOverlayRect(rect, color, opacity)]
  }

  /**
   * Создает runtime-сущность DataTableRootNode.
   */
  private _createRowRects(target: DataTableInteractionTarget<Row>, includePinned: boolean): Array<DataTableCellRect> {
    const rowRect = this._clipRectToVerticalRegion(target.rect, target.zone)
    if (!rowRect) {
      return []
    }

    const segments: Array<DataTableCellRect> = []
    if (includePinned && this._viewport.pinnedLeftWidth > 0) {
      segments.push({ x: 0, y: rowRect.y, width: this._viewport.pinnedLeftWidth, height: rowRect.height })
    }
    segments.push({
      x: this._viewport.bodyX,
      y: rowRect.y,
      width: this._viewport.bodyWidth,
      height: rowRect.height,
    })
    if (includePinned && this._viewport.pinnedRightWidth > 0) {
      segments.push({
        x: this.width - this._viewport.pinnedRightWidth,
        y: rowRect.y,
        width: this._viewport.pinnedRightWidth,
        height: rowRect.height,
      })
    }
    return segments
  }

  /**
   * Выполняет внутренний шаг clipRectToColumnRegion для DataTableRootNode.
   */
  private _clipRectToColumnRegion(
    rect: DataTableCellRect,
    column: DataTableResolvedColumn<Row>,
    zone?: DataTableCellContext<Row>['zone'],
  ): DataTableCellRect | null {
    const minX = column.pinned === 'left'
      ? 0
      : column.pinned === 'right'
        ? this.width - this._viewport.pinnedRightWidth
        : this._viewport.bodyX
    const maxX = column.pinned === 'left'
      ? this._viewport.pinnedLeftWidth
      : column.pinned === 'right'
        ? this.width
        : this._viewport.bodyX + this._viewport.bodyWidth
    const x = Math.max(minX, rect.x)
    const right = Math.min(maxX, rect.x + rect.width)
    if (right <= x) {
      return null
    }
    const columnRect = {
      x,
      y: rect.y,
      width: right - x,
      height: rect.height,
    }
    return zone ? this._clipRectToVerticalRegion(columnRect, zone) : columnRect
  }

  /**
   * Выполняет внутренний шаг clipRectToVerticalRegion для DataTableRootNode.
   */
  private _clipRectToVerticalRegion(
    rect: DataTableCellRect,
    zone: DataTableCellContext<Row>['zone'],
  ): DataTableCellRect | null {
    const bounds = this._resolveVerticalRegionBounds(zone)
    const y = Math.max(bounds.top, rect.y)
    const bottom = Math.min(bounds.bottom, rect.y + rect.height)
    if (bottom <= y) {
      return null
    }
    return {
      x: rect.x,
      y,
      width: rect.width,
      height: bottom - y,
    }
  }

  /**
   * Нормализует и возвращает итоговое значение DataTableRootNode.
   */
  private _resolveVerticalRegionBounds(zone: DataTableCellContext<Row>['zone']): { top: number, bottom: number } {
    if (zone === 'header') {
      return { top: 0, bottom: this.headerHeight }
    }
    if (zone === 'pinned-top') {
      return { top: this.headerHeight, bottom: this._viewport.bodyY }
    }
    if (zone === 'pinned-bottom') {
      const bottomRows = this._resolveEffectivePinnedRows().bottom?.length ?? 0
      return { top: this.height - bottomRows * this.rowHeight, bottom: this.height }
    }
    return {
      top: this._viewport.bodyY,
      bottom: this._viewport.bodyY + this._viewport.bodyHeight,
    }
  }

  /**
   * Создает runtime-сущность DataTableRootNode.
   */
  private _createOverlayRect(
    rect: DataTableCellRect,
    background: string,
    opacity: number,
    borderColor?: string,
  ): NovaSchema[number] {
    return {
      type: 'rect',
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      styles: {
        background,
        opacity,
        border: borderColor ? { color: borderColor, width: 1 } : undefined,
      },
    }
  }

  /**
   * Обновляет runtime-состояние DataTableRootNode.
   */
  private _updateHover(target: DataTableInteractionTarget<Row> | null): void {
    const previous = this._hoverActive ? this._hoverTarget : null
    if (sameInteractionTarget(previous, target)) {
      if (previous && target && !sameInteractionGeometry(previous, target)) {
        this._hoverTarget = target
        this._syncTooltipTarget(target)
        this._refresh(['hover'])
      }
      return
    }

    if (previous) {
      const previousContext = this._createCellContext(previous)
      if (previousContext) {
        this.props.onCellLeave?.(previousContext)
      }
    }

    this._hoverTarget = target
    this._hoverActive = target !== null
    this._syncTooltipTarget(target)
    if (target) {
      const context = this._createCellContext(target)
      if (context) {
        this.props.onCellEnter?.(context)
      }
      this._animateInteractionAlpha('hoverAlpha', 1)
    }
    else {
      this._animateInteractionAlpha('hoverAlpha', 0)
    }
    this._refresh(['hover'])
  }

  /**
   * Очищает накопленное состояние DataTableRootNode.
   */
  private _clearHover(): void {
    this._updateHover(null)
  }

  /**
   * Обновляет hover target после изменения viewport без ожидания нового mousemove.
   */
  private _syncHoverAfterViewportChange(): void {
    if (!this._hoverActive || !this._lastPointerPosition) {
      return
    }

    const target = this._resolveInteractionTargetAt(
      this._lastPointerPosition.x,
      this._lastPointerPosition.y,
    )
    this._updateHover(target)
    this._syncTooltipTarget(target)
  }

  /**
   * Синхронизирует состояние между слоями DataTableRootNode.
   */
  private _syncTooltipTarget(target: DataTableInteractionTarget<Row> | null = this._hoverActive ? this._hoverTarget : null): void {
    if (!this._canShowTooltipForTarget(target)) {
      this._scheduleTooltipClose()
      return
    }

    if (!target) {
      return
    }
    const changed = !sameInteractionTarget(this._tooltipTarget, target)
    this._tooltipTarget = target
    if (changed) {
      this.tooltipAlpha = 0
    }
    if (!changed && this._tooltipOpenTimer) {
      return
    }
    if (this.props.tooltipAlpha >= 1 && !changed) {
      this._refresh(['interaction'])
      return
    }
    this._scheduleTooltipOpen(target)
  }

  /**
   * Выполняет внутренний шаг canShowTooltipForTarget для DataTableRootNode.
   */
  private _canShowTooltipForTarget(target: DataTableInteractionTarget<Row> | null): boolean {
    const options = this.props.tooltip
    if (!options || !options.enabled || !target) {
      return false
    }
    if (target.zone === 'header' || isGroupInteractionZone(target.zone)) {
      return false
    }
    if (!this._isTooltipModifierSatisfied()) {
      return false
    }
    return this._createCellContext(target) !== null
  }

  /**
   * Планирует отложенное выполнение DataTableRootNode.
   */
  private _scheduleTooltipOpen(target: DataTableInteractionTarget<Row>): void {
    this._clearTooltipTimers()
    const delay = this.props.tooltip ? this.props.tooltip.delay : 0
    if (delay <= 0) {
      this._openTooltip(target)
      return
    }
    this._tooltipOpenTimer = setTimeout(() => this._openTooltip(target), delay)
  }

  /**
   * Открывает presentation-состояние DataTableRootNode.
   */
  private _openTooltip(target: DataTableInteractionTarget<Row>): void {
    if (!this._canShowTooltipForTarget(target)) {
      return
    }
    this._tooltipTarget = target
    this._animateTooltipAlpha(1)
    this._refresh(['interaction'])
  }

  /**
   * Планирует отложенное выполнение DataTableRootNode.
   */
  private _scheduleTooltipClose(): void {
    if (!this._tooltipTarget && this.props.tooltipAlpha <= 0 && !this._tooltipOpenTimer) {
      return
    }
    this._clearTooltipOpenTimer()
    const delay = this.props.tooltip ? this.props.tooltip.hideDelay : 0
    if (delay <= 0) {
      this._closeTooltip()
      return
    }
    this._clearTooltipHideTimer()
    this._tooltipHideTimer = setTimeout(() => this._closeTooltip(), delay)
  }

  /**
   * Закрывает presentation-состояние DataTableRootNode.
   */
  private _closeTooltip(): void {
    this._clearTooltipTimers()
    this._animateTooltipAlpha(0)
    this._refresh(['interaction'])
  }

  /**
   * Выполняет внутренний шаг animateTooltipAlpha для DataTableRootNode.
   */
  private _animateTooltipAlpha(value: number): void {
    const options = this.props.tooltip
    const animation = options && options.animation
    if (!options || animation === false) {
      this.tooltipAlpha = value
      return
    }

    this.nova.motion.to(this, { tooltipAlpha: value }, {
      duration: animation.duration,
      easing: animation.easing as never,
      overwrite: true,
    })
  }

  /**
   * Очищает накопленное состояние DataTableRootNode.
   */
  private _clearTooltipTimers(): void {
    this._clearTooltipOpenTimer()
    this._clearTooltipHideTimer()
  }

  /**
   * Очищает накопленное состояние DataTableRootNode.
   */
  private _clearTooltipOpenTimer(): void {
    if (!this._tooltipOpenTimer) {
      return
    }
    clearTimeout(this._tooltipOpenTimer)
    this._tooltipOpenTimer = null
  }

  /**
   * Очищает накопленное состояние DataTableRootNode.
   */
  private _clearTooltipHideTimer(): void {
    if (!this._tooltipHideTimer) {
      return
    }
    clearTimeout(this._tooltipHideTimer)
    this._tooltipHideTimer = null
  }

  /**
   * Выполняет внутренний шаг trackTooltipModifiers для DataTableRootNode.
   */
  private _trackTooltipModifiers(event: MouseEvent | WheelEvent): void {
    const previous = this._isTooltipModifierSatisfied()
    this._tooltipModifiers.ctrl = event.ctrlKey
    this._tooltipModifiers.meta = event.metaKey
    this._tooltipModifiers.shift = event.shiftKey
    this._tooltipModifiers.alt = event.altKey
    if (previous !== this._isTooltipModifierSatisfied()) {
      this._syncTooltipTarget()
    }
  }

  /**
   * Обновляет runtime-состояние DataTableRootNode.
   */
  private _updateTooltipModifierFromKey(event: KeyboardEvent, pressed: boolean): boolean {
    const previous = this._isTooltipModifierSatisfied()
    if (event.key === 'Control') {
      this._tooltipModifiers.ctrl = pressed
    }
    else if (event.key === 'Meta') {
      this._tooltipModifiers.meta = pressed
    }
    else if (event.key === 'Shift') {
      this._tooltipModifiers.shift = pressed
    }
    else if (event.key === 'Alt') {
      this._tooltipModifiers.alt = pressed
    }
    else { return false }

    return previous !== this._isTooltipModifierSatisfied()
  }

  /**
   * Выполняет внутренний шаг isTooltipModifierSatisfied для DataTableRootNode.
   */
  private _isTooltipModifierSatisfied(): boolean {
    const options = this.props.tooltip
    if (!options || options.modifier === false) {
      return true
    }
    return this._tooltipModifiers[options.modifier]
  }

  /**
   * Обновляет runtime-состояние DataTableRootNode.
   */
  private _updateSelection(target: DataTableInteractionTarget<Row>, event?: MouseEvent): void {
    if (!this._isSelectableTarget(target)) {
      return
    }
    const options = this.props.selection
    if (!options || !options.enabled || options.mode === 'none') {
      return
    }

    const anchor = this._createSelectionAnchor(target)
    if (!anchor) {
      return
    }
    const unit = this._resolveSelectionUnit(target)
    if (!this._isSelectionUnitAllowed(unit)) {
      return
    }

    const toggle = this._isSelectionToggleEvent(event)
    const range = !!event?.shiftKey && options.gestures.shiftRange && this._selection?.anchor
    if (range) {
      this._selectRange(this._createSelectionRange(this._selection!.anchor!, anchor, unit), {
        append: options.cardinality === 'multiple' && !options.behavior.clearOnPlainClick,
        focus: true,
      })
      return
    }

    const nextRange = this._createSelectionRange(anchor, anchor, unit)
    this._applySelectionRange(nextRange, {
      append: options.cardinality === 'multiple' && (toggle || !options.behavior.clearOnPlainClick),
      toggle,
      focus: true,
    }, anchor)
  }

  /**
   * Обновляет состояние выбора DataTableRootNode.
   */
  private _selectCell(rowId: DataTableRowId, columnId: string, options: DataTableSelectionUpdateOptions = {}): void {
    const column = this._resolvedColumns.find(item => item.id === columnId)
    if (!column) {
      return
    }
    const rowIndex = this._findViewRowIndexById(rowId)
    if (rowIndex === undefined) {
      return
    }
    const anchor = { rowId, rowIndex, columnId, columnIndex: this._resolvedColumns.indexOf(column) }
    this._applySelectionRange(this._createSelectionRange(anchor, anchor, 'cell'), options, anchor)
    if (options.scrollIntoView) {
      this._scrollCellIntoView(rowIndex, column)
    }
  }

  /**
   * Обновляет состояние выбора DataTableRootNode.
   */
  private _selectRow(rowId: DataTableRowId, options: DataTableSelectionUpdateOptions = {}): void {
    const rowIndex = this._findViewRowIndexById(rowId)
    if (rowIndex === undefined) {
      return
    }
    const firstColumn = this._resolvedColumns[0]
    if (!firstColumn) {
      return
    }
    const anchor = { rowId, rowIndex, columnId: firstColumn.id, columnIndex: 0 }
    this._applySelectionRange(this._createSelectionRange(anchor, anchor, 'row'), options, anchor)
  }

  /**
   * Обновляет состояние выбора DataTableRootNode.
   */
  private _selectColumn(columnId: string, options: DataTableSelectionUpdateOptions = {}): void {
    const columnIndex = this._resolvedColumns.findIndex(item => item.id === columnId)
    if (columnIndex < 0) {
      return
    }
    const rowId = this._viewPipeline.getRowIdAt(this._viewport.rowRange.start) ?? this.store.getRowIdAt(0) ?? 0
    const anchor = { rowId, rowIndex: this._viewport.rowRange.start, columnId, columnIndex }
    this._applySelectionRange(this._createSelectionRange(anchor, anchor, 'column'), options, anchor)
  }

  /**
   * Обновляет состояние выбора DataTableRootNode.
   */
  private _selectRange(range: DataTableSelectionRange, options: DataTableSelectionUpdateOptions = {}): void {
    this._applySelectionRange(this._normalizeSelectionRange(range), options)
  }

  /**
   * Фокусирует конкретную ячейку по rowId + columnId.
   */
  private _focusCell(rowId: DataTableRowId, columnId: string): boolean {
    this._selectCell(rowId, columnId, { focus: true, scrollIntoView: true })
    const active = this._selection?.activeCell
    return !!active
      && active.rowId === rowId
      && active.columnId === columnId
  }

  /**
   * Перемещает active cell и при необходимости расширяет selection.
   */
  private _moveActiveCell(direction: DataTableActiveCellDirection, options: { extend?: boolean } = {}): boolean {
    const current = this._resolveActiveCellForNavigation()
    if (!current) {
      return false
    }
    const target = this._resolveNavigationTarget(current, direction)
    if (!target) {
      return false
    }

    if (options.extend && this._selection?.anchor) {
      this._selectRange(this._createSelectionRange(this._selection.anchor, target, 'cell'), {
        append: false,
        focus: true,
        scrollIntoView: true,
      })
    }
    else {
      this._applySelectionRange(this._createSelectionRange(target, target, 'cell'), {
        append: false,
        focus: true,
      }, target)
    }

    const column = this._resolvedColumns[target.columnIndex]
    if (column) {
      this._scrollCellIntoView(target.rowIndex, column)
    }
    return true
  }

  /**
   * Выбирает допустимый полный диапазон через Ctrl/Cmd+A.
   */
  private _selectAllByKeyboard(): boolean {
    if (this.props.selection === false || !this.props.selection.enabled || this._resolvedColumns.length === 0 || this._viewPipeline.rowCount === 0) {
      return false
    }

    const firstRow = this._resolveNavigableRowIndex(0, 1)
    const lastRow = this._resolveNavigableRowIndex(this._viewPipeline.rowCount - 1, -1)
    if (firstRow === undefined || lastRow === undefined) {
      return false
    }

    const firstColumn = this._resolvedColumns[0]
    const lastColumn = this._resolvedColumns[this._resolvedColumns.length - 1]
    if (!firstColumn || !lastColumn) {
      return false
    }

    const start: DataTableSelectionAnchor = {
      rowId: this._viewPipeline.getRowIdAt(firstRow) ?? firstRow,
      rowIndex: firstRow,
      columnId: firstColumn.id,
      columnIndex: 0,
    }
    const end: DataTableSelectionAnchor = {
      rowId: this._viewPipeline.getRowIdAt(lastRow) ?? lastRow,
      rowIndex: lastRow,
      columnId: lastColumn.id,
      columnIndex: this._resolvedColumns.length - 1,
    }
    const mode = this.props.selection.mode
    const unit: DataTableSelectionUnit = mode === 'row'
      ? 'row'
      : mode === 'column'
        ? 'column'
        : 'cell'
    this._applySelectionRange(this._createSelectionRange(start, end, unit), { focus: true }, start)
    return true
  }

  /**
   * Возвращает active cell или первый видимый data cell.
   */
  private _resolveActiveCellForNavigation(): DataTableSelectionAnchor | null {
    if (this._selection?.activeCell) {
      return this._selection.activeCell
    }

    const rowIndex = this._resolveNavigableRowIndex(this._viewport.rowRange.start, 1)
    const column = this._resolvedColumns[0]
    if (rowIndex === undefined || !column) {
      return null
    }
    return {
      rowId: this._viewPipeline.getRowIdAt(rowIndex) ?? rowIndex,
      rowIndex,
      columnId: column.id,
      columnIndex: 0,
    }
  }

  /**
   * Считает следующий target для keyboard navigation.
   */
  private _resolveNavigationTarget(
    current: DataTableSelectionAnchor,
    direction: DataTableActiveCellDirection,
  ): DataTableSelectionAnchor | null {
    let rowIndex = current.rowIndex
    let columnIndex = current.columnIndex
    const pageRows = Math.max(1, Math.floor(this._viewport.bodyHeight / this.rowHeight) - 1)

    if (direction === 'up') {
      rowIndex -= 1
    }
    else if (direction === 'down') {
      rowIndex += 1
    }
    else if (direction === 'page-up') {
      rowIndex -= pageRows
    }
    else if (direction === 'page-down') {
      rowIndex += pageRows
    }
    else if (direction === 'left') {
      columnIndex -= 1
    }
    else if (direction === 'right') {
      columnIndex += 1
    }
    else if (direction === 'home') {
      columnIndex = 0
    }
    else if (direction === 'end') {
      columnIndex = this._resolvedColumns.length - 1
    }

    rowIndex = clampInteger(rowIndex, 0, Math.max(0, this._viewPipeline.rowCount - 1))
    columnIndex = clampInteger(columnIndex, 0, Math.max(0, this._resolvedColumns.length - 1))
    const rowDirection = rowIndex >= current.rowIndex ? 1 : -1
    const nextRowIndex = this._resolveNavigableRowIndex(rowIndex, rowDirection)
    const column = this._resolvedColumns[columnIndex]
    if (nextRowIndex === undefined || !column) {
      return null
    }

    return {
      rowId: this._viewPipeline.getRowIdAt(nextRowIndex) ?? nextRowIndex,
      rowIndex: nextRowIndex,
      columnId: column.id,
      columnIndex,
    }
  }

  /**
   * Пропускает group/footer rows при keyboard navigation.
   */
  private _resolveNavigableRowIndex(start: number, step: 1 | -1): number | undefined {
    if (this._viewPipeline.rowCount <= 0) {
      return undefined
    }
    let index = clampInteger(start, 0, this._viewPipeline.rowCount - 1)
    while (index >= 0 && index < this._viewPipeline.rowCount) {
      const viewRow = this._viewPipeline.getViewRowAt(index)
      if (!viewRow || viewRow.kind === 'data') {
        return index
      }
      index += step
    }
    return undefined
  }

  /**
   * Выполняет внутренний шаг addSelectionRange для DataTableRootNode.
   */
  private _addSelectionRange(range: DataTableSelectionRange): void {
    this._selectRange(range, { append: true })
  }

  /**
   * Удаляет сущность из runtime-коллекции DataTableRootNode.
   */
  private _removeSelectionRange(rangeId: string): void {
    if (!this._selection) {
      return
    }
    const ranges = this._selection.ranges.filter(range => range.id !== rangeId)
    this._commitSelectionState({ ...this._selection, ranges, previewRange: null }, { emitActive: false })
  }

  /**
   * Обновляет значение состояния DataTableRootNode.
   */
  private _setSelection(selection: DataTableSelectionState | null): void {
    if (this.props.selection === false || !this.props.selection.enabled || this.props.selection.mode === 'none') {
      this._clearSelection()
      return
    }
    if (!selection) {
      this._clearSelection()
      return
    }
    this._commitSelectionState({
      ...selection,
      ranges: selection.ranges.map(range => this._normalizeSelectionRange(range)),
      previewRange: selection.previewRange ? this._normalizeSelectionRange(selection.previewRange) : null,
    })
  }

  /**
   * Очищает накопленное состояние DataTableRootNode.
   */
  private _clearSelection(): void {
    if (!this._selectionActive && !this._selection && !this._selectionDragState) {
      return
    }
    this._selectionActive = false
    this._selection = null
    this._selectionDragState = null
    this._animateInteractionAlpha('selectionAlpha', 0)
    this.props.onSelectionChange?.(null)
    this.props.onSelectionPreviewChange?.(null)
    this.props.onActiveCellChange?.(null)
    this._refresh(['interaction'])
  }

  /**
   * Применяет подготовленное состояние DataTableRootNode.
   */
  private _applySelectionRange(
    range: DataTableSelectionRange,
    options: DataTableSelectionUpdateOptions = {},
    anchor?: DataTableSelectionAnchor,
  ): void {
    if (this.props.selection === false || !this.props.selection.enabled || this.props.selection.mode === 'none') {
      return
    }
    const resolved = this._normalizeSelectionRange(range)
    const current = this._selection
    const append = this.props.selection !== false
      && this.props.selection.cardinality === 'multiple'
      && options.append
    const ranges = (append || options.toggle) && current ? [...current.ranges] : []
    if (options.toggle) {
      const index = ranges.findIndex(item => sameSelectionRange(item, resolved))
      if (index >= 0) {
        ranges.splice(index, 1)
      }
      else { ranges.push(resolved) }
    }
    else {
      ranges.push(resolved)
    }
    const nextAnchor = anchor ?? current?.anchor ?? this._anchorFromRange(resolved)
    const activeCell = options.focus === false ? current?.activeCell ?? null : nextAnchor
    this._commitSelectionState({
      mode: this.props.selection === false ? 'none' : this.props.selection.mode,
      activeCell,
      anchor: nextAnchor,
      ranges,
      previewRange: null,
      rowId: activeCell?.rowId,
      rowIndex: activeCell?.rowIndex,
      columnId: activeCell?.columnId,
      columnIndex: activeCell?.columnIndex,
    })
  }

  /**
   * Фиксирует подготовленные изменения DataTableRootNode.
   */
  private _commitSelectionState(selection: DataTableSelectionState, options: { emitActive?: boolean, emitPreview?: boolean } = {}): void {
    this._selection = selection.ranges.length > 0 || selection.previewRange || selection.activeCell ? selection : null
    this._selectionActive = !!this._selection
    if (this._selectionActive) {
      this._animateInteractionAlpha('selectionAlpha', 1)
    }
    else { this._animateInteractionAlpha('selectionAlpha', 0) }
    this.props.onSelectionChange?.(this._cloneSelectionState())
    if (options.emitPreview !== false) {
      this.props.onSelectionPreviewChange?.(selection.previewRange)
    }
    if (options.emitActive !== false) {
      this.props.onActiveCellChange?.(selection.activeCell)
    }
    this._refresh(['interaction'])
  }

  /**
   * Выполняет внутренний шаг cloneSelectionState для DataTableRootNode.
   */
  private _cloneSelectionState(): DataTableSelectionState | null {
    if (!this._selection) {
      return null
    }
    return {
      ...this._selection,
      activeCell: this._selection.activeCell ? { ...this._selection.activeCell } : null,
      anchor: this._selection.anchor ? { ...this._selection.anchor } : null,
      ranges: this._selection.ranges.map(range => ({ ...range, columnIds: range.columnIds ? [...range.columnIds] : undefined })),
      previewRange: this._selection.previewRange ? { ...this._selection.previewRange, columnIds: this._selection.previewRange.columnIds ? [...this._selection.previewRange.columnIds] : undefined } : null,
    }
  }

  /**
   * Выполняет внутренний шаг tryHeaderSelection для DataTableRootNode.
   */
  private _tryHeaderSelection(target: DataTableInteractionTarget<Row>, event: MouseEvent): boolean {
    const options = this.props.selection
    if (!options || !options.enabled || !options.gestures.headerSelectColumn || !options.allowedUnits.columns) {
      return false
    }
    if (target.column.sortable) {
      return false
    }
    this._selectColumn(target.column.id, {
      append: this._isSelectionToggleEvent(event),
      toggle: this._isSelectionToggleEvent(event),
      focus: true,
    })
    return true
  }

  /**
   * Запускает runtime-процесс DataTableRootNode.
   */
  private _startSelectionDrag(target: DataTableInteractionTarget<Row>, event: MouseEvent): void {
    const options = this.props.selection
    if (!options || !options.enabled || !options.gestures.dragRange || !this._isSelectableTarget(target)) {
      return
    }
    const anchor = this._createSelectionAnchor(target)
    if (!anchor) {
      return
    }
    const unit = this._resolveSelectionUnit(target)
    if (unit !== 'cell') {
      return
    }
    this._selectionDragState = { anchor, target: anchor, unit, active: false }
    this.capturePointer(event)
  }

  /**
   * Обновляет runtime-состояние DataTableRootNode.
   */
  private _updateSelectionDrag(meta: NovaDragEventMeta): void {
    const drag = this._selectionDragState
    if (!drag) {
      return
    }
    const [x, y] = this.toLocal(meta.x, meta.y)
    const target = this._resolveInteractionTargetAt(x, y)
    if (!target || !this._isSelectableTarget(target)) {
      return
    }
    const nextAnchor = this._createSelectionAnchor(target)
    if (!nextAnchor) {
      return
    }
    drag.target = nextAnchor
    drag.active = drag.active || Math.abs(meta.totalDx) > 3 || Math.abs(meta.totalDy) > 3
    if (!drag.active) {
      return
    }
    const previewRange = this._createSelectionRange(drag.anchor, drag.target, drag.unit)
    const current = this._selection ?? this._createEmptySelection()
    this._selection = {
      ...current,
      activeCell: drag.target,
      anchor: drag.anchor,
      previewRange,
      rowId: drag.target.rowId,
      rowIndex: drag.target.rowIndex,
      columnId: drag.target.columnId,
      columnIndex: drag.target.columnIndex,
    }
    this._selectionActive = true
    this.props.onSelectionPreviewChange?.(previewRange)
    this.props.onActiveCellChange?.(drag.target)
    this._autoScrollSelectionDrag(x, y)
    this._refresh(['interaction'])
  }

  /**
   * Фиксирует подготовленные изменения DataTableRootNode.
   */
  private _commitSelectionDrag(): void {
    const drag = this._selectionDragState
    if (!drag) {
      return
    }
    this._selectionDragState = null
    if (!drag.active) {
      return
    }
    this._applySelectionRange(this._createSelectionRange(drag.anchor, drag.target, drag.unit), {
      append: this.props.selection !== false && this.props.selection.cardinality === 'multiple' && this.props.selection.behavior.preserveOnDrag,
      focus: true,
    }, drag.target)
    this.props.onSelectionPreviewChange?.(null)
  }

  /**
   * Создает runtime-сущность DataTableRootNode.
   */
  private _createEmptySelection(): DataTableSelectionState {
    return {
      mode: this.props.selection === false ? 'none' : this.props.selection.mode,
      activeCell: null,
      anchor: null,
      ranges: [],
      previewRange: null,
    }
  }

  /**
   * Создает runtime-сущность DataTableRootNode.
   */
  private _createSelectionAnchor(target: DataTableInteractionTarget<Row>): DataTableSelectionAnchor | null {
    if (target.rowId === undefined) {
      return null
    }
    return {
      rowId: target.rowId,
      rowIndex: target.rowIndex,
      columnId: target.column.id,
      columnIndex: target.columnIndex,
    }
  }

  /**
   * Создает runtime-сущность DataTableRootNode.
   */
  private _createSelectionRange(
    start: DataTableSelectionAnchor,
    end: DataTableSelectionAnchor,
    unit: DataTableSelectionUnit,
  ): DataTableSelectionRange {
    const startRowIndex = Math.min(start.rowIndex, end.rowIndex)
    const endRowIndex = Math.max(start.rowIndex, end.rowIndex)
    const startColumnIndex = Math.min(start.columnIndex, end.columnIndex)
    const endColumnIndex = Math.max(start.columnIndex, end.columnIndex)
    const columns = this._resolvedColumns.slice(startColumnIndex, endColumnIndex + 1).map(column => column.id)
    return this._normalizeSelectionRange({
      id: this._nextSelectionRangeId(),
      unit,
      startRowIndex: unit === 'column' ? 0 : startRowIndex,
      endRowIndex: unit === 'column' ? Math.max(0, this._viewPipeline.rowCount - 1) : endRowIndex,
      startRowId: start.rowIndex <= end.rowIndex ? start.rowId : end.rowId,
      endRowId: start.rowIndex <= end.rowIndex ? end.rowId : start.rowId,
      startColumnId: unit === 'row' ? this._resolvedColumns[0]?.id : columns[0],
      endColumnId: unit === 'row' ? this._resolvedColumns[this._resolvedColumns.length - 1]?.id : columns[columns.length - 1],
      columnIds: unit === 'row' ? this._resolvedColumns.map(column => column.id) : columns,
    })
  }

  /**
   * Нормализует входные данные DataTableRootNode.
   */
  private _normalizeSelectionRange(range: DataTableSelectionRange): DataTableSelectionRange {
    const startRowIndex = Math.min(range.startRowIndex ?? 0, range.endRowIndex ?? range.startRowIndex ?? 0)
    const endRowIndex = Math.max(range.startRowIndex ?? 0, range.endRowIndex ?? range.startRowIndex ?? 0)
    const columnIds = this._normalizeSelectionColumns(range)
    return {
      ...range,
      id: range.id || this._nextSelectionRangeId(),
      startRowIndex,
      endRowIndex,
      startColumnId: columnIds[0],
      endColumnId: columnIds[columnIds.length - 1],
      columnIds,
    }
  }

  /**
   * Нормализует входные данные DataTableRootNode.
   */
  private _normalizeSelectionColumns(range: DataTableSelectionRange): Array<string> {
    if (range.unit === 'row') {
      return this._resolvedColumns.map(column => column.id)
    }
    if (range.columnIds?.length) {
      return this._sortColumnIdsByResolvedOrder(range.columnIds)
    }
    const start = this._resolvedColumns.findIndex(column => column.id === range.startColumnId)
    const end = this._resolvedColumns.findIndex(column => column.id === range.endColumnId)
    if (start < 0 && end < 0) {
      return []
    }
    const min = Math.min(start < 0 ? end : start, end < 0 ? start : end)
    const max = Math.max(start < 0 ? end : start, end < 0 ? start : end)
    return this._resolvedColumns.slice(min, max + 1).map(column => column.id)
  }

  /**
   * Выполняет внутренний шаг sortColumnIdsByResolvedOrder для DataTableRootNode.
   */
  private _sortColumnIdsByResolvedOrder(columnIds: Array<string>): Array<string> {
    const source = new Set(columnIds)
    return this._resolvedColumns.filter(column => source.has(column.id)).map(column => column.id)
  }

  /**
   * Выполняет внутренний шаг nextSelectionRangeId для DataTableRootNode.
   */
  private _nextSelectionRangeId(): string {
    this._selectionIdCounter += 1
    return `selection-${this._selectionIdCounter}`
  }

  /**
   * Выполняет внутренний шаг anchorFromRange для DataTableRootNode.
   */
  private _anchorFromRange(range: DataTableSelectionRange): DataTableSelectionAnchor | null {
    const columnId = range.columnIds?.[0] ?? range.startColumnId
    if (!columnId) {
      return null
    }
    const columnIndex = this._resolvedColumns.findIndex(column => column.id === columnId)
    if (columnIndex < 0) {
      return null
    }
    const rowIndex = range.startRowIndex ?? 0
    const rowId = range.startRowId ?? this._viewPipeline.getRowIdAt(rowIndex) ?? this.store.getRowIdAt(rowIndex)
    if (rowId === undefined) {
      return null
    }
    return { rowId, rowIndex, columnId, columnIndex }
  }

  /**
   * Выполняет внутренний шаг isSelectableTarget для DataTableRootNode.
   */
  private _isSelectableTarget(target: DataTableInteractionTarget<Row>): boolean {
    if (this.props.selection === false || !this.props.selection.enabled) {
      return false
    }
    if (target.zone === 'body' || target.zone === 'pinned-top' || target.zone === 'pinned-bottom') {
      return target.rowId !== undefined
    }
    if (target.zone === 'group') {
      return this.props.selection.behavior.groupRows === 'group-row-only'
    }
    return false
  }

  /**
   * Нормализует и возвращает итоговое значение DataTableRootNode.
   */
  private _resolveSelectionUnit(target: DataTableInteractionTarget<Row>): DataTableSelectionUnit {
    if (target.zone === 'header') {
      return 'column'
    }
    const mode = this.props.selection === false ? 'cell' : this.props.selection.mode
    if (mode === 'row' || mode === 'column') {
      return mode
    }
    return 'cell'
  }

  /**
   * Выполняет внутренний шаг isSelectionUnitAllowed для DataTableRootNode.
   */
  private _isSelectionUnitAllowed(unit: DataTableSelectionUnit): boolean {
    if (this.props.selection === false) {
      return false
    }
    if (unit === 'cell') {
      return this.props.selection.allowedUnits.cells
    }
    if (unit === 'row') {
      return this.props.selection.allowedUnits.rows
    }
    return this.props.selection.allowedUnits.columns
  }

  /**
   * Выполняет внутренний шаг isSelectionToggleEvent для DataTableRootNode.
   */
  private _isSelectionToggleEvent(event?: MouseEvent): boolean {
    if (!event || this.props.selection === false || this.props.selection.cardinality !== 'multiple') {
      return false
    }
    return (event.ctrlKey && this.props.selection.gestures.ctrlToggle) || (event.metaKey && this.props.selection.gestures.metaToggle)
  }

  /**
   * Выполняет внутренний шаг autoScrollSelectionDrag для DataTableRootNode.
   */
  private _autoScrollSelectionDrag(x: number, y: number): void {
    if (this.props.selection === false || !this.props.selection.gestures.autoScrollOnDrag) {
      return
    }
    const edge = 24
    let nextX = this.scrollX
    let nextY = this.scrollY
    if (x < this._viewport.bodyX + edge) {
      nextX -= this._viewport.bodyWidth * 0.08
    }
    else if (x > this._viewport.bodyX + this._viewport.bodyWidth - edge) {
      nextX += this._viewport.bodyWidth * 0.08
    }
    if (y < this._viewport.bodyY + edge) {
      nextY -= this.rowHeight
    }
    else if (y > this._viewport.bodyY + this._viewport.bodyHeight - edge) {
      nextY += this.rowHeight
    }
    if (nextX !== this.scrollX || nextY !== this.scrollY) {
      this.setScroll(nextX, nextY)
    }
  }

  /**
   * Находит сущность по runtime-критериям DataTableRootNode.
   */
  private _findViewRowIndexById(rowId: DataTableRowId): number | undefined {
    return this._viewPipeline.findViewIndexByRowId(rowId)
  }

  /**
   * Нормализует и возвращает итоговое значение DataTableRootNode.
   */
  private _resolveSelectionHit(rowId: DataTableRowId, rowIndex: number, columnId: string): {
    selected: boolean
    rowSelected: boolean
    columnSelected: boolean
    rangeId?: string
  } {
    const ranges = this._selection?.ranges ?? []
    for (const range of ranges) {
      const rowInRange = rowIndex >= (range.startRowIndex ?? rowIndex) && rowIndex <= (range.endRowIndex ?? rowIndex)
      const columnInRange = (range.columnIds ?? []).includes(columnId)
      if (range.unit === 'row' && rowInRange) {
        return { selected: true, rowSelected: true, columnSelected: false, rangeId: range.id }
      }
      if (range.unit === 'column' && columnInRange) {
        return { selected: true, rowSelected: false, columnSelected: true, rangeId: range.id }
      }
      if (range.unit === 'cell' && rowInRange && columnInRange) {
        return { selected: true, rowSelected: false, columnSelected: false, rangeId: range.id }
      }
    }
    return { selected: false, rowSelected: false, columnSelected: false }
  }

  /**
   * Выполняет внутренний шаг isCellSelected для DataTableRootNode.
   */
  private _isCellSelected(rowId: DataTableRowId, columnId: string): boolean {
    const rowIndex = this._findViewRowIndexById(rowId)
    if (rowIndex === undefined) {
      return false
    }
    return this._resolveSelectionHit(rowId, rowIndex, columnId).selected
  }

  /**
   * Выполняет внутренний шаг isRowSelected для DataTableRootNode.
   */
  private _isRowSelected(rowId: DataTableRowId): boolean {
    const rowIndex = this._findViewRowIndexById(rowId)
    if (rowIndex === undefined) {
      return false
    }
    return (this._selection?.ranges ?? []).some(range => range.unit === 'row' && rowIndex >= (range.startRowIndex ?? rowIndex) && rowIndex <= (range.endRowIndex ?? rowIndex))
  }

  /**
   * Выполняет внутренний шаг isColumnSelected для DataTableRootNode.
   */
  private _isColumnSelected(columnId: string): boolean {
    return (this._selection?.ranges ?? []).some(range => range.unit === 'column' && (range.columnIds ?? []).includes(columnId))
  }

  /**
   * Очищает значения выделенных data cells как единую undoable transaction.
   */
  private _clearSelectionValues(): DataTableTransaction<Row> | null {
    if (!this._selection || this._selection.ranges.length === 0) {
      return null
    }
    const deltas: Array<DataTableDelta<Row>> = []
    for (const range of this._selection.ranges) {
      const rows = this._resolveRowsForSelectionRange(range)
      const columns = this._resolveColumnsForSelectionRange(range, false)
      for (const row of rows) {
        if (row.rowId === undefined) {
          continue
        }
        for (const column of columns) {
          if (column.editable === false) {
            continue
          }
          const key = typeof column.field === 'string' ? column.field : column.id
          deltas.push({ type: 'patch', rowId: row.rowId, patch: { [key]: '' } as Partial<Row> })
        }
      }
    }
    if (deltas.length === 0) {
      return null
    }
    return this._commitDeltas(deltas, { source: 'clear', label: 'Clear selection' })
  }

  /**
   * Заполняет выделение по текущему fill handle mode.
   */
  private _fillSelection(
    direction: DataTableFillDirection,
    options: Partial<DataTableFillHandleOptions> = {},
  ): DataTableTransaction<Row> | null {
    const fillHandle = this.props.fillHandle
    if (fillHandle === false || !fillHandle.enabled || !this._selection?.ranges[0]) {
      return null
    }
    if (!fillHandle.directions.includes(direction)) {
      return null
    }
    const mode = options.mode ?? fillHandle.mode
    const deltas = createDataTableFillDeltas(this.store, this._selection.ranges[0], direction, { mode })
    if (deltas.length === 0) {
      return null
    }
    return this._commitDeltas(deltas, { source: 'fill', label: `Fill ${direction}` })
  }

  /**
   * Выполняет внутренний шаг copySelection для DataTableRootNode.
   */
  private _copySelection(): string {
    if (this.props.clipboard === false || this.props.clipboard.copy === false || !this._selection || this._selection.ranges.length === 0) {
      return ''
    }
    const payload = {
      selection: this._selection,
      ranges: this._selection.ranges,
      store: this.store,
      api: this._api,
    }
    const override = this.props.onBeforeCopy?.(payload) ?? this.props.clipboard.onBeforeCopy?.(payload)
    if (override === false) {
      return ''
    }
    const text = typeof override === 'string' ? override : this._formatSelectionCopy(this._selection, this.props.clipboard)
    this.props.onCopy?.({ ...payload, text })
    this.props.clipboard.onCopy?.({ ...payload, text })
    return text
  }

  /**
   * Выполняет внутренний шаг pasteClipboard для DataTableRootNode.
   */
  private async _pasteClipboard(text?: string): Promise<DataTablePasteResult<Row>> {
    const emptyResult = { committed: 0, skipped: 0, invalid: [], deltas: [] } satisfies DataTablePasteResult<Row>
    if (this.props.clipboard === false || this.props.clipboard.paste === false || !this.props.clipboard.paste.enabled) {
      return emptyResult
    }
    const sourceText = text ?? await this._readClipboardText()
    if (!sourceText) {
      return emptyResult
    }

    const matrix = parseDataTableClipboardMatrix(sourceText, this.props.clipboard.paste.parseFormat)
    const payload = {
      text: sourceText,
      matrix,
      selection: this._selection,
      store: this.store,
      api: this._api,
    }
    try {
      const override = await (this.props.onBeforePaste?.(payload) ?? this.props.clipboard.onBeforePaste?.(payload))
      if (override === false) {
        return emptyResult
      }
      if (Array.isArray(override)) {
        this._commitDeltas(override, { source: 'paste', label: 'Paste override' })
        const result = { committed: override.length, skipped: 0, invalid: [], deltas: override } satisfies DataTablePasteResult<Row>
        this._setClipboardPasteResultFeedback(result)
        this.props.onPasteCommit?.(result)
        this.props.clipboard.onPasteCommit?.(result)
        return result
      }
      const result = await this._createPasteResult(matrix)
      if (result.invalid.length > 0 && this.props.clipboard.paste.invalid === 'reject') {
        const pasteError = { message: 'Paste validation failed', result }
        this._setClipboardFeedback(createDataTableClipboardPasteErrorFeedback(pasteError))
        this.props.onPasteError?.(pasteError)
        this.props.clipboard.onPasteError?.(pasteError)
        return result
      }
      if (result.deltas.length > 0) {
        this._commitDeltas(result.deltas, { source: 'paste', label: 'Paste' })
      }
      this._setClipboardPasteResultFeedback(result)
      this.props.onPasteCommit?.(result)
      this.props.clipboard.onPasteCommit?.(result)
      return result
    }
    catch (error) {
      const pasteError = {
        message: error instanceof Error ? error.message : 'Paste failed',
        error,
      }
      this._setClipboardFeedback(createDataTableClipboardPasteErrorFeedback(pasteError))
      this.props.onPasteError?.(pasteError)
      this.props.clipboard.onPasteError?.(pasteError)
      return emptyResult
    }
  }

  /**
   * Обновляет runtime-состояние DataTableRootNode.
   */
  private _setClipboardFeedback(feedback: DataTableClipboardFeedbackState<Row>): void {
    this._clearClipboardFeedbackTimer()
    this._clipboardFeedback = feedback
    if (feedback.visible && feedback.ttlMs > 0) {
      this._clipboardFeedbackHideTimer = setTimeout(() => {
        this._clipboardFeedback = createDataTableClipboardFeedbackHidden() as DataTableClipboardFeedbackState<Row>
        this._refresh(['interaction'])
      }, feedback.ttlMs)
    }
    this._refresh(['interaction'])
  }

  /**
   * Обновляет runtime-состояние DataTableRootNode.
   */
  private _setClipboardPasteResultFeedback(result: DataTablePasteResult<Row>): void {
    if (result.committed === 0 && result.skipped === 0 && result.invalid.length === 0) {
      return
    }
    this._setClipboardFeedback(createDataTableClipboardPasteFeedback(result))
  }

  /**
   * Очищает таймер DataTableRootNode.
   */
  private _clearClipboardFeedbackTimer(): void {
    if (!this._clipboardFeedbackHideTimer) {
      return
    }
    clearTimeout(this._clipboardFeedbackHideTimer)
    this._clipboardFeedbackHideTimer = null
  }

  /**
   * Выполняет внутренний шаг readClipboardText для DataTableRootNode.
   */
  private async _readClipboardText(): Promise<string> {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.readText) {
      return ''
    }
    try {
      return await navigator.clipboard.readText()
    }
    catch {
      return ''
    }
  }

  /**
   * Выполняет внутренний шаг formatSelectionCopy для DataTableRootNode.
   */
  private _formatSelectionCopy(selection: DataTableSelectionState, clipboard: DataTableResolvedClipboardOptions<Row>): string {
    const blocks: Array<string> = []
    const format = clipboard.copy ? clipboard.copy.format : 'tsv'
    for (const range of selection.ranges) {
      const rows = this._resolveRowsForSelectionRange(range)
      const columns = this._resolveColumnsForSelectionRange(range, clipboard.copy ? clipboard.copy.onlyVisibleColumns : true)
      const lines: Array<Array<string>> = []
      if (clipboard.copy && clipboard.copy.includeHeaders) {
        lines.push(columns.map(column => column.title ?? column.id))
      }
      for (const rowInfo of rows) {
        const rowValues: Array<string> = []
        for (const column of columns) {
          const value = rowInfo.row ? resolveDataTableValue(rowInfo.row, rowInfo.storeIndex ?? rowInfo.rowIndex, column) : ''
          const context = rowInfo.row ? this._createCopyPasteCellContext(rowInfo.row, rowInfo.rowId, rowInfo.rowIndex, rowInfo.storeIndex, column, value) : null
          rowValues.push(column.formatCopyValue && context ? column.formatCopyValue(value, context) : stringifyClipboardValue(value))
        }
        lines.push(rowValues)
      }
      blocks.push(formatClipboardBlock(lines, format))
    }
    return blocks.filter(Boolean).join(format === 'html' ? '' : '\n\n')
  }

  /**
   * Создает runtime-сущность DataTableRootNode.
   */
  private async _createPasteResult(matrix: Array<Array<string>>): Promise<DataTablePasteResult<Row>> {
    const result = { committed: 0, skipped: 0, invalid: [], deltas: [] } satisfies DataTablePasteResult<Row>
    const target = this._resolvePasteTarget()
    if (!target || matrix.length === 0) {
      return result
    }
    const policy = this.props.clipboard !== false && this.props.clipboard.paste !== false ? this.props.clipboard.paste : null
    if (!policy) {
      return result
    }

    for (let rowOffset = 0; rowOffset < matrix.length; rowOffset += 1) {
      const rowIndex = target.rowIndex + rowOffset
      const row = this._viewPipeline.getRowAt(rowIndex)
      const rowId = this._viewPipeline.getRowIdAt(rowIndex)
      if (!row || rowId === undefined) {
        result.skipped += matrix[rowOffset]?.length ?? 0
        continue
      }
      const storeIndex = this._viewPipeline.getStoreIndexAt(rowIndex)
      const cells = matrix[rowOffset] ?? []
      for (let columnOffset = 0; columnOffset < cells.length; columnOffset += 1) {
        const column = target.columns[columnOffset]
        if (!column) {
          if (policy.overflow === 'reject') {
            result.invalid.push({ rowId, rowIndex, columnId: '', raw: cells[columnOffset] ?? '', message: 'Paste exceeds target columns' })
          }
          else { result.skipped += 1 }
          continue
        }
        const raw = cells[columnOffset] ?? ''
        const value = raw === '' && column.paste && column.paste !== false && 'emptyValue' in column.paste ? column.paste.emptyValue : raw
        const context = this._createCopyPasteCellContext(row, rowId, rowIndex, storeIndex, column, value)
        if (!this._canPasteCell(context)) {
          if (policy.readonly === 'reject') {
            result.invalid.push({ rowId, rowIndex, columnId: column.id, raw, message: 'Cell is readonly' })
          }
          else { result.skipped += 1 }
          continue
        }
        const parsed = this._parsePasteValue(value, context)
        const validation = await this._validatePasteValue(parsed, context)
        if (validation !== true) {
          result.invalid.push({ rowId, rowIndex, columnId: column.id, raw, message: validation })
          result.skipped += 1
          continue
        }
        const key = typeof column.field === 'string' ? column.field : column.id
        result.deltas.push({ type: 'patch', rowId, patch: { [key]: parsed } as Partial<Row> })
        result.committed += 1
      }
    }
    if (result.invalid.length > 0 && policy.invalid === 'reject') {
      result.deltas = []
      result.committed = 0
    }
    return result
  }

  /**
   * Нормализует и возвращает итоговое значение DataTableRootNode.
   */
  private _resolvePasteTarget(): { rowIndex: number, columns: Array<DataTableResolvedColumn<Row>> } | null {
    const active = this._selection?.activeCell
    const range = this._selection?.ranges[0]
    if (this._selection && (this._selection.ranges.length > 1 || this._selection.ranges.some(item => item.unit !== 'cell'))) {
      return null
    }
    const rowIndex = active?.rowIndex ?? range?.startRowIndex
    if (rowIndex === undefined) {
      return null
    }
    const startColumnId = active?.columnId ?? range?.columnIds?.[0] ?? range?.startColumnId
    const startColumnIndex = Math.max(0, this._resolvedColumns.findIndex(column => column.id === startColumnId))
    return {
      rowIndex,
      columns: this._resolvedColumns.slice(startColumnIndex),
    }
  }

  /**
   * Нормализует и возвращает итоговое значение DataTableRootNode.
   */
  private _resolveRowsForSelectionRange(range: DataTableSelectionRange): Array<{ row?: Row, rowId?: DataTableRowId, rowIndex: number, storeIndex?: number }> {
    const start = Math.max(0, range.startRowIndex ?? 0)
    const end = Math.min(this._viewPipeline.rowCount - 1, range.endRowIndex ?? start)
    const rows: Array<{ row?: Row, rowId?: DataTableRowId, rowIndex: number, storeIndex?: number }> = []
    for (let rowIndex = start; rowIndex <= end; rowIndex += 1) {
      rows.push({
        row: this._viewPipeline.getRowAt(rowIndex),
        rowId: this._viewPipeline.getRowIdAt(rowIndex),
        rowIndex,
        storeIndex: this._viewPipeline.getStoreIndexAt(rowIndex),
      })
    }
    return rows
  }

  /**
   * Нормализует и возвращает итоговое значение DataTableRootNode.
   */
  private _resolveColumnsForSelectionRange(range: DataTableSelectionRange, onlyVisible: boolean): Array<DataTableResolvedColumn<Row>> {
    const ids = range.unit === 'row'
      ? this._resolvedColumns.map(column => column.id)
      : range.columnIds ?? this._normalizeSelectionColumns(range)
    const visible = onlyVisible ? new Set(this._visibleColumnRects().map(rect => rect.column.id)) : null
    return this._resolvedColumns.filter(column => ids.includes(column.id) && (!visible || visible.has(column.id)))
  }

  /**
   * Создает runtime-сущность DataTableRootNode.
   */
  private _createCopyPasteCellContext(
    row: Row,
    rowId: DataTableRowId,
    rowIndex: number,
    storeIndex: number | undefined,
    column: DataTableResolvedColumn<Row>,
    value: unknown,
  ): DataTableCellContext<Row> {
    const columnIndex = this._resolvedColumns.findIndex(item => item.id === column.id)
    return {
      row,
      rowId,
      rowIndex,
      viewRowIndex: rowIndex,
      storeIndex,
      column,
      columnIndex,
      value,
      rect: { x: 0, y: 0, width: column.resolvedWidth, height: this.rowHeight },
      state: this._createCellState({ x: 0, y: 0, width: column.resolvedWidth, height: this.rowHeight }, rowId, rowIndex, storeIndex, { column, columnIndex, x: 0, width: column.resolvedWidth }, 'body'),
      zone: 'body',
      store: this.store,
      api: this._api,
    }
  }

  /**
   * Выполняет внутренний шаг canPasteCell для DataTableRootNode.
   */
  private _canPasteCell(context: DataTableCellContext<Row>): boolean {
    const column = context.column
    if (column.paste === false) {
      return false
    }
    if (column.paste && column.paste.enabled === false) {
      return false
    }
    const editable = column.editable
    if (typeof editable === 'function') {
      return editable(context)
    }
    return editable === true
  }

  /**
   * Разбирает входное значение DataTableRootNode.
   */
  private _parsePasteValue(raw: unknown, context: DataTableCellContext<Row>): unknown {
    if (context.column.parsePasteValue) {
      return context.column.parsePasteValue(String(raw ?? ''), context)
    }
    if (context.column.type === 'number') {
      return raw === '' || raw === null || raw === undefined ? null : Number(String(raw).replace(',', '.'))
    }
    if (context.column.type === 'boolean') {
      return parseClipboardBoolean(raw)
    }
    if (context.column.type === 'json') {
      try {
        return JSON.parse(String(raw))
      }
      catch {
        return raw
      }
    }
    return raw
  }

  /**
   * Проверяет входное значение DataTableRootNode.
   */
  private async _validatePasteValue(value: unknown, context: DataTableCellContext<Row>): Promise<true | string> {
    if (context.column.validatePasteValue) {
      return context.column.validatePasteValue(value, context)
    }
    if (context.column.type === 'number' && value !== null && !Number.isFinite(value)) {
      return 'Invalid number'
    }
    return true
  }

  /**
   * Запускает runtime-процесс DataTableRootNode.
   */
  private _startTextSelectionAt(x: number, y: number, event: MouseEvent): boolean {
    if (!this.props.textSelection || !this.props.textSelection.enabled) {
      return false
    }
    if (!this._textSelection.start(x, y)) {
      return false
    }

    this._textSelectionActive = true
    this._clearSelection()
    this.capturePointer(event)
    this._refresh(['interaction'])
    return true
  }

  /**
   * Обновляет runtime-состояние DataTableRootNode.
   */
  private _updateTextSelectionAt(globalX: number, globalY: number): void {
    const [x, y] = this.toLocal(globalX, globalY)
    if (!this._textSelection.update(x, y)) {
      return
    }
    this._refresh(['interaction'])
  }

  /**
   * Обновляет значение состояния DataTableRootNode.
   */
  private _setupTextSelectionKeyboardEvents(): void {
    if (typeof window === 'undefined') {
      return
    }
    window.addEventListener('keydown', this._handleTextSelectionKeydown)
  }

  /**
   * Выполняет внутренний шаг teardownTextSelectionKeyboardEvents для DataTableRootNode.
   */
  private _teardownTextSelectionKeyboardEvents(): void {
    if (typeof window === 'undefined') {
      return
    }
    window.removeEventListener('keydown', this._handleTextSelectionKeydown)
  }

  /**
   * Обрабатывает runtime-событие DataTableRootNode.
   */
  private _handleTextSelectionKeydownEvent(event: KeyboardEvent): void {
    const copy = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'c'
    const paste = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'v'
    if (copy && this.props.textSelection && this.props.textSelection.enabled && this._textSelection.hasSelection()) {
      event.preventDefault()
      void this._textSelection.copy(ranges => this._formatTextSelectionCopy(ranges))
      return
    }
    if (copy && this._selection && this._selection.ranges.length > 0) {
      event.preventDefault()
      const text = this._copySelection()
      if (text && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        void navigator.clipboard.writeText(text)
      }
      return
    }
    if (paste && this._selection?.activeCell) {
      event.preventDefault()
      void this._pasteClipboard()
    }
  }

  /**
   * Выполняет внутренний шаг formatTextSelectionCopy для DataTableRootNode.
   */
  private _formatTextSelectionCopy(ranges: Array<NovaTextSelectionRange<DataTableTextSelectionContext>>): string {
    if (!this.props.textSelection || this.props.textSelection.copyFormat !== 'tsv' || ranges.length <= 1) {
      return ranges
        .map(item => item.target.text.slice(item.range.start, item.range.end))
        .join('\n')
    }

    const rows = new Map<string, Array<NovaTextSelectionRange<DataTableTextSelectionContext>>>()
    for (const range of ranges) {
      const context = range.target.context
      const rowKey = `${context?.zone ?? 'body'}:${context?.rowIndex ?? 0}:${String(context?.rowId ?? '')}`
      const items = rows.get(rowKey) ?? []
      items.push(range)
      rows.set(rowKey, items)
    }

    return [...rows.values()]
      .map(items => items
        .sort((first, second) => (first.target.context?.columnIndex ?? 0) - (second.target.context?.columnIndex ?? 0))
        .map(item => item.target.text.slice(item.range.start, item.range.end))
        .join('\t'))
      .join('\n')
  }

  /**
   * Обновляет значение состояния DataTableRootNode.
   */
  private _setupEditingKeyboardEvents(): void {
    if (typeof window === 'undefined') {
      return
    }
    window.addEventListener('keydown', this._handleEditingKeydown)
  }

  /**
   * Выполняет внутренний шаг teardownEditingKeyboardEvents для DataTableRootNode.
   */
  private _teardownEditingKeyboardEvents(): void {
    if (typeof window === 'undefined') {
      return
    }
    window.removeEventListener('keydown', this._handleEditingKeydown)
  }

  /**
   * Обрабатывает runtime-событие DataTableRootNode.
   */
  private _handleEditingKeydownEvent(event: KeyboardEvent): void {
    if (event.key !== 'Enter' || this._editingState || !this._selectionActive || !this._selection) {
      return
    }
    if (!this._isEditTriggerEnabled('enter')) {
      return
    }
    const activeCell = this._selection.activeCell
    if (!activeCell) {
      return
    }
    if (!this._startEdit(activeCell.rowId, activeCell.columnId)) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
  }

  /**
   * Выполняет внутренний шаг isEditTriggerEnabled для DataTableRootNode.
   */
  private _isEditTriggerEnabled(trigger: 'doubleClick' | 'enter' | 'programmatic'): boolean {
    return this.props.editing !== false && this.props.editing.trigger.includes(trigger)
  }

  /**
   * Запускает runtime-процесс DataTableRootNode.
   */
  private _startEditFromTarget(target: DataTableInteractionTarget<Row>, trigger: 'doubleClick' | 'enter' | 'programmatic'): boolean {
    if (!this._isEditTriggerEnabled(trigger)) {
      return false
    }
    const context = this._createCellContext(target)
    if (!context || !this._canEditCell(context)) {
      return false
    }
    return this._openEditor(context)
  }

  /**
   * Запускает runtime-процесс DataTableRootNode.
   */
  private _startEdit(rowId: DataTableRowId, columnId: string): boolean {
    if (this.props.editing === false) {
      return false
    }

    const target = this._resolveEditTarget(rowId, columnId, true)
    if (!target) {
      return false
    }
    const context = this._createCellContext(target)
    if (!context || !this._canEditCell(context)) {
      return false
    }
    return this._openEditor(context)
  }

  /**
   * Нормализует и возвращает итоговое значение DataTableRootNode.
   */
  private _resolveEditTarget(rowId: DataTableRowId, columnId: string, ensureVisible = false): DataTableInteractionTarget<Row> | null {
    const column = this._resolvedColumns.find(item => item.id === columnId)
    if (!column) {
      return null
    }

    const pinnedTarget = this._resolvePinnedEditTarget(rowId, column)
    if (pinnedTarget) {
      return pinnedTarget
    }

    const rowIndex = this._viewPipeline.findViewIndexByRowId(rowId)
    if (rowIndex === undefined) {
      return null
    }

    if (ensureVisible) {
      this._scrollCellIntoView(rowIndex, column)
    }
    const row = this._viewPipeline.getRowAt(rowIndex) ?? this.store.getRow(rowId)
    if (!row) {
      return null
    }

    const columnRect = this._visibleColumnRects().find(item => item.column.id === column.id)
    if (!columnRect) {
      return null
    }

    const y = this._viewport.bodyY + rowIndex * this.rowHeight - this.scrollY
    if (y + this.rowHeight < this._viewport.bodyY || y > this._viewport.bodyY + this._viewport.bodyHeight) {
      return null
    }

    const storeIndex = this._viewPipeline.getStoreIndexAt(rowIndex)
    const rect = {
      x: columnRect.x,
      y,
      width: columnRect.width,
      height: this.rowHeight,
    }
    return {
      row,
      rowId,
      rowIndex,
      storeIndex,
      column,
      columnIndex: columnRect.columnIndex,
      rect,
      zone: 'body',
      value: resolveDataTableValue(row, storeIndex ?? rowIndex, column),
    }
  }

  /**
   * Нормализует и возвращает итоговое значение DataTableRootNode.
   */
  private _resolvePinnedEditTarget(rowId: DataTableRowId, column: DataTableResolvedColumn<Row>): DataTableInteractionTarget<Row> | null {
    const pinnedRows = this._resolveEffectivePinnedRows()
    const zones: Array<{ zone: 'pinned-top' | 'pinned-bottom', rows: Array<Row>, y: (index: number) => number }> = [
      {
        zone: 'pinned-top',
        rows: pinnedRows.top ?? [],
        y: index => this.headerHeight + index * this.rowHeight,
      },
      {
        zone: 'pinned-bottom',
        rows: pinnedRows.bottom ?? [],
        y: index => this.height - (pinnedRows.bottom?.length ?? 0) * this.rowHeight + index * this.rowHeight,
      },
    ]

    const columnRect = this._visibleColumnRects().find(item => item.column.id === column.id)
    if (!columnRect) {
      return null
    }

    for (const zone of zones) {
      const rowIndex = zone.rows.findIndex((row, index) => this._resolveRenderedRowId(zone.zone, row, index) === rowId)
      const row = zone.rows[rowIndex]
      if (!row) {
        continue
      }
      const rect = {
        x: columnRect.x,
        y: zone.y(rowIndex),
        width: columnRect.width,
        height: this.rowHeight,
      }
      return {
        row,
        rowId,
        rowIndex,
        column,
        columnIndex: columnRect.columnIndex,
        rect,
        zone: zone.zone,
        value: resolveDataTableValue(row, rowIndex, column),
      }
    }

    return null
  }

  /**
   * Выполняет внутренний шаг scrollCellIntoView для DataTableRootNode.
   */
  private _scrollCellIntoView(rowIndex: number, column: DataTableResolvedColumn<Row>): void {
    let nextX = this.scrollX
    if (!column.pinned) {
      const centerColumns = this._resolvedColumns.filter(item => !item.pinned)
      let columnX = 0
      for (const item of centerColumns) {
        if (item.id === column.id) {
          break
        }
        columnX += item.resolvedWidth
      }
      if (columnX < this.scrollX) {
        nextX = columnX
      }
      else if (columnX + column.resolvedWidth > this.scrollX + this._viewport.bodyWidth) {
        nextX = columnX + column.resolvedWidth - this._viewport.bodyWidth
      }
    }

    let nextY = this.scrollY
    const rowTop = rowIndex * this.rowHeight
    const rowBottom = rowTop + this.rowHeight
    if (rowTop < this.scrollY) {
      nextY = rowTop
    }
    else if (rowBottom > this.scrollY + this._viewport.bodyHeight) {
      nextY = rowBottom - this._viewport.bodyHeight
    }

    if (nextX !== this.scrollX || nextY !== this.scrollY) {
      this.setScroll(nextX, nextY)
    }
  }

  /**
   * Выполняет внутренний шаг canEditCell для DataTableRootNode.
   */
  private _canEditCell(context: DataTableCellContext<Row>): boolean {
    if (this.props.editing === false) {
      return false
    }
    if (context.zone !== 'body' && context.zone !== 'pinned-top' && context.zone !== 'pinned-bottom') {
      return false
    }

    const editable = context.column.editable
    const allowed = typeof editable === 'function' ? editable(context) : editable === true
    if (!allowed) {
      return false
    }

    return this.props.editing.onBeforeEditStart?.(context) !== false
  }

  /**
   * Открывает presentation-состояние DataTableRootNode.
   */
  private _openEditor(context: DataTableCellContext<Row>): boolean {
    if (this.props.editing === false) {
      return false
    }
    if (this._editingState) {
      this._cancelEdit()
    }

    const initialValue = context.value
    const draft = this._formatEditValue(initialValue, context)
    this._editingState = {
      ...context,
      renderer: 'dom-overlay',
      mode: 'cell',
      active: true,
      initialValue,
      value: initialValue,
      draft,
      dirty: false,
      invalid: false,
    }
    this.props.editing.onEditStart?.(this._editingState)
    this._emitEditingChange()
    this._refresh(['interaction'])
    return true
  }

  /**
   * Фиксирует подготовленные изменения DataTableRootNode.
   */
  private async _commitEdit(value?: unknown): Promise<void> {
    if (!this._editingState || this.props.editing === false) {
      return
    }

    const state = this._editingState
    const draft = value === undefined ? state.draft : value
    const context = {
      ...state,
      draft,
    } satisfies DataTableEditContext<Row>

    let parsed: unknown
    try {
      parsed = this._parseEditValue(draft, context)
      const validation = await this._validateEditValue(parsed, context)
      if (validation !== true) {
        this._setEditingInvalid(validation)
        return
      }

      state.draft = draft
      state.dirty = !Object.is(parsed, state.initialValue)
      state.invalid = false
      state.message = undefined
      state.pending = true
      state.transactionId = state.transactionId ?? `edit-${Date.now()}-${Math.random().toString(36).slice(2)}`

      const payload: DataTableEditCommitPayload<Row> = {
        state,
        value: parsed,
        previousValue: state.initialValue,
        rowId: state.rowId,
        columnId: state.column.id,
        row: state.row,
        draft,
        parsedValue: parsed,
        transactionId: state.transactionId,
        source: 'edit',
      }

      const beforeResult = await this.props.editing.onBeforeEditCommit?.(payload)
      if (beforeResult !== undefined && beforeResult !== true) {
        this._setEditingInvalid(typeof beforeResult === 'string' ? beforeResult : 'Edit commit rejected')
        return
      }

      this.props.editing.onEditPending?.(payload)
      this._emitEditingChange()

      const strategy = this.props.editing.commitStrategy
      if (strategy === 'optimistic') {
        this._applyCommittedEditValue(state, parsed)
      }

      await this.props.editing.onEditCommit?.(payload)

      if (strategy === 'pessimistic') {
        this._applyCommittedEditValue(state, parsed)
      }

      state.pending = false
      state.error = undefined
      state.rollback = false
      this._editingState = null
      this.props.editing.onEditSuccess?.(payload)
      this._emitEditingChange()
      this._refresh(['data', 'interaction'])
    }
    catch (error) {
      if (state.transactionId && this.props.editing.commitStrategy === 'optimistic') {
        const rolledBack = this._undo()
        if (rolledBack) {
          state.rollback = true
          this.props.editing.onEditRollback?.({
            state,
            value: parsed,
            previousValue: state.initialValue,
            rowId: state.rowId,
            columnId: state.column.id,
            row: state.row,
            draft,
            parsedValue: parsed,
            transactionId: state.transactionId,
            source: 'edit',
          })
        }
      }
      state.pending = false
      state.error = error
      this._setEditingInvalid(error instanceof Error ? error.message : 'Edit commit failed')
      const nextState = this._editingState ?? state
      this.props.editing.onEditError?.({
        state: nextState,
        error,
        message: nextState.message,
      })
    }
  }

  /**
   * Выполняет внутренний шаг cancelEdit для DataTableRootNode.
   */
  private _cancelEdit(): void {
    const state = this._editingState
    if (!state) {
      return
    }

    this._editingState = null
    if (this.props.editing !== false) {
      this.props.editing.onEditCancel?.(state)
    }
    this._emitEditingChange()
    this._refresh(['interaction'])
  }

  /**
   * Выполняет внутренний шаг cloneEditingState для DataTableRootNode.
   */
  private _cloneEditingState(): DataTableEditingState<Row> | null {
    return this._editingState ? { ...this._editingState } : null
  }

  /**
   * Публикует событие во внутренний event bus DataTableRootNode.
   */
  private _emitEditingChange(): void {
    this.props.onEditingChange?.(this._cloneEditingState())
  }

  /**
   * Обновляет значение состояния DataTableRootNode.
   */
  private _setEditingInvalid(message: string): void {
    if (!this._editingState) {
      return
    }

    this._editingState = {
      ...this._editingState,
      invalid: true,
      message,
    }
    this._emitEditingChange()
    this._refresh(['interaction'])
  }

  /**
   * Применяет подготовленное состояние DataTableRootNode.
   */
  private _applyCommittedEditValue(state: DataTableEditingState<Row>, value: unknown): DataTableTransaction<Row> | null {
    if (state.zone === 'body') {
      return this._commitDeltas(
        { type: 'setCell', rowId: state.rowId, columnId: state.column.id, value },
        { source: 'edit', label: `Edit ${state.column.id}` },
      )
    }

    const key = typeof state.column.field === 'string'
      ? state.column.field
      : state.column.id
    state.row[key as keyof Row] = value as Row[keyof Row]
    return null
  }

  /**
   * Разбирает входное значение DataTableRootNode.
   */
  private _parseEditValue(raw: unknown, context: DataTableEditContext<Row>): unknown {
    const editor = this._resolveEditorType(context.column)
    if (context.column.parseEditValue) {
      return context.column.parseEditValue(raw, context)
    }
    if (typeof context.column.editor === 'object' && context.column.editor.parse) {
      return context.column.editor.parse(raw, context)
    }
    if (editor === 'number') {
      return raw === '' || raw === null || raw === undefined ? null : Number(raw)
    }
    if (editor === 'checkbox') {
      return Boolean(raw)
    }
    return raw
  }

  /**
   * Выполняет внутренний шаг formatEditValue для DataTableRootNode.
   */
  private _formatEditValue(value: unknown, context: DataTableCellContext<Row>): unknown {
    const editContext = {
      ...context,
      initialValue: value,
      draft: value,
    } as DataTableEditContext<Row>
    if (context.column.formatEditValue) {
      return context.column.formatEditValue(value, editContext)
    }
    if (typeof context.column.editor === 'object' && context.column.editor.format) {
      return context.column.editor.format(value, editContext)
    }
    return value
  }

  /**
   * Проверяет входное значение DataTableRootNode.
   */
  private async _validateEditValue(value: unknown, context: DataTableEditContext<Row>): Promise<true | string> {
    if (context.column.validateEditValue) {
      return context.column.validateEditValue(value, context)
    }
    if (typeof context.column.editor === 'object' && context.column.editor.validate) {
      return context.column.editor.validate(value, context)
    }
    return true
  }

  /**
   * Нормализует и возвращает итоговое значение DataTableRootNode.
   */
  private _resolveEditorType(column: DataTableResolvedColumn<Row>): DataTableEditorType {
    if (typeof column.editor === 'string') {
      return column.editor
    }
    if (typeof column.editor === 'object') {
      return column.editor.type
    }
    return 'text'
  }

  /**
   * Синхронизирует состояние между слоями DataTableRootNode.
   */
  private _syncEditingRect(): void {
    if (!this._editingState) {
      return
    }

    const target = this._resolveEditTarget(this._editingState.rowId, this._editingState.column.id)
    if (!target) {
      this._cancelEdit()
      return
    }

    const context = this._createCellContext(target)
    if (!context) {
      this._cancelEdit()
      return
    }

    this._editingState = {
      ...this._editingState,
      row: context.row,
      rowIndex: context.rowIndex,
      viewRowIndex: context.viewRowIndex,
      storeIndex: context.storeIndex,
      column: context.column,
      columnIndex: context.columnIndex,
      rect: context.rect,
      state: {
        ...context.state,
        editing: true,
        editingInvalid: this._editingState.invalid,
        editingDirty: this._editingState.dirty,
        editingMessage: this._editingState.message,
        editPending: this._editingState.pending,
        editError: this._editingState.error,
        editRollback: this._editingState.rollback,
        editTransactionId: this._editingState.transactionId,
      },
      zone: context.zone,
      store: context.store,
      api: context.api,
    }
    this._emitEditingChange()
  }

  /**
   * Возвращает значение состояния DataTableRootNode.
   */
  private _getInteractionState(): DataTableInteractionState<Row> {
    return {
      hover: this._hoverActive ? this._hoverTarget : null,
      selection: this._selectionActive ? this._selection : null,
      hoverAlpha: this.props.hoverAlpha,
      selectionAlpha: this.props.selectionAlpha,
    }
  }

  /**
   * Возвращает compact accessibility state для DOM overlay wrapper.
   */
  private _getAccessibilityState(): DataTableAccessibilityState {
    return createDataTableAccessibilityState(this.props.accessibility, {
      rowCount: this._viewPipeline.rowCount,
      columnCount: this._resolvedColumns.length,
      activeCell: this._selection?.activeCell ?? null,
      selection: this._selection,
      editing: !!this._editingState,
      lastAction: this._keyboardFocusActive ? 'Table focused' : undefined,
    })
  }

  /**
   * Выполняет внутренний шаг animateInteractionAlpha для DataTableRootNode.
   */
  private _animateInteractionAlpha(key: 'hoverAlpha' | 'selectionAlpha', value: number): void {
    const motion = this.props.interaction.motion
    if (motion === false) {
      this.setProps({ [key]: value } as Partial<DataTableRootResolvedProps<Row>>)
      return
    }

    this.nova.motion.to(this, { [key]: value }, {
      ...(key === 'hoverAlpha' ? motion.hover : motion.selection),
      overwrite: true,
    })
  }

  /**
   * Нормализует и возвращает итоговое значение DataTableRootNode.
   */
  private _resolveInteractionTargetAt(x: number, y: number): DataTableInteractionTarget<Row> | null {
    if (x < 0 || y < 0 || x > this.width || y > this.height) {
      return null
    }

    const columnRect = this._resolveColumnAt(x)
    if (!columnRect) {
      return null
    }

    const rowTarget = this._resolveRowAt(y)
    if (!rowTarget) {
      return null
    }

    if (isGroupInteractionZone(rowTarget.zone)) {
      return {
        row: rowTarget.row,
        rowId: rowTarget.rowId,
        rowIndex: rowTarget.rowIndex,
        storeIndex: rowTarget.storeIndex,
        column: columnRect.column,
        columnIndex: columnRect.columnIndex,
        rect: rowTarget.rect,
        zone: rowTarget.zone,
      }
    }

    const rect: DataTableCellRect = {
      x: columnRect.x,
      y: rowTarget.rect.y,
      width: columnRect.width,
      height: rowTarget.rect.height,
    }
    return {
      row: rowTarget.row,
      rowId: rowTarget.rowId,
      rowIndex: rowTarget.rowIndex,
      storeIndex: rowTarget.storeIndex,
      column: columnRect.column,
      columnIndex: columnRect.columnIndex,
      rect,
      zone: rowTarget.zone,
      value: rowTarget.zone === 'header'
        ? columnRect.column.title ?? columnRect.column.id
        : rowTarget.row
          ? resolveDataTableValue(rowTarget.row, rowTarget.storeIndex ?? rowTarget.rowIndex, columnRect.column)
          : undefined,
    }
  }

  /**
   * Нормализует и возвращает итоговое значение DataTableRootNode.
   */
  private _resolveRowAt(y: number): {
    row?: Row
    rowId?: DataTableRowId
    rowIndex: number
    storeIndex?: number
    zone: DataTableCellContext<Row>['zone']
    rect: DataTableCellRect
  } | null {
    if (y < this.headerHeight) {
      return {
        row: {} as Row,
        rowId: '__header__',
        rowIndex: 0,
        zone: 'header',
        rect: { x: 0, y: 0, width: this.width, height: this.headerHeight },
      }
    }

    const pinnedRows = this._resolveEffectivePinnedRows()
    const topRows = pinnedRows.top ?? []
    if (y >= this.headerHeight && y < this._viewport.bodyY) {
      const localIndex = Math.floor((y - this.headerHeight) / this.rowHeight)
      const row = topRows[localIndex]
      if (!row) {
        return null
      }
      return {
        row,
        rowId: this._resolveRenderedRowId('pinned-top', row, localIndex),
        rowIndex: localIndex,
        zone: 'pinned-top',
        rect: {
          x: 0,
          y: this.headerHeight + localIndex * this.rowHeight,
          width: this.width,
          height: this.rowHeight,
        },
      }
    }

    const bottomRows = pinnedRows.bottom ?? []
    const bottomStart = this.height - bottomRows.length * this.rowHeight
    if (bottomRows.length > 0 && y >= bottomStart && y <= this.height) {
      const localIndex = Math.floor((y - bottomStart) / this.rowHeight)
      const row = bottomRows[localIndex]
      if (!row) {
        return null
      }
      return {
        row,
        rowId: this._resolveRenderedRowId('pinned-bottom', row, localIndex),
        rowIndex: localIndex,
        zone: 'pinned-bottom',
        rect: {
          x: 0,
          y: bottomStart + localIndex * this.rowHeight,
          width: this.width,
          height: this.rowHeight,
        },
      }
    }

    if (y < this._viewport.bodyY || y > this._viewport.bodyY + this._viewport.bodyHeight) {
      return null
    }
    const rowIndex = Math.floor((this.scrollY + y - this._viewport.bodyY) / this.rowHeight)
    if (rowIndex < 0 || rowIndex >= this._viewPipeline.rowCount) {
      return null
    }
    const viewRow = this._viewPipeline.getViewRowAt(rowIndex)
    const row = viewRow?.kind === 'data' ? viewRow.row : undefined
    const rowId = viewRow?.rowId ?? this._viewPipeline.getRowIdAt(rowIndex)
    const storeIndex = viewRow?.storeIndex ?? this._viewPipeline.getStoreIndexAt(rowIndex)
    const zone = viewRow && viewRow.kind !== 'data' ? viewRow.kind : 'body'
    return {
      row,
      rowId,
      rowIndex,
      storeIndex,
      zone,
      rect: {
        x: 0,
        y: this._viewport.bodyY + rowIndex * this.rowHeight - this.scrollY,
        width: this.width,
        height: this.rowHeight,
      },
    }
  }

  /**
   * Нормализует и возвращает итоговое значение DataTableRootNode.
   */
  private _resolveColumnAt(x: number): VisibleColumnRect<Row> | null {
    for (const rect of this._visibleColumnRects('left')) {
      if (x >= rect.x && x <= rect.x + rect.width) {
        return rect
      }
    }
    for (const rect of this._visibleColumnRects('right')) {
      if (x >= rect.x && x <= rect.x + rect.width) {
        return rect
      }
    }
    if (x < this._viewport.bodyX || x > this._viewport.bodyX + this._viewport.bodyWidth) {
      return null
    }
    for (const rect of this._visibleColumnRects('center')) {
      if (x >= rect.x && x <= rect.x + rect.width) {
        return rect
      }
    }
    return null
  }

  /**
   * Создает runtime-сущность DataTableRootNode.
   */
  private _createCellContext(target: DataTableInteractionTarget<Row>): DataTableCellContext<Row> | null {
    if (isGroupInteractionZone(target.zone) || !target.row || target.rowId === undefined) {
      return null
    }
    return {
      row: target.row,
      rowId: target.rowId,
      rowIndex: target.rowIndex,
      viewRowIndex: target.rowIndex,
      storeIndex: target.storeIndex,
      column: target.column,
      columnIndex: target.columnIndex,
      value: target.value,
      rect: target.rect,
      state: this._createCellState(target.rect, target.rowId, target.rowIndex, target.storeIndex, {
        column: target.column,
        columnIndex: target.columnIndex,
        x: target.rect.x,
        width: target.rect.width,
      }, target.zone),
      zone: target.zone,
      store: this.store,
      api: this._api,
    }
  }

  /**
   * Запоминает последнюю локальную позицию pointer для синхронизации hover при scroll.
   */
  private _trackPointerPosition(event: MouseEvent): [number, number] {
    const position = this._toLocalPointerPosition(event)
    this._lastPointerPosition = { x: position[0], y: position[1] }
    return position
  }

  /**
   * Переводит pointer event в локальные координаты root node.
   */
  private _toLocalPointerPosition(event: MouseEvent): [number, number] {
    const position = this.events.getCanvasMousePosition(event)
    return this.toLocal(position.x, position.y)
  }

  /**
   * Синхронизирует native cursor для canvas-only resize affordance.
   */
  private _syncNativeCursor(x: number, y: number): void {
    if (this._resizeState || this._hitResizeHandle(x, y)) {
      this.nova.cursor('col-resize')
      return
    }
    this.nova.cursor('default')
  }

  /**
   * Восстанавливает cursor после drag lifecycle.
   */
  private _syncNativeCursorFromLastPosition(): void {
    const position = this._lastPointerPosition
    if (!position || !this._pointerInside) {
      this.nova.cursor('default')
      return
    }
    this._syncNativeCursor(position.x, position.y)
  }

  /**
   * Выполняет внутренний шаг hitResizeHandle для DataTableRootNode.
   */
  private _hitResizeHandle(x: number, y: number): VisibleColumnRect<Row> | null {
    const resizeHeight = this.headerHeight - this._filterRowHeight
    if (y < 0 || y > resizeHeight) {
      return null
    }

    for (const rect of this._visibleColumnRects()) {
      if (!rect.column.resizable) {
        continue
      }
      const edge = rect.x + rect.width
      if (Math.abs(x - edge) <= 5) {
        return rect
      }
    }
    return null
  }

  /**
   * Выполняет отрисовку DataTableRootNode.
   */
  private _renderScrollbars(): void {
    if (this.props.scrollbars === false || !this.props.scrollbars.nativeRenderer) {
      return
    }
    const geometry = this._createScrollbarGeometry()
    const state = this._getScrollbarState()
    if (state.alpha <= 0) {
      return
    }

    const schema: NovaSchema = []
    if (geometry.vertical) {
      schema.push(...createNovaScrollbarSchema(geometry.vertical, state))
    }

    if (geometry.horizontal) {
      schema.push(...createNovaScrollbarSchema(geometry.horizontal, state))
    }

    this._emitSchema(schema)
  }

  /**
   * Выполняет отрисовку DataTableRootNode.
   */
  private _renderScrollbarLayer(): void {
    const template = this.props.scrollbarLayerTemplate
    if (!template || this.props.scrollbars === false) {
      return
    }

    const schema = template(this._createScrollbarLayerContext())
    this._emitSchema(schema)
  }

  /**
   * Создает runtime-сущность DataTableRootNode.
   */
  private _createScrollbarLayerContext(): DataTableScrollbarLayerContext<Row> {
    const geometry = this._createScrollbarGeometry()
    return {
      horizontal: geometry.horizontal,
      vertical: geometry.vertical,
      viewport: this._viewport,
      state: this._getScrollbarState(),
      actions: {
        scrollTo: (x, y) => this.setScroll(x, y),
        scrollBy: (dx, dy) => this.setScroll(this.scrollX + dx, this.scrollY + dy),
        startDrag: (axis, event) => {
          if (!event) {
            return
          }
          this._trackPointerPosition(event)
          this._startScrollbarDrag(axis, event)
        },
      },
      store: this.store,
      api: this._api,
    }
  }

  /**
   * Создает runtime-сущность DataTableRootNode.
   */
  private _createScrollbarGeometry(): { horizontal: DataTableScrollbarGeometry | null, vertical: DataTableScrollbarGeometry | null } {
    if (this.props.scrollbars === false) {
      return { horizontal: null, vertical: null }
    }

    return {
      horizontal: this.props.scrollbars.horizontal === false || this._viewport.maxScrollX <= 0
        ? null
        : this._createHorizontalScrollbarGeometry(this.props.scrollbars.horizontal),
      vertical: this.props.scrollbars.vertical === false || this._viewport.maxScrollY <= 0
        ? null
        : this._createVerticalScrollbarGeometry(this.props.scrollbars.vertical),
    }
  }

  /**
   * Создает runtime-сущность DataTableRootNode.
   */
  private _createVerticalScrollbarGeometry(options: DataTableResolvedScrollbarAxisOptions): DataTableScrollbarGeometry {
    const inset = 4
    const trackHeight = Math.max(1, this._viewport.bodyHeight - inset * 2)
    const thickness = options.thickness
    return createNovaScrollbarGeometry({
      axis: 'vertical',
      track: {
        x: this.width - thickness - inset,
        y: this._viewport.bodyY + inset,
        width: thickness,
        height: trackHeight,
      },
      value: this.scrollY,
      viewportSize: this._viewport.bodyHeight,
      contentSize: this._viewport.contentHeight,
      options,
    }) as DataTableScrollbarGeometry
  }

  /**
   * Создает runtime-сущность DataTableRootNode.
   */
  private _createHorizontalScrollbarGeometry(options: DataTableResolvedScrollbarAxisOptions): DataTableScrollbarGeometry {
    const inset = 4
    const trackWidth = Math.max(1, this._viewport.bodyWidth - inset * 2)
    const thickness = options.thickness
    return createNovaScrollbarGeometry({
      axis: 'horizontal',
      track: {
        x: this._viewport.bodyX + inset,
        y: this.height - thickness - inset,
        width: trackWidth,
        height: thickness,
      },
      value: this.scrollX,
      viewportSize: this._viewport.bodyWidth,
      contentSize: this._viewport.contentWidth,
      options,
    }) as DataTableScrollbarGeometry
  }

  /**
   * Возвращает значение состояния DataTableRootNode.
   */
  private _getScrollbarState(): DataTableScrollbarState {
    return {
      alpha: this._resolveScrollbarAlpha(),
      hoveredAxis: this._hoveredScrollbarAxis,
      draggingAxis: this._scrollbarDragState?.axis ?? null,
      pointerInside: this._pointerInside,
    }
  }

  /**
   * Нормализует и возвращает итоговое значение DataTableRootNode.
   */
  private _resolveScrollbarAlpha(): number {
    if (this.props.scrollbars === false) {
      return 0
    }
    if (this._hasAlwaysVisibleScrollbar()) {
      return 1
    }
    return this._scrollbarAlpha
  }

  /**
   * Выполняет внутренний шаг hasAlwaysVisibleScrollbar для DataTableRootNode.
   */
  private _hasAlwaysVisibleScrollbar(): boolean {
    if (this.props.scrollbars === false) {
      return false
    }
    return (this.props.scrollbars.horizontal !== false && this.props.scrollbars.horizontal.visibility === 'always' && this._viewport.maxScrollX > 0)
      || (this.props.scrollbars.vertical !== false && this.props.scrollbars.vertical.visibility === 'always' && this._viewport.maxScrollY > 0)
  }

  /**
   * Выполняет внутренний шаг hasHoverVisibleScrollbar для DataTableRootNode.
   */
  private _hasHoverVisibleScrollbar(): boolean {
    if (this.props.scrollbars === false) {
      return false
    }
    return (this.props.scrollbars.horizontal !== false && this.props.scrollbars.horizontal.visibility === 'hover' && this._viewport.maxScrollX > 0)
      || (this.props.scrollbars.vertical !== false && this.props.scrollbars.vertical.visibility === 'hover' && this._viewport.maxScrollY > 0)
  }

  /**
   * Выполняет внутренний шаг hitScrollbar для DataTableRootNode.
   */
  private _hitScrollbar(x: number, y: number): DataTableScrollbarAxis | null {
    if (this._resolveScrollbarAlpha() <= 0) {
      return null
    }
    const geometry = this._createScrollbarGeometry()
    if (geometry.vertical && hitNovaScrollbarRect(x, y, geometry.vertical.track)) {
      return 'vertical'
    }
    if (geometry.horizontal && hitNovaScrollbarRect(x, y, geometry.horizontal.track)) {
      return 'horizontal'
    }
    return null
  }

  /**
   * Обновляет runtime-состояние DataTableRootNode.
   */
  private _updateHoveredScrollbarAxis(x: number, y: number): void {
    const next = this._hitScrollbar(x, y)
    if (next === this._hoveredScrollbarAxis) {
      return
    }
    this._hoveredScrollbarAxis = next
    this._refresh(['interaction'])
  }

  /**
   * Запускает runtime-процесс DataTableRootNode.
   */
  private _startScrollbarDrag(axis: DataTableScrollbarAxis, event: MouseEvent): void {
    const geometry = this._createScrollbarGeometry()
    const item = axis === 'horizontal' ? geometry.horizontal : geometry.vertical
    if (!item || item.max <= 0) {
      return
    }

    this._scrollbarDragState = {
      axis,
      startScrollX: this.scrollX,
      startScrollY: this.scrollY,
    }
    this._hoveredScrollbarAxis = axis
    this._revealScrollbars('scroll')
    this.capturePointer(event)
  }

  /**
   * Обновляет runtime-состояние DataTableRootNode.
   */
  private _updateScrollbarDrag(dx: number, dy: number): void {
    const drag = this._scrollbarDragState
    if (!drag) {
      return
    }
    const geometry = this._createScrollbarGeometry()
    const item = drag.axis === 'horizontal' ? geometry.horizontal : geometry.vertical
    if (!item || item.max <= 0) {
      return
    }

    if (drag.axis === 'horizontal') {
      this.setScroll(mapNovaScrollbarDragValue(item, drag.startScrollX, dx), this.scrollY)
    }
    else {
      this.setScroll(this.scrollX, mapNovaScrollbarDragValue(item, drag.startScrollY, dy))
    }
  }

  /**
   * Выполняет внутренний шаг revealScrollbars для DataTableRootNode.
   */
  private _revealScrollbars(reason: DataTableScrollbarVisibility): void {
    if (!this._shouldRevealScrollbars(reason)) {
      return
    }
    this._clearScrollbarHideTimer()
    if (this._scrollbarAlpha !== 1) {
      this._scrollbarAlpha = 1
      this._refresh(['interaction'])
    }
    this._scheduleScrollbarHide(reason)
  }

  /**
   * Выполняет внутренний шаг shouldRevealScrollbars для DataTableRootNode.
   */
  private _shouldRevealScrollbars(reason: DataTableScrollbarVisibility): boolean {
    if (this.props.scrollbars === false) {
      return false
    }
    if (reason === 'hover') {
      return (this.props.scrollbars.horizontal !== false && this.props.scrollbars.horizontal.visibility === 'hover')
        || (this.props.scrollbars.vertical !== false && this.props.scrollbars.vertical.visibility === 'hover')
    }
    if (reason === 'scroll') {
      return (this.props.scrollbars.horizontal !== false && this.props.scrollbars.horizontal.visibility === 'scroll')
        || (this.props.scrollbars.vertical !== false && this.props.scrollbars.vertical.visibility === 'scroll')
        || (this._pointerInside && (
          (this.props.scrollbars.horizontal !== false && this.props.scrollbars.horizontal.visibility === 'hover')
          || (this.props.scrollbars.vertical !== false && this.props.scrollbars.vertical.visibility === 'hover')
        ))
    }
    return this._hasAlwaysVisibleScrollbar()
  }

  /**
   * Планирует отложенное выполнение DataTableRootNode.
   */
  private _scheduleScrollbarHide(reason: DataTableScrollbarVisibility): void {
    if (this.props.scrollbars === false || this._hasAlwaysVisibleScrollbar() || this._scrollbarDragState) {
      return
    }
    this._clearScrollbarHideTimer()
    this._scrollbarHideTimer = setTimeout(() => {
      if (this._pointerInside && (reason === 'hover' || this._hasHoverVisibleScrollbar())) {
        return
      }
      this._scrollbarAlpha = 0
      this._refresh(['interaction'])
    }, this.props.scrollbars.hideDelay)
  }

  /**
   * Очищает накопленное состояние DataTableRootNode.
   */
  private _clearScrollbarHideTimer(): void {
    if (!this._scrollbarHideTimer) {
      return
    }
    clearTimeout(this._scrollbarHideTimer)
    this._scrollbarHideTimer = null
  }

  /**
   * Нормализует и возвращает итоговое значение DataTableRootNode.
   */
  private _resolveRenderedRowId(zone: DataTableCellContext<Row>['zone'], row: Row, rowIndex: number): DataTableRowId {
    if (zone === 'body') {
      return this._viewPipeline.getRowIdAt(rowIndex) ?? row.id ?? rowIndex
    }
    return row.id ?? `${zone}:${rowIndex}`
  }
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(Number.isFinite(value) ? value : min)))
}

function cloneColumnStateInput(state: DataTableColumnState): DataTableColumnState {
  return {
    widths: state.widths ? { ...state.widths } : undefined,
    order: state.order ? [...state.order] : undefined,
    hidden: state.hidden ? [...state.hidden] : undefined,
    pinned: state.pinned
      ? {
          left: state.pinned.left ? [...state.pinned.left] : undefined,
          right: state.pinned.right ? [...state.pinned.right] : undefined,
        }
      : undefined,
    groups: state.groups ? [...state.groups] : undefined,
    autosizeMode: state.autosizeMode,
    version: state.version,
  }
}

function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }
  if (target.isContentEditable) {
    return true
  }
  const tag = target.tagName.toLowerCase()
  return tag === 'input' || tag === 'textarea' || tag === 'select'
}

function resolveCoreTextSelectionOptions(
  options: DataTableRootResolvedProps['textSelection'],
) {
  if (!options) {
    return false
  }
  return {
    enabled: options.enabled,
    mode: options.mode === 'explicit' ? 'explicit' as const : 'all-text' as const,
    copy: true,
    drag: true,
    granularity: 'text' as const,
    clipboard: options.copyFormat === 'tsv' ? 'contextual' as const : 'plain' as const,
    selectionColor: options.selectionColor,
  }
}

function escapeTooltipMarkdown(value: string): string {
  return value.replace(/([\\`*_{}[\]()#+\-.!|>])/g, '\\$1')
}

function filterStateHasColumn(filters: DataTableViewState['filters'], columnId: string): boolean {
  if (Array.isArray(filters)) {
    return filters.some(rule => rule.columnId === columnId)
  }
  return filters.rules.some(rule => 'logic' in rule ? filterStateHasColumn(rule, columnId) : rule.columnId === columnId)
}

function collectFilterStateColumnIds(filters: DataTableViewState['filters'], result: Set<string>): void {
  if (Array.isArray(filters)) {
    for (const rule of filters) {
      result.add(rule.columnId)
    }
    return
  }
  for (const rule of filters.rules) {
    if ('logic' in rule) {
      collectFilterStateColumnIds(rule, result)
    }
    else { result.add(rule.columnId) }
  }
}

function summarizeColumnFilters(filters: DataTableViewState['filters'], columnId: string): string {
  const rules = collectColumnFilterRules(filters, columnId)
  if (rules.length === 0) {
    return ''
  }
  return rules
    .slice(0, 2)
    .map(rule => `${formatFilterOperator(rule.operator)} ${formatFilterValue(rule.value)}`)
    .join(' · ')
}

function collectColumnFilterRules(
  filters: DataTableViewState['filters'],
  columnId: string,
): Array<DataTableFilterRule> {
  if (Array.isArray(filters)) {
    return filters.filter(rule => rule.columnId === columnId)
  }
  return filters.rules.flatMap(rule => (
    'logic' in rule
      ? collectColumnFilterRules(rule, columnId)
      : rule.columnId === columnId
        ? [rule]
        : []
  ))
}

function resolveColumnFilterRule(filters: DataTableViewState['filters'], columnId: string): DataTableFilterRule | undefined {
  return collectColumnFilterRules(filters, columnId)[0]
}

function resolveDefaultFilterOperator(filter: unknown): DataTableFilterOperator {
  const operators = resolveFilterOperators(filter)
  return resolveFilterConfigValue(filter, 'defaultOperator') as DataTableFilterOperator | undefined
    ?? operators[0]
    ?? 'contains'
}

function resolveNextFilterOperator(filter: unknown, current?: DataTableFilterOperator): DataTableFilterOperator {
  const operators = resolveFilterOperators(filter)
  if (!current) {
    return operators[0] ?? resolveDefaultFilterOperator(filter)
  }
  const index = operators.indexOf(current)
  return operators[(index + 1) % operators.length] ?? resolveDefaultFilterOperator(filter)
}

function resolveFilterOperators(filter: unknown): Array<DataTableFilterOperator> {
  const configured = resolveFilterConfigValue(filter, 'operators')
  if (Array.isArray(configured) && configured.length > 0) {
    return configured as Array<DataTableFilterOperator>
  }
  const preset = typeof filter === 'string'
    ? filter
    : resolveFilterConfigValue(filter, 'type')
  if (preset === 'number') {
    return ['equals', 'gt', 'gte', 'lt', 'lte']
  }
  if (preset === 'date') {
    return ['equals', 'gt', 'lt']
  }
  if (preset === 'set') {
    return ['in', 'notIn']
  }
  if (preset === 'boolean') {
    return ['is', 'isNot']
  }
  return ['contains', 'equals', 'startsWith', 'endsWith']
}

function resolveDefaultFilterValue(filter: unknown): unknown {
  const defaultValue = resolveFilterConfigValue(filter, 'defaultValue')
  if (defaultValue !== undefined) {
    return defaultValue
  }
  const options = resolveFilterOptions(filter)
  if (options.length > 0) {
    const operator = resolveDefaultFilterOperator(filter)
    if (operator === 'in' || operator === 'notIn') {
      return [options[0]]
    }
    return options[0]
  }
  const preset = typeof filter === 'string'
    ? filter
    : resolveFilterConfigValue(filter, 'type')
  if (preset === 'number') {
    return 0
  }
  if (preset === 'boolean') {
    return true
  }
  return ''
}

function resolveNextFilterValue(filter: unknown, current: unknown): unknown {
  const options = resolveFilterOptions(filter)
  if (options.length === 0) {
    return current ?? resolveDefaultFilterValue(filter)
  }
  const currentValue = Array.isArray(current) ? current[0] : current
  const index = options.findIndex(option => Object.is(option, currentValue))
  const next = options[(index + 1) % options.length] ?? options[0]
  const operator = resolveDefaultFilterOperator(filter)
  return operator === 'in' || operator === 'notIn' ? [next] : next
}

function resolveFilterOptions(filter: unknown): Array<unknown> {
  const options = resolveFilterConfigValue(filter, 'options')
  if (Array.isArray(options)) {
    return options
  }
  const preset = typeof filter === 'string'
    ? filter
    : resolveFilterConfigValue(filter, 'type')
  if (preset === 'boolean') {
    return [true, false]
  }
  return []
}

function resolveFilterConfigValue(filter: unknown, key: string): unknown {
  if (!filter || typeof filter !== 'object') {
    return undefined
  }
  return (filter as Record<string, unknown>)[key]
}

function formatFilterOperator(operator: DataTableFilterOperator): string {
  const labels: Record<DataTableFilterOperator, string> = {
    contains: 'has',
    equals: '=',
    startsWith: '^',
    endsWith: '$',
    gt: '>',
    gte: '>=',
    lt: '<',
    lte: '<=',
    between: '<>',
    in: 'in',
    notIn: 'not',
    is: 'is',
    isNot: 'not',
  }
  return labels[operator] ?? operator
}

function formatFilterValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map(item => String(item)).join(', ')
  }
  if (value === undefined || value === null || value === '') {
    return 'empty'
  }
  return String(value)
}

function resolveFilterPlaceholder(filter: unknown): string {
  if (!filter) {
    return ''
  }
  if (typeof filter === 'string') {
    return filter
  }
  if (typeof filter === 'object' && filter && 'type' in filter) {
    return String((filter as { type?: unknown }).type ?? 'filter')
  }
  return 'filter'
}

function estimateSearchTextWidth(value: string, fontSize: number): number {
  let width = 0
  for (const character of value) {
    if (character === ' ') {
      width += fontSize * 0.32
    }
    else if (/[il|.,:;]/.test(character)) {
      width += fontSize * 0.28
    }
    else if (/[mw@#]/i.test(character)) {
      width += fontSize * 0.82
    }
    else { width += fontSize * 0.56 }
  }
  return width
}

function isRenderedRow<Row extends Record<string, any>>(value: Row | RenderedTableRow<Row>): value is RenderedTableRow<Row> {
  return 'zone' in value && 'rowIndex' in value && 'kind' in value
}

function sameInteractionTarget<Row extends Record<string, any>>(
  left: DataTableInteractionTarget<Row> | null,
  right: DataTableInteractionTarget<Row> | null,
): boolean {
  if (left === right) {
    return true
  }
  if (!left || !right) {
    return false
  }
  if (isGroupInteractionZone(left.zone) || isGroupInteractionZone(right.zone)) {
    return left.rowId === right.rowId && left.zone === right.zone
  }
  return left.rowId === right.rowId && left.column.id === right.column.id && left.zone === right.zone
}

function sameInteractionGeometry<Row extends Record<string, any>>(
  left: DataTableInteractionTarget<Row>,
  right: DataTableInteractionTarget<Row>,
): boolean {
  return left.rowIndex === right.rowIndex
    && left.storeIndex === right.storeIndex
    && left.rect.x === right.rect.x
    && left.rect.y === right.rect.y
    && left.rect.width === right.rect.width
    && left.rect.height === right.rect.height
}

function sameSelectionRange(left: DataTableSelectionRange, right: DataTableSelectionRange): boolean {
  return left.unit === right.unit
    && left.startRowIndex === right.startRowIndex
    && left.endRowIndex === right.endRowIndex
    && (left.columnIds ?? []).join('\u0001') === (right.columnIds ?? []).join('\u0001')
}

function _parseClipboardMatrix(text: string, format: DataTablePasteParseFormat): Array<Array<string>> {
  const delimiter = format === 'csv' ? ',' : '\t'
  if (format === 'plain') {
    return [[text]]
  }
  if (format === 'auto' && !text.includes('\t') && text.includes(',')) {
    return parseDelimitedClipboard(text, ',')
  }
  return parseDelimitedClipboard(text, delimiter)
}

function parseDelimitedClipboard(text: string, delimiter: string): Array<Array<string>> {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter((line, index, lines) => line.length > 0 || index < lines.length - 1)
    .map(line => delimiter === ',' ? parseCsvLine(line) : line.split('\t'))
}

function parseCsvLine(line: string): Array<string> {
  const cells: Array<string> = []
  let value = ''
  let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (char === '"' && line[index + 1] === '"') {
      value += '"'
      index += 1
    }
    else if (char === '"') {
      quoted = !quoted
    }
    else if (char === ',' && !quoted) {
      cells.push(value)
      value = ''
    }
    else {
      value += char
    }
  }
  cells.push(value)
  return cells
}

function resolveClipboardFeedbackPalette(
  tone: DataTableClipboardFeedbackState['tone'],
): { background: string, border: string, accent: string, color: string } {
  if (tone === 'success') {
    return {
      background: '#ecfdf5',
      border: '#a7f3d0',
      accent: '#059669',
      color: '#064e3b',
    }
  }
  if (tone === 'warning') {
    return {
      background: '#fff7ed',
      border: '#fed7aa',
      accent: '#ea580c',
      color: '#7c2d12',
    }
  }
  if (tone === 'error') {
    return {
      background: '#fef2f2',
      border: '#fecaca',
      accent: '#dc2626',
      color: '#7f1d1d',
    }
  }
  return {
    background: '#f8fafc',
    border: '#cbd5e1',
    accent: '#64748b',
    color: '#0f172a',
  }
}

function stringifyClipboardValue(value: unknown): string {
  if (value === null || value === undefined) {
    return ''
  }
  if (typeof value === 'object') {
    return JSON.stringify(value)
  }
  return String(value)
}

function formatClipboardBlock(lines: Array<Array<string>>, format: DataTableClipboardFormat): string {
  if (format === 'html') {
    const rows = lines
      .map(line => `<tr>${line.map(value => `<td>${escapeHtmlCell(value)}</td>`).join('')}</tr>`)
      .join('')
    return `<table><tbody>${rows}</tbody></table>`
  }
  if (format === 'plain') {
    return lines.map(line => line.join(' ')).join('\n')
  }
  return lines.map(line => line.map(escapeTsvCell).join('\t')).join('\n')
}

function escapeHtmlCell(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function escapeTsvCell(value: string): string {
  return /[\t\n\r"]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

function cloneSerializable<T>(value: T): T {
  if (value === undefined || value === null) {
    return value
  }
  try {
    return JSON.parse(JSON.stringify(value)) as T
  }
  catch {
    return value
  }
}

function parseClipboardBoolean(value: unknown): boolean {
  const normalized = String(value ?? '').trim().toLowerCase()
  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on'
}

function isGroupInteractionZone(zone: DataTableCellContext['zone']): boolean {
  return zone === 'group' || zone === 'group-footer' || zone === 'grand-footer'
}

function modeHasRow(mode: DataTableHoverMode): boolean {
  return mode === 'row' || mode === 'row-column' || mode === 'row-cell'
}

function modeHasColumn(mode: DataTableHoverMode): boolean {
  return mode === 'column' || mode === 'row-column' || mode === 'column-cell'
}

function modeHasCell(mode: DataTableHoverMode): boolean {
  return mode === 'cell' || mode === 'row-cell' || mode === 'column-cell' || mode === 'row-column'
}

function searchHighlightHasRow(mode: DataTableSearchHighlightMode): boolean {
  return mode === 'row' || mode === 'row-cell' || mode === 'row-cell-text'
}

function searchHighlightHasCell(mode: DataTableSearchHighlightMode): boolean {
  return mode === 'cell' || mode === 'cell-text' || mode === 'row-cell' || mode === 'row-cell-text'
}

function searchHighlightHasText(mode: DataTableSearchHighlightMode): boolean {
  return mode === 'text' || mode === 'cell-text' || mode === 'row-cell-text'
}
