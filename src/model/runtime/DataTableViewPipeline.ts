import { resolveDataTableValue } from '@/model/runtime/datatable-columns'
import type {
  DataTableColumnInput,
  DataTableColumnReorderPayload,
  DataTableFilterContext,
  DataTableFilterOperator,
  DataTableFilterRule,
  DataTableFilterState,
  DataTableQueryState,
  DataTableResolvedColumn,
  DataTableResolvedViewOptions,
  DataTableRowId,
  DataTableRowReorderPayload,
  DataTableSortRule,
  DataTableSortState,
  DataTableStoreApi,
  DataTableViewMode,
  DataTableViewState,
} from '@/model/types/datatable.types'

export interface DataTableViewRow<Row extends Record<string, any>> {
  row?: Row
  rowId?: DataTableRowId
  storeIndex: number
  viewIndex: number
}

interface DataTableViewPipelineInput<Row extends Record<string, any>> {
  columns: Array<DataTableResolvedColumn<Row>>
  view: DataTableResolvedViewOptions
}

/**
 * Строит текущий view поверх store: sort/filter/manual row order/column order.
 */
export class DataTableViewPipeline<Row extends Record<string, any> = Record<string, any>> {
  private columns: Array<DataTableResolvedColumn<Row>> = []
  private view: DataTableResolvedViewOptions
  private initialized = false
  private sort: DataTableSortState = []
  private filters: DataTableFilterState = []
  private rowOrder: Array<DataTableRowId> = []
  private columnOrder: Array<string> = []
  private rows: Array<DataTableViewRow<Row>> = []
  private revision = -1
  private localSort = false
  private localFilter = false

  constructor(private readonly store: DataTableStoreApi<Row>) {
    this.view = {
      sorting: false,
      filtering: false,
      rowOrdering: false,
      columnOrdering: false,
      filterUi: false,
    }
  }

  /**
   * Синхронизирует options и пересчитывает view при изменении store или state.
   */
  sync(input: DataTableViewPipelineInput<Row>): void {
    this.columns = input.columns
    this.view = input.view
    if (!this.initialized) {
      this.sort = input.view.sorting ? [...input.view.sorting.initial] : []
      this.filters = input.view.filtering ? [...input.view.filtering.initial] : []
      this.columnOrder = input.view.columnOrdering ? [...input.view.columnOrdering.order] : []
      this.initialized = true
    } else if (input.view.columnOrdering && input.view.columnOrdering.order.length > 0 && this.columnOrder.length === 0) {
      this.columnOrder = [...input.view.columnOrdering.order]
    }

    const revision = this.store.takeRevision()
    if (revision !== this.revision) {
      this.revision = revision
      this.rebuild()
    }
  }

  get rowCount(): number {
    return this.rows.length
  }

  getRowAt(viewIndex: number): Row | undefined {
    return this.rows[viewIndex]?.row ?? this.store.getRowAt(viewIndex)
  }

  getRowIdAt(viewIndex: number): DataTableRowId | undefined {
    return this.rows[viewIndex]?.rowId ?? this.store.getRowIdAt(viewIndex)
  }

  getStoreIndexAt(viewIndex: number): number | undefined {
    return this.rows[viewIndex]?.storeIndex ?? viewIndex
  }

  getViewRows(): Array<DataTableViewRow<Row>> {
    return [...this.rows]
  }

  getQuery(): DataTableQueryState {
    return {
      sort: [...this.sort],
      filters: [...this.filters],
      rowOrder: [...this.rowOrder],
      columnOrder: [...this.columnOrder],
    }
  }

  getState(): DataTableViewState {
    return {
      sort: [...this.sort],
      filters: [...this.filters],
      rowOrder: [...this.rowOrder],
      columnOrder: [...this.columnOrder],
      query: this.getQuery(),
      rowCount: this.rowCount,
      mode: {
        sorting: this.view.sorting ? this.view.sorting.mode : 'off',
        filtering: this.view.filtering ? this.view.filtering.mode : 'off',
      },
    }
  }

  setSort(sort: DataTableSortState | DataTableSortRule): void {
    this.sort = Array.isArray(sort) ? [...sort] : [sort]
    this.rebuild()
  }

  cycleSort(columnId: string, additive: boolean): void {
    if (!this.view.sorting) return
    const current = this.sort.find(rule => rule.columnId === columnId)
    const nextDirection = current?.direction === 'asc'
      ? 'desc'
      : current?.direction === 'desc'
        ? undefined
        : 'asc'
    const base = additive && this.view.sorting.multi ? this.sort.filter(rule => rule.columnId !== columnId) : []
    this.sort = nextDirection ? [...base, { columnId, direction: nextDirection }] : base
    this.rebuild()
  }

