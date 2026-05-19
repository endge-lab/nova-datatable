import { NOVA_UI_COMMON_FIELD_DEFINITIONS, normalizeCommonProps, normalizeNovaScrollbarVisualOptions } from '@endge/nova-ui-kit'
import type { NovaComponentDescriptor, NovaComponentSchema } from '@endge/nova'
import type {
  DataTableInteractionOptions,
  DataTableClipboardOptions,
  DataTablePerformanceOptions,
  DataTableEditingOptions,
  DataTableEditTrigger,
  DataTableScrollbarAxisOptions,
  DataTableResolvedInteractionOptions,
  DataTableResolvedClipboardOptions,
  DataTableResolvedPerformanceOptions,
  DataTableResolvedEditingOptions,
  DataTableResolvedSelectionOptions,
  DataTableResolvedScrollbarAxisOptions,
  DataTableResolvedScrollbarOptions,
  DataTableResolvedTextSelectionOptions,
  DataTableResolvedTooltipOptions,
  DataTableResolvedViewOptions,
  DataTableResolvedZoomOptions,
  DataTableRootProps,
  DataTableRootResolvedProps,
  DataTableSelectionOptions,
  DataTableScrollbarOptions,
  DataTableTextSelectionOptions,
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
  selection: { type: 'any' },
  clipboard: { type: 'any' },
  view: { type: 'object' },
  scrollbars: { type: 'any' },
  tooltip: { type: 'any' },
  textSelection: { type: 'any' },
  zoom: { type: 'any' },
  editing: { type: 'any' },
  performance: { type: 'object' },
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
  onSearchChange: { type: 'function' },
  onQueryChange: { type: 'function' },
  onRowOrderChange: { type: 'function' },
  onColumnOrderChange: { type: 'function' },
  onGroupingChange: { type: 'function' },
  onGroupToggle: { type: 'function' },
  onCellEnter: { type: 'function' },
  onCellLeave: { type: 'function' },
  onCellClick: { type: 'function' },
  onSelectionChange: { type: 'function' },
  onSelectionPreviewChange: { type: 'function' },
  onActiveCellChange: { type: 'function' },
  onBeforeCopy: { type: 'function' },
  onCopy: { type: 'function' },
  onBeforePaste: { type: 'function' },
  onPasteCommit: { type: 'function' },
  onPasteError: { type: 'function' },
  onZoomChange: { type: 'function' },
  onEditingChange: { type: 'function' },
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
    selection: normalizeDataTableSelection(props.selection, props.interaction),
    clipboard: normalizeDataTableClipboard(props.clipboard),
    view: normalizeDataTableView(props.view),
    scrollbars: normalizeDataTableScrollbars(props.scrollbars, {
      trackColor: common.trackColor,
      thumbColor: common.thumbColor,
      thumbHoverColor: common.hoverBackground,
    }),
    tooltip: normalizeDataTableTooltip(props.tooltip),
    textSelection: normalizeDataTableTextSelection(props.textSelection),
    zoom: normalizeDataTableZoom(props.zoom),
    editing: normalizeDataTableEditing(props.editing),
    performance: normalizeDataTablePerformance(props.performance),
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
    onSearchChange: props.onSearchChange,
    onQueryChange: props.onQueryChange,
    onRowOrderChange: props.onRowOrderChange,
    onColumnOrderChange: props.onColumnOrderChange,
    onGroupingChange: props.onGroupingChange,
    onGroupToggle: props.onGroupToggle,
    onCellEnter: props.onCellEnter,
    onCellLeave: props.onCellLeave,
    onCellClick: props.onCellClick,
    onSelectionChange: props.onSelectionChange,
    onSelectionPreviewChange: props.onSelectionPreviewChange,
    onActiveCellChange: props.onActiveCellChange,
    onBeforeCopy: props.onBeforeCopy,
    onCopy: props.onCopy,
    onBeforePaste: props.onBeforePaste,
    onPasteCommit: props.onPasteCommit,
    onPasteError: props.onPasteError,
    onZoomChange: props.onZoomChange,
    onEditingChange: props.onEditingChange,
  }
}

