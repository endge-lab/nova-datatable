// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { h } from 'vue'
import {
  Nova,
  RaphSchedulerType,
  RendererType,
  type NovaApp,
} from '@endge/nova'
import { NovaUIKit, registerNovaUIKit } from '@endge/nova-ui-kit'
import { createDataTableStore } from '@/model/module/DataTableStore'
import { autosizeDataTableColumn, resolveDataTableColumns } from '@/model/runtime/datatable-columns'
import { createDataTableViewport } from '@/model/runtime/datatable-layout'
import { NovaDataTableSchema, type DataTableCellContext } from '@/model/types/datatable.types'
import { registerNovaDataTable } from '@/ui/root/datatable-root.registry'
import type { DataTableRootNode } from '@/ui/root/DataTableRootNode'
import { DataTableColumn, Surface, TextBlock } from '@/vue/data-table-dsl'
import { compileDataTableDslNodes, createSlotTemplate } from '@/vue/datatable-slot-templates'

interface Row {
  id: string
  name: string
  status: string
  amount: number
}

type TestEvents = Record<string, any>

function rows(count: number, start = 0): Array<Row> {
  return Array.from({ length: count }, (_item, index) => {
    const id = start + index
    return {
      id: `row-${id}`,
      name: `Row ${id}`,
      status: id % 2 === 0 ? 'active' : 'draft',
      amount: id * 10,
    }
  })
}

function create2DContextStub(): CanvasRenderingContext2D {
  const state: Record<PropertyKey, any> = {
    measureText: vi.fn((text: string) => ({ width: text.length * 8 })),
    createPattern: vi.fn(() => ({})),
  }
  return new Proxy(state, {
    get(target, prop) {
      if (!(prop in target)) target[prop] = vi.fn()
      return target[prop]
    },
    set(target, prop, value) {
      target[prop] = value
      return true
    },
  }) as CanvasRenderingContext2D
}

