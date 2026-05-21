import path from 'path'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import dts from 'vite-plugin-dts'
import { novaVitePlugin } from '@endge/nova-compiler'

const publicTypesEntry = `import 'reflect-metadata'
import NovaDataTableComponent from './vue/NovaDataTable.vue'
import { NovaDataTableSchema } from './model/types/datatable.types'

export declare const NovaDataTable: typeof NovaDataTableComponent & {
  Root: typeof NovaDataTableSchema.Root
}

export {
  DataTableColumn,
  DataTableGrouping,
  DataTablePinnedRows,
  DataTableScrollbarLayer,
  Rect,
  Surface,
  Text,
  TextBlock,
} from './vue/data-table-dsl'
export { createDataTableStore, DataTableStore } from './model/module/DataTableStore'
export { registerNovaDataTable } from './ui/root/datatable-root.registry'
export * from './model/types/datatable.types'
export * from './model/runtime/datatable-columns'
export * from './model/runtime/datatable-layout'
export * from './model/runtime/DataTableServerRowModel'
export * from './model/runtime/DataTableSummaryEngine'
export * from './model/runtime/DataTableClipboardFeedback'
export * from './model/runtime/DataTableTransactionHistory'
export * from './model/runtime/DataTableCommitController'
export * from './model/runtime/DataTableFillHandle'
export * from './model/runtime/DataTableFillMatrix'
export * from './model/runtime/DataTableAccessibility'
export * from './model/runtime/DataTableFilterMenu'
export * from './model/runtime/DataTableColumnSystem'
export * from './model/runtime/DataTableTreeRows'
export * from './model/runtime/DataTableDetailRows'
export * from './model/runtime/DataTableWorkerIndexPipeline'
export * from './model/runtime/DataTableServerHardening'
`

export default defineConfig({
  build: {
    lib: {
      entry: path.resolve(__dirname, 'src/main.ts'),
      formats: ['es'],
      name: 'nova-datatable',
      fileName: 'nova-datatable',
    },
    rollupOptions: {
      external: id =>
        id === 'vue' ||
        id.startsWith('vue/') ||
        id === '@endge/nova' ||
        id === '@endge/nova-compiler' ||
        id === '@endge/nova-ui-kit' ||
        id === '@endge/nova-vue' ||
        id === '@endge/utils' ||
        id.startsWith('@endge/nova/') ||
        id.startsWith('@endge/nova-compiler/') ||
        id.startsWith('@endge/nova-ui-kit/') ||
        id.startsWith('@endge/nova-vue/') ||
        id.startsWith('@endge/utils/'),
    },
  },
  plugins: [
    novaVitePlugin(),
    vue({
      template: {
        compilerOptions: {
          isCustomElement: tag => tag === 'nova-template',
        },
      },
    }),
    dts({
      tsconfigPath: './tsconfig.app.json',
      insertTypesEntry: true,
      compilerOptions: {
        noCheck: true,
        noEmit: false,
      },
      beforeWriteFile(filePath, content) {
        if (filePath.endsWith(`${path.sep}main.d.ts`)) {
          return { content: publicTypesEntry }
        }
      },
      logLevel: 'silent',
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@endge/nova-datatable': path.resolve(__dirname, './src/main.ts'),
    },
  },
  test: {
    environment: 'jsdom',
  },
})
