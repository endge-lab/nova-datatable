import { NOVA_UI_COMMON_FIELD_DEFINITIONS, normalizeCommonProps } from '@endge/nova-ui-kit'
import type { NovaComponentDescriptor, NovaComponentSchema } from '@endge/nova'
import type {
  DataTableInteractionOptions,
  DataTableResolvedInteractionOptions,
  DataTableResolvedScrollbarAxisOptions,
  DataTableResolvedScrollbarOptions,
  DataTableResolvedViewOptions,
  DataTableRootProps,
  DataTableRootResolvedProps,
  DataTableScrollbarOptions,
  DataTableViewOptions,
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
  interaction: { type: 'object' },
  view: { type: 'object' },
  scrollbars: { type: 'object' },
  hoverAlpha: { type: 'number' },
  selectionAlpha: { type: 'number' },
  cellTemplate: { type: 'function' },
  headerTemplate: { type: 'function' },
  interactionLayerTemplate: { type: 'function' },
  scrollbarLayerTemplate: { type: 'function' },
  groupRowTemplate: { type: 'function' },
  groupFooterTemplate: { type: 'function' },
  grandFooterTemplate: { type: 'function' },
  pinnedBottomTemplate: { type: 'function' },
  onViewportChange: { type: 'function' },
  onColumnResize: { type: 'function' },
  onSortChange: { type: 'function' },
  onFilterChange: { type: 'function' },
  onQueryChange: { type: 'function' },
  onRowOrderChange: { type: 'function' },
  onColumnOrderChange: { type: 'function' },
  onGroupingChange: { type: 'function' },
  onGroupToggle: { type: 'function' },
  onCellEnter: { type: 'function' },
  onCellLeave: { type: 'function' },
  onCellClick: { type: 'function' },
  onSelectionChange: { type: 'function' },
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
    interaction: normalizeDataTableInteraction(props.interaction),
    view: normalizeDataTableView(props.view),
    scrollbars: normalizeDataTableScrollbars(props.scrollbars),
    hoverAlpha: finiteUnit((props as DataTableRootResolvedProps<Row>).hoverAlpha, 0),
    selectionAlpha: finiteUnit((props as DataTableRootResolvedProps<Row>).selectionAlpha, 0),
    cellTemplate: props.cellTemplate,
    headerTemplate: props.headerTemplate,
    interactionLayerTemplate: props.interactionLayerTemplate,
    scrollbarLayerTemplate: props.scrollbarLayerTemplate,
    groupRowTemplate: props.groupRowTemplate,
    groupFooterTemplate: props.groupFooterTemplate,
    grandFooterTemplate: props.grandFooterTemplate,
    pinnedBottomTemplate: props.pinnedBottomTemplate,
    onViewportChange: props.onViewportChange,
    onColumnResize: props.onColumnResize,
    onSortChange: props.onSortChange,
    onFilterChange: props.onFilterChange,
    onQueryChange: props.onQueryChange,
    onRowOrderChange: props.onRowOrderChange,
    onColumnOrderChange: props.onColumnOrderChange,
    onGroupingChange: props.onGroupingChange,
    onGroupToggle: props.onGroupToggle,
    onCellEnter: props.onCellEnter,
    onCellLeave: props.onCellLeave,
    onCellClick: props.onCellClick,
    onSelectionChange: props.onSelectionChange,
  }
}

export function normalizeDataTableView(view: DataTableViewOptions | undefined): DataTableResolvedViewOptions {
  return {
    sorting: view?.sorting === false
      ? false
      : {
          mode: view?.sorting?.mode ?? 'hybrid',
          multi: view?.sorting?.multi ?? true,
          controlled: view?.sorting?.controlled ?? false,
          initial: view?.sorting?.initial ?? [],
        },
    filtering: view?.filtering === false
      ? false
      : {
          mode: view?.filtering?.mode ?? 'hybrid',
          controlled: view?.filtering?.controlled ?? false,
          initial: view?.filtering?.initial ?? [],
        },
    rowOrdering: view?.rowOrdering === false
      ? false
      : {
          enabled: view?.rowOrdering?.enabled ?? false,
          mode: view?.rowOrdering?.mode ?? 'view',
          manualLayer: view?.rowOrdering?.manualLayer ?? true,
        },
    columnOrdering: view?.columnOrdering === false
      ? false
      : {
          enabled: view?.columnOrdering?.enabled ?? false,
          allowCrossPinned: view?.columnOrdering?.allowCrossPinned ?? false,
          order: view?.columnOrdering?.order ?? [],
        },
    filterUi: view?.filterUi === false
      ? false
      : {
          headerMenu: view?.filterUi?.headerMenu ?? false,
          filterRow: view?.filterUi?.filterRow ?? false,
        },
    grouping: view?.grouping === false
      ? false
      : {
          enabled: view?.grouping?.enabled ?? false,
          mode: view?.grouping?.mode ?? 'hybrid',
          groups: view?.grouping?.groups ?? [],
          expanded: view?.grouping?.expanded ?? 'all',
          showGroupRows: view?.grouping?.showGroupRows ?? true,
          showGroupFooters: view?.grouping?.showGroupFooters ?? false,
          showGrandFooter: view?.grouping?.showGrandFooter ?? false,
          footerPlacement: view?.grouping?.footerPlacement ?? 'scroll',
          controlled: view?.grouping?.controlled ?? false,
        },
  }
}

