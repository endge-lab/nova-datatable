<script setup lang="ts">
import { computed, useSlots } from 'vue'
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
  type DataTableColumnResizePayload,
  type DataTableColumnInput,
  type DataTablePinnedColumns,
  type DataTablePinnedRows,
  type DataTableRowKey,
  type DataTableRootOptions,
  type DataTableStoreApi,
  type DataTableTemplate,
  type DataTableViewport,
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
  cellTemplate?: DataTableTemplate<BaseRow>
  headerTemplate?: DataTableTemplate<BaseRow>
  onViewportChange?: (viewport: DataTableViewport) => void
  onColumnResize?: (payload: DataTableColumnResizePayload<BaseRow>) => void
  width?: number | string
  height?: number | string
  maxDpr?: number
  renderer?: RendererType | 'webgl' | 'web2d' | '2d'
  loop?: boolean
  devtools?: boolean | { id?: string; label?: string }
}

const props = withDefaults(defineProps<DataTableVueProps>(), {
  width: '100%',
  height: '100%',
  maxDpr: 2,
  renderer: RendererType.WebGL,
  loop: false,
  rowHeight: 36,
  headerHeight: 40,
  overscanRows: 16,
  overscanColumns: 4,
  columns: () => [],
  pinnedColumns: () => ({}),
  pinnedRows: () => ({}),
})

const emit = defineEmits<{
  (event: 'ready', payload: NovaCanvasReadyPayload): void
  (event: 'destroy'): void
  (event: 'viewport-change', viewport: DataTableViewport): void
  (event: 'column-resize', payload: DataTableColumnResizePayload<BaseRow>): void
}>()

const slots = useSlots()
const NovaDataTable = NovaDataTableSchema
const dataTableRoot = Nova.ref<NovaDataTableRef<BaseRow>>('dataTableRoot')
const plugins: Array<NovaSchemaPlugin> = [registerNovaUIKit, registerNovaDataTable]

const compiledDsl = computed(() => compileDataTableDslNodes<BaseRow>(slots.default?.() ?? []))
const rootRows = computed(() => props.rows ?? props.data ?? [])
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
const devtools = computed(() => props.devtools)

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
    type: props.loop ? RaphSchedulerType.AnimationFrame : RaphSchedulerType.Sync,
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
  setColumnWidth: (columnId, width) => getRootApi().setColumnWidth(columnId, width),
  autosizeColumn: columnId => getRootApi().autosizeColumn(columnId),
  autosizeColumns: columnIds => getRootApi().autosizeColumns(columnIds),
  resetColumnWidth: columnId => getRootApi().resetColumnWidth(columnId),
  scrollTo: (x, y) => getRootApi().scrollTo(x, y),
  scrollToRow: rowIndex => getRootApi().scrollToRow(rowIndex),
  refresh: () => getRootApi().refresh(),
  batch: callback => getRootApi().batch(callback),
  getViewport: () => getRootApi().getViewport(),
  setChildren: children => getRootApi().setChildren(children),
})
</script>

<template>
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
      :cell-template="rootCellTemplate"
      :header-template="rootHeaderTemplate"
      :on-viewport-change="handleViewportChange"
      :on-column-resize="handleColumnResize"
      :layout="{ width: '100%', height: '100%' }"
    />
  </NovaCanvas>
</template>
