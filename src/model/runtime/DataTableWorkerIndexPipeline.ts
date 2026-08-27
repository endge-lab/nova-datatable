import type {
  DataTableFilterExpression,
  DataTableFilterRule,
  DataTableFilterState,
  DataTableQueryState,
  DataTableRowId,
  DataTableSearchMatch,
  DataTableSearchQuery,
} from '@/model/types/datatable.types'

export interface DataTableWorkerIndexedColumn<Row extends Record<string, any> = Record<string, any>> {
  id: string
  field?: keyof Row | string
  value?: (row: Row, index: number) => unknown
  sortable?: boolean
  filterable?: boolean
  searchable?: boolean
}

export interface DataTableWorkerIndexPipelineOptions<Row extends Record<string, any> = Record<string, any>> {
  rows: ReadonlyArray<Row>
  columns: ReadonlyArray<DataTableWorkerIndexedColumn<Row>>
  getRowId: (row: Row, index: number) => DataTableRowId
}

export interface DataTableWorkerQueryOptions {
  offset?: number
  limit?: number
  includeRows?: boolean
}

export interface DataTableWorkerQueryMetrics {
  inputRows: number
  scannedRows: number
  filteredRows: number
  sortedRows: number
  returnedRows: number
  materializedRows: number
  valueReads: number
  searchMatches: number
  durationMs: number
}

export interface DataTableWorkerQueryResult<Row extends Record<string, any> = Record<string, any>> {
  requestId: number
  rowIds: Array<DataTableRowId>
  indexes: Array<number>
  rows?: Array<Row>
  matches: Array<DataTableSearchMatch>
  total: number
  metrics: DataTableWorkerQueryMetrics
}

interface DataTableWorkerIndexedRow<Row extends Record<string, any> = Record<string, any>> {
  row: Row
  rowId: DataTableRowId
  index: number
  values: Map<string, unknown>
}

/**
 * Симулирует worker-side index pipeline для sort/filter/search без доступа к UI runtime.
 */
export class DataTableWorkerIndexPipeline<Row extends Record<string, any> = Record<string, any>> {
  private rows: Array<DataTableWorkerIndexedRow<Row>>
  private columns: Array<DataTableWorkerIndexedColumn<Row>>
  private columnById: Map<string, DataTableWorkerIndexedColumn<Row>>
  private requestId = 0

  /**
   * Создает индекс строк и колонок для worker query pipeline.
   */
  constructor(options: DataTableWorkerIndexPipelineOptions<Row>) {
    this.columns = [...options.columns]
    this.columnById = new Map(this.columns.map(column => [column.id, column]))
    this.rows = this.createRows(options.rows, options.getRowId)
  }

  /**
   * Возвращает количество строк в worker index.
   */
  get rowCount(): number {
    return this.rows.length
  }

  /**
   * Выполняет query синхронно как worker-side simulation.
   */
  query(query: DataTableQueryState, options: DataTableWorkerQueryOptions = {}): DataTableWorkerQueryResult<Row> {
    const startedAt = Date.now()
    const requestId = ++this.requestId
    let valueReads = 0
    const readValue = (row: DataTableWorkerIndexedRow<Row>, columnId: string): unknown => {
      valueReads += 1
      return row.values.get(columnId)
    }

    let result = this.rows
    const scannedRows = result.length
    if (hasFilters(query.filters)) {
      result = result.filter(row => this.matchesFilterNode(query.filters, row, readValue))
    }
    const filteredRows = result.length

    if (query.sort.length > 0) {
      result = [...result].sort((left, right) => this.compareRows(left, right, query, readValue))
    }
    const sortedRows = result.length

    result = this.applyManualOrder(result, query.rowOrder)

    const search = query.search
    if (search?.text.trim()) {
      result = search.filter
        ? result.filter((row, index) => this.matchSearchRow(row, index, search, readValue).length > 0)
        : result
    }

    const matches = search?.text.trim()
      ? result.flatMap((row, index) => this.matchSearchRow(row, index, search, readValue))
      : []
    const offset = clampInteger(options.offset ?? 0, 0, result.length)
    const limit = Math.max(0, Math.floor(Number.isFinite(options.limit) ? options.limit! : result.length))
    const page = result.slice(offset, offset + limit)

    return {
      requestId,
      rowIds: page.map(row => row.rowId),
      indexes: page.map(row => row.index),
      rows: options.includeRows ? page.map(row => row.row) : undefined,
      matches,
      total: result.length,
      metrics: {
        inputRows: this.rows.length,
        scannedRows,
        filteredRows,
        sortedRows,
        returnedRows: page.length,
        materializedRows: options.includeRows ? page.length : 0,
        valueReads,
        searchMatches: matches.length,
        durationMs: Date.now() - startedAt,
      },
    }
  }

