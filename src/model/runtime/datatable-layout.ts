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
  const pinnedLeftWidth = sumColumns(input.columns.filter(column => column.pinned === 'left'))
  const pinnedRightWidth = sumColumns(input.columns.filter(column => column.pinned === 'right'))
  const centerColumns = input.columns.filter(column => !column.pinned)
  const contentWidth = sumColumns(centerColumns)
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
    centerColumnRange: resolveColumnRange(scrollX, bodyWidth, centerColumns, input.overscanColumns),
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
): DataTableRange {
  let cursor = 0
  let start = 0
  let end = columns.length
  const viewportStart = scrollX
  const viewportEnd = scrollX + viewportWidth

  for (let index = 0; index < columns.length; index += 1) {
    const next = cursor + columns[index]!.resolvedWidth
    if (next >= viewportStart) {
      start = Math.max(0, index - overscan)
      break
    }
    cursor = next
  }

  cursor = 0
  for (let index = 0; index < columns.length; index += 1) {
    cursor += columns[index]!.resolvedWidth
    if (cursor > viewportEnd) {
      end = Math.min(columns.length, index + 1 + overscan)
      break
    }
  }

  return { start, end }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min))
}