export function normalizeDataTableEditing<Row extends Record<string, any>>(
  editing: false | DataTableEditingOptions<Row> | undefined,
): false | DataTableResolvedEditingOptions<Row> {
  if (editing === false) return false

  return {
    renderer: 'dom-overlay',
    mode: 'cell',
    trigger: normalizeEditTriggers(editing?.trigger),
    commitOnBlur: editing?.commitOnBlur ?? true,
    commitOnEnter: editing?.commitOnEnter ?? true,
    cancelOnEscape: editing?.cancelOnEscape ?? true,
    selectTextOnStart: editing?.selectTextOnStart ?? true,
    optimistic: editing?.optimistic ?? true,
    className: editing?.className ?? '',
    onBeforeEditStart: editing?.onBeforeEditStart,
    onEditStart: editing?.onEditStart,
    onEditCommit: editing?.onEditCommit,
    onEditCancel: editing?.onEditCancel,
    onEditError: editing?.onEditError,
  }
}

export function normalizeDataTablePerformance(
  performance: DataTablePerformanceOptions | undefined,
): DataTableResolvedPerformanceOptions {
  return {
    pageSize: Math.max(32, Math.min(8192, Math.floor(finiteNumber(performance?.pageSize, 512)))),
    maxClientRows: Math.max(1_000, Math.floor(finiteNumber(performance?.maxClientRows, 100_000))),
    deltaFrameBudgetMs: finiteClamp(performance?.deltaFrameBudgetMs, 1, 32, 6),
    workerPipeline: performance?.workerPipeline ?? true,
  }
}

