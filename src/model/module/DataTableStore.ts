import type {
  DataTableLazySource,
  DataTableRange,
  DataTableRowId,
  DataTableRowKey,
  DataTableStoreApi,
  DataTableStoreOptions,
} from '@/model/types/datatable.types'

/**
 * Хранит строки таблицы, lazy cache, id-index и батчевые мутации.
 */
export class DataTableStore<Row extends Record<string, any> = Record<string, any>>
implements DataTableStoreApi<Row> {
  private readonly rowKey: DataTableRowKey<Row>
  private readonly source?: DataTableLazySource<Row>
  private readonly rows: Array<Row | undefined> = []
  private readonly rowIds: Array<DataTableRowId | undefined> = []
  private readonly rowById = new Map<DataTableRowId, Row>()
  private readonly indexById = new Map<DataTableRowId, number>()
  private readonly pendingRanges = new Map<string, Promise<void>>()
  private revision = 0
  private batchDepth = 0
  private estimatedRowCount = 0

  /**
   * Создает store с in-memory или lazy source.
   */
  constructor(options: DataTableStoreOptions<Row>) {
    this.rowKey = options.rowKey
    this.source = options.source
    this.estimatedRowCount = Math.max(
      options.estimateRowCount ?? 0,
      options.source?.rowCount ?? 0,
      options.rows?.length ?? 0,
    )

    if (options.rows) {
      this.setRows(options.rows)
    } else if (this.estimatedRowCount > 0) {
      this.rows.length = this.estimatedRowCount
      this.rowIds.length = this.estimatedRowCount
    }
  }

  /**
   * Возвращает логическое количество строк.
   */
  get rowCount(): number {
    return Math.max(this.estimatedRowCount, this.rows.length, this.source?.rowCount ?? 0)
  }

  /**
   * Возвращает количество реально загруженных строк.
   */
  get loadedRowCount(): number {
    return this.rowById.size
  }

  /**
   * Возвращает загруженные строки плотным массивом.
   */
  getRows(): Array<Row> {
    return this.rows.filter((row): row is Row => row !== undefined)
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

    const current = this.rows[index]
    if (current) return current

    const sourceRow = this.source?.getRow?.(index)
    if (sourceRow) {
      this.placeRow(index, sourceRow)
      this.bump()
    }
    return sourceRow
  }

  /**
   * Возвращает id строки по индексу.
   */
  getRowIdAt(index: number): DataTableRowId | undefined {
    const id = this.rowIds[index]
    if (id !== undefined) return id
    const row = this.getRowAt(index)
    return row ? this.resolveRowId(row, index) : undefined
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
    this.rows.length = 0
    this.rowIds.length = 0
    this.rowById.clear()
    this.indexById.clear()
    this.estimatedRowCount = rows.length

    rows.forEach((row, index) => this.placeRow(index, row))
    this.bump()
  }

  /**
   * Заменяет диапазон строк с указанного индекса.
   */
  replaceRange(start: number, rows: Array<Row>): void {
    const safeStart = Math.max(0, Math.floor(start))
    rows.forEach((row, offset) => this.placeRow(safeStart + offset, row))
    this.estimatedRowCount = Math.max(this.estimatedRowCount, safeStart + rows.length)
    this.bump()
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

    const safeIndex = Math.max(0, Math.min(this.rowCount, Math.floor(index)))
    this.rows.splice(safeIndex, 0, ...rows)
    this.rowIds.splice(safeIndex, 0, ...rows.map((row, offset) => this.resolveRowId(row, safeIndex + offset)))
    this.rebuildIndexes()
    this.estimatedRowCount = Math.max(this.estimatedRowCount + rows.length, this.rows.length)
    this.bump()
  }

  /**
   * Частично обновляет загруженную строку.
   */
  patch(rowId: DataTableRowId, patch: Partial<Row>): void {
    const row = this.rowById.get(rowId)
    if (!row) return

    Object.assign(row, patch)
    this.bump()
  }

  /**
   * Обновляет значение одной ячейки.
   */
  setCell(rowId: DataTableRowId, columnId: string, value: unknown): void {
    const row = this.rowById.get(rowId)
    if (!row) return

    row[columnId as keyof Row] = value as Row[keyof Row]
    this.bump()
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

    const ids = new Set(rowIds)
    for (let index = this.rows.length - 1; index >= 0; index -= 1) {
      const id = this.rowIds[index]
      if (id !== undefined && ids.has(id)) {
        this.rows.splice(index, 1)
        this.rowIds.splice(index, 1)
      }
    }
    this.rebuildIndexes()
    this.estimatedRowCount = Math.max(0, this.estimatedRowCount - rowIds.length)
    this.bump()
  }

  /**
   * Гарантирует загрузку lazy range.
   */
  async ensureRange(range: DataTableRange): Promise<void> {
    if (!this.source?.loadRange) return

    const start = clampInteger(range.start, 0, this.rowCount)
    const end = clampInteger(range.end, start, this.rowCount)
    if (this.isRangeLoaded(start, end)) return

    const key = `${start}:${end}`
    const pending = this.pendingRanges.get(key)
    if (pending) return pending

    const promise = Promise.resolve(this.source.loadRange({ start, end }))
      .then(rows => {
        if (Array.isArray(rows)) this.replaceRange(start, rows)
      })
      .finally(() => {
        this.pendingRanges.delete(key)
      })

    this.pendingRanges.set(key, promise)
    return promise
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
      if (this.batchDepth === 0) this.bump()
    }
  }

  /**
   * Возвращает текущую ревизию данных.
   */
  takeRevision(): number {
    return this.revision
  }

  /**
   * Помещает строку в конкретный индекс и обновляет id map.
   */
  private placeRow(index: number, row: Row): void {
    const id = this.resolveRowId(row, index)
    const previousId = this.rowIds[index]
    if (previousId !== undefined) {
      this.rowById.delete(previousId)
      this.indexById.delete(previousId)
    }

    this.rows[index] = row
    this.rowIds[index] = id
    this.rowById.set(id, row)
    this.indexById.set(id, index)
  }

  /**
   * Пересобирает id-index после структурных операций.
   */
  private rebuildIndexes(): void {
    this.rowById.clear()
    this.indexById.clear()

    for (let index = 0; index < this.rows.length; index += 1) {
      const row = this.rows[index]
      if (!row) continue
      const id = this.resolveRowId(row, index)
      this.rowIds[index] = id
      this.rowById.set(id, row)
      this.indexById.set(id, index)
    }
  }

  /**
   * Вычисляет стабильный id строки.
   */
  private resolveRowId(row: Row, index: number): DataTableRowId {
    if (typeof this.rowKey === 'function') return this.rowKey(row, index)
    return row[this.rowKey] as DataTableRowId
  }

  /**
   * Проверяет, загружен ли диапазон полностью.
   */
  private isRangeLoaded(start: number, end: number): boolean {
    for (let index = start; index < end; index += 1) {
      if (!this.rows[index] && !this.source?.getRow?.(index)) return false
    }
    return true
  }

  /**
   * Поднимает ревизию вне вложенного batch.
   */
  private bump(): void {
    if (this.batchDepth > 0) return
    this.revision += 1
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

function clampInteger(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(Number.isFinite(value) ? value : min)))
}
