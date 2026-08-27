import type {
  DataTableCommitSource,
  DataTableDelta,
  DataTableHistoryOptions,
  DataTableHistoryState,
  DataTableResolvedHistoryOptions,
  DataTableRowId,
  DataTableStoreApi,
  DataTableTransaction,
} from '@/model/types/datatable.types'

const DEFAULT_HISTORY_SOURCES: Array<DataTableCommitSource> = [
  'edit',
  'paste',
  'fill',
  'clear',
  'rowOrder',
  'columnState',
]

/**
 * Нормализует настройки transaction history.
 */
export function normalizeDataTableHistory(
  history: false | DataTableHistoryOptions | undefined,
): false | DataTableResolvedHistoryOptions {
  if (history === false) {
    return false
  }
  return {
    enabled: history?.enabled ?? true,
    maxEntries: Math.max(1, Math.floor(history?.maxEntries ?? 100)),
    mergeWindowMs: Math.max(0, Math.floor(history?.mergeWindowMs ?? 700)),
    include: normalizeHistorySources(history?.include),
  }
}

/**
 * Управляет undo/redo стеком без смешивания history со store.
 */
export class DataTableTransactionHistory<Row extends Record<string, any> = Record<string, any>> {
  private _undoStack: Array<DataTableTransaction<Row>> = []
  private _redoStack: Array<DataTableTransaction<Row>> = []
  private _idCounter = 0

  constructor(
    private readonly _store: DataTableStoreApi<Row>,
    private _options: false | DataTableResolvedHistoryOptions,
  ) {}

  /**
   * Обновляет настройки history без потери текущего стека.
   */
  configure(options: false | DataTableResolvedHistoryOptions): void {
    this._options = options
    if (options === false || !options.enabled) {
      this.clear()
    }
  }

  /**
   * Применяет deltas и, если включено, записывает обратимую transaction.
   */
  commit(
    deltas: DataTableDelta<Row> | Array<DataTableDelta<Row>>,
    options: { source: DataTableCommitSource, label?: string, record?: boolean, status?: DataTableTransaction<Row>['status'] },
  ): DataTableTransaction<Row> | null {
    const items = Array.isArray(deltas) ? deltas : [deltas]
    if (items.length === 0) {
      return null
    }

    const inverseDeltas = createInverseDataTableDeltas(this._store, items)
    this._store.applyDeltaBatch(items)

    if (!this._shouldRecord(options.source, options.record)) {
      return null
    }
    const transaction = this.createTransaction(items, inverseDeltas, options)
    this._push(transaction)
    return transaction
  }

  /**
   * Записывает уже примененную transaction.
   */
  record(transaction: DataTableTransaction<Row>): void {
    if (!this._shouldRecord(transaction.source, true)) {
      return
    }
    this._push(transaction)
  }

  /**
   * Откатывает последнюю transaction.
   */
  undo(): boolean {
    const transaction = this._undoStack.pop()
    if (!transaction) {
      return false
    }
    this._store.applyDeltaBatch(transaction.inverseDeltas)
    this._redoStack.push({ ...transaction, status: 'reverted' })
    return true
  }

  /**
   * Повторяет последнюю отмененную transaction.
   */
  redo(): boolean {
    const transaction = this._redoStack.pop()
    if (!transaction) {
      return false
    }
    this._store.applyDeltaBatch(transaction.deltas)
    this._undoStack.push({ ...transaction, status: 'committed' })
    return true
  }

  /**
   * Возвращает публичное состояние history.
   */
  state(): DataTableHistoryState<Row> {
    return {
      canUndo: this._undoStack.length > 0,
      canRedo: this._redoStack.length > 0,
      undoDepth: this._undoStack.length,
      redoDepth: this._redoStack.length,
      current: this._undoStack[this._undoStack.length - 1],
    }
  }

  /**
   * Проверяет возможность undo.
   */
  canUndo(): boolean {
    return this._undoStack.length > 0
  }

  /**
   * Проверяет возможность redo.
   */
  canRedo(): boolean {
    return this._redoStack.length > 0
  }