  /**
   * Выполняет query через Promise, имитируя worker message boundary.
   */
  dispatch(query: DataTableQueryState, options: DataTableWorkerQueryOptions = {}): Promise<DataTableWorkerQueryResult<Row>> {
    return Promise.resolve(this.query(query, options))
  }

  /**
   * Пересобирает индекс строк с прежними колонками.
   */
  replaceRows(rows: ReadonlyArray<Row>, getRowId: (row: Row, index: number) => DataTableRowId): void {
    this.rows = this.createRows(rows, getRowId)
  }

  /**
   * Создает индексированные строки с предрасчитанными значениями колонок.
   */
  private createRows(
    rows: ReadonlyArray<Row>,
    getRowId: (row: Row, index: number) => DataTableRowId,
  ): Array<DataTableWorkerIndexedRow<Row>> {
    return rows.map((row, index) => {
      const values = new Map<string, unknown>()
      for (const column of this.columns) {
        values.set(column.id, resolveColumnValue(row, index, column))
      }
      return {
        row,
        rowId: getRowId(row, index),
        index,
        values,
      }
    })
  }

  /**
   * Проверяет filter expression для одной indexed row.
   */
  private matchesFilterNode(
    node: DataTableFilterState | DataTableFilterExpression | DataTableFilterRule,
    row: DataTableWorkerIndexedRow<Row>,
    readValue: (row: DataTableWorkerIndexedRow<Row>, columnId: string) => unknown,
  ): boolean {
    if (Array.isArray(node)) {
      return node.every(rule => this.matchesFilterNode(rule, row, readValue))
    }
    if ('logic' in node) {
      return node.logic === 'or'
        ? node.rules.some(rule => this.matchesFilterNode(rule, row, readValue))
        : node.rules.every(rule => this.matchesFilterNode(rule, row, readValue))
    }
    return matchesFilterRule(node, readValue(row, node.columnId))
  }

  /**
   * Сравнивает две indexed rows по query sort state.
   */
  private compareRows(
    left: DataTableWorkerIndexedRow<Row>,
    right: DataTableWorkerIndexedRow<Row>,
    query: DataTableQueryState,
    readValue: (row: DataTableWorkerIndexedRow<Row>, columnId: string) => unknown,
  ): number {
    for (const rule of query.sort) {
      if (!this.columnById.has(rule.columnId)) {
        continue
      }
      const compared = compareValues(readValue(left, rule.columnId), readValue(right, rule.columnId))
      if (compared !== 0) {
        return rule.direction === 'asc' ? compared : -compared
      }
    }
    return left.index - right.index
  }

  /**
   * Применяет ручной row order поверх результата worker query.
   */
  private applyManualOrder(
    rows: Array<DataTableWorkerIndexedRow<Row>>,
    rowOrder: ReadonlyArray<DataTableRowId>,
  ): Array<DataTableWorkerIndexedRow<Row>> {
    if (rowOrder.length === 0) {
      return rows
    }
    const byId = new Map(rows.map(row => [row.rowId, row]))
    const ordered: Array<DataTableWorkerIndexedRow<Row>> = []
    const used = new Set<DataTableRowId>()
    for (const rowId of rowOrder) {
      const row = byId.get(rowId)
      if (!row) {
        continue
      }
      ordered.push(row)
      used.add(rowId)
    }
    for (const row of rows) {
      if (!used.has(row.rowId)) {
        ordered.push(row)
      }
    }
    return ordered
  }

  /**
   * Находит search matches для одной indexed row.
   */
  private matchSearchRow(
    row: DataTableWorkerIndexedRow<Row>,
    rowIndex: number,
    search: DataTableSearchQuery,
    readValue: (row: DataTableWorkerIndexedRow<Row>, columnId: string) => unknown,
  ): Array<DataTableSearchMatch> {
    const columns = this.resolveSearchColumns(search)
    if (search.scope === 'rows') {
      const value = columns.map(column => String(readValue(row, column.id) ?? '')).join(' ')
      const ranges = findSearchRanges(value, search)
      return ranges.length > 0
        ? [{ rowId: row.rowId, rowIndex, storeIndex: row.index, value, ranges }]
        : []
    }

    const matches: Array<DataTableSearchMatch> = []
    for (const column of columns) {
      const value = String(readValue(row, column.id) ?? '')
      const ranges = findSearchRanges(value, search)
      if (ranges.length === 0) {
        continue
      }
      matches.push({
        rowId: row.rowId,
        rowIndex,
        storeIndex: row.index,
        columnId: column.id,
        columnIndex: this.columns.indexOf(column),
        value,
        ranges,
      })
    }
    return matches
  }