function installCanvasMocks(): void {
  Object.defineProperty(window, 'devicePixelRatio', {
    value: 1,
    configurable: true,
  })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((type: string) => {
    if (type === RendererType.Web2D) return create2DContextStub()
    return null
  })
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockImplementation(function getRect(this: HTMLCanvasElement) {
    const width = this.width || 800
    const height = this.height || 480
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

function createApp(width = 900, height = 560): NovaApp<TestEvents> {
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

function mountRoot(app: NovaApp<TestEvents>): DataTableRootNode<Row> {
  const surface = app.createSurface('datatable-test')
  const uiRoot = app.schema.createNode(surface, {
    type: NovaUIKit.Root,
    id: 'ui-root',
    props: { width: 640, height: 360 },
    children: [
      {
        type: NovaDataTableSchema.Root,
        id: 'table',
        props: {
          rows: rows(100),
          rowKey: 'id',
          columns: [
            { id: 'name', title: 'Name', field: 'name', width: 180, pinned: 'left', resizable: true },
            { id: 'status', title: 'Status', field: 'status', width: 120 },
            { id: 'amount', title: 'Amount', field: 'amount', width: 120, pinned: 'right' },
          ],
          pinnedRows: {
            top: [{ id: 'summary', name: 'Summary', status: 'all', amount: 1000 }],
            bottom: [{ id: 'total', name: 'Total', status: 'all', amount: 2000 }],
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
  return uiRoot.children[0] as DataTableRootNode<Row>
}

describe('DataTableStore', () => {
  it('keeps id/index maps consistent across mutations', () => {
    const store = createDataTableStore<Row>({ rowKey: 'id', rows: rows(3) })

    store.insert({ id: 'row-x', name: 'Inserted', status: 'draft', amount: 42 }, 1)
    store.patch('row-x', { status: 'active' })
    store.setCell('row-x', 'amount', 99)
    store.replaceRange(2, [{ id: 'row-r', name: 'Range', status: 'draft', amount: 7 }])
    store.remove('row-0')

    expect(store.rowCount).toBe(3)
    expect(store.getRow('row-x')?.status).toBe('active')
    expect(store.getRow('row-x')?.amount).toBe(99)
    expect(store.getRowIdAt(0)).toBe('row-x')
    expect(store.getRowAt(1)?.id).toBe('row-r')
  })

  it('loads lazy ranges without materializing the full row count', async () => {
    const loadRange = vi.fn(range => rows(range.end - range.start, range.start))
    const store = createDataTableStore<Row>({
      rowKey: 'id',
      source: {
        rowCount: 10_000_000,
        loadRange,
      },
    })

    await store.ensureRange({ start: 1_000, end: 1_004 })

    expect(store.rowCount).toBe(10_000_000)
    expect(store.loadedRowCount).toBe(4)
    expect(store.getRowAt(1_002)?.id).toBe('row-1002')
    expect(loadRange).toHaveBeenCalledWith({ start: 1_000, end: 1_004 })
  })

  it('coalesces transaction revisions', () => {
    const store = createDataTableStore<Row>({ rowKey: 'id', rows: rows(1) })
    const initialRevision = store.takeRevision()

    store.batch(api => {
      api.insertMany(rows(2, 10))
      api.patch('row-0', { status: 'active' })
      api.setCell('row-10', 'amount', 500)
    })

    expect(store.takeRevision()).toBe(initialRevision + 1)
    expect(store.getRow('row-10')?.amount).toBe(500)
  })
})

describe('DataTable layout and columns', () => {
  it('computes virtual ranges with overscan and pinned zones', () => {
    const store = createDataTableStore<Row>({ rowKey: 'id', rows: rows(200) })
    const columns = resolveDataTableColumns<Row>([
      { id: 'name', field: 'name', width: 160, pinned: 'left' },
      { id: 'status', field: 'status', width: 120 },
      { id: 'amount', field: 'amount', width: 120, pinned: 'right' },
    ], { left: ['name'], right: ['amount'] }, new Map(), store)

    const viewport = createDataTableViewport({
      width: 420,
      height: 220,
      rowHeight: 20,
      headerHeight: 30,
      overscanRows: 2,
      overscanColumns: 1,
      rowCount: store.rowCount,
      columns,
      pinnedTopCount: 1,
      pinnedBottomCount: 1,
      scrollX: 40,
      scrollY: 100,
    })

    expect(viewport.pinnedLeftWidth).toBe(160)
    expect(viewport.pinnedRightWidth).toBe(120)
    expect(viewport.bodyY).toBe(50)
    expect(viewport.rowRange.start).toBe(3)
    expect(viewport.rowRange.end).toBeGreaterThan(10)
    expect(viewport.centerColumnRange).toEqual({ start: 0, end: 1 })
  })

  it('autosizes default text columns and respects clamps and manual overrides', () => {
    const store = createDataTableStore<Row>({ rowKey: 'id', rows: rows(4) })
    const column = {
      id: 'name',
      title: 'Customer name',
      field: 'name',
      width: { mode: 'auto' as const, min: 80, max: 120, sampleSize: 4 },
    }

    const autoWidth = autosizeDataTableColumn(column, store)
    const resolved = resolveDataTableColumns<Row>([column], {}, new Map([['name', 240]]), store)

    expect(autoWidth).toBeGreaterThanOrEqual(80)
    expect(autoWidth).toBeLessThanOrEqual(120)
    expect(resolved[0].resolvedWidth).toBe(120)
  })
})

describe('DataTable DSL templates', () => {
  it('compiles column and pinned row marker nodes', () => {
    const cellSlot = (context: DataTableCellContext<Row>) => [
      h(Surface, { background: '#fff', padding: '0 10' }, () => [
        h(TextBlock, { text: String(context.value), ellipsis: true }),
      ]),
    ]
    const dsl = compileDataTableDslNodes<Row>([
      h(DataTableColumn, { id: 'name', title: 'Name', field: 'name', resizable: true }, { cell: cellSlot }),
    ])

    expect(dsl.columns).toHaveLength(1)
    expect(dsl.columns[0].id).toBe('name')
    expect(dsl.columns[0].resizable).toBe(true)
    expect(dsl.columns[0].cellTemplate).toBeTypeOf('function')
  })

  it('turns scoped slots into primitive Nova schemas', () => {
    const template = createSlotTemplate<Row>(context => [
      h(Surface, { background: '#f8fafc', padding: '0 8' }, () => [
        h(TextBlock, { text: String(context.value), ellipsis: true }),
      ]),
    ])
    const schema = template?.({
      row: rows(1)[0],
      rowId: 'row-0',
      rowIndex: 0,
      columnIndex: 0,
      column: resolveDataTableColumns<Row>([{ id: 'name', field: 'name' }], {}, new Map(), createDataTableStore<Row>({ rowKey: 'id', rows: rows(1) }))[0],
      value: 'Demo',
      rect: { x: 10, y: 20, width: 100, height: 30 },
      state: {
        rect: { x: 10, y: 20, width: 100, height: 30 },
        rowIndex: 0,
        columnIndex: 0,
        selected: false,
        hovered: false,
      },
      zone: 'body',
      store: createDataTableStore<Row>({ rowKey: 'id', rows: rows(1) }),
      api: {} as never,
    })

    expect(schema?.[0].type).toBe('rect')
    expect(schema?.[1].type).toBe('text')
    expect(schema?.[1].x).toBe(18)
    expect(schema?.[1].styles?.ellipsis).toBe(true)
  })
})

describe('DataTable Root runtime', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
    installCanvasMocks()
  })

  it('mounts root and exposes the public ref API', () => {
    const app = createApp()
    const root = mountRoot(app)
    const api = root.getApi()

    expect(api.data()).toHaveLength(100)
    expect(api.setColumnWidth('status', 160)).toBe(true)
    api.scrollToRow(20)
    api.batch(batch => {
      batch.add({ id: 'row-new', name: 'New', status: 'active', amount: 1 })
      batch.update({ id: 'row-new', status: 'draft' })
    })

    expect(api.getViewport().scrollY).toBeGreaterThan(0)
    expect(api.data().at(-1)?.status).toBe('draft')

    app.destroy()
  })

  it('uses column templates before table templates', () => {
    const app = createApp()
    const tableCellTemplate = vi.fn(() => [])
    const columnCellTemplate = vi.fn(() => [])
    const surface = app.createSurface('datatable-template-test')
    app.schema.createNode(surface, {
      type: NovaUIKit.Root,
      props: { width: 420, height: 180 },
      children: [
        {
          type: NovaDataTableSchema.Root,
          props: {
            rows: rows(3),
            rowKey: 'id',
            columns: [
              { id: 'name', field: 'name', cellTemplate: columnCellTemplate },
              { id: 'status', field: 'status' },
            ],
            cellTemplate: tableCellTemplate,
          },
          layout: { width: '100%', height: '100%' },
        },
      ],
    })
    app.raph.run()
    app.raph.run()

    expect(columnCellTemplate).toHaveBeenCalled()
    expect(tableCellTemplate).toHaveBeenCalled()
    expect(columnCellTemplate.mock.calls.length).toBe(tableCellTemplate.mock.calls.length)

    app.destroy()
  })
})