  clearSort(columnId?: string): void {
    this.sort = columnId ? this.sort.filter(rule => rule.columnId !== columnId) : []
    this.rebuild()
  }

  setFilter(columnId: string, filter: Omit<DataTableFilterRule, 'columnId'> | DataTableFilterRule): void {
    const next = { ...filter, columnId } as DataTableFilterRule
    this.filters = [...this.filters.filter(rule => rule.columnId !== columnId), next]
    this.rebuild()
  }

  clearFilter(columnId?: string): void {
    this.filters = columnId ? this.filters.filter(rule => rule.columnId !== columnId) : []
    this.rebuild()
  }

  reorderRows(payload: DataTableRowReorderPayload): DataTableRowReorderPayload {
    const ids = this.rows.map(row => row.rowId).filter((id): id is DataTableRowId => id !== undefined)
    const fromIndex = clampInteger(payload.fromIndex, 0, Math.max(0, ids.length - 1))
    const toIndex = clampInteger(payload.toIndex, 0, Math.max(0, ids.length - 1))
    const [id] = ids.splice(fromIndex, 1)
    if (id !== undefined) ids.splice(toIndex, 0, id)
    this.rowOrder = ids
    this.rebuild()
    return {
      ...payload,
      rowId: payload.rowId ?? id,
      fromIndex,
      toIndex,
      mode: payload.mode ?? ((this.view.rowOrdering && this.view.rowOrdering.mode) || 'view'),
    }
  }

  reorderColumns(payload: DataTableColumnReorderPayload, columns: Array<DataTableColumnInput<Row>>): DataTableColumnReorderPayload {
    const ids = this.columnOrder.length > 0 ? [...this.columnOrder] : columns.map(column => column.id)
    const fromIndex = clampInteger(payload.fromIndex, 0, Math.max(0, ids.length - 1))
    const toIndex = clampInteger(payload.toIndex, 0, Math.max(0, ids.length - 1))
    const [id] = ids.splice(fromIndex, 1)
    if (id !== undefined) ids.splice(toIndex, 0, id)
    this.columnOrder = payload.order ? [...payload.order] : ids
    return {
      ...payload,
      columnId: payload.columnId || id || '',
      fromIndex,
      toIndex,
      order: [...this.columnOrder],
    }
  }

  reset(): void {
    this.sort = this.view.sorting ? [...this.view.sorting.initial] : []
    this.filters = this.view.filtering ? [...this.view.filtering.initial] : []
    this.rowOrder = []
    this.columnOrder = this.view.columnOrdering ? [...this.view.columnOrdering.order] : []
    this.rebuild()
  }

  orderColumns(columns: Array<DataTableColumnInput<Row>>): Array<DataTableColumnInput<Row>> {
    const order = this.columnOrder.length > 0 ? this.columnOrder : this.view.columnOrdering && this.view.columnOrdering.order
    if (!order || order.length === 0) return columns
    const rank = new Map(order.map((id, index) => [id, index]))
    return [...columns].sort((a, b) => {
      const aRank = rank.get(a.id) ?? Number.MAX_SAFE_INTEGER
      const bRank = rank.get(b.id) ?? Number.MAX_SAFE_INTEGER
      if (aRank !== bRank) return aRank - bRank
      return columns.indexOf(a) - columns.indexOf(b)
    })
  }

  isServerControlled(): boolean {
    return !!(this.view.sorting && this.view.sorting.controlled) || !!(this.view.filtering && this.view.filtering.controlled)
  }

  private rebuild(): void {
    this.localSort = this.shouldApplyLocal(this.view.sorting ? this.view.sorting.mode : 'server')
    this.localFilter = this.shouldApplyLocal(this.view.filtering ? this.view.filtering.mode : 'server')
    if (!this.localSort && !this.localFilter && this.rowOrder.length === 0) {
      this.rows = Array.from({ length: this.store.rowCount }, (_item, viewIndex) => ({
        row: this.store.getRowAt(viewIndex),
        rowId: this.store.getRowIdAt(viewIndex),
        storeIndex: viewIndex,
        viewIndex,
      }))
      return
    }

    const rows: Array<DataTableViewRow<Row>> = []
    for (let storeIndex = 0; storeIndex < this.store.rowCount; storeIndex += 1) {
      const row = this.store.getRowAt(storeIndex)
      if (!row) continue
      const rowId = this.store.getRowIdAt(storeIndex)
      rows.push({ row, rowId, storeIndex, viewIndex: rows.length })
    }

    const filtered = this.localFilter ? rows.filter(item => this.matchesFilters(item)) : rows
    const sorted = this.localSort && this.sort.length > 0 ? [...filtered].sort((a, b) => this.compareRows(a, b)) : filtered
    const ordered = this.applyManualOrder(sorted)
    this.rows = ordered.map((item, viewIndex) => ({ ...item, viewIndex }))
  }

