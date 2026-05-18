<script setup lang="ts">
import { computed, defineComponent, nextTick, ref, useSlots, watch } from 'vue'
import {
  Nova,
  RaphSchedulerType,
  RendererType,
  type NovaAppCreateOptions,
  type NovaSchemaPlugin,
} from '@endge/nova'
import { NovaCanvas, type NovaCanvasReadyPayload } from '@endge/nova-vue'
import { registerNovaUIKit } from '@endge/nova-ui-kit'
import {
  type DataTableCellContext,
  type DataTableColumnResizePayload,
  type DataTableColumnInput,
  type DataTableDomEditorContext,
  type DataTableEditingOptions,
  type DataTableEditingState,
  type DataTableEditCommitPayload,
  type DataTableEditError,
  type DataTableInteractionOptions,
  type DataTablePinnedColumns,
  type DataTablePinnedRows,
  type DataTableColumnReorderPayload,
  type DataTableFilterExpression,
  type DataTableFilterState,
  type DataTableGroupingState,
  type DataTableGroupNode,
  type DataTableGroupRule,
  type DataTableGroupTemplate,
  type DataTableQueryState,
  type DataTableRowReorderPayload,
  type DataTableRowKey,
  type DataTableRootOptions,
  type DataTableScrollbarLayerTemplate,
  type DataTableScrollbarOptions,
  type DataTableSearchState,
  type DataTableSelectionState,
  type DataTableSortState,
  type DataTableStoreApi,
  type DataTableTemplate,
  type DataTableTooltipOptions,
  type DataTableViewOptions,
  type DataTableViewState,
  type DataTableViewport,
  type DataTableZoomOptions,
  type DataTableZoomState,
  NovaDataTableSchema,
  type NovaDataTableRef,
} from '@/model/types/datatable.types'
import { registerNovaDataTable } from '@/ui/root/datatable-root.registry'
import { compileDataTableDslNodes, createSlotTemplate } from '@/vue/datatable-slot-templates'

type BaseRow = Record<string, any>

interface DataTableVueProps {
  store?: DataTableStoreApi<BaseRow>
  rows?: Array<BaseRow>
  data?: Array<BaseRow>
  rowKey?: DataTableRowKey<BaseRow>
  columns?: Array<DataTableColumnInput<BaseRow>>
  pinnedColumns?: DataTablePinnedColumns
  pinnedRows?: DataTablePinnedRows<BaseRow>
  rowHeight?: number
  headerHeight?: number
  overscanRows?: number
  overscanColumns?: number
  interaction?: DataTableInteractionOptions
  view?: DataTableViewOptions
  scrollbars?: false | DataTableScrollbarOptions
  tooltip?: false | DataTableTooltipOptions<BaseRow>
  zoom?: false | DataTableZoomOptions
  editing?: false | DataTableEditingOptions<BaseRow>
  cellTemplate?: DataTableTemplate<BaseRow>
  headerTemplate?: DataTableTemplate<BaseRow>
  scrollbarLayerTemplate?: DataTableScrollbarLayerTemplate<BaseRow>
  groupRowTemplate?: DataTableGroupTemplate<BaseRow>
  groupFooterTemplate?: DataTableGroupTemplate<BaseRow>
  grandFooterTemplate?: DataTableGroupTemplate<BaseRow>
  pinnedBottomTemplate?: DataTableGroupTemplate<BaseRow>
  onViewportChange?: (viewport: DataTableViewport) => void
  onColumnResize?: (payload: DataTableColumnResizePayload<BaseRow>) => void
  onSortChange?: (state: DataTableSortState) => void
  onFilterChange?: (state: DataTableFilterState | DataTableFilterExpression) => void
  onSearchChange?: (state: DataTableSearchState) => void
  onQueryChange?: (query: DataTableQueryState) => void
  onRowOrderChange?: (payload: DataTableRowReorderPayload) => void
  onColumnOrderChange?: (payload: DataTableColumnReorderPayload) => void
  onGroupingChange?: (state: DataTableGroupingState<BaseRow>) => void
  onGroupToggle?: (group: DataTableGroupNode<BaseRow>) => void
  onCellEnter?: (context: DataTableCellContext<BaseRow>) => void
  onCellLeave?: (context: DataTableCellContext<BaseRow>) => void
  onCellClick?: (context: DataTableCellContext<BaseRow>) => void
  onSelectionChange?: (selection: DataTableSelectionState | null) => void
  onZoomChange?: (state: DataTableZoomState) => void
  onEditingChange?: (state: DataTableEditingState<BaseRow> | null) => void
  width?: number | string
  height?: number | string
  maxDpr?: number
  renderer?: RendererType | 'webgl' | 'web2d' | '2d'
  loop?: boolean
  devtools?: boolean | { id?: string; label?: string }
}

