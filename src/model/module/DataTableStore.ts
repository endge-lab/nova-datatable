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
  private readonly rowKey: DataTableRowKey<Row>
  private readonly source?: DataTableLazySource<Row>
  private readonly pageSize: number
  private readonly pages = new Map<number, DataTablePage<Row>>()
  private readonly rowById = new Map<DataTableRowId, Row>()
  private readonly locationById = new Map<DataTableRowId, number>()
  private readonly pendingRanges = new Map<string, Promise<void>>()
  private denseRows: Array<Row> | null = null
  private readonly dirtyPages = new Set<number>()
  private readonly dirtyRows = new Set<DataTableRowId>()
  private readonly dirtyCells = new Map<DataTableRowId, Set<string>>()
  private revision = 0
  private dataRevision = 0
  private structureRevision = 0
  private batchDepth = 0
  private pendingDataBump = false
  private pendingStructureBump = false
  private structuralDirty = false
  private summaryDirty = false
  private estimatedRowCount = 0
  private latestRequestRevision = 0

  /**
   * Создает store с in-memory или lazy source.
   */
  constructor(options: DataTableStoreOptions<Row>) {
    this.rowKey = options.rowKey
    this.source = options.source
    this.pageSize = resolvePageSize(options.performance)
    this.estimatedRowCount = Math.max(
      options.estimateRowCount ?? 0,
      options.source?.rowCount ?? 0,
      options.rows?.length ?? 0,
    )

    if (options.rows) this.setRows(options.rows)
  }

  /**
   * Возвращает логическое количество строк.
   */
  get rowCount(): number {
    return Math.max(this.estimatedRowCount, this.source?.rowCount ?? 0)
  }

  /**
   * Возвращает количество реально загруженных строк.
   */
  get loadedRowCount(): number {
    return this.denseRows?.length ?? this.rowById.size
  }

  /**
   * Возвращает загруженные строки плотным массивом.
   */
  getRows(): Array<Row> {
    if (this.denseRows) return [...this.denseRows]
    return this.loadedEntries().map(entry => entry.row)
  }

  /**
   * Возвращает строку по id.
   */
  getRow(id: DataTableRowId): Row | undefined {
    return this.rowById.get(id)
  }

  /**
   * Возвращает строку по индексу.
   */
  getRowAt(index: number): Row | undefined {
    if (index < 0 || index >= this.rowCount) return undefined
    if (this.denseRows) return this.denseRows[index]

    const current = this.readRowAt(index)
    if (current) return current

    const sourceRow = this.source?.getRow?.(index)
    if (sourceRow) {
      this.placeRow(index, sourceRow, { markDirty: false })
    }
    return sourceRow
  }

  /**
   * Возвращает id строки по индексу.
   */
  getRowIdAt(index: number): DataTableRowId | undefined {
    if (this.denseRows) {
      const row = this.denseRows[index]
      return row ? this.resolveRowId(row, index) : undefined
    }
    const cached = this.readRowIdAt(index)
    if (cached !== undefined) return cached
    const row = this.getRowAt(index)
    return row ? this.resolveRowId(row, index) : undefined
  }

  /**
   * Возвращает текущий физический индекс строки по id.
   */
  getRowIndex(id: DataTableRowId): number | undefined {
    return this.locationById.get(id)
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
    this.pages.clear()
    this.rowById.clear()
    this.locationById.clear()
    this.denseRows = rows.slice()
    this.estimatedRowCount = rows.length

    this.denseRows.forEach((row, index) => {
      const id = this.resolveRowId(row, index)
      this.rowById.set(id, row)
      this.locationById.set(id, index)
    })
    this.markStructuralDirty()
    this.bumpData(true)
  }

  /**
   * Заменяет диапазон строк с указанного индекса.
   */
  replaceRange(start: number, rows: Array<Row>): void {
    const safeStart = Math.max(0, Math.floor(start))
    if (this.denseRows) {
      const previousCount = this.estimatedRowCount
      rows.forEach((row, offset) => this.placeDenseRow(safeStart + offset, row))
      this.estimatedRowCount = Math.max(this.estimatedRowCount, safeStart + rows.length)
      if (this.estimatedRowCount !== previousCount) {
        this.denseRows.length = this.estimatedRowCount
        this.markStructuralDirty()
      }
      this.bumpData(this.estimatedRowCount !== previousCount)
      return
    }

    rows.forEach((row, offset) => this.placeRow(safeStart + offset, row))
    const previousCount = this.estimatedRowCount
    this.estimatedRowCount = Math.max(this.estimatedRowCount, safeStart + rows.length)
    if (this.estimatedRowCount !== previousCount) this.markStructuralDirty()
    this.bumpData(this.estimatedRowCount !== previousCount)
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
    if (rows.length === 0) return

    const safeIndex = clampInteger(index, 0, this.rowCount)
    if (this.denseRows) {
      this.denseRows.splice(safeIndex, 0, ...rows)
      rows.forEach((row, offset) => {
        const rowId = this.resolveRowId(row, safeIndex + offset)
        this.rowById.set(rowId, row)
        this.markDirtyRow(rowId)
      })
      this.estimatedRowCount = this.denseRows.length
      this.reindexDenseLocations(safeIndex)
      this.markStructuralDirty()
      this.bumpData(true)
      return
    }

    const shifted = this.loadedEntries()
      .map(entry => entry.index >= safeIndex ? { ...entry, index: entry.index + rows.length } : entry)
    rows.forEach((row, offset) => {
      shifted.push({
        index: safeIndex + offset,
        row,
        rowId: this.resolveRowId(row, safeIndex + offset),
      })
    })
    this.reindexLoadedEntries(shifted)
    this.estimatedRowCount += rows.length
    this.markStructuralDirty()
    this.bumpData(true)
  }

  /**
   * Перемещает загруженную строку в новый физический индекс.
   */
  move(rowId: DataTableRowId, toIndex: number): void {
    const location = this.locationById.get(rowId)
    const row = this.rowById.get(rowId)
    if (location === undefined || !row) return

    const fromIndex = location
    const safeTo = clampInteger(toIndex, 0, Math.max(0, this.rowCount - 1))
    if (fromIndex === safeTo) return

    if (this.denseRows) {
      const [movedRow] = this.denseRows.splice(fromIndex, 1)
      if (movedRow) {
        this.denseRows.splice(safeTo, 0, movedRow)
        this.reindexDenseLocations(Math.min(fromIndex, safeTo))
      }
      this.markStructuralDirty()
      this.bumpData(true)
      return
    }

    const shifted = this.loadedEntries().map(entry => {
      if (entry.rowId === rowId) return { ...entry, index: safeTo }
      if (fromIndex < safeTo && entry.index > fromIndex && entry.index <= safeTo) return { ...entry, index: entry.index - 1 }
      if (fromIndex > safeTo && entry.index >= safeTo && entry.index < fromIndex) return { ...entry, index: entry.index + 1 }
      return entry
    })
    this.reindexLoadedEntries(shifted)
    this.markStructuralDirty()
    this.bumpData(true)
  }

  /**
   * Частично обновляет загруженную строку.
   */
  patch(rowId: DataTableRowId, patch: Partial<Row>): void {
    const row = this.rowById.get(rowId)
    if (!row) return

    let changed = false
    for (const columnId in patch) {
      row[columnId as keyof Row] = patch[columnId] as Row[keyof Row]
      this.markDirtyCell(rowId, columnId)
      changed = true
    }
    if (!changed) return
    this.markDirtyRow(rowId)
    this.bumpData(false)
  }

  /**
   * Обновляет значение одной ячейки.
   */
  setCell(rowId: DataTableRowId, columnId: string, value: unknown): void {
    const row = this.rowById.get(rowId)
    if (!row) return

    row[columnId as keyof Row] = value as Row[keyof Row]
    this.markDirtyRow(rowId)
    this.markDirtyCell(rowId, columnId)
    this.bumpData(false)
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
    if (rowIds.length === 0) return

    const removeSet = new Set(rowIds)
    const removedIndexes = rowIds
      .map(id => this.locationById.get(id))
      .filter((index): index is number => index !== undefined)
      .sort((a, b) => a - b)
    if (this.denseRows) {
      if (removedIndexes.length === 0) return
      for (let index = removedIndexes.length - 1; index >= 0; index -= 1) {
        const rowIndex = removedIndexes[index]!
        const row = this.denseRows[rowIndex]
        const rowId = row ? this.resolveRowId(row, rowIndex) : undefined
        if (rowId !== undefined) {
          this.rowById.delete(rowId)
          this.locationById.delete(rowId)
          this.dirtyRows.delete(rowId)
          this.dirtyCells.delete(rowId)
        }
        this.denseRows.splice(rowIndex, 1)
      }
      this.estimatedRowCount = this.denseRows.length
      this.reindexDenseLocations(removedIndexes[0] ?? 0)
      this.markStructuralDirty()
      this.bumpData(true)
      return
    }

    if (removedIndexes.length === 0) {
      this.estimatedRowCount = Math.max(0, this.estimatedRowCount - rowIds.length)
      this.markStructuralDirty()
      this.bumpData(true)
      return
    }

    const remaining = this.loadedEntries()
      .filter(entry => !removeSet.has(entry.rowId))
      .map(entry => ({
        ...entry,
        index: entry.index - countLessThan(removedIndexes, entry.index),
      }))
    this.reindexLoadedEntries(remaining)
    this.estimatedRowCount = Math.max(0, this.estimatedRowCount - rowIds.length)
    for (const id of rowIds) {
      this.dirtyRows.delete(id)
      this.dirtyCells.delete(id)
    }
    this.markStructuralDirty()
    this.bumpData(true)
  }

  /**
   * Применяет SSE/delta batch с coalescing патчей и ячеек.
   */
  applyDeltaBatch(deltas: DataTableDelta<Row> | Array<DataTableDelta<Row>>): void {
    const items = Array.isArray(deltas) ? deltas : [deltas]
    if (items.length === 0) return

    const patches = new Map<DataTableRowId, Partial<Row>>()
    const flushPatches = (): void => {
      if (patches.size === 0) return
      for (const [rowId, patch] of patches) this.patch(rowId, patch)
      patches.clear()
    }

    this.batch(() => {
      for (const delta of items) {
        if (delta.type === 'patch') {
          const patch = patches.get(delta.rowId) ?? {}
          Object.assign(patch, delta.patch)
          patches.set(delta.rowId, patch)
        } else if (delta.type === 'setCell') {
          const patch = patches.get(delta.rowId) ?? {}
          ;(patch as Record<string, unknown>)[delta.columnId] = delta.value
          patches.set(delta.rowId, patch)
        } else {
          flushPatches()
          if (delta.type === 'insert') this.insertMany(delta.rows, delta.index)
          else if (delta.type === 'remove') this.removeMany(delta.rowIds)
          else if (delta.type === 'move') this.move(delta.rowId, delta.toIndex)
          else if (delta.type === 'replaceRange') this.replaceRange(delta.start, delta.rows)
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
      pages: [...this.dirtyPages].sort((a, b) => a - b),
      rows: [...this.dirtyRows],
      cells: this.resolveDirtyCells(),
      structural: this.structuralDirty,
      summary: this.summaryDirty,
      revision: this.revision,
      dataRevision: this.dataRevision,
      structureRevision: this.structureRevision,
    }
  }

  /**
   * Очищает dirty state после обработки runtime.
   */
  clearDirtyState(): void {
    this.dirtyPages.clear()
    this.dirtyRows.clear()
    this.dirtyCells.clear()
    this.structuralDirty = false
    this.summaryDirty = false
  }

  /**
   * Гарантирует загрузку lazy range.
   */
  async ensureRange(range: DataTableRange, query?: DataTableQueryState, context?: DataTableSourceRequestContext): Promise<void> {
    if (!this.source?.loadRange) return

    const requestedStart = clampInteger(range.start, 0, this.rowCount)
    const requestedEnd = clampInteger(range.end, requestedStart, this.rowCount)
    const { start, end } = this.resolveSourceRange(requestedStart, requestedEnd)
    if (start === end) return
    if (this.isRangeLoaded(start, end)) return

    const key = `${start}:${end}:${JSON.stringify(query ?? {})}`
    const pending = this.pendingRanges.get(key)
    if (pending) return pending
    if (context) this.latestRequestRevision = Math.max(this.latestRequestRevision, context.revision)

    const promise = Promise.resolve(
      query === undefined
        ? this.source.loadRange({ start, end }, undefined, context)
        : this.source.loadRange({ start, end }, query, context),
    )
      .then(rows => {
        if (context && context.revision < this.latestRequestRevision) return undefined
        if (Array.isArray(rows)) this.replaceRange(start, rows)
        return undefined
      })
      .finally(() => {
        this.pendingRanges.delete(key)
      })

    this.pendingRanges.set(key, promise)
    return promise
  }

  /**
   * Расширяет visible range до page-aligned окна для lazy stores.
   * Это коалесит scroll burst в один запрос страницы вместо exact-range запроса на каждый wheel event.
   */
  private resolveSourceRange(start: number, end: number): DataTableRange {
    if (this.rowCount <= this.pageSize || end <= start) return { start, end }

    const pageStart = Math.floor(start / this.pageSize) * this.pageSize
    const pageEnd = Math.min(this.rowCount, Math.ceil(end / this.pageSize) * this.pageSize)
    return {
      start: pageStart,
      end: Math.min(this.rowCount, pageEnd + this.pageSize),
    }
  }

  /**
   * Загружает server-side summary для текущего query.
   */
  async loadSummary(query?: DataTableQueryState): Promise<Record<string, unknown> | undefined> {
    if (!this.source?.loadSummary) return undefined
    const summary = await this.source.loadSummary(query)
    return summary ?? undefined
  }

  /**
   * Загружает distinct filter values из server-side adapter.
   */
  async loadFilterValues(
    columnId: string,
    query?: DataTableQueryState,
    cursor?: string,
  ): Promise<{ values: Array<unknown>; cursor?: string; hasMore?: boolean } | undefined> {
    if (!this.source?.loadFilterValues) return undefined
    const result = await this.source.loadFilterValues(columnId, query, cursor)
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
    if (!this.source?.search) return undefined
    const result = await this.source.search(search, query, cursor, direction)
    return result ?? undefined
  }

  /**
   * Делегирует resolve row index в lazy/source adapter.
   */
  async resolveSourceRowIndex(rowId: DataTableRowId, query?: DataTableQueryState): Promise<number | undefined> {
    return this.source?.resolveRowIndex?.(rowId, query)
  }

  /**
   * Подписывается на server-side deltas.
   */
  subscribe(
    query: DataTableQueryState,
    emitDelta: (delta: DataTableDelta<Row> | Array<DataTableDelta<Row>>) => void,
  ): (() => void) | void {
    return this.source?.subscribe?.(query, emitDelta)
  }

  /**
   * Выполняет несколько мутаций с одной ревизией.
   */
  batch(callback: (store: DataTableStoreApi<Row>) => void): void {
    this.batchDepth += 1
    try {
      callback(this)
    } finally {
      this.batchDepth -= 1
      if (this.batchDepth === 0) this.flushBump()
    }
  }

  /**
   * Возвращает текущую общую ревизию.
   */
  takeRevision(): number {
    return this.revision
  }

  /**
   * Возвращает ревизию данных.
   */
  takeDataRevision(): number {
    return this.dataRevision
  }

  /**
   * Возвращает структурную ревизию.
   */
  takeStructureRevision(): number {
    return this.structureRevision
  }

  /**
   * Помещает строку в конкретный индекс и обновляет id map.
   */
  private placeRow(index: number, row: Row, options: { markDirty?: boolean } = {}): void {
    const id = this.resolveRowId(row, index)
    const previousId = this.readRowIdAt(index)
    if (previousId !== undefined && previousId !== id) {
      this.rowById.delete(previousId)
      this.locationById.delete(previousId)
    }

    const pageIndex = Math.floor(index / this.pageSize)
    const offset = index % this.pageSize
    const page = this.getPage(pageIndex, true)
    page.rows[offset] = row
    page.rowIds[offset] = id
    this.rowById.set(id, row)
    this.locationById.set(id, index)
    if (options.markDirty !== false) {
      this.dirtyPages.add(pageIndex)
      this.markDirtyRow(id)
    }
  }

  /**
   * Помещает строку в плотный in-memory storage.
   */
  private placeDenseRow(index: number, row: Row): void {
    if (!this.denseRows) return

    const id = this.resolveRowId(row, index)
    const previous = this.denseRows[index]
    const previousId = previous ? this.resolveRowId(previous, index) : undefined
    if (previousId !== undefined && previousId !== id) {
      this.rowById.delete(previousId)
      this.locationById.delete(previousId)
    }

    this.denseRows[index] = row
    this.rowById.set(id, row)
    this.locationById.set(id, index)
    this.dirtyPages.add(Math.floor(index / this.pageSize))
    this.markDirtyRow(id)
  }

  /**
   * Пересобирает страницы только по загруженным строкам.
   */
  private reindexLoadedEntries(entries: Array<LoadedEntry<Row>>): void {
    this.pages.clear()
    this.rowById.clear()
    this.locationById.clear()
    this.denseRows = null

    entries
      .sort((a, b) => a.index - b.index)
      .forEach(entry => this.placeRow(entry.index, entry.row))
  }

  /**
   * Возвращает загруженные строки с индексами.
   */
  private loadedEntries(): Array<LoadedEntry<Row>> {
    if (this.denseRows) {
      return this.denseRows.map((row, index) => ({
        index,
        row,
        rowId: this.resolveRowId(row, index),
      }))
    }

    const entries: Array<LoadedEntry<Row>> = []
    for (const [pageIndex, page] of this.pages) {
      for (let offset = 0; offset < page.rows.length; offset += 1) {
        const row = page.rows[offset]
        const rowId = page.rowIds[offset]
        if (!row || rowId === undefined) continue
        entries.push({ index: pageIndex * this.pageSize + offset, row, rowId })
      }
    }
    return entries.sort((a, b) => a.index - b.index)
  }

  /**
   * Возвращает страницу.
   */
  private getPage(pageIndex: number, create: true): DataTablePage<Row>
  /**
   * Возвращает значение состояния DataTableStore.
   */
  private getPage(pageIndex: number, create?: false): DataTablePage<Row> | undefined
  /**
   * Возвращает значение состояния DataTableStore.
   */
  private getPage(pageIndex: number, create = false): DataTablePage<Row> | undefined {
    let page = this.pages.get(pageIndex)
    if (!page && create) {
      page = { rows: [], rowIds: [] }
      this.pages.set(pageIndex, page)
    }
    return page
  }

  /**
   * Возвращает cached row.
   */
  private readRowAt(index: number): Row | undefined {
    if (this.denseRows) return this.denseRows[index]
    const page = this.getPage(Math.floor(index / this.pageSize))
    return page?.rows[index % this.pageSize]
  }

  /**
   * Возвращает cached row id.
   */
  private readRowIdAt(index: number): DataTableRowId | undefined {
    if (this.denseRows) {
      const row = this.denseRows[index]
      return row ? this.resolveRowId(row, index) : undefined
    }
    const page = this.getPage(Math.floor(index / this.pageSize))
    return page?.rowIds[index % this.pageSize]
  }

  /**
   * Вычисляет стабильный id строки.
   */
  private resolveRowId(row: Row, index: number): DataTableRowId {
    if (typeof this.rowKey === 'function') return this.rowKey(row, index)
    return row[this.rowKey] as DataTableRowId
  }

  /**
   * Выполняет внутренний шаг reindexDenseLocations для DataTableStore.
   */
  private reindexDenseLocations(start = 0): void {
    if (!this.denseRows) return

    for (let index = Math.max(0, start); index < this.denseRows.length; index += 1) {
      const row = this.denseRows[index]
      if (!row) continue
      this.locationById.set(this.resolveRowId(row, index), index)
    }
  }

  /**
   * Проверяет, загружен ли диапазон полностью.
   */
  private isRangeLoaded(start: number, end: number): boolean {
    for (let index = start; index < end; index += 1) {
      if (this.readRowAt(index)) continue
      const sourceRow = this.source?.getRow?.(index)
      if (!sourceRow) return false
      this.placeRow(index, sourceRow, { markDirty: false })
    }
    return true
  }

  /**
   * Помечает строку грязной.
   */
  private markDirtyRow(rowId: DataTableRowId): void {
    this.dirtyRows.add(rowId)
    const index = this.locationById.get(rowId)
    if (index !== undefined) this.dirtyPages.add(Math.floor(index / this.pageSize))
    this.summaryDirty = true
  }

  /**
   * Помечает ячейку грязной.
   */
  private markDirtyCell(rowId: DataTableRowId, columnId: string): void {
    let columns = this.dirtyCells.get(rowId)
    if (!columns) {
      columns = new Set()
      this.dirtyCells.set(rowId, columns)
    }
    columns.add(columnId)
  }

  /**
   * Нормализует и возвращает итоговое значение DataTableStore.
   */
  private resolveDirtyCells(): Array<DataTableDirtyCell> {
    const cells: Array<DataTableDirtyCell> = []
    for (const [rowId, columnIds] of this.dirtyCells) {
      for (const columnId of columnIds) cells.push({ rowId, columnId })
    }
    return cells
  }

  /**
   * Помечает структурные изменения.
   */
  private markStructuralDirty(): void {
    this.structuralDirty = true
    this.summaryDirty = true
  }

  /**
   * Планирует bump ревизий.
   */
  private bumpData(structural: boolean): void {
    this.pendingDataBump = true
    if (structural) this.pendingStructureBump = true
    if (this.batchDepth === 0) this.flushBump()
  }

  /**
   * Коммитит накопленные ревизии.
   */
  private flushBump(): void {
    if (!this.pendingDataBump && !this.pendingStructureBump) return
    this.revision += 1
    if (this.pendingDataBump) this.dataRevision += 1
    if (this.pendingStructureBump) this.structureRevision += 1
    this.pendingDataBump = false
    this.pendingStructureBump = false
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
    if (sortedValues[middle]! < value) left = middle + 1
    else right = middle
  }
  return left
}