  /**
   * Возвращает колонки, участвующие в search query.
   */
  private resolveSearchColumns(search: DataTableSearchQuery): Array<DataTableWorkerIndexedColumn<Row>> {
    const searchable = this.columns.filter(column => column.searchable !== false)
    if (!search.columns || search.columns.length === 0) {
      return searchable
    }
    const allowed = new Set(search.columns)
    return searchable.filter(column => allowed.has(column.id))
  }
}

/**
 * Создает worker index pipeline для тестов и benchmark-сценариев.
 */
export function createDataTableWorkerIndexPipeline<Row extends Record<string, any>>(
  options: DataTableWorkerIndexPipelineOptions<Row>,
): DataTableWorkerIndexPipeline<Row> {
  return new DataTableWorkerIndexPipeline(options)
}

function resolveColumnValue<Row extends Record<string, any>>(
  row: Row,
  index: number,
  column: DataTableWorkerIndexedColumn<Row>,
): unknown {
  if (column.value) {
    return column.value(row, index)
  }
  if (column.field !== undefined) {
    return row[column.field as keyof Row]
  }
  return row[column.id as keyof Row]
}

function matchesFilterRule(rule: DataTableFilterRule, value: unknown): boolean {
  const text = String(value ?? '').toLowerCase()
  const filterText = String(rule.value ?? '').toLowerCase()
  if (rule.operator === 'contains') {
    return text.includes(filterText)
  }
  if (rule.operator === 'startsWith') {
    return text.startsWith(filterText)
  }
  if (rule.operator === 'endsWith') {
    return text.endsWith(filterText)
  }
  if (rule.operator === 'equals' || rule.operator === 'is') {
    return value === rule.value || text === filterText
  }
  if (rule.operator === 'isNot') {
    return value !== rule.value && text !== filterText
  }
  if (rule.operator === 'in') {
    return Array.isArray(rule.value) ? rule.value.includes(value) : false
  }
  if (rule.operator === 'notIn') {
    return Array.isArray(rule.value) ? !rule.value.includes(value) : true
  }
  const number = Number(value)
  if (!Number.isFinite(number)) {
    return false
  }
  if (rule.operator === 'gt') {
    return number > Number(rule.value)
  }
  if (rule.operator === 'gte') {
    return number >= Number(rule.value)
  }
  if (rule.operator === 'lt') {
    return number < Number(rule.value)
  }
  if (rule.operator === 'lte') {
    return number <= Number(rule.value)
  }
  if (rule.operator === 'between' && Array.isArray(rule.value)) {
    return number >= Number(rule.value[0]) && number <= Number(rule.value[1])
  }
  return true
}

function findSearchRanges(value: string, search: DataTableSearchQuery): Array<{ start: number, end: number }> {
  const source = search.caseSensitive ? value : value.toLowerCase()
  const query = search.caseSensitive ? search.text : search.text.toLowerCase()
  if (!query) {
    return []
  }
  if (search.match === 'regex') {
    try {
      const flags = search.caseSensitive ? 'g' : 'gi'
      const expression = new RegExp(search.text, flags)
      return [...source.matchAll(expression)].map(match => ({
        start: match.index ?? 0,
        end: (match.index ?? 0) + match[0].length,
      }))
    }
    catch {
      return []
    }
  }
  if (search.match === 'equals') {
    return source === query ? [{ start: 0, end: value.length }] : []
  }
  if (search.match === 'startsWith') {
    return source.startsWith(query) ? [{ start: 0, end: query.length }] : []
  }

  const ranges: Array<{ start: number, end: number }> = []
  let index = source.indexOf(query)
  while (index >= 0) {
    ranges.push({ start: index, end: index + query.length })
    index = source.indexOf(query, index + Math.max(1, query.length))
  }
  return ranges
}

function hasFilters(filters: DataTableFilterState | DataTableFilterExpression): boolean {
  if (Array.isArray(filters)) {
    return filters.length > 0
  }
  return filters.rules.length > 0
}

function compareValues(left: unknown, right: unknown): number {
  if (left === right) {
    return 0
  }
  if (left === undefined || left === null) {
    return 1
  }
  if (right === undefined || right === null) {
    return -1
  }
  if (typeof left === 'number' && typeof right === 'number') {
    return left - right
  }
  return String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: 'base' })
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(Number.isFinite(value) ? value : min)))
}
