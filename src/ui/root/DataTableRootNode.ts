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
  DataTablePinnedRowPosition,
  DataTableResolvedColumn,
  DataTableRootApi,
  DataTableRootOptions,
  DataTableRootProps,
  DataTableRootResolvedProps,
  DataTableRowId,
  DataTableStoreApi,
  DataTableViewport,
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
  private readonly widthOverrides = new Map<string, number>()
  private resolvedColumns: Array<DataTableResolvedColumn<Row>> = []
  private viewport: DataTableViewport
  private resizeState: ResizeState<Row> | null = null

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
    this.resolvedColumns = this.resolveColumns()
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
      setChildren: children => this.setChildren(children),
    }
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
    this.viewport = this.createViewport()
    const revisionBeforeRangeLoad = this.store.takeRevision()
    void this.store.ensureRange(this.viewport.rowRange).then(() => {
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
    this.scrollX = x
    this.scrollY = y
    this.viewport = this.createViewport()
    this.scrollX = this.viewport.scrollX
    this.scrollY = this.viewport.scrollY
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

  private refresh(kinds: Array<string> = ['data', 'layout', 'viewport']): void {
    this.invalidation.bumpMany(kinds)
    this.resolvedColumns = this.resolveColumns()
    this.viewport = this.createViewport()
    this.dirty({ update: true, render: true })
    this.nova.invalidate()
  }

  private resolveColumns(): Array<DataTableResolvedColumn<Row>> {
    return resolveDataTableColumns(this.props.columns, this.props.pinnedColumns, this.widthOverrides, this.store)
  }

  private createViewport(): DataTableViewport {
    return createDataTableViewport({
      width: this.width || this.props.width,
      height: this.height || this.props.height,
      rowHeight: this.props.rowHeight,
      headerHeight: this.props.headerHeight,
      overscanRows: this.props.overscanRows,
      overscanColumns: this.props.overscanColumns,
      rowCount: this.store.rowCount,
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

    this.on('mousedown', event => {
      const position = this.events.getCanvasMousePosition(event)
      const resizeColumn = this.hitResizeHandle(position.x, position.y)
      if (!resizeColumn) return

      this.resizeState = {
        column: resizeColumn.column,
        startX: position.x,
        startWidth: resizeColumn.column.resolvedWidth,
      }
      this.capturePointer(event)
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

  private renderGrid(): void {
    const headerY = 0
    const topRows = this.props.pinnedRows.top ?? []
    const bottomRows = this.props.pinnedRows.bottom ?? []
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

    this.renderScrollbars()
  }

  private renderPartitionedRowZone(
    zone: DataTableCellContext<Row>['zone'],
    rows: Array<Row>,
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
    const rows: Array<Row> = []
    for (let rowIndex = this.viewport.rowRange.start; rowIndex < this.viewport.rowRange.end; rowIndex += 1) {
      const row = this.store.getRowAt(rowIndex)
      if (!row) continue
      rows.push(row)
    }
    if (rows.length === 0) return

    this.renderPartitionedRowZone('body', rows, this.viewport.bodyY, this.props.rowHeight, true)
  }

  private renderClippedRowZone(
    zone: DataTableCellContext<Row>['zone'],
    rows: Array<Row>,
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
    rows: Array<Row>,
    yStart: number,
    rowHeight: number,
    useBodyIndex: boolean,
    columnRegion: VisibleColumnRegion = 'all',
  ): void {
    const schema: NovaSchema = []
    const columnRects = this.visibleColumnRects(columnRegion)

    rows.forEach((row, localIndex) => {
      const rowIndex = zone === 'body' && useBodyIndex
        ? this.viewport.rowRange.start + localIndex
        : localIndex
      const rowId = zone === 'header'
        ? '__header__'
        : this.resolveRenderedRowId(row, rowIndex)
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
          column: columnRect.column,
          columnIndex: columnRect.columnIndex,
          value: zone === 'header'
            ? columnRect.column.title ?? columnRect.column.id
            : resolveDataTableValue(row, rowIndex, columnRect.column),
          rect,
          state: {
            rect,
            rowIndex,
            columnIndex: columnRect.columnIndex,
            selected: false,
            hovered: false,
            pinnedColumn: columnRect.column.pinned,
            pinnedRow: zone === 'pinned-top' || zone === 'pinned-bottom' ? zone.replace('pinned-', '') as DataTablePinnedRowPosition : undefined,
          },
          zone,
          store: this.store,
          api: this.api,
        })
      }
    })

    if (schema.length > 0) this.renderer.schema(schema)
  }

  private renderCell(schema: NovaSchema, context: DataTableCellContext<Row>): void {
    const template = context.zone === 'header'
      ? context.column.headerTemplate ?? this.props.headerTemplate
      : context.column.cellTemplate ?? this.props.cellTemplate

    if (template) {
      schema.push(...template(context))
      return
    }

    this.renderDefaultCell(schema, context)
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

  private resolveRenderedRowId(row: Row, rowIndex: number): DataTableRowId {
    return this.store.getRowIdAt(rowIndex) ?? row.id ?? rowIndex
  }
}
