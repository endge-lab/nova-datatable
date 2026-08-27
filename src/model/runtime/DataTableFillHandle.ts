import type {
  DataTableDelta,
  DataTableFillDirection,
  DataTableFillHandleMode,
  DataTableFillHandleOptions,
  DataTableResolvedFillHandleOptions,
  DataTableSelectionRange,
  DataTableStoreApi,
} from '@/model/types/datatable.types'

/**
 * Нормализует настройки fill handle.
 */
export function normalizeDataTableFillHandle(
  fillHandle: false | DataTableFillHandleOptions | undefined,
): false | DataTableResolvedFillHandleOptions {
  if (fillHandle === false) {
    return false
  }
  return {
    enabled: fillHandle?.enabled ?? false,
    mode: fillHandle?.mode ?? 'copy',
    directions: normalizeDirections(fillHandle?.directions),
  }
}

/**
 * Создает deltas для заполнения диапазона значениями из исходной selection.
 */
export function createDataTableFillDeltas<Row extends Record<string, any>>(
  store: DataTableStoreApi<Row>,
  range: DataTableSelectionRange,
  direction: DataTableFillDirection,
  options: { mode: DataTableFillHandleMode },
): Array<DataTableDelta<Row>> {
  if (range.unit !== 'cell') {
    return []
  }
  const startRow = range.startRowIndex ?? 0
  const endRow = range.endRowIndex ?? startRow
  const columnIds = range.columnIds ?? [range.startColumnId].filter((item): item is string => !!item)
  if (columnIds.length === 0) {
    return []
  }

  const sourceRowIndex = direction === 'up' ? endRow : startRow
  const deltas: Array<DataTableDelta<Row>> = []
  for (let rowIndex = startRow; rowIndex <= endRow; rowIndex += 1) {
    const rowId = store.getRowIdAt(rowIndex)
    if (rowId === undefined || rowIndex === sourceRowIndex) {
      continue
    }
    for (const columnId of columnIds) {
      const value = resolveFillValue(store, sourceRowIndex, rowIndex, columnId, options.mode)
      deltas.push({ type: 'setCell', rowId, columnId, value })
    }
  }
  return deltas
}

/**
 * Преобразует clipboard text в матрицу с поддержкой TSV, CSV и basic HTML table.
 */
export function parseDataTableClipboardText(text: string, format: 'auto' | 'plain' | 'tsv' | 'csv' | 'html'): Array<Array<string>> {
  const actual = format === 'auto'
    ? text.includes('<table') ? 'html' : text.includes('\t') ? 'tsv' : text.includes(',') ? 'csv' : 'plain'
    : format
  if (actual === 'html') {
    return parseHtmlTable(text)
  }
  if (actual === 'csv') {
    return parseDelimited(text, ',')
  }
  if (actual === 'tsv') {
    return parseDelimited(text, '\t')
  }
  return [[text]]
}

function normalizeDirections(directions: Array<DataTableFillDirection> | undefined): Array<DataTableFillDirection> {
  const fallback: Array<DataTableFillDirection> = ['down', 'right']
  if (!directions || directions.length === 0) {
    return fallback
  }
  return directions.filter((direction, index) => directions.indexOf(direction) === index)
}

function resolveFillValue<Row extends Record<string, any>>(
  store: DataTableStoreApi<Row>,
  sourceRowIndex: number,
  targetRowIndex: number,
  columnId: string,
  mode: DataTableFillHandleMode,
): unknown {
  const sourceId = store.getRowIdAt(sourceRowIndex)
  if (sourceId === undefined) {
    return undefined
  }
  const source = store.getCell(sourceId, columnId)
  if (mode !== 'series' && mode !== 'auto') {
    return source
  }
  if (typeof source === 'number') {
    return source + (targetRowIndex - sourceRowIndex)
  }
  return source
}

function parseDelimited(text: string, delimiter: string): Array<Array<string>> {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter((line, index, lines) => line.length > 0 || index < lines.length - 1)
    .map(line => line.split(delimiter).map(cell => cell.trim()))
}

function parseHtmlTable(text: string): Array<Array<string>> {
  const rows = [...text.matchAll(/<tr[\s\S]*?<\/tr>/gi)]
  return rows.map((rowMatch) => {
    const row = rowMatch[0]
    return [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
      .map(cell => decodeHtml(cell[1]!.replace(/<[^>]+>/g, '').trim()))
  }).filter(row => row.length > 0)
}

function decodeHtml(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
}