export function normalizeDataTableView(view: DataTableViewOptions | undefined): DataTableResolvedViewOptions {
  return {
    sorting: view?.sorting === false
      ? false
      : {
          mode: view?.sorting?.mode ?? 'hybrid',
          multi: view?.sorting?.multi ?? true,
          headerClick: view?.sorting?.headerClick ?? 'append',
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
    search: view?.search === false
      ? false
      : {
          mode: view?.search?.mode ?? 'hybrid',
          scope: view?.search?.scope ?? 'cells',
          match: view?.search?.match ?? 'contains',
          caseSensitive: view?.search?.caseSensitive ?? false,
          columns: view?.search?.columns ?? [],
          highlight: view?.search?.highlight ?? 'cell-text',
          filter: view?.search?.filter ?? true,
          highlightColor: view?.search?.highlightColor ?? '#b45309',
          activeHighlightColor: view?.search?.activeHighlightColor ?? '#be123c',
          controlled: view?.search?.controlled ?? false,
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

export function normalizeDataTableSelection(
  selection: false | DataTableSelectionOptions | undefined,
  interaction?: DataTableInteractionOptions,
): false | DataTableResolvedSelectionOptions {
  if (selection === false) return false
  if (selection === undefined && interaction?.selection === false) return false
  const interactionSelection = interaction?.selection !== false ? interaction?.selection : undefined
  const mode = selection?.mode ?? interactionSelection?.mode ?? 'cell'
  return {
    enabled: selection?.enabled ?? true,
    mode,
    cardinality: selection?.cardinality ?? 'single',
    allowedUnits: {
      cells: selection?.allowedUnits?.cells ?? (mode === 'cell' || mode === 'mixed'),
      rows: selection?.allowedUnits?.rows ?? (mode === 'row' || mode === 'mixed'),
      columns: selection?.allowedUnits?.columns ?? (mode === 'column' || mode === 'mixed'),
    },
    gestures: {
      dragRange: selection?.gestures?.dragRange ?? false,
      shiftRange: selection?.gestures?.shiftRange ?? true,
      ctrlToggle: selection?.gestures?.ctrlToggle ?? true,
      metaToggle: selection?.gestures?.metaToggle ?? true,
      headerSelectColumn: selection?.gestures?.headerSelectColumn ?? false,
      rowSelect: selection?.gestures?.rowSelect ?? false,
      autoScrollOnDrag: selection?.gestures?.autoScrollOnDrag ?? true,
    },
    behavior: {
      clearOnPlainClick: selection?.behavior?.clearOnPlainClick ?? true,
      selectOnMouseDown: selection?.behavior?.selectOnMouseDown ?? true,
      preserveOnDrag: selection?.behavior?.preserveOnDrag ?? false,
      groupRows: selection?.behavior?.groupRows ?? 'none',
    },
    visuals: {
      fillColor: selection?.visuals?.fillColor ?? interactionSelection?.color ?? 'rgba(37, 99, 235, 0.18)',
      borderColor: selection?.visuals?.borderColor ?? interactionSelection?.borderColor ?? '#2563eb',
      activeCellBorderColor: selection?.visuals?.activeCellBorderColor ?? interactionSelection?.borderColor ?? '#1d4ed8',
      previewFillColor: selection?.visuals?.previewFillColor ?? 'rgba(14, 165, 233, 0.14)',
    },
  }
}

export function normalizeDataTableClipboard<Row extends Record<string, any>>(
  clipboard: false | DataTableClipboardOptions<Row> | undefined,
): false | DataTableResolvedClipboardOptions<Row> {
  if (clipboard === false) return false
  const copy = clipboard?.copy === false
    ? false
    : {
        format: typeof clipboard?.copy === 'object' ? clipboard.copy.format ?? 'tsv' : 'tsv',
        includeHeaders: typeof clipboard?.copy === 'object' ? clipboard.copy.includeHeaders ?? false : false,
        onlyVisibleColumns: typeof clipboard?.copy === 'object' ? clipboard.copy.onlyVisibleColumns ?? true : true,
      }
  const paste = clipboard?.paste === false
    ? false
    : {
        enabled: clipboard?.paste?.enabled ?? true,
        parseFormat: clipboard?.paste?.parseFormat ?? 'auto',
        overflow: clipboard?.paste?.overflow ?? 'clip',
        invalid: clipboard?.paste?.invalid ?? 'reject',
        readonly: clipboard?.paste?.readonly ?? 'skip',
        commit: clipboard?.paste?.commit ?? 'optimistic',
      }
  return {
    copy,
    paste,
    onBeforeCopy: clipboard?.onBeforeCopy,
    onCopy: clipboard?.onCopy,
    onBeforePaste: clipboard?.onBeforePaste,
    onPasteCommit: clipboard?.onPasteCommit,
    onPasteError: clipboard?.onPasteError,
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

export function normalizeDataTableTextSelection(
  textSelection: false | DataTableTextSelectionOptions | undefined,
): false | DataTableResolvedTextSelectionOptions {
  if (textSelection === false) return false

  return {
    enabled: textSelection?.enabled ?? false,
    mode: textSelection?.mode ?? 'visible-cells',
    cellText: textSelection?.cellText ?? true,
    headerText: textSelection?.headerText ?? true,
    pinnedRows: textSelection?.pinnedRows ?? true,
    copyFormat: textSelection?.copyFormat ?? 'tsv',
    selectionColor: textSelection?.selectionColor ?? 'rgba(37, 99, 235, 0.24)',
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
        'selection',
        'clipboard',
        'view',
        'scrollbars',
        'tooltip',
        'textSelection',
        'zoom',
        'editing',
        'performance',
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

function normalizeEditTriggers(trigger: DataTableEditingOptions['trigger']): Array<DataTableEditTrigger> {
  const defaults: Array<DataTableEditTrigger> = ['doubleClick', 'enter', 'programmatic']
  const source = Array.isArray(trigger) ? trigger : trigger ? [trigger] : defaults
  const allowed = new Set<DataTableEditTrigger>(defaults)
  const normalized = source.filter((item): item is DataTableEditTrigger => allowed.has(item as DataTableEditTrigger))
  return normalized.length > 0 ? [...new Set(normalized)] : defaults
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function finiteClamp(value: unknown, min: number, max: number, fallback: number): number {
  const next = finiteNumber(value, fallback)
  return Math.max(min, Math.min(max, next))
}