  /**
   * Очищает историю.
   */
  clear(): void {
    this._undoStack = []
    this._redoStack = []
  }

  /**
   * Создает transaction без применения к store.
   */
  createTransaction(
    deltas: Array<DataTableDelta<Row>>,
    inverseDeltas: Array<DataTableDelta<Row>>,
    options: { source: DataTableCommitSource, label?: string, status?: DataTableTransaction<Row>['status'] },
  ): DataTableTransaction<Row> {
    this._idCounter += 1
    return {
      id: `dt-tx-${this._idCounter}`,
      label: options.label,
      source: options.source,
      deltas: cloneDeltas(deltas),
      inverseDeltas: cloneDeltas(inverseDeltas),
      timestamp: Date.now(),
      status: options.status ?? 'committed',
    }
  }

  /**
   * Проверяет, нужно ли записывать источник в history.
   */
  private _shouldRecord(source: DataTableCommitSource, record: boolean | undefined): boolean {
    if (record === false || this._options === false || !this._options.enabled) {
      return false
    }
    return this._options.include.includes(source)
  }

  /**
   * Добавляет transaction с учетом лимита стека.
   */
  private _push(transaction: DataTableTransaction<Row>): void {
    this._undoStack.push(transaction)
    this._redoStack = []
    if (this._options !== false && this._undoStack.length > this._options.maxEntries) {
      this._undoStack.splice(0, this._undoStack.length - this._options.maxEntries)
    }
  }
}

/**
 * Строит обратные deltas до применения исходных изменений.
 */
export function createInverseDataTableDeltas<Row extends Record<string, any>>(
  store: DataTableStoreApi<Row>,
  deltas: Array<DataTableDelta<Row>>,
): Array<DataTableDelta<Row>> {
  const model = new DataTableInverseModel(store)
  const inverseGroups: Array<Array<DataTableDelta<Row>>> = []
  for (const delta of deltas) {
    inverseGroups.push(createInverseDeltaGroup(delta, model))
    model.apply(delta)
  }

  const inverse: Array<DataTableDelta<Row>> = []
  for (let index = inverseGroups.length - 1; index >= 0; index -= 1) {
    inverse.push(...cloneDeltas(inverseGroups[index] ?? []))
  }
  return inverse
}

class DataTableInverseModel<Row extends Record<string, any>> {
  private _order: Array<DataTableRowId> = []
  private readonly _rowsById = new Map<DataTableRowId, Row>()

  /**
   * Создает расчетную модель для inverse deltas из текущего store snapshot.
   */
  constructor(store: DataTableStoreApi<Row>) {
    for (let index = 0; index < store.rowCount; index += 1) {
      const rowId = store.getRowIdAt(index)
      if (rowId === undefined) {
        continue
      }
      const row = store.getRow(rowId) ?? store.getRowAt(index)
      this._order.push(rowId)
      if (row) {
        this._rowsById.set(rowId, cloneRow(row))
      }
    }
  }

  /**
   * Возвращает количество строк в расчетной модели.
   */
  get rowCount(): number {
    return this._order.length
  }

  /**
   * Возвращает строку по id.
   */
  getRow(rowId: DataTableRowId): Row | undefined {
    const row = this._rowsById.get(rowId)
    return row ? cloneRow(row) : undefined
  }

  /**
   * Возвращает строку по индексу.
   */
  getRowAt(index: number): Row | undefined {
    const rowId = this._order[index]
    return rowId === undefined ? undefined : this.getRow(rowId)
  }

  /**
   * Возвращает индекс строки по id.
   */
  getRowIndex(rowId: DataTableRowId): number | undefined {
    const index = this._order.indexOf(rowId)
    return index >= 0 ? index : undefined
  }

  /**
   * Возвращает значение ячейки по текущей расчетной модели.
   */
  getCell(rowId: DataTableRowId, columnId: string): unknown {
    return this._rowsById.get(rowId)?.[columnId]
  }

