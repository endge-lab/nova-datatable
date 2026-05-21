import type { DataTablePasteParseFormat } from '@/model/types/datatable.types'

export type DataTableClipboardMatrixParseFormat = DataTablePasteParseFormat | 'html'
export type DataTableFillSeriesMode = 'auto' | 'repeat' | 'linear'

export interface DataTableClipboardMatrixParseOptions {
  format?: DataTableClipboardMatrixParseFormat
  trimTrailingEmptyRows?: boolean
}

export interface DataTableFillMatrixInput<T = unknown> {
  source: Array<Array<T>>
  rowCount: number
  columnCount: number
  series?: DataTableFillSeriesMode
  cloneValue?: (value: T) => T
}

/**
 * Создает fill-матрицу из исходного выделения с repeat или numeric linear series.
 */
export function createDataTableFillMatrix<T = unknown>(input: DataTableFillMatrixInput<T>): Array<Array<T>> {
  const rowCount = Math.max(0, Math.floor(input.rowCount))
  const columnCount = Math.max(0, Math.floor(input.columnCount))
  const source = input.source.filter(row => row.length > 0)
  if (rowCount === 0 || columnCount === 0 || source.length === 0) return []

  const cloneValue = input.cloneValue ?? cloneFillValue
  const series = input.series ?? 'auto'
  return Array.from({ length: rowCount }, (_row, rowIndex) => (
    Array.from({ length: columnCount }, (_cell, columnIndex) => {
      const linear = series === 'repeat'
        ? undefined
        : resolveLinearFillValue(source, rowIndex, columnIndex)
      const value = linear?.resolved ? linear.value : resolveRepeatedFillValue(source, rowIndex, columnIndex)
      return cloneValue(value as T)
    })
  ))
}

/**
 * Разбирает clipboard text в матрицу по формату auto/plain/tsv/csv/html.
 */
export function parseDataTableClipboardMatrix(
  text: string,
  options: DataTableClipboardMatrixParseOptions | DataTableClipboardMatrixParseFormat = 'auto',
): Array<Array<string>> {
  const parseOptions = typeof options === 'string' ? { format: options } : options
  const format = resolveClipboardParseFormat(text, parseOptions.format ?? 'auto')
  if (format === 'plain') return text ? [[text]] : []
  if (format === 'html') return parseDataTableHtmlTable(text)
  if (format === 'csv') return parseDataTableCsv(text, parseOptions)
  return parseDataTableTsv(text, parseOptions)
}

/**
 * Разбирает TSV clipboard text с поддержкой quoted tabs и переносов строк.
 */
export function parseDataTableTsv(
  text: string,
  options: Pick<DataTableClipboardMatrixParseOptions, 'trimTrailingEmptyRows'> = {},
): Array<Array<string>> {
  return parseDelimitedClipboardMatrix(text, '\t', options.trimTrailingEmptyRows ?? true)
}

/**
 * Разбирает CSV clipboard text с поддержкой quoted commas и переносов строк.
 */
export function parseDataTableCsv(
  text: string,
  options: Pick<DataTableClipboardMatrixParseOptions, 'trimTrailingEmptyRows'> = {},
): Array<Array<string>> {
  return parseDelimitedClipboardMatrix(text, ',', options.trimTrailingEmptyRows ?? true)
}

/**
 * Извлекает матрицу из простого HTML table clipboard payload.
 */
export function parseDataTableHtmlTable(text: string): Array<Array<string>> {
  const rows: Array<Array<string>> = []
  const rowPattern = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi
  let rowMatch: RegExpExecArray | null
  while ((rowMatch = rowPattern.exec(text)) !== null) {
    const cells: Array<string> = []
    const cellPattern = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi
    let cellMatch: RegExpExecArray | null
    while ((cellMatch = cellPattern.exec(rowMatch[1] ?? '')) !== null) {
      cells.push(normalizeHtmlCell(cellMatch[1] ?? ''))
    }
    if (cells.length > 0) rows.push(cells)
  }
  return rows
}

