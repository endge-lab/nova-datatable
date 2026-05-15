import path from 'path'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import dts from 'vite-plugin-dts'
import { novaVitePlugin } from '@endge/nova-compiler'

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