  /**
   * Вычисляет id строки для inserted/replaced deltas.
   */
  resolveRowId(row: Row, fallback: number): DataTableRowId {
    return resolveInsertedRowId(row, fallback)
  }

  /**
   * Применяет delta к расчетной модели перед обработкой следующего delta.
   */
  apply(delta: DataTableDelta<Row>): void {
    if (delta.type === 'setCell') {
      this._patchRow(delta.rowId, { [delta.columnId]: delta.value } as Partial<Row>)
    }
    else if (delta.type === 'patch') {
      this._patchRow(delta.rowId, delta.patch)
    }
    else if (delta.type === 'insert') {
      this._insertRows(delta.index, delta.rows)
    }
    else if (delta.type === 'remove') {
      this._removeRows(delta.rowIds)
    }
    else if (delta.type === 'move') {
      this._moveRow(delta.rowId, delta.toIndex)
    }
    else if (delta.type === 'replaceRange') {
      this._replaceRange(delta.start, delta.rows)
    }
  }

  private _patchRow(rowId: DataTableRowId, patch: Partial<Row>): void {
    const row = this._rowsById.get(rowId)
    if (!row) {
      return
    }
    this._rowsById.set(rowId, { ...row, ...patch })
  }

  private _insertRows(index: number | undefined, rows: Array<Row>): void {
    if (rows.length === 0) {
      return
    }
    const start = clampHistoryIndex(index ?? this._order.length, 0, this._order.length)
    const rowIds = rows.map((row, offset) => this.resolveRowId(row, start + offset))
    this._order.splice(start, 0, ...rowIds)
    rows.forEach((row, offset) => {
      this._rowsById.set(rowIds[offset]!, cloneRow(row))
    })
  }

  private _removeRows(rowIds: Array<DataTableRowId>): void {
    if (rowIds.length === 0) {
      return
    }
    const removeSet = new Set(rowIds)
    this._order = this._order.filter(rowId => !removeSet.has(rowId))
    for (const rowId of rowIds) {
      this._rowsById.delete(rowId)
    }
  }

  private _moveRow(rowId: DataTableRowId, toIndex: number): void {
    const fromIndex = this._order.indexOf(rowId)
    if (fromIndex < 0) {
      return
    }
    const [row] = this._order.splice(fromIndex, 1)
    if (row === undefined) {
      return
    }
    this._order.splice(clampHistoryIndex(toIndex, 0, this._order.length), 0, row)
  }

  private _replaceRange(start: number, rows: Array<Row>): void {
    if (rows.length === 0) {
      return
    }
    const safeStart = clampHistoryIndex(start, 0, this._order.length)
    const rowIds = rows.map((row, offset) => this.resolveRowId(row, safeStart + offset))
    const removed = this._order.splice(safeStart, rows.length, ...rowIds)
    for (const rowId of removed) {
      if (!this._order.includes(rowId)) {
        this._rowsById.delete(rowId)
      }
    }
    rows.forEach((row, offset) => {
      this._rowsById.set(rowIds[offset]!, cloneRow(row))
    })
  }
}

function createInverseDeltaGroup<Row extends Record<string, any>>(
  delta: DataTableDelta<Row>,
  model: DataTableInverseModel<Row>,
): Array<DataTableDelta<Row>> {
  if (delta.type === 'setCell') {
    return [{ type: 'setCell', rowId: delta.rowId, columnId: delta.columnId, value: model.getCell(delta.rowId, delta.columnId) }]
  }
  if (delta.type === 'patch') {
    const patch: Partial<Row> = {}
    for (const key of Object.keys(delta.patch)) {
      ;(patch as Record<string, unknown>)[key] = model.getCell(delta.rowId, key)
    }
    return [{ type: 'patch', rowId: delta.rowId, patch }]
  }
  if (delta.type === 'insert') {
    const start = clampHistoryIndex(delta.index ?? model.rowCount, 0, model.rowCount)
    const rowIds = delta.rows.map((row, rowIndex) => model.resolveRowId(row, start + rowIndex))
    return rowIds.length > 0 ? [{ type: 'remove', rowIds }] : []
  }
  if (delta.type === 'remove') {
    return createRemoveInverse(delta.rowIds, model)
  }
  if (delta.type === 'move') {
    const fromIndex = model.getRowIndex(delta.rowId)
    return fromIndex === undefined ? [] : [{ type: 'move', rowId: delta.rowId, toIndex: fromIndex }]
  }
  return createReplaceRangeInverse(delta, model)
}

