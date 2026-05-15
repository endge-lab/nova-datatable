import { NOVA_UI_COMMON_FIELD_DEFINITIONS, normalizeCommonProps } from '@endge/nova-ui-kit'
import type { NovaComponentDescriptor, NovaComponentSchema } from '@endge/nova'
import type {
  DataTableRootProps,
  DataTableRootResolvedProps,
} from '@/model/types/datatable.types'
import { DATATABLE_ROOT_SCHEMA_TYPE } from '@/model/types/datatable.types'

export type DataTableRootDescriptor = NovaComponentDescriptor<
  DataTableRootResolvedProps,
  unknown,
  Record<string, never>,
  DataTableRootProps
>

export const DATATABLE_ROOT_FIELD_DEFINITIONS = {
  ...NOVA_UI_COMMON_FIELD_DEFINITIONS,
  store: { type: 'object' },
  rows: { type: 'array' },
  rowKey: { type: 'any' },
  columns: { type: 'array' },
  pinnedColumns: { type: 'object' },
  pinnedRows: { type: 'object' },
  rowHeight: { type: 'number' },
  headerHeight: { type: 'number' },
  overscanRows: { type: 'number' },
  overscanColumns: { type: 'number' },
  cellTemplate: { type: 'function' },
  headerTemplate: { type: 'function' },
  onViewportChange: { type: 'function' },
  onColumnResize: { type: 'function' },
} as const

/**
 * Нормализует props корневого DataTable node.
 */
export function normalizeDataTableRootProps<Row extends Record<string, any>>(
  props: DataTableRootProps<Row> = {},
): DataTableRootResolvedProps<Row> {
  return {
    ...normalizeCommonProps(props, {
      width: 800,
      height: 480,
      background: '#ffffff',
      color: '#172033',
      fontFamily: 'Inter, Arial, sans-serif',
      fontSize: 13,
      lineHeight: 18,
      clip: true,
    }),
    store: props.store,
    rows: props.rows,
    rowKey: props.rowKey,
    columns: props.columns ?? [],
    pinnedColumns: props.pinnedColumns ?? {},
    pinnedRows: {
      top: props.pinnedRows?.top ?? [],
      bottom: props.pinnedRows?.bottom ?? [],
    },
    rowHeight: Math.max(18, props.rowHeight ?? 36),
    headerHeight: Math.max(24, props.headerHeight ?? 40),
    overscanRows: Math.max(0, props.overscanRows ?? 12),
    overscanColumns: Math.max(0, props.overscanColumns ?? 3),
    cellTemplate: props.cellTemplate,
    headerTemplate: props.headerTemplate,
    onViewportChange: props.onViewportChange,
    onColumnResize: props.onColumnResize,
  }
}

/**
 * Создает descriptor корневого DataTable component.
 */
export function createDataTableRootDescriptor(createNode?: DataTableRootDescriptor['createNode']): DataTableRootDescriptor {
  const descriptor: DataTableRootDescriptor = {
    type: DATATABLE_ROOT_SCHEMA_TYPE,
    name: 'NovaDataTableRoot',
    title: 'Nova DataTable Root',
    version: '0.1.0',
    kind: 'node-component',
    dirtyPolicy: {
      matrix: ['x', 'y'],
      update: [
        'width',
        'height',
        'store',
        'rows',
        'rowKey',
        'columns',
        'pinnedColumns',
        'pinnedRows',
        'rowHeight',
        'headerHeight',
        'overscanRows',
        'overscanColumns',
      ],
      render: ['style', 'background', 'border', 'clip', 'cellTemplate', 'headerTemplate'],
    },
    fields: DATATABLE_ROOT_FIELD_DEFINITIONS,
    normalize: schema => normalizeDataTableRootProps(schema.props),
    measureBounds: (_context, schema: NovaComponentSchema<DataTableRootProps>) => {
      const props = normalizeDataTableRootProps(schema.props)
      return {
        x: props.x,
        y: props.y,
        width: props.width,
        height: props.height,
      }
    },
  }

  if (createNode) descriptor.createNode = createNode
  return descriptor
}

export const DATATABLE_ROOT_NODE_DESCRIPTOR = createDataTableRootDescriptor()