const props = withDefaults(defineProps<DataTableVueProps>(), {
  store: undefined,
  rows: undefined,
  data: undefined,
  rowKey: undefined,
  width: '100%',
  height: '100%',
  maxDpr: 2,
  renderer: RendererType.WebGL,
  loop: false,
  rowHeight: 36,
  headerHeight: 40,
  overscanRows: 16,
  overscanColumns: 4,
  interaction: undefined,
  view: undefined,
  scrollbars: undefined,
  tooltip: undefined,
  zoom: undefined,
  editing: undefined,
  cellTemplate: undefined,
  headerTemplate: undefined,
  scrollbarLayerTemplate: undefined,
  groupRowTemplate: undefined,
  groupFooterTemplate: undefined,
  grandFooterTemplate: undefined,
  pinnedBottomTemplate: undefined,
  onViewportChange: undefined,
  onColumnResize: undefined,
  onSortChange: undefined,
  onFilterChange: undefined,
  onSearchChange: undefined,
  onQueryChange: undefined,
  onRowOrderChange: undefined,
  onColumnOrderChange: undefined,
  onGroupingChange: undefined,
  onGroupToggle: undefined,
  onCellEnter: undefined,
  onCellLeave: undefined,
  onCellClick: undefined,
  onSelectionChange: undefined,
  onZoomChange: undefined,
  onEditingChange: undefined,
  devtools: undefined,
  columns: () => [],
  pinnedColumns: () => ({}),
  pinnedRows: () => ({}),
})

const emit = defineEmits<{
  (event: 'ready', payload: NovaCanvasReadyPayload): void
  (event: 'destroy'): void
  (event: 'viewport-change', viewport: DataTableViewport): void
  (event: 'column-resize', payload: DataTableColumnResizePayload<BaseRow>): void
  (event: 'sort-change', state: DataTableSortState): void
  (event: 'filter-change', state: DataTableFilterState | DataTableFilterExpression): void
  (event: 'search-change', state: DataTableSearchState): void
  (event: 'query-change', query: DataTableQueryState): void
  (event: 'row-order-change', payload: DataTableRowReorderPayload): void
  (event: 'column-order-change', payload: DataTableColumnReorderPayload): void
  (event: 'grouping-change', state: DataTableGroupingState<BaseRow>): void
  (event: 'group-toggle', group: DataTableGroupNode<BaseRow>): void
  (event: 'cell-enter', context: DataTableCellContext<BaseRow>): void
  (event: 'cell-leave', context: DataTableCellContext<BaseRow>): void
  (event: 'cell-click', context: DataTableCellContext<BaseRow>): void
  (event: 'selection-change', selection: DataTableSelectionState | null): void
  (event: 'zoom-change', state: DataTableZoomState): void
  (event: 'editing-change', state: DataTableEditingState<BaseRow> | null): void
  (event: 'edit-start', state: DataTableEditingState<BaseRow>): void
  (event: 'edit-commit', payload: DataTableEditCommitPayload<BaseRow>): void
  (event: 'edit-cancel', state: DataTableEditingState<BaseRow>): void
  (event: 'edit-error', error: DataTableEditError<BaseRow>): void
}>()

