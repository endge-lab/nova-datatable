import type {
  DataTableAutoWidthOptions,
  DataTableColumnInput,
  DataTablePinnedColumns,
  DataTableResolvedColumn,
  DataTableStoreApi,
} from '@/model/types/datatable.types'

const DEFAULT_WIDTH = 140
const DEFAULT_MIN_WIDTH = 48
const DEFAULT_MAX_WIDTH = 640

/**
 * Нормализует колонки и применяет pinned columns из root options.
 */
export function resolveDataTableColumns<Row extends Record<string, any>>(
  columns: Array<DataTableColumnInput<Row>>,
  pinnedColumns: DataTablePinnedColumns,
  widthOverrides: ReadonlyMap<string, number>,
  store: DataTableStoreApi<Row>,
): Array<DataTableResolvedColumn<Row>> {
  return columns.map((column) => {
    const minWidth = column.minWidth ?? resolveAutoWidth(column.width)?.min ?? DEFAULT_MIN_WIDTH
    const maxWidth = column.maxWidth ?? resolveAutoWidth(column.width)?.max ?? DEFAULT_MAX_WIDTH
    const override = widthOverrides.get(column.id)
    const resolvedWidth = clampWidth(
      override ?? resolveColumnInitialWidth(column, store),
      minWidth,
      maxWidth,
    )

    return {
      ...column,
      width: column.width ?? DEFAULT_WIDTH,
      minWidth,
      maxWidth,
      resolvedWidth,
      pinned: resolvePinnedSide(column, pinnedColumns),
      resizable: column.resizable ?? true,
      align: column.align ?? 'left',
    }
  })
}

/**
 * Автоматически вычисляет ширину колонки по header и загруженным строкам.
 */
export function autosizeDataTableColumn<Row extends Record<string, any>>(
  column: DataTableColumnInput<Row>,
  store: DataTableStoreApi<Row>,
): number {
  const auto = resolveAutoWidth(column.width)
  const min = column.minWidth ?? auto?.min ?? DEFAULT_MIN_WIDTH
  const max = column.maxWidth ?? auto?.max ?? DEFAULT_MAX_WIDTH
  const padding = auto?.padding ?? 28
  const sampleSize = auto?.sampleSize ?? 500
  const includeHeader = auto?.includeHeader ?? true
  let width = includeHeader ? measureTextLike(column.title ?? column.id) + padding : min
  const limit = Math.min(store.rowCount, sampleSize)

  for (let index = 0; index < limit; index += 1) {
    const row = store.getRowAt(index)
    if (!row) {
      continue
    }
    const value = resolveDataTableValue(row, index, column)
    width = Math.max(width, measureTextLike(value) + padding)
  }

  return clampWidth(Math.ceil(width), min, max)
}

/**
 * Возвращает значение ячейки по правилу column.value -> field -> column.id.
 */
export function resolveDataTableValue<Row extends Record<string, any>>(
  row: Row,
  rowIndex: number,
  column: DataTableColumnInput<Row>,
): unknown {
  if (column.value) {
    return column.value(row, rowIndex)
  }
  if (column.field !== undefined) {
    return row[column.field as keyof Row]
  }
  return row[column.id as keyof Row]
}

/**
 * Ограничивает ширину колонки.
 */
export function clampWidth(width: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(Number.isFinite(width) ? width : DEFAULT_WIDTH)))
}

function resolveColumnInitialWidth<Row extends Record<string, any>>(
  column: DataTableColumnInput<Row>,
  store: DataTableStoreApi<Row>,
): number {
  if (typeof column.width === 'number') {
    return column.width
  }
  if (resolveAutoWidth(column.width)) {
    return autosizeDataTableColumn(column, store)
  }
  return DEFAULT_WIDTH
}

function resolveAutoWidth(width: DataTableColumnInput['width']): DataTableAutoWidthOptions | null {
  return typeof width === 'object' && width?.mode === 'auto' ? width : null
}

function resolvePinnedSide<Row extends Record<string, any>>(
  column: DataTableColumnInput<Row>,
  pinnedColumns: DataTablePinnedColumns,
): DataTableResolvedColumn<Row>['pinned'] {
  if (pinnedColumns.left?.includes(column.id)) {
    return 'left'
  }
  if (pinnedColumns.right?.includes(column.id)) {
    return 'right'
  }
  return column.pinned
}

function measureTextLike(value: unknown): number {
  return String(value ?? '').length * 7.2
}
