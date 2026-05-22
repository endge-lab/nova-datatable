import {
  buildBoxSchema,
  NovaUIKit,
  type TooltipContent,
  type TooltipModifier,
  type TooltipProps,
  type NovaUiLayoutRect,
  NovaUiComponentNode,
  createNovaScrollbarGeometry,
  createNovaScrollbarSchema,
  hitNovaScrollbarRect,
  mapNovaScrollbarDragValue,
} from '@endge/nova-ui-kit'
import {
  NovaTextSelectionService,
  parseNovaColor,
  type NovaTextSelectionRange,
  type NovaApp,
  type NovaDragEventMeta,
  type NovaRectBatch,
  type NovaSchema,
  type NovaSurface,
} from '@endge/nova'
import type { EventList } from '@endge/utils'
import { createDataTableStore } from '@/model/module/DataTableStore'
import {
  autosizeDataTableColumn,
  clampWidth,
  resolveDataTableColumns,
  resolveDataTableValue,
} from '@/model/runtime/datatable-columns'
import { createDataTableViewport } from '@/model/runtime/datatable-layout'
import { DataTableViewPipeline } from '@/model/runtime/DataTableViewPipeline'
import { DataTableServerRowModel } from '@/model/runtime/DataTableServerRowModel'
import { DataTableInvalidationScope } from '@/model/runtime/DataTableInvalidationScope'
import { DataTableRuntimeActions } from '@/model/runtime/DataTableRuntimeActions'
import { DataTableSummaryEngine, type DataTableSummaryRule } from '@/model/runtime/DataTableSummaryEngine'
import {
  createDataTableClipboardFeedbackHidden,
  createDataTableClipboardPasteErrorFeedback,
  createDataTableClipboardPasteFeedback,
  type DataTableClipboardFeedbackState,
} from '@/model/runtime/DataTableClipboardFeedback'
import { createDataTableAccessibilityState } from '@/model/runtime/DataTableAccessibility'
import { createDataTableFillDeltas } from '@/model/runtime/DataTableFillHandle'
import { parseDataTableClipboardMatrix } from '@/model/runtime/DataTableFillMatrix'
import { DataTableTransactionHistory } from '@/model/runtime/DataTableTransactionHistory'
import {
  DATATABLE_ROOT_NODE_DESCRIPTOR,
  normalizeDataTableRootProps,
  type DataTableRootDescriptor,
} from '@/ui/root/datatable-root.config'
import type {
  DataTableActiveCellDirection,
  DataTableAccessibilityState,
  DataTableCellContext,
  DataTableCellRect,
  DataTableColumnInput,
  DataTableColumnState,
  DataTableDelta,
  DataTableDirtyState,
  DataTableEditContext,
  DataTableEditCommitPayload,
  DataTableEditingState,
  DataTableEditorType,
  DataTableFilterOperator,
  DataTableFilterRule,
  DataTableFillDirection,
  DataTableFillHandleOptions,
  DataTableGroupNode,
  DataTableGroupTemplateContext,
  DataTableHoverMode,
  DataTableInteractionState,
  DataTableInteractionTarget,
  DataTableClipboardFormat,
  DataTableKeyboardAction,
  DataTablePinnedRowPosition,
  DataTablePersistedState,
  DataTableQueryState,
  DataTableResolvedColumn,
  DataTableResolvedClipboardOptions,
  DataTableResolvedColumnState,
  DataTableResolvedScrollbarAxisOptions,
  DataTableResolvedZoomWheelOptions,
  DataTableRootApi,
  DataTableRootOptions,
  DataTableRootProps,
  DataTableRootResolvedProps,
  DataTableRowId,
  DataTableSearchDirection,
  DataTableSearchHighlightMode,
  DataTablePasteParseFormat,
  DataTableSelectionAnchor,
  DataTableSelectionRange,
  DataTableSelectionUnit,
  DataTableSelectionUpdateOptions,
  DataTableScrollbarAxis,
  DataTableScrollbarGeometry,
  DataTableScrollbarLayerContext,
  DataTableScrollbarState,
  DataTableScrollbarVisibility,
  DataTableSelectionState,
  DataTablePasteResult,
  DataTableStoreApi,
  DataTableStateSlice,
  DataTableSummaryState,
  DataTableTooltipContext,
  DataTableTransaction,
  DataTableViewport,
  DataTableViewRow,
  DataTableViewState,
  DataTableZoomOptions,
  DataTableZoomState,
  DataTablePasteInvalidCell,
} from '@/model/types/datatable.types'

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

type ColumnMenuActionId =
  | 'sort-asc'
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

type DataTableRenderLayerId =
  | 'base'
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

interface DataTableRenderSegment {
  schema: NovaSchema
  clip?: DataTableCellRect
}

interface DataTableRenderLayerCache {
  id: DataTableRenderLayerId
  segments: Array<DataTableRenderSegment>
  dirty: boolean
  initialized: boolean
  rebuilds: number
}

