// @vitest-environment jsdom

import { bench, describe, vi } from 'vitest'
import {
  Nova,
  RaphSchedulerType,
  RendererType,
  type NovaApp,
} from '@endge/nova'
import { NovaUIKit, registerNovaUIKit } from '@endge/nova-ui-kit'
import {
  NovaDataTableSchema,
  type DataTableColumnInput,
} from '@/model/types/datatable.types'
import { registerNovaDataTable } from '@/ui/root/datatable-root.registry'
import type { DataTableRootNode } from '@/ui/root/DataTableRootNode'

interface ClipboardBenchRow {
  id: string
  c0: string
  c1: number
  c2: boolean
  c3: { value: number }
  c4: string
  c5: number
  c6: boolean
  c7: { value: number }
  c8: string
  c9: number
}

type BenchEvents = Record<string, any>

const COLUMN_IDS = Array.from({ length: 10 }, (_item, index) => `c${index}`)
const PASTE_10K_TYPED_CELLS = Array.from({ length: 1_000 }, (_item, rowIndex) => [
  `Customer ${rowIndex}`,
  String(rowIndex),
  rowIndex % 2 === 0 ? 'true' : 'false',
  `{"value":${rowIndex}}`,
  `Status ${rowIndex}`,
  String(rowIndex * 2),
  rowIndex % 3 === 0 ? '1' : '0',
  `{"value":${rowIndex * 3}}`,
  `Region ${rowIndex}`,
  String(rowIndex * 4),
].join('\t')).join('\n')

function benchRows(count: number): Array<ClipboardBenchRow> {
  return Array.from({ length: count }, (_item, index) => ({
    id: `row-${index}`,
    c0: `Customer ${index}`,
    c1: index,
    c2: index % 2 === 0,
    c3: { value: index },
    c4: `Status ${index}`,
    c5: index * 2,
    c6: index % 3 === 0,
    c7: { value: index * 3 },
    c8: `Region ${index}`,
    c9: index * 4,
  }))
}

function benchColumns(): Array<DataTableColumnInput<ClipboardBenchRow>> {
  return [
    { id: 'c0', field: 'c0', width: 140, editable: true, type: 'text', paste: { enabled: true } },
    { id: 'c1', field: 'c1', width: 100, editable: true, type: 'number', paste: { enabled: true } },
    { id: 'c2', field: 'c2', width: 100, editable: true, type: 'boolean', paste: { enabled: true } },
    { id: 'c3', field: 'c3', width: 140, editable: true, type: 'json', paste: { enabled: true } },
    { id: 'c4', field: 'c4', width: 120, editable: true, type: 'text', paste: { enabled: true } },
    { id: 'c5', field: 'c5', width: 100, editable: true, type: 'number', paste: { enabled: true } },
    { id: 'c6', field: 'c6', width: 100, editable: true, type: 'boolean', paste: { enabled: true } },
    { id: 'c7', field: 'c7', width: 140, editable: true, type: 'json', paste: { enabled: true } },
    { id: 'c8', field: 'c8', width: 120, editable: true, type: 'text', paste: { enabled: true } },
    { id: 'c9', field: 'c9', width: 100, editable: true, type: 'number', paste: { enabled: true } },
  ]
}

function installCanvasMocks(): void {
  vi.restoreAllMocks()
  Object.defineProperty(window, 'devicePixelRatio', {
    value: 1,
    configurable: true,
  })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((type: string) => {
    if (type !== RendererType.Web2D) return null
    return new Proxy({
      measureText: vi.fn((text: string) => ({ width: text.length * 8 })),
      createPattern: vi.fn(() => ({})),
    } as Record<PropertyKey, any>, {
      get(target, prop) {
        if (!(prop in target)) target[prop] = vi.fn()
        return target[prop]
      },
    }) as CanvasRenderingContext2D
  })
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockImplementation(function getRect(this: HTMLCanvasElement) {
    const width = this.width || 1280
    const height = this.height || 720
    return {
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: width,
      bottom: height,
      width,
      height,
      toJSON: () => ({}),
    } as DOMRect
  })
}

function createApp(): NovaApp<BenchEvents> {
  const canvas = document.createElement('canvas')
  document.body.appendChild(canvas)
  const app = Nova.createApp<BenchEvents>({
    target: canvas,
    size: { width: 1280, height: 720, dpr: 1 },
    input: {
      pointer: { enabled: false },
      keyboard: { enabled: false, scope: 'manual' },
    },
    renderer: { main: RendererType.Web2D },
    scheduler: { type: RaphSchedulerType.Sync, loop: false },
  })
  registerNovaUIKit(app.schema)
  registerNovaDataTable(app.schema)
  return app
}

function mountRoot(app: NovaApp<BenchEvents>): DataTableRootNode<ClipboardBenchRow> {
  const surface = app.createSurface('datatable-clipboard-bench')
  const uiRoot = app.schema.createNode(surface, {
    type: NovaUIKit.Root,
    id: 'ui-root',
    props: { width: 1280, height: 720 },
    children: [
      {
        type: NovaDataTableSchema.Root,
        id: 'table',
        props: {
          rows: benchRows(1_000),
          rowKey: 'id',
          columns: benchColumns(),
          rowHeight: 28,
          selection: {
            mode: 'cell',
            cardinality: 'multiple',
            allowedUnits: { cells: true },
          },
          clipboard: {
            copy: { format: 'tsv', onlyVisibleColumns: false },
            paste: { enabled: true, parseFormat: 'tsv', invalid: 'reject', readonly: 'reject' },
          },
        },
        layout: {
          width: '100%',
          height: '100%',
        },
      },
    ],
  })
  app.raph.run()
  app.raph.run()
  return uiRoot.children[0] as DataTableRootNode<ClipboardBenchRow>
}

function withBenchRoot(callback: (root: DataTableRootNode<ClipboardBenchRow>) => void | Promise<void>): void | Promise<void> {
  installCanvasMocks()
  document.body.innerHTML = ''
  const app = createApp()
  const root = mountRoot(app)
  const done = callback(root)
  if (done instanceof Promise) {
    return done.finally(() => {
      app.destroy()
      document.body.innerHTML = ''
    })
  }
  app.destroy()
  document.body.innerHTML = ''
}

describe('NovaDataTable clipboard benchmarks', () => {
  bench('copy 10k typed cells from selected range', () => {
    withBenchRoot(root => {
      root.getApi().selectRange({
        id: 'bench-copy-range',
        unit: 'cell',
        startRowIndex: 0,
        endRowIndex: 999,
        startRowId: 'row-0',
        endRowId: 'row-999',
        startColumnId: 'c0',
        endColumnId: 'c9',
        columnIds: COLUMN_IDS,
      })
      root.getApi().copySelection()
    })
  }, { iterations: 5 })

  bench('paste 10k typed cells through public root API', async () => {
    await withBenchRoot(async root => {
      root.getApi().selectCell('row-0', 'c0')
      await root.getApi().pasteClipboard(PASTE_10K_TYPED_CELLS)
    })
  }, { iterations: 5 })
})