  private shouldApplyLocal(mode: DataTableViewMode): boolean {
    if (mode === 'client') return true
    if (mode === 'server') return false
    return this.store.loadedRowCount >= this.store.rowCount
  }

  private matchesFilters(item: DataTableViewRow<Row>): boolean {
    if (!item.row || item.rowId === undefined) return false
    for (const rule of this.filters) {
      const column = this.columns.find(candidate => candidate.id === rule.columnId)
      if (!column) continue
      const value = resolveDataTableValue(item.row, item.storeIndex, column)
      const filter = typeof column.filter === 'object' ? column.filter : undefined
      const context: DataTableFilterContext<Row> = {
        row: item.row,
        rowId: item.rowId,
        rowIndex: item.storeIndex,
        column,
        value,
        operator: rule.operator,
        filterValue: rule.value,
      }
      if (filter?.predicate) {
        if (!filter.predicate(context)) return false
      } else if (!defaultPredicate(rule.operator, value, rule.value)) {
        return false
      }
    }
    return true
  }

  private compareRows(a: DataTableViewRow<Row>, b: DataTableViewRow<Row>): number {
    for (let index = 0; index < this.sort.length; index += 1) {
      const rule = this.sort[index]!
      const column = this.columns.find(item => item.id === rule.columnId)
      if (!column || !a.row || !b.row) continue
      const sortConfig = typeof column.sortable === 'object' ? column.sortable : undefined
      const aValue = sortConfig?.accessor
        ? sortConfig.accessor(a.row, a.storeIndex)
        : resolveDataTableValue(a.row, a.storeIndex, column)
      const bValue = sortConfig?.accessor
        ? sortConfig.accessor(b.row, b.storeIndex)
        : resolveDataTableValue(b.row, b.storeIndex, column)
      const compared = sortConfig?.compare
        ? sortConfig.compare(aValue, bValue, a.row, b.row)
        : compareValues(aValue, bValue)
      if (compared !== 0) return rule.direction === 'asc' ? compared : -compared
    }
    return a.storeIndex - b.storeIndex
  }

  private applyManualOrder(rows: Array<DataTableViewRow<Row>>): Array<DataTableViewRow<Row>> {
    if (this.rowOrder.length === 0) return rows
    const byId = new Map(rows.map(row => [row.rowId, row]))
    const ordered: Array<DataTableViewRow<Row>> = []
    const used = new Set<DataTableRowId>()
    for (const id of this.rowOrder) {
      const row = byId.get(id)
      if (!row) continue
      ordered.push(row)
      used.add(id)
    }
    for (const row of rows) {
      if (row.rowId === undefined || !used.has(row.rowId)) ordered.push(row)
    }
    return ordered
  }
}

function compareValues(a: unknown, b: unknown): number {
  if (a === b) return 0
  if (a === undefined || a === null) return 1
  if (b === undefined || b === null) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })
}

function defaultPredicate(operator: DataTableFilterOperator, value: unknown, filterValue: unknown): boolean {
  const text = String(value ?? '').toLowerCase()
  const filterText = String(filterValue ?? '').toLowerCase()
  if (operator === 'contains') return text.includes(filterText)
  if (operator === 'startsWith') return text.startsWith(filterText)
  if (operator === 'endsWith') return text.endsWith(filterText)
  if (operator === 'equals' || operator === 'is') return value === filterValue || text === filterText
  if (operator === 'isNot') return value !== filterValue && text !== filterText
  if (operator === 'in') return Array.isArray(filterValue) ? filterValue.includes(value) : false
  if (operator === 'notIn') return Array.isArray(filterValue) ? !filterValue.includes(value) : true
  const number = Number(value)
  if (!Number.isFinite(number)) return false
  if (operator === 'gt') return number > Number(filterValue)
  if (operator === 'gte') return number >= Number(filterValue)
  if (operator === 'lt') return number < Number(filterValue)
  if (operator === 'lte') return number <= Number(filterValue)
  if (operator === 'between' && Array.isArray(filterValue)) {
    return number >= Number(filterValue[0]) && number <= Number(filterValue[1])
  }
  return true
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(Number.isFinite(value) ? value : min)))
}
