import type { NovaComponentSchema, NovaSchemaRegistry } from '@endge/nova'
import { DataTableRootNode } from '@/ui/root/DataTableRootNode'
import {
  createDataTableRootDescriptor,
  normalizeDataTableRootProps,
  type DataTableRootDescriptor,
} from '@/ui/root/datatable-root.config'
import type { DataTableRootProps } from '@/model/types/datatable.types'

export const DATATABLE_ROOT_DESCRIPTOR: DataTableRootDescriptor = createDataTableRootDescriptor((context, schema) => {
  const rootSchema = schema as NovaComponentSchema<DataTableRootProps>
  return new DataTableRootNode(
    context.app,
    context.surface,
    normalizeDataTableRootProps(rootSchema.props),
    {
      componentId: rootSchema.id,
      children: rootSchema.children ?? [],
    },
    DATATABLE_ROOT_DESCRIPTOR,
  )
})

/**
 * Регистрирует root schema Nova DataTable в Nova registry.
 */
export function registerNovaDataTable(registry: NovaSchemaRegistry): void {
  registry.register(DATATABLE_ROOT_DESCRIPTOR, { override: true })
}
