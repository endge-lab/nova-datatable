import type {
  DataTableRange,
  DataTableResolvedColumn,
  DataTableViewport,
  DataTableViewportOptions,
} from '@/model/types/datatable.types'

/**
 * Вычисляет viewport и виртуальные диапазоны таблицы.
 */
export function createDataTableViewport<Row extends Record<string, any>>(
  input: DataTableViewportOptions & {
    rowCount: number
    columns: Array<DataTableResolvedColumn<Row>>
    pinnedTopCount: number
    pinnedBottomCount: number
    scrollX: number
    scrollY: number
  },
): DataTableViewport {
  let pinnedLeftWidth = 0
  let pinnedRightWidth = 0
  let contentWidth = 0
  let centerColumnCount = 0
  const centerColumnPrefix = [0]
  for (const column of input.columns) {
    if (column.pinned === 'left') {
      pinnedLeftWidth += column.resolvedWidth
    }
    else if (column.pinned === 'right') {
      pinnedRightWidth += column.resolvedWidth
    }
    else {
      centerColumnCount += 1
      contentWidth += column.resolvedWidth
      centerColumnPrefix.push(contentWidth)
    }
  }
  const pinnedTopHeight = input.pinnedTopCount * input.rowHeight
  const pinnedBottomHeight = input.pinnedBottomCount * input.rowHeight
  const bodyX = pinnedLeftWidth
  const bodyY = input.headerHeight + pinnedTopHeight
  const bodyWidth = Math.max(1, input.width - pinnedLeftWidth - pinnedRightWidth)
  const bodyHeight = Math.max(1, input.height - input.headerHeight - pinnedTopHeight - pinnedBottomHeight)
  const contentHeight = input.rowCount * input.rowHeight
  const maxScrollX = Math.max(0, contentWidth - bodyWidth)
  const maxScrollY = Math.max(0, contentHeight - bodyHeight)
  const scrollX = clamp(input.scrollX, 0, maxScrollX)
  const scrollY = clamp(input.scrollY, 0, maxScrollY)

  const centerRange = resolveColumnRangeFromPrefix(scrollX, bodyWidth, centerColumnCount, centerColumnPrefix, input.overscanColumns)

  return {
    width: input.width,
    height: input.height,
    scrollX,
    scrollY,
    bodyX,
    bodyY,
    bodyWidth,
    bodyHeight,
    contentWidth,
    contentHeight,
    maxScrollX,
    maxScrollY,
    rowRange: resolveRowRange(scrollY, bodyHeight, input.rowHeight, input.rowCount, input.overscanRows),
    centerColumnRange: { start: centerRange.start, end: centerRange.end },
    centerColumnOffset: centerRange.offset,
    pinnedLeftWidth,
    pinnedRightWidth,
  }
}

/**
 * Суммирует текущие ширины колонок.
 */
export function sumColumns<Row extends Record<string, any>>(columns: Array<DataTableResolvedColumn<Row>>): number {
  return columns.reduce((total, column) => total + column.resolvedWidth, 0)
}

/**
 * Возвращает виртуальный диапазон строк.
 */
export function resolveRowRange(
  scrollY: number,
  viewportHeight: number,
  rowHeight: number,
  rowCount: number,
  overscan: number,
): DataTableRange {
  const start = Math.max(0, Math.floor(scrollY / rowHeight) - overscan)
  const end = Math.min(rowCount, Math.ceil((scrollY + viewportHeight) / rowHeight) + overscan)
  return { start, end }
}

/**
 * Возвращает виртуальный диапазон незакрепленных колонок.
 */
export function resolveColumnRange<Row extends Record<string, any>>(
  scrollX: number,
  viewportWidth: number,
  columns: Array<DataTableResolvedColumn<Row>>,
  overscan: number,
): DataTableRange & { offset: number } {
  if (columns.length === 0) {
    return { start: 0, end: 0, offset: 0 }
  }

  const prefix = new Array<number>(columns.length + 1)
  prefix[0] = 0
  for (let index = 0; index < columns.length; index += 1) {
    prefix[index + 1] = prefix[index]! + columns[index]!.resolvedWidth
  }
  return resolveColumnRangeFromPrefix(scrollX, viewportWidth, columns.length, prefix, overscan)
}

function resolveColumnRangeFromPrefix(
  scrollX: number,
  viewportWidth: number,
  columnCount: number,
  prefix: Array<number>,
  overscan: number,
): DataTableRange & { offset: number } {
  if (columnCount === 0) {
    return { start: 0, end: 0, offset: 0 }
  }
  const viewportStart = scrollX
  const viewportEnd = scrollX + viewportWidth
  const rawStart = Math.max(0, lowerBound(prefix, viewportStart) - 1)
  const rawEnd = Math.min(columnCount, upperBound(prefix, viewportEnd))
  const start = Math.max(0, rawStart - overscan)
  const end = Math.min(columnCount, rawEnd + overscan)

  return { start, end, offset: prefix[start] ?? 0 }
}

function lowerBound(values: Array<number>, target: number): number {
  let left = 0
  let right = values.length
  while (left < right) {
    const middle = (left + right) >> 1
    if ((values[middle] ?? 0) < target) {
      left = middle + 1
    }
    else { right = middle }
  }
  return left
}

function upperBound(values: Array<number>, target: number): number {
  let left = 0
  let right = values.length
  while (left < right) {
    const middle = (left + right) >> 1
    if ((values[middle] ?? 0) <= target) {
      left = middle + 1
    }
    else { right = middle }
  }
  return left
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min))
}
