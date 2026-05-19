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
  type NovaTextSelectionRange,
  type NovaApp,
  type NovaDragEventMeta,
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
import { DataTableInvalidationScope } from '@/model/runtime/DataTableInvalidationScope'
import { DataTableRuntimeActions } from '@/model/runtime/DataTableRuntimeActions'
import {
  DATATABLE_ROOT_NODE_DESCRIPTOR,
  normalizeDataTableRootProps,
  type DataTableRootDescriptor,
} from '@/ui/root/datatable-root.config'
import type {
  DataTableCellContext,
  DataTableCellRect,
  DataTableDelta,
  DataTableDirtyState,
  DataTableEditContext,
  DataTableEditingState,
  DataTableEditorType,
  DataTableGroupNode,
  DataTableGroupTemplateContext,
  DataTableHoverMode,
  DataTableInteractionState,
  DataTableInteractionTarget,
  DataTableClipboardFormat,
  DataTablePinnedRowPosition,
  DataTableQueryState,
  DataTableResolvedColumn,
  DataTableResolvedClipboardOptions,
  DataTableResolvedScrollbarAxisOptions,
  DataTableResolvedZoomWheelOptions,
  DataTableRootApi,
  DataTableRootOptions,
  DataTableRootProps,
  DataTableRootResolvedProps,
  DataTableRowId,
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
  DataTableTooltipContext,
  DataTableViewport,
  DataTableViewRow,
  DataTableViewState,
  DataTableZoomOptions,
  DataTableZoomState,
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
  private readonly textSelection = new NovaTextSelectionService<DataTableTextSelectionContext>()
  private readonly widthOverrides = new Map<string, number>()
  private readonly columnIndexById = new Map<string, number>()
  private readonly pendingDeltas: Array<DataTableDelta<Row>> = []
  private resolvedColumns: Array<DataTableResolvedColumn<Row>> = []
  private viewport: DataTableViewport
  private resizeState: ResizeState<Row> | null = null
  private columnDragState: ColumnDragState<Row> | null = null
  private readonly columnDragLayoutMotion = new Map<string, ColumnDragLayoutMotion>()
  private textSelectionActive = false
  private suppressNextHeaderClick = false
  private hoverTarget: DataTableInteractionTarget<Row> | null = null
  private hoverActive = false
  private selection: DataTableSelectionState | null = null
  private selectionActive = false
  private selectionDragState: SelectionDragState | null = null
  private selectionIdCounter = 0
  private visibleCellKeys = new Set<string>()
  private nextVisibleCellKeys = new Set<string>()
  private cellEnterStartedAt = new Map<string, number>()
  private cellEnterRenderCount = 0
  private suppressCellEnterUntil = 0
  private suppressTextSelectionIndexUntil = 0
  private textRefinementUntil = 0
  private visibleAnimatedCells = false
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
  private gestureStartZoomValue = 1
  private gestureActive = false
  private deltaFlushQueued = false
  private readonly handleEditingKeydown = (event: KeyboardEvent) => this.handleEditingKeydownEvent(event)
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
    this.textSelection.configure(resolveCoreTextSelectionOptions(props.textSelection))
    this.resolvedColumns = this.resolveColumns()
    this.syncViewPipeline()
    this.viewport = this.createViewport()
    this.options({
      interactive: true,
      cursor: { hover: 'default', dragging: 'col-resize' },
    })
    this.setupEvents()
    this.setupTextSelectionKeyboardEvents()
    this.setupTooltipKeyboardEvents()
    this.setupEditingKeyboardEvents()
    this.addDisposer(() => {
      this.releaseAnimationLoop()
      this.teardownTrackpadGestureEvents()
      this.teardownTextSelectionKeyboardEvents()
      this.clearScrollbarHideTimer()
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
      scrollTo: (x, y) => this.setScroll(x, y),
      scrollToRow: rowIndex => this.setScroll(this.scrollX, rowIndex * this.rowHeight),
      getZoom: () => this.getZoomState(),
      setZoom: value => this.setZoom(value),
      resetZoom: () => this.resetZoom(),
      startEdit: (rowId, columnId) => this.startEdit(rowId, columnId),
      commitEdit: value => this.commitEdit(value),
      cancelEdit: () => this.cancelEdit(),
      getEditingState: () => this.cloneEditingState(),
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

  protected override onMount(): void {
    super.onMount()
    this.setupTrackpadGestureEvents()
  }

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

  private get zoomValue(): number {
    return this.props.zoom ? this.props.zoom.value : 1
  }

  private get zoomRowScale(): number {
    return this.props.zoom ? this.props.zoom.rowScale : 1
  }

  private get zoomHeaderScale(): number {
    return this.props.zoom ? this.props.zoom.headerScale : 1
  }

  private get zoomColumnScale(): number {
    return this.props.zoom ? this.props.zoom.columnScale : 1
  }

  private get zoomTextScale(): number {
    return this.props.zoom ? this.props.zoom.textScale : 1
  }

  private get zoomIconScale(): number {
    return this.props.zoom ? this.props.zoom.iconScale : 1
  }

  private get fontSize(): number {
    return Math.max(9, Math.round((this.props.fontSize ?? 13) * this.zoomTextScale))
  }

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
    const revisionBeforeRangeLoad = this.store.takeRevision()
    void this.store.ensureRange(this.viewport.rowRange, this.resolveSourceQuery()).then(() => {
      if (this.store.takeRevision() !== revisionBeforeRangeLoad) this.refresh(['data'])
      return undefined
    })
    this.props.onViewportChange?.({ ...this.viewport })
  }

  /**
   * Рендерит все видимые зоны таблицы.
   */
  override render(): void {
    const rootSchema = buildBoxSchema(this.props, this.width, this.height)
    if (rootSchema.length > 0) this.renderer.schema(rootSchema)
    this.textSelection.configure(resolveCoreTextSelectionOptions(this.props.textSelection))
    this.textSelection.beginFrame()
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
      this.scrollX = 0
      this.scrollY = 0
      this.hoverTarget = null
      this.selection = null
      this.selectionActive = false
      this.selectionDragState = null
      this.cancelEdit()
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
    if (changedKeys.includes('editing') && this.props.editing === false) this.cancelEdit()
    if (changedKeys.includes('rows') && this.props.rows && !this.props.store) this.store.setRows(this.props.rows)
    this.refresh(['layout', 'data'])
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
    this.refresh(['layout', 'columns'])
  }

  /**
   * Сбрасывает пользовательскую ширину колонки.
   */
  resetColumnWidth(columnId: string): boolean {
    const changed = this.widthOverrides.delete(columnId)
    if (changed) this.refresh(['layout', 'columns'])
    return changed
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
        view: this.props.view,
        scrollbars: this.props.scrollbars,
        tooltip: this.props.tooltip,
        zoom: this.props.zoom,
        editing: this.props.editing,
        performance: this.props.performance,
      }
    }

    this.setProps(next as Partial<DataTableRootResolvedProps<Row>>)
    return this.tableOptions()
  }

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

  private resetZoom(): void {
    this.applyZoom({ value: 1 })
  }

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

  private tableData(rows?: Array<Row>): Array<Row> {
    if (rows) this.setRows(rows)
    return this.store.getRows()
  }

  private addRows(row: Row | Array<Row>): void {
    if (Array.isArray(row)) this.store.insertMany(row)
    else this.store.insert(row)
    this.refresh(['data', 'layout'])
  }

  private updateRows(items: Array<Partial<Row> & { id: DataTableRowId }> | Partial<Row> & { id: DataTableRowId }): void {
    const patches = Array.isArray(items) ? items : [items]
    for (const patch of patches) {
      const { id, ...rest } = patch
      this.store.patch(id, rest as unknown as Partial<Row>)
    }
    this.refresh(['data'])
  }

  private removeRows(ids: DataTableRowId | Array<DataTableRowId>): void {
    if (Array.isArray(ids)) this.store.removeMany(ids)
    else this.store.remove(ids)
    this.refresh(['data', 'layout'])
  }

  private setRows(rows: Array<Row>): void {
    this.store.setRows(rows)
    this.refresh(['data', 'layout'])
  }

  private replaceRange(start: number, rows: Array<Row>): void {
    this.store.replaceRange(start, rows)
    this.refresh(['data', 'layout'])
  }

  private applyDeltas(deltas: DataTableDelta<Row> | Array<DataTableDelta<Row>>): void {
    const items = Array.isArray(deltas) ? deltas : [deltas]
    if (items.length === 0) return

    this.pendingDeltas.push(...items)
    if (this.deltaFlushQueued) return

    this.deltaFlushQueued = true
    queueMicrotask(() => this.flushDeltasWithinBudget())
  }

  private flushDeltas(): void {
    this.deltaFlushQueued = false
    this.flushDeltaQueue(false)
  }

  private flushDeltasWithinBudget(): void {
    this.deltaFlushQueued = false
    this.flushDeltaQueue(true)
  }

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
    } while (this.pendingDeltas.length > 0 && (!useBudget || performance.now() - startedAt < budget))

    if (this.pendingDeltas.length > 0 && useBudget) {
      this.deltaFlushQueued = true
      setTimeout(() => this.flushDeltasWithinBudget(), 0)
    }
  }

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

  private batch(callback: (api: DataTableRootApi<Row>) => void): void {
    this.store.batch(() => callback(this.api))
    this.refresh(['data', 'layout'])
  }

  private getViewState(): DataTableViewState {
    return this.viewPipeline.getState()
  }

  private setSort(sort: Parameters<DataTableRootApi<Row>['setSort']>[0]): void {
    this.viewPipeline.setSort(sort)
    this.emitViewQuery('sort')
    this.setScroll(this.scrollX, 0)
    this.refresh(['data', 'layout'])
  }

  private clearSort(columnId?: string): void {
    this.viewPipeline.clearSort(columnId)
    this.emitViewQuery('sort')
    this.setScroll(this.scrollX, 0)
    this.refresh(['data', 'layout'])
  }

  private setFilter(columnId: string, filter: Parameters<DataTableRootApi<Row>['setFilter']>[1]): void {
    this.viewPipeline.setFilter(columnId, filter)
    this.emitViewQuery('filter')
    this.setScroll(this.scrollX, 0)
    this.refresh(['data', 'layout'])
  }

  private setFilters(filters: Parameters<DataTableRootApi<Row>['setFilters']>[0]): void {
    this.viewPipeline.setFilters(filters)
    this.emitViewQuery('filter')
    this.setScroll(this.scrollX, 0)
    this.refresh(['data', 'layout'])
  }

  private clearFilter(columnId?: string): void {
    this.viewPipeline.clearFilter(columnId)
    this.emitViewQuery('filter')
    this.setScroll(this.scrollX, 0)
    this.refresh(['data', 'layout'])
  }

  private setSearch(query: Parameters<DataTableRootApi<Row>['setSearch']>[0]): void {
    this.viewPipeline.setSearch(query)
    this.emitViewQuery('search')
    this.refresh(['data', 'layout'])
  }

  private clearSearch(): void {
    this.viewPipeline.clearSearch()
    this.emitViewQuery('search')
    this.refresh(['data', 'layout'])
  }

  private findNextSearchMatch(): ReturnType<DataTableRootApi<Row>['findNext']> {
    const match = this.viewPipeline.findNext()
    if (match) this.scrollToSearchMatch(match)
    this.emitViewQuery('search')
    this.refresh(['data', 'layout'])
    return match
  }

  private findPreviousSearchMatch(): ReturnType<DataTableRootApi<Row>['findPrevious']> {
    const match = this.viewPipeline.findPrevious()
    if (match) this.scrollToSearchMatch(match)
    this.emitViewQuery('search')
    this.refresh(['data', 'layout'])
    return match
  }

  private focusSearchMatch(index: number): ReturnType<DataTableRootApi<Row>['focusSearchMatch']> {
    const match = this.viewPipeline.focusSearchMatch(index)
    if (match) this.scrollToSearchMatch(match)
    this.emitViewQuery('search')
    this.refresh(['data', 'layout'])
    return match
  }

  private scrollToSearchMatch(match: NonNullable<ReturnType<DataTableRootApi<Row>['findNext']>>): void {
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

  private reorderColumns(payload: Parameters<DataTableRootApi<Row>['reorderColumns']>[0]): void {
    const next = this.viewPipeline.reorderColumns(payload, this.props.columns)
    this.props.onColumnOrderChange?.(next)
    this.emitViewQuery('column')
    this.refresh(['columns', 'layout'])
  }

  private setColumnOrder(order: Array<string>, reason: 'drag' | 'api' = 'api'): void {
    const nextOrder = this.viewPipeline.setColumnOrder(order, this.props.columns)
    this.props.onColumnOrderChange?.({
      columnId: '',
      fromIndex: -1,
      toIndex: -1,
      order: nextOrder,
      reason,
    })
    this.emitViewQuery('column')
    this.refresh(['columns', 'layout'])
  }

  private resetColumnOrder(): void {
    this.viewPipeline.resetColumnOrder()
    this.props.onColumnOrderChange?.({
      columnId: '',
      fromIndex: -1,
      toIndex: -1,
      order: [],
      reason: 'reset',
    })
    this.emitViewQuery('column')
    this.refresh(['columns', 'layout'])
  }

  private setGrouping(groups: Parameters<DataTableRootApi<Row>['setGrouping']>[0]): void {
    this.viewPipeline.setGrouping(groups)
    this.emitViewQuery('grouping')
    this.setScroll(this.scrollX, 0)
    this.refresh(['data', 'layout'])
  }

  private clearGrouping(): void {
    this.viewPipeline.clearGrouping()
    this.emitViewQuery('grouping')
    this.setScroll(this.scrollX, 0)
    this.refresh(['data', 'layout'])
  }

  private toggleGroup(groupId: string): void {
    const group = this.viewPipeline.toggleGroup(groupId)
    if (group) this.props.onGroupToggle?.(group)
    this.emitViewQuery('grouping')
    this.refresh(['data', 'layout'])
  }

  private expandGroup(groupId: string): void {
    this.viewPipeline.expandGroup(groupId)
    this.emitViewQuery('grouping')
    this.refresh(['data', 'layout'])
  }

  private collapseGroup(groupId: string): void {
    this.viewPipeline.collapseGroup(groupId)
    this.emitViewQuery('grouping')
    this.refresh(['data', 'layout'])
  }

  private expandAllGroups(): void {
    this.viewPipeline.expandAllGroups()
    this.emitViewQuery('grouping')
    this.refresh(['data', 'layout'])
  }

  private collapseAllGroups(): void {
    this.viewPipeline.collapseAllGroups()
    this.emitViewQuery('grouping')
    this.refresh(['data', 'layout'])
  }

  private resetView(): void {
    this.viewPipeline.reset()
    this.emitViewQuery('all')
    this.setScroll(0, 0)
    this.refresh(['data', 'columns', 'layout'])
  }

  private emitViewQuery(kind: 'sort' | 'filter' | 'search' | 'row' | 'column' | 'grouping' | 'all'): void {
    const state = this.viewPipeline.getState()
    if (kind === 'sort' || kind === 'all') this.props.onSortChange?.(state.sort)
    if (kind === 'filter' || kind === 'all') this.props.onFilterChange?.(state.filters)
    if (kind === 'search' || kind === 'all') this.props.onSearchChange?.(state.search)
    if (kind === 'grouping' || kind === 'all') this.props.onGroupingChange?.(state.grouping)
    this.props.onQueryChange?.(state.query)
  }

  private resolveSourceQuery(): DataTableQueryState | undefined {
    return this.viewPipeline.isServerControlled() ? undefined : this.viewPipeline.getQuery()
  }

  private refresh(kinds: Array<string> = ['data', 'layout', 'viewport']): void {
    this.invalidation.bumpMany(kinds)
    this.resolvedColumns = this.resolveColumns()
    this.syncViewPipeline()
    this.viewport = this.createViewport()
    this.syncEditingRect()
    this.dirty({ update: true, render: true })
    this.nova.invalidate()
  }

  private suppressTextSelectionIndexFor(reason: 'scroll' | 'zoom'): void {
    const text = this.props.performance.text
    if (!text || !text.disableTextSelectionIndexOnScroll || this.textSelectionActive) return

    const duration = reason === 'zoom'
      ? Math.max(text.refineAfterZoomMs, 120)
      : Math.max(text.refineAfterScrollMs, 80)
    this.suppressTextSelectionIndexUntil = Math.max(this.suppressTextSelectionIndexUntil, performance.now() + duration)
  }

  private requestTextRefinement(reason: 'scroll' | 'zoom'): void {
    const text = this.props.performance.text
    if (!text || text.raster !== 'deferred') return

    const duration = reason === 'zoom' ? text.refineAfterZoomMs : text.refineAfterScrollMs
    if (duration <= 0) return

    this.textRefinementUntil = Math.max(this.textRefinementUntil, performance.now() + duration)
    this.nova.invalidate()
  }

  private continueTextRefinementIfNeeded(): void {
    if (performance.now() >= this.textRefinementUntil) return
    this.nova.invalidate()
  }

  private resolveColumns(): Array<DataTableResolvedColumn<Row>> {
    const columns = resolveDataTableColumns(this.viewPipeline.orderColumns(this.props.columns), this.props.pinnedColumns, this.widthOverrides, this.store)
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

  private syncViewPipeline(): void {
    this.viewPipeline.sync({
      columns: this.resolvedColumns,
      view: this.props.view,
      performance: this.props.performance,
    })
  }

  private createViewport(): DataTableViewport {
    return createDataTableViewport({
      width: this.width || this.props.width,
      height: this.height || this.props.height,
      rowHeight: this.rowHeight,
      headerHeight: this.headerHeight,
      overscanRows: this.props.overscanRows,
      overscanColumns: this.props.overscanColumns,
      rowCount: this.viewPipeline.rowCount,
      columns: this.resolvedColumns,
      pinnedTopCount: this.props.pinnedRows.top?.length ?? 0,
      pinnedBottomCount: this.props.pinnedRows.bottom?.length ?? 0,
      scrollX: this.scrollX,
      scrollY: this.scrollY,
    })
  }

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
      if (this.resizeState) return
      this.trackTooltipModifiers(event)
      const [x, y] = this.trackPointerPosition(event)
      this.pointerInside = true
      this.revealScrollbars('hover')
      this.updateHoveredScrollbarAxis(x, y)
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
    })

    this.on('mousedown', event => {
      this.trackTooltipModifiers(event)
      const [x, y] = this.trackPointerPosition(event)
      const scrollbarAxis = this.hitScrollbar(x, y)
      if (scrollbarAxis) {
        this.startScrollbarDrag(scrollbarAxis, event)
        event.cancelBubble = true
        return
      }

      const resizeColumn = this.hitResizeHandle(x, y)
      if (resizeColumn) {
        this.resizeState = {
          column: resizeColumn.column,
          startX: x,
          startWidth: resizeColumn.column.resolvedWidth,
        }
        this.capturePointer(event)
        event.cancelBubble = true
        return
      }

      const target = this.resolveInteractionTargetAt(x, y)
      if (target) {
        if (target.zone === 'header') {
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
      this.releasePointerCapture(event)
      event.cancelBubble = true
    })
  }

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

  private isTrackpadPinchWheel(event: WheelEvent, options: DataTableResolvedZoomWheelOptions): boolean {
    return options.pinch && event.ctrlKey && Number.isFinite(event.deltaY) && event.deltaY !== 0
  }

  private setupTrackpadGestureEvents(): void {
    const element = this.canvas.element
    element.removeEventListener('wheel', this.handleTrackpadWheelCapture, true)
    element.addEventListener('wheel', this.handleTrackpadWheelCapture, { passive: false, capture: true })
    this.removeWindowGestureEvents()
    this.addWindowGestureEvents()
  }

  private teardownTrackpadGestureEvents(): void {
    const element = this.canvas.element
    element.removeEventListener('wheel', this.handleTrackpadWheelCapture, true)
    this.removeWindowGestureEvents()
    this.gestureActive = false
  }

  private addWindowGestureEvents(): void {
    if (typeof window === 'undefined') return
    window.addEventListener('gesturestart', this.handleGestureStart, { passive: false, capture: true })
    window.addEventListener('gesturechange', this.handleGestureChange, { passive: false, capture: true })
    window.addEventListener('gestureend', this.handleGestureEnd, true)
  }

  private removeWindowGestureEvents(): void {
    if (typeof window === 'undefined') return
    window.removeEventListener('gesturestart', this.handleGestureStart, true)
    window.removeEventListener('gesturechange', this.handleGestureChange, true)
    window.removeEventListener('gestureend', this.handleGestureEnd, true)
  }

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

  private handleTrackpadGestureEnd(event: DataTableGestureEvent): void {
    if (!this.gestureActive) return
    this.gestureActive = false
    event.preventDefault()
    event.stopPropagation()
    event.cancelBubble = true
  }

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

  private isWheelModifierActive(event: WheelEvent, modifier: TooltipModifier | Array<TooltipModifier>): boolean {
    if (Array.isArray(modifier)) return modifier.some(item => this.isWheelModifierActive(event, item))
    if (modifier === 'ctrl') return event.ctrlKey
    if (modifier === 'meta') return event.metaKey
    if (modifier === 'shift') return event.shiftKey
    if (modifier === 'alt') return event.altKey
    return false
  }

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

  private isLocalPointInsideRoot(x: number, y: number): boolean {
    return x >= 0 && x <= this.width && y >= 0 && y <= this.height
  }

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

  private handleHeaderAction(target: DataTableInteractionTarget<Row>, event: MouseEvent): void {
    if (!target.column.sortable || !this.props.view.sorting) return
    this.viewPipeline.cycleSort(target.column.id, event.shiftKey)
    this.emitViewQuery('sort')
    this.setScroll(this.scrollX, 0)
    this.refresh(['data', 'layout'])
  }

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

  private canDragColumn(target: DataTableInteractionTarget<Row>): boolean {
    return target.zone === 'header'
      && !!this.props.view.columnOrdering
      && this.props.view.columnOrdering.enabled
      && target.column.reorderable !== false
  }

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
    }, this.props.columns)
    this.props.onColumnOrderChange?.(next)
    this.emitViewQuery('column')
    this.refresh(['columns', 'layout'])
  }

  private suppressNextHeaderClickOnce(): void {
    this.suppressNextHeaderClick = true
    setTimeout(() => {
      this.suppressNextHeaderClick = false
    }, 0)
  }

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

  private resolveColumnDragEdgeTargetIndex(x: number, allowCrossPinned: boolean): number | undefined {
    const drag = this.columnDragState
    if (!drag) return undefined
    const visible = this.visibleColumnRects('all', false)
      .filter(item => (allowCrossPinned || item.column.pinned === drag.pinned) && item.column.reorderable !== false)
    if (visible.length === 0) return drag.targetIndex
    if (x < 0) return this.resolveColumnDragInsertionIndex(this.resolvedColumns.findIndex(column => column.id === visible[0]?.column.id), false)
    if (x > this.width) return this.resolveColumnDragInsertionIndex(this.resolvedColumns.findIndex(column => column.id === visible[visible.length - 1]?.column.id), true)
    return drag.targetIndex
  }

  private resolveColumnDragInsertionIndex(targetIndex: number, after: boolean): number {
    const drag = this.columnDragState
    if (!drag || targetIndex < 0) return targetIndex
    let insertionIndex = after ? targetIndex + 1 : targetIndex
    const fromIndex = this.resolvedColumns.findIndex(column => column.id === drag.column.id)
    if (fromIndex >= 0 && fromIndex < insertionIndex) insertionIndex -= 1
    return Math.max(0, Math.min(this.resolvedColumns.length - 1, insertionIndex))
  }

  private autoScrollColumnDrag(x: number): void {
    const drag = this.columnDragState
    if (!drag || drag.pinned) return
    const edge = 28
    let nextX = this.scrollX
    if (x < this.viewport.bodyX + edge) nextX -= Math.max(24, this.viewport.bodyWidth * 0.08)
    else if (x > this.viewport.bodyX + this.viewport.bodyWidth - edge) nextX += Math.max(24, this.viewport.bodyWidth * 0.08)
    if (nextX !== this.scrollX) this.setScroll(nextX, this.scrollY)
  }

  private renderGrid(): void {
    const headerY = 0
    const topRows = this.props.pinnedRows.top ?? []
    const bottomRows = this.props.pinnedRows.bottom ?? []
    this.nextVisibleCellKeys = new Set()
    this.cellEnterRenderCount = 0
    this.renderPartitionedRowZone('header', [{} as Row], headerY, this.headerHeight, false)

    if (topRows.length > 0) {
      this.renderPartitionedRowZone('pinned-top', topRows, this.headerHeight, this.rowHeight, false)
    }

    this.renderBodyRows()

    if (bottomRows.length > 0) {
      this.renderPartitionedRowZone(
        'pinned-bottom',
        bottomRows,
        this.height - bottomRows.length * this.rowHeight,
        this.rowHeight,
        false,
      )
    }

    this.renderPinnedBottomGroupPanel()
    this.renderSearchOverlay()
    this.renderTextSelectionOverlay()
    this.renderInteractionOverlay()
    this.renderInteractionLayer()
    this.renderColumnDragOverlay()
    this.renderTooltipLayer()
    this.renderScrollbars()
    this.renderScrollbarLayer()
    this.finalizeVisibleCellKeys()
    this.queueAnimationLoopSync()
  }

  private renderPartitionedRowZone(
    zone: DataTableCellContext<Row>['zone'],
    rows: Array<Row> | Array<RenderedTableRow<Row>>,
    yStart: number,
    rowHeight: number,
    useBodyIndex: boolean,
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
      )
    }
  }

  private renderBodyRows(): void {
    const rows: Array<RenderedTableRow<Row>> = []
    for (let rowIndex = this.viewport.rowRange.start; rowIndex < this.viewport.rowRange.end; rowIndex += 1) {
      const viewRow = this.viewPipeline.getViewRowAt(rowIndex)
      if (!viewRow) continue
      const renderedRow = this.createRenderedBodyRow(viewRow, rowIndex)
      if (renderedRow) rows.push(renderedRow)
    }
    if (rows.length === 0) return

    this.renderPartitionedRowZone('body', rows, this.viewport.bodyY, this.rowHeight, true)
  }

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
  ): void {
    if (clipWidth <= 0 || clipHeight <= 0) return

    this.renderer.clip(clipX, clipY, clipWidth, clipHeight)
    this.renderRowZone(zone, rows, yStart, rowHeight, useBodyIndex, columnRegion)
    this.renderer.clearClip()
  }

  private renderRowZone(
    zone: DataTableCellContext<Row>['zone'],
    rows: Array<Row> | Array<RenderedTableRow<Row>>,
    yStart: number,
    rowHeight: number,
    useBodyIndex: boolean,
    columnRegion: VisibleColumnRegion = 'all',
  ): void {
    const schema: NovaSchema = []
    const columnRects = this.visibleColumnRects(columnRegion)

    rows.forEach((rowInput, localIndex) => {
      const renderedRow = this.normalizeRenderedRow(zone, rowInput, localIndex, useBodyIndex)
      const { rowIndex, storeIndex } = renderedRow
      const y = zone === 'body'
        ? this.viewport.bodyY + rowIndex * this.rowHeight - this.scrollY
        : yStart + localIndex * rowHeight

      if (renderedRow.kind !== 'data') {
        this.renderGroupLikeRow(schema, renderedRow, y, rowHeight, columnRegion)
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

    if (schema.length > 0) this.renderer.schema(schema)
  }

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
      dragging: zone === 'header' && !!columnDrag?.active && columnDrag.column.id === columnRect.column.id,
    }
  }

  private renderCell(schema: NovaSchema, context: DataTableCellContext<Row>): void {
    const startIndex = schema.length
    const template = context.zone === 'header'
      ? context.column.headerTemplate ?? this.props.headerTemplate
      : context.column.cellTemplate ?? this.props.cellTemplate
    if (context.zone !== 'header' && context.column.animated) this.visibleAnimatedCells = true

    if (template) {
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

  private finalizeVisibleCellKeys(): void {
    this.visibleCellKeys = this.nextVisibleCellKeys
    for (const key of [...this.cellEnterStartedAt.keys()]) {
      if (!this.visibleCellKeys.has(key)) this.cellEnterStartedAt.delete(key)
    }
  }

  private createCellKey(context: DataTableCellContext<Row>): string {
    return `${context.zone}:${String(context.rowId)}:${context.column.id}`
  }

  private queueAnimationLoopSync(): void {
    if (this.animationLoopSyncQueued) return
    this.animationLoopSyncQueued = true
    queueMicrotask(() => {
      this.animationLoopSyncQueued = false
      this.syncAnimationLoop()
    })
  }

  private syncAnimationLoop(): void {
    if (this.lifecycleState === 'destroyed') return

    if (this.visibleAnimatedCells || this.columnDragState?.active || this.columnDragLayoutMotion.size > 0) {
      if (!this.animationLoopLease) {
        this.animationLoopLease = this.nova.raph.acquireLoop('nova-datatable:animated-cells')
      }
      this.visibleAnimatedCells = false
      this.dirty({ render: true })
      return
    }

    this.releaseAnimationLoop()
  }

  private releaseAnimationLoop(): void {
    this.animationLoopLease?.release()
    this.animationLoopLease = null
  }

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
        x: rect.x + rect.width - 22,
        y: rect.y,
        width: 18,
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
  }

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

  private isTextSelectionIndexSuppressed(): boolean {
    return !this.textSelectionActive && performance.now() < this.suppressTextSelectionIndexUntil
  }

  private isTextSelectionZoneEnabled(zone: DataTableCellContext<Row>['zone']): boolean {
    const options = this.props.textSelection
    if (!options || !options.enabled) return false
    if (zone === 'header') return options.headerText
    if (zone === 'body') return options.cellText
    if (zone === 'pinned-top' || zone === 'pinned-bottom') return options.pinnedRows
    return false
  }

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
    if (schema.length > 0) this.renderer.schema(schema)
  }

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

  private captureColumnXById(): Map<string, number> {
    const result = new Map<string, number>()
    for (const rect of this.visibleColumnRects('all', false)) result.set(rect.column.id, rect.x)
    return result
  }

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

  private resolveColumnDragDropIndicatorX(): number | null {
    const drag = this.columnDragState
    if (!drag?.active) return null
    const rect = this.visibleColumnRects('all', false).find(item => item.column.id === drag.column.id)
    return rect ? rect.x : null
  }

  private renderInteractionOverlay(): void {
    this.renderHoverOverlay()
    this.renderSelectionOverlay()
  }

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

    if (schema.length > 0) this.renderer.schema(schema)
  }

  private renderPinnedBottomGroupPanel(): void {
    const template = this.props.pinnedBottomTemplate
    const grouping = this.props.view.grouping
    if (!template || !grouping || !grouping.enabled) return
    if (grouping.footerPlacement !== 'pinned-bottom' && grouping.footerPlacement !== 'both') return

    const rows = this.store.getRows()
    const rect = {
      x: this.viewport.bodyX,
      y: Math.max(this.viewport.bodyY, this.height - (this.props.pinnedRows.bottom?.length ?? 0) * this.rowHeight - 124),
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

    this.renderer.clip(rect.x, rect.y, rect.width, rect.height)
    this.renderer.schema(schema)
    this.renderer.clearClip()
  }

  private renderHoverOverlay(): void {
    const hover = this.hoverTarget
    const options = this.props.interaction.hover
    if (this.resizeState || !hover || !options || options.mode === 'none' || this.props.hoverAlpha <= 0) return

    const alpha = this.props.hoverAlpha
    const schema: NovaSchema = []
    if (isGroupInteractionZone(hover.zone)) {
      schema.push(...this.createRowOverlayRects(hover, options.rowColor, alpha, options.pinned))
      if (schema.length > 0) this.renderer.schema(schema)
      return
    }

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
    if (schema.length > 0) this.renderer.schema(schema)
  }

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
    if (schema.length > 0) this.renderer.schema(schema)
  }

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
    if (schema.length > 0) this.renderer.schema(schema)
  }

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

    this.renderer.schema(schema)
  }

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
    if (schema.length > 0) this.renderer.schema(schema)
  }

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

  private createRowOverlayRects(
    target: DataTableInteractionTarget<Row>,
    color: string,
    opacity: number,
    includePinned: boolean,
  ): NovaSchema {
    return this.createRowRects(target, includePinned).map(rect => this.createOverlayRect(rect, color, opacity))
  }

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

  private resolveVerticalRegionBounds(zone: DataTableCellContext<Row>['zone']): { top: number; bottom: number } {
    if (zone === 'header') return { top: 0, bottom: this.headerHeight }
    if (zone === 'pinned-top') return { top: this.headerHeight, bottom: this.viewport.bodyY }
    if (zone === 'pinned-bottom') {
      const bottomRows = this.props.pinnedRows.bottom?.length ?? 0
      return { top: this.height - bottomRows * this.rowHeight, bottom: this.height }
    }
    return {
      top: this.viewport.bodyY,
      bottom: this.viewport.bodyY + this.viewport.bodyHeight,
    }
  }

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

  private updateHover(target: DataTableInteractionTarget<Row> | null): void {
    const previous = this.hoverActive ? this.hoverTarget : null
    if (sameInteractionTarget(previous, target)) {
      if (previous && target && !sameInteractionGeometry(previous, target)) {
        this.hoverTarget = target
        this.syncTooltipTarget(target)
        this.refresh(['interaction'])
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
    this.refresh(['interaction'])
  }

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

  private canShowTooltipForTarget(target: DataTableInteractionTarget<Row> | null): boolean {
    const options = this.props.tooltip
    if (!options || !options.enabled || !target) return false
    if (target.zone === 'header' || isGroupInteractionZone(target.zone)) return false
    if (!this.isTooltipModifierSatisfied()) return false
    return this.createCellContext(target) !== null
  }

  private scheduleTooltipOpen(target: DataTableInteractionTarget<Row>): void {
    this.clearTooltipTimers()
    const delay = this.props.tooltip ? this.props.tooltip.delay : 0
    if (delay <= 0) {
      this.openTooltip(target)
      return
    }
    this.tooltipOpenTimer = setTimeout(() => this.openTooltip(target), delay)
  }

  private openTooltip(target: DataTableInteractionTarget<Row>): void {
    if (!this.canShowTooltipForTarget(target)) return
    this.tooltipTarget = target
    this.animateTooltipAlpha(1)
    this.refresh(['interaction'])
  }

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

  private closeTooltip(): void {
    this.clearTooltipTimers()
    this.animateTooltipAlpha(0)
    this.refresh(['interaction'])
  }

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

  private clearTooltipTimers(): void {
    this.clearTooltipOpenTimer()
    this.clearTooltipHideTimer()
  }

  private clearTooltipOpenTimer(): void {
    if (!this.tooltipOpenTimer) return
    clearTimeout(this.tooltipOpenTimer)
    this.tooltipOpenTimer = null
  }

  private clearTooltipHideTimer(): void {
    if (!this.tooltipHideTimer) return
    clearTimeout(this.tooltipHideTimer)
    this.tooltipHideTimer = null
  }

  private trackTooltipModifiers(event: MouseEvent | WheelEvent): void {
    const previous = this.isTooltipModifierSatisfied()
    this.tooltipModifiers.ctrl = event.ctrlKey
    this.tooltipModifiers.meta = event.metaKey
    this.tooltipModifiers.shift = event.shiftKey
    this.tooltipModifiers.alt = event.altKey
    if (previous !== this.isTooltipModifierSatisfied()) this.syncTooltipTarget()
  }

  private updateTooltipModifierFromKey(event: KeyboardEvent, pressed: boolean): boolean {
    const previous = this.isTooltipModifierSatisfied()
    if (event.key === 'Control') this.tooltipModifiers.ctrl = pressed
    else if (event.key === 'Meta') this.tooltipModifiers.meta = pressed
    else if (event.key === 'Shift') this.tooltipModifiers.shift = pressed
    else if (event.key === 'Alt') this.tooltipModifiers.alt = pressed
    else return false

    return previous !== this.isTooltipModifierSatisfied()
  }

  private isTooltipModifierSatisfied(): boolean {
    const options = this.props.tooltip
    if (!options || options.modifier === false) return true
    return this.tooltipModifiers[options.modifier]
  }

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

  private selectCell(rowId: DataTableRowId, columnId: string, options: DataTableSelectionUpdateOptions = {}): void {
    const column = this.resolvedColumns.find(item => item.id === columnId)
    if (!column) return
    const rowIndex = this.findViewRowIndexById(rowId)
    if (rowIndex === undefined) return
    const anchor = { rowId, rowIndex, columnId, columnIndex: this.resolvedColumns.indexOf(column) }
    this.applySelectionRange(this.createSelectionRange(anchor, anchor, 'cell'), options, anchor)
    if (options.scrollIntoView) this.scrollCellIntoView(rowIndex, column)
  }

  private selectRow(rowId: DataTableRowId, options: DataTableSelectionUpdateOptions = {}): void {
    const rowIndex = this.findViewRowIndexById(rowId)
    if (rowIndex === undefined) return
    const firstColumn = this.resolvedColumns[0]
    if (!firstColumn) return
    const anchor = { rowId, rowIndex, columnId: firstColumn.id, columnIndex: 0 }
    this.applySelectionRange(this.createSelectionRange(anchor, anchor, 'row'), options, anchor)
  }

  private selectColumn(columnId: string, options: DataTableSelectionUpdateOptions = {}): void {
    const columnIndex = this.resolvedColumns.findIndex(item => item.id === columnId)
    if (columnIndex < 0) return
    const rowId = this.viewPipeline.getRowIdAt(this.viewport.rowRange.start) ?? this.store.getRowIdAt(0) ?? 0
    const anchor = { rowId, rowIndex: this.viewport.rowRange.start, columnId, columnIndex }
    this.applySelectionRange(this.createSelectionRange(anchor, anchor, 'column'), options, anchor)
  }

  private selectRange(range: DataTableSelectionRange, options: DataTableSelectionUpdateOptions = {}): void {
    this.applySelectionRange(this.normalizeSelectionRange(range), options)
  }

  private addSelectionRange(range: DataTableSelectionRange): void {
    this.selectRange(range, { append: true })
  }

  private removeSelectionRange(rangeId: string): void {
    if (!this.selection) return
    const ranges = this.selection.ranges.filter(range => range.id !== rangeId)
    this.commitSelectionState({ ...this.selection, ranges, previewRange: null }, { emitActive: false })
  }

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

  private createEmptySelection(): DataTableSelectionState {
    return {
      mode: this.props.selection === false ? 'none' : this.props.selection.mode,
      activeCell: null,
      anchor: null,
      ranges: [],
      previewRange: null,
    }
  }

  private createSelectionAnchor(target: DataTableInteractionTarget<Row>): DataTableSelectionAnchor | null {
    if (target.rowId === undefined) return null
    return {
      rowId: target.rowId,
      rowIndex: target.rowIndex,
      columnId: target.column.id,
      columnIndex: target.columnIndex,
    }
  }

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

  private sortColumnIdsByResolvedOrder(columnIds: Array<string>): Array<string> {
    const source = new Set(columnIds)
    return this.resolvedColumns.filter(column => source.has(column.id)).map(column => column.id)
  }

  private nextSelectionRangeId(): string {
    this.selectionIdCounter += 1
    return `selection-${this.selectionIdCounter}`
  }

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

  private isSelectableTarget(target: DataTableInteractionTarget<Row>): boolean {
    if (this.props.selection === false || !this.props.selection.enabled) return false
    if (target.zone === 'body' || target.zone === 'pinned-top' || target.zone === 'pinned-bottom') return target.rowId !== undefined
    if (target.zone === 'group') return this.props.selection.behavior.groupRows === 'group-row-only'
    return false
  }

  private resolveSelectionUnit(target: DataTableInteractionTarget<Row>): DataTableSelectionUnit {
    if (target.zone === 'header') return 'column'
    const mode = this.props.selection === false ? 'cell' : this.props.selection.mode
    if (mode === 'row' || mode === 'column') return mode
    return 'cell'
  }

  private isSelectionUnitAllowed(unit: DataTableSelectionUnit): boolean {
    if (this.props.selection === false) return false
    if (unit === 'cell') return this.props.selection.allowedUnits.cells
    if (unit === 'row') return this.props.selection.allowedUnits.rows
    return this.props.selection.allowedUnits.columns
  }

  private isSelectionToggleEvent(event?: MouseEvent): boolean {
    if (!event || this.props.selection === false || this.props.selection.cardinality !== 'multiple') return false
    return (event.ctrlKey && this.props.selection.gestures.ctrlToggle) || (event.metaKey && this.props.selection.gestures.metaToggle)
  }

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

  private findViewRowIndexById(rowId: DataTableRowId): number | undefined {
    return this.viewPipeline.findViewIndexByRowId(rowId)
  }

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

  private isCellSelected(rowId: DataTableRowId, columnId: string): boolean {
    const rowIndex = this.findViewRowIndexById(rowId)
    if (rowIndex === undefined) return false
    return this.resolveSelectionHit(rowId, rowIndex, columnId).selected
  }

  private isRowSelected(rowId: DataTableRowId): boolean {
    const rowIndex = this.findViewRowIndexById(rowId)
    if (rowIndex === undefined) return false
    return (this.selection?.ranges ?? []).some(range => range.unit === 'row' && rowIndex >= (range.startRowIndex ?? rowIndex) && rowIndex <= (range.endRowIndex ?? rowIndex))
  }

  private isColumnSelected(columnId: string): boolean {
    return (this.selection?.ranges ?? []).some(range => range.unit === 'column' && (range.columnIds ?? []).includes(columnId))
  }

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

  private async pasteClipboard(text?: string): Promise<DataTablePasteResult<Row>> {
    const emptyResult = { committed: 0, skipped: 0, invalid: [], deltas: [] } satisfies DataTablePasteResult<Row>
    if (this.props.clipboard === false || this.props.clipboard.paste === false || !this.props.clipboard.paste.enabled) return emptyResult
    const sourceText = text ?? await this.readClipboardText()
    if (!sourceText) return emptyResult

    const matrix = parseClipboardMatrix(sourceText, this.props.clipboard.paste.parseFormat)
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
        this.store.applyDeltaBatch(override)
        this.refresh(['data', 'interaction'])
        const result = { committed: override.length, skipped: 0, invalid: [], deltas: override } satisfies DataTablePasteResult<Row>
        this.props.onPasteCommit?.(result)
        this.props.clipboard.onPasteCommit?.(result)
        return result
      }
      const result = await this.createPasteResult(matrix)
      if (result.invalid.length > 0 && this.props.clipboard.paste.invalid === 'reject') {
        this.props.onPasteError?.({ message: 'Paste validation failed', result })
        this.props.clipboard.onPasteError?.({ message: 'Paste validation failed', result })
        return result
      }
      if (result.deltas.length > 0) {
        this.store.applyDeltaBatch(result.deltas)
        this.refresh(['data', 'interaction'])
      }
      this.props.onPasteCommit?.(result)
      this.props.clipboard.onPasteCommit?.(result)
      return result
    } catch (error) {
      this.props.onPasteError?.({
        message: error instanceof Error ? error.message : 'Paste failed',
        error,
      })
      this.props.clipboard.onPasteError?.({
        message: error instanceof Error ? error.message : 'Paste failed',
        error,
      })
      return emptyResult
    }
  }

  private async readClipboardText(): Promise<string> {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.readText) return ''
    try {
      return await navigator.clipboard.readText()
    } catch {
      return ''
    }
  }

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

  private resolveColumnsForSelectionRange(range: DataTableSelectionRange, onlyVisible: boolean): Array<DataTableResolvedColumn<Row>> {
    const ids = range.unit === 'row'
      ? this.resolvedColumns.map(column => column.id)
      : range.columnIds ?? this.normalizeSelectionColumns(range)
    const visible = onlyVisible ? new Set(this.visibleColumnRects().map(rect => rect.column.id)) : null
    return this.resolvedColumns.filter(column => ids.includes(column.id) && (!visible || visible.has(column.id)))
  }

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

  private canPasteCell(context: DataTableCellContext<Row>): boolean {
    const column = context.column
    if (column.paste === false) return false
    if (column.paste && column.paste.enabled === false) return false
    const editable = column.editable
    if (typeof editable === 'function') return editable(context)
    return editable === true
  }

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

  private async validatePasteValue(value: unknown, context: DataTableCellContext<Row>): Promise<true | string> {
    if (context.column.validatePasteValue) return context.column.validatePasteValue(value, context)
    if (context.column.type === 'number' && value !== null && !Number.isFinite(value)) return 'Invalid number'
    return true
  }

  private startTextSelectionAt(x: number, y: number, event: MouseEvent): boolean {
    if (!this.props.textSelection || !this.props.textSelection.enabled) return false
    if (!this.textSelection.start(x, y)) return false

    this.textSelectionActive = true
    this.clearSelection()
    this.capturePointer(event)
    this.refresh(['interaction'])
    return true
  }

  private updateTextSelectionAt(globalX: number, globalY: number): void {
    const [x, y] = this.toLocal(globalX, globalY)
    if (!this.textSelection.update(x, y)) return
    this.refresh(['interaction'])
  }

  private setupTextSelectionKeyboardEvents(): void {
    if (typeof window === 'undefined') return
    window.addEventListener('keydown', this.handleTextSelectionKeydown)
  }

  private teardownTextSelectionKeyboardEvents(): void {
    if (typeof window === 'undefined') return
    window.removeEventListener('keydown', this.handleTextSelectionKeydown)
  }

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

  private setupEditingKeyboardEvents(): void {
    if (typeof window === 'undefined') return
    window.addEventListener('keydown', this.handleEditingKeydown)
  }

  private teardownEditingKeyboardEvents(): void {
    if (typeof window === 'undefined') return
    window.removeEventListener('keydown', this.handleEditingKeydown)
  }

  private handleEditingKeydownEvent(event: KeyboardEvent): void {
    if (event.key !== 'Enter' || this.editingState || !this.selectionActive || !this.selection) return
    if (!this.isEditTriggerEnabled('enter')) return
    const activeCell = this.selection.activeCell
    if (!activeCell) return
    if (!this.startEdit(activeCell.rowId, activeCell.columnId)) return
    event.preventDefault()
    event.stopPropagation()
  }

  private isEditTriggerEnabled(trigger: 'doubleClick' | 'enter' | 'programmatic'): boolean {
    return this.props.editing !== false && this.props.editing.trigger.includes(trigger)
  }

  private startEditFromTarget(target: DataTableInteractionTarget<Row>, trigger: 'doubleClick' | 'enter' | 'programmatic'): boolean {
    if (!this.isEditTriggerEnabled(trigger)) return false
    const context = this.createCellContext(target)
    if (!context || !this.canEditCell(context)) return false
    return this.openEditor(context)
  }

  private startEdit(rowId: DataTableRowId, columnId: string): boolean {
    if (this.props.editing === false) return false

    const target = this.resolveEditTarget(rowId, columnId, true)
    if (!target) return false
    const context = this.createCellContext(target)
    if (!context || !this.canEditCell(context)) return false
    return this.openEditor(context)
  }

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

  private resolvePinnedEditTarget(rowId: DataTableRowId, column: DataTableResolvedColumn<Row>): DataTableInteractionTarget<Row> | null {
    const zones: Array<{ zone: 'pinned-top' | 'pinned-bottom'; rows: Array<Row>; y: (index: number) => number }> = [
      {
        zone: 'pinned-top',
        rows: this.props.pinnedRows.top ?? [],
        y: index => this.headerHeight + index * this.rowHeight,
      },
      {
        zone: 'pinned-bottom',
        rows: this.props.pinnedRows.bottom ?? [],
        y: index => this.height - (this.props.pinnedRows.bottom?.length ?? 0) * this.rowHeight + index * this.rowHeight,
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

  private canEditCell(context: DataTableCellContext<Row>): boolean {
    if (this.props.editing === false) return false
    if (context.zone !== 'body' && context.zone !== 'pinned-top' && context.zone !== 'pinned-bottom') return false

    const editable = context.column.editable
    const allowed = typeof editable === 'function' ? editable(context) : editable === true
    if (!allowed) return false

    return this.props.editing.onBeforeEditStart?.(context) !== false
  }

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

      await this.props.editing.onEditCommit?.({
        state,
        value: parsed,
        previousValue: state.initialValue,
      })

      if (this.props.editing.optimistic) this.applyCommittedEditValue(state, parsed)
      this.editingState = null
      this.emitEditingChange()
      this.refresh(['data', 'interaction'])
    } catch (error) {
      this.setEditingInvalid(error instanceof Error ? error.message : 'Edit commit failed')
      const nextState = this.editingState ?? state
      this.props.editing.onEditError?.({
        state: nextState,
        error,
        message: nextState.message,
      })
    }
  }

  private cancelEdit(): void {
    const state = this.editingState
    if (!state) return

    this.editingState = null
    if (this.props.editing !== false) this.props.editing.onEditCancel?.(state)
    this.emitEditingChange()
    this.refresh(['interaction'])
  }

  private cloneEditingState(): DataTableEditingState<Row> | null {
    return this.editingState ? { ...this.editingState } : null
  }

  private emitEditingChange(): void {
    this.props.onEditingChange?.(this.cloneEditingState())
  }

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

  private applyCommittedEditValue(state: DataTableEditingState<Row>, value: unknown): void {
    if (state.zone === 'body') {
      this.store.setCell(state.rowId, state.column.id, value)
      return
    }

    const key = typeof state.column.field === 'string'
      ? state.column.field
      : state.column.id
    state.row[key as keyof Row] = value as Row[keyof Row]
  }

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

  private async validateEditValue(value: unknown, context: DataTableEditContext<Row>): Promise<true | string> {
    if (context.column.validateEditValue) return context.column.validateEditValue(value, context)
    if (typeof context.column.editor === 'object' && context.column.editor.validate) {
      return context.column.editor.validate(value, context)
    }
    return true
  }

  private resolveEditorType(column: DataTableResolvedColumn<Row>): DataTableEditorType {
    if (typeof column.editor === 'string') return column.editor
    if (typeof column.editor === 'object') return column.editor.type
    return 'text'
  }

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
      },
      zone: context.zone,
      store: context.store,
      api: context.api,
    }
    this.emitEditingChange()
  }

  private getInteractionState(): DataTableInteractionState<Row> {
    return {
      hover: this.hoverActive ? this.hoverTarget : null,
      selection: this.selectionActive ? this.selection : null,
      hoverAlpha: this.props.hoverAlpha,
      selectionAlpha: this.props.selectionAlpha,
    }
  }

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

    const topRows = this.props.pinnedRows.top ?? []
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

    const bottomRows = this.props.pinnedRows.bottom ?? []
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

  private hitResizeHandle(x: number, y: number): VisibleColumnRect<Row> | null {
    if (y < 0 || y > this.headerHeight) return null

    for (const rect of this.visibleColumnRects()) {
      if (!rect.column.resizable) continue
      const edge = rect.x + rect.width
      if (Math.abs(x - edge) <= 5) return rect
    }
    return null
  }

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

    if (schema.length > 0) this.renderer.schema(schema)
  }

  private renderScrollbarLayer(): void {
    const template = this.props.scrollbarLayerTemplate
    if (!template || this.props.scrollbars === false) return

    const schema = template(this.createScrollbarLayerContext())
    if (schema.length > 0) this.renderer.schema(schema)
  }

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

  private getScrollbarState(): DataTableScrollbarState {
    return {
      alpha: this.resolveScrollbarAlpha(),
      hoveredAxis: this.hoveredScrollbarAxis,
      draggingAxis: this.scrollbarDragState?.axis ?? null,
      pointerInside: this.pointerInside,
    }
  }

  private resolveScrollbarAlpha(): number {
    if (this.props.scrollbars === false) return 0
    if (this.hasAlwaysVisibleScrollbar()) return 1
    return this.scrollbarAlpha
  }

  private hasAlwaysVisibleScrollbar(): boolean {
    if (this.props.scrollbars === false) return false
    return (this.props.scrollbars.horizontal !== false && this.props.scrollbars.horizontal.visibility === 'always' && this.viewport.maxScrollX > 0)
      || (this.props.scrollbars.vertical !== false && this.props.scrollbars.vertical.visibility === 'always' && this.viewport.maxScrollY > 0)
  }

  private hasHoverVisibleScrollbar(): boolean {
    if (this.props.scrollbars === false) return false
    return (this.props.scrollbars.horizontal !== false && this.props.scrollbars.horizontal.visibility === 'hover' && this.viewport.maxScrollX > 0)
      || (this.props.scrollbars.vertical !== false && this.props.scrollbars.vertical.visibility === 'hover' && this.viewport.maxScrollY > 0)
  }

  private hitScrollbar(x: number, y: number): DataTableScrollbarAxis | null {
    if (this.resolveScrollbarAlpha() <= 0) return null
    const geometry = this.createScrollbarGeometry()
    if (geometry.vertical && hitNovaScrollbarRect(x, y, geometry.vertical.track)) return 'vertical'
    if (geometry.horizontal && hitNovaScrollbarRect(x, y, geometry.horizontal.track)) return 'horizontal'
    return null
  }

  private updateHoveredScrollbarAxis(x: number, y: number): void {
    const next = this.hitScrollbar(x, y)
    if (next === this.hoveredScrollbarAxis) return
    this.hoveredScrollbarAxis = next
    this.refresh(['interaction'])
  }

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

  private revealScrollbars(reason: DataTableScrollbarVisibility): void {
    if (!this.shouldRevealScrollbars(reason)) return
    this.clearScrollbarHideTimer()
    if (this.scrollbarAlpha !== 1) {
      this.scrollbarAlpha = 1
      this.refresh(['interaction'])
    }
    this.scheduleScrollbarHide(reason)
  }

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

  private scheduleScrollbarHide(reason: DataTableScrollbarVisibility): void {
    if (this.props.scrollbars === false || this.hasAlwaysVisibleScrollbar() || this.scrollbarDragState) return
    this.clearScrollbarHideTimer()
    this.scrollbarHideTimer = setTimeout(() => {
      if (this.pointerInside && (reason === 'hover' || this.hasHoverVisibleScrollbar())) return
      this.scrollbarAlpha = 0
      this.refresh(['interaction'])
    }, this.props.scrollbars.hideDelay)
  }

  private clearScrollbarHideTimer(): void {
    if (!this.scrollbarHideTimer) return
    clearTimeout(this.scrollbarHideTimer)
    this.scrollbarHideTimer = null
  }

  private resolveRenderedRowId(zone: DataTableCellContext<Row>['zone'], row: Row, rowIndex: number): DataTableRowId {
    if (zone === 'body') return this.viewPipeline.getRowIdAt(rowIndex) ?? row.id ?? rowIndex
    return row.id ?? `${zone}:${rowIndex}`
  }
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
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

function parseClipboardMatrix(text: string, format: DataTablePasteParseFormat): Array<Array<string>> {
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
