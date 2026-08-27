import type { DataTableRowId } from '@/model/types/datatable.types'

export type DataTableTreeExpansionState = 'all' | 'none' | ReadonlyArray<DataTableRowId> | ReadonlySet<DataTableRowId>

export interface DataTableTreeFlattenOptions<Row extends Record<string, any> = Record<string, any>> {
  rows: ReadonlyArray<Row>
  expanded?: DataTableTreeExpansionState
  getRowId: (row: Row, sourceIndex: number, parentId?: DataTableRowId) => DataTableRowId
  getChildren?: (row: Row, sourceIndex: number, path: ReadonlyArray<DataTableRowId>) => ReadonlyArray<Row> | undefined
  getChildCount?: (row: Row, sourceIndex: number, path: ReadonlyArray<DataTableRowId>) => number | undefined
  isExpandable?: (row: Row, sourceIndex: number, path: ReadonlyArray<DataTableRowId>) => boolean
}

export interface DataTableTreeRow<Row extends Record<string, any> = Record<string, any>> {
  kind: 'tree-data'
  row: Row
  rowId: DataTableRowId
  parentId?: DataTableRowId
  path: Array<DataTableRowId>
  sourceIndex: number
  siblingIndex: number
  viewIndex: number
  depth: number
  expandable: boolean
  expanded: boolean
  loadedChildCount: number
  childCount: number
  visibleDescendantCount: number
}

export interface DataTableTreeFlattenResult<Row extends Record<string, any> = Record<string, any>> {
  rows: Array<DataTableTreeRow<Row>>
  rowById: Map<DataTableRowId, DataTableTreeRow<Row>>
  expanded: 'all' | 'none' | Array<DataTableRowId>
}

/**
 * Управляет чистым состоянием раскрытия tree rows без привязки к Vue или Canvas.
 */
export class DataTableTreeExpansionController {
  private _expanded: 'all' | 'none' | Set<DataTableRowId>

  /**
   * Создает controller с нормализованным состоянием раскрытия.
   */
  constructor(initial: DataTableTreeExpansionState = 'none') {
    this._expanded = normalizeExpansionState(initial)
  }

  /**
   * Проверяет, раскрыта ли строка дерева.
   */
  isExpanded(rowId: DataTableRowId): boolean {
    if (this._expanded === 'all') {
      return true
    }
    if (this._expanded === 'none') {
      return false
    }
    return this._expanded.has(rowId)
  }

  /**
   * Раскрывает одну или несколько строк дерева.
   */
  expand(rowIds: DataTableRowId | ReadonlyArray<DataTableRowId>): void {
    if (this._expanded === 'all') {
      return
    }
    const set = this._expanded === 'none' ? new Set<DataTableRowId>() : new Set(this._expanded)
    for (const rowId of toArray(rowIds)) {
      set.add(rowId)
    }
    this._expanded = set
  }

  /**
   * Сворачивает одну или несколько строк дерева.
   */
  collapse(rowIds: DataTableRowId | ReadonlyArray<DataTableRowId>): void {
    const ids = toArray(rowIds)
    if (this._expanded === 'none') {
      return
    }
    if (this._expanded === 'all') {
      this._expanded = 'none'
      return
    }
    const set = new Set(this._expanded)
    for (const rowId of ids) {
      set.delete(rowId)
    }
    this._expanded = set.size === 0 ? 'none' : set
  }

  /**
   * Переключает раскрытие одной строки дерева.
   */
  toggle(rowId: DataTableRowId): boolean {
    const next = !this.isExpanded(rowId)
    if (next) {
      this.expand(rowId)
    }
    else { this.collapse(rowId) }
    return next
  }

  /**
   * Раскрывает все строки дерева.
   */
  expandAll(): void {
    this._expanded = 'all'
  }

  /**
   * Сворачивает все строки дерева.
   */
  collapseAll(): void {
    this._expanded = 'none'
  }

  /**
   * Заменяет состояние раскрытия внешним snapshot.
   */
  replace(next: DataTableTreeExpansionState): void {
    this._expanded = normalizeExpansionState(next)
  }

  /**
   * Возвращает сериализуемый snapshot состояния раскрытия.
   */
  snapshot(): 'all' | 'none' | Array<DataTableRowId> {
    if (this._expanded === 'all' || this._expanded === 'none') {
      return this._expanded
    }
    return [...this._expanded]
  }
}

/**
 * Разворачивает иерархические строки в плоский view без побочных эффектов.
 */
export function flattenDataTableTreeRows<Row extends Record<string, any>>(
  options: DataTableTreeFlattenOptions<Row>,
): DataTableTreeFlattenResult<Row> {
  const controller = new DataTableTreeExpansionController(options.expanded ?? 'all')
  const rows: Array<DataTableTreeRow<Row>> = []
  const rowById = new Map<DataTableRowId, DataTableTreeRow<Row>>()
  let sourceIndex = 0

  const visit = (
    row: Row,
    siblingIndex: number,
    parentId: DataTableRowId | undefined,
    parentPath: Array<DataTableRowId>,
    depth: number,
  ): void => {
    const currentSourceIndex = sourceIndex
    sourceIndex += 1
    const rowId = options.getRowId(row, currentSourceIndex, parentId)
    const path = [...parentPath, rowId]
    const children = [...(options.getChildren?.(row, currentSourceIndex, path) ?? [])]
    const childCount = Math.max(0, options.getChildCount?.(row, currentSourceIndex, path) ?? children.length)
    const expandable = options.isExpandable?.(row, currentSourceIndex, path) ?? childCount > 0
    const expanded = expandable && controller.isExpanded(rowId)
    const treeRow: DataTableTreeRow<Row> = {
      kind: 'tree-data',
      row,
      rowId,
      parentId,
      path,
      sourceIndex: currentSourceIndex,
      siblingIndex,
      viewIndex: rows.length,
      depth,
      expandable,
      expanded,
      loadedChildCount: children.length,
      childCount,
      visibleDescendantCount: 0,
    }

    rows.push(treeRow)
    rowById.set(rowId, treeRow)

    const beforeChildren = rows.length
    if (expanded) {
      children.forEach((child, index) => visit(child, index, rowId, path, depth + 1))
    }
    treeRow.visibleDescendantCount = rows.length - beforeChildren
  }

  options.rows.forEach((row, index) => visit(row, index, undefined, [], 0))

  return {
    rows,
    rowById,
    expanded: controller.snapshot(),
  }
}

/**
 * Проверяет раскрытие row id в сериализуемом состоянии дерева.
 */
export function isDataTableTreeRowExpanded(state: DataTableTreeExpansionState, rowId: DataTableRowId): boolean {
  if (state === 'all') {
    return true
  }
  if (state === 'none') {
    return false
  }
  if (Array.isArray(state)) {
    return state.includes(rowId)
  }
  return (state as ReadonlySet<DataTableRowId>).has(rowId)
}

function normalizeExpansionState(state: DataTableTreeExpansionState): 'all' | 'none' | Set<DataTableRowId> {
  if (state === 'all' || state === 'none') {
    return state
  }
  return new Set(Array.isArray(state) ? state : [...(state as ReadonlySet<DataTableRowId>)])
}

function toArray(rowIds: DataTableRowId | ReadonlyArray<DataTableRowId>): Array<DataTableRowId> {
  return typeof rowIds === 'string' || typeof rowIds === 'number' ? [rowIds] : [...rowIds]
}