export function normalizeDataTableScrollbars(
  scrollbars: false | DataTableScrollbarOptions | undefined,
): false | DataTableResolvedScrollbarOptions {
  if (scrollbars === false) return false

  const base = normalizeDataTableScrollbarAxis(scrollbars)
  return {
    ...base,
    hideDelay: Math.max(0, finiteNumber(scrollbars?.hideDelay, 650)),
    horizontal: scrollbars?.horizontal === false
      ? false
      : normalizeDataTableScrollbarAxis({
          ...scrollbars,
          ...(scrollbars?.horizontal ?? {}),
        }),
    vertical: scrollbars?.vertical === false
      ? false
      : normalizeDataTableScrollbarAxis({
          ...scrollbars,
          ...(scrollbars?.vertical ?? {}),
        }),
    nativeRenderer: scrollbars?.nativeRenderer ?? true,
  }
}

function normalizeDataTableScrollbarAxis(
  options: DataTableScrollbarOptions | NonNullable<DataTableScrollbarOptions['horizontal']> | undefined,
): DataTableResolvedScrollbarAxisOptions {
  return {
    visibility: options?.visibility ?? 'always',
    thickness: Math.max(3, finiteNumber(options?.thickness, 4)),
    minThumbSize: Math.max(12, finiteNumber(options?.minThumbSize, 28)),
    radius: Math.max(0, finiteNumber(options?.radius, 3)),
    trackColor: options?.trackColor ?? 'rgba(23, 32, 51, 0.10)',
    thumbColor: options?.thumbColor ?? 'rgba(23, 32, 51, 0.38)',
    thumbHoverColor: options?.thumbHoverColor ?? options?.thumbColor ?? 'rgba(23, 32, 51, 0.55)',
    className: options?.className,
  }
}

export function normalizeDataTableInteraction(
  interaction: DataTableInteractionOptions | undefined,
): DataTableResolvedInteractionOptions {
  const hover = interaction?.hover === false
    ? false
    : {
        mode: interaction?.hover?.mode ?? 'row-column',
        rowColor: interaction?.hover?.rowColor ?? 'rgba(37, 99, 235, 0.08)',
        columnColor: interaction?.hover?.columnColor ?? 'rgba(14, 165, 233, 0.07)',
        cellColor: interaction?.hover?.cellColor ?? 'rgba(250, 204, 21, 0.16)',
        pinned: interaction?.hover?.pinned ?? true,
      } satisfies Required<NonNullable<Exclude<DataTableInteractionOptions['hover'], false>>>
  const selection = interaction?.selection === false
    ? false
    : {
        mode: interaction?.selection?.mode ?? 'cell',
        color: interaction?.selection?.color ?? 'rgba(37, 99, 235, 0.18)',
        borderColor: interaction?.selection?.borderColor ?? '#2563eb',
      } satisfies Required<NonNullable<Exclude<DataTableInteractionOptions['selection'], false>>>
  const motion = interaction?.motion === false
    ? false
    : {
        hover: {
          duration: 120,
          easing: 'outCubic' as const,
          ...(interaction?.motion?.hover ?? {}),
        },
        selection: {
          duration: 140,
          easing: 'outCubic' as const,
          ...(interaction?.motion?.selection ?? {}),
        },
        cells: interaction?.motion?.cells === false || interaction?.motion?.cells === undefined
          ? false
          : {
              enter: interaction.motion.cells.enter ?? 'fade',
              duration: interaction.motion.cells.duration ?? 90,
              stagger: interaction.motion.cells.stagger ?? 4,
              maxAnimatedCells: interaction.motion.cells.maxAnimatedCells ?? 120,
            },
      } satisfies DataTableResolvedInteractionOptions['motion']

  return {
    hover,
    selection,
    motion,
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
        'interaction',
        'view',
        'scrollbars',
      ],
      render: [
        'style',
        'background',
        'border',
        'clip',
        'hoverAlpha',
        'selectionAlpha',
        'cellTemplate',
        'headerTemplate',
        'interactionLayerTemplate',
        'scrollbarLayerTemplate',
        'groupRowTemplate',
        'groupFooterTemplate',
        'grandFooterTemplate',
        'pinnedBottomTemplate',
      ],
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

function finiteUnit(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : fallback
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}
