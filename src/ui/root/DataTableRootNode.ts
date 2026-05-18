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
import type { NovaApp, NovaSchema, NovaSurface } from '@endge/nova'
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
  DataTableGroupNode,
  DataTableGroupTemplateContext,
  DataTableHoverMode,
  DataTableInteractionState,
  DataTableInteractionTarget,
  DataTablePinnedRowPosition,
  DataTableQueryState,
  DataTableResolvedColumn,
  DataTableResolvedScrollbarAxisOptions,
  DataTableResolvedZoomWheelOptions,
  DataTableRootApi,
  DataTableRootOptions,
  DataTableRootProps,
  DataTableRootResolvedProps,
  DataTableRowId,
  DataTableSearchHighlightMode,
  DataTableScrollbarAxis,
  DataTableScrollbarGeometry,
  DataTableScrollbarLayerContext,
  DataTableScrollbarState,
  DataTableScrollbarVisibility,
  DataTableSelectionState,
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

type VisibleColumnRegion = 'all' | 'left' | 'center' | 'right'

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
  private readonly widthOverrides = new Map<string, number>()
  private readonly columnIndexById = new Map<string, number>()
  private readonly pendingDeltas: Array<DataTableDelta<Row>> = []
  private resolvedColumns: Array<DataTableResolvedColumn<Row>> = []
  private viewport: DataTableViewport
  private resizeState: ResizeState<Row> | null = null
  private hoverTarget: DataTableInteractionTarget<Row> | null = null
  private hoverActive = false
  private selection: DataTableSelectionState | null = null
  private selectionActive = false
  private visibleCellKeys = new Set<string>()
  private nextVisibleCellKeys = new Set<string>()
  private cellEnterStartedAt = new Map<string, number>()
  private cellEnterRenderCount = 0
  private suppressCellEnterUntil = 0
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
  private gestureStartZoomValue = 1
  private gestureActive = false
  private deltaFlushQueued = false
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
    this.resolvedColumns = this.resolveColumns()
    this.syncViewPipeline()
    this.viewport = this.createViewport()
    this.options({
      interactive: true,
      cursor: { hover: 'default', dragging: 'col-resize' },
    })
    this.setupEvents()
    this.setupTooltipKeyboardEvents()
    this.addDisposer(() => {
      this.releaseAnimationLoop()
      this.teardownTrackpadGestureEvents()
      this.clearScrollbarHideTimer()
      this.clearTooltipTimers()
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
      refresh: () => this.refresh(),
      batch: callback => this.batch(callback),
      getViewport: () => ({ ...this.viewport }),
      getInteraction: () => this.getInteractionState(),
      clearHover: () => this.clearHover(),
      selectCell: (rowId, columnId) => this.selectCell(rowId, columnId),
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
    this.renderGrid()
  }

  /**
   * Реагирует на новые props.
   */
  protected override onPropsChanged(changedKeys: Array<keyof DataTableRootResolvedProps<Row>>): void {
    this.props = normalizeDataTableRootProps(this.props)
    this.applyCommonPropsChanged(changedKeys)
    if (changedKeys.includes('store') && this.props.store && this.props.store !== this.store) {
      this.store = this.props.store
      this.viewPipeline = new DataTableViewPipeline(this.store)
      this.scrollX = 0
      this.scrollY = 0
      this.hoverTarget = null
      this.selection = null
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
    if (delta > 0) this.revealScrollbars('scroll')
    this.syncHoverAfterViewportChange()
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
    this.dirty({ update: true, render: true })
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
          this.handleHeaderAction(target, event)
          event.cancelBubble = true
          return
        }
        if (target.zone === 'group' && typeof target.rowId === 'string') {
          this.toggleGroup(target.rowId)
          event.cancelBubble = true
          return
        }
        this.updateSelection(target)
        const context = this.createCellContext(target)
        if (context) this.props.onCellClick?.(context)
      }
      event.cancelBubble = true
    })

    this.on('dragmove', (event, dx, dy) => {
      if (this.scrollbarDragState) {
        this.updateScrollbarDrag(dx, dy)
        event.cancelBubble = true
        return
      }
      if (!this.resizeState) return
      const nextWidth = this.resizeState.startWidth + dx
      this.applyColumnWidth(this.resizeState.column.id, nextWidth)
      event.cancelBubble = true
    })

    this.on('dragend', event => {
      if (this.scrollbarDragState) {
        this.scrollbarDragState = null
        this.releasePointerCapture(event)
        this.scheduleScrollbarHide('scroll')
        event.cancelBubble = true
        return
      }
      if (!this.resizeState) return
      this.resizeState = null
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
    this.renderInteractionOverlay()
    this.renderInteractionLayer()
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
    const hoverAffectsCells = !!hover && !isGroupInteractionZone(hover.zone)
    const hovered = hoverAffectsCells && hover.zone === zone && hover.rowId === rowId && hover.column.id === columnRect.column.id
    const rowHovered = hoverAffectsCells && hover.zone === zone && hover.rowId === rowId
    const columnHovered = hoverAffectsCells && hover.column.id === columnRect.column.id
    const selected = !!selection
      && selection.mode === 'cell'
      && selection.rowId === rowId
      && selection.columnId === columnRect.column.id
    const rowSelected = !!selection
      && (selection.mode === 'row' || selection.mode === 'cell')
      && selection.rowId === rowId
    const columnSelected = !!selection
      && (selection.mode === 'column' || selection.mode === 'cell')
      && selection.columnId === columnRect.column.id

    return {
      rect,
      rowIndex,
      viewRowIndex: rowIndex,
      storeIndex,
      columnIndex: columnRect.columnIndex,
      selected,
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
      this.applyCellEnterOpacity(schema, context, startIndex)
      return
    }

    this.renderDefaultCell(schema, context)
    this.applyCellEnterOpacity(schema, context, startIndex)
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

    if (this.visibleAnimatedCells) {
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
    const background = cellSearchHighlighted
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

  private visibleColumnRects(region: VisibleColumnRegion = 'all'): Array<VisibleColumnRect<Row>> {
    const left = this.resolvedColumns.filter(column => column.pinned === 'left')
    const center = this.resolvedColumns.filter(column => !column.pinned)
    const right = this.resolvedColumns.filter(column => column.pinned === 'right')
    const rects: Array<VisibleColumnRect<Row>> = []

    if (region === 'all' || region === 'left') {
      let x = 0
      for (const column of left) {
        rects.push({ column, columnIndex: this.columnIndexById.get(column.id) ?? 0, x, width: column.resolvedWidth })
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
          x: this.viewport.bodyX + centerOffset - this.scrollX,
          width: column.resolvedWidth,
        })
        centerOffset += column.resolvedWidth
      }
    }

    if (region === 'all' || region === 'right') {
      let x = this.width - this.viewport.pinnedRightWidth
      for (const column of right) {
        rects.push({ column, columnIndex: this.columnIndexById.get(column.id) ?? 0, x, width: column.resolvedWidth })
        x += column.resolvedWidth
      }
    }

    return rects
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
        }, columnRect.column)
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
    if (!hover || !options || options.mode === 'none' || this.props.hoverAlpha <= 0) return

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
      const cellRect = this.clipRectToColumnRegion(hover.rect, hover.column)
      if (cellRect) schema.push(this.createOverlayRect(cellRect, options.cellColor, alpha))
    }
    if (schema.length > 0) this.renderer.schema(schema)
  }

  private renderSelectionOverlay(): void {
    const selection = this.selection
    const options = this.props.interaction.selection
    if (!selection || !options || options.mode === 'none' || this.props.selectionAlpha <= 0) return

    const target = this.resolveSelectionTarget(selection)
    if (!target) return

    const alpha = this.props.selectionAlpha
    const schema: NovaSchema = []
    if (selection.mode === 'row') schema.push(...this.createRowOverlayRects(target, options.color, alpha, true))
    else if (selection.mode === 'column') schema.push(...this.createColumnOverlayRects(target, options.color, alpha, true))
    else {
      const cellRect = this.clipRectToColumnRegion(target.rect, target.column)
      if (cellRect) schema.push(this.createOverlayRect(cellRect, options.color, alpha, options.borderColor))
    }
    if (schema.length > 0) this.renderer.schema(schema)
  }

  private renderInteractionLayer(): void {
    const template = this.props.interactionLayerTemplate
    if (!template) return

    const state = this.getInteractionState()
    const hoverRects = this.hoverTarget
      ? isGroupInteractionZone(this.hoverTarget.zone)
        ? this.createRowRects(this.hoverTarget, true)
        : [...this.createRowRects(this.hoverTarget, true), this.hoverTarget.rect]
      : []
    const schema = template({
      hover: state.hover,
      selection: state.selection,
      viewport: this.viewport,
      rects: hoverRects,
      state,
    })
    if (schema.length > 0) this.renderer.schema(schema)
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

  private createRowOverlayRectsFromRect(
    rect: DataTableCellRect,
    color: string,
    opacity: number,
    includePinned: boolean,
  ): NovaSchema {
    const segments: Array<DataTableCellRect> = []
    if (includePinned && this.viewport.pinnedLeftWidth > 0) {
      segments.push({ x: 0, y: rect.y, width: this.viewport.pinnedLeftWidth, height: rect.height })
    }
    segments.push({ x: this.viewport.bodyX, y: rect.y, width: this.viewport.bodyWidth, height: rect.height })
    if (includePinned && this.viewport.pinnedRightWidth > 0) {
      segments.push({
        x: this.width - this.viewport.pinnedRightWidth,
        y: rect.y,
        width: this.viewport.pinnedRightWidth,
        height: rect.height,
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
    const segments: Array<DataTableCellRect> = []
    if (includePinned && this.viewport.pinnedLeftWidth > 0) {
      segments.push({ x: 0, y: target.rect.y, width: this.viewport.pinnedLeftWidth, height: target.rect.height })
    }
    segments.push({
      x: this.viewport.bodyX,
      y: target.rect.y,
      width: this.viewport.bodyWidth,
      height: target.rect.height,
    })
    if (includePinned && this.viewport.pinnedRightWidth > 0) {
      segments.push({
        x: this.width - this.viewport.pinnedRightWidth,
        y: target.rect.y,
        width: this.viewport.pinnedRightWidth,
        height: target.rect.height,
      })
    }
    return segments
  }

  private clipRectToColumnRegion(
    rect: DataTableCellRect,
    column: DataTableResolvedColumn<Row>,
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
    return {
      x,
      y: rect.y,
      width: right - x,
      height: rect.height,
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

  private updateSelection(target: DataTableInteractionTarget<Row>): void {
    if (target.zone === 'header') return
    if (target.zone === 'group' || target.zone === 'group-footer' || target.zone === 'grand-footer') return
    const options = this.props.interaction.selection
    if (!options || options.mode === 'none') return

    this.selection = {
      mode: options.mode,
      rowId: target.rowId,
      rowIndex: target.rowIndex,
      columnId: target.column.id,
      columnIndex: target.columnIndex,
    }
    this.selectionActive = true
    this.animateInteractionAlpha('selectionAlpha', 1)
    this.props.onSelectionChange?.(this.selection)
    this.refresh(['interaction'])
  }

  private selectCell(rowId: DataTableRowId, columnId: string): void {
    const column = this.resolvedColumns.find(item => item.id === columnId)
    if (!column) return

    this.selection = {
      mode: 'cell',
      rowId,
      columnId,
      columnIndex: this.resolvedColumns.indexOf(column),
    }
    this.selectionActive = true
    this.animateInteractionAlpha('selectionAlpha', 1)
    this.props.onSelectionChange?.(this.selection)
    this.refresh(['interaction'])
  }

  private clearSelection(): void {
    if (!this.selectionActive && !this.selection) return
    this.selectionActive = false
    this.animateInteractionAlpha('selectionAlpha', 0)
    this.props.onSelectionChange?.(null)
    this.refresh(['interaction'])
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

  private resolveSelectionTarget(selection: DataTableSelectionState): DataTableInteractionTarget<Row> | null {
    const column = this.resolvedColumns.find(item => item.id === selection.columnId)
    if (!column) return null
    const columnRect = this.visibleColumnRects().find(item => item.column.id === column.id)
    if (!columnRect) return null
    const rowIndex = selection.rowIndex ?? this.findVisibleRowIndex(selection.rowId)
    if (rowIndex === undefined) return null
    const row = this.viewPipeline.getRowAt(rowIndex) ?? (selection.rowId !== undefined ? this.store.getRow(selection.rowId) : undefined)
    const storeIndex = this.viewPipeline.getStoreIndexAt(rowIndex)
    const y = this.viewport.bodyY + rowIndex * this.rowHeight - this.scrollY
    if (selection.rowId !== undefined && (y + this.rowHeight < this.viewport.bodyY || y > this.viewport.bodyY + this.viewport.bodyHeight)) {
      return null
    }
    return {
      row,
      rowId: selection.rowId,
      rowIndex,
      storeIndex,
      column,
      columnIndex: columnRect.columnIndex,
      rect: {
        x: columnRect.x,
        y,
        width: columnRect.width,
        height: this.rowHeight,
      },
      zone: 'body',
    }
  }

  private findVisibleRowIndex(rowId: DataTableRowId | undefined): number | undefined {
    if (rowId === undefined) return undefined
    for (let rowIndex = this.viewport.rowRange.start; rowIndex < this.viewport.rowRange.end; rowIndex += 1) {
      if (this.viewPipeline.getRowIdAt(rowIndex) === rowId) return rowIndex
    }
    return undefined
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
    if (y < 0 || y > this.height) return null

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
