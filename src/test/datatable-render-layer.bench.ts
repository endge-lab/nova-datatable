// @vitest-environment jsdom

import { bench, describe } from 'vitest'
import {
  Nova,
  RaphSchedulerType,
  RendererType,
  type NovaApp,
} from '@endge/nova'
import { NovaUIKit, registerNovaUIKit } from '@endge/nova-ui-kit'
import { NovaDataTableSchema } from '@/model/types/datatable.types'
import { registerNovaDataTable } from '@/ui/root/datatable-root.registry'
import type { DataTableRootNode } from '@/ui/root/DataTableRootNode'

interface BenchRow {
  id: string
  name: string
  status: string
  amount: number
}

type TestEvents = Record<string, any>

function rows(count: number): Array<BenchRow> {
  return Array.from({ length: count }, (_item, index) => ({
    id: `row-${index}`,
    name: `Customer ${index}`,
    status: index % 3 === 0 ? 'active' : 'draft',
    amount: index,
  }))
}

function installCanvasMocks(): void {
  Object.defineProperty(window, 'devicePixelRatio', {
    value: 1,
    configurable: true,
  })
  HTMLCanvasElement.prototype.getContext = function getContext(type: string) {
    if (type !== RendererType.Web2D) return null
    const state: Record<PropertyKey, any> = {
      measureText: (text: string) => ({ width: text.length * 8 }),
      createPattern: () => ({}),
    }
    return new Proxy(state, {
      get(target, prop) {
        if (!(prop in target)) target[prop] = () => undefined
        return target[prop]
      },
      set(target, prop, value) {
        target[prop] = value
        return true
      },
    }) as CanvasRenderingContext2D
  } as typeof HTMLCanvasElement.prototype.getContext
  HTMLCanvasElement.prototype.getBoundingClientRect = function getBoundingClientRect(this: HTMLCanvasElement) {
    const width = this.width || 960
    const height = this.height || 520
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
  }
}

function createApp(width = 960, height = 520): NovaApp<TestEvents> {
  installCanvasMocks()
  const canvas = document.createElement('canvas')
  document.body.appendChild(canvas)
  const app = Nova.createApp<TestEvents>({
    target: canvas,
    size: { width, height, dpr: 1 },
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

function mountBenchRoot(rowCount: number, animated = false): { app: NovaApp<TestEvents>; root: DataTableRootNode<BenchRow>; calls: () => number } {
  let templateCalls = 0
  const app = createApp()
  const surface = app.createSurface('datatable-render-layer-bench')
  const columns = Array.from({ length: 54 }, (_item, index) => ({
    id: `c-${index}`,
    title: `C ${index}`,
    field: index % 3 === 0 ? 'name' : index % 3 === 1 ? 'status' : 'amount',
    width: 118,
    pinned: index === 0 ? 'left' as const : index === 53 ? 'right' as const : undefined,
    animated: animated && index % 17 === 0,
    cellTemplate: () => {
      templateCalls += 1
      return []
    },
  }))
  const uiRoot = app.schema.createNode(surface, {
    type: NovaUIKit.Root,
    props: { width: 960, height: 520 },
    children: [
      {
        type: NovaDataTableSchema.Root,
        props: {
          rows: rows(rowCount),
          rowKey: 'id',
          rowHeight: 24,
          headerHeight: 32,
          overscanRows: 4,
          overscanColumns: 1,
          interaction: { motion: false },
          columns,
        },
        layout: { width: '100%', height: '100%' },
      },
    ],
  })
  app.raph.run()
  app.raph.run()
  return {
    app,
    root: uiRoot.children[0] as DataTableRootNode<BenchRow>,
    calls: () => templateCalls,
  }
}

describe('NovaDataTable render layer benchmarks', () => {
  bench('100 rows x 54 columns hover 1000 moves without template rebuilds', () => {
    const { app, root, calls } = mountBenchRoot(100)
    const before = calls()
    ;(root as any).__resetRenderLayerDiagnostics()
    for (let index = 0; index < 1_000; index += 1) {
      root.eventHandlers.mousemove?.(new MouseEvent('mousemove', {
        clientX: 180 + (index % 12) * 12,
        clientY: 52 + (index % 14) * 24,
      }))
      app.raph.run()
    }
    if (calls() !== before) throw new Error('Hover rebuilt cell templates')
    app.destroy()
  }, { iterations: 5 })

  bench('100 rows x 54 columns animated frame rebuilds animated layer only', async () => {
    const { app, root } = mountBenchRoot(100, true)
    await Promise.resolve()
    ;(root as any).__resetRenderLayerDiagnostics()
    app.raph.run()
    const diagnostics = (root as any).__getRenderLayerDiagnostics()
    if (diagnostics.layerRebuilds['body-static'] !== 0) throw new Error('Animated frame rebuilt static cells')
    app.destroy()
  }, { iterations: 10 })

  bench('10k logical rows visible viewport hover remains overlay-only', () => {
    const { app, root, calls } = mountBenchRoot(10_000)
    const before = calls()
    ;(root as any).__resetRenderLayerDiagnostics()
    root.eventHandlers.mousemove?.(new MouseEvent('mousemove', { clientX: 220, clientY: 124 }))
    app.raph.run()
    if (calls() !== before) throw new Error('Large hover rebuilt cell templates')
    app.destroy()
  }, { iterations: 20 })
})