const slots = useSlots()
const NovaDataTable = NovaDataTableSchema
const dataTableRoot = Nova.ref<NovaDataTableRef<BaseRow>>('dataTableRoot')
const plugins: Array<NovaSchemaPlugin> = [registerNovaUIKit, registerNovaDataTable]
const editingState = ref<DataTableEditingState<BaseRow> | null>(null)
const editorDraft = ref<unknown>(undefined)
const editorElement = ref<HTMLInputElement | HTMLSelectElement | null>(null)

const DataTableDomEditorSlot = defineComponent({
  name: 'DataTableDomEditorSlot',
  props: {
    template: {
      type: Function,
      required: true,
    },
    context: {
      type: Object,
      required: true,
    },
  },
  setup(componentProps) {
    return () => componentProps.template(componentProps.context)
  },
})

const compiledDsl = computed(() => compileDataTableDslNodes<BaseRow>(slots.default?.() ?? []))
const rootRows = computed(() => (props.store ? undefined : props.rows ?? props.data ?? []))
const rootColumns = computed(() => [
  ...(props.columns ?? []),
  ...compiledDsl.value.columns,
])
const rootPinnedRows = computed(() => ({
  top: [
    ...(props.pinnedRows?.top ?? []),
    ...(compiledDsl.value.pinnedRows.top ?? []),
  ],
  bottom: [
    ...(props.pinnedRows?.bottom ?? []),
    ...(compiledDsl.value.pinnedRows.bottom ?? []),
  ],
}))
const rootView = computed<DataTableViewOptions | undefined>(() => {
  if (!compiledDsl.value.grouping) return props.view
  return {
    ...(props.view ?? {}),
    grouping: props.view?.grouping ?? compiledDsl.value.grouping,
  }
})
const rootCellTemplate = computed<DataTableTemplate<BaseRow> | undefined>(() => (
  props.cellTemplate ?? createSlotTemplate<BaseRow>(
    slots.cell as ((context: Parameters<DataTableTemplate<BaseRow>>[0]) => Array<any>) | undefined,
  )
))
const rootHeaderTemplate = computed<DataTableTemplate<BaseRow> | undefined>(() => (
  props.headerTemplate ?? createSlotTemplate<BaseRow>(
    slots.header as ((context: Parameters<DataTableTemplate<BaseRow>>[0]) => Array<any>) | undefined,
  )
))
const rootInteractionLayerTemplate = computed(() => compiledDsl.value.interactionLayerTemplate)
const rootScrollbarLayerTemplate = computed(() => props.scrollbarLayerTemplate ?? compiledDsl.value.scrollbarLayerTemplate)
const rootGroupRowTemplate = computed(() => props.groupRowTemplate ?? compiledDsl.value.groupRowTemplate)
const rootGroupFooterTemplate = computed(() => props.groupFooterTemplate ?? compiledDsl.value.groupFooterTemplate)
const rootGrandFooterTemplate = computed(() => props.grandFooterTemplate ?? compiledDsl.value.grandFooterTemplate)
const rootPinnedBottomTemplate = computed(() => props.pinnedBottomTemplate ?? compiledDsl.value.pinnedBottomTemplate)
const devtools = computed(() => props.devtools)
const rootEditing = computed<false | DataTableEditingOptions<BaseRow>>(() => {
  if (props.editing === false) return false
  return {
    ...(props.editing ?? {}),
    onEditStart: state => {
      if (props.editing && props.editing !== false) props.editing.onEditStart?.(state)
      emit('edit-start', state)
    },
    onEditCommit: async payload => {
      if (props.editing && props.editing !== false) await props.editing.onEditCommit?.(payload)
      emit('edit-commit', payload)
    },
    onEditCancel: state => {
      if (props.editing && props.editing !== false) props.editing.onEditCancel?.(state)
      emit('edit-cancel', state)
    },
    onEditError: error => {
      if (props.editing && props.editing !== false) props.editing.onEditError?.(error)
      emit('edit-error', error)
    },
  }
})
const activeEditorType = computed(() => {
  const editor = editingState.value?.column.editor
  if (typeof editor === 'string') return editor
  if (typeof editor === 'object') return editor.type
  return 'text'
})
const activeEditorOptions = computed(() => {
  const editor = editingState.value?.column.editor
  return typeof editor === 'object' ? editor.options ?? editingState.value?.column.editorOptions : editingState.value?.column.editorOptions
})
const editorClass = computed(() => {
  const customClass = props.editing && props.editing !== false ? props.editing.className : undefined
  return [
    'nova-datatable__editor',
    editingState.value?.invalid ? 'nova-datatable__editor--invalid' : undefined,
    customClass,
  ].filter(Boolean)
})
const editorControlStyle = computed(() => ({
  width: '100%',
  height: '100%',
  boxSizing: 'border-box',
  margin: '0',
  padding: activeEditorType.value === 'checkbox' ? '0' : '0 8px',
  border: editingState.value?.invalid ? '2px solid #dc2626' : '2px solid #2563eb',
  outline: 'none',
  background: '#ffffff',
  color: '#172033',
  font: 'inherit',
  borderRadius: '3px',
  boxShadow: '0 8px 18px rgba(15, 23, 42, 0.14)',
}))
const editorLayerStyle = computed(() => {
  const rect = editingState.value?.rect
  if (!rect) return {}
  return {
    left: `${rect.x}px`,
    top: `${rect.y}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  }
})
const editorContext = computed<DataTableDomEditorContext<BaseRow> | null>(() => {
  const state = editingState.value
  if (!state) return null
  return {
    ...state,
    draft: editorDraft.value,
    setDraft: setEditorDraft,
    commit: commitEditor,
    cancel: cancelEditor,
  }
})

const appOptions = computed<Partial<NovaAppCreateOptions>>(() => ({
  input: {
    pointer: {
      enabled: true,
      capture: true,
    },
    keyboard: {
      enabled: false,
      scope: 'manual',
    },
  },
  renderer: {
    main: resolveRendererType(props.renderer),
  },
  scheduler: {
    type: RaphSchedulerType.AnimationFrame,
    loop: props.loop,
  },
  debug: {
    enabled: false,
    telemetry: false,
  },
}))

function resolveRendererType(renderer: DataTableVueProps['renderer']): RendererType {
  const rendererValue = String(renderer)
  if (rendererValue === RendererType.Web2D || rendererValue === 'web2d' || rendererValue === '2d') return RendererType.Web2D
  return RendererType.WebGL
}

function ready(payload: NovaCanvasReadyPayload): void {
  emit('ready', payload)
}

function destroy(): void {
  emit('destroy')
}

function handleViewportChange(viewport: DataTableViewport): void {
  props.onViewportChange?.(viewport)
  emit('viewport-change', viewport)
}

function handleColumnResize(payload: DataTableColumnResizePayload<BaseRow>): void {
  props.onColumnResize?.(payload)
  emit('column-resize', payload)
}

function handleSortChange(state: DataTableSortState): void {
  props.onSortChange?.(state)
  emit('sort-change', state)
}

function handleFilterChange(state: DataTableFilterState | DataTableFilterExpression): void {
  props.onFilterChange?.(state)
  emit('filter-change', state)
}

function handleSearchChange(state: DataTableSearchState): void {
  props.onSearchChange?.(state)
  emit('search-change', state)
}

function handleQueryChange(query: DataTableQueryState): void {
  props.onQueryChange?.(query)
  emit('query-change', query)
}

function handleRowOrderChange(payload: DataTableRowReorderPayload): void {
  props.onRowOrderChange?.(payload)
  emit('row-order-change', payload)
}

function handleColumnOrderChange(payload: DataTableColumnReorderPayload): void {
  props.onColumnOrderChange?.(payload)
  emit('column-order-change', payload)
}

function handleGroupingChange(state: DataTableGroupingState<BaseRow>): void {
  props.onGroupingChange?.(state)
  emit('grouping-change', state)
}

function handleGroupToggle(group: DataTableGroupNode<BaseRow>): void {
  props.onGroupToggle?.(group)
  emit('group-toggle', group)
}

function handleCellEnter(context: DataTableCellContext<BaseRow>): void {
  props.onCellEnter?.(context)
  emit('cell-enter', context)
}

function handleCellLeave(context: DataTableCellContext<BaseRow>): void {
  props.onCellLeave?.(context)
  emit('cell-leave', context)
}

function handleCellClick(context: DataTableCellContext<BaseRow>): void {
  props.onCellClick?.(context)
  emit('cell-click', context)
}

function handleSelectionChange(selection: DataTableSelectionState | null): void {
  props.onSelectionChange?.(selection)
  emit('selection-change', selection)
}

function handleZoomChange(state: DataTableZoomState): void {
  props.onZoomChange?.(state)
  emit('zoom-change', state)
}

function handleEditingChange(state: DataTableEditingState<BaseRow> | null): void {
  editingState.value = state
  editorDraft.value = state?.draft
  props.onEditingChange?.(state)
  emit('editing-change', state)
}

function setEditorDraft(value: unknown): void {
  editorDraft.value = value
}

async function commitEditor(value?: unknown): Promise<void> {
  await getRootApi().commitEdit(value === undefined ? editorDraft.value : value)
}

function cancelEditor(): void {
  getRootApi().cancelEdit()
}

function onEditorInput(event: Event): void {
  const target = event.target as HTMLInputElement | HTMLSelectElement
  if (activeEditorType.value === 'checkbox') {
    editorDraft.value = (target as HTMLInputElement).checked
    return
  }
  editorDraft.value = target.value
}

async function onEditorKeydown(event: KeyboardEvent): Promise<void> {
  if (event.key === 'Enter' && resolveEditingOption('commitOnEnter', true)) {
    event.preventDefault()
    await commitEditor()
  }
  if (event.key === 'Escape' && resolveEditingOption('cancelOnEscape', true)) {
    event.preventDefault()
    cancelEditor()
  }
}

async function onEditorBlur(): Promise<void> {
  if (!resolveEditingOption('commitOnBlur', true)) return
  await commitEditor()
}

function resolveEditingOption<Key extends keyof DataTableEditingOptions<BaseRow>>(
  key: Key,
  fallback: NonNullable<DataTableEditingOptions<BaseRow>[Key]>,
): NonNullable<DataTableEditingOptions<BaseRow>[Key]> {
  const editing = props.editing
  if (!editing || editing === false || editing[key] === undefined) return fallback
  return editing[key] as NonNullable<DataTableEditingOptions<BaseRow>[Key]>
}

function normalizeSelectOptions(options: unknown): Array<{ label: string; value: unknown }> {
  const values = typeof options === 'object' && options && 'options' in options
    ? (options as { options?: unknown }).options
    : options
  if (!Array.isArray(values)) return []
  return values.map(item => {
    if (typeof item === 'object' && item && 'value' in item) {
      return {
        label: String((item as { label?: unknown }).label ?? (item as { value: unknown }).value),
        value: (item as { value: unknown }).value,
      }
    }
    return {
      label: String(item),
      value: item,
    }
  })
}

watch(editingState, state => {
  if (!state) return
  nextTick(() => {
    const element = editorElement.value
    if (!element) return
    element.focus()
    if (resolveEditingOption('selectTextOnStart', true) && 'select' in element && typeof element.select === 'function') {
      element.select()
    }
  })
})

function getRootApi(): NovaDataTableRef<BaseRow> {
  return dataTableRoot
}

defineExpose<NovaDataTableRef<BaseRow>>({
  options: (options?: Partial<DataTableRootOptions<BaseRow>>) => getRootApi().options(options),
  data: (rows?: Array<BaseRow>) => getRootApi().data(rows),
  add: (row: BaseRow | Array<BaseRow>) => getRootApi().add(row),
  update: items => getRootApi().update(items),
  remove: ids => getRootApi().remove(ids),
  setRows: rows => getRootApi().setRows(rows),
  replaceRange: (start, rows) => getRootApi().replaceRange(start, rows),
  applyDeltas: deltas => getRootApi().applyDeltas(deltas),
  flushDeltas: () => getRootApi().flushDeltas(),
  setColumnWidth: (columnId, width) => getRootApi().setColumnWidth(columnId, width),
  autosizeColumn: columnId => getRootApi().autosizeColumn(columnId),
  autosizeColumns: columnIds => getRootApi().autosizeColumns(columnIds),
  resetColumnWidth: columnId => getRootApi().resetColumnWidth(columnId),
  scrollTo: (x, y) => getRootApi().scrollTo(x, y),
  scrollToRow: rowIndex => getRootApi().scrollToRow(rowIndex),
  getZoom: () => getRootApi().getZoom(),
  setZoom: value => getRootApi().setZoom(value),
  resetZoom: () => getRootApi().resetZoom(),
  startEdit: (rowId, columnId) => getRootApi().startEdit(rowId, columnId),
  commitEdit: value => getRootApi().commitEdit(value),
  cancelEdit: () => getRootApi().cancelEdit(),
  getEditingState: () => getRootApi().getEditingState(),
  refresh: () => getRootApi().refresh(),
  batch: callback => getRootApi().batch(callback),
  getViewport: () => getRootApi().getViewport(),
  getInteraction: () => getRootApi().getInteraction(),
  clearHover: () => getRootApi().clearHover(),
  selectCell: (rowId, columnId) => getRootApi().selectCell(rowId, columnId),
  clearSelection: () => getRootApi().clearSelection(),
  getViewState: (): DataTableViewState => getRootApi().getViewState(),
  setSort: sort => getRootApi().setSort(sort),
  clearSort: columnId => getRootApi().clearSort(columnId),
  setFilter: (columnId, filter) => getRootApi().setFilter(columnId, filter),
  setFilters: filters => getRootApi().setFilters(filters),
  patchFilter: (columnId, filter) => getRootApi().patchFilter(columnId, filter),
  clearFilter: columnId => getRootApi().clearFilter(columnId),
  clearFilters: columnId => getRootApi().clearFilters(columnId),
  setSearch: query => getRootApi().setSearch(query),
  clearSearch: () => getRootApi().clearSearch(),
  findNext: () => getRootApi().findNext(),
  findPrevious: () => getRootApi().findPrevious(),
  focusSearchMatch: index => getRootApi().focusSearchMatch(index),
  getSearchState: () => getRootApi().getSearchState(),
  reorderRows: payload => getRootApi().reorderRows(payload),
  reorderColumns: payload => getRootApi().reorderColumns(payload),
  getGroupingState: () => getRootApi().getGroupingState(),
  setGrouping: (groups: Array<DataTableGroupRule<BaseRow>>) => getRootApi().setGrouping(groups),
  clearGrouping: () => getRootApi().clearGrouping(),
  toggleGroup: groupId => getRootApi().toggleGroup(groupId),
  expandGroup: groupId => getRootApi().expandGroup(groupId),
  collapseGroup: groupId => getRootApi().collapseGroup(groupId),
  expandAllGroups: () => getRootApi().expandAllGroups(),
  collapseAllGroups: () => getRootApi().collapseAllGroups(),
  resetView: () => getRootApi().resetView(),
  setChildren: children => getRootApi().setChildren(children),
})
</script>

<template>
  <div
    class="nova-datatable"
    :style="{
      position: 'relative',
      width: typeof width === 'number' ? `${width}px` : width,
      height: typeof height === 'number' ? `${height}px` : height,
    }"
  >
    <NovaCanvas
      canvas-label="Nova DataTable"
      :width="width"
      :height="height"
      :max-dpr="maxDpr"
      :plugins="plugins"
      :app-options="appOptions"
      :devtools="devtools"
      @ready="ready"
      @destroy="destroy"
    >
      <NovaDataTable.Root
        ref="dataTableRoot"
        :store="store"
        :rows="rootRows"
        :row-key="rowKey"
        :columns="rootColumns"
        :pinned-columns="pinnedColumns"
        :pinned-rows="rootPinnedRows"
        :row-height="rowHeight"
        :header-height="headerHeight"
        :overscan-rows="overscanRows"
        :overscan-columns="overscanColumns"
        :interaction="interaction"
        :view="rootView"
        :scrollbars="scrollbars"
        :tooltip="tooltip"
        :zoom="zoom"
        :editing="rootEditing"
        :cell-template="rootCellTemplate"
        :header-template="rootHeaderTemplate"
        :interaction-layer-template="rootInteractionLayerTemplate"
        :scrollbar-layer-template="rootScrollbarLayerTemplate"
        :group-row-template="rootGroupRowTemplate"
        :group-footer-template="rootGroupFooterTemplate"
        :grand-footer-template="rootGrandFooterTemplate"
        :pinned-bottom-template="rootPinnedBottomTemplate"
        :on-viewport-change="handleViewportChange"
        :on-column-resize="handleColumnResize"
        :on-sort-change="handleSortChange"
        :on-filter-change="handleFilterChange"
        :on-search-change="handleSearchChange"
        :on-query-change="handleQueryChange"
        :on-row-order-change="handleRowOrderChange"
        :on-column-order-change="handleColumnOrderChange"
        :on-grouping-change="handleGroupingChange"
        :on-group-toggle="handleGroupToggle"
        :on-cell-enter="handleCellEnter"
        :on-cell-leave="handleCellLeave"
        :on-cell-click="handleCellClick"
        :on-selection-change="handleSelectionChange"
        :on-zoom-change="handleZoomChange"
        :on-editing-change="handleEditingChange"
        :layout="{ width: '100%', height: '100%' }"
      />
    </NovaCanvas>

    <div
      v-if="editingState"
      class="nova-datatable__editor-layer"
      :style="[editorLayerStyle, { position: 'absolute', zIndex: 20, pointerEvents: 'auto' }]"
      @pointerdown.stop
      @mousedown.stop
      @click.stop
    >
      <DataTableDomEditorSlot
        v-if="editingState.column.editorTemplate && editorContext"
        :template="editingState.column.editorTemplate"
        :context="editorContext"
      />
      <select
        v-else-if="activeEditorType === 'select'"
        ref="editorElement"
        :class="editorClass"
        :value="editorDraft"
        :style="editorControlStyle"
        @change="onEditorInput"
        @keydown="onEditorKeydown"
        @blur="onEditorBlur"
      >
        <option
          v-for="option in normalizeSelectOptions(activeEditorOptions)"
          :key="String(option.value)"
          :value="option.value"
        >
          {{ option.label }}
        </option>
      </select>
      <input
        v-else
        ref="editorElement"
        :class="editorClass"
        :type="activeEditorType === 'checkbox' ? 'checkbox' : activeEditorType"
        :checked="activeEditorType === 'checkbox' ? Boolean(editorDraft) : undefined"
        :value="activeEditorType === 'checkbox' ? undefined : editorDraft"
        :style="editorControlStyle"
        @input="onEditorInput"
        @change="onEditorInput"
        @keydown="onEditorKeydown"
        @blur="onEditorBlur"
      />
    </div>
  </div>
</template>
