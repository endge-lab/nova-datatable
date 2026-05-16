import {
  buildBoxSchema,
  type NovaUiLayoutRect,
  NovaUiComponentNode,
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
import { createDataTableViewport, sumColumns } from '@/model/runtime/datatable-layout'
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
  DataTableHoverMode,
  DataTableInteractionState,
  DataTableInteractionTarget,
  DataTablePinnedRowPosition,
  DataTableQueryState,
  DataTableResolvedColumn,
  DataTableRootApi,
  DataTableRootOptions,
  DataTableRootProps,
  DataTableRootResolvedProps,
  DataTableRowId,
  DataTableSelectionState,
  DataTableStoreApi,
  DataTableViewport,
  DataTableViewState,
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

type VisibleColumnRegion = 'all' | 'left' | 'center' | 'right'

interface RenderedRow<Row extends Record<string, any>> {
  row: Row
  rowId: DataTableRowId
  rowIndex: number
  storeIndex?: number
  zone: DataTableCellContext<Row>['zone']
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
  readonly store: DataTableStoreApi<Row>

  private readonly api: DataTableRootApi<Row>
  private readonly viewPipeline: DataTableViewPipeline<Row>
  private readonly widthOverrides = new Map<string, number>()
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

    this.api = {
      options: next => this.tableOptions(next),
      data: rows => this.tableData(rows),
      add: row => this.addRows(row),
      update: items => this.updateRows(items),
      remove: ids => this.removeRows(ids),
      setRows: rows => this.setRows(rows),
      replaceRange: (start, rows) => this.replaceRange(start, rows),
      setColumnWidth: (columnId, width) => this.applyColumnWidth(columnId, width),
      autosizeColumn: columnId => this.autosizeColumn(columnId),
      autosizeColumns: columnIds => this.autosizeColumns(columnIds),
      resetColumnWidth: columnId => this.resetColumnWidth(columnId),
      scrollTo: (x, y) => this.setScroll(x, y),
      scrollToRow: rowIndex => this.setScroll(this.scrollX, rowIndex * this.rowHeight),
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
      clearFilter: columnId => this.clearFilter(columnId),
      reorderRows: payload => this.reorderRows(payload),
      reorderColumns: payload => this.reorderColumns(payload),
      resetView: () => this.resetView(),
      setChildren: children => this.setChildren(children),
    }
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
   * Возвращает высоту строки.
   */
  get rowHeight(): number {
    return this.props.rowHeight
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
    if (changedKeys.includes('rows') && this.props.rows) this.store.setRows(this.props.rows)
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
    if (delta > this.props.rowHeight * 4) this.suppressCellEnterUntil = performance.now() + 160
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

    this.widthOverrides.set(columnId, nextWidth)
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
      }
    }

    this.setProps(next as Partial<DataTableRootResolvedProps<Row>>)
    return this.tableOptions()
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

  private clearFilter(columnId?: string): void {
    this.viewPipeline.clearFilter(columnId)
    this.emitViewQuery('filter')
    this.setScroll(this.scrollX, 0)
    this.refresh(['data', 'layout'])
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

  private resetView(): void {
    this.viewPipeline.reset()
    this.emitViewQuery('all')
    this.setScroll(0, 0)
    this.refresh(['data', 'columns', 'layout'])
  }

  private emitViewQuery(kind: 'sort' | 'filter' | 'row' | 'column' | 'all'): void {
    const state = this.viewPipeline.getState()
    if (kind === 'sort' || kind === 'all') this.props.onSortChange?.(state.sort)
    if (kind === 'filter' || kind === 'all') this.props.onFilterChange?.(state.filters)
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
    return resolveDataTableColumns(this.viewPipeline.orderColumns(this.props.columns), this.props.pinnedColumns, this.widthOverrides, this.store)
  }

  private syncViewPipeline(): void {
    this.viewPipeline.sync({
      columns: this.resolvedColumns,
      view: this.props.view,
    })
  }

  private createViewport(): DataTableViewport {
    return createDataTableViewport({
      width: this.width || this.props.width,
      height: this.height || this.props.height,
      rowHeight: this.props.rowHeight,
      headerHeight: this.props.headerHeight,
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
      const nextX = this.scrollX + event.deltaX + (event.shiftKey ? event.deltaY : 0)
      const nextY = this.scrollY + (event.shiftKey ? 0 : event.deltaY)
      this.setScroll(nextX, nextY)
      event.preventDefault()
      event.cancelBubble = true
    })

    this.on('mousemove', event => {
      if (this.resizeState) return
      const [x, y] = this.toLocalPosition(event)
      const nextHover = this.resolveInteractionTargetAt(x, y)
      this.updateHover(nextHover)
    })

    this.on('mouseleave', () => {
      this.clearHover()
    })

    this.on('mousedown', event => {
      const [x, y] = this.toLocalPosition(event)
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
        this.updateSelection(target)
        const context = this.createCellContext(target)
        if (context) this.props.onCellClick?.(context)
      }
      event.cancelBubble = true
    })

    this.on('dragmove', (event, dx) => {
      if (!this.resizeState) return
      const nextWidth = this.resizeState.startWidth + dx
      this.applyColumnWidth(this.resizeState.column.id, nextWidth)
      event.cancelBubble = true
    })

    this.on('dragend', event => {
      if (!this.resizeState) return
      this.resizeState = null
      this.releasePointerCapture(event)
      event.cancelBubble = true
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
    this.renderPartitionedRowZone('header', [{} as Row], headerY, this.props.headerHeight, false)

    if (topRows.length > 0) {
      this.renderPartitionedRowZone('pinned-top', topRows, this.props.headerHeight, this.props.rowHeight, false)
    }

    this.renderBodyRows()

    if (bottomRows.length > 0) {
      this.renderPartitionedRowZone(
        'pinned-bottom',
        bottomRows,
        this.height - bottomRows.length * this.props.rowHeight,
        this.props.rowHeight,
        false,
      )
    }

    this.renderInteractionOverlay()
    this.renderInteractionLayer()
    this.renderScrollbars()
    this.finalizeVisibleCellKeys()
  }

  private renderPartitionedRowZone(
    zone: DataTableCellContext<Row>['zone'],
    rows: Array<Row> | Array<RenderedRow<Row>>,
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
    const rows: Array<RenderedRow<Row>> = []
    for (let rowIndex = this.viewport.rowRange.start; rowIndex < this.viewport.rowRange.end; rowIndex += 1) {
      const row = this.viewPipeline.getRowAt(rowIndex)
      if (!row) continue
      rows.push({
        row,
        rowId: this.viewPipeline.getRowIdAt(rowIndex) ?? this.resolveRenderedRowId('body', row, rowIndex),
        rowIndex,
        storeIndex: this.viewPipeline.getStoreIndexAt(rowIndex),
        zone: 'body',
      })
    }
    if (rows.length === 0) return

    this.renderPartitionedRowZone('body', rows, this.viewport.bodyY, this.props.rowHeight, true)
  }

  private renderClippedRowZone(
    zone: DataTableCellContext<Row>['zone'],
    rows: Array<Row> | Array<RenderedRow<Row>>,
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
    rows: Array<Row> | Array<RenderedRow<Row>>,
    yStart: number,
    rowHeight: number,
    useBodyIndex: boolean,
    columnRegion: VisibleColumnRegion = 'all',
  ): void {
    const schema: NovaSchema = []
    const columnRects = this.visibleColumnRects(columnRegion)

    rows.forEach((rowInput, localIndex) => {
      const renderedRow = this.normalizeRenderedRow(zone, rowInput, localIndex, useBodyIndex)
      const { row, rowId, rowIndex, storeIndex } = renderedRow
      const y = zone === 'body'
        ? this.viewport.bodyY + rowIndex * this.props.rowHeight - this.scrollY
        : yStart + localIndex * rowHeight

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
    rowInput: Row | RenderedRow<Row>,
    localIndex: number,
    useBodyIndex: boolean,
  ): RenderedRow<Row> {
    if (isRenderedRow(rowInput)) return rowInput

    const rowIndex = zone === 'body' && useBodyIndex
      ? this.viewport.rowRange.start + localIndex
      : localIndex
    const rowId = zone === 'header'
      ? '__header__'
      : this.resolveRenderedRowId(zone, rowInput, rowIndex)
    return {
      row: rowInput,
      rowId,
      rowIndex,
      storeIndex: rowIndex,
      zone,
    }
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
    const hovered = !!hover && hover.zone === zone && hover.rowId === rowId && hover.column.id === columnRect.column.id
    const rowHovered = !!hover && hover.zone === zone && hover.rowId === rowId
    const columnHovered = !!hover && hover.column.id === columnRect.column.id
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
      pinnedColumn: columnRect.column.pinned,
      pinnedRow: zone === 'pinned-top' || zone === 'pinned-bottom' ? zone.replace('pinned-', '') as DataTablePinnedRowPosition : undefined,
      sorted: sortIndex >= 0 ? viewState.sort[sortIndex]?.direction : undefined,
      sortPriority: sortIndex >= 0 ? sortIndex : undefined,
      filtered: viewState.filters.some(rule => rule.columnId === columnRect.column.id),
    }
  }

  private renderCell(schema: NovaSchema, context: DataTableCellContext<Row>): void {
    const startIndex = schema.length
    const template = context.zone === 'header'
      ? context.column.headerTemplate ?? this.props.headerTemplate
      : context.column.cellTemplate ?? this.props.cellTemplate

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

  private renderDefaultCell(schema: NovaSchema, context: DataTableCellContext<Row>): void {
    const { rect, value, column, zone, rowIndex } = context
    const isHeader = zone === 'header'
    const isPinned = zone === 'pinned-top' || zone === 'pinned-bottom'
    const background = isHeader
      ? '#eef3f8'
      : isPinned
        ? '#f7f9fc'
        : rowIndex % 2 === 0 ? '#ffffff' : '#fbfcfe'
    const color = isHeader ? '#172033' : '#263142'

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
        text: String(value ?? ''),
        x: rect.x + 10,
        y: rect.y,
        width: Math.max(0, rect.width - 20),
        height: rect.height,
        styles: {
          color,
          font: {
            family: this.props.fontFamily ?? 'Inter, Arial, sans-serif',
            size: this.props.fontSize ?? 13,
            weight: isHeader ? '700' : '500',
            style: 'normal',
          },
          lineHeight: this.props.lineHeight ?? 18,
          align: {
            horizontal: column.align,
            vertical: 'middle',
          },
          ellipsis: true,
        },
      },
    )

    if (isHeader && (context.state.sorted || context.state.filtered)) {
      schema.push({
        type: 'text',
        text: `${context.state.sorted === 'asc' ? '↑' : context.state.sorted === 'desc' ? '↓' : ''}${context.state.filtered ? '•' : ''}`,
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

  private visibleColumnRects(region: VisibleColumnRegion = 'all'): Array<VisibleColumnRect<Row>> {
    const left = this.resolvedColumns.filter(column => column.pinned === 'left')
    const center = this.resolvedColumns.filter(column => !column.pinned)
    const right = this.resolvedColumns.filter(column => column.pinned === 'right')
    const rects: Array<VisibleColumnRect<Row>> = []

    if (region === 'all' || region === 'left') {
      let x = 0
      for (const column of left) {
        rects.push({ column, columnIndex: this.resolvedColumns.indexOf(column), x, width: column.resolvedWidth })
        x += column.resolvedWidth
      }
    }

    if (region === 'all' || region === 'center') {
      let centerOffset = sumColumns(center.slice(0, this.viewport.centerColumnRange.start))
      for (let index = this.viewport.centerColumnRange.start; index < this.viewport.centerColumnRange.end; index += 1) {
        const column = center[index]
        if (!column) continue
        rects.push({
          column,
          columnIndex: this.resolvedColumns.indexOf(column),
          x: this.viewport.bodyX + centerOffset - this.scrollX,
          width: column.resolvedWidth,
        })
        centerOffset += column.resolvedWidth
      }
    }

    if (region === 'all' || region === 'right') {
      let x = this.width - this.viewport.pinnedRightWidth
      for (const column of right) {
        rects.push({ column, columnIndex: this.resolvedColumns.indexOf(column), x, width: column.resolvedWidth })
        x += column.resolvedWidth
      }
    }

    return rects
  }

  private renderInteractionOverlay(): void {
    this.renderHoverOverlay()
    this.renderSelectionOverlay()
  }

  private renderHoverOverlay(): void {
    const hover = this.hoverTarget
    const options = this.props.interaction.hover
    if (!hover || !options || options.mode === 'none' || this.props.hoverAlpha <= 0) return

    const alpha = this.props.hoverAlpha
    const schema: NovaSchema = []
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
      ? [...this.createRowRects(this.hoverTarget, true), this.hoverTarget.rect]
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

  private createRowOverlayRects(
    target: DataTableInteractionTarget<Row>,
    color: string,
    opacity: number,
    includePinned: boolean,
  ): NovaSchema {
    return this.createRowRects(target, includePinned).map(rect => this.createOverlayRect(rect, color, opacity))
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
    if (sameInteractionTarget(previous, target)) return

    if (previous) {
      const previousContext = this.createCellContext(previous)
      if (previousContext) this.props.onCellLeave?.(previousContext)
    }

    this.hoverTarget = target
    this.hoverActive = target !== null
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

  private updateSelection(target: DataTableInteractionTarget<Row>): void {
    if (target.zone === 'header') return
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
    if (y < this.props.headerHeight) {
      return {
        row: {} as Row,
        rowId: '__header__',
        rowIndex: 0,
        zone: 'header',
        rect: { x: 0, y: 0, width: this.width, height: this.props.headerHeight },
      }
    }

    const topRows = this.props.pinnedRows.top ?? []
    if (y >= this.props.headerHeight && y < this.viewport.bodyY) {
      const localIndex = Math.floor((y - this.props.headerHeight) / this.props.rowHeight)
      const row = topRows[localIndex]
      if (!row) return null
      return {
        row,
        rowId: this.resolveRenderedRowId('pinned-top', row, localIndex),
        rowIndex: localIndex,
        zone: 'pinned-top',
        rect: {
          x: 0,
          y: this.props.headerHeight + localIndex * this.props.rowHeight,
          width: this.width,
          height: this.props.rowHeight,
        },
      }
    }

    const bottomRows = this.props.pinnedRows.bottom ?? []
    const bottomStart = this.height - bottomRows.length * this.props.rowHeight
    if (bottomRows.length > 0 && y >= bottomStart && y <= this.height) {
      const localIndex = Math.floor((y - bottomStart) / this.props.rowHeight)
      const row = bottomRows[localIndex]
      if (!row) return null
      return {
        row,
        rowId: this.resolveRenderedRowId('pinned-bottom', row, localIndex),
        rowIndex: localIndex,
        zone: 'pinned-bottom',
        rect: {
          x: 0,
          y: bottomStart + localIndex * this.props.rowHeight,
          width: this.width,
          height: this.props.rowHeight,
        },
      }
    }

    if (y < this.viewport.bodyY || y > this.viewport.bodyY + this.viewport.bodyHeight) return null
    const rowIndex = Math.floor((this.scrollY + y - this.viewport.bodyY) / this.props.rowHeight)
    if (rowIndex < 0 || rowIndex >= this.viewPipeline.rowCount) return null
    const row = this.viewPipeline.getRowAt(rowIndex)
    const rowId = this.viewPipeline.getRowIdAt(rowIndex)
    const storeIndex = this.viewPipeline.getStoreIndexAt(rowIndex)
    return {
      row,
      rowId,
      rowIndex,
      storeIndex,
      zone: 'body',
      rect: {
        x: 0,
        y: this.viewport.bodyY + rowIndex * this.props.rowHeight - this.scrollY,
        width: this.width,
        height: this.props.rowHeight,
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
    const y = this.viewport.bodyY + rowIndex * this.props.rowHeight - this.scrollY
    if (selection.rowId !== undefined && (y + this.props.rowHeight < this.viewport.bodyY || y > this.viewport.bodyY + this.viewport.bodyHeight)) {
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
        height: this.props.rowHeight,
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
    if (!target.row || target.rowId === undefined) return null
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

  private toLocalPosition(event: MouseEvent): [number, number] {
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
    const schema: NovaSchema = []
    if (this.viewport.maxScrollY > 0) {
      const trackHeight = Math.max(1, this.viewport.bodyHeight - 8)
      const thumbHeight = Math.max(28, trackHeight * (this.viewport.bodyHeight / Math.max(1, this.viewport.contentHeight)))
      const thumbY = this.viewport.bodyY + 4 + (trackHeight - thumbHeight) * (this.scrollY / this.viewport.maxScrollY)
      schema.push(
        {
          type: 'rect',
          x: this.width - 8,
          y: this.viewport.bodyY + 4,
          width: 4,
          height: trackHeight,
          styles: { background: 'rgba(23, 32, 51, 0.10)', border: { radius: 3 } },
        },
        {
          type: 'rect',
          x: this.width - 8,
          y: thumbY,
          width: 4,
          height: thumbHeight,
          styles: { background: 'rgba(23, 32, 51, 0.38)', border: { radius: 3 } },
        },
      )
    }

    if (this.viewport.maxScrollX > 0) {
      const trackWidth = Math.max(1, this.viewport.bodyWidth - 8)
      const thumbWidth = Math.max(34, trackWidth * (this.viewport.bodyWidth / Math.max(1, this.viewport.contentWidth)))
      const thumbX = this.viewport.bodyX + 4 + (trackWidth - thumbWidth) * (this.scrollX / this.viewport.maxScrollX)
      schema.push(
        {
          type: 'rect',
          x: this.viewport.bodyX + 4,
          y: this.height - 8,
          width: trackWidth,
          height: 4,
          styles: { background: 'rgba(23, 32, 51, 0.10)', border: { radius: 3 } },
        },
        {
          type: 'rect',
          x: thumbX,
          y: this.height - 8,
          width: thumbWidth,
          height: 4,
          styles: { background: 'rgba(23, 32, 51, 0.38)', border: { radius: 3 } },
        },
      )
    }

    if (schema.length > 0) this.renderer.schema(schema)
  }

  private resolveRenderedRowId(zone: DataTableCellContext<Row>['zone'], row: Row, rowIndex: number): DataTableRowId {
    if (zone === 'body') return this.viewPipeline.getRowIdAt(rowIndex) ?? row.id ?? rowIndex
    return row.id ?? `${zone}:${rowIndex}`
  }
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
}

function isRenderedRow<Row extends Record<string, any>>(value: Row | RenderedRow<Row>): value is RenderedRow<Row> {
  return 'zone' in value && 'row' in value && 'rowIndex' in value
}

function sameInteractionTarget<Row extends Record<string, any>>(
  left: DataTableInteractionTarget<Row> | null,
  right: DataTableInteractionTarget<Row> | null,
): boolean {
  if (left === right) return true
  if (!left || !right) return false
  return left.rowId === right.rowId
    && left.column.id === right.column.id
    && left.zone === right.zone
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
