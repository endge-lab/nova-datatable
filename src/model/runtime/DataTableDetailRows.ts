import type {
  DataTableDataViewRow,
  DataTableRowId,
  DataTableViewRow,
} from '@/model/types/datatable.types'

export type DataTableDetailExpansionState = 'all' | 'none' | ReadonlyArray<DataTableRowId> | ReadonlySet<DataTableRowId>

export interface DataTableDetailFlattenOptions<Row extends Record<string, any> = Record<string, any>> {
  rows: ReadonlyArray<DataTableViewRow<Row>>
  expanded?: DataTableDetailExpansionState
  detailHeight?: number
  canExpand?: (row: DataTableViewRow<Row>, sourceIndex: number) => boolean
}

export interface DataTableDetailDataEntry<Row extends Record<string, any> = Record<string, any>> {
  kind: 'data'
  row: DataTableViewRow<Row>
  rowId?: DataTableRowId
  sourceIndex: number
  viewIndex: number
  detailExpanded: boolean
}

export interface DataTableDetailEntry<Row extends Record<string, any> = Record<string, any>> {
  kind: 'detail'
  row: DataTableDataViewRow<Row>
  rowId: DataTableRowId
  detailKey: string
  sourceIndex: number
  parentViewIndex: number
  viewIndex: number
  height: number
  depth: number
}

export type DataTableDetailFlattenedRow<Row extends Record<string, any> = Record<string, any>> =
  | DataTableDetailDataEntry<Row>
  | DataTableDetailEntry<Row>

export interface DataTableDetailFlattenResult<Row extends Record<string, any> = Record<string, any>> {
  rows: Array<DataTableDetailFlattenedRow<Row>>
  detailRows: Array<DataTableDetailEntry<Row>>
  expanded: 'all' | 'none' | Array<DataTableRowId>
}

/**
 * Управляет чистым состоянием раскрытия detail rows.
 */
export class DataTableDetailExpansionController {
  private expanded: 'all' | 'none' | Set<DataTableRowId>

  /**
   * Создает controller с нормализованным состоянием detail rows.
   */
  constructor(initial: DataTableDetailExpansionState = 'none') {
    this.expanded = normalizeExpansionState(initial)
  }

  /**
   * Проверяет, раскрыта ли detail row для исходной строки.
   */
  isExpanded(rowId: DataTableRowId): boolean {
    if (this.expanded === 'all') return true
    if (this.expanded === 'none') return false
    return this.expanded.has(rowId)
  }

  /**
   * Раскрывает detail row для одной или нескольких строк.
   */
  expand(rowIds: DataTableRowId | ReadonlyArray<DataTableRowId>): void {
    if (this.expanded === 'all') return
    const set = this.expanded === 'none' ? new Set<DataTableRowId>() : new Set(this.expanded)
    for (const rowId of toArray(rowIds)) set.add(rowId)
    this.expanded = set
  }

  /**
   * Сворачивает detail row для одной или нескольких строк.
   */
  collapse(rowIds: DataTableRowId | ReadonlyArray<DataTableRowId>): void {
    if (this.expanded === 'none') return
    if (this.expanded === 'all') {
      this.expanded = 'none'
      return
    }
    const set = new Set(this.expanded)
    for (const rowId of toArray(rowIds)) set.delete(rowId)
    this.expanded = set.size === 0 ? 'none' : set
  }

  /**
   * Переключает раскрытие detail row.
   */
  toggle(rowId: DataTableRowId): boolean {
    const next = !this.isExpanded(rowId)
    if (next) this.expand(rowId)
    else this.collapse(rowId)
    return next
  }

  /**
   * Раскрывает все detail rows.
   */
  expandAll(): void {
    this.expanded = 'all'
  }

  /**
   * Сворачивает все detail rows.
   */
  collapseAll(): void {
    this.expanded = 'none'
  }

  /**
   * Заменяет состояние раскрытия detail rows.
   */
  replace(next: DataTableDetailExpansionState): void {
    this.expanded = normalizeExpansionState(next)
  }

  /**
   * Возвращает сериализуемый snapshot состояния detail rows.
   */
  snapshot(): 'all' | 'none' | Array<DataTableRowId> {
    if (this.expanded === 'all' || this.expanded === 'none') return this.expanded
    return [...this.expanded]
  }
}

/**
 * Вставляет detail rows после раскрытых data rows и возвращает плоский view.
 */
export function flattenDataTableDetailRows<Row extends Record<string, any>>(
  options: DataTableDetailFlattenOptions<Row>,
): DataTableDetailFlattenResult<Row> {
  const controller = new DataTableDetailExpansionController(options.expanded ?? 'none')
  const rows: Array<DataTableDetailFlattenedRow<Row>> = []
  const detailRows: Array<DataTableDetailEntry<Row>> = []
  const detailHeight = normalizeHeight(options.detailHeight)

  options.rows.forEach((row, sourceIndex) => {
    const rowId = resolveRowId(row)
    const expandable = row.kind === 'data'
      && rowId !== undefined
      && (options.canExpand?.(row, sourceIndex) ?? true)
    const detailExpanded = expandable && controller.isExpanded(rowId)
    const dataEntry: DataTableDetailDataEntry<Row> = {
      kind: 'data',
      row,
      rowId,
      sourceIndex,
      viewIndex: rows.length,
      detailExpanded,
    }

    rows.push(dataEntry)

    if (!detailExpanded || row.kind !== 'data' || rowId === undefined) return

    const detail: DataTableDetailEntry<Row> = {
      kind: 'detail',
      row,
      rowId,
      detailKey: `${String(rowId)}:detail`,
      sourceIndex,
      parentViewIndex: dataEntry.viewIndex,
      viewIndex: rows.length,
      height: detailHeight,
      depth: row.depth + 1,
    }
    rows.push(detail)
    detailRows.push(detail)
  })

  return {
    rows,
    detailRows,
    expanded: controller.snapshot(),
  }
}

/**
 * Проверяет раскрытие detail row в сериализуемом состоянии.
 */
export function isDataTableDetailRowExpanded(state: DataTableDetailExpansionState, rowId: DataTableRowId): boolean {
  if (state === 'all') return true
  if (state === 'none') return false
  if (Array.isArray(state)) return state.includes(rowId)
  return (state as ReadonlySet<DataTableRowId>).has(rowId)
}

function resolveRowId<Row extends Record<string, any>>(row: DataTableViewRow<Row>): DataTableRowId | undefined {
  return row.rowId
}

function normalizeHeight(height: number | undefined): number {
  return Math.max(1, Math.floor(Number.isFinite(height) ? height! : 96))
}

function normalizeExpansionState(state: DataTableDetailExpansionState): 'all' | 'none' | Set<DataTableRowId> {
  if (state === 'all' || state === 'none') return state
  return new Set(Array.isArray(state) ? state : [...(state as ReadonlySet<DataTableRowId>)])
}

function toArray(rowIds: DataTableRowId | ReadonlyArray<DataTableRowId>): Array<DataTableRowId> {
  return typeof rowIds === 'string' || typeof rowIds === 'number' ? [rowIds] : [...rowIds]
}