function parseDelimitedClipboardMatrix(
  text: string,
  delimiter: '\t' | ',',
  trimTrailingEmptyRows: boolean,
): Array<Array<string>> {
  if (!text) return []
  const rows: Array<Array<string>> = []
  let row: Array<string> = []
  let value = ''
  let quoted = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    const next = text[index + 1]
    if (char === '"' && quoted && next === '"') {
      value += '"'
      index += 1
    } else if (char === '"' && quoted) {
      quoted = false
    } else if (char === '"' && value === '') {
      quoted = true
    } else if (char === '"') {
      value += char
    } else if (char === delimiter && !quoted) {
      row.push(value)
      value = ''
    } else if ((char === '\n' || char === '\r') && !quoted) {
      row.push(value)
      rows.push(row)
      row = []
      value = ''
      if (char === '\r' && next === '\n') index += 1
    } else {
      value += char
    }
  }

  row.push(value)
  rows.push(row)
  return trimTrailingEmptyRows ? trimTrailingRows(rows) : rows
}

function trimTrailingRows(rows: Array<Array<string>>): Array<Array<string>> {
  let end = rows.length
  while (end > 0 && rows[end - 1]!.every(cell => cell === '')) end -= 1
  return rows.slice(0, end)
}

function resolveClipboardParseFormat(
  text: string,
  format: DataTableClipboardMatrixParseFormat,
): DataTableClipboardMatrixParseFormat {
  if (format !== 'auto') return format
  if (/<table[\s>]/i.test(text) || /<tr[\s>]/i.test(text)) return 'html'
  if (text.includes('\t')) return 'tsv'
  if (text.includes(',')) return 'csv'
  return 'plain'
}

function normalizeHtmlCell(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .trim(),
  )
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_match, entity: string) => {
      if (entity === 'amp') return '&'
      if (entity === 'lt') return '<'
      if (entity === 'gt') return '>'
      if (entity === 'quot') return '"'
      if (entity === 'apos') return '\''
      return ' '
    })
}

function resolveRepeatedFillValue<T>(source: Array<Array<T>>, rowIndex: number, columnIndex: number): T | undefined {
  const row = source[rowIndex % source.length]!
  return row[columnIndex % row.length]
}

function resolveLinearFillValue<T>(
  source: Array<Array<T>>,
  rowIndex: number,
  columnIndex: number,
): { resolved: true; value: unknown } | { resolved: false } {
  const vertical = resolveVerticalLinearFillValue(source, rowIndex, columnIndex)
  if (vertical.resolved) return vertical
  return resolveHorizontalLinearFillValue(source, rowIndex, columnIndex)
}

function resolveVerticalLinearFillValue<T>(
  source: Array<Array<T>>,
  rowIndex: number,
  columnIndex: number,
): { resolved: true; value: unknown } | { resolved: false } {
  if (source.length < 2 || rowIndex < source.length) return { resolved: false }
  const column = columnIndex % Math.max(...source.map(row => row.length))
  const first = parseNumericFillCell(source[0]?.[column])
  const second = parseNumericFillCell(source[1]?.[column])
  if (!first || !second) return { resolved: false }
  return {
    resolved: true,
    value: formatNumericFillCell(first, first.value + (second.value - first.value) * rowIndex),
  }
}

function resolveHorizontalLinearFillValue<T>(
  source: Array<Array<T>>,
  rowIndex: number,
  columnIndex: number,
): { resolved: true; value: unknown } | { resolved: false } {
  const row = source[rowIndex % source.length]
  if (!row || row.length < 2 || columnIndex < row.length) return { resolved: false }
  const first = parseNumericFillCell(row[0])
  const second = parseNumericFillCell(row[1])
  if (!first || !second) return { resolved: false }
  return {
    resolved: true,
    value: formatNumericFillCell(first, first.value + (second.value - first.value) * columnIndex),
  }
}

function parseNumericFillCell(value: unknown): { value: number; asString: boolean } | null {
  if (typeof value === 'number' && Number.isFinite(value)) return { value, asString: false }
  if (typeof value !== 'string') return null
  const normalized = value.trim().replace(',', '.')
  if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) return null
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? { value: parsed, asString: true } : null
}

function formatNumericFillCell(source: { asString: boolean }, value: number): unknown {
  return source.asString ? String(value) : value
}

function cloneFillValue<T>(value: T): T {
  if (value === null || value === undefined || typeof value !== 'object') return value
  try {
    return structuredClone(value) as T
  } catch {
    try {
      return JSON.parse(JSON.stringify(value)) as T
    } catch {
      return Array.isArray(value) ? ([...value] as T) : ({ ...(value as Record<string, unknown>) } as T)
    }
  }
}
