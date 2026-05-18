import 'reflect-metadata'

import NovaDataTableComponent from '@/vue/NovaDataTable.vue'
import { NovaDataTableSchema } from '@/model/types/datatable.types'

export const NovaDataTable = Object.assign(NovaDataTableComponent, {
  Root: NovaDataTableSchema.Root,
})

export {
  DataTableColumn,
  DataTableGrouping,
  DataTablePinnedRows,
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
