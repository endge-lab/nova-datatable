import 'reflect-metadata'

import NovaDataTableComponent from '@/vue/NovaDataTable.vue'
import { NovaDataTableSchema } from '@/model/types/datatable.types'

export const NovaDataTable: typeof NovaDataTableComponent & {
  Root: typeof NovaDataTableSchema.Root
} = Object.assign(NovaDataTableComponent, {
  Root: NovaDataTableSchema.Root,
})

export {
  DataTableColumn,
  DataTableGrouping,
  DataTablePinnedRows,
  DataTableScrollbarLayer,
  Rect,
  Surface,
  Text,
  TextBlock,
} from '@/vue/data-table-dsl'
export { createDataTableStore, DataTableStore } from '@/model/module/DataTableStore'
export { registerNovaDataTable } from '@/ui/root/datatable-root.registry'
export * from '@/model/types/datatable.types'
export * from '@/model/runtime/datatable-columns'
export * from '@/model/runtime/datatable-layout'
export * from '@/model/runtime/DataTableServerRowModel'
export * from '@/model/runtime/DataTableSummaryEngine'
export * from '@/model/runtime/DataTableClipboardFeedback'
export * from '@/model/runtime/DataTableTransactionHistory'
export * from '@/model/runtime/DataTableCommitController'
export * from '@/model/runtime/DataTableFillHandle'
export * from '@/model/runtime/DataTableFillMatrix'
export * from '@/model/runtime/DataTableAccessibility'
export * from '@/model/runtime/DataTableFilterMenu'
export * from '@/model/runtime/DataTableColumnSystem'
export * from '@/model/runtime/DataTableTreeRows'
export * from '@/model/runtime/DataTableDetailRows'
export * from '@/model/runtime/DataTableWorkerIndexPipeline'
export * from '@/model/runtime/DataTableServerHardening'