interface DataTableRenderLayerDiagnostics {
  layerRebuilds: Record<DataTableRenderLayerId, number>
  templateCalls: number
  interactionRebuilds: number
  animatedLayerRebuilds: number
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

const DATA_TABLE_GRID_RENDER_LAYERS: Array<DataTableRenderLayerId> = [
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
    interactionRebuilds: 0,
    animatedLayerRebuilds: 0,
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

  private readonly api: DataTableRootApi<Row>
  private viewPipeline: DataTableViewPipeline<Row>
  private serverRowModel: DataTableServerRowModel<Row>
  private readonly textSelection = new NovaTextSelectionService<DataTableTextSelectionContext>()
  private readonly summaryEngine = new DataTableSummaryEngine<Row>()
  private transactionHistory!: DataTableTransactionHistory<Row>
  private readonly widthOverrides = new Map<string, number>()
  private columnStateOverride: DataTableColumnState | null = null
  private readonly columnIndexById = new Map<string, number>()
  private statePersistenceTimer: ReturnType<typeof setTimeout> | null = null
  private readonly pendingDeltas: Array<DataTableDelta<Row>> = []
  private resolvedColumns: Array<DataTableResolvedColumn<Row>> = []
  private viewport: DataTableViewport
  private resizeState: ResizeState<Row> | null = null
  private columnDragState: ColumnDragState<Row> | null = null
  private columnMenuState: ColumnMenuState<Row> | null = null
  private readonly columnDragLayoutMotion = new Map<string, ColumnDragLayoutMotion>()
  private textSelectionActive = false
  private suppressNextHeaderClick = false
  private hoverTarget: DataTableInteractionTarget<Row> | null = null
  private hoverActive = false
  private selection: DataTableSelectionState | null = null
  private selectionActive = false
  private selectionDragState: SelectionDragState | null = null
  private selectionIdCounter = 0
  private clipboardFeedback: DataTableClipboardFeedbackState<Row> = createDataTableClipboardFeedbackHidden() as DataTableClipboardFeedbackState<Row>
  private clipboardFeedbackHideTimer: ReturnType<typeof setTimeout> | null = null
  private visibleCellKeys = new Set<string>()
  private nextVisibleCellKeys = new Set<string>()
  private cellEnterStartedAt = new Map<string, number>()
  private cellEnterRenderCount = 0
  private suppressCellEnterUntil = 0
  private suppressTextSelectionIndexUntil = 0
  private textRefinementUntil = 0
  private visibleAnimatedCells = false
  private activeRenderLayerId: DataTableRenderLayerId | null = null
  private activeRenderClip: DataTableCellRect | null = null
  private readonly renderLayers = createRenderLayerCache()
  private readonly renderLayerDiagnostics = createRenderLayerDiagnostics()
  private readonly hoverOverlayBatch = createEmptyOverlayRectBatch(DATA_TABLE_HOVER_OVERLAY_BATCH_CAPACITY)
  private animationLoopLease: { release: () => void } | null = null
  private animationLoopSyncQueued = false
  private lastPointerPosition: { x: number; y: number } | null = null
  private pointerInside = false
  private hoveredScrollbarAxis: DataTableScrollbarAxis | null = null
  private scrollbarDragState: ScrollbarDragState | null = null
  private scrollbarAlpha = 0
  private scrollbarHideTimer: ReturnType<typeof setTimeout> | null = null
  private tooltipTarget: DataTableInteractionTarget<Row> | null = null
  private tooltipOpenTimer: ReturnType<typeof setTimeout> | null = null
  private tooltipHideTimer: ReturnType<typeof setTimeout> | null = null
  private editingState: DataTableEditingState<Row> | null = null
  private keyboardFocusActive = false
  private summaryState: DataTableSummaryState = {
    values: {},
    rowCount: 0,
    revision: 0,
    source: 'client',
    loading: false,
  }
  private serverSummaryRequestId = 0
  private serverSearchRequestId = 0
  private serverSearchCursor: string | undefined
  private serverSearchPreviousCursor: string | undefined
  private serverSearchHasMore = false
  private serverSearchInFlight = false
  private serverSearchResolveRequestId = 0
  private gestureStartZoomValue = 1
  private gestureActive = false
  private deltaFlushQueued = false
  private readonly handleEditingKeydown = (event: KeyboardEvent) => this.handleEditingKeydownEvent(event)
  private readonly handleKeyboardNavigationKeydown = (event: KeyboardEvent) => this.handleKeyboardNavigationKeydownEvent(event)
  private readonly handleKeyboardNavigationPointerDown = (event: PointerEvent) => this.handleKeyboardNavigationPointerDownEvent(event)
  private readonly handleTextSelectionKeydown = (event: KeyboardEvent) => this.handleTextSelectionKeydownEvent(event)
  private readonly handleTrackpadWheelCapture = (event: WheelEvent) => this.handleTrackpadWheelCaptureEvent(event)
  private readonly handleGestureStart = (event: Event) => this.handleTrackpadGestureStart(event as DataTableGestureEvent)
  private readonly handleGestureChange = (event: Event) => this.handleTrackpadGestureChange(event as DataTableGestureEvent)
  private readonly handleGestureEnd = (event: Event) => this.handleTrackpadGestureEnd(event as DataTableGestureEvent)
  private readonly tooltipModifiers = {
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
    options: { componentId?: string; children?: Array<unknown> } = {},
    descriptor: DataTableRootDescriptor = DATATABLE_ROOT_NODE_DESCRIPTOR,
  ) {
    super(app, surface, descriptor as never, props, options)

    this.store = props.store ?? createDataTableStore<Row>({
      rowKey: props.rowKey ?? ('id' as keyof Row),
      rows: props.rows ?? [],
      performance: props.performance,
    })
    this.viewPipeline = new DataTableViewPipeline(this.store)
    this.serverRowModel = new DataTableServerRowModel(this.store, delta => this.applyDeltas(delta))
    this.transactionHistory = new DataTableTransactionHistory(this.store, props.history)
    this.textSelection.configure(resolveCoreTextSelectionOptions(props.textSelection))
    const persistedState = this.readPersistedState()
    this.applyPersistedColumnState(persistedState)
    this.resolvedColumns = this.resolveColumns()
    this.syncViewPipeline()
    this.applyPersistedViewState(persistedState)
    this.viewport = this.createViewport()
    this.options({
      interactive: true,
      cursor: { hover: 'default', dragging: 'col-resize' },
    })
    this.setupEvents()
    this.setupTextSelectionKeyboardEvents()
    this.setupKeyboardNavigationEvents()
    this.setupTooltipKeyboardEvents()
    this.setupEditingKeyboardEvents()
    this.addDisposer(() => {
      this.releaseAnimationLoop()
      this.serverRowModel.dispose()
      this.teardownTrackpadGestureEvents()
      this.teardownTextSelectionKeyboardEvents()
      this.teardownKeyboardNavigationEvents()
      this.clearScrollbarHideTimer()
      this.clearStatePersistenceTimer()
      this.clearClipboardFeedbackTimer()
      this.clearTooltipTimers()
      this.teardownEditingKeyboardEvents()
    })

    this.api = {
      options: next => this.tableOptions(next),
      data: rows => this.tableData(rows),
      add: row => this.addRows(row),
      update: items => this.updateRows(items),
      remove: ids => this.removeRows(ids),
      setRows: rows => this.setRows(rows),
      replaceRange: (start, rows) => this.replaceRange(start, rows),
      applyDeltas: deltas => this.applyDeltas(deltas),
      flushDeltas: () => this.flushDeltas(),
      setColumnWidth: (columnId, width) => this.applyColumnWidth(columnId, width),
      autosizeColumn: columnId => this.autosizeColumn(columnId),
      autosizeColumns: columnIds => this.autosizeColumns(columnIds),
      resetColumnWidth: columnId => this.resetColumnWidth(columnId),
      getColumnState: () => this.getColumnState(),
      setColumnState: state => this.setColumnState(state),
      resetColumnState: () => this.resetColumnState(),
      hideColumn: columnId => this.hideColumn(columnId),
      showColumn: columnId => this.showColumn(columnId),
      pinColumn: (columnId, side) => this.pinColumn(columnId, side),
      unpinColumn: columnId => this.unpinColumn(columnId),
      getPersistedState: () => this.getPersistedState(),
      saveState: () => this.saveState(),
      restoreState: () => this.restoreState(),
      resetPersistedState: () => this.resetPersistedState(),
      scrollTo: (x, y) => this.setScroll(x, y),
      scrollToRow: rowIndex => this.setScroll(this.scrollX, rowIndex * this.rowHeight),
      focusCell: (rowId, columnId) => this.focusCell(rowId, columnId),
      moveActiveCell: (direction, options) => this.moveActiveCell(direction, options),
      getZoom: () => this.getZoomState(),
      setZoom: value => this.setZoom(value),
      resetZoom: () => this.resetZoom(),
      startEdit: (rowId, columnId) => this.startEdit(rowId, columnId),
      commitEdit: value => this.commitEdit(value),
      cancelEdit: () => this.cancelEdit(),
      getEditingState: () => this.cloneEditingState(),
      undo: () => this.undo(),
      redo: () => this.redo(),
      canUndo: () => this.transactionHistory.canUndo(),
      canRedo: () => this.transactionHistory.canRedo(),
      clearHistory: () => this.transactionHistory.clear(),
      getHistoryState: () => this.transactionHistory.state(),
      clearSelectionValues: () => this.clearSelectionValues(),
      fillSelection: (direction, options) => this.fillSelection(direction, options),
      getAccessibilityState: () => this.getAccessibilityState(),
      refresh: () => this.refresh(),
      batch: callback => this.batch(callback),
      getViewport: () => ({ ...this.viewport }),
      getInteraction: () => this.getInteractionState(),
      clearHover: () => this.clearHover(),
      getSelection: () => this.cloneSelectionState(),
      setSelection: selection => this.setSelection(selection),
      selectCell: (rowId, columnId, options) => this.selectCell(rowId, columnId, options),
      selectRow: (rowId, options) => this.selectRow(rowId, options),
      selectColumn: (columnId, options) => this.selectColumn(columnId, options),
      selectRange: (range, options) => this.selectRange(range, options),
      addSelectionRange: range => this.addSelectionRange(range),
      removeSelectionRange: rangeId => this.removeSelectionRange(rangeId),
      isCellSelected: (rowId, columnId) => this.isCellSelected(rowId, columnId),
      isRowSelected: rowId => this.isRowSelected(rowId),
      isColumnSelected: columnId => this.isColumnSelected(columnId),
      copySelection: () => this.copySelection(),
      pasteClipboard: text => this.pasteClipboard(text),
      clearSelection: () => this.clearSelection(),
      getViewState: () => this.getViewState(),
      setSort: sort => this.setSort(sort),
      clearSort: columnId => this.clearSort(columnId),
      setFilter: (columnId, filter) => this.setFilter(columnId, filter),
      setFilters: filters => this.setFilters(filters),
      patchFilter: (columnId, filter) => this.setFilter(columnId, filter),
      clearFilter: columnId => this.clearFilter(columnId),
      clearFilters: columnId => this.clearFilter(columnId),
      setSearch: query => this.setSearch(query),
      clearSearch: () => this.clearSearch(),
      findNext: () => this.findNextSearchMatch(),
      findPrevious: () => this.findPreviousSearchMatch(),
      focusSearchMatch: index => this.focusSearchMatch(index),
      getSearchState: () => this.viewPipeline.getSearchState(),
      reorderRows: payload => this.reorderRows(payload),
      reorderColumns: payload => this.reorderColumns(payload),
      setColumnOrder: order => this.setColumnOrder(order, 'api'),
      resetColumnOrder: () => this.resetColumnOrder(),
      getGroupingState: () => this.viewPipeline.getGroupingState(),
      setGrouping: groups => this.setGrouping(groups),
      clearGrouping: () => this.clearGrouping(),
      toggleGroup: groupId => this.toggleGroup(groupId),
      expandGroup: groupId => this.expandGroup(groupId),
      collapseGroup: groupId => this.collapseGroup(groupId),
      expandAllGroups: () => this.expandAllGroups(),
      collapseAllGroups: () => this.collapseAllGroups(),
      resetView: () => this.resetView(),
      setChildren: children => this.setChildren(children),
    }
  }

  /**
   * Обрабатывает входящее событие DataTableRootNode.
   */
  protected override onMount(): void {
    super.onMount()
    this.setupTrackpadGestureEvents()
  }

  /**
   * Обрабатывает входящее событие DataTableRootNode.
   */
  protected override onUnmount(): void {
    this.teardownTrackpadGestureEvents()
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
    return Math.max(18, Math.round(this.props.rowHeight * this.zoomRowScale))
  }

  /**
   * Возвращает текущую высоту header с учетом zoom.
   */
  get headerHeight(): number {
    return Math.max(24, Math.round(this.props.headerHeight * this.zoomHeaderScale))
  }

  /**
   * Возвращает высоту встроенной filter row внутри header зоны.
   */
  private get filterRowHeight(): number {
    if (!this.props.view.filterUi || !this.props.view.filterUi.filterRow) return 0
    const available = this.headerHeight - 24
    if (available < 14) return 0
    return Math.max(14, Math.min(24, available))
  }

  /**
   * Возвращает zoom Value для DataTableRootNode.
   */
  private get zoomValue(): number {
    return this.props.zoom ? this.props.zoom.value : 1
  }

  /**
   * Возвращает zoom Row Scale для DataTableRootNode.
   */
  private get zoomRowScale(): number {
    return this.props.zoom ? this.props.zoom.rowScale : 1
  }

  /**
   * Возвращает zoom Header Scale для DataTableRootNode.
   */
  private get zoomHeaderScale(): number {
    return this.props.zoom ? this.props.zoom.headerScale : 1
  }

  /**
   * Возвращает zoom Column Scale для DataTableRootNode.
   */
  private get zoomColumnScale(): number {
    return this.props.zoom ? this.props.zoom.columnScale : 1
  }

  /**
   * Возвращает zoom Text Scale для DataTableRootNode.
   */
  private get zoomTextScale(): number {
    return this.props.zoom ? this.props.zoom.textScale : 1
  }

  /**
   * Возвращает zoom Icon Scale для DataTableRootNode.
   */
  private get zoomIconScale(): number {
    return this.props.zoom ? this.props.zoom.iconScale : 1
  }

  /**
   * Возвращает font Size для DataTableRootNode.
   */
  private get fontSize(): number {
    return Math.max(9, Math.round((this.props.fontSize ?? 13) * this.zoomTextScale))
  }

  /**
   * Возвращает line Height для DataTableRootNode.
   */
  private get lineHeight(): number {
    return Math.max(10, Math.round((this.props.lineHeight ?? 18) * this.zoomTextScale))
  }

  /**
   * Отдает публичный API наружу.
   */
  override getApi(): DataTableRootApi<Row> {
    return this.api
  }

  /**
   * Синхронизирует размеры root node с layout-родителем.
   */
  override applyLayoutRect(rect: NovaUiLayoutRect): boolean {
    const changed = super.applyLayoutRect(rect)
    if (!changed) return false

    this.props.width = rect.width
    this.props.height = rect.height
    this.refresh(['layout', 'viewport'])
    return true
  }

  /**
   * Пересчитывает runtime перед кадром.
   */
  override update(): void {
    this.resolvedColumns = this.resolveColumns()
    this.syncViewPipeline()
    this.viewport = this.createViewport()
    this.syncServerRowModel()
    const revisionBeforeRangeLoad = this.store.takeRevision()
    const rangeLoader = this.isServerRowModelActive()
      ? this.serverRowModel.ensureRange(this.viewport.rowRange)
      : this.store.ensureRange(this.viewport.rowRange, this.resolveSourceQuery()).then(() => true)
    void rangeLoader.then(fresh => {
      if (fresh && this.store.takeRevision() !== revisionBeforeRangeLoad) this.refresh(['data'])
      return undefined
    })
    this.props.onViewportChange?.({ ...this.viewport })
    this.syncSummaryState()
  }

  /**
   * Рендерит все видимые зоны таблицы.
   */
  override render(): void {
    this.textSelection.configure(resolveCoreTextSelectionOptions(this.props.textSelection))
    if (this.shouldRebuildTextSelectionTargets()) this.textSelection.beginFrame()
    this.renderGrid()
    this.continueTextRefinementIfNeeded()
  }

  /**
   * Реагирует на новые props.
   */
  protected override onPropsChanged(changedKeys: Array<keyof DataTableRootResolvedProps<Row>>): void {
    this.props = normalizeDataTableRootProps(this.props)
    this.textSelection.configure(resolveCoreTextSelectionOptions(this.props.textSelection))
    this.applyCommonPropsChanged(changedKeys)
    if (changedKeys.includes('store') && this.props.store && this.props.store !== this.store) {
      this.store = this.props.store
      this.viewPipeline = new DataTableViewPipeline(this.store)
      this.serverRowModel.dispose()
      this.serverRowModel = new DataTableServerRowModel(this.store, delta => this.applyDeltas(delta))
      this.transactionHistory = new DataTableTransactionHistory(this.store, this.props.history)
      this.scrollX = 0
      this.scrollY = 0
      this.hoverTarget = null
      this.selection = null
      this.selectionActive = false
      this.selectionDragState = null
      this.cancelEdit()
    }
    if (changedKeys.includes('columnState')) {
      this.columnStateOverride = null
      this.widthOverrides.clear()
      if (this.props.columnState.order.length > 0) {
        this.viewPipeline.setColumnOrder(this.props.columnState.order, this.getColumnStateInputColumns())
      }
    }
    if (
      changedKeys.includes('selection')
      && (this.props.selection === false || !this.props.selection.enabled || this.props.selection.mode === 'none')
    ) {
      this.clearSelection()
    }
    if (changedKeys.includes('scrollbars')) {
      this.clearScrollbarHideTimer()
      this.hoveredScrollbarAxis = null
      this.scrollbarDragState = null
      this.scrollbarAlpha = 0
    }
    if (changedKeys.includes('tooltip')) {
      this.clearTooltipTimers()
      this.tooltipTarget = null
      this.tooltipAlpha = 0
    }
    if (changedKeys.includes('statePersistence')) {
      this.clearStatePersistenceTimer()
      if (this.props.statePersistence) this.restoreState()
    }
    if (changedKeys.includes('history')) this.transactionHistory.configure(this.props.history)
    if (changedKeys.includes('editing') && this.props.editing === false) this.cancelEdit()
    if (changedKeys.includes('rows') && this.props.rows && !this.props.store) this.store.setRows(this.props.rows)
    this.refresh(this.resolveRefreshKindsForProps(changedKeys))
  }

  /**
   * Обновляет scroll с clamping.
   */
  setScroll(x: number, y: number): void {
    const delta = Math.abs(x - this.scrollX) + Math.abs(y - this.scrollY)
    this.scrollX = x
    this.scrollY = y
    this.viewport = this.createViewport()
    this.scrollX = this.viewport.scrollX
    this.scrollY = this.viewport.scrollY
    if (delta > this.rowHeight * 4) this.suppressCellEnterUntil = performance.now() + 160
    if (delta > 0) {
      this.suppressTextSelectionIndexFor('scroll')
      this.requestTextRefinement('scroll')
      this.columnMenuState = null
    }
    if (delta > 0) this.revealScrollbars('scroll')
    this.syncHoverAfterViewportChange()
    this.syncEditingRect()
    this.refresh(['viewport'])
  }

  /**
   * Применяет пользовательскую ширину колонки.
   */
  applyColumnWidth(columnId: string, width: number): boolean {
    const column = this.resolvedColumns.find(item => item.id === columnId)
    const input = this.props.columns.find(item => item.id === columnId)
    if (!column || !input) return false

    const previousWidth = column.resolvedWidth
    const nextWidth = clampWidth(width, column.minWidth, column.maxWidth)
    if (previousWidth === nextWidth) return false

    this.widthOverrides.set(columnId, nextWidth / this.zoomColumnScale)
    this.resolvedColumns = this.resolveColumns()
    const nextColumn = this.resolvedColumns.find(item => item.id === columnId) ?? column
    this.props.onColumnResize?.({
      column: nextColumn,
      width: nextWidth,
      previousWidth,
    })
    this.emitColumnStateChange()
    this.refresh(['layout', 'columns'])
    return true
  }

  /**
   * Автоматически подбирает ширину одной колонки.
   */
  autosizeColumn(columnId: string): boolean {
    const column = this.props.columns.find(item => item.id === columnId)
    if (!column) return false

    this.widthOverrides.set(columnId, autosizeDataTableColumn(column, this.store))
    this.emitColumnStateChange()
    this.refresh(['layout', 'columns'])
    return true
  }

  /**
   * Автоматически подбирает ширины набора колонок.
   */
  autosizeColumns(columnIds?: Array<string>): void {
    const ids = new Set(columnIds ?? this.props.columns.map(column => column.id))
    for (const column of this.props.columns) {
      if (ids.has(column.id)) {
        this.widthOverrides.set(column.id, autosizeDataTableColumn(column, this.store))
      }
    }
    this.emitColumnStateChange()
    this.refresh(['layout', 'columns'])
  }

  /**
   * Сбрасывает пользовательскую ширину колонки.
   */
  resetColumnWidth(columnId: string): boolean {
    const changed = this.widthOverrides.delete(columnId)
    if (changed) {
      this.emitColumnStateChange()
      this.refresh(['layout', 'columns'])
    }
    return changed
  }

  /**
   * Возвращает состояние из configured storage.
   */
  private getPersistedState(): DataTablePersistedState<Row> | null {
    return this.readPersistedState()
  }

  /**
   * Сохраняет текущие runtime-срезы состояния.
   */
  private saveState(): DataTablePersistedState<Row> | null {
    const persistence = this.props.statePersistence
    const storage = this.resolveStatePersistenceStorage()
    if (!persistence || !storage) return null

    const state = this.createPersistedState()
    try {
      storage.setItem(persistence.key, JSON.stringify(state))
      return state
    } catch {
      return null
    }
  }

  /**
   * Восстанавливает состояние из configured storage.
   */
  private restoreState(): boolean {
    const state = this.readPersistedState()
    if (!state) return false

    this.applyPersistedColumnState(state)
    this.resolvedColumns = this.resolveColumns()
    this.syncViewPipeline()
    this.applyPersistedViewState(state)
    this.emitColumnStateChange()
    this.emitViewQuery('all')
    this.refresh(['columns', 'layout', 'data'])
    return true
  }

  /**
   * Удаляет сохраненное состояние.
   */
  private resetPersistedState(): void {
    const storage = this.resolveStatePersistenceStorage()
    const persistence = this.props.statePersistence
    this.clearStatePersistenceTimer()
    if (!storage || !persistence) return
    try {
      storage.removeItem(persistence.key)
    } catch {
      // Storage can be unavailable in private mode; reset remains best effort.
    }
  }

  /**
   * Собирает serializable snapshot текущего runtime state.
   */
  private createPersistedState(): DataTablePersistedState<Row> {
    const viewState = this.viewPipeline.getState()
    const state: DataTablePersistedState<Row> = {
      version: this.props.statePersistence ? this.props.statePersistence.version : 1,
      savedAt: Date.now(),
    }
    if (this.isStateSliceIncluded('columnState')) {
      state.columnState = this.toColumnStateInput(this.getColumnState())
    }
    if (this.isStateSliceIncluded('sort')) state.sort = [...viewState.sort]
    if (this.isStateSliceIncluded('filters')) state.filters = cloneSerializable(viewState.filters)
    if (this.isStateSliceIncluded('search')) {
      state.search = cloneSerializable(viewState.search.query)
    }
    if (this.isStateSliceIncluded('grouping')) {
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
  private scheduleStatePersistence(): void {
    const persistence = this.props.statePersistence
    if (!persistence) return
    this.clearStatePersistenceTimer()
    if (persistence.debounceMs <= 0) {
      this.saveState()
      return
    }
    this.statePersistenceTimer = setTimeout(() => {
      this.statePersistenceTimer = null
      this.saveState()
    }, persistence.debounceMs)
  }

  /**
   * Очищает отложенный persistence timer.
   */
  private clearStatePersistenceTimer(): void {
    if (!this.statePersistenceTimer) return
    clearTimeout(this.statePersistenceTimer)
    this.statePersistenceTimer = null
  }

  /**
   * Проверяет, входит ли срез в configured persistence include.
   */
  private isStateSliceIncluded(slice: DataTableStateSlice): boolean {
    return !!this.props.statePersistence && this.props.statePersistence.include.includes(slice)
  }

  /**
   * Читает persisted state без выброса исключений наружу.
   */
  private readPersistedState(): DataTablePersistedState<Row> | null {
    const persistence = this.props.statePersistence
    const storage = this.resolveStatePersistenceStorage()
    if (!persistence || !storage) return null

    try {
      const raw = storage.getItem(persistence.key)
      if (!raw) return null
      const parsed = JSON.parse(raw) as Partial<DataTablePersistedState<Row>>
      if (typeof parsed.version !== 'number') return null
      if (parsed.version !== persistence.version) {
        return persistence.migrate
          ? persistence.migrate(parsed as DataTablePersistedState<Row>, parsed.version) as DataTablePersistedState<Row>
          : null
      }
      return parsed as DataTablePersistedState<Row>
    } catch {
      return null
    }
  }

  /**
   * Возвращает configured browser storage.
   */
  private resolveStatePersistenceStorage(): Storage | null {
    const persistence = this.props.statePersistence
    if (!persistence || typeof window === 'undefined') return null
    try {
      return persistence.storage === 'sessionStorage' ? window.sessionStorage : window.localStorage
    } catch {
      return null
    }
  }

  /**
   * Применяет persisted column state до resolution колонок.
   */
  private applyPersistedColumnState(state: DataTablePersistedState<Row> | null): void {
    if (!state?.columnState || !this.isStateSliceIncluded('columnState')) return
    this.columnStateOverride = cloneColumnStateInput(state.columnState)
    this.widthOverrides.clear()
  }

  /**
   * Применяет persisted view state после sync pipeline.
   */
  private applyPersistedViewState(state: DataTablePersistedState<Row> | null): void {
    if (!state) return
    if (state.sort && this.isStateSliceIncluded('sort') && this.props.view.sorting) {
      this.viewPipeline.setSort(state.sort)
    }
    if (state.filters && this.isStateSliceIncluded('filters') && this.props.view.filtering) {
      this.viewPipeline.setFilters(state.filters)
    }
    if (state.search && this.isStateSliceIncluded('search') && this.props.view.search) {
      this.viewPipeline.setSearch(state.search)
    }
    if (state.grouping && this.isStateSliceIncluded('grouping') && this.props.view.grouping) {
      this.viewPipeline.setGrouping(state.grouping.enabled ? state.grouping.groups : [])
      this.viewPipeline.setGroupingExpanded(state.grouping.expanded)
    }
  }

  /**
   * Возвращает сохраненное состояние колонок с учетом runtime override.
   */
  private getColumnState(): DataTableResolvedColumnState {
    const merged = this.resolveMergedColumnState()
    const widths: Record<string, number> = { ...merged.widths }
    for (const [columnId, width] of this.widthOverrides) widths[columnId] = width
    const runtimeOrder = this.viewPipeline.getState().columnOrder
    return {
      widths,
      order: this.resolveColumnStateOrder(runtimeOrder, merged),
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
  private setColumnState(state: DataTableColumnState): void {
    this.columnStateOverride = cloneColumnStateInput(state)
    this.widthOverrides.clear()
    this.viewPipeline.setColumnOrder(state.order ?? [], this.getColumnStateInputColumns(state))
    this.resolvedColumns = this.resolveColumns()
    this.emitColumnStateChange()
    this.emitViewQuery('column')
    this.refresh(['columns', 'layout'])
  }

  /**
   * Сбрасывает runtime-состояние колонок к props/default.
   */
  private resetColumnState(): void {
    this.columnStateOverride = null
    this.widthOverrides.clear()
    this.viewPipeline.resetColumnOrder()
    this.resolvedColumns = this.resolveColumns()
    this.emitColumnStateChange()
    this.emitViewQuery('column')
    this.refresh(['columns', 'layout'])
  }

  /**
   * Скрывает колонку без удаления ее definition.
   */
  private hideColumn(columnId: string): void {
    const state = this.toColumnStateInput(this.getColumnState())
    state.hidden = [...new Set([...(state.hidden ?? []), columnId])]
    this.setColumnState(state)
  }

  /**
   * Показывает ранее скрытую колонку.
   */
  private showColumn(columnId: string): void {
    const state = this.toColumnStateInput(this.getColumnState())
    state.hidden = (state.hidden ?? []).filter(id => id !== columnId)
    this.setColumnState(state)
  }

  /**
   * Закрепляет колонку слева или справа.
   */
  private pinColumn(columnId: string, side: DataTableResolvedColumn<Row>['pinned']): void {
    if (!side) return
    const state = this.toColumnStateInput(this.getColumnState())
    const pinned = {
      left: (state.pinned?.left ?? []).filter(id => id !== columnId),
      right: (state.pinned?.right ?? []).filter(id => id !== columnId),
    }
    pinned[side] = [...pinned[side], columnId]
    state.pinned = pinned
    this.setColumnState(state)
  }

  /**
   * Снимает закрепление с колонки.
   */
  private unpinColumn(columnId: string): void {
    const state = this.toColumnStateInput(this.getColumnState())
    state.pinned = {
      left: (state.pinned?.left ?? []).filter(id => id !== columnId),
      right: (state.pinned?.right ?? []).filter(id => id !== columnId),
    }
    this.setColumnState(state)
  }

  /**
   * Инвалидирует области таблицы и runtime.
   */
  invalidateDataTable(kinds: Array<string>): void {
    this.refresh(kinds)
  }

  /**
   * Заменяет runtime children.
   */
  setChildren(children: Array<unknown>): void {
    void children
    this.refresh(['custom'])
  }

  /**
   * Выполняет внутренний шаг tableOptions для DataTableRootNode.
   */
  private tableOptions(next?: Partial<DataTableRootOptions<Row>>): DataTableRootOptions<Row> {
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
        columnState: this.getColumnState(),
        statePersistence: this.props.statePersistence,
        performance: this.props.performance,
      }
    }

    this.setProps(next as Partial<DataTableRootResolvedProps<Row>>)
    return this.tableOptions()
  }

  /**
   * Возвращает значение состояния DataTableRootNode.
   */
  private getZoomState(): DataTableZoomState {
    return {
      value: this.zoomValue,
      mode: this.props.zoom ? this.props.zoom.mode : 'density',
      affects: this.props.zoom ? [...this.props.zoom.affects] : ['rows', 'headers', 'text', 'icons'],
      rowScale: this.zoomRowScale,
      headerScale: this.zoomHeaderScale,
      columnScale: this.zoomColumnScale,
      textScale: this.zoomTextScale,
      iconScale: this.zoomIconScale,
    }
  }

  /**
   * Обновляет значение состояния DataTableRootNode.
   */
  private setZoom(value: number | DataTableZoomOptions): void {
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

    this.applyZoom(nextZoom)
  }

  /**
   * Сбрасывает состояние к базовым значениям DataTableRootNode.
   */
  private resetZoom(): void {
    this.applyZoom({ value: 1 })
  }

  /**
   * Применяет подготовленное состояние DataTableRootNode.
   */
  private applyZoom(zoom: DataTableZoomOptions): void {
    const previousViewport = this.viewport
    const pointer = this.lastPointerPosition
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
    this.resolvedColumns = this.resolveColumns()
    this.syncViewPipeline()
    this.viewport = this.createViewport()
    const nextX = this.viewport.contentWidth * anchorXRatio - relativeX
    const nextY = this.viewport.contentHeight * anchorYRatio - relativeY
    this.setScroll(nextX, nextY)
    this.refresh(['layout', 'viewport'])
    this.suppressTextSelectionIndexFor('zoom')
    this.requestTextRefinement('zoom')
    this.props.onZoomChange?.(this.getZoomState())
  }

  /**
   * Выполняет внутренний шаг tableData для DataTableRootNode.
   */
  private tableData(rows?: Array<Row>): Array<Row> {
    if (rows) this.setRows(rows)
    return this.store.getRows()
  }

  /**
   * Выполняет внутренний шаг addRows для DataTableRootNode.
   */
  private addRows(row: Row | Array<Row>): void {
    if (Array.isArray(row)) this.store.insertMany(row)
    else this.store.insert(row)
    this.refresh(['data', 'layout'])
  }

  /**
   * Обновляет runtime-состояние DataTableRootNode.
   */
  private updateRows(items: Array<Partial<Row> & { id: DataTableRowId }> | Partial<Row> & { id: DataTableRowId }): void {
    const patches = Array.isArray(items) ? items : [items]
    for (const patch of patches) {
      const { id, ...rest } = patch
      this.store.patch(id, rest as unknown as Partial<Row>)
    }
    this.refresh(['data'])
  }

  /**
   * Удаляет сущность из runtime-коллекции DataTableRootNode.
   */
  private removeRows(ids: DataTableRowId | Array<DataTableRowId>): void {
    if (Array.isArray(ids)) this.store.removeMany(ids)
    else this.store.remove(ids)
    this.refresh(['data', 'layout'])
  }

  /**
   * Обновляет значение состояния DataTableRootNode.
   */
  private setRows(rows: Array<Row>): void {
    this.store.setRows(rows)
    this.refresh(['data', 'layout'])
  }

  /**
   * Выполняет внутренний шаг replaceRange для DataTableRootNode.
   */
  private replaceRange(start: number, rows: Array<Row>): void {
    this.store.replaceRange(start, rows)
    this.refresh(['data', 'layout'])
  }

  /**
   * Применяет подготовленное состояние DataTableRootNode.
   */
  private applyDeltas(deltas: DataTableDelta<Row> | Array<DataTableDelta<Row>>): void {
    const items = Array.isArray(deltas) ? deltas : [deltas]
    if (items.length === 0) return

    this.pendingDeltas.push(...items)
    if (this.deltaFlushQueued) return

    this.deltaFlushQueued = true
    this.scheduleDeltaFlush()
  }

  /**
   * Принудительно завершает накопленные изменения DataTableRootNode.
   */
  private flushDeltas(): void {
    this.deltaFlushQueued = false
    this.flushDeltaQueue(false)
  }

  /**
   * Принудительно завершает накопленные изменения DataTableRootNode.
   */
  private flushDeltasWithinBudget(): void {
    this.deltaFlushQueued = false
    this.flushDeltaQueue(true)
  }

  /**
   * Принудительно завершает накопленные изменения DataTableRootNode.
   */
  private flushDeltaQueue(useBudget: boolean): void {
    if (this.pendingDeltas.length === 0) {
      return
    }

    const startedAt = performance.now()
    const budget = Math.max(1, this.props.performance.deltaFrameBudgetMs)
    do {
      const count = useBudget ? Math.min(this.pendingDeltas.length, 5_000) : this.pendingDeltas.length
      const deltas = this.pendingDeltas.splice(0, count)
      this.store.applyDeltaBatch(deltas)
      const dirty = this.store.getDirtyState()
      if (dirty.structural) {
        this.refresh(['data', 'layout', 'view', 'summary'])
      } else if (this.isDirtyStateVisible(dirty)) {
        this.refresh(['data', 'summary'])
      }
      this.store.clearDirtyState()
      this.syncSummaryState()
    } while (this.pendingDeltas.length > 0 && (!useBudget || performance.now() - startedAt < budget))

    if (this.pendingDeltas.length > 0 && useBudget) {
      this.deltaFlushQueued = true
      this.scheduleDeltaFlush()
    }
  }

  /**
   * Применяет пользовательскую transaction и записывает ее в history.
   */
  private commitDeltas(
    deltas: DataTableDelta<Row> | Array<DataTableDelta<Row>>,
    options: { source: DataTableTransaction<Row>['source']; label?: string; record?: boolean },
  ): DataTableTransaction<Row> | null {
    const transaction = this.transactionHistory.commit(deltas, options)
    this.refresh(['data', 'layout', 'summary', 'interaction'])
    return transaction
  }

  /**
   * Откатывает последнюю пользовательскую transaction.
   */
  private undo(): boolean {
    const changed = this.transactionHistory.undo()
    if (changed) this.refresh(['data', 'layout', 'summary', 'interaction'])
    return changed
  }

  /**
   * Повторяет последнюю отмененную transaction.
   */
  private redo(): boolean {
    const changed = this.transactionHistory.redo()
    if (changed) this.refresh(['data', 'layout', 'summary', 'interaction'])
    return changed
  }

  /**
   * Планирует применение server/SSE deltas не чаще одного раза за frame.
   */
  private scheduleDeltaFlush(): void {
    if (!this.nova.raph.loopEnabled && typeof queueMicrotask === 'function') {
      queueMicrotask(() => this.flushDeltasWithinBudget())
      return
    }
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => this.flushDeltasWithinBudget())
      return
    }
    setTimeout(() => this.flushDeltasWithinBudget(), 0)
  }

  /**
   * Выполняет внутренний шаг isDirtyStateVisible для DataTableRootNode.
   */
  private isDirtyStateVisible(dirty: DataTableDirtyState): boolean {
    if (dirty.structural) return true

    const pageSize = this.props.performance.pageSize
    for (const page of dirty.pages) {
      const start = page * pageSize
      const end = start + pageSize
      if (end >= this.viewport.rowRange.start && start <= this.viewport.rowRange.end) return true
    }

    for (const rowId of dirty.rows) {
      const rowIndex = this.viewPipeline.findViewIndexByRowId(rowId)
      if (rowIndex !== undefined && rowIndex >= this.viewport.rowRange.start && rowIndex < this.viewport.rowRange.end) {
        return true
      }
    }
    return false
  }

  /**
   * Выполняет внутренний шаг batch для DataTableRootNode.
   */
  private batch(callback: (api: DataTableRootApi<Row>) => void): void {
    this.store.batch(() => callback(this.api))
    this.refresh(['data', 'layout'])
  }

  /**
   * Возвращает значение состояния DataTableRootNode.
   */
  private getViewState(): DataTableViewState {
    return this.viewPipeline.getState()
  }

  /**
   * Обновляет значение состояния DataTableRootNode.
   */
  private setSort(sort: Parameters<DataTableRootApi<Row>['setSort']>[0]): void {
    this.viewPipeline.setSort(sort)
    this.emitViewQuery('sort')
    this.setScroll(this.scrollX, 0)
    this.refresh(['data', 'layout'])
  }

  /**
   * Очищает накопленное состояние DataTableRootNode.
   */
  private clearSort(columnId?: string): void {
    this.viewPipeline.clearSort(columnId)
    this.emitViewQuery('sort')
    this.setScroll(this.scrollX, 0)
    this.refresh(['data', 'layout'])
  }

  /**
   * Обновляет значение состояния DataTableRootNode.
   */
  private setFilter(columnId: string, filter: Parameters<DataTableRootApi<Row>['setFilter']>[1]): void {
    this.viewPipeline.setFilter(columnId, filter)
    this.emitViewQuery('filter')
    this.setScroll(this.scrollX, 0)
    this.refresh(['data', 'layout'])
  }

  /**
   * Обновляет значение состояния DataTableRootNode.
   */
  private setFilters(filters: Parameters<DataTableRootApi<Row>['setFilters']>[0]): void {
    this.viewPipeline.setFilters(filters)
    this.emitViewQuery('filter')
    this.setScroll(this.scrollX, 0)
    this.refresh(['data', 'layout'])
  }

  /**
   * Очищает накопленное состояние DataTableRootNode.
   */
  private clearFilter(columnId?: string): void {
    this.viewPipeline.clearFilter(columnId)
    this.emitViewQuery('filter')
    this.setScroll(this.scrollX, 0)
    this.refresh(['data', 'layout'])
  }

  /**
   * Обновляет значение состояния DataTableRootNode.
   */
  private setSearch(query: Parameters<DataTableRootApi<Row>['setSearch']>[0]): void {
    this.viewPipeline.setSearch(query)
    this.serverSearchCursor = undefined
    this.serverSearchPreviousCursor = undefined
    this.serverSearchHasMore = false
    this.emitViewQuery('search')
    this.requestServerSearchIfNeeded(0)
    this.refresh(['data', 'layout'])
  }

  /**
   * Очищает накопленное состояние DataTableRootNode.
   */
  private clearSearch(): void {
    this.viewPipeline.clearSearch()
    this.serverSearchRequestId += 1
    this.serverSearchResolveRequestId += 1
    this.serverSearchCursor = undefined
    this.serverSearchPreviousCursor = undefined
    this.serverSearchHasMore = false
    this.serverSearchInFlight = false
    this.emitViewQuery('search')
    this.refresh(['data', 'layout'])
  }

  /**
   * Находит сущность по runtime-критериям DataTableRootNode.
   */
  private findNextSearchMatch(): ReturnType<DataTableRootApi<Row>['findNext']> {
    if (this.isServerRowModelActive() && (this.serverSearchCursor || this.serverSearchHasMore)) {
      const state = this.viewPipeline.getSearchState()
      if (state.matches.length === 0 || state.activeIndex >= state.matches.length - 1) {
        this.requestServerSearchPage({ mode: 'append', activeIndex: state.matches.length })
        this.emitViewQuery('search')
        this.refresh(['data', 'layout'])
        return state.activeMatch
      }
    }

    const match = this.viewPipeline.findNext()
    if (match) this.scrollToSearchMatch(match)
    this.emitViewQuery('search')
    this.refresh(['data', 'layout'])
    return match
  }

  /**
   * Находит сущность по runtime-критериям DataTableRootNode.
   */
  private findPreviousSearchMatch(): ReturnType<DataTableRootApi<Row>['findPrevious']> {
    if (this.isServerRowModelActive() && this.serverSearchPreviousCursor) {
      const state = this.viewPipeline.getSearchState()
      if (state.matches.length === 0 || state.activeIndex <= 0) {
        this.requestServerSearchPage({ mode: 'prepend' })
        this.emitViewQuery('search')
        this.refresh(['data', 'layout'])
        return state.activeMatch
      }
    }

    const match = this.viewPipeline.findPrevious()
    if (match) this.scrollToSearchMatch(match)
    this.emitViewQuery('search')
    this.refresh(['data', 'layout'])
    return match
  }

  /**
   * Переводит focus в целевое состояние DataTableRootNode.
   */
  private focusSearchMatch(index: number): ReturnType<DataTableRootApi<Row>['focusSearchMatch']> {
    const match = this.viewPipeline.focusSearchMatch(index)
    if (match) this.scrollToSearchMatch(match)
    this.emitViewQuery('search')
    this.refresh(['data', 'layout'])
    return match
  }

  /**
   * Выполняет внутренний шаг scrollToSearchMatch для DataTableRootNode.
   */
  private scrollToSearchMatch(match: NonNullable<ReturnType<DataTableRootApi<Row>['findNext']>>): void {
    if (this.isServerRowModelActive() && match.rowId !== undefined) {
      this.resolveServerSearchRowAndScroll(match)
      return
    }

    let nextScrollX = this.scrollX
    if (match.columnId) {
      const centerColumns = this.resolvedColumns.filter(column => !column.pinned)
      let columnX = 0
      for (const column of centerColumns) {
        if (column.id === match.columnId) break
        columnX += column.resolvedWidth
      }
      const column = centerColumns.find(item => item.id === match.columnId)
      if (column) {
        if (columnX < this.scrollX) nextScrollX = columnX
        else if (columnX + column.resolvedWidth > this.scrollX + this.viewport.bodyWidth) {
          nextScrollX = columnX + column.resolvedWidth - this.viewport.bodyWidth
        }
      }
    }

    this.setScroll(nextScrollX, match.rowIndex * this.rowHeight)
  }

  /**
   * Фокусирует server-side search match через source.resolveRowIndex без локального скана.
   */
  private resolveServerSearchRowAndScroll(match: DataTableSearchState['activeMatch']): void {
    if (!match || match.rowId === undefined) return
    const requestId = ++this.serverSearchResolveRequestId
    void this.serverRowModel.resolveRowIndex(match.rowId).then(rowIndex => {
      if (requestId !== this.serverSearchResolveRequestId) return
      this.scrollToResolvedSearchPosition({ ...match, rowIndex: rowIndex ?? match.rowIndex })
    })
  }

  /**
   * Прокручивает таблицу к найденной строке/ячейке.
   */
  private scrollToResolvedSearchPosition(match: NonNullable<DataTableSearchState['activeMatch']>): void {
    let nextScrollX = this.scrollX
    if (match.columnId) {
      const centerColumns = this.resolvedColumns.filter(column => !column.pinned)
      let columnX = 0
      for (const column of centerColumns) {
        if (column.id === match.columnId) break
        columnX += column.resolvedWidth
      }
      const column = centerColumns.find(item => item.id === match.columnId)
      if (column) {
        if (columnX < this.scrollX) nextScrollX = columnX
        else if (columnX + column.resolvedWidth > this.scrollX + this.viewport.bodyWidth) {
          nextScrollX = columnX + column.resolvedWidth - this.viewport.bodyWidth
        }
      }
    }

    this.setScroll(nextScrollX, match.rowIndex * this.rowHeight)
  }

  /**
   * Выполняет внутренний шаг reorderRows для DataTableRootNode.
   */
  private reorderRows(payload: Parameters<DataTableRootApi<Row>['reorderRows']>[0]): void {
    const mode = payload.mode ?? ((this.props.view.rowOrdering && this.props.view.rowOrdering.mode) || 'view')
    if (mode === 'store') {
      const rows = this.store.getRows()
      const [row] = rows.splice(payload.fromIndex, 1)
      if (row) rows.splice(payload.toIndex, 0, row)
      this.store.setRows(rows)
    }
    const next = this.viewPipeline.reorderRows({ ...payload, mode })
    this.props.onRowOrderChange?.(next)
    this.emitViewQuery('row')
    this.refresh(['data', 'layout'])
  }

  /**
   * Выполняет внутренний шаг reorderColumns для DataTableRootNode.
   */
  private reorderColumns(payload: Parameters<DataTableRootApi<Row>['reorderColumns']>[0]): void {
    const next = this.viewPipeline.reorderColumns(payload, this.getColumnStateInputColumns())
    this.columnStateOverride = {
      ...this.toColumnStateInput(this.getColumnState()),
      order: next.order,
    }
    this.props.onColumnOrderChange?.(next)
    this.emitColumnStateChange()
    this.emitViewQuery('column')
    this.refresh(['columns', 'layout'])
  }

  /**
   * Обновляет значение состояния DataTableRootNode.
   */
  private setColumnOrder(order: Array<string>, reason: 'drag' | 'api' = 'api'): void {
    const nextOrder = this.viewPipeline.setColumnOrder(order, this.getColumnStateInputColumns())
    this.columnStateOverride = {
      ...this.toColumnStateInput(this.getColumnState()),
      order: nextOrder,
    }
    this.props.onColumnOrderChange?.({
      columnId: '',
      fromIndex: -1,
      toIndex: -1,
      order: nextOrder,
      reason,
    })
    this.emitColumnStateChange()
    this.emitViewQuery('column')
    this.refresh(['columns', 'layout'])
  }

  /**
   * Сбрасывает состояние к базовым значениям DataTableRootNode.
   */
  private resetColumnOrder(): void {
    this.viewPipeline.resetColumnOrder()
    const state = this.toColumnStateInput(this.getColumnState())
    state.order = []
    this.columnStateOverride = state
    this.props.onColumnOrderChange?.({
      columnId: '',
      fromIndex: -1,
      toIndex: -1,
      order: [],
      reason: 'reset',
    })
    this.emitColumnStateChange()
    this.emitViewQuery('column')
    this.refresh(['columns', 'layout'])
  }

  /**
   * Обновляет значение состояния DataTableRootNode.
   */
  private setGrouping(groups: Parameters<DataTableRootApi<Row>['setGrouping']>[0]): void {
    this.viewPipeline.setGrouping(groups)
    this.emitViewQuery('grouping')
    this.setScroll(this.scrollX, 0)
    this.refresh(['data', 'layout'])
  }

  /**
   * Очищает накопленное состояние DataTableRootNode.
   */
  private clearGrouping(): void {
    this.viewPipeline.clearGrouping()
    this.emitViewQuery('grouping')
    this.setScroll(this.scrollX, 0)
    this.refresh(['data', 'layout'])
  }

  /**
   * Переключает флаг состояния DataTableRootNode.
   */
  private toggleGroup(groupId: string): void {
    const group = this.viewPipeline.toggleGroup(groupId)
    if (group) this.props.onGroupToggle?.(group)
    this.emitViewQuery('grouping')
    this.refresh(['data', 'layout'])
  }

  /**
   * Выполняет внутренний шаг expandGroup для DataTableRootNode.
   */
  private expandGroup(groupId: string): void {
    this.viewPipeline.expandGroup(groupId)
    this.emitViewQuery('grouping')
    this.refresh(['data', 'layout'])
  }

  /**
   * Выполняет внутренний шаг collapseGroup для DataTableRootNode.
   */
  private collapseGroup(groupId: string): void {
    this.viewPipeline.collapseGroup(groupId)
    this.emitViewQuery('grouping')
    this.refresh(['data', 'layout'])
  }

  /**
   * Выполняет внутренний шаг expandAllGroups для DataTableRootNode.
   */
  private expandAllGroups(): void {
    this.viewPipeline.expandAllGroups()
    this.emitViewQuery('grouping')
    this.refresh(['data', 'layout'])
  }

  /**
   * Выполняет внутренний шаг collapseAllGroups для DataTableRootNode.
   */
  private collapseAllGroups(): void {
    this.viewPipeline.collapseAllGroups()
    this.emitViewQuery('grouping')
    this.refresh(['data', 'layout'])
  }

  /**
   * Сбрасывает состояние к базовым значениям DataTableRootNode.
   */
  private resetView(): void {
    this.viewPipeline.reset()
    this.emitViewQuery('all')
    this.setScroll(0, 0)
    this.refresh(['data', 'columns', 'layout'])
  }

  /**
   * Публикует событие во внутренний event bus DataTableRootNode.
   */
  private emitViewQuery(kind: 'sort' | 'filter' | 'search' | 'row' | 'column' | 'grouping' | 'all'): void {
    const state = this.viewPipeline.getState()
    if (kind === 'sort' || kind === 'all') this.props.onSortChange?.(state.sort)
    if (kind === 'filter' || kind === 'all') this.props.onFilterChange?.(state.filters)
    if (kind === 'search' || kind === 'all') this.props.onSearchChange?.(state.search)
    if (kind === 'grouping' || kind === 'all') this.props.onGroupingChange?.(state.grouping)
    this.props.onQueryChange?.(state.query)
    if (kind === 'sort' || kind === 'filter' || kind === 'search' || kind === 'grouping' || kind === 'all') {
      this.scheduleStatePersistence()
    }
  }

  /**
   * Нормализует и возвращает итоговое значение DataTableRootNode.
   */
  private resolveSourceQuery(): DataTableQueryState | undefined {
    return this.viewPipeline.isServerControlled() ? undefined : this.viewPipeline.getQuery()
  }

  /**
   * Возвращает query для авторитетной server-side модели.
   */
  private resolveServerSourceQuery(): DataTableQueryState {
    return this.viewPipeline.getQuery()
  }

  /**
   * Возвращает true, когда lazy/server source должен быть авторитетным view.
   */
  private isServerRowModelActive(): boolean {
    const options = this.props.view.serverRowModel
    if (!options || !options.enabled) return false
    if (options.authoritative) return true
    const state = this.viewPipeline.getState()
    return this.store.rowCount > this.props.performance.maxClientRows
      || state.mode.sorting === 'server'
      || state.mode.filtering === 'server'
      || state.mode.search === 'server'
      || state.mode.grouping === 'server'
  }

  /**
   * Синхронизирует server-side query, summary и SSE subscription.
   */
  private syncServerRowModel(): void {
    const options = this.props.view.serverRowModel
    if (!options || !options.enabled || !this.isServerRowModelActive()) {
      this.serverRowModel.dispose()
      return
    }

    const query = this.resolveServerSourceQuery()
    const changed = this.serverRowModel.sync(query, { subscribe: options.subscribe })
    if (changed) this.props.onServerQueryChange?.(query)
    if (options.loadSummary && (changed || this.summaryState.source !== 'server')) this.requestServerSummary()
  }

  /**
   * Запрашивает summary у server-side source с защитой от устаревших ответов.
   */
  private requestServerSummary(): void {
    const requestId = ++this.serverSummaryRequestId
    this.summaryState = {
      values: { ...this.summaryState.values },
      rowCount: this.store.rowCount,
      revision: requestId,
      source: 'server',
      loading: true,
    }
    this.props.onSummaryChange?.({ ...this.summaryState, values: { ...this.summaryState.values } })

    void this.serverRowModel.loadSummary().then(summary => {
      if (!summary || requestId !== this.serverSummaryRequestId) return
      this.summaryState = summary
      this.props.onSummaryChange?.({ ...summary, values: { ...summary.values } })
      this.refresh(['summary'])
    })
  }

  /**
   * Синхронизирует summary для server и client режимов без участия render pass.
   */
  private syncSummaryState(): void {
    if (this.isServerRowModelActive()) {
      if (this.props.view.serverRowModel && this.props.view.serverRowModel.loadSummary) return
      const revision = this.store.takeRevision()
      if (this.summaryState.source === 'server'
        && !this.summaryState.loading
        && this.summaryState.revision === revision
        && this.summaryState.rowCount === this.store.rowCount) {
        return
      }
      this.summaryState = {
        values: { rowCount: this.store.rowCount },
        rowCount: this.store.rowCount,
        revision,
        source: 'server',
        loading: false,
      }
      this.props.onSummaryChange?.({ ...this.summaryState, values: { ...this.summaryState.values } })
      return
    }

    if (this.store.rowCount > this.props.performance.maxClientRows) return
    const revision = this.store.takeRevision()
    if (this.summaryState.source === 'client'
      && !this.summaryState.loading
      && this.summaryState.revision === revision
      && this.summaryState.rowCount === this.viewPipeline.rowCount) {
      return
    }

    const rows = this.viewPipeline.getViewRows()
      .filter((row): row is Extract<DataTableViewRow<Row>, { kind: 'data' }> => row.kind === 'data' && !!row.row)
      .map(row => row.row as Row)
    const result = this.summaryEngine.compute(rows, this.resolveSummaryRules(rows))
    this.summaryState = {
      values: { ...result.values, rowCount: result.rowCount },
      rowCount: result.rowCount,
      revision,
      source: 'client',
      loading: false,
    }
    this.props.onSummaryChange?.({ ...this.summaryState, values: { ...this.summaryState.values } })
  }

  /**
   * Подбирает компактный набор summary-правил для client-mode runtime.
   */
  private resolveSummaryRules(rows: Array<Row>): Array<DataTableSummaryRule<Row>> {
    const rules: Array<DataTableSummaryRule<Row>> = [{ id: 'rowCount', aggregate: 'count' }]
    const sample = rows.slice(0, 50)
    for (const column of this.resolvedColumns) {
      if (rules.length >= 10) break
      const candidate = column.field ?? column.id
      const numeric = column.type === 'number'
        || sample.some(row => Number.isFinite(Number(row[candidate as keyof Row])))
      if (!numeric) continue
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
  private requestServerSearchIfNeeded(activeIndex = this.viewPipeline.getSearchState().activeIndex): void {
    this.requestServerSearchPage({ mode: 'replace', activeIndex })
  }

  /**
   * Запрашивает страницу server-side поиска и обновляет navigation state.
   */
  private requestServerSearchPage(options: { mode: 'replace' | 'append' | 'prepend'; activeIndex?: number }): void {
    const search = this.viewPipeline.getSearchState().query
    if (!search.text || !this.isServerRowModelActive()) return
    if (this.serverSearchInFlight) return

    this.syncServerRowModel()
    const requestId = ++this.serverSearchRequestId
    this.serverSearchInFlight = true
    this.viewPipeline.setServerSearchLoading(true)
    this.props.onSearchChange?.(this.viewPipeline.getSearchState())
    const direction: DataTableSearchDirection = options.mode === 'prepend' ? 'previous' : 'next'
    const cursor = options.mode === 'prepend' ? this.serverSearchPreviousCursor : this.serverSearchCursor
    void this.serverRowModel.search(search, cursor, direction).then(result => {
      if (!result || requestId !== this.serverSearchRequestId) return
      this.serverSearchCursor = result.cursor
      this.serverSearchPreviousCursor = result.previousCursor
      this.serverSearchHasMore = result.hasMore ?? !!result.cursor
      if (options.mode === 'append') {
        this.viewPipeline.appendServerSearchResult(result, options.activeIndex)
      } else if (options.mode === 'prepend') {
        this.viewPipeline.prependServerSearchResult(result, options.activeIndex)
      } else {
        this.viewPipeline.setServerSearchResult(result, Math.max(0, options.activeIndex ?? 0))
      }
      const match = this.viewPipeline.getSearchState().activeMatch
      if (match) this.scrollToSearchMatch(match)
      this.props.onSearchChange?.(this.viewPipeline.getSearchState())
      this.refresh(['data', 'interaction'])
    }).finally(() => {
      if (requestId === this.serverSearchRequestId) {
        this.serverSearchInFlight = false
        this.viewPipeline.setServerSearchLoading(false)
        this.props.onSearchChange?.(this.viewPipeline.getSearchState())
      }
    })
  }

  /**
   * Синхронизирует актуальное состояние DataTableRootNode.
   */
  private refresh(kinds: Array<string> = ['data', 'layout', 'viewport']): void {
    this.invalidation.bumpMany(kinds)
    const requiresRuntimeSync = this.refreshRequiresRuntimeSync(kinds)
    if (requiresRuntimeSync) {
      this.resolvedColumns = this.resolveColumns()
      this.syncViewPipeline()
      this.viewport = this.createViewport()
      this.syncEditingRect()
    }
    this.markRenderLayersDirtyForRefresh(kinds)
    if (!requiresRuntimeSync && this.canRefreshRetainedHoverOverlay(kinds)) {
      this.updateHoverOverlayBatch()
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
  private resolveRefreshKindsForProps(changedKeys: Array<keyof DataTableRootResolvedProps<Row>>): Array<string> {
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
  private canRefreshRetainedHoverOverlay(kinds: Array<string>): boolean {
    return kinds.length > 0
      && kinds.every(kind => kind === 'hover')
      && !this.props.interactionLayerTemplate
      && !this.columnDragState?.active
      && this.columnDragLayoutMotion.size === 0
  }

  /**
   * Проверяет, нужен ли runtime-sync для текущего refresh.
   */
  private refreshRequiresRuntimeSync(kinds: Array<string>): boolean {
    if (kinds.length === 0) return true
    if (this.columnDragState?.active || this.columnDragLayoutMotion.size > 0) return true
    return kinds.some(kind => !['interaction', 'hover', 'selection', 'tooltip', 'scrollbar'].includes(kind))
  }

  /**
   * Помечает render layers грязными по типам invalidation.
   */
  private markRenderLayersDirtyForRefresh(kinds: Array<string>): void {
    if (kinds.length === 0 || kinds.some(kind => ['data', 'layout', 'columns', 'viewport', 'view', 'zoom', 'custom'].includes(kind))) {
      this.markRenderLayersDirty(DATA_TABLE_RENDER_LAYER_IDS)
      return
    }

    if (kinds.includes('summary')) {
      this.markRenderLayersDirty(['group-summary', 'search', 'selection', 'interaction'])
    }

    if (kinds.some(kind => ['interaction', 'hover', 'selection', 'tooltip', 'scrollbar'].includes(kind))) {
      if (this.columnDragState?.active || this.columnDragLayoutMotion.size > 0) {
        this.markRenderLayersDirty(DATA_TABLE_RENDER_LAYER_IDS)
        return
      }
      this.markRenderLayersDirty(DATA_TABLE_OVERLAY_RENDER_LAYERS)
    }
  }

  /**
   * Помечает конкретные render layers грязными.
   */
  private markRenderLayersDirty(layers: Array<DataTableRenderLayerId>): void {
    for (const id of layers) {
      const layer = this.renderLayers.get(id)
      if (layer) layer.dirty = true
    }
  }

  /**
   * Проверяет, будет ли пересобираться индекс выделяемого текста.
   */
  private shouldRebuildTextSelectionTargets(): boolean {
    if (!this.props.textSelection || !this.props.textSelection.enabled) return false
    return DATA_TABLE_TEXT_SELECTION_SOURCE_LAYERS.some(id => {
      const layer = this.renderLayers.get(id)
      return !layer || layer.dirty || !layer.initialized
    })
  }

  /**
   * Проверяет, будут ли пересобраны указанные render layers.
   */
  private willRebuildLayers(layers: Array<DataTableRenderLayerId>): boolean {
    return layers.some(id => {
      const layer = this.renderLayers.get(id)
      return !layer || layer.dirty || !layer.initialized
    })
  }

  /**
   * Выполняет внутренний шаг suppressTextSelectionIndexFor для DataTableRootNode.
   */
  private suppressTextSelectionIndexFor(reason: 'scroll' | 'zoom'): void {
    const text = this.props.performance.text
    if (!text || !text.disableTextSelectionIndexOnScroll || this.textSelectionActive) return

    const duration = reason === 'zoom'
      ? Math.max(text.refineAfterZoomMs, 120)
      : Math.max(text.refineAfterScrollMs, 80)
    this.suppressTextSelectionIndexUntil = Math.max(this.suppressTextSelectionIndexUntil, performance.now() + duration)
  }

  /**
   * Выполняет внутренний шаг requestTextRefinement для DataTableRootNode.
   */
  private requestTextRefinement(reason: 'scroll' | 'zoom'): void {
    const text = this.props.performance.text
    if (!text || text.raster !== 'deferred') return

    const duration = reason === 'zoom' ? text.refineAfterZoomMs : text.refineAfterScrollMs
    if (duration <= 0) return

    this.textRefinementUntil = Math.max(this.textRefinementUntil, performance.now() + duration)
    this.nova.invalidate()
  }

  /**
   * Выполняет внутренний шаг continueTextRefinementIfNeeded для DataTableRootNode.
   */
  private continueTextRefinementIfNeeded(): void {
    if (performance.now() >= this.textRefinementUntil) return
    this.nova.invalidate()
  }

  /**
   * Нормализует и возвращает итоговое значение DataTableRootNode.
   */
  private resolveColumns(): Array<DataTableResolvedColumn<Row>> {
    const columns = resolveDataTableColumns(
      this.viewPipeline.orderColumns(this.getColumnStateInputColumns()),
      this.resolveEffectivePinnedColumns(),
      this.createEffectiveWidthOverrides(),
      this.store,
    )
    const scale = this.zoomColumnScale
    const resolved = scale === 1
      ? columns
      : columns.map(column => ({
          ...column,
          minWidth: Math.max(24, Math.round(column.minWidth * scale)),
          maxWidth: Math.max(24, Math.round(column.maxWidth * scale)),
          resolvedWidth: Math.max(24, Math.round(column.resolvedWidth * scale)),
        }))

    this.columnIndexById.clear()
    resolved.forEach((column, index) => this.columnIndexById.set(column.id, index))
    return resolved
  }

  /**
   * Возвращает columns input с примененными hidden/pinned state override.
   */
  private getColumnStateInputColumns(state: DataTableColumnState = this.resolveMergedColumnState()): Array<DataTableColumnInput<Row>> {
    const hidden = new Set(state.hidden ?? [])
    const pinned = this.resolvePinnedSideByColumn(state)
    const columns = this.props.columns
      .filter(column => !hidden.has(column.id))
      .map(column => {
        const side = pinned.get(column.id)
        return side ? { ...column, pinned: side } : column
      })
    return this.orderColumnInputsByState(columns, state.order ?? [])
  }

  /**
   * Возвращает pinnedColumns с учетом columnState.
   */
  private resolveEffectivePinnedColumns(): DataTableRootResolvedProps<Row>['pinnedColumns'] {
    const state = this.resolveMergedColumnState()
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
  private resolveEffectivePinnedRows(): DataTableRootResolvedProps<Row>['pinnedRows'] {
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
  private createEffectiveWidthOverrides(): Map<string, number> {
    const widths = new Map<string, number>()
    const state = this.resolveMergedColumnState()
    for (const [columnId, width] of Object.entries(state.widths)) widths.set(columnId, width)
    for (const [columnId, width] of this.widthOverrides) widths.set(columnId, width)
    return widths
  }

  /**
   * Объединяет controlled props и локальное runtime состояние колонок.
   */
  private resolveMergedColumnState(): DataTableResolvedColumnState {
    const base = this.props.columnState
    const override = this.columnStateOverride
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
  private toColumnStateInput(state: DataTableResolvedColumnState): DataTableColumnState {
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
  private resolveColumnStateOrder(
    runtimeOrder: Array<string>,
    merged: DataTableResolvedColumnState,
  ): Array<string> {
    const allColumnIds = this.props.columns.map(column => column.id)
    const baseline = merged.order.length > 0
      ? this.mergeColumnOrderWithAllColumns(merged.order, allColumnIds)
      : allColumnIds
    if (runtimeOrder.length === 0) return baseline
    return this.mergeColumnOrderWithAllColumns(runtimeOrder, baseline)
  }

  /**
   * Дополняет order отсутствующими колонками без потери исходного порядка.
   */
  private mergeColumnOrderWithAllColumns(order: Array<string>, allColumnIds: Array<string>): Array<string> {
    const columnSet = new Set(allColumnIds)
    const seen = new Set<string>()
    const result: Array<string> = []
    for (const columnId of order) {
      if (!columnSet.has(columnId) || seen.has(columnId)) continue
      seen.add(columnId)
      result.push(columnId)
    }
    for (const columnId of allColumnIds) {
      if (seen.has(columnId)) continue
      seen.add(columnId)
      result.push(columnId)
    }
    return result
  }

  /**
   * Публикует изменение columnState.
   */
  private emitColumnStateChange(): void {
    this.props.onColumnStateChange?.(this.getColumnState())
    this.scheduleStatePersistence()
  }

  /**
   * Собирает быстрый lookup side для pinned columns.
   */
  private resolvePinnedSideByColumn(state: DataTableColumnState): Map<string, DataTableResolvedColumn<Row>['pinned']> {
    const result = new Map<string, DataTableResolvedColumn<Row>['pinned']>()
    for (const id of state.pinned?.left ?? []) result.set(id, 'left')
    for (const id of state.pinned?.right ?? []) result.set(id, 'right')
    return result
  }

  /**
   * Стабильно сортирует column inputs по сохраненному order.
   */
  private orderColumnInputsByState(
    columns: Array<DataTableColumnInput<Row>>,
    order: Array<string>,
  ): Array<DataTableColumnInput<Row>> {
    if (order.length === 0) return columns
    const rank = new Map(order.map((id, index) => [id, index]))
    return [...columns].sort((left, right) => {
      const leftRank = rank.get(left.id) ?? Number.MAX_SAFE_INTEGER
      const rightRank = rank.get(right.id) ?? Number.MAX_SAFE_INTEGER
      if (leftRank !== rightRank) return leftRank - rightRank
      return columns.indexOf(left) - columns.indexOf(right)
    })
  }

  /**
   * Синхронизирует состояние между слоями DataTableRootNode.
   */
  private syncViewPipeline(): void {
    this.viewPipeline.sync({
      columns: this.resolvedColumns,
      view: this.props.view,
      performance: this.props.performance,
    })
  }

  /**
   * Создает runtime-сущность DataTableRootNode.
   */
  private createViewport(): DataTableViewport {
    const pinnedRows = this.resolveEffectivePinnedRows()
    return createDataTableViewport({
      width: this.width || this.props.width,
      height: this.height || this.props.height,
      rowHeight: this.rowHeight,
      headerHeight: this.headerHeight,
      overscanRows: this.props.overscanRows,
      overscanColumns: this.props.overscanColumns,
      rowCount: this.viewPipeline.rowCount,
      columns: this.resolvedColumns,
      pinnedTopCount: pinnedRows.top?.length ?? 0,
      pinnedBottomCount: pinnedRows.bottom?.length ?? 0,
      scrollX: this.scrollX,
      scrollY: this.scrollY,
    })
  }

  /**
   * Обновляет значение состояния DataTableRootNode.
   */
  private setupEvents(): void {
    this.on('wheel', event => {
      this.trackTooltipModifiers(event)
      this.lastPointerPosition = this.toLocalPointerPosition(event)
      if (this.handleZoomWheel(event)) {
        event.preventDefault()
        event.cancelBubble = true
        return
      }
      const nextX = this.scrollX + event.deltaX + (event.shiftKey ? event.deltaY : 0)
      const nextY = this.scrollY + (event.shiftKey ? 0 : event.deltaY)
      this.setScroll(nextX, nextY)
      event.preventDefault()
      event.cancelBubble = true
    })

    this.on('mousemove', event => {
      this.trackTooltipModifiers(event)
      const [x, y] = this.trackPointerPosition(event)
      if (this.resizeState) {
        this.syncNativeCursor(x, y)
        return
      }
      this.pointerInside = true
      this.revealScrollbars('hover')
      this.updateHoveredScrollbarAxis(x, y)
      this.syncNativeCursor(x, y)
      const nextHover = this.resolveInteractionTargetAt(x, y)
      this.updateHover(nextHover)
    })

    this.on('mouseleave', () => {
      this.lastPointerPosition = null
      this.pointerInside = false
      this.hoveredScrollbarAxis = null
      this.scheduleScrollbarHide('hover')
      this.clearHover()
      this.scheduleTooltipClose()
      this.nova.cursor('default')
    })

    this.on('mousedown', event => {
      this.trackTooltipModifiers(event)
      this.keyboardFocusActive = true
      const [x, y] = this.trackPointerPosition(event)
      const scrollbarAxis = this.hitScrollbar(x, y)
      if (scrollbarAxis) {
        this.startScrollbarDrag(scrollbarAxis, event)
        event.cancelBubble = true
        return
      }

      const resizeColumn = this.hitResizeHandle(x, y)
      if (resizeColumn) {
        this.nova.cursor('col-resize')
        this.resizeState = {
          column: resizeColumn.column,
          startX: x,
          startWidth: resizeColumn.column.resolvedWidth,
        }
        this.capturePointer(event)
        event.cancelBubble = true
        return
      }

      if (this.handleColumnMenuPointerDown(x, y, event)) {
        event.cancelBubble = true
        return
      }

      const target = this.resolveInteractionTargetAt(x, y)
      if (target) {
        if (target.zone === 'header') {
          if (this.resolveColumnMenuHeaderTarget(target, x, y)) {
            this.openColumnMenu(target)
            event.cancelBubble = true
            return
          }
          const filterTarget = this.resolveFilterUiTarget(target, x, y, event)
          if (filterTarget && this.handleFilterUiAction(filterTarget)) {
            event.cancelBubble = true
            return
          }
          if (this.filterRowHeight > 0 && y >= this.headerHeight - this.filterRowHeight) {
            event.cancelBubble = true
            return
          }
          if (this.startColumnDrag(target, event)) {
            event.cancelBubble = true
            return
          }
          if (this.tryHeaderSelection(target, event)) {
            event.cancelBubble = true
            return
          }
          this.handleHeaderAction(target, event)
          event.cancelBubble = true
          return
        }
        if (target.zone === 'group' && typeof target.rowId === 'string') {
          this.toggleGroup(target.rowId)
          event.cancelBubble = true
          return
        }
        const tableSelectionEnabled = this.props.selection !== false && this.props.selection.enabled
        if ((!tableSelectionEnabled || event.altKey) && this.startTextSelectionAt(x, y, event)) {
          event.cancelBubble = true
          return
        }
        if (tableSelectionEnabled) {
          this.updateSelection(target, event)
          this.startSelectionDrag(target, event)
        }
        const context = this.createCellContext(target)
        if (context) this.props.onCellClick?.(context)
      }
      event.cancelBubble = true
    })

    this.on('click', event => {
      if (!this.props.view.columnOrdering || !this.props.view.columnOrdering.enabled) return
      this.trackTooltipModifiers(event)
      const [x, y] = this.trackPointerPosition(event)
      const target = this.resolveInteractionTargetAt(x, y)
      if (!target || target.zone !== 'header') return

      if (this.suppressNextHeaderClick) {
        this.suppressNextHeaderClick = false
        event.cancelBubble = true
        return
      }

      if (!this.columnDragState) return
      this.columnDragState = null
      this.releasePointerCapture(event)
      this.handleHeaderAction(target, event)
      event.cancelBubble = true
    })

    this.on('mouseup', event => {
      if (!this.textSelectionActive) return
      this.textSelectionActive = false
      this.textSelection.end()
      this.releasePointerCapture(event)
      this.refresh(['interaction'])
      event.cancelBubble = true
    })

    this.on('dblclick', event => {
      this.trackTooltipModifiers(event)
      const [x, y] = this.trackPointerPosition(event)
      if (this.hitScrollbar(x, y) || this.hitResizeHandle(x, y)) return
      const target = this.resolveInteractionTargetAt(x, y)
      if (target && this.startEditFromTarget(target, 'doubleClick')) {
        event.cancelBubble = true
      }
    })

    this.on('dragmove', (event, _dx, _dy, meta) => {
      if (this.scrollbarDragState) {
        this.updateScrollbarDrag(meta.totalDx, meta.totalDy)
        event.cancelBubble = true
        return
      }
      if (this.columnDragState) {
        this.updateColumnDrag(meta)
        event.cancelBubble = true
        return
      }
      if (this.selectionDragState) {
        this.updateSelectionDrag(meta)
        event.cancelBubble = true
        return
      }
      if (this.textSelectionActive) {
        this.updateTextSelectionAt(meta.x, meta.y)
        event.cancelBubble = true
        return
      }
      if (!this.resizeState) return
      const nextWidth = this.resizeState.startWidth + meta.totalDx
      const [x, y] = this.toLocal(meta.x, meta.y)
      this.lastPointerPosition = { x, y }
      this.syncNativeCursor(x, y)
      this.applyColumnWidth(this.resizeState.column.id, nextWidth)
      event.cancelBubble = true
    })

    this.on('dragend', (event, meta) => {
      if (this.scrollbarDragState) {
        this.updateScrollbarDrag(meta.totalDx, meta.totalDy)
        this.scrollbarDragState = null
        this.releasePointerCapture(event)
        this.scheduleScrollbarHide('scroll')
        event.cancelBubble = true
        return
      }
      if (this.columnDragState) {
        this.commitColumnDrag(meta)
        this.releasePointerCapture(event)
        event.cancelBubble = true
        return
      }
      if (this.selectionDragState) {
        this.commitSelectionDrag()
        this.releasePointerCapture(event)
        event.cancelBubble = true
        return
      }
      if (this.textSelectionActive) {
        this.textSelectionActive = false
        this.textSelection.end()
        this.releasePointerCapture(event)
        this.refresh(['interaction'])
        event.cancelBubble = true
        return
      }
      if (!this.resizeState) return
      this.resizeState = null
      this.syncHoverAfterViewportChange()
      this.syncNativeCursorFromLastPosition()
      this.releasePointerCapture(event)
      event.cancelBubble = true
    })
  }

  /**
   * Подключает keyboard navigation, пока таблица имеет runtime focus.
   */
  private setupKeyboardNavigationEvents(): void {
    if (typeof window === 'undefined') return
    window.addEventListener('keydown', this.handleKeyboardNavigationKeydown)
    window.addEventListener('pointerdown', this.handleKeyboardNavigationPointerDown, true)
  }

  /**
   * Отключает keyboard navigation.
   */
  private teardownKeyboardNavigationEvents(): void {
    if (typeof window === 'undefined') return
    window.removeEventListener('keydown', this.handleKeyboardNavigationKeydown)
    window.removeEventListener('pointerdown', this.handleKeyboardNavigationPointerDown, true)
  }

  /**
   * Сбрасывает keyboard focus, когда пользователь уходит за пределы canvas.
   */
  private handleKeyboardNavigationPointerDownEvent(event: PointerEvent): void {
    const target = event.target
    if (target instanceof Node && this.canvas.element.contains(target)) return
    this.keyboardFocusActive = false
  }

  /**
   * Обрабатывает клавиатурную навигацию active cell.
   */
  private handleKeyboardNavigationKeydownEvent(event: KeyboardEvent): void {
    const options = this.props.keyboardNavigation
    if (!options || !options.enabled || !this.keyboardFocusActive) return
    if (isEditableKeyboardTarget(event.target)) return

    if (this.editingState) {
      if (event.key === 'Escape' && this.props.editing !== false && this.props.editing.cancelOnEscape) {
        this.cancelEdit()
        this.emitKeyboardAction({ type: 'cancel', key: event.key })
        event.preventDefault()
      } else if (event.key === 'Enter' && this.props.editing !== false && this.props.editing.commitOnEnter) {
        void this.commitEdit()
        this.emitKeyboardAction({ type: 'commit', key: event.key })
        event.preventDefault()
      } else if (event.key === 'Tab' && options.tab === 'commit-edit') {
        void this.commitEdit()
        this.emitKeyboardAction({ type: 'commit', key: event.key })
        event.preventDefault()
      }
      return
    }

    if (options.ctrlMetaShortcuts && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
      if (this.selectAllByKeyboard()) {
        this.emitKeyboardAction({ type: 'select-all', key: event.key })
        event.preventDefault()
      }
      return
    }

    const extend = !!event.shiftKey && options.shiftSelection
    const direction = this.resolveKeyboardDirection(event, options)
    if (direction) {
      if (this.moveActiveCell(direction, { extend })) {
        this.emitKeyboardAction({ type: 'move', key: event.key, direction })
        event.preventDefault()
      }
      return
    }

    if (event.key === 'F2' || (event.key === 'Enter' && options.enter === 'edit')) {
      const active = this.selection?.activeCell
      if (active && this.startEdit(active.rowId, active.columnId)) {
        this.emitKeyboardAction({ type: 'edit', key: event.key })
        event.preventDefault()
      }
      return
    }

    if (event.key === 'Enter' && options.enter === 'move') {
      if (this.moveActiveCell('down', { extend: false })) {
        this.emitKeyboardAction({ type: 'move', key: event.key, direction: 'down' })
        event.preventDefault()
      }
      return
    }

    if (event.key === 'Escape' && this.selection?.previewRange) {
      this.commitSelectionState({ ...this.selection, previewRange: null }, { emitActive: false })
      this.emitKeyboardAction({ type: 'cancel', key: event.key })
      event.preventDefault()
    }
  }

  /**
   * Возвращает направление keyboard navigation для события.
   */
  private resolveKeyboardDirection(
    event: KeyboardEvent,
    options: Exclude<DataTableRootResolvedProps<Row>['keyboardNavigation'], false>,
  ): DataTableActiveCellDirection | null {
    if (options.arrows) {
      if (event.key === 'ArrowUp') return 'up'
      if (event.key === 'ArrowDown') return 'down'
      if (event.key === 'ArrowLeft') return 'left'
      if (event.key === 'ArrowRight') return 'right'
    }
    if (options.tab === 'move' && event.key === 'Tab') return event.shiftKey ? 'left' : 'right'
    if (options.pageKeys) {
      if (event.key === 'PageUp') return 'page-up'
      if (event.key === 'PageDown') return 'page-down'
    }
    if (options.homeEnd) {
      if (event.key === 'Home') return 'home'
      if (event.key === 'End') return 'end'
    }
    return null
  }

  /**
   * Публикует keyboard action callback.
   */
  private emitKeyboardAction(action: DataTableKeyboardAction): void {
    this.props.onKeyboardAction?.(action)
  }

  /**
   * Обрабатывает runtime-событие DataTableRootNode.
   */
  private handleZoomWheel(event: WheelEvent): boolean {
    const zoom = this.props.zoom
    if (!zoom || !zoom.wheel || !zoom.wheel.enabled) return false
    const pinchWheel = this.isTrackpadPinchWheel(event, zoom.wheel)
    const modifier = zoom.wheel.modifier
    if (!pinchWheel && modifier && !this.isWheelModifierActive(event, modifier)) return false

    const nextValue = pinchWheel
      ? zoom.value * Math.exp(-event.deltaY * zoom.wheel.step * 0.04)
      : zoom.value + (event.deltaY > 0 ? -1 : 1) * zoom.wheel.step
    this.applyZoomValue(nextValue)
    return true
  }

  /**
   * Выполняет внутренний шаг isTrackpadPinchWheel для DataTableRootNode.
   */
  private isTrackpadPinchWheel(event: WheelEvent, options: DataTableResolvedZoomWheelOptions): boolean {
    return options.pinch && event.ctrlKey && Number.isFinite(event.deltaY) && event.deltaY !== 0
  }

  /**
   * Обновляет значение состояния DataTableRootNode.
   */
  private setupTrackpadGestureEvents(): void {
    const element = this.canvas.element
    element.removeEventListener('wheel', this.handleTrackpadWheelCapture, true)
    element.addEventListener('wheel', this.handleTrackpadWheelCapture, { passive: false, capture: true })
    this.removeWindowGestureEvents()
    this.addWindowGestureEvents()
  }

  /**
   * Выполняет внутренний шаг teardownTrackpadGestureEvents для DataTableRootNode.
   */
  private teardownTrackpadGestureEvents(): void {
    const element = this.canvas.element
    element.removeEventListener('wheel', this.handleTrackpadWheelCapture, true)
    this.removeWindowGestureEvents()
    this.gestureActive = false
  }

  /**
   * Выполняет внутренний шаг addWindowGestureEvents для DataTableRootNode.
   */
  private addWindowGestureEvents(): void {
    if (typeof window === 'undefined') return
    window.addEventListener('gesturestart', this.handleGestureStart, { passive: false, capture: true })
    window.addEventListener('gesturechange', this.handleGestureChange, { passive: false, capture: true })
    window.addEventListener('gestureend', this.handleGestureEnd, true)
  }

  /**
   * Удаляет сущность из runtime-коллекции DataTableRootNode.
   */
  private removeWindowGestureEvents(): void {
    if (typeof window === 'undefined') return
    window.removeEventListener('gesturestart', this.handleGestureStart, true)
    window.removeEventListener('gesturechange', this.handleGestureChange, true)
    window.removeEventListener('gestureend', this.handleGestureEnd, true)
  }

  /**
   * Обрабатывает runtime-событие DataTableRootNode.
   */
  private handleTrackpadWheelCaptureEvent(event: WheelEvent): void {
    const zoom = this.props.zoom
    if (!zoom || !zoom.wheel || !zoom.wheel.enabled || !this.isTrackpadPinchWheel(event, zoom.wheel)) return
    if (!this.trackGesturePointerPosition(event)) return
    const nextValue = zoom.value * Math.exp(-event.deltaY * zoom.wheel.step * 0.04)
    this.applyZoomValue(nextValue)
    event.preventDefault()
    event.stopPropagation()
    event.cancelBubble = true
  }

  /**
   * Обрабатывает runtime-событие DataTableRootNode.
   */
  private handleTrackpadGestureStart(event: DataTableGestureEvent): void {
    const zoom = this.props.zoom
    if (!zoom || !zoom.wheel || !zoom.wheel.enabled || !zoom.wheel.pinch) return
    if (!this.trackGesturePointerPosition(event)) return
    this.gestureStartZoomValue = zoom.value
    this.gestureActive = true
    event.preventDefault()
    event.stopPropagation()
    event.cancelBubble = true
  }

  /**
   * Обрабатывает runtime-событие DataTableRootNode.
   */
  private handleTrackpadGestureChange(event: DataTableGestureEvent): void {
    const zoom = this.props.zoom
    if (!zoom || !zoom.wheel || !zoom.wheel.enabled || !zoom.wheel.pinch || !this.gestureActive) return
    const scale = typeof event.scale === 'number' && Number.isFinite(event.scale) ? event.scale : 1
    this.trackGesturePointerPosition(event)
    this.applyZoomValue(this.gestureStartZoomValue * scale)
    event.preventDefault()
    event.stopPropagation()
    event.cancelBubble = true
  }

  /**
   * Обрабатывает runtime-событие DataTableRootNode.
   */
  private handleTrackpadGestureEnd(event: DataTableGestureEvent): void {
    if (!this.gestureActive) return
    this.gestureActive = false
    event.preventDefault()
    event.stopPropagation()
    event.cancelBubble = true
  }

  /**
   * Применяет подготовленное состояние DataTableRootNode.
   */
  private applyZoomValue(value: number): void {
    const zoom = this.props.zoom
    if (!zoom || !zoom.wheel) return
    this.applyZoom({
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
  private isWheelModifierActive(event: WheelEvent, modifier: TooltipModifier | Array<TooltipModifier>): boolean {
    if (Array.isArray(modifier)) return modifier.some(item => this.isWheelModifierActive(event, item))
    if (modifier === 'ctrl') return event.ctrlKey
    if (modifier === 'meta') return event.metaKey
    if (modifier === 'shift') return event.shiftKey
    if (modifier === 'alt') return event.altKey
    return false
  }

  /**
   * Выполняет внутренний шаг trackGesturePointerPosition для DataTableRootNode.
   */
  private trackGesturePointerPosition(event: DataTableGestureEvent): boolean {
    if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return this.pointerInside
    const rect = this.canvas.element.getBoundingClientRect()
    const x = (event.clientX ?? rect.left + rect.width / 2) - rect.left
    const y = (event.clientY ?? rect.top + rect.height / 2) - rect.top
    const position = this.toLocal(x, y)
    if (!this.isLocalPointInsideRoot(position[0], position[1])) return false
    this.lastPointerPosition = { x: position[0], y: position[1] }
    return true
  }

  /**
   * Выполняет внутренний шаг isLocalPointInsideRoot для DataTableRootNode.
   */
  private isLocalPointInsideRoot(x: number, y: number): boolean {
    return x >= 0 && x <= this.width && y >= 0 && y <= this.height
  }

  /**
   * Обновляет значение состояния DataTableRootNode.
   */
  private setupTooltipKeyboardEvents(): void {
    if (typeof window === 'undefined') return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!this.updateTooltipModifierFromKey(event, true)) return
      this.syncTooltipTarget()
    }
    const handleKeyUp = (event: KeyboardEvent) => {
      if (!this.updateTooltipModifierFromKey(event, false)) return
      this.syncTooltipTarget()
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
  private handleColumnMenuPointerDown(x: number, y: number, event: MouseEvent): boolean {
    void event
    const menu = this.columnMenuState
    if (!menu) return false

    const height = menu.actions.length * menu.itemHeight + 8
    const inside = x >= menu.x && x <= menu.x + menu.width && y >= menu.y && y <= menu.y + height
    if (!inside) {
      this.columnMenuState = null
      this.refresh(['interaction'])
      return false
    }

    const index = Math.floor((y - menu.y - 4) / menu.itemHeight)
    const action = menu.actions[index]
    if (!action) return true
    if (!action.disabled) {
      this.executeColumnMenuAction(menu.column, action.id)
      this.columnMenuState = null
      this.refresh(['columns', 'layout', 'data'])
    }
    return true
  }

  /**
   * Определяет header zone для открытия column menu.
   */
  private resolveColumnMenuHeaderTarget(target: DataTableInteractionTarget<Row>, x: number, y: number): boolean {
    if (target.zone !== 'header') return false
    const headerMainHeight = this.headerHeight - this.filterRowHeight
    return y >= 0
      && y < headerMainHeight
      && x >= target.rect.x + Math.max(0, target.rect.width - 24)
      && x <= target.rect.x + target.rect.width
  }

  /**
   * Открывает menu действий для колонки.
   */
  private openColumnMenu(target: DataTableInteractionTarget<Row>): void {
    const actions = this.createColumnMenuActions(target.column)
    const width = 188
    const itemHeight = 26
    const height = actions.length * itemHeight + 8
    const x = clampInteger(target.rect.x + target.rect.width - width, 4, Math.max(4, this.width - width - 4))
    const y = clampInteger(this.headerHeight, 4, Math.max(4, this.height - height - 4))
    this.columnMenuState = {
      column: target.column,
      rect: { ...target.rect },
      x,
      y,
      width,
      itemHeight,
      actions,
    }
    this.refresh(['interaction'])
  }

  /**
   * Формирует список production actions для header menu.
   */
  private createColumnMenuActions(column: DataTableResolvedColumn<Row>): Array<ColumnMenuAction> {
    const sortEnabled = !!(this.props.view.sorting && column.sortable)
    const filtered = filterStateHasColumn(this.viewPipeline.getState().filters, column.id)
    const filterEnabled = !!(this.props.view.filtering && column.filter)
    return [
      { id: 'sort-asc', label: 'Sort ascending', disabled: !sortEnabled },
      { id: 'sort-desc', label: 'Sort descending', disabled: !sortEnabled },
      { id: 'clear-sort', label: 'Clear sort', disabled: !this.viewPipeline.getState().sort.some(rule => rule.columnId === column.id) },
      { id: 'filter', label: filtered ? 'Next filter value' : 'Apply filter', disabled: !filterEnabled },
      { id: 'clear-filter', label: 'Clear filter', disabled: !filtered },
      { id: 'pin-left', label: 'Pin left', disabled: column.pinned === 'left' },
      { id: 'pin-right', label: 'Pin right', disabled: column.pinned === 'right' },
      { id: 'unpin', label: 'Unpin', disabled: !column.pinned },
      { id: 'hide', label: 'Hide column', disabled: this.resolvedColumns.length <= 1 },
      { id: 'autosize', label: 'Autosize column' },
      { id: 'reset-columns', label: 'Reset column state' },
    ]
  }

  /**
   * Выполняет выбранное действие header menu.
   */
  private executeColumnMenuAction(column: DataTableResolvedColumn<Row>, action: ColumnMenuActionId): void {
    if (action === 'sort-asc' || action === 'sort-desc') {
      this.setColumnSortDirection(column.id, action === 'sort-asc' ? 'asc' : 'desc')
      return
    }
    if (action === 'clear-sort') {
      this.clearSort(column.id)
      return
    }
    if (action === 'filter') {
      this.handleFilterUiAction({
        column,
        rect: this.columnMenuState?.rect ?? { x: 0, y: 0, width: 0, height: 0 },
        action: 'value',
      })
      return
    }
    if (action === 'clear-filter') {
      this.clearFilter(column.id)
      return
    }
    if (action === 'pin-left' || action === 'pin-right') {
      this.pinColumn(column.id, action === 'pin-left' ? 'left' : 'right')
      return
    }
    if (action === 'unpin') {
      this.unpinColumn(column.id)
      return
    }
    if (action === 'hide') {
      this.hideColumn(column.id)
      return
    }
    if (action === 'autosize') {
      this.autosizeColumn(column.id)
      return
    }
    this.resetColumnState()
  }

  /**
   * Устанавливает direction для одной колонки без потери multi-sort chain.
   */
  private setColumnSortDirection(columnId: string, direction: 'asc' | 'desc'): void {
    if (!this.props.view.sorting) return
    const current = this.viewPipeline.getState().sort.filter(rule => rule.columnId !== columnId)
    const next = this.props.view.sorting.multi
      ? [...current, { columnId, direction }]
      : [{ columnId, direction }]
    this.viewPipeline.setSort(next)
    this.emitViewQuery('sort')
    this.setScroll(this.scrollX, 0)
    this.refresh(['data', 'layout'])
  }

  /**
   * Обрабатывает runtime-событие DataTableRootNode.
   */
  private handleHeaderAction(target: DataTableInteractionTarget<Row>, event: MouseEvent): void {
    if (!target.column.sortable || !this.props.view.sorting) return
    this.viewPipeline.cycleSort(target.column.id, event.shiftKey)
    this.emitViewQuery('sort')
    this.setScroll(this.scrollX, 0)
    this.refresh(['data', 'layout'])
  }

  /**
   * Определяет интерактивную область filter UI в header.
   */
  private resolveFilterUiTarget(
    target: DataTableInteractionTarget<Row>,
    x: number,
    y: number,
    event: MouseEvent,
  ): FilterUiTarget<Row> | null {
    if (!this.props.view.filterUi || !target.column.filter) return null
    const filterRowHeight = this.filterRowHeight
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
      const active = filterStateHasColumn(this.viewPipeline.getState().filters, target.column.id)
      if ((active && x >= rect.x + rect.width - 18) || event.altKey || event.metaKey) {
        return { column: target.column, rect, action: 'clear' }
      }
      if (x <= rect.x + Math.min(58, rect.width * 0.42)) return { column: target.column, rect, action: 'operator' }
      return { column: target.column, rect, action: 'value' }
    }

    if (this.props.view.filterUi.headerMenu && y < headerMainHeight && x >= rect.x + rect.width - 28) {
      rect.height = headerMainHeight
      return {
        column: target.column,
        rect,
        action: filterStateHasColumn(this.viewPipeline.getState().filters, target.column.id) && event.altKey
          ? 'clear'
          : 'value',
      }
    }
    return null
  }

  /**
   * Применяет быстрый built-in filter UI action.
   */
  private handleFilterUiAction(target: FilterUiTarget<Row>): boolean {
    const active = resolveColumnFilterRule(this.viewPipeline.getState().filters, target.column.id)
    if (target.action === 'clear') {
      this.clearFilter(target.column.id)
      return true
    }

    const filter = target.column.filter
    const operator = target.action === 'operator'
      ? resolveNextFilterOperator(filter, active?.operator)
      : active?.operator ?? resolveDefaultFilterOperator(filter)
    const value = target.action === 'value'
      ? resolveNextFilterValue(filter, active?.value)
      : active?.value ?? resolveDefaultFilterValue(filter)
    this.setFilter(target.column.id, { operator, value })
    return true
  }

  /**
   * Запускает runtime-процесс DataTableRootNode.
   */
  private startColumnDrag(target: DataTableInteractionTarget<Row>, event: MouseEvent): boolean {
    if (!this.canDragColumn(target)) return false

    const [x, y] = this.trackPointerPosition(event)
    const startIndex = this.resolvedColumns.findIndex(column => column.id === target.column.id)
    if (startIndex < 0) return false
    this.columnDragState = {
      column: target.column,
      startIndex,
      targetIndex: startIndex,
      pinned: target.column.pinned,
      active: false,
      pointerX: x,
      pointerY: y,
      grabOffsetX: x - target.rect.x,
    }
    this.columnDragLayoutMotion.clear()
    this.capturePointer(event)
    return true
  }

  /**
   * Выполняет внутренний шаг canDragColumn для DataTableRootNode.
   */
  private canDragColumn(target: DataTableInteractionTarget<Row>): boolean {
    return target.zone === 'header'
      && !!this.props.view.columnOrdering
      && this.props.view.columnOrdering.enabled
      && target.column.reorderable !== false
  }

  /**
   * Обновляет runtime-состояние DataTableRootNode.
   */
  private updateColumnDrag(meta: NovaDragEventMeta): void {
    const drag = this.columnDragState
    if (!drag) return

    const [x, y] = this.toLocal(meta.x, meta.y)
    this.lastPointerPosition = { x, y }
    drag.pointerX = x
    drag.pointerY = y
    if (!drag.active && Math.abs(meta.totalDx) < 6) return
    const wasActive = drag.active
    drag.active = true
    this.autoScrollColumnDrag(x)
    const targetIndex = this.resolveColumnDragTargetIndex(meta)
    if (targetIndex === undefined || targetIndex === drag.targetIndex) {
      if (!wasActive) {
        this.refresh(['interaction'])
        this.queueAnimationLoopSync()
      }
      return
    }

    const before = this.captureColumnXById()
    drag.targetIndex = targetIndex
    const after = this.captureColumnXById()
    this.startColumnLayoutMotion(before, after, drag.column.id)
    this.refresh(['interaction'])
  }

  /**
   * Фиксирует подготовленные изменения DataTableRootNode.
   */
  private commitColumnDrag(meta: NovaDragEventMeta): void {
    const drag = this.columnDragState
    if (!drag) return

    if (drag.active) this.suppressNextHeaderClickOnce()
    if (!drag.active) {
      this.columnDragState = null
      this.columnDragLayoutMotion.clear()
      return
    }

    const fromIndex = this.resolvedColumns.findIndex(column => column.id === drag.column.id)
    const toIndex = this.resolveColumnDragTargetIndex(meta) ?? drag.targetIndex
    this.columnDragState = null
    this.columnDragLayoutMotion.clear()
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return

    const order = this.resolvedColumns.map(column => column.id)
    const [id] = order.splice(fromIndex, 1)
    if (!id) return
    order.splice(toIndex, 0, id)

    const next = this.viewPipeline.reorderColumns({
      columnId: drag.column.id,
      fromIndex,
      toIndex,
      order,
      reason: 'drag',
    }, this.getColumnStateInputColumns())
    this.columnStateOverride = {
      ...this.toColumnStateInput(this.getColumnState()),
      order: next.order,
    }
    this.props.onColumnOrderChange?.(next)
    this.emitColumnStateChange()
    this.emitViewQuery('column')
    this.refresh(['columns', 'layout'])
  }

  /**
   * Выполняет внутренний шаг suppressNextHeaderClickOnce для DataTableRootNode.
   */
  private suppressNextHeaderClickOnce(): void {
    this.suppressNextHeaderClick = true
    setTimeout(() => {
      this.suppressNextHeaderClick = false
    }, 0)
  }

  /**
   * Нормализует и возвращает итоговое значение DataTableRootNode.
   */
  private resolveColumnDragTargetIndex(meta: NovaDragEventMeta): number | undefined {
    const drag = this.columnDragState
    if (!drag) return undefined

    const [x] = this.toLocal(meta.x, meta.y)
    const target = this.resolveColumnAt(x)
    const allowCrossPinned = !!(this.props.view.columnOrdering && this.props.view.columnOrdering.allowCrossPinned)
    if (!target) return this.resolveColumnDragEdgeTargetIndex(x, allowCrossPinned)
    if (!allowCrossPinned && target.column.pinned !== drag.pinned) return drag.targetIndex
    if (target.column.reorderable === false) return drag.targetIndex

    const targetIndex = this.resolvedColumns.findIndex(column => column.id === target.column.id)
    if (targetIndex < 0) return drag.targetIndex
    return this.resolveColumnDragInsertionIndex(targetIndex, x >= target.x + target.width / 2)
  }

  /**
   * Нормализует и возвращает итоговое значение DataTableRootNode.
   */
  private resolveColumnDragEdgeTargetIndex(x: number, allowCrossPinned: boolean): number | undefined {
    const drag = this.columnDragState
    if (!drag) return undefined
    const visible = this.visibleColumnRects('all', false)
      .filter(item => item.column.id !== drag.column.id)
      .filter(item => (allowCrossPinned || item.column.pinned === drag.pinned) && item.column.reorderable !== false)
    if (visible.length === 0) return drag.targetIndex
    if (x < 0) return this.resolveColumnDragInsertionIndex(this.resolvedColumns.findIndex(column => column.id === visible[0]?.column.id), false)
    if (x > this.width) return this.resolveColumnDragInsertionIndex(this.resolvedColumns.findIndex(column => column.id === visible[visible.length - 1]?.column.id), true)
    return drag.targetIndex
  }

  /**
   * Нормализует и возвращает итоговое значение DataTableRootNode.
   */
  private resolveColumnDragInsertionIndex(targetIndex: number, after: boolean): number {
    const drag = this.columnDragState
    if (!drag || targetIndex < 0) return targetIndex
    let insertionIndex = after ? targetIndex + 1 : targetIndex
    const fromIndex = this.resolvedColumns.findIndex(column => column.id === drag.column.id)
    if (fromIndex >= 0 && fromIndex < insertionIndex) insertionIndex -= 1
    return Math.max(0, Math.min(this.resolvedColumns.length - 1, insertionIndex))
  }

  /**
   * Выполняет внутренний шаг autoScrollColumnDrag для DataTableRootNode.
   */
  private autoScrollColumnDrag(x: number): void {
    const drag = this.columnDragState
    if (!drag || drag.pinned) return
    const edge = 28
    let nextX = this.scrollX
    if (x < this.viewport.bodyX + edge) nextX -= Math.max(24, this.viewport.bodyWidth * 0.08)
    else if (x > this.viewport.bodyX + this.viewport.bodyWidth - edge) nextX += Math.max(24, this.viewport.bodyWidth * 0.08)
    if (nextX !== this.scrollX) this.setScroll(nextX, this.scrollY)
  }

  /**
   * Возвращает внутреннюю диагностику render layers для unit/bench проверок.
   */
  __getRenderLayerDiagnostics(): DataTableRenderLayerDiagnostics {
    return {
      layerRebuilds: { ...this.renderLayerDiagnostics.layerRebuilds },
      templateCalls: this.renderLayerDiagnostics.templateCalls,
      interactionRebuilds: this.renderLayerDiagnostics.interactionRebuilds,
      animatedLayerRebuilds: this.renderLayerDiagnostics.animatedLayerRebuilds,
    }
  }

  /**
   * Сбрасывает внутреннюю диагностику render layers.
   */
  __resetRenderLayerDiagnostics(): void {
    const next = createRenderLayerDiagnostics()
    Object.assign(this.renderLayerDiagnostics.layerRebuilds, next.layerRebuilds)
    this.renderLayerDiagnostics.templateCalls = 0
    this.renderLayerDiagnostics.interactionRebuilds = 0
    this.renderLayerDiagnostics.animatedLayerRebuilds = 0
  }

  /**
   * Рендерит слой из cache или пересобирает его при необходимости.
   */
  private renderLayer(id: DataTableRenderLayerId, render: () => void): void {
    const layer = this.renderLayers.get(id)
    if (!layer) return

    if (layer.dirty || !layer.initialized) {
      const previousLayer = this.activeRenderLayerId
      const previousClip = this.activeRenderClip
      this.activeRenderLayerId = id
      this.activeRenderClip = null
      layer.segments = []
      try {
        render()
      } finally {
        this.activeRenderLayerId = previousLayer
        this.activeRenderClip = previousClip
      }
      layer.initialized = true
      layer.dirty = false
      layer.rebuilds += 1
      this.renderLayerDiagnostics.layerRebuilds[id] += 1
      if (id === 'interaction') this.renderLayerDiagnostics.interactionRebuilds += 1
      if (id === 'body-animated') this.renderLayerDiagnostics.animatedLayerRebuilds += 1
    }

    for (const segment of layer.segments) this.emitRenderSegment(segment)
    if (id === 'body-animated' && layer.segments.length > 0) this.visibleAnimatedCells = true
  }

  /**
   * Добавляет schema в текущий render layer или сразу в renderer.
   */
  private emitSchema(schema: NovaSchema): void {
    if (schema.length === 0) return
    const segment: DataTableRenderSegment = {
      schema,
      clip: this.activeRenderClip ? { ...this.activeRenderClip } : undefined,
    }
    const layer = this.activeRenderLayerId ? this.renderLayers.get(this.activeRenderLayerId) : null
    if (layer) {
      layer.segments.push(segment)
      return
    }
    this.emitRenderSegment(segment)
  }

  /**
   * Выполняет отрисовку render segment.
   */
  private emitRenderSegment(segment: DataTableRenderSegment): void {
    if (segment.clip) {
      this.renderer.clip(segment.clip.x, segment.clip.y, segment.clip.width, segment.clip.height)
      this.renderer.schema(segment.schema)
      this.renderer.clearClip()
      return
    }
    this.renderer.schema(segment.schema)
  }

  /**
   * Применяет clip к schema, созданным внутри callback.
   */
  private withRenderClip(clip: DataTableCellRect, render: () => void): void {
    if (clip.width <= 0 || clip.height <= 0) return
    const previousClip = this.activeRenderClip
    this.activeRenderClip = clip
    try {
      render()
    } finally {
      this.activeRenderClip = previousClip
    }
  }

  /**
   * Выполняет отрисовку DataTableRootNode.
   */
  private renderGrid(): void {
    const rebuildsCellLayers = this.willRebuildLayers(DATA_TABLE_TEXT_SELECTION_SOURCE_LAYERS)
    if (rebuildsCellLayers) {
      this.nextVisibleCellKeys = new Set()
      this.cellEnterRenderCount = 0
    }
    this.visibleAnimatedCells = false

    this.renderLayer('base', () => this.emitSchema(buildBoxSchema(this.props, this.width, this.height)))
    this.renderLayer('header', () => this.renderHeaderLayer())
    this.renderLayer('pinned', () => this.renderPinnedLayer())
    this.renderLayer('body-static', () => this.renderBodyRows(false))
    this.renderLayer('body-animated', () => this.renderBodyRows(true))
    this.renderLayer('group-summary', () => this.renderPinnedBottomGroupPanel())
    this.renderLayer('search', () => this.renderSearchOverlay())
    this.renderLayer('selection', () => {
      this.renderClipboardFeedbackOverlay()
      this.renderTextSelectionOverlay()
      this.renderSelectionOverlay()
    })
    this.renderLayer('interaction', () => {
      this.renderHoverOverlay()
      this.renderInteractionLayer()
    })
    this.renderLayer('drag-menu-tooltip', () => {
      this.renderColumnDragOverlay()
      this.renderColumnMenu()
      this.renderTooltipLayer()
    })
    this.renderLayer('scrollbars', () => {
      this.renderScrollbars()
      this.renderScrollbarLayer()
    })
    if (rebuildsCellLayers) this.finalizeVisibleCellKeys()
    this.queueAnimationLoopSync()
  }

  /**
   * Рендерит header слой.
   */
  private renderHeaderLayer(): void {
    const headerY = 0
    const filterRowHeight = this.filterRowHeight
    const headerMainHeight = this.headerHeight - filterRowHeight
    this.renderPartitionedRowZone('header', [{} as Row], headerY, headerMainHeight, false)
    if (filterRowHeight > 0) this.renderFilterRow(headerY + headerMainHeight, filterRowHeight)
  }

  /**
   * Рендерит pinned rows слой.
   */
  private renderPinnedLayer(): void {
    const pinnedRows = this.resolveEffectivePinnedRows()
    const topRows = pinnedRows.top ?? []
    const bottomRows = pinnedRows.bottom ?? []

    if (topRows.length > 0) {
      this.renderPartitionedRowZone('pinned-top', topRows, this.headerHeight, this.rowHeight, false)
    }

    if (bottomRows.length > 0) {
      this.renderPartitionedRowZone(
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
  private renderPartitionedRowZone(
    zone: DataTableCellContext<Row>['zone'],
    rows: Array<Row> | Array<RenderedTableRow<Row>>,
    yStart: number,
    rowHeight: number,
    useBodyIndex: boolean,
    columnPredicate?: (column: DataTableResolvedColumn<Row>) => boolean,
    includeGroupRows = true,
  ): void {
    const clipHeight = zone === 'body'
      ? this.viewport.bodyHeight
      : rows.length * rowHeight
    const clipY = zone === 'body'
      ? this.viewport.bodyY
      : yStart

    this.renderClippedRowZone(
      zone,
      rows,
      yStart,
      rowHeight,
      useBodyIndex,
      'center',
      this.viewport.bodyX,
      clipY,
      this.viewport.bodyWidth,
      clipHeight,
      columnPredicate,
      includeGroupRows,
    )

    if (this.viewport.pinnedLeftWidth > 0) {
      this.renderClippedRowZone(
        zone,
        rows,
        yStart,
        rowHeight,
        useBodyIndex,
        'left',
        0,
        clipY,
        this.viewport.pinnedLeftWidth,
        clipHeight,
        columnPredicate,
        includeGroupRows,
      )
    }

    if (this.viewport.pinnedRightWidth > 0) {
      this.renderClippedRowZone(
        zone,
        rows,
        yStart,
        rowHeight,
        useBodyIndex,
        'right',
        this.width - this.viewport.pinnedRightWidth,
        clipY,
        this.viewport.pinnedRightWidth,
        clipHeight,
        columnPredicate,
        includeGroupRows,
      )
    }
  }

  /**
   * Выполняет отрисовку DataTableRootNode.
   */
  private renderBodyRows(animatedOnly: boolean): void {
    const rows: Array<RenderedTableRow<Row>> = []
    for (let rowIndex = this.viewport.rowRange.start; rowIndex < this.viewport.rowRange.end; rowIndex += 1) {
      const viewRow = this.viewPipeline.getViewRowAt(rowIndex)
      if (!viewRow) continue
      const renderedRow = this.createRenderedBodyRow(viewRow, rowIndex)
      if (renderedRow) rows.push(renderedRow)
    }
    if (rows.length === 0) return

    this.renderPartitionedRowZone(
      'body',
      rows,
      this.viewport.bodyY,
      this.rowHeight,
      true,
      column => animatedOnly ? !!column.animated : !column.animated,
      !animatedOnly,
    )
  }

  /**
   * Рисует встроенную canvas filter row под header captions.
   */
  private renderFilterRow(y: number, height: number): void {
    this.renderFilterRowRegion('center', y, height, this.viewport.bodyX, this.viewport.bodyWidth)
    if (this.viewport.pinnedLeftWidth > 0) {
      this.renderFilterRowRegion('left', y, height, 0, this.viewport.pinnedLeftWidth)
    }
    if (this.viewport.pinnedRightWidth > 0) {
      this.renderFilterRowRegion('right', y, height, this.width - this.viewport.pinnedRightWidth, this.viewport.pinnedRightWidth)
    }
  }

  /**
   * Рисует filter row для отдельного pinned/center региона.
   */
  private renderFilterRowRegion(
    region: VisibleColumnRegion,
    y: number,
    height: number,
    clipX: number,
    clipWidth: number,
  ): void {
    if (clipWidth <= 0 || height <= 0) return

    const schema: NovaSchema = []
    const viewState = this.viewPipeline.getState()
    for (const columnRect of this.visibleColumnRects(region)) {
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

      const context = this.createFilterRowContext(columnRect, rect)
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
      if (!label) continue

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
            size: Math.max(9, this.fontSize - 3),
            weight: '700',
          },
          lineHeight: Math.max(10, this.lineHeight - 3),
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
            size: Math.max(10, this.fontSize - 2),
            weight: active ? '700' : '500',
          },
          lineHeight: Math.max(10, this.lineHeight - 2),
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
              size: Math.max(12, this.fontSize),
              weight: '800',
            },
            lineHeight: Math.max(10, this.lineHeight),
            align: { horizontal: 'center', vertical: 'middle' },
          },
        })
      }
    }

    this.withRenderClip({ x: clipX, y, width: clipWidth, height }, () => this.emitSchema(schema))
  }

  /**
   * Собирает context для пользовательского #filter slot.
   */
  private createFilterRowContext(
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
      value: summarizeColumnFilters(this.viewPipeline.getState().filters, columnRect.column.id),
      rect,
      state: this.createCellState(rect, rowId, -1, undefined, columnRect, 'header'),
      zone: 'header',
      store: this.store,
      api: this.api,
    }
  }

  /**
   * Создает runtime-сущность DataTableRootNode.
   */
  private createRenderedBodyRow(viewRow: DataTableViewRow<Row>, rowIndex: number): RenderedTableRow<Row> | null {
    if (viewRow.kind === 'data') {
      if (!viewRow.row) return null
      return {
        kind: 'data',
        row: viewRow.row,
        rowId: viewRow.rowId ?? this.resolveRenderedRowId('body', viewRow.row, rowIndex),
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
  private renderClippedRowZone(
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
    if (clipWidth <= 0 || clipHeight <= 0) return

    this.withRenderClip({ x: clipX, y: clipY, width: clipWidth, height: clipHeight }, () => {
      this.renderRowZone(zone, rows, yStart, rowHeight, useBodyIndex, columnRegion, columnPredicate, includeGroupRows)
    })
  }

  /**
   * Выполняет отрисовку DataTableRootNode.
   */
  private renderRowZone(
    zone: DataTableCellContext<Row>['zone'],
    rows: Array<Row> | Array<RenderedTableRow<Row>>,
    yStart: number,
    rowHeight: number,
    useBodyIndex: boolean,
    columnRegion: VisibleColumnRegion = 'all',
    columnPredicate?: (column: DataTableResolvedColumn<Row>) => boolean,
    includeGroupRows = true,
  ): void {
    const schema: NovaSchema = []
    const columnRects = this.visibleColumnRects(columnRegion).filter(rect => !columnPredicate || columnPredicate(rect.column))

    rows.forEach((rowInput, localIndex) => {
      const renderedRow = this.normalizeRenderedRow(zone, rowInput, localIndex, useBodyIndex)
      const { rowIndex, storeIndex } = renderedRow
      const y = zone === 'body'
        ? this.viewport.bodyY + rowIndex * this.rowHeight - this.scrollY
        : yStart + localIndex * rowHeight

      if (renderedRow.kind !== 'data') {
        if (includeGroupRows) this.renderGroupLikeRow(schema, renderedRow, y, rowHeight, columnRegion)
        return
      }

      const { row, rowId } = renderedRow
      for (const columnRect of columnRects) {
        const rect: DataTableCellRect = {
          x: columnRect.x,
          y,
          width: columnRect.width,
          height: rowHeight,
        }
        this.renderCell(schema, {
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
          state: this.createCellState(rect, rowId, rowIndex, storeIndex, columnRect, zone),
          zone,
          store: this.store,
          api: this.api,
        })
      }
    })

    this.emitSchema(schema)
  }

  /**
   * Нормализует входные данные DataTableRootNode.
   */
  private normalizeRenderedRow(
    zone: DataTableCellContext<Row>['zone'],
    rowInput: Row | RenderedTableRow<Row>,
    localIndex: number,
    useBodyIndex: boolean,
  ): RenderedTableRow<Row> {
    if (isRenderedRow(rowInput)) return rowInput

    const rowIndex = zone === 'body' && useBodyIndex
      ? this.viewport.rowRange.start + localIndex
      : localIndex
    const rowId = zone === 'header'
      ? '__header__'
      : this.resolveRenderedRowId(zone, rowInput, rowIndex)
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
  private renderGroupLikeRow(
    schema: NovaSchema,
    row: RenderedGroupRow<Row>,
    y: number,
    height: number,
    columnRegion: VisibleColumnRegion,
  ): void {
    const rect = this.createRegionRect(columnRegion, y, height)
    if (!rect) return

    const template = row.kind === 'group'
      ? this.props.groupRowTemplate
      : row.kind === 'group-footer'
        ? this.props.groupFooterTemplate
        : this.props.grandFooterTemplate

    if (template) {
      schema.push(...template(this.createGroupTemplateContext(row, rect, false)))
      return
    }

    if (row.kind === 'grand-footer') return
    schema.push(...this.renderDefaultGroupRow(row, rect))
  }

  /**
   * Создает runtime-сущность DataTableRootNode.
   */
  private createRegionRect(columnRegion: VisibleColumnRegion, y: number, height: number): DataTableCellRect | null {
    if (columnRegion === 'left') {
      if (this.viewport.pinnedLeftWidth <= 0) return null
      return { x: 0, y, width: this.viewport.pinnedLeftWidth, height }
    }
    if (columnRegion === 'right') {
      if (this.viewport.pinnedRightWidth <= 0) return null
      return { x: this.width - this.viewport.pinnedRightWidth, y, width: this.viewport.pinnedRightWidth, height }
    }
    return { x: this.viewport.bodyX, y, width: this.viewport.bodyWidth, height }
  }

  /**
   * Создает runtime-сущность DataTableRootNode.
   */
  private createGroupTemplateContext(
    row: RenderedGroupRow<Row>,
    rect: DataTableCellRect,
    pinned: boolean,
  ): DataTableGroupTemplateContext<Row> {
    return {
      group: row.group,
      aggregate: row.aggregate,
      rows: row.rows,
      viewport: this.viewport,
      rect,
      zone: pinned ? 'pinned-bottom' : row.zone as DataTableGroupTemplateContext<Row>['zone'],
      state: {
        expanded: row.group?.expanded ?? true,
        hovered: this.hoverActive && this.hoverTarget?.rowId === row.rowId,
        pinned,
      },
      toggle: () => {
        if (row.group) this.toggleGroup(row.group.groupId)
      },
      api: this.api,
    }
  }

  /**
   * Выполняет отрисовку DataTableRootNode.
   */
  private renderDefaultGroupRow(row: RenderedGroupRow<Row>, rect: DataTableCellRect): NovaSchema {
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
            size: this.fontSize,
            weight: isFooter ? '700' : '800',
          },
          lineHeight: this.lineHeight,
          align: { horizontal: 'left', vertical: 'middle' },
          ellipsis: true,
        },
      },
    ]
  }

  /**
   * Создает runtime-сущность DataTableRootNode.
   */
  private createCellState(
    rect: DataTableCellRect,
    rowId: DataTableRowId,
    rowIndex: number,
    storeIndex: number | undefined,
    columnRect: VisibleColumnRect<Row>,
    zone: DataTableCellContext<Row>['zone'],
  ): DataTableCellContext<Row>['state'] {
    const hover = this.hoverActive ? this.hoverTarget : null
    const selection = this.selectionActive ? this.selection : null
    const viewState = this.viewPipeline.getState()
    const sortIndex = viewState.sort.findIndex(rule => rule.columnId === columnRect.column.id)
    const searchHit = this.viewPipeline.getSearchMatchForCell(rowId, columnRect.column.id)
    const searchRowHit = this.viewPipeline.getSearchMatchForRow(rowId)
    const editing = this.editingState
    const columnDrag = this.columnDragState
    const editingActive = !!editing
      && editing.rowId === rowId
      && editing.column.id === columnRect.column.id
      && editing.zone === zone
    const hoverAffectsCells = !!hover && !isGroupInteractionZone(hover.zone)
    const hovered = hoverAffectsCells && hover.zone === zone && hover.rowId === rowId && hover.column.id === columnRect.column.id
    const rowHovered = hoverAffectsCells && hover.zone === zone && hover.rowId === rowId
    const columnHovered = hoverAffectsCells && hover.column.id === columnRect.column.id
    const selectionHit = this.resolveSelectionHit(rowId, rowIndex, columnRect.column.id)
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
      zoom: this.zoomValue,
      rowScale: this.zoomRowScale,
      headerScale: this.zoomHeaderScale,
      columnScale: this.zoomColumnScale,
      textScale: this.zoomTextScale,
      iconScale: this.zoomIconScale,
      pinnedColumn: columnRect.column.pinned,
      pinnedRow: zone === 'pinned-top' || zone === 'pinned-bottom' ? zone.replace('pinned-', '') as DataTablePinnedRowPosition : undefined,
      sorted: sortIndex >= 0 ? viewState.sort[sortIndex]?.direction : undefined,
      sortPriority: sortIndex >= 0 ? sortIndex : undefined,
      filtered: filterStateHasColumn(viewState.filters, columnRect.column.id),
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
  private renderCell(schema: NovaSchema, context: DataTableCellContext<Row>): void {
    const startIndex = schema.length
    const template = context.zone === 'header'
      ? context.column.headerTemplate ?? this.props.headerTemplate
      : context.column.cellTemplate ?? this.props.cellTemplate
    if (context.zone !== 'header' && context.column.animated) this.visibleAnimatedCells = true

    if (template) {
      this.renderLayerDiagnostics.templateCalls += 1
      schema.push(...template(context))
      this.applyTextPerformanceHints(schema, startIndex)
      this.applyCellEnterOpacity(schema, context, startIndex)
      this.applyColumnDragCellOpacity(schema, context, startIndex)
      this.registerTextSelectionTargets(schema, context, startIndex)
      return
    }

    this.renderDefaultCell(schema, context)
    this.applyTextPerformanceHints(schema, startIndex)
    this.applyCellEnterOpacity(schema, context, startIndex)
    this.applyColumnDragCellOpacity(schema, context, startIndex)
    this.registerTextSelectionTargets(schema, context, startIndex)
  }

  /**
   * Применяет подготовленное состояние DataTableRootNode.
   */
  private applyTextPerformanceHints(schema: NovaSchema, startIndex: number): void {
    const textOptions = this.props.performance.text
    if (!textOptions) return

    for (let index = startIndex; index < schema.length; index += 1) {
      const item = schema[index]
      if (!item || item.type !== 'text') continue

      item.meta = {
        ...item.meta,
        textMode: item.meta?.textMode ?? 'run-atlas',
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
  private applyColumnDragCellOpacity(
    schema: NovaSchema,
    context: DataTableCellContext<Row>,
    startIndex: number,
  ): void {
    const drag = this.columnDragState
    if (!drag?.active || drag.column.id !== context.column.id) return
    const alpha = context.zone === 'header' ? 0.18 : 0.22
    for (let index = startIndex; index < schema.length; index += 1) {
      const item = schema[index]
      if (!item) continue
      item.styles = item.styles ?? {}
      const currentOpacity = typeof item.styles.opacity === 'number' ? item.styles.opacity : 1
      item.styles.opacity = currentOpacity * alpha
    }
  }

  /**
   * Применяет подготовленное состояние DataTableRootNode.
   */
  private applyCellEnterOpacity(
    schema: NovaSchema,
    context: DataTableCellContext<Row>,
    startIndex: number,
  ): void {
    const alpha = this.resolveCellEnterAlpha(context)
    if (alpha >= 1) return

    for (let index = startIndex; index < schema.length; index += 1) {
      const item = schema[index]
      if (!item?.styles) continue
      const currentOpacity = typeof item.styles.opacity === 'number' ? item.styles.opacity : 1
      item.styles.opacity = currentOpacity * alpha
    }
  }

  /**
   * Нормализует и возвращает итоговое значение DataTableRootNode.
   */
  private resolveCellEnterAlpha(context: DataTableCellContext<Row>): number {
    const cellsMotion = this.props.interaction.motion && this.props.interaction.motion.cells
    if (!cellsMotion || cellsMotion.enter === 'none' || context.zone === 'header') return 1
    if (!this.nova.raph.loopEnabled) return 1

    const key = this.createCellKey(context)
    this.nextVisibleCellKeys.add(key)
    if (this.visibleCellKeys.has(key) || performance.now() < this.suppressCellEnterUntil) return 1
    if (!this.cellEnterStartedAt.has(key)) {
      if (this.cellEnterRenderCount >= cellsMotion.maxAnimatedCells) return 1
      this.cellEnterStartedAt.set(key, performance.now() + this.cellEnterRenderCount * cellsMotion.stagger)
      this.cellEnterRenderCount += 1
    }

    const startedAt = this.cellEnterStartedAt.get(key) ?? performance.now()
    const progress = Math.max(0, Math.min(1, (performance.now() - startedAt) / Math.max(1, cellsMotion.duration)))
    if (progress < 1) this.nova.invalidate()
    return progress
  }

  /**
   * Выполняет внутренний шаг finalizeVisibleCellKeys для DataTableRootNode.
   */
  private finalizeVisibleCellKeys(): void {
    this.visibleCellKeys = this.nextVisibleCellKeys
    for (const key of [...this.cellEnterStartedAt.keys()]) {
      if (!this.visibleCellKeys.has(key)) this.cellEnterStartedAt.delete(key)
    }
  }

  /**
   * Создает runtime-сущность DataTableRootNode.
   */
  private createCellKey(context: DataTableCellContext<Row>): string {
    return `${context.zone}:${String(context.rowId)}:${context.column.id}`
  }

  /**
   * Добавляет действие в очередь выполнения DataTableRootNode.
   */
  private queueAnimationLoopSync(): void {
    if (this.animationLoopSyncQueued) return
    this.animationLoopSyncQueued = true
    queueMicrotask(() => {
      this.animationLoopSyncQueued = false
      this.syncAnimationLoop()
    })
  }

  /**
   * Синхронизирует состояние между слоями DataTableRootNode.
   */
  private syncAnimationLoop(): void {
    if (this.lifecycleState === 'destroyed') return

    if (this.visibleAnimatedCells || this.columnDragState?.active || this.columnDragLayoutMotion.size > 0) {
      if (!this.animationLoopLease) {
        this.animationLoopLease = this.nova.raph.acquireLoop('nova-datatable:animated-cells')
      }
      if (this.visibleAnimatedCells) this.markRenderLayersDirty(['body-animated'])
      if (this.columnDragState?.active || this.columnDragLayoutMotion.size > 0) this.markRenderLayersDirty(DATA_TABLE_RENDER_LAYER_IDS)
      this.visibleAnimatedCells = false
      this.dirty({ render: true })
      this.nova.invalidate()
      return
    }

    this.releaseAnimationLoop()
  }

  /**
   * Выполняет внутренний шаг releaseAnimationLoop для DataTableRootNode.
   */
  private releaseAnimationLoop(): void {
    this.animationLoopLease?.release()
    this.animationLoopLease = null
  }

  /**
   * Выполняет отрисовку DataTableRootNode.
   */
  private renderDefaultCell(schema: NovaSchema, context: DataTableCellContext<Row>): void {
    const { rect, value, column, zone, rowIndex } = context
    const isHeader = zone === 'header'
    const isPinned = zone === 'pinned-top' || zone === 'pinned-bottom'
    const searchState = this.viewPipeline.getSearchState()
    const searchHighlight = searchState.query.highlight ?? 'cell-text'
    const cellSearchHighlighted = !isHeader
      && context.state.searchMatched
      && searchHighlightHasCell(searchHighlight)
    const background = isHeader && context.state.dragging
      ? '#dbeafe'
      : cellSearchHighlighted
      ? context.state.searchActive ? '#fff1f2' : '#fef3c7'
      : this.resolveDefaultCellBackground(context, isHeader, isPinned, rowIndex)
    const color = isHeader ? '#172033' : '#263142'
    const text = String(value ?? '')
    const textRect = {
      x: rect.x + 10,
      y: rect.y,
      width: Math.max(0, rect.width - 20),
      height: rect.height,
    }
    const fontSize = this.fontSize
    const fontWeight = isHeader ? '700' : '500'

    schema.push(
      {
        type: 'rect',
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        styles: {
          background,
          border: {
            color: '#d8e0ea',
            width: 1,
          },
        },
      },
      {
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
          lineHeight: this.lineHeight,
          align: {
            horizontal: column.align,
            vertical: 'middle',
          },
          ellipsis: true,
        },
      },
    )

    if (!isHeader && context.state.searchRanges?.length && searchHighlightHasText(searchHighlight)) {
      schema.push(...this.renderDefaultCellSearchTextHighlights(
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
  private registerTextSelectionTargets(schema: NovaSchema, context: DataTableCellContext<Row>, startIndex: number): void {
    if (!this.props.textSelection || !this.props.textSelection.enabled) return
    if (this.isTextSelectionIndexSuppressed()) return
    if (!this.isTextSelectionZoneEnabled(context.zone)) return

    for (let index = startIndex; index < schema.length; index += 1) {
      const item = schema[index]
      if (!item || item.type !== 'text' || typeof item.text !== 'string' || item.text.length === 0) continue
      const metaSelection = item.meta?.textSelection as { selectable?: boolean; copyable?: boolean; scope?: string } | undefined
      const selectable = this.props.textSelection.mode === 'visible-cells'
        ? true
        : metaSelection?.selectable === true
      if (!selectable) continue

      this.textSelection.register({
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
   * Выполняет внутренний шаг isTextSelectionIndexSuppressed для DataTableRootNode.
   */
  private isTextSelectionIndexSuppressed(): boolean {
    return !this.textSelectionActive && performance.now() < this.suppressTextSelectionIndexUntil
  }

  /**
   * Выполняет внутренний шаг isTextSelectionZoneEnabled для DataTableRootNode.
   */
  private isTextSelectionZoneEnabled(zone: DataTableCellContext<Row>['zone']): boolean {
    const options = this.props.textSelection
    if (!options || !options.enabled) return false
    if (zone === 'header') return options.headerText
    if (zone === 'body') return options.cellText
    if (zone === 'pinned-top' || zone === 'pinned-bottom') return options.pinnedRows
    return false
  }

  /**
   * Выполняет отрисовку DataTableRootNode.
   */
  private renderTextSelectionOverlay(): void {
    if (!this.props.textSelection || !this.props.textSelection.enabled) return
    const ranges = this.textSelection.getRanges()
    if (ranges.length === 0) return

    const color = this.props.textSelection.selectionColor
    const schema: NovaSchema = ranges.flatMap(item => {
      const start = Math.max(0, Math.min(item.target.text.length, item.range.start))
      const end = Math.max(start, Math.min(item.target.text.length, item.range.end))
      if (start === end) return []

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
    this.emitSchema(schema)
  }

  /**
   * Выполняет отрисовку DataTableRootNode.
   */
  private renderDefaultCellSearchTextHighlights(
    text: string,
    rect: DataTableCellRect,
    align: DataTableResolvedColumn<Row>['align'],
    ranges: Array<{ start: number; end: number }>,
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
      if (!part) continue
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
          lineHeight: this.lineHeight,
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
  private resolveDefaultCellBackground(
    context: DataTableCellContext<Row>,
    isHeader: boolean,
    isPinnedRow: boolean,
    rowIndex: number,
  ): string {
    const pinnedColumn = !!context.state.pinnedColumn
    if (pinnedColumn && isPinnedRow) return '#fff2c4'
    if (pinnedColumn && isHeader) return '#fff6d8'
    if (pinnedColumn) return '#fffbea'
    if (isPinnedRow) return '#fff8df'
    if (isHeader) return '#eef3f8'
    return rowIndex % 2 === 0 ? '#ffffff' : '#fbfcfe'
  }

  /**
   * Выполняет внутренний шаг visibleColumnRects для DataTableRootNode.
   */
  private visibleColumnRects(region: VisibleColumnRegion = 'all', animated = true): Array<VisibleColumnRect<Row>> {
    if (this.columnDragState?.active) return this.visibleColumnRectsForDrag(region, animated)

    const left = this.resolvedColumns.filter(column => column.pinned === 'left')
    const center = this.resolvedColumns.filter(column => !column.pinned)
    const right = this.resolvedColumns.filter(column => column.pinned === 'right')
    const rects: Array<VisibleColumnRect<Row>> = []

    if (region === 'all' || region === 'left') {
      let x = 0
      for (const column of left) {
        rects.push({ column, columnIndex: this.columnIndexById.get(column.id) ?? 0, x: x + (animated ? this.resolveColumnDragLayoutOffset(column.id) : 0), width: column.resolvedWidth })
        x += column.resolvedWidth
      }
    }

    if (region === 'all' || region === 'center') {
      let centerOffset = this.viewport.centerColumnOffset
      for (let index = this.viewport.centerColumnRange.start; index < this.viewport.centerColumnRange.end; index += 1) {
        const column = center[index]
        if (!column) continue
        rects.push({
          column,
          columnIndex: this.columnIndexById.get(column.id) ?? 0,
          x: this.viewport.bodyX + centerOffset - this.scrollX + (animated ? this.resolveColumnDragLayoutOffset(column.id) : 0),
          width: column.resolvedWidth,
        })
        centerOffset += column.resolvedWidth
      }
    }

    if (region === 'all' || region === 'right') {
      let x = this.width - this.viewport.pinnedRightWidth
      for (const column of right) {
        rects.push({ column, columnIndex: this.columnIndexById.get(column.id) ?? 0, x: x + (animated ? this.resolveColumnDragLayoutOffset(column.id) : 0), width: column.resolvedWidth })
        x += column.resolvedWidth
      }
    }

    return rects
  }

  /**
   * Выполняет внутренний шаг visibleColumnRectsForDrag для DataTableRootNode.
   */
  private visibleColumnRectsForDrag(region: VisibleColumnRegion, animated: boolean): Array<VisibleColumnRect<Row>> {
    const columns = this.resolveColumnDragPreviewColumns()
    const left = columns.filter(column => column.pinned === 'left')
    const center = columns.filter(column => !column.pinned)
    const right = columns.filter(column => column.pinned === 'right')
    const rects: Array<VisibleColumnRect<Row>> = []

    if (region === 'all' || region === 'left') {
      let x = 0
      for (const column of left) {
        const animatedX = x + (animated ? this.resolveColumnDragLayoutOffset(column.id) : 0)
        rects.push({ column, columnIndex: this.columnIndexById.get(column.id) ?? 0, x: animatedX, width: column.resolvedWidth })
        x += column.resolvedWidth
      }
    }

    if (region === 'all' || region === 'center') {
      let x = this.viewport.bodyX - this.scrollX
      for (const column of center) {
        const visible = x + column.resolvedWidth >= this.viewport.bodyX && x <= this.viewport.bodyX + this.viewport.bodyWidth
        if (visible) {
          const animatedX = x + (animated ? this.resolveColumnDragLayoutOffset(column.id) : 0)
          rects.push({ column, columnIndex: this.columnIndexById.get(column.id) ?? 0, x: animatedX, width: column.resolvedWidth })
        }
        x += column.resolvedWidth
      }
    }

    if (region === 'all' || region === 'right') {
      let x = this.width - this.viewport.pinnedRightWidth
      for (const column of right) {
        const animatedX = x + (animated ? this.resolveColumnDragLayoutOffset(column.id) : 0)
        rects.push({ column, columnIndex: this.columnIndexById.get(column.id) ?? 0, x: animatedX, width: column.resolvedWidth })
        x += column.resolvedWidth
      }
    }

    return rects
  }

  /**
   * Нормализует и возвращает итоговое значение DataTableRootNode.
   */
  private resolveColumnDragPreviewColumns(): Array<DataTableResolvedColumn<Row>> {
    const drag = this.columnDragState
    if (!drag?.active) return this.resolvedColumns
    const columns = [...this.resolvedColumns]
    const fromIndex = columns.findIndex(column => column.id === drag.column.id)
    if (fromIndex < 0) return columns
    const [column] = columns.splice(fromIndex, 1)
    if (!column) return columns
    columns.splice(Math.max(0, Math.min(columns.length, drag.targetIndex)), 0, column)
    return columns
  }

  /**
   * Выполняет внутренний шаг captureColumnXById для DataTableRootNode.
   */
  private captureColumnXById(): Map<string, number> {
    const result = new Map<string, number>()
    for (const rect of this.visibleColumnRects('all', false)) result.set(rect.column.id, rect.x)
    return result
  }

  /**
   * Запускает runtime-процесс DataTableRootNode.
   */
  private startColumnLayoutMotion(before: Map<string, number>, after: Map<string, number>, draggedColumnId: string): void {
    const now = performance.now()
    for (const [columnId, previousX] of before) {
      if (columnId === draggedColumnId) continue
      const nextX = after.get(columnId)
      if (nextX === undefined) continue
      const delta = previousX - nextX
      if (Math.abs(delta) < 0.5) continue
      this.columnDragLayoutMotion.set(columnId, {
        from: delta,
        startedAt: now,
        duration: 130,
      })
    }
    this.queueAnimationLoopSync()
  }

  /**
   * Нормализует и возвращает итоговое значение DataTableRootNode.
   */
  private resolveColumnDragLayoutOffset(columnId: string): number {
    const motion = this.columnDragLayoutMotion.get(columnId)
    if (!motion) return 0
    const progress = Math.max(0, Math.min(1, (performance.now() - motion.startedAt) / motion.duration))
    if (progress >= 1) {
      this.columnDragLayoutMotion.delete(columnId)
      return 0
    }
    const eased = 1 - Math.pow(1 - progress, 3)
    return motion.from * (1 - eased)
  }

  /**
   * Нормализует и возвращает итоговое значение DataTableRootNode.
   */
  private resolveColumnDragDropIndicatorX(): number | null {
    const drag = this.columnDragState
    if (!drag?.active) return null
    const rect = this.visibleColumnRects('all', false).find(item => item.column.id === drag.column.id)
    return rect ? rect.x : null
  }

  /**
   * Выполняет отрисовку DataTableRootNode.
   */
  private renderInteractionOverlay(): void {
    this.renderHoverOverlay()
    this.renderSelectionOverlay()
  }

  /**
   * Выполняет отрисовку DataTableRootNode.
   */
  private renderSearchOverlay(): void {
    const searchState = this.viewPipeline.getSearchState()
    const highlight = searchState.query.highlight ?? 'cell-text'
    if (!searchState.query.text || !searchHighlightHasRow(highlight)) return

    const schema: NovaSchema = []
    const activeRowIds = new Set<DataTableRowId>()
    const matchedRowIds = new Set<DataTableRowId>()
    for (let index = 0; index < searchState.matches.length; index += 1) {
      const match = searchState.matches[index]!
      if (match.rowId === undefined) continue
      matchedRowIds.add(match.rowId)
      if (index === searchState.activeIndex) activeRowIds.add(match.rowId)
    }

    for (let rowIndex = this.viewport.rowRange.start; rowIndex < this.viewport.rowRange.end; rowIndex += 1) {
      const viewRow = this.viewPipeline.getViewRowAt(rowIndex)
      if (!viewRow || viewRow.kind !== 'data' || viewRow.rowId === undefined || !matchedRowIds.has(viewRow.rowId)) continue
      const y = this.viewport.bodyY + rowIndex * this.rowHeight - this.scrollY
      const color = activeRowIds.has(viewRow.rowId)
        ? 'rgba(219, 39, 119, 0.10)'
        : 'rgba(37, 99, 235, 0.07)'
      schema.push(...this.createRowOverlayRectsFromRect({ x: this.viewport.bodyX, y, width: this.viewport.bodyWidth, height: this.rowHeight }, color, 1, true))
    }

    if (searchHighlightHasCell(highlight)) {
      const allColumnRects = this.visibleColumnRects('all')
      for (const match of searchState.matches) {
        if (match.columnId === undefined || match.rowIndex < this.viewport.rowRange.start || match.rowIndex >= this.viewport.rowRange.end) continue
        const columnRect = allColumnRects.find(candidate => candidate.column.id === match.columnId)
        if (!columnRect) continue
        const rect = this.clipRectToColumnRegion({
          x: columnRect.x,
          y: this.viewport.bodyY + match.rowIndex * this.rowHeight - this.scrollY,
          width: columnRect.width,
          height: this.rowHeight,
        }, columnRect.column, 'body')
        if (!rect) continue
        const active = searchState.activeIndex >= 0 && searchState.matches[searchState.activeIndex] === match
        schema.push(this.createOverlayRect(rect, active ? 'rgba(244, 63, 94, 0.14)' : 'rgba(250, 204, 21, 0.14)', 1))
      }
    }

    this.emitSchema(schema)
  }

  /**
   * Выполняет отрисовку DataTableRootNode.
   */
  private renderClipboardFeedbackOverlay(): void {
    const feedback = this.clipboardFeedback
    if (!feedback.visible && feedback.invalid.length === 0) return

    const schema: NovaSchema = []
    if (feedback.invalid.length > 0) {
      schema.push(...this.createClipboardInvalidCellMarkers(feedback.invalid))
    }

    if (feedback.visible) {
      const palette = resolveClipboardFeedbackPalette(feedback.tone)
      const label = `${feedback.message} · ${feedback.committed}/${feedback.skipped}/${feedback.invalid.length}`
      const width = Math.min(Math.max(240, label.length * 7 + 28), Math.max(240, this.width - 24))
      const x = Math.min(Math.max(8, this.viewport.bodyX + 8), Math.max(8, this.width - width - 8))
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
              size: Math.max(10, this.fontSize - 1),
              weight: '700',
            },
            lineHeight: this.lineHeight,
            align: { horizontal: 'left', vertical: 'middle' },
            ellipsis: true,
          },
        },
      )
    }

    this.emitSchema(schema)
  }

  /**
   * Создает runtime-сущность DataTableRootNode.
   */
  private createClipboardInvalidCellMarkers(invalid: Array<DataTablePasteInvalidCell>): NovaSchema {
    const schema: NovaSchema = []
    const columnRects = this.visibleColumnRects('all')

    for (const cell of invalid) {
      if (!cell.columnId || cell.rowIndex < this.viewport.rowRange.start || cell.rowIndex >= this.viewport.rowRange.end) continue
      const columnRect = columnRects.find(candidate => candidate.column.id === cell.columnId)
      if (!columnRect) continue
      const rect = this.clipRectToColumnRegion({
        x: columnRect.x,
        y: this.viewport.bodyY + cell.rowIndex * this.rowHeight - this.scrollY,
        width: columnRect.width,
        height: this.rowHeight,
      }, columnRect.column, 'body')
      if (!rect) continue

      schema.push(
        this.createOverlayRect(rect, 'rgba(248, 113, 113, 0.16)', 1, '#dc2626'),
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
  private renderPinnedBottomGroupPanel(): void {
    const template = this.props.pinnedBottomTemplate
    const grouping = this.props.view.grouping
    if (!template || !grouping || !grouping.enabled) return
    if (grouping.footerPlacement !== 'pinned-bottom' && grouping.footerPlacement !== 'both') return

    const rows = this.store.getRows()
    const pinnedRows = this.resolveEffectivePinnedRows()
    const rect = {
      x: this.viewport.bodyX,
      y: Math.max(this.viewport.bodyY, this.height - (pinnedRows.bottom?.length ?? 0) * this.rowHeight - 124),
      width: this.viewport.bodyWidth,
      height: 112,
    }
    if (rect.width <= 0 || rect.height <= 0) return

    const rendered: RenderedGroupRow<Row> = {
      kind: 'grand-footer',
      rowId: '__pinned-bottom-group-panel__',
      rowIndex: -1,
      storeIndex: -1,
      zone: 'grand-footer',
      aggregate: { count: rows.length },
      rows,
    }
    const schema = template(this.createGroupTemplateContext(rendered, rect, true))
    if (schema.length === 0) return

    this.withRenderClip(rect, () => this.emitSchema(schema))
  }

  /**
   * Выполняет отрисовку DataTableRootNode.
   */
  private renderHoverOverlay(): void {
    this.updateHoverOverlayBatch()
    this.renderer.rects(this.hoverOverlayBatch)
  }

  /**
   * Обновляет retained hover batch без пересборки grid render frame.
   */
  private updateHoverOverlayBatch(): void {
    const hover = this.hoverTarget
    const options = this.props.interaction.hover
    const schema: NovaSchema = []
    if (!this.resizeState && hover && options && options.mode !== 'none' && this.props.hoverAlpha > 0) {
      const alpha = this.props.hoverAlpha
      if (isGroupInteractionZone(hover.zone)) {
        schema.push(...this.createRowOverlayRects(hover, options.rowColor, alpha, options.pinned))
      } else {
        if (modeHasRow(options.mode)) {
          schema.push(...this.createRowOverlayRects(hover, options.rowColor, alpha, options.pinned))
        }
        if (modeHasColumn(options.mode)) {
          schema.push(...this.createColumnOverlayRects(hover, options.columnColor, alpha, options.pinned))
        }
        if (modeHasCell(options.mode) && options.cellColor) {
          const cellRect = this.clipRectToColumnRegion(hover.rect, hover.column, hover.zone)
          if (cellRect) schema.push(this.createOverlayRect(cellRect, options.cellColor, alpha))
        }
      }
    }

    this.writeOverlaySchemaToRectBatch(schema, this.hoverOverlayBatch)
  }

  /**
   * Записывает простые rect overlay в retained batch.
   */
  private writeOverlaySchemaToRectBatch(schema: NovaSchema, batch: NovaRectBatch): void {
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
  private renderSelectionOverlay(): void {
    const selection = this.selection
    if (!selection || this.props.selection === false || !this.props.selection.enabled || this.props.selectionAlpha <= 0) return
    const alpha = this.props.selectionAlpha
    const schema: NovaSchema = []
    for (const range of selection.ranges) {
      schema.push(...this.createSelectionRangeOverlayRects(range, this.props.selection.visuals.fillColor, alpha))
    }
    if (selection.previewRange) {
      schema.push(...this.createSelectionRangeOverlayRects(selection.previewRange, this.props.selection.visuals.previewFillColor, Math.max(alpha, 0.72)))
    }
    const activeCell = selection.activeCell
    if (activeCell) {
      const rect = this.resolveSelectionCellRect(activeCell.rowIndex, activeCell.columnId)
      if (rect) schema.push(this.createOverlayRect(rect, 'rgba(37, 99, 235, 0.03)', 1, this.props.selection.visuals.activeCellBorderColor))
    }
    this.emitSchema(schema)
  }

  /**
   * Выполняет отрисовку DataTableRootNode.
   */
  private renderInteractionLayer(): void {
    const template = this.props.interactionLayerTemplate
    if (!template) return

    const state = this.getInteractionState()
    const hoverTarget = this.resizeState ? null : this.hoverTarget
    const hoverCellRect = hoverTarget && !isGroupInteractionZone(hoverTarget.zone)
      ? this.clipRectToColumnRegion(hoverTarget.rect, hoverTarget.column, hoverTarget.zone)
      : null
    const hoverRects = hoverTarget
      ? isGroupInteractionZone(hoverTarget.zone)
        ? this.createRowRects(hoverTarget, true)
        : [...this.createRowRects(hoverTarget, true), ...(hoverCellRect ? [hoverCellRect] : [])]
      : []
    const schema = template({
      hover: this.resizeState ? null : state.hover,
      selection: state.selection,
      viewport: this.viewport,
      rects: hoverRects,
      state,
    })
    this.emitSchema(schema)
  }

  /**
   * Выполняет отрисовку DataTableRootNode.
   */
  private renderColumnDragOverlay(): void {
    const drag = this.columnDragState
    if (!drag?.active) return

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
            size: this.fontSize,
            weight: '800',
          },
          lineHeight: this.lineHeight,
          align: { horizontal: drag.column.align, vertical: 'middle' },
          ellipsis: true,
        },
      },
    ]

    const dropX = this.resolveColumnDragDropIndicatorX()
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

    this.emitSchema(schema)
  }

  /**
   * Выполняет отрисовку DataTableRootNode.
   */
  private renderColumnMenu(): void {
    const menu = this.columnMenuState
    if (!menu) return

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

    this.emitSchema(schema)
  }

  /**
   * Выполняет отрисовку DataTableRootNode.
   */
  private renderTooltipLayer(): void {
    const options = this.props.tooltip
    const target = this.tooltipTarget
    const alpha = this.props.tooltipAlpha
    if (!options || !target || alpha <= 0) return

    const cell = this.createCellContext(target)
    if (!cell || cell.zone === 'header') return

    const content = this.resolveTooltipContent(cell, target)
    if (!content) return

    const pointer = this.lastPointerPosition
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
    this.applyTooltipMotion(schema, alpha)
    this.emitSchema(schema)
  }

  /**
   * Применяет подготовленное состояние DataTableRootNode.
   */
  private applyTooltipMotion(schema: NovaSchema, alpha: number): void {
    const offsetY = Math.round((1 - alpha) * 5)
    for (const item of schema) {
      const shape = item as Record<string, any>
      shape.y = Number(shape.y ?? 0) + offsetY
      if (!shape.styles) continue
      const currentOpacity = typeof shape.styles.opacity === 'number' ? shape.styles.opacity : 1
      shape.styles.opacity = currentOpacity * alpha
    }
  }

  /**
   * Нормализует и возвращает итоговое значение DataTableRootNode.
   */
  private resolveTooltipContent(
    cell: DataTableCellContext<Row>,
    target: DataTableInteractionTarget<Row>,
  ): TooltipContent | null {
    const columnTooltip = cell.column.tooltip
    if (columnTooltip === false) return null
    if (typeof columnTooltip === 'function') return columnTooltip(cell) ?? null
    if (columnTooltip) return columnTooltip

    const options = this.props.tooltip
    if (!options) return null
    const custom = options.content?.({
      cell,
      target,
      viewport: this.viewport,
      store: this.store,
      api: this.api,
    } satisfies DataTableTooltipContext<Row>)
    if (custom) return custom
    if (!options.defaultContent) return null

    const title = cell.column.title ?? cell.column.id
    const value = cell.value === null || cell.value === undefined ? 'empty' : String(cell.value)
    return {
      markdown: `**${escapeTooltipMarkdown(title)}**\n${escapeTooltipMarkdown(value)}\nRow ${cell.rowIndex + 1} · Column ${cell.columnIndex + 1}`,
    }
  }

  /**
   * Создает runtime-сущность DataTableRootNode.
   */
  private createRowOverlayRects(
    target: DataTableInteractionTarget<Row>,
    color: string,
    opacity: number,
    includePinned: boolean,
  ): NovaSchema {
    return this.createRowRects(target, includePinned).map(rect => this.createOverlayRect(rect, color, opacity))
  }

  /**
   * Создает runtime-сущность DataTableRootNode.
   */
  private createSelectionRangeOverlayRects(
    range: DataTableSelectionRange,
    color: string,
    opacity: number,
  ): NovaSchema {
    const schema: NovaSchema = []
    const startRow = Math.max(this.viewport.rowRange.start, range.startRowIndex ?? this.viewport.rowRange.start)
    const endRow = Math.min(this.viewport.rowRange.end - 1, range.endRowIndex ?? this.viewport.rowRange.end - 1)
    if (endRow < startRow) return schema

    if (range.unit === 'row') {
      for (let rowIndex = startRow; rowIndex <= endRow; rowIndex += 1) {
        const y = this.viewport.bodyY + rowIndex * this.rowHeight - this.scrollY
        schema.push(...this.createRowOverlayRectsFromRect({ x: this.viewport.bodyX, y, width: this.viewport.bodyWidth, height: this.rowHeight }, color, opacity, true, 'body'))
      }
      return schema
    }

    const columnIds = range.columnIds?.length ? range.columnIds : this.normalizeSelectionColumns(range)
    if (range.unit === 'column') {
      for (const columnId of columnIds) {
        const columnRect = this.visibleColumnRects().find(item => item.column.id === columnId)
        if (!columnRect) continue
        const rect = this.clipRectToColumnRegion({
          x: columnRect.x,
          y: this.viewport.bodyY,
          width: columnRect.width,
          height: this.viewport.bodyHeight,
        }, columnRect.column, 'body')
        if (rect) schema.push(this.createOverlayRect(rect, color, opacity))
      }
      return schema
    }

    const visibleColumns = this.visibleColumnRects().filter(item => columnIds.includes(item.column.id))
    for (let rowIndex = startRow; rowIndex <= endRow; rowIndex += 1) {
      const y = this.viewport.bodyY + rowIndex * this.rowHeight - this.scrollY
      for (const columnRect of visibleColumns) {
        const columnClippedRect = this.clipRectToColumnRegion({
          x: columnRect.x,
          y,
          width: columnRect.width,
          height: this.rowHeight,
        }, columnRect.column, 'body')
        const rect = columnClippedRect ? this.clipRectToVerticalRegion(columnClippedRect, 'body') : null
        if (rect) schema.push(this.createOverlayRect(rect, color, opacity))
      }
    }
    return schema
  }

  /**
   * Нормализует и возвращает итоговое значение DataTableRootNode.
   */
  private resolveSelectionCellRect(rowIndex: number, columnId: string): DataTableCellRect | null {
    if (rowIndex < this.viewport.rowRange.start || rowIndex >= this.viewport.rowRange.end) return null
    const columnRect = this.visibleColumnRects().find(item => item.column.id === columnId)
    if (!columnRect) return null
    const columnClippedRect = this.clipRectToColumnRegion({
      x: columnRect.x,
      y: this.viewport.bodyY + rowIndex * this.rowHeight - this.scrollY,
      width: columnRect.width,
      height: this.rowHeight,
    }, columnRect.column, 'body')
    return columnClippedRect ? this.clipRectToVerticalRegion(columnClippedRect, 'body') : null
  }

  /**
   * Создает runtime-сущность DataTableRootNode.
   */
  private createRowOverlayRectsFromRect(
    rect: DataTableCellRect,
    color: string,
    opacity: number,
    includePinned: boolean,
    zone: DataTableCellContext<Row>['zone'] = 'body',
  ): NovaSchema {
    const clippedRect = this.clipRectToVerticalRegion(rect, zone)
    if (!clippedRect) return []

    const segments: Array<DataTableCellRect> = []
    if (includePinned && this.viewport.pinnedLeftWidth > 0) {
      segments.push({ x: 0, y: clippedRect.y, width: this.viewport.pinnedLeftWidth, height: clippedRect.height })
    }
    segments.push({ x: this.viewport.bodyX, y: clippedRect.y, width: this.viewport.bodyWidth, height: clippedRect.height })
    if (includePinned && this.viewport.pinnedRightWidth > 0) {
      segments.push({
        x: this.width - this.viewport.pinnedRightWidth,
        y: clippedRect.y,
        width: this.viewport.pinnedRightWidth,
        height: clippedRect.height,
      })
    }
    return segments.map(segment => this.createOverlayRect(segment, color, opacity))
  }

  /**
   * Создает runtime-сущность DataTableRootNode.
   */
  private createColumnOverlayRects(
    target: DataTableInteractionTarget<Row>,
    color: string,
    opacity: number,
    includePinned: boolean,
  ): NovaSchema {
    const columnPinned = target.column.pinned
    if (columnPinned && !includePinned) return []

    const visibleRect = this.clipRectToColumnRegion(target.rect, target.column)
    if (!visibleRect) return []
    const top = 0
    const height = this.height
    const rect = {
      x: visibleRect.x,
      y: top,
      width: visibleRect.width,
      height,
    }
    return [this.createOverlayRect(rect, color, opacity)]
  }

  /**
   * Создает runtime-сущность DataTableRootNode.
   */
  private createRowRects(target: DataTableInteractionTarget<Row>, includePinned: boolean): Array<DataTableCellRect> {
    const rowRect = this.clipRectToVerticalRegion(target.rect, target.zone)
    if (!rowRect) return []

    const segments: Array<DataTableCellRect> = []
    if (includePinned && this.viewport.pinnedLeftWidth > 0) {
      segments.push({ x: 0, y: rowRect.y, width: this.viewport.pinnedLeftWidth, height: rowRect.height })
    }
    segments.push({
      x: this.viewport.bodyX,
      y: rowRect.y,
      width: this.viewport.bodyWidth,
      height: rowRect.height,
    })
    if (includePinned && this.viewport.pinnedRightWidth > 0) {
      segments.push({
        x: this.width - this.viewport.pinnedRightWidth,
        y: rowRect.y,
        width: this.viewport.pinnedRightWidth,
        height: rowRect.height,
      })
    }
    return segments
  }

  /**
   * Выполняет внутренний шаг clipRectToColumnRegion для DataTableRootNode.
   */
  private clipRectToColumnRegion(
    rect: DataTableCellRect,
    column: DataTableResolvedColumn<Row>,
    zone?: DataTableCellContext<Row>['zone'],
  ): DataTableCellRect | null {
    const minX = column.pinned === 'left'
      ? 0
      : column.pinned === 'right'
        ? this.width - this.viewport.pinnedRightWidth
        : this.viewport.bodyX
    const maxX = column.pinned === 'left'
      ? this.viewport.pinnedLeftWidth
      : column.pinned === 'right'
        ? this.width
        : this.viewport.bodyX + this.viewport.bodyWidth
    const x = Math.max(minX, rect.x)
    const right = Math.min(maxX, rect.x + rect.width)
    if (right <= x) return null
    const columnRect = {
      x,
      y: rect.y,
      width: right - x,
      height: rect.height,
    }
    return zone ? this.clipRectToVerticalRegion(columnRect, zone) : columnRect
  }

  /**
   * Выполняет внутренний шаг clipRectToVerticalRegion для DataTableRootNode.
   */
  private clipRectToVerticalRegion(
    rect: DataTableCellRect,
    zone: DataTableCellContext<Row>['zone'],
  ): DataTableCellRect | null {
    const bounds = this.resolveVerticalRegionBounds(zone)
    const y = Math.max(bounds.top, rect.y)
    const bottom = Math.min(bounds.bottom, rect.y + rect.height)
    if (bottom <= y) return null
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
  private resolveVerticalRegionBounds(zone: DataTableCellContext<Row>['zone']): { top: number; bottom: number } {
    if (zone === 'header') return { top: 0, bottom: this.headerHeight }
    if (zone === 'pinned-top') return { top: this.headerHeight, bottom: this.viewport.bodyY }
    if (zone === 'pinned-bottom') {
      const bottomRows = this.resolveEffectivePinnedRows().bottom?.length ?? 0
      return { top: this.height - bottomRows * this.rowHeight, bottom: this.height }
    }
    return {
      top: this.viewport.bodyY,
      bottom: this.viewport.bodyY + this.viewport.bodyHeight,
    }
  }

  /**
   * Создает runtime-сущность DataTableRootNode.
   */
  private createOverlayRect(
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
  private updateHover(target: DataTableInteractionTarget<Row> | null): void {
    const previous = this.hoverActive ? this.hoverTarget : null
    if (sameInteractionTarget(previous, target)) {
      if (previous && target && !sameInteractionGeometry(previous, target)) {
        this.hoverTarget = target
        this.syncTooltipTarget(target)
        this.refresh(['hover'])
      }
      return
    }

    if (previous) {
      const previousContext = this.createCellContext(previous)
      if (previousContext) this.props.onCellLeave?.(previousContext)
    }

    this.hoverTarget = target
    this.hoverActive = target !== null
    this.syncTooltipTarget(target)
    if (target) {
      const context = this.createCellContext(target)
      if (context) this.props.onCellEnter?.(context)
      this.animateInteractionAlpha('hoverAlpha', 1)
    } else {
      this.animateInteractionAlpha('hoverAlpha', 0)
    }
    this.refresh(['hover'])
  }

  /**
   * Очищает накопленное состояние DataTableRootNode.
   */
  private clearHover(): void {
    this.updateHover(null)
  }

  /**
   * Обновляет hover target после изменения viewport без ожидания нового mousemove.
   */
  private syncHoverAfterViewportChange(): void {
    if (!this.hoverActive || !this.lastPointerPosition) return

    const target = this.resolveInteractionTargetAt(
      this.lastPointerPosition.x,
      this.lastPointerPosition.y,
    )
    this.updateHover(target)
    this.syncTooltipTarget(target)
  }

  /**
   * Синхронизирует состояние между слоями DataTableRootNode.
   */
  private syncTooltipTarget(target: DataTableInteractionTarget<Row> | null = this.hoverActive ? this.hoverTarget : null): void {
    if (!this.canShowTooltipForTarget(target)) {
      this.scheduleTooltipClose()
      return
    }

    if (!target) return
    const changed = !sameInteractionTarget(this.tooltipTarget, target)
    this.tooltipTarget = target
    if (changed) this.tooltipAlpha = 0
    if (!changed && this.tooltipOpenTimer) return
    if (this.props.tooltipAlpha >= 1 && !changed) {
      this.refresh(['interaction'])
      return
    }
    this.scheduleTooltipOpen(target)
  }

  /**
   * Выполняет внутренний шаг canShowTooltipForTarget для DataTableRootNode.
   */
  private canShowTooltipForTarget(target: DataTableInteractionTarget<Row> | null): boolean {
    const options = this.props.tooltip
    if (!options || !options.enabled || !target) return false
    if (target.zone === 'header' || isGroupInteractionZone(target.zone)) return false
    if (!this.isTooltipModifierSatisfied()) return false
    return this.createCellContext(target) !== null
  }

  /**
   * Планирует отложенное выполнение DataTableRootNode.
   */
  private scheduleTooltipOpen(target: DataTableInteractionTarget<Row>): void {
    this.clearTooltipTimers()
    const delay = this.props.tooltip ? this.props.tooltip.delay : 0
    if (delay <= 0) {
      this.openTooltip(target)
      return
    }
    this.tooltipOpenTimer = setTimeout(() => this.openTooltip(target), delay)
  }

  /**
   * Открывает presentation-состояние DataTableRootNode.
   */
  private openTooltip(target: DataTableInteractionTarget<Row>): void {
    if (!this.canShowTooltipForTarget(target)) return
    this.tooltipTarget = target
    this.animateTooltipAlpha(1)
    this.refresh(['interaction'])
  }

  /**
   * Планирует отложенное выполнение DataTableRootNode.
   */
  private scheduleTooltipClose(): void {
    if (!this.tooltipTarget && this.props.tooltipAlpha <= 0 && !this.tooltipOpenTimer) return
    this.clearTooltipOpenTimer()
    const delay = this.props.tooltip ? this.props.tooltip.hideDelay : 0
    if (delay <= 0) {
      this.closeTooltip()
      return
    }
    this.clearTooltipHideTimer()
    this.tooltipHideTimer = setTimeout(() => this.closeTooltip(), delay)
  }

  /**
   * Закрывает presentation-состояние DataTableRootNode.
   */
  private closeTooltip(): void {
    this.clearTooltipTimers()
    this.animateTooltipAlpha(0)
    this.refresh(['interaction'])
  }

  /**
   * Выполняет внутренний шаг animateTooltipAlpha для DataTableRootNode.
   */
  private animateTooltipAlpha(value: number): void {
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
  private clearTooltipTimers(): void {
    this.clearTooltipOpenTimer()
    this.clearTooltipHideTimer()
  }

  /**
   * Очищает накопленное состояние DataTableRootNode.
   */
  private clearTooltipOpenTimer(): void {
    if (!this.tooltipOpenTimer) return
    clearTimeout(this.tooltipOpenTimer)
    this.tooltipOpenTimer = null
  }

  /**
   * Очищает накопленное состояние DataTableRootNode.
   */
  private clearTooltipHideTimer(): void {
    if (!this.tooltipHideTimer) return
    clearTimeout(this.tooltipHideTimer)
    this.tooltipHideTimer = null
  }

  /**
   * Выполняет внутренний шаг trackTooltipModifiers для DataTableRootNode.
   */
  private trackTooltipModifiers(event: MouseEvent | WheelEvent): void {
    const previous = this.isTooltipModifierSatisfied()
    this.tooltipModifiers.ctrl = event.ctrlKey
    this.tooltipModifiers.meta = event.metaKey
    this.tooltipModifiers.shift = event.shiftKey
    this.tooltipModifiers.alt = event.altKey
    if (previous !== this.isTooltipModifierSatisfied()) this.syncTooltipTarget()
  }

  /**
   * Обновляет runtime-состояние DataTableRootNode.
   */
  private updateTooltipModifierFromKey(event: KeyboardEvent, pressed: boolean): boolean {
    const previous = this.isTooltipModifierSatisfied()
    if (event.key === 'Control') this.tooltipModifiers.ctrl = pressed
    else if (event.key === 'Meta') this.tooltipModifiers.meta = pressed
    else if (event.key === 'Shift') this.tooltipModifiers.shift = pressed
    else if (event.key === 'Alt') this.tooltipModifiers.alt = pressed
    else return false

    return previous !== this.isTooltipModifierSatisfied()
  }

  /**
   * Выполняет внутренний шаг isTooltipModifierSatisfied для DataTableRootNode.
   */
  private isTooltipModifierSatisfied(): boolean {
    const options = this.props.tooltip
    if (!options || options.modifier === false) return true
    return this.tooltipModifiers[options.modifier]
  }

  /**
   * Обновляет runtime-состояние DataTableRootNode.
   */
  private updateSelection(target: DataTableInteractionTarget<Row>, event?: MouseEvent): void {
    if (!this.isSelectableTarget(target)) return
    const options = this.props.selection
    if (!options || !options.enabled || options.mode === 'none') return

    const anchor = this.createSelectionAnchor(target)
    if (!anchor) return
    const unit = this.resolveSelectionUnit(target)
    if (!this.isSelectionUnitAllowed(unit)) return

    const toggle = this.isSelectionToggleEvent(event)
    const range = !!event?.shiftKey && options.gestures.shiftRange && this.selection?.anchor
    if (range) {
      this.selectRange(this.createSelectionRange(this.selection!.anchor!, anchor, unit), {
        append: options.cardinality === 'multiple' && !options.behavior.clearOnPlainClick,
        focus: true,
      })
      return
    }

    const nextRange = this.createSelectionRange(anchor, anchor, unit)
    this.applySelectionRange(nextRange, {
      append: options.cardinality === 'multiple' && (toggle || !options.behavior.clearOnPlainClick),
      toggle,
      focus: true,
    }, anchor)
  }

  /**
   * Обновляет состояние выбора DataTableRootNode.
   */
  private selectCell(rowId: DataTableRowId, columnId: string, options: DataTableSelectionUpdateOptions = {}): void {
    const column = this.resolvedColumns.find(item => item.id === columnId)
    if (!column) return
    const rowIndex = this.findViewRowIndexById(rowId)
    if (rowIndex === undefined) return
    const anchor = { rowId, rowIndex, columnId, columnIndex: this.resolvedColumns.indexOf(column) }
    this.applySelectionRange(this.createSelectionRange(anchor, anchor, 'cell'), options, anchor)
    if (options.scrollIntoView) this.scrollCellIntoView(rowIndex, column)
  }

  /**
   * Обновляет состояние выбора DataTableRootNode.
   */
  private selectRow(rowId: DataTableRowId, options: DataTableSelectionUpdateOptions = {}): void {
    const rowIndex = this.findViewRowIndexById(rowId)
    if (rowIndex === undefined) return
    const firstColumn = this.resolvedColumns[0]
    if (!firstColumn) return
    const anchor = { rowId, rowIndex, columnId: firstColumn.id, columnIndex: 0 }
    this.applySelectionRange(this.createSelectionRange(anchor, anchor, 'row'), options, anchor)
  }

  /**
   * Обновляет состояние выбора DataTableRootNode.
   */
  private selectColumn(columnId: string, options: DataTableSelectionUpdateOptions = {}): void {
    const columnIndex = this.resolvedColumns.findIndex(item => item.id === columnId)
    if (columnIndex < 0) return
    const rowId = this.viewPipeline.getRowIdAt(this.viewport.rowRange.start) ?? this.store.getRowIdAt(0) ?? 0
    const anchor = { rowId, rowIndex: this.viewport.rowRange.start, columnId, columnIndex }
    this.applySelectionRange(this.createSelectionRange(anchor, anchor, 'column'), options, anchor)
  }

  /**
   * Обновляет состояние выбора DataTableRootNode.
   */
  private selectRange(range: DataTableSelectionRange, options: DataTableSelectionUpdateOptions = {}): void {
    this.applySelectionRange(this.normalizeSelectionRange(range), options)
  }

  /**
   * Фокусирует конкретную ячейку по rowId + columnId.
   */
  private focusCell(rowId: DataTableRowId, columnId: string): boolean {
    this.selectCell(rowId, columnId, { focus: true, scrollIntoView: true })
    const active = this.selection?.activeCell
    return !!active
      && active.rowId === rowId
      && active.columnId === columnId
  }

  /**
   * Перемещает active cell и при необходимости расширяет selection.
   */
  private moveActiveCell(direction: DataTableActiveCellDirection, options: { extend?: boolean } = {}): boolean {
    const current = this.resolveActiveCellForNavigation()
    if (!current) return false
    const target = this.resolveNavigationTarget(current, direction)
    if (!target) return false

    if (options.extend && this.selection?.anchor) {
      this.selectRange(this.createSelectionRange(this.selection.anchor, target, 'cell'), {
        append: false,
        focus: true,
        scrollIntoView: true,
      })
    } else {
      this.applySelectionRange(this.createSelectionRange(target, target, 'cell'), {
        append: false,
        focus: true,
      }, target)
    }

    const column = this.resolvedColumns[target.columnIndex]
    if (column) this.scrollCellIntoView(target.rowIndex, column)
    return true
  }

  /**
   * Выбирает допустимый полный диапазон через Ctrl/Cmd+A.
   */
  private selectAllByKeyboard(): boolean {
    if (this.props.selection === false || !this.props.selection.enabled || this.resolvedColumns.length === 0 || this.viewPipeline.rowCount === 0) {
      return false
    }

    const firstRow = this.resolveNavigableRowIndex(0, 1)
    const lastRow = this.resolveNavigableRowIndex(this.viewPipeline.rowCount - 1, -1)
    if (firstRow === undefined || lastRow === undefined) return false

    const firstColumn = this.resolvedColumns[0]
    const lastColumn = this.resolvedColumns[this.resolvedColumns.length - 1]
    if (!firstColumn || !lastColumn) return false

    const start: DataTableSelectionAnchor = {
      rowId: this.viewPipeline.getRowIdAt(firstRow) ?? firstRow,
      rowIndex: firstRow,
      columnId: firstColumn.id,
      columnIndex: 0,
    }
    const end: DataTableSelectionAnchor = {
      rowId: this.viewPipeline.getRowIdAt(lastRow) ?? lastRow,
      rowIndex: lastRow,
      columnId: lastColumn.id,
      columnIndex: this.resolvedColumns.length - 1,
    }
    const mode = this.props.selection.mode
    const unit: DataTableSelectionUnit = mode === 'row'
      ? 'row'
      : mode === 'column'
        ? 'column'
        : 'cell'
    this.applySelectionRange(this.createSelectionRange(start, end, unit), { focus: true }, start)
    return true
  }

  /**
   * Возвращает active cell или первый видимый data cell.
   */
  private resolveActiveCellForNavigation(): DataTableSelectionAnchor | null {
    if (this.selection?.activeCell) return this.selection.activeCell

    const rowIndex = this.resolveNavigableRowIndex(this.viewport.rowRange.start, 1)
    const column = this.resolvedColumns[0]
    if (rowIndex === undefined || !column) return null
    return {
      rowId: this.viewPipeline.getRowIdAt(rowIndex) ?? rowIndex,
      rowIndex,
      columnId: column.id,
      columnIndex: 0,
    }
  }

  /**
   * Считает следующий target для keyboard navigation.
   */
  private resolveNavigationTarget(
    current: DataTableSelectionAnchor,
    direction: DataTableActiveCellDirection,
  ): DataTableSelectionAnchor | null {
    let rowIndex = current.rowIndex
    let columnIndex = current.columnIndex
    const pageRows = Math.max(1, Math.floor(this.viewport.bodyHeight / this.rowHeight) - 1)

    if (direction === 'up') rowIndex -= 1
    else if (direction === 'down') rowIndex += 1
    else if (direction === 'page-up') rowIndex -= pageRows
    else if (direction === 'page-down') rowIndex += pageRows
    else if (direction === 'left') columnIndex -= 1
    else if (direction === 'right') columnIndex += 1
    else if (direction === 'home') columnIndex = 0
    else if (direction === 'end') columnIndex = this.resolvedColumns.length - 1

    rowIndex = clampInteger(rowIndex, 0, Math.max(0, this.viewPipeline.rowCount - 1))
    columnIndex = clampInteger(columnIndex, 0, Math.max(0, this.resolvedColumns.length - 1))
    const rowDirection = rowIndex >= current.rowIndex ? 1 : -1
    const nextRowIndex = this.resolveNavigableRowIndex(rowIndex, rowDirection)
    const column = this.resolvedColumns[columnIndex]
    if (nextRowIndex === undefined || !column) return null

    return {
      rowId: this.viewPipeline.getRowIdAt(nextRowIndex) ?? nextRowIndex,
      rowIndex: nextRowIndex,
      columnId: column.id,
      columnIndex,
    }
  }

  /**
   * Пропускает group/footer rows при keyboard navigation.
   */
  private resolveNavigableRowIndex(start: number, step: 1 | -1): number | undefined {
    if (this.viewPipeline.rowCount <= 0) return undefined
    let index = clampInteger(start, 0, this.viewPipeline.rowCount - 1)
    while (index >= 0 && index < this.viewPipeline.rowCount) {
      const viewRow = this.viewPipeline.getViewRowAt(index)
      if (!viewRow || viewRow.kind === 'data') return index
      index += step
    }
    return undefined
  }

  /**
   * Выполняет внутренний шаг addSelectionRange для DataTableRootNode.
   */
  private addSelectionRange(range: DataTableSelectionRange): void {
    this.selectRange(range, { append: true })
  }

  /**
   * Удаляет сущность из runtime-коллекции DataTableRootNode.
   */
  private removeSelectionRange(rangeId: string): void {
    if (!this.selection) return
    const ranges = this.selection.ranges.filter(range => range.id !== rangeId)
    this.commitSelectionState({ ...this.selection, ranges, previewRange: null }, { emitActive: false })
  }

  /**
   * Обновляет значение состояния DataTableRootNode.
   */
  private setSelection(selection: DataTableSelectionState | null): void {
    if (this.props.selection === false || !this.props.selection.enabled || this.props.selection.mode === 'none') {
      this.clearSelection()
      return
    }
    if (!selection) {
      this.clearSelection()
      return
    }
    this.commitSelectionState({
      ...selection,
      ranges: selection.ranges.map(range => this.normalizeSelectionRange(range)),
      previewRange: selection.previewRange ? this.normalizeSelectionRange(selection.previewRange) : null,
    })
  }

  /**
   * Очищает накопленное состояние DataTableRootNode.
   */
  private clearSelection(): void {
    if (!this.selectionActive && !this.selection && !this.selectionDragState) return
    this.selectionActive = false
    this.selection = null
    this.selectionDragState = null
    this.animateInteractionAlpha('selectionAlpha', 0)
    this.props.onSelectionChange?.(null)
    this.props.onSelectionPreviewChange?.(null)
    this.props.onActiveCellChange?.(null)
    this.refresh(['interaction'])
  }

  /**
   * Применяет подготовленное состояние DataTableRootNode.
   */
  private applySelectionRange(
    range: DataTableSelectionRange,
    options: DataTableSelectionUpdateOptions = {},
    anchor?: DataTableSelectionAnchor,
  ): void {
    if (this.props.selection === false || !this.props.selection.enabled || this.props.selection.mode === 'none') return
    const resolved = this.normalizeSelectionRange(range)
    const current = this.selection
    const append = this.props.selection !== false
      && this.props.selection.cardinality === 'multiple'
      && options.append
    let ranges = (append || options.toggle) && current ? [...current.ranges] : []
    if (options.toggle) {
      const index = ranges.findIndex(item => sameSelectionRange(item, resolved))
      if (index >= 0) ranges.splice(index, 1)
      else ranges.push(resolved)
    } else {
      ranges.push(resolved)
    }
    const nextAnchor = anchor ?? current?.anchor ?? this.anchorFromRange(resolved)
    const activeCell = options.focus === false ? current?.activeCell ?? null : nextAnchor
    this.commitSelectionState({
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
  private commitSelectionState(selection: DataTableSelectionState, options: { emitActive?: boolean; emitPreview?: boolean } = {}): void {
    this.selection = selection.ranges.length > 0 || selection.previewRange || selection.activeCell ? selection : null
    this.selectionActive = !!this.selection
    if (this.selectionActive) this.animateInteractionAlpha('selectionAlpha', 1)
    else this.animateInteractionAlpha('selectionAlpha', 0)
    this.props.onSelectionChange?.(this.cloneSelectionState())
    if (options.emitPreview !== false) this.props.onSelectionPreviewChange?.(selection.previewRange)
    if (options.emitActive !== false) this.props.onActiveCellChange?.(selection.activeCell)
    this.refresh(['interaction'])
  }

  /**
   * Выполняет внутренний шаг cloneSelectionState для DataTableRootNode.
   */
  private cloneSelectionState(): DataTableSelectionState | null {
    if (!this.selection) return null
    return {
      ...this.selection,
      activeCell: this.selection.activeCell ? { ...this.selection.activeCell } : null,
      anchor: this.selection.anchor ? { ...this.selection.anchor } : null,
      ranges: this.selection.ranges.map(range => ({ ...range, columnIds: range.columnIds ? [...range.columnIds] : undefined })),
      previewRange: this.selection.previewRange ? { ...this.selection.previewRange, columnIds: this.selection.previewRange.columnIds ? [...this.selection.previewRange.columnIds] : undefined } : null,
    }
  }

  /**
   * Выполняет внутренний шаг tryHeaderSelection для DataTableRootNode.
   */
  private tryHeaderSelection(target: DataTableInteractionTarget<Row>, event: MouseEvent): boolean {
    const options = this.props.selection
    if (!options || !options.enabled || !options.gestures.headerSelectColumn || !options.allowedUnits.columns) return false
    if (target.column.sortable) return false
    this.selectColumn(target.column.id, {
      append: this.isSelectionToggleEvent(event),
      toggle: this.isSelectionToggleEvent(event),
      focus: true,
    })
    return true
  }

  /**
   * Запускает runtime-процесс DataTableRootNode.
   */
  private startSelectionDrag(target: DataTableInteractionTarget<Row>, event: MouseEvent): void {
    const options = this.props.selection
    if (!options || !options.enabled || !options.gestures.dragRange || !this.isSelectableTarget(target)) return
    const anchor = this.createSelectionAnchor(target)
    if (!anchor) return
    const unit = this.resolveSelectionUnit(target)
    if (unit !== 'cell') return
    this.selectionDragState = { anchor, target: anchor, unit, active: false }
    this.capturePointer(event)
  }

  /**
   * Обновляет runtime-состояние DataTableRootNode.
   */
  private updateSelectionDrag(meta: NovaDragEventMeta): void {
    const drag = this.selectionDragState
    if (!drag) return
    const [x, y] = this.toLocal(meta.x, meta.y)
    const target = this.resolveInteractionTargetAt(x, y)
    if (!target || !this.isSelectableTarget(target)) return
    const nextAnchor = this.createSelectionAnchor(target)
    if (!nextAnchor) return
    drag.target = nextAnchor
    drag.active = drag.active || Math.abs(meta.totalDx) > 3 || Math.abs(meta.totalDy) > 3
    if (!drag.active) return
    const previewRange = this.createSelectionRange(drag.anchor, drag.target, drag.unit)
    const current = this.selection ?? this.createEmptySelection()
    this.selection = {
      ...current,
      activeCell: drag.target,
      anchor: drag.anchor,
      previewRange,
      rowId: drag.target.rowId,
      rowIndex: drag.target.rowIndex,
      columnId: drag.target.columnId,
      columnIndex: drag.target.columnIndex,
    }
    this.selectionActive = true
    this.props.onSelectionPreviewChange?.(previewRange)
    this.props.onActiveCellChange?.(drag.target)
    this.autoScrollSelectionDrag(x, y)
    this.refresh(['interaction'])
  }

  /**
   * Фиксирует подготовленные изменения DataTableRootNode.
   */
  private commitSelectionDrag(): void {
    const drag = this.selectionDragState
    if (!drag) return
    this.selectionDragState = null
    if (!drag.active) return
    this.applySelectionRange(this.createSelectionRange(drag.anchor, drag.target, drag.unit), {
      append: this.props.selection !== false && this.props.selection.cardinality === 'multiple' && this.props.selection.behavior.preserveOnDrag,
      focus: true,
    }, drag.target)
    this.props.onSelectionPreviewChange?.(null)
  }

  /**
   * Создает runtime-сущность DataTableRootNode.
   */
  private createEmptySelection(): DataTableSelectionState {
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
  private createSelectionAnchor(target: DataTableInteractionTarget<Row>): DataTableSelectionAnchor | null {
    if (target.rowId === undefined) return null
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
  private createSelectionRange(
    start: DataTableSelectionAnchor,
    end: DataTableSelectionAnchor,
    unit: DataTableSelectionUnit,
  ): DataTableSelectionRange {
    const startRowIndex = Math.min(start.rowIndex, end.rowIndex)
    const endRowIndex = Math.max(start.rowIndex, end.rowIndex)
    const startColumnIndex = Math.min(start.columnIndex, end.columnIndex)
    const endColumnIndex = Math.max(start.columnIndex, end.columnIndex)
    const columns = this.resolvedColumns.slice(startColumnIndex, endColumnIndex + 1).map(column => column.id)
    return this.normalizeSelectionRange({
      id: this.nextSelectionRangeId(),
      unit,
      startRowIndex: unit === 'column' ? 0 : startRowIndex,
      endRowIndex: unit === 'column' ? Math.max(0, this.viewPipeline.rowCount - 1) : endRowIndex,
      startRowId: start.rowIndex <= end.rowIndex ? start.rowId : end.rowId,
      endRowId: start.rowIndex <= end.rowIndex ? end.rowId : start.rowId,
      startColumnId: unit === 'row' ? this.resolvedColumns[0]?.id : columns[0],
      endColumnId: unit === 'row' ? this.resolvedColumns[this.resolvedColumns.length - 1]?.id : columns[columns.length - 1],
      columnIds: unit === 'row' ? this.resolvedColumns.map(column => column.id) : columns,
    })
  }

  /**
   * Нормализует входные данные DataTableRootNode.
   */
  private normalizeSelectionRange(range: DataTableSelectionRange): DataTableSelectionRange {
    const startRowIndex = Math.min(range.startRowIndex ?? 0, range.endRowIndex ?? range.startRowIndex ?? 0)
    const endRowIndex = Math.max(range.startRowIndex ?? 0, range.endRowIndex ?? range.startRowIndex ?? 0)
    const columnIds = this.normalizeSelectionColumns(range)
    return {
      ...range,
      id: range.id || this.nextSelectionRangeId(),
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
  private normalizeSelectionColumns(range: DataTableSelectionRange): Array<string> {
    if (range.unit === 'row') return this.resolvedColumns.map(column => column.id)
    if (range.columnIds?.length) return this.sortColumnIdsByResolvedOrder(range.columnIds)
    const start = this.resolvedColumns.findIndex(column => column.id === range.startColumnId)
    const end = this.resolvedColumns.findIndex(column => column.id === range.endColumnId)
    if (start < 0 && end < 0) return []
    const min = Math.min(start < 0 ? end : start, end < 0 ? start : end)
    const max = Math.max(start < 0 ? end : start, end < 0 ? start : end)
    return this.resolvedColumns.slice(min, max + 1).map(column => column.id)
  }

  /**
   * Выполняет внутренний шаг sortColumnIdsByResolvedOrder для DataTableRootNode.
   */
  private sortColumnIdsByResolvedOrder(columnIds: Array<string>): Array<string> {
    const source = new Set(columnIds)
    return this.resolvedColumns.filter(column => source.has(column.id)).map(column => column.id)
  }

  /**
   * Выполняет внутренний шаг nextSelectionRangeId для DataTableRootNode.
   */
  private nextSelectionRangeId(): string {
    this.selectionIdCounter += 1
    return `selection-${this.selectionIdCounter}`
  }

  /**
   * Выполняет внутренний шаг anchorFromRange для DataTableRootNode.
   */
  private anchorFromRange(range: DataTableSelectionRange): DataTableSelectionAnchor | null {
    const columnId = range.columnIds?.[0] ?? range.startColumnId
    if (!columnId) return null
    const columnIndex = this.resolvedColumns.findIndex(column => column.id === columnId)
    if (columnIndex < 0) return null
    const rowIndex = range.startRowIndex ?? 0
    const rowId = range.startRowId ?? this.viewPipeline.getRowIdAt(rowIndex) ?? this.store.getRowIdAt(rowIndex)
    if (rowId === undefined) return null
    return { rowId, rowIndex, columnId, columnIndex }
  }

  /**
   * Выполняет внутренний шаг isSelectableTarget для DataTableRootNode.
   */
  private isSelectableTarget(target: DataTableInteractionTarget<Row>): boolean {
    if (this.props.selection === false || !this.props.selection.enabled) return false
    if (target.zone === 'body' || target.zone === 'pinned-top' || target.zone === 'pinned-bottom') return target.rowId !== undefined
    if (target.zone === 'group') return this.props.selection.behavior.groupRows === 'group-row-only'
    return false
  }

  /**
   * Нормализует и возвращает итоговое значение DataTableRootNode.
   */
  private resolveSelectionUnit(target: DataTableInteractionTarget<Row>): DataTableSelectionUnit {
    if (target.zone === 'header') return 'column'
    const mode = this.props.selection === false ? 'cell' : this.props.selection.mode
    if (mode === 'row' || mode === 'column') return mode
    return 'cell'
  }

  /**
   * Выполняет внутренний шаг isSelectionUnitAllowed для DataTableRootNode.
   */
  private isSelectionUnitAllowed(unit: DataTableSelectionUnit): boolean {
    if (this.props.selection === false) return false
    if (unit === 'cell') return this.props.selection.allowedUnits.cells
    if (unit === 'row') return this.props.selection.allowedUnits.rows
    return this.props.selection.allowedUnits.columns
  }

  /**
   * Выполняет внутренний шаг isSelectionToggleEvent для DataTableRootNode.
   */
  private isSelectionToggleEvent(event?: MouseEvent): boolean {
    if (!event || this.props.selection === false || this.props.selection.cardinality !== 'multiple') return false
    return (event.ctrlKey && this.props.selection.gestures.ctrlToggle) || (event.metaKey && this.props.selection.gestures.metaToggle)
  }

  /**
   * Выполняет внутренний шаг autoScrollSelectionDrag для DataTableRootNode.
   */
  private autoScrollSelectionDrag(x: number, y: number): void {
    if (this.props.selection === false || !this.props.selection.gestures.autoScrollOnDrag) return
    const edge = 24
    let nextX = this.scrollX
    let nextY = this.scrollY
    if (x < this.viewport.bodyX + edge) nextX -= this.viewport.bodyWidth * 0.08
    else if (x > this.viewport.bodyX + this.viewport.bodyWidth - edge) nextX += this.viewport.bodyWidth * 0.08
    if (y < this.viewport.bodyY + edge) nextY -= this.rowHeight
    else if (y > this.viewport.bodyY + this.viewport.bodyHeight - edge) nextY += this.rowHeight
    if (nextX !== this.scrollX || nextY !== this.scrollY) this.setScroll(nextX, nextY)
  }

  /**
   * Находит сущность по runtime-критериям DataTableRootNode.
   */
  private findViewRowIndexById(rowId: DataTableRowId): number | undefined {
    return this.viewPipeline.findViewIndexByRowId(rowId)
  }

  /**
   * Нормализует и возвращает итоговое значение DataTableRootNode.
   */
  private resolveSelectionHit(rowId: DataTableRowId, rowIndex: number, columnId: string): {
    selected: boolean
    rowSelected: boolean
    columnSelected: boolean
    rangeId?: string
  } {
    const ranges = this.selection?.ranges ?? []
    for (const range of ranges) {
      const rowInRange = rowIndex >= (range.startRowIndex ?? rowIndex) && rowIndex <= (range.endRowIndex ?? rowIndex)
      const columnInRange = (range.columnIds ?? []).includes(columnId)
      if (range.unit === 'row' && rowInRange) return { selected: true, rowSelected: true, columnSelected: false, rangeId: range.id }
      if (range.unit === 'column' && columnInRange) return { selected: true, rowSelected: false, columnSelected: true, rangeId: range.id }
      if (range.unit === 'cell' && rowInRange && columnInRange) return { selected: true, rowSelected: false, columnSelected: false, rangeId: range.id }
    }
    return { selected: false, rowSelected: false, columnSelected: false }
  }

  /**
   * Выполняет внутренний шаг isCellSelected для DataTableRootNode.
   */
  private isCellSelected(rowId: DataTableRowId, columnId: string): boolean {
    const rowIndex = this.findViewRowIndexById(rowId)
    if (rowIndex === undefined) return false
    return this.resolveSelectionHit(rowId, rowIndex, columnId).selected
  }

  /**
   * Выполняет внутренний шаг isRowSelected для DataTableRootNode.
   */
  private isRowSelected(rowId: DataTableRowId): boolean {
    const rowIndex = this.findViewRowIndexById(rowId)
    if (rowIndex === undefined) return false
    return (this.selection?.ranges ?? []).some(range => range.unit === 'row' && rowIndex >= (range.startRowIndex ?? rowIndex) && rowIndex <= (range.endRowIndex ?? rowIndex))
  }

  /**
   * Выполняет внутренний шаг isColumnSelected для DataTableRootNode.
   */
  private isColumnSelected(columnId: string): boolean {
    return (this.selection?.ranges ?? []).some(range => range.unit === 'column' && (range.columnIds ?? []).includes(columnId))
  }

  /**
   * Очищает значения выделенных data cells как единую undoable transaction.
   */
  private clearSelectionValues(): DataTableTransaction<Row> | null {
    if (!this.selection || this.selection.ranges.length === 0) return null
    const deltas: Array<DataTableDelta<Row>> = []
    for (const range of this.selection.ranges) {
      const rows = this.resolveRowsForSelectionRange(range)
      const columns = this.resolveColumnsForSelectionRange(range, false)
      for (const row of rows) {
        if (row.rowId === undefined) continue
        for (const column of columns) {
          if (column.editable === false) continue
          const key = typeof column.field === 'string' ? column.field : column.id
          deltas.push({ type: 'patch', rowId: row.rowId, patch: { [key]: '' } as Partial<Row> })
        }
      }
    }
    if (deltas.length === 0) return null
    return this.commitDeltas(deltas, { source: 'clear', label: 'Clear selection' })
  }

  /**
   * Заполняет выделение по текущему fill handle mode.
   */
  private fillSelection(
    direction: DataTableFillDirection,
    options: Partial<DataTableFillHandleOptions> = {},
  ): DataTableTransaction<Row> | null {
    const fillHandle = this.props.fillHandle
    if (fillHandle === false || !fillHandle.enabled || !this.selection?.ranges[0]) return null
    if (!fillHandle.directions.includes(direction)) return null
    const mode = options.mode ?? fillHandle.mode
    const deltas = createDataTableFillDeltas(this.store, this.selection.ranges[0], direction, { mode })
    if (deltas.length === 0) return null
    return this.commitDeltas(deltas, { source: 'fill', label: `Fill ${direction}` })
  }

  /**
   * Выполняет внутренний шаг copySelection для DataTableRootNode.
   */
  private copySelection(): string {
    if (this.props.clipboard === false || this.props.clipboard.copy === false || !this.selection || this.selection.ranges.length === 0) return ''
    const payload = {
      selection: this.selection,
      ranges: this.selection.ranges,
      store: this.store,
      api: this.api,
    }
    const override = this.props.onBeforeCopy?.(payload) ?? this.props.clipboard.onBeforeCopy?.(payload)
    if (override === false) return ''
    const text = typeof override === 'string' ? override : this.formatSelectionCopy(this.selection, this.props.clipboard)
    this.props.onCopy?.({ ...payload, text })
    this.props.clipboard.onCopy?.({ ...payload, text })
    return text
  }

  /**
   * Выполняет внутренний шаг pasteClipboard для DataTableRootNode.
   */
  private async pasteClipboard(text?: string): Promise<DataTablePasteResult<Row>> {
    const emptyResult = { committed: 0, skipped: 0, invalid: [], deltas: [] } satisfies DataTablePasteResult<Row>
    if (this.props.clipboard === false || this.props.clipboard.paste === false || !this.props.clipboard.paste.enabled) return emptyResult
    const sourceText = text ?? await this.readClipboardText()
    if (!sourceText) return emptyResult

    const matrix = parseDataTableClipboardMatrix(sourceText, this.props.clipboard.paste.parseFormat)
    const payload = {
      text: sourceText,
      matrix,
      selection: this.selection,
      store: this.store,
      api: this.api,
    }
    try {
      const override = await (this.props.onBeforePaste?.(payload) ?? this.props.clipboard.onBeforePaste?.(payload))
      if (override === false) return emptyResult
      if (Array.isArray(override)) {
        this.commitDeltas(override, { source: 'paste', label: 'Paste override' })
        const result = { committed: override.length, skipped: 0, invalid: [], deltas: override } satisfies DataTablePasteResult<Row>
        this.setClipboardPasteResultFeedback(result)
        this.props.onPasteCommit?.(result)
        this.props.clipboard.onPasteCommit?.(result)
        return result
      }
      const result = await this.createPasteResult(matrix)
      if (result.invalid.length > 0 && this.props.clipboard.paste.invalid === 'reject') {
        const pasteError = { message: 'Paste validation failed', result }
        this.setClipboardFeedback(createDataTableClipboardPasteErrorFeedback(pasteError))
        this.props.onPasteError?.(pasteError)
        this.props.clipboard.onPasteError?.(pasteError)
        return result
      }
      if (result.deltas.length > 0) {
        this.commitDeltas(result.deltas, { source: 'paste', label: 'Paste' })
      }
      this.setClipboardPasteResultFeedback(result)
      this.props.onPasteCommit?.(result)
      this.props.clipboard.onPasteCommit?.(result)
      return result
    } catch (error) {
      const pasteError = {
        message: error instanceof Error ? error.message : 'Paste failed',
        error,
      }
      this.setClipboardFeedback(createDataTableClipboardPasteErrorFeedback(pasteError))
      this.props.onPasteError?.(pasteError)
      this.props.clipboard.onPasteError?.(pasteError)
      return emptyResult
    }
  }

  /**
   * Обновляет runtime-состояние DataTableRootNode.
   */
  private setClipboardFeedback(feedback: DataTableClipboardFeedbackState<Row>): void {
    this.clearClipboardFeedbackTimer()
    this.clipboardFeedback = feedback
    if (feedback.visible && feedback.ttlMs > 0) {
      this.clipboardFeedbackHideTimer = setTimeout(() => {
        this.clipboardFeedback = createDataTableClipboardFeedbackHidden() as DataTableClipboardFeedbackState<Row>
        this.refresh(['interaction'])
      }, feedback.ttlMs)
    }
    this.refresh(['interaction'])
  }

  /**
   * Обновляет runtime-состояние DataTableRootNode.
   */
  private setClipboardPasteResultFeedback(result: DataTablePasteResult<Row>): void {
    if (result.committed === 0 && result.skipped === 0 && result.invalid.length === 0) return
    this.setClipboardFeedback(createDataTableClipboardPasteFeedback(result))
  }

  /**
   * Очищает таймер DataTableRootNode.
   */
  private clearClipboardFeedbackTimer(): void {
    if (!this.clipboardFeedbackHideTimer) return
    clearTimeout(this.clipboardFeedbackHideTimer)
    this.clipboardFeedbackHideTimer = null
  }

  /**
   * Выполняет внутренний шаг readClipboardText для DataTableRootNode.
   */
  private async readClipboardText(): Promise<string> {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.readText) return ''
    try {
      return await navigator.clipboard.readText()
    } catch {
      return ''
    }
  }

  /**
   * Выполняет внутренний шаг formatSelectionCopy для DataTableRootNode.
   */
  private formatSelectionCopy(selection: DataTableSelectionState, clipboard: DataTableResolvedClipboardOptions<Row>): string {
    const blocks: Array<string> = []
    const format = clipboard.copy ? clipboard.copy.format : 'tsv'
    for (const range of selection.ranges) {
      const rows = this.resolveRowsForSelectionRange(range)
      const columns = this.resolveColumnsForSelectionRange(range, clipboard.copy ? clipboard.copy.onlyVisibleColumns : true)
      const lines: Array<Array<string>> = []
      if (clipboard.copy && clipboard.copy.includeHeaders) lines.push(columns.map(column => column.title ?? column.id))
      for (const rowInfo of rows) {
        const rowValues: Array<string> = []
        for (const column of columns) {
          const value = rowInfo.row ? resolveDataTableValue(rowInfo.row, rowInfo.storeIndex ?? rowInfo.rowIndex, column) : ''
          const context = rowInfo.row ? this.createCopyPasteCellContext(rowInfo.row, rowInfo.rowId, rowInfo.rowIndex, rowInfo.storeIndex, column, value) : null
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
  private async createPasteResult(matrix: Array<Array<string>>): Promise<DataTablePasteResult<Row>> {
    const result = { committed: 0, skipped: 0, invalid: [], deltas: [] } satisfies DataTablePasteResult<Row>
    const target = this.resolvePasteTarget()
    if (!target || matrix.length === 0) return result
    const policy = this.props.clipboard !== false && this.props.clipboard.paste !== false ? this.props.clipboard.paste : null
    if (!policy) return result

    for (let rowOffset = 0; rowOffset < matrix.length; rowOffset += 1) {
      const rowIndex = target.rowIndex + rowOffset
      const row = this.viewPipeline.getRowAt(rowIndex)
      const rowId = this.viewPipeline.getRowIdAt(rowIndex)
      if (!row || rowId === undefined) {
        result.skipped += matrix[rowOffset]?.length ?? 0
        continue
      }
      const storeIndex = this.viewPipeline.getStoreIndexAt(rowIndex)
      const cells = matrix[rowOffset] ?? []
      for (let columnOffset = 0; columnOffset < cells.length; columnOffset += 1) {
        const column = target.columns[columnOffset]
        if (!column) {
          if (policy.overflow === 'reject') result.invalid.push({ rowId, rowIndex, columnId: '', raw: cells[columnOffset] ?? '', message: 'Paste exceeds target columns' })
          else result.skipped += 1
          continue
        }
        const raw = cells[columnOffset] ?? ''
        const value = raw === '' && column.paste && column.paste !== false && 'emptyValue' in column.paste ? column.paste.emptyValue : raw
        const context = this.createCopyPasteCellContext(row, rowId, rowIndex, storeIndex, column, value)
        if (!this.canPasteCell(context)) {
          if (policy.readonly === 'reject') result.invalid.push({ rowId, rowIndex, columnId: column.id, raw, message: 'Cell is readonly' })
          else result.skipped += 1
          continue
        }
        const parsed = this.parsePasteValue(value, context)
        const validation = await this.validatePasteValue(parsed, context)
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
  private resolvePasteTarget(): { rowIndex: number; columns: Array<DataTableResolvedColumn<Row>> } | null {
    const active = this.selection?.activeCell
    const range = this.selection?.ranges[0]
    if (this.selection && (this.selection.ranges.length > 1 || this.selection.ranges.some(item => item.unit !== 'cell'))) return null
    const rowIndex = active?.rowIndex ?? range?.startRowIndex
    if (rowIndex === undefined) return null
    const startColumnId = active?.columnId ?? range?.columnIds?.[0] ?? range?.startColumnId
    const startColumnIndex = Math.max(0, this.resolvedColumns.findIndex(column => column.id === startColumnId))
    return {
      rowIndex,
      columns: this.resolvedColumns.slice(startColumnIndex),
    }
  }

  /**
   * Нормализует и возвращает итоговое значение DataTableRootNode.
   */
  private resolveRowsForSelectionRange(range: DataTableSelectionRange): Array<{ row?: Row; rowId?: DataTableRowId; rowIndex: number; storeIndex?: number }> {
    const start = Math.max(0, range.startRowIndex ?? 0)
    const end = Math.min(this.viewPipeline.rowCount - 1, range.endRowIndex ?? start)
    const rows: Array<{ row?: Row; rowId?: DataTableRowId; rowIndex: number; storeIndex?: number }> = []
    for (let rowIndex = start; rowIndex <= end; rowIndex += 1) {
      rows.push({
        row: this.viewPipeline.getRowAt(rowIndex),
        rowId: this.viewPipeline.getRowIdAt(rowIndex),
        rowIndex,
        storeIndex: this.viewPipeline.getStoreIndexAt(rowIndex),
      })
    }
    return rows
  }

  /**
   * Нормализует и возвращает итоговое значение DataTableRootNode.
   */
  private resolveColumnsForSelectionRange(range: DataTableSelectionRange, onlyVisible: boolean): Array<DataTableResolvedColumn<Row>> {
    const ids = range.unit === 'row'
      ? this.resolvedColumns.map(column => column.id)
      : range.columnIds ?? this.normalizeSelectionColumns(range)
    const visible = onlyVisible ? new Set(this.visibleColumnRects().map(rect => rect.column.id)) : null
    return this.resolvedColumns.filter(column => ids.includes(column.id) && (!visible || visible.has(column.id)))
  }

  /**
   * Создает runtime-сущность DataTableRootNode.
   */
  private createCopyPasteCellContext(
    row: Row,
    rowId: DataTableRowId,
    rowIndex: number,
    storeIndex: number | undefined,
    column: DataTableResolvedColumn<Row>,
    value: unknown,
  ): DataTableCellContext<Row> {
    const columnIndex = this.resolvedColumns.findIndex(item => item.id === column.id)
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
      state: this.createCellState({ x: 0, y: 0, width: column.resolvedWidth, height: this.rowHeight }, rowId, rowIndex, storeIndex, { column, columnIndex, x: 0, width: column.resolvedWidth }, 'body'),
      zone: 'body',
      store: this.store,
      api: this.api,
    }
  }

  /**
   * Выполняет внутренний шаг canPasteCell для DataTableRootNode.
   */
  private canPasteCell(context: DataTableCellContext<Row>): boolean {
    const column = context.column
    if (column.paste === false) return false
    if (column.paste && column.paste.enabled === false) return false
    const editable = column.editable
    if (typeof editable === 'function') return editable(context)
    return editable === true
  }

  /**
   * Разбирает входное значение DataTableRootNode.
   */
  private parsePasteValue(raw: unknown, context: DataTableCellContext<Row>): unknown {
    if (context.column.parsePasteValue) return context.column.parsePasteValue(String(raw ?? ''), context)
    if (context.column.type === 'number') return raw === '' || raw === null || raw === undefined ? null : Number(String(raw).replace(',', '.'))
    if (context.column.type === 'boolean') return parseClipboardBoolean(raw)
    if (context.column.type === 'json') {
      try {
        return JSON.parse(String(raw))
      } catch {
        return raw
      }
    }
    return raw
  }

  /**
   * Проверяет входное значение DataTableRootNode.
   */
  private async validatePasteValue(value: unknown, context: DataTableCellContext<Row>): Promise<true | string> {
    if (context.column.validatePasteValue) return context.column.validatePasteValue(value, context)
    if (context.column.type === 'number' && value !== null && !Number.isFinite(value)) return 'Invalid number'
    return true
  }

  /**
   * Запускает runtime-процесс DataTableRootNode.
   */
  private startTextSelectionAt(x: number, y: number, event: MouseEvent): boolean {
    if (!this.props.textSelection || !this.props.textSelection.enabled) return false
    if (!this.textSelection.start(x, y)) return false

    this.textSelectionActive = true
    this.clearSelection()
    this.capturePointer(event)
    this.refresh(['interaction'])
    return true
  }

  /**
   * Обновляет runtime-состояние DataTableRootNode.
   */
  private updateTextSelectionAt(globalX: number, globalY: number): void {
    const [x, y] = this.toLocal(globalX, globalY)
    if (!this.textSelection.update(x, y)) return
    this.refresh(['interaction'])
  }

  /**
   * Обновляет значение состояния DataTableRootNode.
   */
  private setupTextSelectionKeyboardEvents(): void {
    if (typeof window === 'undefined') return
    window.addEventListener('keydown', this.handleTextSelectionKeydown)
  }

  /**
   * Выполняет внутренний шаг teardownTextSelectionKeyboardEvents для DataTableRootNode.
   */
  private teardownTextSelectionKeyboardEvents(): void {
    if (typeof window === 'undefined') return
    window.removeEventListener('keydown', this.handleTextSelectionKeydown)
  }

  /**
   * Обрабатывает runtime-событие DataTableRootNode.
   */
  private handleTextSelectionKeydownEvent(event: KeyboardEvent): void {
    const copy = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'c'
    const paste = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'v'
    if (copy && this.props.textSelection && this.props.textSelection.enabled && this.textSelection.hasSelection()) {
      event.preventDefault()
      void this.textSelection.copy(ranges => this.formatTextSelectionCopy(ranges))
      return
    }
    if (copy && this.selection && this.selection.ranges.length > 0) {
      event.preventDefault()
      const text = this.copySelection()
      if (text && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        void navigator.clipboard.writeText(text)
      }
      return
    }
    if (paste && this.selection?.activeCell) {
      event.preventDefault()
      void this.pasteClipboard()
    }
  }

  /**
   * Выполняет внутренний шаг formatTextSelectionCopy для DataTableRootNode.
   */
  private formatTextSelectionCopy(ranges: Array<NovaTextSelectionRange<DataTableTextSelectionContext>>): string {
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
  private setupEditingKeyboardEvents(): void {
    if (typeof window === 'undefined') return
    window.addEventListener('keydown', this.handleEditingKeydown)
  }

  /**
   * Выполняет внутренний шаг teardownEditingKeyboardEvents для DataTableRootNode.
   */
  private teardownEditingKeyboardEvents(): void {
    if (typeof window === 'undefined') return
    window.removeEventListener('keydown', this.handleEditingKeydown)
  }

  /**
   * Обрабатывает runtime-событие DataTableRootNode.
   */
  private handleEditingKeydownEvent(event: KeyboardEvent): void {
    if (event.key !== 'Enter' || this.editingState || !this.selectionActive || !this.selection) return
    if (!this.isEditTriggerEnabled('enter')) return
    const activeCell = this.selection.activeCell
    if (!activeCell) return
    if (!this.startEdit(activeCell.rowId, activeCell.columnId)) return
    event.preventDefault()
    event.stopPropagation()
  }

  /**
   * Выполняет внутренний шаг isEditTriggerEnabled для DataTableRootNode.
   */
  private isEditTriggerEnabled(trigger: 'doubleClick' | 'enter' | 'programmatic'): boolean {
    return this.props.editing !== false && this.props.editing.trigger.includes(trigger)
  }

  /**
   * Запускает runtime-процесс DataTableRootNode.
   */
  private startEditFromTarget(target: DataTableInteractionTarget<Row>, trigger: 'doubleClick' | 'enter' | 'programmatic'): boolean {
    if (!this.isEditTriggerEnabled(trigger)) return false
    const context = this.createCellContext(target)
    if (!context || !this.canEditCell(context)) return false
    return this.openEditor(context)
  }

  /**
   * Запускает runtime-процесс DataTableRootNode.
   */
  private startEdit(rowId: DataTableRowId, columnId: string): boolean {
    if (this.props.editing === false) return false

    const target = this.resolveEditTarget(rowId, columnId, true)
    if (!target) return false
    const context = this.createCellContext(target)
    if (!context || !this.canEditCell(context)) return false
    return this.openEditor(context)
  }

  /**
   * Нормализует и возвращает итоговое значение DataTableRootNode.
   */
  private resolveEditTarget(rowId: DataTableRowId, columnId: string, ensureVisible = false): DataTableInteractionTarget<Row> | null {
    const column = this.resolvedColumns.find(item => item.id === columnId)
    if (!column) return null

    const pinnedTarget = this.resolvePinnedEditTarget(rowId, column)
    if (pinnedTarget) return pinnedTarget

    const rowIndex = this.viewPipeline.findViewIndexByRowId(rowId)
    if (rowIndex === undefined) return null

    if (ensureVisible) this.scrollCellIntoView(rowIndex, column)
    const row = this.viewPipeline.getRowAt(rowIndex) ?? this.store.getRow(rowId)
    if (!row) return null

    const columnRect = this.visibleColumnRects().find(item => item.column.id === column.id)
    if (!columnRect) return null

    const y = this.viewport.bodyY + rowIndex * this.rowHeight - this.scrollY
    if (y + this.rowHeight < this.viewport.bodyY || y > this.viewport.bodyY + this.viewport.bodyHeight) return null

    const storeIndex = this.viewPipeline.getStoreIndexAt(rowIndex)
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
  private resolvePinnedEditTarget(rowId: DataTableRowId, column: DataTableResolvedColumn<Row>): DataTableInteractionTarget<Row> | null {
    const pinnedRows = this.resolveEffectivePinnedRows()
    const zones: Array<{ zone: 'pinned-top' | 'pinned-bottom'; rows: Array<Row>; y: (index: number) => number }> = [
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

    const columnRect = this.visibleColumnRects().find(item => item.column.id === column.id)
    if (!columnRect) return null

    for (const zone of zones) {
      const rowIndex = zone.rows.findIndex((row, index) => this.resolveRenderedRowId(zone.zone, row, index) === rowId)
      const row = zone.rows[rowIndex]
      if (!row) continue
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
  private scrollCellIntoView(rowIndex: number, column: DataTableResolvedColumn<Row>): void {
    let nextX = this.scrollX
    if (!column.pinned) {
      const centerColumns = this.resolvedColumns.filter(item => !item.pinned)
      let columnX = 0
      for (const item of centerColumns) {
        if (item.id === column.id) break
        columnX += item.resolvedWidth
      }
      if (columnX < this.scrollX) nextX = columnX
      else if (columnX + column.resolvedWidth > this.scrollX + this.viewport.bodyWidth) {
        nextX = columnX + column.resolvedWidth - this.viewport.bodyWidth
      }
    }

    let nextY = this.scrollY
    const rowTop = rowIndex * this.rowHeight
    const rowBottom = rowTop + this.rowHeight
    if (rowTop < this.scrollY) nextY = rowTop
    else if (rowBottom > this.scrollY + this.viewport.bodyHeight) nextY = rowBottom - this.viewport.bodyHeight

    if (nextX !== this.scrollX || nextY !== this.scrollY) {
      this.setScroll(nextX, nextY)
    }
  }

  /**
   * Выполняет внутренний шаг canEditCell для DataTableRootNode.
   */
  private canEditCell(context: DataTableCellContext<Row>): boolean {
    if (this.props.editing === false) return false
    if (context.zone !== 'body' && context.zone !== 'pinned-top' && context.zone !== 'pinned-bottom') return false

    const editable = context.column.editable
    const allowed = typeof editable === 'function' ? editable(context) : editable === true
    if (!allowed) return false

    return this.props.editing.onBeforeEditStart?.(context) !== false
  }

  /**
   * Открывает presentation-состояние DataTableRootNode.
   */
  private openEditor(context: DataTableCellContext<Row>): boolean {
    if (this.props.editing === false) return false
    if (this.editingState) this.cancelEdit()

    const initialValue = context.value
    const draft = this.formatEditValue(initialValue, context)
    this.editingState = {
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
    this.props.editing.onEditStart?.(this.editingState)
    this.emitEditingChange()
    this.refresh(['interaction'])
    return true
  }

  /**
   * Фиксирует подготовленные изменения DataTableRootNode.
   */
  private async commitEdit(value?: unknown): Promise<void> {
    if (!this.editingState || this.props.editing === false) return

    const state = this.editingState
    const draft = value === undefined ? state.draft : value
    const context = {
      ...state,
      draft,
    } satisfies DataTableEditContext<Row>

    let parsed: unknown
    try {
      parsed = this.parseEditValue(draft, context)
      const validation = await this.validateEditValue(parsed, context)
      if (validation !== true) {
        this.setEditingInvalid(validation)
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
        this.setEditingInvalid(typeof beforeResult === 'string' ? beforeResult : 'Edit commit rejected')
        return
      }

      this.props.editing.onEditPending?.(payload)
      this.emitEditingChange()

      const strategy = this.props.editing.commitStrategy
      if (strategy === 'optimistic') this.applyCommittedEditValue(state, parsed)

      await this.props.editing.onEditCommit?.(payload)

      if (strategy === 'pessimistic') this.applyCommittedEditValue(state, parsed)

      state.pending = false
      state.error = undefined
      state.rollback = false
      this.editingState = null
      this.props.editing.onEditSuccess?.(payload)
      this.emitEditingChange()
      this.refresh(['data', 'interaction'])
    } catch (error) {
      if (state.transactionId && this.props.editing.commitStrategy === 'optimistic') {
        const rolledBack = this.undo()
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
      this.setEditingInvalid(error instanceof Error ? error.message : 'Edit commit failed')
      const nextState = this.editingState ?? state
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
  private cancelEdit(): void {
    const state = this.editingState
    if (!state) return

    this.editingState = null
    if (this.props.editing !== false) this.props.editing.onEditCancel?.(state)
    this.emitEditingChange()
    this.refresh(['interaction'])
  }

  /**
   * Выполняет внутренний шаг cloneEditingState для DataTableRootNode.
   */
  private cloneEditingState(): DataTableEditingState<Row> | null {
    return this.editingState ? { ...this.editingState } : null
  }

  /**
   * Публикует событие во внутренний event bus DataTableRootNode.
   */
  private emitEditingChange(): void {
    this.props.onEditingChange?.(this.cloneEditingState())
  }

  /**
   * Обновляет значение состояния DataTableRootNode.
   */
  private setEditingInvalid(message: string): void {
    if (!this.editingState) return

    this.editingState = {
      ...this.editingState,
      invalid: true,
      message,
    }
    this.emitEditingChange()
    this.refresh(['interaction'])
  }

  /**
   * Применяет подготовленное состояние DataTableRootNode.
   */
  private applyCommittedEditValue(state: DataTableEditingState<Row>, value: unknown): DataTableTransaction<Row> | null {
    if (state.zone === 'body') {
      return this.commitDeltas(
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
  private parseEditValue(raw: unknown, context: DataTableEditContext<Row>): unknown {
    const editor = this.resolveEditorType(context.column)
    if (context.column.parseEditValue) return context.column.parseEditValue(raw, context)
    if (typeof context.column.editor === 'object' && context.column.editor.parse) {
      return context.column.editor.parse(raw, context)
    }
    if (editor === 'number') return raw === '' || raw === null || raw === undefined ? null : Number(raw)
    if (editor === 'checkbox') return Boolean(raw)
    return raw
  }

  /**
   * Выполняет внутренний шаг formatEditValue для DataTableRootNode.
   */
  private formatEditValue(value: unknown, context: DataTableCellContext<Row>): unknown {
    const editContext = {
      ...context,
      initialValue: value,
      draft: value,
    } as DataTableEditContext<Row>
    if (context.column.formatEditValue) return context.column.formatEditValue(value, editContext)
    if (typeof context.column.editor === 'object' && context.column.editor.format) {
      return context.column.editor.format(value, editContext)
    }
    return value
  }

  /**
   * Проверяет входное значение DataTableRootNode.
   */
  private async validateEditValue(value: unknown, context: DataTableEditContext<Row>): Promise<true | string> {
    if (context.column.validateEditValue) return context.column.validateEditValue(value, context)
    if (typeof context.column.editor === 'object' && context.column.editor.validate) {
      return context.column.editor.validate(value, context)
    }
    return true
  }

  /**
   * Нормализует и возвращает итоговое значение DataTableRootNode.
   */
  private resolveEditorType(column: DataTableResolvedColumn<Row>): DataTableEditorType {
    if (typeof column.editor === 'string') return column.editor
    if (typeof column.editor === 'object') return column.editor.type
    return 'text'
  }

  /**
   * Синхронизирует состояние между слоями DataTableRootNode.
   */
  private syncEditingRect(): void {
    if (!this.editingState) return

    const target = this.resolveEditTarget(this.editingState.rowId, this.editingState.column.id)
    if (!target) {
      this.cancelEdit()
      return
    }

    const context = this.createCellContext(target)
    if (!context) {
      this.cancelEdit()
      return
    }

    this.editingState = {
      ...this.editingState,
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
        editingInvalid: this.editingState.invalid,
        editingDirty: this.editingState.dirty,
        editingMessage: this.editingState.message,
        editPending: this.editingState.pending,
        editError: this.editingState.error,
        editRollback: this.editingState.rollback,
        editTransactionId: this.editingState.transactionId,
      },
      zone: context.zone,
      store: context.store,
      api: context.api,
    }
    this.emitEditingChange()
  }

  /**
   * Возвращает значение состояния DataTableRootNode.
   */
  private getInteractionState(): DataTableInteractionState<Row> {
    return {
      hover: this.hoverActive ? this.hoverTarget : null,
      selection: this.selectionActive ? this.selection : null,
      hoverAlpha: this.props.hoverAlpha,
      selectionAlpha: this.props.selectionAlpha,
    }
  }

  /**
   * Возвращает compact accessibility state для DOM overlay wrapper.
   */
  private getAccessibilityState(): DataTableAccessibilityState {
    return createDataTableAccessibilityState(this.props.accessibility, {
      rowCount: this.viewPipeline.rowCount,
      columnCount: this.resolvedColumns.length,
      activeCell: this.selection?.activeCell ?? null,
      selection: this.selection,
      editing: !!this.editingState,
      lastAction: this.keyboardFocusActive ? 'Table focused' : undefined,
    })
  }

  /**
   * Выполняет внутренний шаг animateInteractionAlpha для DataTableRootNode.
   */
  private animateInteractionAlpha(key: 'hoverAlpha' | 'selectionAlpha', value: number): void {
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
  private resolveInteractionTargetAt(x: number, y: number): DataTableInteractionTarget<Row> | null {
    if (x < 0 || y < 0 || x > this.width || y > this.height) return null

    const columnRect = this.resolveColumnAt(x)
    if (!columnRect) return null

    const rowTarget = this.resolveRowAt(y)
    if (!rowTarget) return null

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
  private resolveRowAt(y: number): {
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

    const pinnedRows = this.resolveEffectivePinnedRows()
    const topRows = pinnedRows.top ?? []
    if (y >= this.headerHeight && y < this.viewport.bodyY) {
      const localIndex = Math.floor((y - this.headerHeight) / this.rowHeight)
      const row = topRows[localIndex]
      if (!row) return null
      return {
        row,
        rowId: this.resolveRenderedRowId('pinned-top', row, localIndex),
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
      if (!row) return null
      return {
        row,
        rowId: this.resolveRenderedRowId('pinned-bottom', row, localIndex),
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

    if (y < this.viewport.bodyY || y > this.viewport.bodyY + this.viewport.bodyHeight) return null
    const rowIndex = Math.floor((this.scrollY + y - this.viewport.bodyY) / this.rowHeight)
    if (rowIndex < 0 || rowIndex >= this.viewPipeline.rowCount) return null
    const viewRow = this.viewPipeline.getViewRowAt(rowIndex)
    const row = viewRow?.kind === 'data' ? viewRow.row : undefined
    const rowId = viewRow?.rowId ?? this.viewPipeline.getRowIdAt(rowIndex)
    const storeIndex = viewRow?.storeIndex ?? this.viewPipeline.getStoreIndexAt(rowIndex)
    const zone = viewRow && viewRow.kind !== 'data' ? viewRow.kind : 'body'
    return {
      row,
      rowId,
      rowIndex,
      storeIndex,
      zone,
      rect: {
        x: 0,
        y: this.viewport.bodyY + rowIndex * this.rowHeight - this.scrollY,
        width: this.width,
        height: this.rowHeight,
      },
    }
  }

  /**
   * Нормализует и возвращает итоговое значение DataTableRootNode.
   */
  private resolveColumnAt(x: number): VisibleColumnRect<Row> | null {
    for (const rect of this.visibleColumnRects('left')) {
      if (x >= rect.x && x <= rect.x + rect.width) return rect
    }
    for (const rect of this.visibleColumnRects('right')) {
      if (x >= rect.x && x <= rect.x + rect.width) return rect
    }
    if (x < this.viewport.bodyX || x > this.viewport.bodyX + this.viewport.bodyWidth) return null
    for (const rect of this.visibleColumnRects('center')) {
      if (x >= rect.x && x <= rect.x + rect.width) return rect
    }
    return null
  }

  /**
   * Создает runtime-сущность DataTableRootNode.
   */
  private createCellContext(target: DataTableInteractionTarget<Row>): DataTableCellContext<Row> | null {
    if (isGroupInteractionZone(target.zone) || !target.row || target.rowId === undefined) return null
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
      state: this.createCellState(target.rect, target.rowId, target.rowIndex, target.storeIndex, {
        column: target.column,
        columnIndex: target.columnIndex,
        x: target.rect.x,
        width: target.rect.width,
      }, target.zone),
      zone: target.zone,
      store: this.store,
      api: this.api,
    }
  }

  /**
   * Запоминает последнюю локальную позицию pointer для синхронизации hover при scroll.
   */
  private trackPointerPosition(event: MouseEvent): [number, number] {
    const position = this.toLocalPointerPosition(event)
    this.lastPointerPosition = { x: position[0], y: position[1] }
    return position
  }

  /**
   * Переводит pointer event в локальные координаты root node.
   */
  private toLocalPointerPosition(event: MouseEvent): [number, number] {
    const position = this.events.getCanvasMousePosition(event)
    return this.toLocal(position.x, position.y)
  }

  /**
   * Синхронизирует native cursor для canvas-only resize affordance.
   */
  private syncNativeCursor(x: number, y: number): void {
    if (this.resizeState || this.hitResizeHandle(x, y)) {
      this.nova.cursor('col-resize')
      return
    }
    this.nova.cursor('default')
  }

  /**
   * Восстанавливает cursor после drag lifecycle.
   */
  private syncNativeCursorFromLastPosition(): void {
    const position = this.lastPointerPosition
    if (!position || !this.pointerInside) {
      this.nova.cursor('default')
      return
    }
    this.syncNativeCursor(position.x, position.y)
  }

  /**
   * Выполняет внутренний шаг hitResizeHandle для DataTableRootNode.
   */
  private hitResizeHandle(x: number, y: number): VisibleColumnRect<Row> | null {
    const resizeHeight = this.headerHeight - this.filterRowHeight
    if (y < 0 || y > resizeHeight) return null

    for (const rect of this.visibleColumnRects()) {
      if (!rect.column.resizable) continue
      const edge = rect.x + rect.width
      if (Math.abs(x - edge) <= 5) return rect
    }
    return null
  }

  /**
   * Выполняет отрисовку DataTableRootNode.
   */
  private renderScrollbars(): void {
    if (this.props.scrollbars === false || !this.props.scrollbars.nativeRenderer) return
    const geometry = this.createScrollbarGeometry()
    const state = this.getScrollbarState()
    if (state.alpha <= 0) return

    const schema: NovaSchema = []
    if (geometry.vertical) {
      schema.push(...createNovaScrollbarSchema(geometry.vertical, state))
    }

    if (geometry.horizontal) {
      schema.push(...createNovaScrollbarSchema(geometry.horizontal, state))
    }

    this.emitSchema(schema)
  }

  /**
   * Выполняет отрисовку DataTableRootNode.
   */
  private renderScrollbarLayer(): void {
    const template = this.props.scrollbarLayerTemplate
    if (!template || this.props.scrollbars === false) return

    const schema = template(this.createScrollbarLayerContext())
    this.emitSchema(schema)
  }

  /**
   * Создает runtime-сущность DataTableRootNode.
   */
  private createScrollbarLayerContext(): DataTableScrollbarLayerContext<Row> {
    const geometry = this.createScrollbarGeometry()
    return {
      horizontal: geometry.horizontal,
      vertical: geometry.vertical,
      viewport: this.viewport,
      state: this.getScrollbarState(),
      actions: {
        scrollTo: (x, y) => this.setScroll(x, y),
        scrollBy: (dx, dy) => this.setScroll(this.scrollX + dx, this.scrollY + dy),
        startDrag: (axis, event) => {
          if (!event) return
          this.trackPointerPosition(event)
          this.startScrollbarDrag(axis, event)
        },
      },
      store: this.store,
      api: this.api,
    }
  }

  /**
   * Создает runtime-сущность DataTableRootNode.
   */
  private createScrollbarGeometry(): { horizontal: DataTableScrollbarGeometry | null; vertical: DataTableScrollbarGeometry | null } {
    if (this.props.scrollbars === false) return { horizontal: null, vertical: null }

    return {
      horizontal: this.props.scrollbars.horizontal === false || this.viewport.maxScrollX <= 0
        ? null
        : this.createHorizontalScrollbarGeometry(this.props.scrollbars.horizontal),
      vertical: this.props.scrollbars.vertical === false || this.viewport.maxScrollY <= 0
        ? null
        : this.createVerticalScrollbarGeometry(this.props.scrollbars.vertical),
    }
  }

  /**
   * Создает runtime-сущность DataTableRootNode.
   */
  private createVerticalScrollbarGeometry(options: DataTableResolvedScrollbarAxisOptions): DataTableScrollbarGeometry {
    const inset = 4
    const trackHeight = Math.max(1, this.viewport.bodyHeight - inset * 2)
    const thickness = options.thickness
    return createNovaScrollbarGeometry({
      axis: 'vertical',
      track: {
        x: this.width - thickness - inset,
        y: this.viewport.bodyY + inset,
        width: thickness,
        height: trackHeight,
      },
      value: this.scrollY,
      viewportSize: this.viewport.bodyHeight,
      contentSize: this.viewport.contentHeight,
      options,
    }) as DataTableScrollbarGeometry
  }

  /**
   * Создает runtime-сущность DataTableRootNode.
   */
  private createHorizontalScrollbarGeometry(options: DataTableResolvedScrollbarAxisOptions): DataTableScrollbarGeometry {
    const inset = 4
    const trackWidth = Math.max(1, this.viewport.bodyWidth - inset * 2)
    const thickness = options.thickness
    return createNovaScrollbarGeometry({
      axis: 'horizontal',
      track: {
        x: this.viewport.bodyX + inset,
        y: this.height - thickness - inset,
        width: trackWidth,
        height: thickness,
      },
      value: this.scrollX,
      viewportSize: this.viewport.bodyWidth,
      contentSize: this.viewport.contentWidth,
      options,
    }) as DataTableScrollbarGeometry
  }

  /**
   * Возвращает значение состояния DataTableRootNode.
   */
  private getScrollbarState(): DataTableScrollbarState {
    return {
      alpha: this.resolveScrollbarAlpha(),
      hoveredAxis: this.hoveredScrollbarAxis,
      draggingAxis: this.scrollbarDragState?.axis ?? null,
      pointerInside: this.pointerInside,
    }
  }

  /**
   * Нормализует и возвращает итоговое значение DataTableRootNode.
   */
  private resolveScrollbarAlpha(): number {
    if (this.props.scrollbars === false) return 0
    if (this.hasAlwaysVisibleScrollbar()) return 1
    return this.scrollbarAlpha
  }

  /**
   * Выполняет внутренний шаг hasAlwaysVisibleScrollbar для DataTableRootNode.
   */
  private hasAlwaysVisibleScrollbar(): boolean {
    if (this.props.scrollbars === false) return false
    return (this.props.scrollbars.horizontal !== false && this.props.scrollbars.horizontal.visibility === 'always' && this.viewport.maxScrollX > 0)
      || (this.props.scrollbars.vertical !== false && this.props.scrollbars.vertical.visibility === 'always' && this.viewport.maxScrollY > 0)
  }

  /**
   * Выполняет внутренний шаг hasHoverVisibleScrollbar для DataTableRootNode.
   */
  private hasHoverVisibleScrollbar(): boolean {
    if (this.props.scrollbars === false) return false
    return (this.props.scrollbars.horizontal !== false && this.props.scrollbars.horizontal.visibility === 'hover' && this.viewport.maxScrollX > 0)
      || (this.props.scrollbars.vertical !== false && this.props.scrollbars.vertical.visibility === 'hover' && this.viewport.maxScrollY > 0)
  }

  /**
   * Выполняет внутренний шаг hitScrollbar для DataTableRootNode.
   */
  private hitScrollbar(x: number, y: number): DataTableScrollbarAxis | null {
    if (this.resolveScrollbarAlpha() <= 0) return null
    const geometry = this.createScrollbarGeometry()
    if (geometry.vertical && hitNovaScrollbarRect(x, y, geometry.vertical.track)) return 'vertical'
    if (geometry.horizontal && hitNovaScrollbarRect(x, y, geometry.horizontal.track)) return 'horizontal'
    return null
  }

  /**
   * Обновляет runtime-состояние DataTableRootNode.
   */
  private updateHoveredScrollbarAxis(x: number, y: number): void {
    const next = this.hitScrollbar(x, y)
    if (next === this.hoveredScrollbarAxis) return
    this.hoveredScrollbarAxis = next
    this.refresh(['interaction'])
  }

  /**
   * Запускает runtime-процесс DataTableRootNode.
   */
  private startScrollbarDrag(axis: DataTableScrollbarAxis, event: MouseEvent): void {
    const geometry = this.createScrollbarGeometry()
    const item = axis === 'horizontal' ? geometry.horizontal : geometry.vertical
    if (!item || item.max <= 0) return

    this.scrollbarDragState = {
      axis,
      startScrollX: this.scrollX,
      startScrollY: this.scrollY,
    }
    this.hoveredScrollbarAxis = axis
    this.revealScrollbars('scroll')
    this.capturePointer(event)
  }

  /**
   * Обновляет runtime-состояние DataTableRootNode.
   */
  private updateScrollbarDrag(dx: number, dy: number): void {
    const drag = this.scrollbarDragState
    if (!drag) return
    const geometry = this.createScrollbarGeometry()
    const item = drag.axis === 'horizontal' ? geometry.horizontal : geometry.vertical
    if (!item || item.max <= 0) return

    if (drag.axis === 'horizontal') {
      this.setScroll(mapNovaScrollbarDragValue(item, drag.startScrollX, dx), this.scrollY)
    } else {
      this.setScroll(this.scrollX, mapNovaScrollbarDragValue(item, drag.startScrollY, dy))
    }
  }

  /**
   * Выполняет внутренний шаг revealScrollbars для DataTableRootNode.
   */
  private revealScrollbars(reason: DataTableScrollbarVisibility): void {
    if (!this.shouldRevealScrollbars(reason)) return
    this.clearScrollbarHideTimer()
    if (this.scrollbarAlpha !== 1) {
      this.scrollbarAlpha = 1
      this.refresh(['interaction'])
    }
    this.scheduleScrollbarHide(reason)
  }

  /**
   * Выполняет внутренний шаг shouldRevealScrollbars для DataTableRootNode.
   */
  private shouldRevealScrollbars(reason: DataTableScrollbarVisibility): boolean {
    if (this.props.scrollbars === false) return false
    if (reason === 'hover') {
      return (this.props.scrollbars.horizontal !== false && this.props.scrollbars.horizontal.visibility === 'hover')
        || (this.props.scrollbars.vertical !== false && this.props.scrollbars.vertical.visibility === 'hover')
    }
    if (reason === 'scroll') {
      return (this.props.scrollbars.horizontal !== false && this.props.scrollbars.horizontal.visibility === 'scroll')
        || (this.props.scrollbars.vertical !== false && this.props.scrollbars.vertical.visibility === 'scroll')
        || (this.pointerInside && (
          (this.props.scrollbars.horizontal !== false && this.props.scrollbars.horizontal.visibility === 'hover')
          || (this.props.scrollbars.vertical !== false && this.props.scrollbars.vertical.visibility === 'hover')
        ))
    }
    return this.hasAlwaysVisibleScrollbar()
  }

  /**
   * Планирует отложенное выполнение DataTableRootNode.
   */
  private scheduleScrollbarHide(reason: DataTableScrollbarVisibility): void {
    if (this.props.scrollbars === false || this.hasAlwaysVisibleScrollbar() || this.scrollbarDragState) return
    this.clearScrollbarHideTimer()
    this.scrollbarHideTimer = setTimeout(() => {
      if (this.pointerInside && (reason === 'hover' || this.hasHoverVisibleScrollbar())) return
      this.scrollbarAlpha = 0
      this.refresh(['interaction'])
    }, this.props.scrollbars.hideDelay)
  }

  /**
   * Очищает накопленное состояние DataTableRootNode.
   */
  private clearScrollbarHideTimer(): void {
    if (!this.scrollbarHideTimer) return
    clearTimeout(this.scrollbarHideTimer)
    this.scrollbarHideTimer = null
  }

  /**
   * Нормализует и возвращает итоговое значение DataTableRootNode.
   */
  private resolveRenderedRowId(zone: DataTableCellContext<Row>['zone'], row: Row, rowIndex: number): DataTableRowId {
    if (zone === 'body') return this.viewPipeline.getRowIdAt(rowIndex) ?? row.id ?? rowIndex
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
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName.toLowerCase()
  return tag === 'input' || tag === 'textarea' || tag === 'select'
}

function resolveCoreTextSelectionOptions(
  options: DataTableRootResolvedProps['textSelection'],
) {
  if (!options) return false
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
  if (Array.isArray(filters)) return filters.some(rule => rule.columnId === columnId)
  return filters.rules.some(rule => 'logic' in rule ? filterStateHasColumn(rule, columnId) : rule.columnId === columnId)
}

function summarizeColumnFilters(filters: DataTableViewState['filters'], columnId: string): string {
  const rules = collectColumnFilterRules(filters, columnId)
  if (rules.length === 0) return ''
  return rules
    .slice(0, 2)
    .map(rule => `${formatFilterOperator(rule.operator)} ${formatFilterValue(rule.value)}`)
    .join(' · ')
}

function collectColumnFilterRules(
  filters: DataTableViewState['filters'],
  columnId: string,
): Array<DataTableFilterRule> {
  if (Array.isArray(filters)) return filters.filter(rule => rule.columnId === columnId)
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
  if (!current) return operators[0] ?? resolveDefaultFilterOperator(filter)
  const index = operators.indexOf(current)
  return operators[(index + 1) % operators.length] ?? resolveDefaultFilterOperator(filter)
}

function resolveFilterOperators(filter: unknown): Array<DataTableFilterOperator> {
  const configured = resolveFilterConfigValue(filter, 'operators')
  if (Array.isArray(configured) && configured.length > 0) return configured as Array<DataTableFilterOperator>
  const preset = typeof filter === 'string'
    ? filter
    : resolveFilterConfigValue(filter, 'type')
  if (preset === 'number') return ['equals', 'gt', 'gte', 'lt', 'lte']
  if (preset === 'date') return ['equals', 'gt', 'lt']
  if (preset === 'set') return ['in', 'notIn']
  if (preset === 'boolean') return ['is', 'isNot']
  return ['contains', 'equals', 'startsWith', 'endsWith']
}

function resolveDefaultFilterValue(filter: unknown): unknown {
  const defaultValue = resolveFilterConfigValue(filter, 'defaultValue')
  if (defaultValue !== undefined) return defaultValue
  const options = resolveFilterOptions(filter)
  if (options.length > 0) {
    const operator = resolveDefaultFilterOperator(filter)
    if (operator === 'in' || operator === 'notIn') return [options[0]]
    return options[0]
  }
  const preset = typeof filter === 'string'
    ? filter
    : resolveFilterConfigValue(filter, 'type')
  if (preset === 'number') return 0
  if (preset === 'boolean') return true
  return ''
}

function resolveNextFilterValue(filter: unknown, current: unknown): unknown {
  const options = resolveFilterOptions(filter)
  if (options.length === 0) return current ?? resolveDefaultFilterValue(filter)
  const currentValue = Array.isArray(current) ? current[0] : current
  const index = options.findIndex(option => Object.is(option, currentValue))
  const next = options[(index + 1) % options.length] ?? options[0]
  const operator = resolveDefaultFilterOperator(filter)
  return operator === 'in' || operator === 'notIn' ? [next] : next
}

function resolveFilterOptions(filter: unknown): Array<unknown> {
  const options = resolveFilterConfigValue(filter, 'options')
  if (Array.isArray(options)) return options
  const preset = typeof filter === 'string'
    ? filter
    : resolveFilterConfigValue(filter, 'type')
  if (preset === 'boolean') return [true, false]
  return []
}

function resolveFilterConfigValue(filter: unknown, key: string): unknown {
  if (!filter || typeof filter !== 'object') return undefined
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
  if (Array.isArray(value)) return value.map(item => String(item)).join(', ')
  if (value === undefined || value === null || value === '') return 'empty'
  return String(value)
}

function resolveFilterPlaceholder(filter: unknown): string {
  if (!filter) return ''
  if (typeof filter === 'string') return filter
  if (typeof filter === 'object' && filter && 'type' in filter) return String((filter as { type?: unknown }).type ?? 'filter')
  return 'filter'
}

function estimateSearchTextWidth(value: string, fontSize: number): number {
  let width = 0
  for (const character of value) {
    if (character === ' ') width += fontSize * 0.32
    else if (/[il|.,:;]/.test(character)) width += fontSize * 0.28
    else if (/[mwMW@#]/.test(character)) width += fontSize * 0.82
    else width += fontSize * 0.56
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
  if (left === right) return true
  if (!left || !right) return false
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
  if (format === 'plain') return [[text]]
  if (format === 'auto' && !text.includes('\t') && text.includes(',')) return parseDelimitedClipboard(text, ',')
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
    } else if (char === '"') {
      quoted = !quoted
    } else if (char === ',' && !quoted) {
      cells.push(value)
      value = ''
    } else {
      value += char
    }
  }
  cells.push(value)
  return cells
}

function resolveClipboardFeedbackPalette(
  tone: DataTableClipboardFeedbackState['tone'],
): { background: string; border: string; accent: string; color: string } {
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
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function formatClipboardBlock(lines: Array<Array<string>>, format: DataTableClipboardFormat): string {
  if (format === 'html') {
    const rows = lines
      .map(line => `<tr>${line.map(value => `<td>${escapeHtmlCell(value)}</td>`).join('')}</tr>`)
      .join('')
    return `<table><tbody>${rows}</tbody></table>`
  }
  if (format === 'plain') return lines.map(line => line.join(' ')).join('\n')
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
  if (value === undefined || value === null) return value
  try {
    return JSON.parse(JSON.stringify(value)) as T
  } catch {
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
