import { NOVA_UI_COMMON_FIELD_DEFINITIONS, normalizeCommonProps, normalizeNovaScrollbarVisualOptions } from '@endge/nova-ui-kit'
import type { NovaComponentDescriptor, NovaComponentSchema } from '@endge/nova'
import type {
  DataTableInteractionOptions,
  DataTableScrollbarAxisOptions,
  DataTableResolvedInteractionOptions,
  DataTableResolvedScrollbarAxisOptions,
  DataTableResolvedScrollbarOptions,
  DataTableResolvedTooltipOptions,
  DataTableResolvedViewOptions,
  DataTableResolvedZoomOptions,
  DataTableRootProps,
  DataTableRootResolvedProps,
  DataTableScrollbarOptions,
  DataTableTooltipOptions,
  DataTableViewOptions,
  DataTableZoomAffect,
  DataTableZoomOptions,
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
  scrollbars: { type: 'any' },
  tooltip: { type: 'any' },
  zoom: { type: 'any' },
  hoverAlpha: { type: 'number' },
  selectionAlpha: { type: 'number' },
  tooltipAlpha: { type: 'number' },
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
  const common = normalizeCommonProps(props, {
    width: 800,
    height: 480,
    background: '#ffffff',
    color: '#172033',
    fontFamily: 'Inter, Arial, sans-serif',
    fontSize: 13,
    lineHeight: 18,
    clip: true,
  })
  return {
    ...common,
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
    scrollbars: normalizeDataTableScrollbars(props.scrollbars, {
      trackColor: common.trackColor,
      thumbColor: common.thumbColor,
      thumbHoverColor: common.hoverBackground,
    }),
    tooltip: normalizeDataTableTooltip(props.tooltip),
    zoom: normalizeDataTableZoom(props.zoom),
    hoverAlpha: finiteUnit((props as DataTableRootResolvedProps<Row>).hoverAlpha, 0),
    selectionAlpha: finiteUnit((props as DataTableRootResolvedProps<Row>).selectionAlpha, 0),
    tooltipAlpha: finiteUnit((props as DataTableRootResolvedProps<Row>).tooltipAlpha, 0),
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
  defaults: Pick<DataTableScrollbarOptions, 'trackColor' | 'thumbColor' | 'thumbHoverColor'> = {},
): false | DataTableResolvedScrollbarOptions {
  if (scrollbars === false) return false

  const base = normalizeDataTableScrollbarAxis(scrollbars, defaults)
  return {
    ...base,
    hideDelay: Math.max(0, finiteNumber(scrollbars?.hideDelay, 650)),
    horizontal: scrollbars?.horizontal === false
      ? false
      : normalizeDataTableScrollbarAxis({
          ...scrollbars,
          ...(scrollbars?.horizontal ?? {}),
        }, defaults),
    vertical: scrollbars?.vertical === false
      ? false
      : normalizeDataTableScrollbarAxis({
          ...scrollbars,
          ...(scrollbars?.vertical ?? {}),
        }, defaults),
    nativeRenderer: scrollbars?.nativeRenderer ?? true,
  }
}

export function normalizeDataTableTooltip<Row extends Record<string, any>>(
  tooltip: false | DataTableTooltipOptions<Row> | undefined,
): false | DataTableResolvedTooltipOptions<Row> {
  if (tooltip === false) return false

  return {
    enabled: tooltip?.enabled ?? true,
    modifier: tooltip?.modifier ?? 'shift',
    placement: tooltip?.placement ?? 'cursor',
    delay: Math.max(0, finiteNumber(tooltip?.delay, 180)),
    hideDelay: Math.max(0, finiteNumber(tooltip?.hideDelay, 80)),
    followCursor: tooltip?.followCursor ?? true,
    collision: {
      boundary: tooltip?.collision?.boundary ?? 'canvas',
      padding: Math.max(0, finiteNumber(tooltip?.collision?.padding, 8)),
      flip: tooltip?.collision?.flip ?? true,
      shift: tooltip?.collision?.shift ?? true,
    },
    animation: tooltip?.animation === false
      ? false
      : {
          type: tooltip?.animation?.type ?? 'fade-scale',
          duration: Math.max(0, finiteNumber(tooltip?.animation?.duration, 140)),
          easing: tooltip?.animation?.easing ?? 'outCubic',
        },
    className: tooltip?.className ?? 'datatable-cell-tooltip',
    contentClassName: tooltip?.contentClassName ?? 'datatable-cell-tooltip__content',
    width: Math.max(80, finiteNumber(tooltip?.width, 220)),
    height: Math.max(28, finiteNumber(tooltip?.height, 42)),
    background: tooltip?.background ?? 'rgba(15, 23, 42, 0.94)',
    color: tooltip?.color ?? '#ffffff',
    border: tooltip?.border ?? { color: 'rgba(255, 255, 255, 0.14)', width: 1, radius: 8 },
    padding: tooltip?.padding ?? { left: 10, right: 10, top: 8, bottom: 8 },
    fontFamily: tooltip?.fontFamily ?? 'Inter, Arial, sans-serif',
    fontSize: Math.max(10, finiteNumber(tooltip?.fontSize, 12)),
    fontWeight: tooltip?.fontWeight ?? '500',
    lineHeight: Math.max(10, finiteNumber(tooltip?.lineHeight, 16)),
    defaultContent: tooltip?.defaultContent ?? true,
    content: tooltip?.content,
  }
}

export function normalizeDataTableZoom(
  zoom: false | DataTableZoomOptions | undefined,
): false | DataTableResolvedZoomOptions {
  if (zoom === false) return false

  const min = finiteClamp(zoom?.min, 0.4, 2, 0.65)
  const max = Math.max(min, finiteClamp(zoom?.max, min, 3, 1.5))
  const value = finiteClamp(zoom?.value, min, max, 1)
  const mode = zoom?.mode ?? 'density'
  const affects = normalizeZoomAffects(zoom?.affects, mode)
  const rowScale = normalizeZoomScale(value, affects.includes('rows'), zoom?.rowScale)
  const headerScale = normalizeZoomScale(value, affects.includes('headers'), zoom?.headerScale)
  const columnScale = normalizeZoomScale(value, affects.includes('columns'), zoom?.columnScale)
  const textScale = normalizeZoomScale(value, affects.includes('text'), zoom?.textScale)
  const iconScale = normalizeZoomScale(value, affects.includes('icons'), zoom?.iconScale)

  return {
    value,
    min,
    max,
    mode,
    affects,
    rowScale,
    headerScale,
    columnScale,
    textScale,
    iconScale,
    preserveAnchor: zoom?.preserveAnchor ?? 'pointer',
    wheel: zoom?.wheel === false
        ? false
        : {
          enabled: zoom?.wheel?.enabled ?? true,
          modifier: zoom?.wheel?.modifier ?? 'ctrl',
          pinch: zoom?.wheel?.pinch ?? true,
          step: finiteClamp(zoom?.wheel?.step, 0.01, 0.5, 0.08),
        },
  }
}

function normalizeZoomAffects(
  affects: Array<DataTableZoomAffect> | undefined,
  mode: DataTableResolvedZoomOptions['mode'],
): Array<DataTableZoomAffect> {
  const defaults: Record<DataTableResolvedZoomOptions['mode'], Array<DataTableZoomAffect>> = {
    density: ['rows', 'headers', 'text', 'icons'],
    layout: ['rows', 'headers', 'columns', 'text', 'icons'],
    text: ['text'],
    custom: ['rows', 'headers', 'text', 'icons'],
  }
  const source = affects?.length ? affects : defaults[mode]
  const allowed: Array<DataTableZoomAffect> = ['rows', 'headers', 'columns', 'text', 'icons']
  return allowed.filter(item => source.includes(item))
}

function normalizeZoomScale(value: number, affected: boolean, scale: unknown): number {
  if (typeof scale === 'number' && Number.isFinite(scale)) return finiteClamp(scale, 0.35, 3, 1)
  return finiteClamp(affected ? value : 1, 0.35, 3, 1)
}

function normalizeDataTableScrollbarAxis(
  options: DataTableScrollbarOptions | DataTableScrollbarAxisOptions | undefined,
  defaults: Pick<DataTableScrollbarOptions, 'trackColor' | 'thumbColor' | 'thumbHoverColor'> = {},
): DataTableResolvedScrollbarAxisOptions {
  return normalizeNovaScrollbarVisualOptions(options, {
    visibility: 'always',
    thickness: 4,
    minThumbSize: 28,
    radius: 3,
    trackColor: defaults.trackColor ?? 'rgba(23, 32, 51, 0.10)',
    thumbColor: defaults.thumbColor ?? 'rgba(23, 32, 51, 0.38)',
    thumbHoverColor: defaults.thumbHoverColor ?? options?.thumbColor ?? defaults.thumbColor ?? 'rgba(23, 32, 51, 0.55)',
  }) as DataTableResolvedScrollbarAxisOptions
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
        'tooltip',
        'zoom',
      ],
      render: [
        'style',
        'background',
        'border',
        'clip',
        'hoverAlpha',
        'selectionAlpha',
        'tooltipAlpha',
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

function finiteClamp(value: unknown, min: number, max: number, fallback: number): number {
  const next = finiteNumber(value, fallback)
  return Math.max(min, Math.min(max, next))
}