function createRemoveInverse<Row extends Record<string, any>>(
  rowIds: Array<DataTableRowId>,
  model: DataTableInverseModel<Row>,
): Array<DataTableDelta<Row>> {
  const rows = rowIds
    .map((rowId) => {
      const row = model.getRow(rowId)
      const rowIndex = model.getRowIndex(rowId)
      return row && rowIndex !== undefined ? { row, rowIndex } : null
    })
    .filter((row): row is { row: Row, rowIndex: number } => !!row)
    .sort((first, second) => first.rowIndex - second.rowIndex)
  const inverse: Array<DataTableDelta<Row>> = []
  let group: { index: number, rows: Array<Row> } | null = null
  for (const row of rows) {
    if (!group || row.rowIndex !== group.index + group.rows.length) {
      if (group) {
        inverse.push({ type: 'insert', index: group.index, rows: group.rows.map(cloneRow) })
      }
      group = { index: row.rowIndex, rows: [row.row] }
    }
    else {
      group.rows.push(row.row)
    }
  }
  if (group) {
    inverse.push({ type: 'insert', index: group.index, rows: group.rows.map(cloneRow) })
  }
  return inverse
}

function createReplaceRangeInverse<Row extends Record<string, any>>(
  delta: Extract<DataTableDelta<Row>, { type: 'replaceRange' }>,
  model: DataTableInverseModel<Row>,
): Array<DataTableDelta<Row>> {
  const start = Math.max(0, Math.floor(delta.start))
  const previousCount = Math.max(0, Math.min(delta.rows.length, model.rowCount - start))
  const rows: Array<Row> = []
  for (let offset = 0; offset < previousCount; offset += 1) {
    const row = model.getRowAt(start + offset)
    if (row) {
      rows.push(row)
    }
  }
  const inverse: Array<DataTableDelta<Row>> = []
  if (rows.length > 0) {
    inverse.push({ type: 'replaceRange', start, rows: rows.map(cloneRow) })
  }
  if (delta.rows.length > previousCount) {
    const rowIds = delta.rows.slice(previousCount).map((row, offset) => model.resolveRowId(row, start + previousCount + offset))
    if (rowIds.length > 0) {
      inverse.push({ type: 'remove', rowIds })
    }
  }
  return inverse
}

function normalizeHistorySources(include: Array<DataTableCommitSource> | undefined): Array<DataTableCommitSource> {
  if (!include || include.length === 0) {
    return [...DEFAULT_HISTORY_SOURCES]
  }
  const result: Array<DataTableCommitSource> = []
  for (const source of include) {
    if (result.includes(source)) {
      continue
    }
    result.push(source)
  }
  return result
}

function cloneDeltas<Row extends Record<string, any>>(deltas: Array<DataTableDelta<Row>>): Array<DataTableDelta<Row>> {
  return deltas.map((delta) => {
    if (delta.type === 'patch') {
      return { ...delta, patch: { ...delta.patch } }
    }
    if (delta.type === 'insert') {
      return { ...delta, rows: delta.rows.map(cloneRow) }
    }
    if (delta.type === 'remove') {
      return { ...delta, rowIds: [...delta.rowIds] }
    }
    if (delta.type === 'replaceRange') {
      return { ...delta, rows: delta.rows.map(cloneRow) }
    }
    return { ...delta }
  })
}

function cloneRow<Row extends Record<string, any>>(row: Row): Row {
  return { ...row }
}

function clampHistoryIndex(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(Number.isFinite(value) ? value : min)))
}

function resolveInsertedRowId(row: Record<string, any>, fallback: number): DataTableRowId {
  return row.id ?? row.key ?? fallback
}
