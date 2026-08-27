import type {
  DataTableDelta,
  DataTableDirtyCell,
  DataTableDirtyState,
  DataTableLazySource,
  DataTableQueryState,
  DataTableRange,
  DataTableRowId,
  DataTableRowKey,
  DataTableSearchDirection,
  DataTableSearchQuery,
  DataTableSearchResult,
  DataTableSourceRequestContext,
  DataTableStoreApi,
  DataTableStoreOptions,
} from '@/model/types/datatable.types'

interface DataTablePage<Row extends Record<string, any>> {
  rows: Array<Row | undefined>
  rowIds: Array<DataTableRowId | undefined>
}

interface LoadedEntry<Row extends Record<string, any>> {
  index: number
  row: Row
  rowId: DataTableRowId
}

/**
 * Хранит строки таблицы страницами, lazy cache, dirty state и батчевые SSE-мутации.
 */
export class DataTableStore<Row extends Record<string, any> = Record<string, any>>
implements DataTableStoreApi<Row> {
  private readonly _rowKey: DataTableRowKey<Row>
  private readonly _source?: DataTableLazySource<Row>
  private readonly _pageSize: number
  private readonly _pages = new Map<number, DataTablePage<Row>>()
  private readonly _rowById = new Map<DataTableRowId, Row>()
  private readonly _locationById = new Map<DataTableRowId, number>()
  private readonly _pendingRanges = new Map<string, Promise<void>>()
  private _denseRows: Array<Row> | null = null
  private readonly _dirtyPages = new Set<number>()
  private readonly _dirtyRows = new Set<DataTableRowId>()
  private readonly _dirtyCells = new Map<DataTableRowId, Set<string>>()
  private _revision = 0
  private _dataRevision = 0
  private _structureRevision = 0
  private _batchDepth = 0
  private _pendingDataBump = false
  private _pendingStructureBump = false
  private _structuralDirty = false
  private _summaryDirty = false
  private _estimatedRowCount = 0
  private _latestRequestRevision = 0

  /**
   * Создает store с in-memory или lazy source.
   */
  constructor(options: DataTableStoreOptions<Row>) {
    this._rowKey = options.rowKey
    this._source = options.source
    this._pageSize = resolvePageSize(options.performance)
    this._estimatedRowCount = Math.max(
      options.estimateRowCount ?? 0,
      options.source?.rowCount ?? 0,
      options.rows?.length ?? 0,
    )

    if (options.rows) {
      this.setRows(options.rows)
    }
  }

  /**
   * Возвращает логическое количество строк.
   */
  get rowCount(): number {
    return Math.max(this._estimatedRowCount, this._source?.rowCount ?? 0)
  }

  /**
   * Возвращает количество реально загруженных строк.
   */
  get loadedRowCount(): number {
    return this._denseRows?.length ?? this._rowById.size
  }

  /**
   * Возвращает загруженные строки плотным массивом.
   */
  getRows(): Array<Row> {
    if (this._denseRows) {
      return [...this._denseRows]
    }
    return this._loadedEntries().map(entry => entry.row)
  }

  /**
   * Возвращает строку по id.
   */
  getRow(id: DataTableRowId): Row | undefined {
    return this._rowById.get(id)
  }

  /**
   * Возвращает строку по индексу.
   */
  getRowAt(index: number): Row | undefined {
    if (index < 0 || index >= this.rowCount) {
      return undefined
    }
    if (this._denseRows) {
      return this._denseRows[index]
    }

    const current = this._readRowAt(index)
    if (current) {
      return current
    }

    const sourceRow = this._source?.getRow?.(index)
    if (sourceRow) {
      this._placeRow(index, sourceRow, { markDirty: false })
    }
    return sourceRow
  }

  /**
   * Возвращает id строки по индексу.
   */
  getRowIdAt(index: number): DataTableRowId | undefined {
    if (this._denseRows) {
      const row = this._denseRows[index]
      return row ? this._resolveRowId(row, index) : undefined
    }
    const cached = this._readRowIdAt(index)
    if (cached !== undefined) {
      return cached
    }
    const row = this.getRowAt(index)
    return row ? this._resolveRowId(row, index) : undefined
  }

  /**
   * Возвращает текущий физический индекс строки по id.
   */
  getRowIndex(id: DataTableRowId): number | undefined {
    return this._locationById.get(id)
  }

  /**
   * Возвращает значение ячейки.
   */
  getCell(rowId: DataTableRowId, columnId: string): unknown {
    return this.getRow(rowId)?.[columnId]
  }

  /**
   * Полностью заменяет in-memory строки.
   */
  setRows(rows: Array<Row>): void {
    this._pages.clear()
    this._rowById.clear()
    this._locationById.clear()
    this._denseRows = rows.slice()
    this._estimatedRowCount = rows.length

    this._denseRows.forEach((row, index) => {
      const id = this._resolveRowId(row, index)
      this._rowById.set(id, row)
      this._locationById.set(id, index)
    })
    this._markStructuralDirty()
    this._bumpData(true)
  }

  /**
   * Заменяет диапазон строк с указанного индекса.
   */
  replaceRange(start: number, rows: Array<Row>): void {
    const safeStart = Math.max(0, Math.floor(start))
    if (this._denseRows) {
      const previousCount = this._estimatedRowCount
      rows.forEach((row, offset) => this._placeDenseRow(safeStart + offset, row))
      this._estimatedRowCount = Math.max(this._estimatedRowCount, safeStart + rows.length)
      if (this._estimatedRowCount !== previousCount) {
        this._denseRows.length = this._estimatedRowCount
        this._markStructuralDirty()
      }
      this._bumpData(this._estimatedRowCount !== previousCount)
      return
    }

    rows.forEach((row, offset) => this._placeRow(safeStart + offset, row))
    const previousCount = this._estimatedRowCount
    this._estimatedRowCount = Math.max(this._estimatedRowCount, safeStart + rows.length)
    if (this._estimatedRowCount !== previousCount) {
      this._markStructuralDirty()
    }
    this._bumpData(this._estimatedRowCount !== previousCount)
  }

  /**
   * Вставляет строку в указанную позицию или в конец.
   */
  insert(row: Row, index = this.rowCount): void {
    this.insertMany([row], index)
  }

  /**
   * Вставляет несколько строк в указанную позицию или в конец.
   */
  insertMany(rows: Array<Row>, index = this.rowCount): void {
    if (rows.length === 0) {
      return
    }

    const safeIndex = clampInteger(index, 0, this.rowCount)
    if (this._denseRows) {
      this._denseRows.splice(safeIndex, 0, ...rows)
      rows.forEach((row, offset) => {
        const rowId = this._resolveRowId(row, safeIndex + offset)
        this._rowById.set(rowId, row)
        this._markDirtyRow(rowId)
      })
      this._estimatedRowCount = this._denseRows.length
      this._reindexDenseLocations(safeIndex)
      this._markStructuralDirty()
      this._bumpData(true)
      return
    }

    const shifted = this._loadedEntries()
      .map(entry => entry.index >= safeIndex ? { ...entry, index: entry.index + rows.length } : entry)
    rows.forEach((row, offset) => {
      shifted.push({
        index: safeIndex + offset,
        row,
        rowId: this._resolveRowId(row, safeIndex + offset),
      })
    })
    this._reindexLoadedEntries(shifted)
    this._estimatedRowCount += rows.length
    this._markStructuralDirty()
    this._bumpData(true)
  }

  /**
   * Перемещает загруженную строку в новый физический индекс.
   */
  move(rowId: DataTableRowId, toIndex: number): void {
    const location = this._locationById.get(rowId)
    const row = this._rowById.get(rowId)
    if (location === undefined || !row) {
      return
    }

    const fromIndex = location
    const safeTo = clampInteger(toIndex, 0, Math.max(0, this.rowCount - 1))
    if (fromIndex === safeTo) {
      return
    }

    if (this._denseRows) {
      const [movedRow] = this._denseRows.splice(fromIndex, 1)
      if (movedRow) {
        this._denseRows.splice(safeTo, 0, movedRow)
        this._reindexDenseLocations(Math.min(fromIndex, safeTo))
      }
      this._markStructuralDirty()
      this._bumpData(true)
      return
    }

    const shifted = this._loadedEntries().map((entry) => {
      if (entry.rowId === rowId) {
        return { ...entry, index: safeTo }
      }
      if (fromIndex < safeTo && entry.index > fromIndex && entry.index <= safeTo) {
        return { ...entry, index: entry.index - 1 }
      }
      if (fromIndex > safeTo && entry.index >= safeTo && entry.index < fromIndex) {
        return { ...entry, index: entry.index + 1 }
      }
      return entry
    })
    this._reindexLoadedEntries(shifted)
    this._markStructuralDirty()
    this._bumpData(true)
  }

  /**
   * Частично обновляет загруженную строку.
   */
  patch(rowId: DataTableRowId, patch: Partial<Row>): void {
    const row = this._rowById.get(rowId)
    if (!row) {
      return
    }

    let changed = false
    for (const columnId in patch) {
      row[columnId as keyof Row] = patch[columnId] as Row[keyof Row]
      this._markDirtyCell(rowId, columnId)
      changed = true
    }
    if (!changed) {
      return
    }
    this._markDirtyRow(rowId)
    this._bumpData(false)
  }

  /**
   * Обновляет значение одной ячейки.
   */
  setCell(rowId: DataTableRowId, columnId: string, value: unknown): void {
    const row = this._rowById.get(rowId)
    if (!row) {
      return
    }

    row[columnId as keyof Row] = value as Row[keyof Row]
    this._markDirtyRow(rowId)
    this._markDirtyCell(rowId, columnId)
    this._bumpData(false)
  }

  /**
   * Удаляет строку по id.
   */
  remove(rowId: DataTableRowId): void {
    this.removeMany([rowId])
  }

  /**
   * Удаляет несколько строк по id.
   */
  removeMany(rowIds: Array<DataTableRowId>): void {
    if (rowIds.length === 0) {
      return
    }

    const removeSet = new Set(rowIds)
    const removedIndexes = rowIds
      .map(id => this._locationById.get(id))
      .filter((index): index is number => index !== undefined)
      .sort((a, b) => a - b)
    if (this._denseRows) {
      if (removedIndexes.length === 0) {
        return
      }
      for (let index = removedIndexes.length - 1; index >= 0; index -= 1) {
        const rowIndex = removedIndexes[index]!
        const row = this._denseRows[rowIndex]
        const rowId = row ? this._resolveRowId(row, rowIndex) : undefined
        if (rowId !== undefined) {
          this._rowById.delete(rowId)
          this._locationById.delete(rowId)
          this._dirtyRows.delete(rowId)
          this._dirtyCells.delete(rowId)
        }
        this._denseRows.splice(rowIndex, 1)
      }
      this._estimatedRowCount = this._denseRows.length
      this._reindexDenseLocations(removedIndexes[0] ?? 0)
      this._markStructuralDirty()
      this._bumpData(true)
      return
    }

    if (removedIndexes.length === 0) {
      this._estimatedRowCount = Math.max(0, this._estimatedRowCount - rowIds.length)
      this._markStructuralDirty()
      this._bumpData(true)
      return
    }

    const remaining = this._loadedEntries()
      .filter(entry => !removeSet.has(entry.rowId))
      .map(entry => ({
        ...entry,
        index: entry.index - countLessThan(removedIndexes, entry.index),
      }))
    this._reindexLoadedEntries(remaining)
    this._estimatedRowCount = Math.max(0, this._estimatedRowCount - rowIds.length)
    for (const id of rowIds) {
      this._dirtyRows.delete(id)
      this._dirtyCells.delete(id)
    }
    this._markStructuralDirty()
    this._bumpData(true)
  }

  /**
   * Применяет SSE/delta batch с coalescing патчей и ячеек.
   */
  applyDeltaBatch(deltas: DataTableDelta<Row> | Array<DataTableDelta<Row>>): void {
    const items = Array.isArray(deltas) ? deltas : [deltas]
    if (items.length === 0) {
      return
    }

    const patches = new Map<DataTableRowId, Partial<Row>>()
    const flushPatches = (): void => {
      if (patches.size === 0) {
        return
      }
      for (const [rowId, patch] of patches) {
        this.patch(rowId, patch)
      }
      patches.clear()
    }

    this.batch(() => {
      for (const delta of items) {
        if (delta.type === 'patch') {
          const patch = patches.get(delta.rowId) ?? {}
          Object.assign(patch, delta.patch)
          patches.set(delta.rowId, patch)
        }
        else if (delta.type === 'setCell') {
          const patch = patches.get(delta.rowId) ?? {}
          ;(patch as Record<string, unknown>)[delta.columnId] = delta.value
          patches.set(delta.rowId, patch)
        }
        else {
          flushPatches()
          if (delta.type === 'insert') {
            this.insertMany(delta.rows, delta.index)
          }
          else if (delta.type === 'remove') {
            this.removeMany(delta.rowIds)
          }
          else if (delta.type === 'move') {
            this.move(delta.rowId, delta.toIndex)
          }
          else if (delta.type === 'replaceRange') {
            this.replaceRange(delta.start, delta.rows)
          }
        }
      }
      flushPatches()
    })
  }

  /**
   * Возвращает и не очищает текущий dirty state.
   */
  getDirtyState(): DataTableDirtyState {
    return {
      pages: [...this._dirtyPages].sort((a, b) => a - b),
      rows: [...this._dirtyRows],
      cells: this._resolveDirtyCells(),
      structural: this._structuralDirty,
      summary: this._summaryDirty,
      revision: this._revision,
      dataRevision: this._dataRevision,
      structureRevision: this._structureRevision,
    }
  }

  /**
   * Очищает dirty state после обработки runtime.
   */
  clearDirtyState(): void {
    this._dirtyPages.clear()
    this._dirtyRows.clear()
    this._dirtyCells.clear()
    this._structuralDirty = false
    this._summaryDirty = false
  }

  /**
   * Гарантирует загрузку lazy range.
   */
  async ensureRange(range: DataTableRange, query?: DataTableQueryState, context?: DataTableSourceRequestContext): Promise<void> {
    if (!this._source?.loadRange) {
      return
    }

    const requestedStart = clampInteger(range.start, 0, this.rowCount)
    const requestedEnd = clampInteger(range.end, requestedStart, this.rowCount)
    const { start, end } = this._resolveSourceRange(requestedStart, requestedEnd)
    if (start === end) {
      return
    }
    if (this._isRangeLoaded(start, end)) {
      return
    }

    const key = `${start}:${end}:${JSON.stringify(query ?? {})}`
    const pending = this._pendingRanges.get(key)
    if (pending) {
      return pending
    }
    if (context) {
      this._latestRequestRevision = Math.max(this._latestRequestRevision, context.revision)
    }

    const promise = Promise.resolve(
      query === undefined
        ? this._source.loadRange({ start, end }, undefined, context)
        : this._source.loadRange({ start, end }, query, context),
    )
      .then((rows) => {
        if (context && context.revision < this._latestRequestRevision) {
          return undefined
        }
        if (Array.isArray(rows)) {
          this.replaceRange(start, rows)
        }
        return undefined
      })
      .finally(() => {
        this._pendingRanges.delete(key)
      })

    this._pendingRanges.set(key, promise)
    return promise
  }

  /**
   * Расширяет visible range до page-aligned окна для lazy stores.
   * Это коалесит scroll burst в один запрос страницы вместо exact-range запроса на каждый wheel event.
   */
  private _resolveSourceRange(start: number, end: number): DataTableRange {
    if (this.rowCount <= this._pageSize || end <= start) {
      return { start, end }
    }

    const pageStart = Math.floor(start / this._pageSize) * this._pageSize
    const pageEnd = Math.min(this.rowCount, Math.ceil(end / this._pageSize) * this._pageSize)
    return {
      start: pageStart,
      end: Math.min(this.rowCount, pageEnd + this._pageSize),
    }
  }

  /**
   * Загружает server-side summary для текущего query.
   */
  async loadSummary(query?: DataTableQueryState): Promise<Record<string, unknown> | undefined> {
    if (!this._source?.loadSummary) {
      return undefined
    }
    const summary = await this._source.loadSummary(query)
    return summary ?? undefined
  }

  /**
   * Загружает distinct filter values из server-side adapter.
   */
  async loadFilterValues(
    columnId: string,
    query?: DataTableQueryState,
    cursor?: string,
  ): Promise<{ values: Array<unknown>, cursor?: string, hasMore?: boolean } | undefined> {
    if (!this._source?.loadFilterValues) {
      return undefined
    }
    const result = await this._source.loadFilterValues(columnId, query, cursor)
    return result ?? undefined
  }

  /**
   * Делегирует поиск в lazy/source adapter.
   */
  async searchSource(
    search: DataTableSearchQuery,
    query?: DataTableQueryState,
    cursor?: string,
    direction?: DataTableSearchDirection,
  ): Promise<DataTableSearchResult | undefined> {
    if (!this._source?.search) {
      return undefined
    }
    const result = await this._source.search(search, query, cursor, direction)
    return result ?? undefined
  }

  /**
   * Делегирует resolve row index в lazy/source adapter.
   */
  async resolveSourceRowIndex(rowId: DataTableRowId, query?: DataTableQueryState): Promise<number | undefined> {
    return this._source?.resolveRowIndex?.(rowId, query)
  }

  /**
   * Подписывается на server-side deltas.
   */
  subscribe(
    query: DataTableQueryState,
    emitDelta: (delta: DataTableDelta<Row> | Array<DataTableDelta<Row>>) => void,
  ): (() => void) | void {
    return this._source?.subscribe?.(query, emitDelta)
  }

  /**
   * Выполняет несколько мутаций с одной ревизией.
   */
  batch(callback: (store: DataTableStoreApi<Row>) => void): void {
    this._batchDepth += 1
    try {
      callback(this)
    }
    finally {
      this._batchDepth -= 1
      if (this._batchDepth === 0) {
        this._flushBump()
      }
    }
  }

  /**
   * Возвращает текущую общую ревизию.
   */
  takeRevision(): number {
    return this._revision
  }

  /**
   * Возвращает ревизию данных.
   */
  takeDataRevision(): number {
    return this._dataRevision
  }

  /**
   * Возвращает структурную ревизию.
   */
  takeStructureRevision(): number {
    return this._structureRevision
  }

  /**
   * Помещает строку в конкретный индекс и обновляет id map.
   */
  private _placeRow(index: number, row: Row, options: { markDirty?: boolean } = {}): void {
    const id = this._resolveRowId(row, index)
    const previousId = this._readRowIdAt(index)
    if (previousId !== undefined && previousId !== id) {
      this._rowById.delete(previousId)
      this._locationById.delete(previousId)
    }

    const pageIndex = Math.floor(index / this._pageSize)
    const offset = index % this._pageSize
    const page = this._getPage(pageIndex, true)
    page.rows[offset] = row
    page.rowIds[offset] = id
    this._rowById.set(id, row)
    this._locationById.set(id, index)
    if (options.markDirty !== false) {
      this._dirtyPages.add(pageIndex)
      this._markDirtyRow(id)
    }
  }

  /**
   * Помещает строку в плотный in-memory storage.
   */
  private _placeDenseRow(index: number, row: Row): void {
    if (!this._denseRows) {
      return
    }

    const id = this._resolveRowId(row, index)
    const previous = this._denseRows[index]
    const previousId = previous ? this._resolveRowId(previous, index) : undefined
    if (previousId !== undefined && previousId !== id) {
      this._rowById.delete(previousId)
      this._locationById.delete(previousId)
    }

    this._denseRows[index] = row
    this._rowById.set(id, row)
    this._locationById.set(id, index)
    this._dirtyPages.add(Math.floor(index / this._pageSize))
    this._markDirtyRow(id)
  }

  /**
   * Пересобирает страницы только по загруженным строкам.
   */
  private _reindexLoadedEntries(entries: Array<LoadedEntry<Row>>): void {
    this._pages.clear()
    this._rowById.clear()
    this._locationById.clear()
    this._denseRows = null

    entries
      .sort((a, b) => a.index - b.index)
      .forEach(entry => this._placeRow(entry.index, entry.row))
  }

  /**
   * Возвращает загруженные строки с индексами.
   */
  private _loadedEntries(): Array<LoadedEntry<Row>> {
    if (this._denseRows) {
      return this._denseRows.map((row, index) => ({
        index,
        row,
        rowId: this._resolveRowId(row, index),
      }))
    }

    const entries: Array<LoadedEntry<Row>> = []
    for (const [pageIndex, page] of this._pages) {
      for (let offset = 0; offset < page.rows.length; offset += 1) {
        const row = page.rows[offset]
        const rowId = page.rowIds[offset]
        if (!row || rowId === undefined) {
          continue
        }
        entries.push({ index: pageIndex * this._pageSize + offset, row, rowId })
      }
    }
    return entries.sort((a, b) => a.index - b.index)
  }

  /**
   * Возвращает страницу.
   */
  private _getPage(pageIndex: number, create: true): DataTablePage<Row>
  /**
   * Возвращает значение состояния DataTableStore.
   */
  private _getPage(pageIndex: number, create?: false): DataTablePage<Row> | undefined
  /**
   * Возвращает значение состояния DataTableStore.
   */
  private _getPage(pageIndex: number, create = false): DataTablePage<Row> | undefined {
    let page = this._pages.get(pageIndex)
    if (!page && create) {
      page = { rows: [], rowIds: [] }
      this._pages.set(pageIndex, page)
    }
    return page
  }

  /**
   * Возвращает cached row.
   */
  private _readRowAt(index: number): Row | undefined {
    if (this._denseRows) {
      return this._denseRows[index]
    }
    const page = this._getPage(Math.floor(index / this._pageSize))
    return page?.rows[index % this._pageSize]
  }

  /**
   * Возвращает cached row id.
   */
  private _readRowIdAt(index: number): DataTableRowId | undefined {
    if (this._denseRows) {
      const row = this._denseRows[index]
      return row ? this._resolveRowId(row, index) : undefined
    }
    const page = this._getPage(Math.floor(index / this._pageSize))
    return page?.rowIds[index % this._pageSize]
  }

  /**
   * Вычисляет стабильный id строки.
   */
  private _resolveRowId(row: Row, index: number): DataTableRowId {
    if (typeof this._rowKey === 'function') {
      return this._rowKey(row, index)
    }
    return row[this._rowKey] as DataTableRowId
  }

  /**
   * Выполняет внутренний шаг reindexDenseLocations для DataTableStore.
   */
  private _reindexDenseLocations(start = 0): void {
    if (!this._denseRows) {
      return
    }

    for (let index = Math.max(0, start); index < this._denseRows.length; index += 1) {
      const row = this._denseRows[index]
      if (!row) {
        continue
      }
      this._locationById.set(this._resolveRowId(row, index), index)
    }
  }

  /**
   * Проверяет, загружен ли диапазон полностью.
   */
  private _isRangeLoaded(start: number, end: number): boolean {
    for (let index = start; index < end; index += 1) {
      if (this._readRowAt(index)) {
        continue
      }
      const sourceRow = this._source?.getRow?.(index)
      if (!sourceRow) {
        return false
      }
      this._placeRow(index, sourceRow, { markDirty: false })
    }
    return true
  }

  /**
   * Помечает строку грязной.
   */
  private _markDirtyRow(rowId: DataTableRowId): void {
    this._dirtyRows.add(rowId)
    const index = this._locationById.get(rowId)
    if (index !== undefined) {
      this._dirtyPages.add(Math.floor(index / this._pageSize))
    }
    this._summaryDirty = true
  }

  /**
   * Помечает ячейку грязной.
   */
  private _markDirtyCell(rowId: DataTableRowId, columnId: string): void {
    let columns = this._dirtyCells.get(rowId)
    if (!columns) {
      columns = new Set()
      this._dirtyCells.set(rowId, columns)
    }
    columns.add(columnId)
  }

  /**
   * Нормализует и возвращает итоговое значение DataTableStore.
   */
  private _resolveDirtyCells(): Array<DataTableDirtyCell> {
    const cells: Array<DataTableDirtyCell> = []
    for (const [rowId, columnIds] of this._dirtyCells) {
      for (const columnId of columnIds) {
        cells.push({ rowId, columnId })
      }
    }
    return cells
  }

  /**
   * Помечает структурные изменения.
   */
  private _markStructuralDirty(): void {
    this._structuralDirty = true
    this._summaryDirty = true
  }

  /**
   * Планирует bump ревизий.
   */
  private _bumpData(structural: boolean): void {
    this._pendingDataBump = true
    if (structural) {
      this._pendingStructureBump = true
    }
    if (this._batchDepth === 0) {
      this._flushBump()
    }
  }

  /**
   * Коммитит накопленные ревизии.
   */
  private _flushBump(): void {
    if (!this._pendingDataBump && !this._pendingStructureBump) {
      return
    }
    this._revision += 1
    if (this._pendingDataBump) {
      this._dataRevision += 1
    }
    if (this._pendingStructureBump) {
      this._structureRevision += 1
    }
    this._pendingDataBump = false
    this._pendingStructureBump = false
  }
}

/**
 * Создает публичный store таблицы.
 */
export function createDataTableStore<Row extends Record<string, any>>(
  options: DataTableStoreOptions<Row>,
): DataTableStore<Row> {
  return new DataTableStore(options)
}

function resolvePageSize(options: DataTableStoreOptions<any>['performance']): number {
  const size = options?.pageSize ?? 512
  return Math.max(32, Math.min(8192, Math.floor(Number.isFinite(size) ? size : 512)))
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(Number.isFinite(value) ? value : min)))
}

function countLessThan(sortedValues: Array<number>, value: number): number {
  let left = 0
  let right = sortedValues.length
  while (left < right) {
    const middle = (left + right) >> 1
    if (sortedValues[middle]! < value) {
      left = middle + 1
    }
    else { right = middle }
  }
  return left
}
