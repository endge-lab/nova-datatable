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
import { DataTableServerRowModel } from '@/model/runtime/DataTableServerRowModel'
import { DataTableViewPipeline } from '@/model/runtime/DataTableViewPipeline'
import { DataTableSummaryEngine } from '@/model/runtime/DataTableSummaryEngine'
import {
  NovaDataTableSchema,
  type DataTableCellContext,
  type DataTableQueryState,
  type DataTableSourceRequestContext,
} from '@/model/types/datatable.types'
import { normalizeDataTableEditing, normalizeDataTablePerformance, normalizeDataTableScrollbars, normalizeDataTableView } from '@/ui/root/datatable-root.config'
import { registerNovaDataTable } from '@/ui/root/datatable-root.registry'
import type { DataTableRootNode } from '@/ui/root/DataTableRootNode'
import { DataTableColumn, DataTableGrouping, DataTableInteractionLayer, DataTableScrollbarLayer, Rect, Surface, TextBlock } from '@/vue/data-table-dsl'
import { compileDataTableDslNodes, createSlotTemplate } from '@/vue/datatable-slot-templates'

interface Row {
  id: string
  name: string
  status: string
  amount: number
}

type TestEvents = Record<string, any>

let canvasContextStub: Record<PropertyKey, any> | null = null

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
    __sets: [],
    measureText: vi.fn((text: string) => ({ width: text.length * 8 })),
    createPattern: vi.fn(() => ({})),
  }
  canvasContextStub = state
  return new Proxy(state, {
    /**
     * Возвращает значение состояния текущего класса.
     */
    get(target, prop) {
      if (!(prop in target)) target[prop] = vi.fn()
      return target[prop]
    },
    /**
     * Обновляет значение состояния текущего класса.
     */
    set(target, prop, value) {
      target[prop] = value
      ;(target.__sets as Array<[PropertyKey, unknown]>).push([prop, value])
      return true
    },
  }) as CanvasRenderingContext2D
}

function installCanvasMocks(): void {
  canvasContextStub = null
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

function installStorageMock(): Storage {
  const state = new Map<string, string>()
  const storage = {
    get length() {
      return state.size
    },
    clear: vi.fn(() => state.clear()),
    getItem: vi.fn((key: string) => state.get(key) ?? null),
    key: vi.fn((index: number) => [...state.keys()][index] ?? null),
    removeItem: vi.fn((key: string) => {
      state.delete(key)
    }),
    setItem: vi.fn((key: string, value: string) => {
      state.set(key, String(value))
    }),
  } as Storage
  Object.defineProperty(window, 'localStorage', {
    value: storage,
    configurable: true,
  })
  return storage
}

beforeEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
  installCanvasMocks()
})

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
    expect(loadRange).toHaveBeenCalledWith({ start: 1_000, end: 1_004 }, undefined, undefined)
  })

  it('passes query state into lazy range adapters', async () => {
    const loadRange = vi.fn(range => rows(range.end - range.start, range.start))
    const store = createDataTableStore<Row>({
      rowKey: 'id',
      source: {
        rowCount: 100,
        loadRange,
      },
    })
    const query = {
      sort: [{ columnId: 'amount', direction: 'desc' as const }],
      filters: [{ columnId: 'status', operator: 'equals' as const, value: 'active' }],
      rowOrder: [],
      columnOrder: [],
    }

    await store.ensureRange({ start: 0, end: 5 }, query)

    expect(loadRange).toHaveBeenCalledWith({ start: 0, end: 5 }, query, undefined)
  })

  it('passes server source context into lazy range adapters and ignores stale responses', async () => {
    const loadRange = vi.fn((
      range: { start: number; end: number },
      _query: DataTableQueryState | undefined,
      context: DataTableSourceRequestContext | undefined,
    ) => {
      if (context?.revision === 1) return rows(range.end - range.start, 100)
      return rows(range.end - range.start, range.start)
    })
    const store = createDataTableStore<Row>({
      rowKey: 'id',
      source: {
        rowCount: 100,
        loadRange,
      },
    })
    const query: DataTableQueryState = {
      sort: [],
      filters: [],
      rowOrder: [],
      columnOrder: [],
    }

    await store.ensureRange({ start: 0, end: 2 }, query, { revision: 2, requestId: 2 })
    await store.ensureRange({ start: 10, end: 12 }, query, { revision: 1, requestId: 1 })

    expect(loadRange).toHaveBeenNthCalledWith(1, { start: 0, end: 2 }, query, { revision: 2, requestId: 2 })
    expect(loadRange).toHaveBeenNthCalledWith(2, { start: 10, end: 12 }, query, { revision: 1, requestId: 1 })
    expect(store.getRowAt(0)?.id).toBe('row-0')
    expect(store.getRowAt(10)).toBeUndefined()
  })

  it('delegates summary search resolve and subscribe through the lazy source contract', async () => {
    const query: DataTableQueryState = {
      sort: [{ columnId: 'amount', direction: 'desc' }],
      filters: [{ columnId: 'status', operator: 'equals', value: 'active' }],
      rowOrder: [],
      columnOrder: [],
    }
    const loadSummary = vi.fn(() => ({ count: 100 }))
    const search = vi.fn(() => ({
      matches: [{ rowId: 'row-10', rowIndex: 10, columnId: 'name', value: 'Row 10', ranges: [{ start: 0, end: 3 }] }],
      total: 1,
      cursor: 'next',
    }))
    const resolveRowIndex = vi.fn(() => 10)
    const unsubscribe = vi.fn()
    const subscribe = vi.fn(() => unsubscribe)
    const store = createDataTableStore<Row>({
      rowKey: 'id',
      source: {
        rowCount: 10_000_000,
        loadSummary,
        search,
        resolveRowIndex,
        subscribe,
      },
    })

    await expect(store.loadSummary(query)).resolves.toEqual({ count: 100 })
    await expect(store.searchSource({ text: 'Row 10' }, query, 'cursor')).resolves.toMatchObject({ total: 1 })
    await expect(store.resolveSourceRowIndex('row-10', query)).resolves.toBe(10)
    const dispose = store.subscribe(query, () => undefined)
    dispose?.()

    expect(loadSummary).toHaveBeenCalledWith(query)
    expect(search).toHaveBeenCalledWith({ text: 'Row 10' }, query, 'cursor', undefined)
    expect(resolveRowIndex).toHaveBeenCalledWith('row-10', query)
    expect(subscribe).toHaveBeenCalledWith(query, expect.any(Function))
    expect(unsubscribe).toHaveBeenCalled()
  })

  it('keeps plain lazy views sparse for huge row counts', () => {
    const getRow = vi.fn((index: number) => rows(1, index)[0])
    const store = createDataTableStore<Row>({
      rowKey: 'id',
      source: {
        rowCount: 1_000_000,
        getRow,
      },
    })
    const pipeline = new DataTableViewPipeline(store)
    pipeline.sync({
      columns: resolveDataTableColumns([
        { id: 'name', field: 'name', width: 100 },
      ], {}, new Map(), store),
      performance: normalizeDataTablePerformance(undefined),
      view: {
        sorting: false,
        filtering: false,
        search: false,
        serverRowModel: false,
        rowOrdering: false,
        columnOrdering: false,
        filterUi: false,
        grouping: false,
        groupingPinnedRows: false,
      },
    })

    expect(pipeline.rowCount).toBe(1_000_000)
    expect(getRow).not.toHaveBeenCalled()
    expect(pipeline.getViewRowAt(120)?.row?.id).toBe('row-120')
    expect(getRow).toHaveBeenCalledTimes(1)
  })

  it('keeps inactive client sort and filters sparse for lazy views', () => {
    const getRow = vi.fn((index: number) => rows(1, index)[0])
    const store = createDataTableStore<Row>({
      rowKey: 'id',
      source: {
        rowCount: 1_000_000,
        getRow,
      },
    })
    const pipeline = new DataTableViewPipeline(store)
    pipeline.sync({
      columns: resolveDataTableColumns([
        { id: 'name', field: 'name', width: 100 },
      ], {}, new Map(), store),
      performance: normalizeDataTablePerformance(undefined),
      view: {
        sorting: { mode: 'client', multi: true, headerClick: 'append', initial: [], controlled: false },
        filtering: { mode: 'client', initial: [], controlled: false },
        search: {
          mode: 'client',
          scope: 'cells',
          match: 'contains',
          caseSensitive: false,
          columns: [],
          highlight: 'cell-text',
          filter: false,
          highlightColor: '#b45309',
          activeHighlightColor: '#be123c',
          controlled: false,
        },
        serverRowModel: false,
        rowOrdering: false,
        columnOrdering: false,
        filterUi: false,
        grouping: false,
        groupingPinnedRows: false,
      },
    })

    expect(pipeline.rowCount).toBe(1_000_000)
    expect(getRow).not.toHaveBeenCalled()
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

  it('applies delta batches with dirty pages, rows and cells', () => {
    const store = createDataTableStore<Row>({
      rowKey: 'id',
      rows: rows(40),
      performance: { pageSize: 32 },
    })
    const initialRevision = store.takeRevision()

    store.clearDirtyState()
    store.applyDeltaBatch([
      { type: 'patch', rowId: 'row-2', patch: { status: 'draft' } },
      { type: 'setCell', rowId: 'row-2', columnId: 'amount', value: 777 },
      { type: 'patch', rowId: 'row-34', patch: { name: 'Updated' } },
    ])

    const dirty = store.getDirtyState()
    expect(store.getRow('row-2')?.amount).toBe(777)
    expect(store.getRow('row-34')?.name).toBe('Updated')
    expect(store.takeRevision()).toBe(initialRevision + 1)
    expect(dirty.pages).toEqual([0, 1])
    expect(dirty.rows).toEqual(expect.arrayContaining(['row-2', 'row-34']))
    expect(dirty.cells).toEqual(expect.arrayContaining([
      { rowId: 'row-2', columnId: 'status' },
      { rowId: 'row-2', columnId: 'amount' },
      { rowId: 'row-34', columnId: 'name' },
    ]))
    expect(dirty.structural).toBe(false)
    expect(dirty.summary).toBe(true)
  })

  it('moves loaded rows without rebuilding through dense array splices', () => {
    const store = createDataTableStore<Row>({ rowKey: 'id', rows: rows(5) })

    store.move('row-1', 3)

    expect(store.getRowIdAt(0)).toBe('row-0')
    expect(store.getRowIdAt(1)).toBe('row-2')
    expect(store.getRowIdAt(2)).toBe('row-3')
    expect(store.getRowIdAt(3)).toBe('row-1')
    expect(store.getRowIndex('row-1')).toBe(3)
    expect(store.getDirtyState().structural).toBe(true)
  })

  it('supports mixed structural deltas and preserves id/index consistency', () => {
    const store = createDataTableStore<Row>({ rowKey: 'id', rows: rows(4) })

    store.applyDeltaBatch([
      { type: 'insert', index: 1, rows: [{ id: 'row-x', name: 'X', status: 'active', amount: 1 }] },
      { type: 'replaceRange', start: 3, rows: [{ id: 'row-r', name: 'R', status: 'draft', amount: 2 }] },
      { type: 'remove', rowIds: ['row-0'] },
    ])

    expect(store.rowCount).toBe(4)
    expect(store.getRowIdAt(0)).toBe('row-x')
    expect(store.getRowIdAt(2)).toBe('row-r')
    expect(store.getRowIndex('row-r')).toBe(2)
    expect(store.getDirtyState().structural).toBe(true)
  })
})

describe('DataTableServerRowModel', () => {
  it('passes the current query into range summary search and subscribe adapters', async () => {
    const query: DataTableQueryState = {
      sort: [{ columnId: 'amount', direction: 'asc' }],
      filters: [{ columnId: 'status', operator: 'equals', value: 'active' }],
      search: { text: 'Row 2', scope: 'cells', columns: ['name'] },
      rowOrder: [],
      columnOrder: ['name', 'amount'],
    }
    const loadRange = vi.fn((range: { start: number; end: number }) => rows(range.end - range.start, range.start))
    const loadSummary = vi.fn(() => ({ count: 10_000_000, amount: 42 }))
    const search = vi.fn(() => ({
      matches: [{ rowId: 'row-2', rowIndex: 2, columnId: 'name', value: 'Row 2', ranges: [{ start: 0, end: 5 }] }],
      total: 1,
    }))
    const unsubscribe = vi.fn()
    const subscribe = vi.fn((_query: DataTableQueryState, emitDelta: unknown) => {
      expect(emitDelta).toEqual(expect.any(Function))
      return unsubscribe
    })
    const store = createDataTableStore<Row>({
      rowKey: 'id',
      source: {
        rowCount: 10_000_000,
        loadRange,
        loadSummary,
        search,
        subscribe,
      },
    })
    const model = new DataTableServerRowModel(store, vi.fn())

    expect(model.sync(query, { subscribe: true })).toBe(true)
    expect(model.sync(query, { subscribe: true })).toBe(false)
    expect(model.sync(query, { subscribe: false })).toBe(false)
    expect(unsubscribe).toHaveBeenCalledTimes(1)
    expect(model.sync(query, { subscribe: true })).toBe(false)
    await expect(model.ensureRange({ start: 2, end: 4 })).resolves.toBe(true)
    await expect(model.loadSummary()).resolves.toMatchObject({
      values: { count: 10_000_000, amount: 42 },
      loading: false,
      source: 'server',
    })
    await expect(model.search({ text: 'Row 2' })).resolves.toMatchObject({ total: 1 })

    expect(loadRange).toHaveBeenCalledWith(
      { start: 2, end: 4 },
      query,
      expect.objectContaining({ revision: 1, requestId: 1, signal: expect.objectContaining({ aborted: false }) }),
    )
    expect(loadSummary).toHaveBeenCalledWith(query)
    expect(search).toHaveBeenCalledWith({ text: 'Row 2' }, query, undefined, 'next')
    expect(subscribe).toHaveBeenCalledTimes(2)
    expect(subscribe).toHaveBeenLastCalledWith(query, expect.any(Function))
    expect(model.snapshot()).toMatchObject({
      revision: 1,
      subscribed: true,
      summary: {
        values: { count: 10_000_000, amount: 42 },
        loading: false,
      },
    })

    model.dispose()
    expect(unsubscribe).toHaveBeenCalled()
    expect(model.snapshot().query).toBeNull()
  })

  it('keeps only the latest server summary response', async () => {
    const query: DataTableQueryState = { sort: [], filters: [], rowOrder: [], columnOrder: [] }
    const resolvers: Array<(value: Record<string, unknown>) => void> = []
    const store = createDataTableStore<Row>({
      rowKey: 'id',
      source: {
        rowCount: 10_000_000,
        loadSummary: () => new Promise<Record<string, unknown>>(resolve => resolvers.push(resolve)),
      },
    })
    const model = new DataTableServerRowModel(store, vi.fn())
    model.sync(query, { subscribe: false })

    const first = model.loadSummary()
    const second = model.loadSummary()
    resolvers[1]?.({ count: 2 })
    await expect(second).resolves.toMatchObject({ values: { count: 2 } })
    resolvers[0]?.({ count: 1 })
    await expect(first).resolves.toMatchObject({ values: { count: 2 } })
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

  it('virtualizes horizontally across wide center columns', () => {
    const store = createDataTableStore<Row>({ rowKey: 'id', rows: rows(200) })
    const centerColumns = Array.from({ length: 20 }, (_item, index) => ({
      id: `metric-${index}`,
      width: 100,
    }))
    const columns = resolveDataTableColumns<Row>([
      { id: 'name', field: 'name', width: 160, pinned: 'left' },
      ...centerColumns,
      { id: 'amount', field: 'amount', width: 120, pinned: 'right' },
    ], { left: ['name'], right: ['amount'] }, new Map(), store)

    const viewport = createDataTableViewport({
      width: 620,
      height: 220,
      rowHeight: 20,
      headerHeight: 30,
      overscanRows: 2,
      overscanColumns: 1,
      rowCount: store.rowCount,
      columns,
      pinnedTopCount: 0,
      pinnedBottomCount: 0,
      scrollX: 750,
      scrollY: 0,
    })

    expect(viewport.maxScrollX).toBeGreaterThan(0)
    expect(viewport.centerColumnRange.start).toBeGreaterThan(0)
    expect(viewport.centerColumnRange.end).toBeLessThan(centerColumns.length)
    expect(viewport.centerColumnRange.end - viewport.centerColumnRange.start).toBeLessThan(centerColumns.length)
    expect(viewport.centerColumnOffset).toBe(viewport.centerColumnRange.start * 100)
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

describe('DataTable scrollbars', () => {
  it('normalizes shared and axis scrollbar options', () => {
    const options = normalizeDataTableScrollbars({
      visibility: 'hover',
      thickness: 8,
      minThumbSize: 36,
      radius: 6,
      trackColor: '#e2e8f0',
      thumbColor: '#2563eb',
      thumbHoverColor: '#1d4ed8',
      className: 'ops-scrollbar',
      horizontal: { visibility: 'scroll', thickness: 12 },
      vertical: false,
      nativeRenderer: false,
    })

    expect(options).not.toBe(false)
    if (options === false) return
    expect(options.visibility).toBe('hover')
    expect(options.horizontal && options.horizontal.visibility).toBe('scroll')
    expect(options.horizontal && options.horizontal.thickness).toBe(12)
    expect(options.vertical).toBe(false)
    expect(options.nativeRenderer).toBe(false)
    expect(options.className).toBe('ops-scrollbar')
  })

  it('uses root visual style defaults for scrollbar colors', () => {
    const options = normalizeDataTableScrollbars({ visibility: 'always' }, {
      trackColor: '#eef2ff',
      thumbColor: '#2563eb',
      thumbHoverColor: '#1d4ed8',
    })

    expect(options).not.toBe(false)
    if (options === false) return
    expect(options.trackColor).toBe('#eef2ff')
    expect(options.thumbColor).toBe('#2563eb')
    expect(options.thumbHoverColor).toBe('#1d4ed8')
  })

  it('calculates horizontal and vertical scrollbar geometry from viewport', () => {
    const app = createApp(640, 360)
    const root = mountRoot(app)

    root.setProps({
      columns: [
        { id: 'name', title: 'Name', field: 'name', width: 180, pinned: 'left', resizable: true },
        ...Array.from({ length: 8 }, (_item, index) => ({ id: `metric-${index}`, width: 160 })),
        { id: 'amount', title: 'Amount', field: 'amount', width: 120, pinned: 'right' },
      ],
      scrollbars: {
        visibility: 'always',
        thickness: 8,
        minThumbSize: 40,
      },
    } as never)
    root.getApi().scrollTo(180, 120)

    const geometry = (root as any).createScrollbarGeometry()
    expect(geometry.horizontal).toMatchObject({
      axis: 'horizontal',
      value: 180,
      options: expect.objectContaining({ thickness: 8, minThumbSize: 40 }),
    })
    expect(geometry.vertical).toMatchObject({
      axis: 'vertical',
      value: 120,
      options: expect.objectContaining({ thickness: 8, minThumbSize: 40 }),
    })
    expect(geometry.horizontal.thumb.width).toBeGreaterThanOrEqual(40)
    expect(geometry.vertical.thumb.height).toBeGreaterThanOrEqual(40)

    app.destroy()
  })

  it('maps scrollbar drag using total drag distance', () => {
    const app = createApp(640, 360)
    const root = mountRoot(app)
    root.setProps({
      scrollbars: {
        visibility: 'always',
        thickness: 8,
        minThumbSize: 40,
      },
    } as never)

    root.eventHandlers.mousedown?.(new MouseEvent('mousedown', { clientX: 632, clientY: 90 }))
    root.eventHandlers.dragmove?.(
      new MouseEvent('mousemove', { clientX: 632, clientY: 190 }),
      0,
      5,
      {
        pointerId: 1,
        startX: 632,
        startY: 90,
        x: 632,
        y: 190,
        dx: 0,
        dy: 5,
        totalDx: 0,
        totalDy: 100,
      },
    )

    expect(root.getApi().getViewport().scrollY).toBeGreaterThan(1000)

    root.eventHandlers.dragend?.(
      new MouseEvent('mouseup', { clientX: 632, clientY: 210 }),
      {
        pointerId: 1,
        startX: 632,
        startY: 90,
        x: 632,
        y: 210,
        dx: 0,
        dy: 20,
        totalDx: 0,
        totalDy: 120,
      },
    )

    expect(root.getApi().getViewport().scrollY).toBeGreaterThan(1200)
    app.destroy()
  })
})

describe('DataTable editing', () => {
  it('normalizes DOM overlay editing defaults and disabled mode', () => {
    const defaults = normalizeDataTableEditing(undefined)
    const disabled = normalizeDataTableEditing(false)

    expect(defaults).not.toBe(false)
    if (defaults === false) return
    expect(defaults.renderer).toBe('dom-overlay')
    expect(defaults.mode).toBe('cell')
    expect(defaults.trigger).toEqual(['doubleClick', 'enter', 'programmatic'])
    expect(defaults.commitOnBlur).toBe(true)
    expect(defaults.selectTextOnStart).toBe(true)
    expect(disabled).toBe(false)
  })

  it('starts editing editable cells and commits through the store', async () => {
    const app = createApp(640, 360)
    const root = mountRoot(app)

    root.setProps({
      columns: [
        { id: 'name', title: 'Name', field: 'name', width: 180, pinned: 'left', editable: true, editor: 'text' },
        { id: 'status', title: 'Status', field: 'status', width: 120 },
        { id: 'amount', title: 'Amount', field: 'amount', width: 120, pinned: 'right' },
      ],
    } as never)
    app.raph.run()

    expect(root.getApi().startEdit('row-2', 'name')).toBe(true)
    expect(root.getApi().getEditingState()?.value).toBe('Row 2')

    await root.getApi().commitEdit('Edited row')

    expect(root.store.getRow('row-2')?.name).toBe('Edited row')
    expect(root.getApi().getEditingState()).toBeNull()
    app.destroy()
  })

  it('keeps the editor open on validation failure', async () => {
    const app = createApp(640, 360)
    const root = mountRoot(app)

    root.setProps({
      columns: [
        {
          id: 'name',
          title: 'Name',
          field: 'name',
          width: 180,
          pinned: 'left',
          editable: true,
          editor: 'text',
          validateEditValue: value => String(value).trim() ? true : 'Name is required',
        },
        { id: 'status', title: 'Status', field: 'status', width: 120 },
        { id: 'amount', title: 'Amount', field: 'amount', width: 120, pinned: 'right' },
      ],
    } as never)
    app.raph.run()

    expect(root.getApi().startEdit('row-1', 'name')).toBe(true)
    await root.getApi().commitEdit('')

    expect(root.store.getRow('row-1')?.name).toBe('Row 1')
    expect(root.getApi().getEditingState()?.invalid).toBe(true)
    expect(root.getApi().getEditingState()?.message).toBe('Name is required')
    app.destroy()
  })

  it('does not start editing disabled or non-editable cells', () => {
    const app = createApp(640, 360)
    const root = mountRoot(app)

    expect(root.getApi().startEdit('row-1', 'status')).toBe(false)

    root.setProps({
      editing: false,
      columns: [
        { id: 'name', title: 'Name', field: 'name', width: 180, pinned: 'left', editable: true },
        { id: 'status', title: 'Status', field: 'status', width: 120 },
        { id: 'amount', title: 'Amount', field: 'amount', width: 120, pinned: 'right' },
      ],
    } as never)
    app.raph.run()

    expect(root.getApi().startEdit('row-1', 'name')).toBe(false)
    app.destroy()
  })

  it('emits async commit errors and leaves the editor active', async () => {
    const app = createApp(640, 360)
    const root = mountRoot(app)
    const onEditError = vi.fn()

    root.setProps({
      editing: {
        onEditCommit: async () => {
          throw new Error('Server rejected edit')
        },
        onEditError,
      },
      columns: [
        { id: 'name', title: 'Name', field: 'name', width: 180, pinned: 'left', editable: true },
        { id: 'status', title: 'Status', field: 'status', width: 120 },
        { id: 'amount', title: 'Amount', field: 'amount', width: 120, pinned: 'right' },
      ],
    } as never)
    app.raph.run()

    expect(root.getApi().startEdit('row-1', 'name')).toBe(true)
    await root.getApi().commitEdit('Rejected')

    expect(root.store.getRow('row-1')?.name).toBe('Row 1')
    expect(root.getApi().getEditingState()?.invalid).toBe(true)
    expect(onEditError).toHaveBeenCalledTimes(1)
    app.destroy()
  })
})

describe('DataTableViewPipeline', () => {
  function createPipelineStore(): ReturnType<typeof createDataTableStore<Row>> {
    return createDataTableStore<Row>({
      rowKey: 'id',
      rows: [
        { id: 'row-a', name: 'Zulu', status: 'draft', amount: 30 },
        { id: 'row-b', name: 'Alpha', status: 'active', amount: 10 },
        { id: 'row-c', name: 'Beta', status: 'active', amount: 20 },
      ],
    })
  }

  function syncPipeline(pipeline: DataTableViewPipeline<Row>, store: ReturnType<typeof createPipelineStore>): void {
    const columns = resolveDataTableColumns<Row>([
      { id: 'name', field: 'name', sortable: true },
      { id: 'status', field: 'status', filter: 'set' },
      { id: 'amount', field: 'amount', sortable: { accessor: row => row.amount } },
    ], {}, new Map(), store)
    pipeline.sync({
      columns,
      performance: normalizeDataTablePerformance(undefined),
      view: {
        sorting: { mode: 'client', multi: true, headerClick: 'append', controlled: false, initial: [] },
        filtering: { mode: 'client', controlled: false, initial: [] },
        search: {
          mode: 'client',
          scope: 'cells',
          match: 'contains',
          caseSensitive: false,
          columns: [],
          highlight: 'cell-text',
          filter: false,
          highlightColor: '#b45309',
          activeHighlightColor: '#be123c',
          controlled: false,
        },
        serverRowModel: false,
        rowOrdering: { enabled: true, mode: 'view', manualLayer: true },
        columnOrdering: { enabled: true, allowCrossPinned: false, order: [] },
        filterUi: { headerMenu: false, filterRow: false },
        grouping: false,
        groupingPinnedRows: false,
      },
    })
  }

  function createGroupingView(expanded: 'all' | 'none') {
    return {
      sorting: { mode: 'client' as const, multi: true, headerClick: 'append' as const, controlled: false, initial: [] },
      filtering: { mode: 'client' as const, controlled: false, initial: [] },
      search: false,
      serverRowModel: false,
      rowOrdering: { enabled: true, mode: 'view' as const, manualLayer: true },
      columnOrdering: { enabled: true, allowCrossPinned: false, order: [] },
      filterUi: { headerMenu: false, filterRow: false },
      grouping: {
        enabled: true,
        mode: 'client' as const,
        groups: [{ id: 'status', field: 'status', title: 'Status', aggregates: { amount: 'sum' as const } }],
        expanded,
        showGroupRows: true,
        showGroupFooters: true,
        showGrandFooter: true,
        footerPlacement: 'scroll' as const,
        controlled: false,
      },
      groupingPinnedRows: false,
    }
  }

  it('enables append multi-sort by default in view options', () => {
    const view = normalizeDataTableView({})

    expect(view.sorting && view.sorting.multi).toBe(true)
    expect(view.sorting && view.sorting.headerClick).toBe('append')
  })

  it('sorts, filters and applies manual row order over the current view', () => {
    const store = createPipelineStore()
    const pipeline = new DataTableViewPipeline<Row>(store)
    syncPipeline(pipeline, store)

    pipeline.setFilter('status', { operator: 'equals', value: 'active' })
    pipeline.setSort({ columnId: 'amount', direction: 'desc' })

    expect(pipeline.getViewRows().map(row => row.rowId)).toEqual(['row-c', 'row-b'])

    pipeline.reorderRows({ rowId: 'row-b', fromIndex: 1, toIndex: 0 })
    expect(pipeline.getViewRows().map(row => row.rowId)).toEqual(['row-b', 'row-c'])

    pipeline.reset()
    expect(pipeline.getViewRows().map(row => row.rowId)).toEqual(['row-a', 'row-b', 'row-c'])
  })

  it('cycles header multi-sort by appending columns and normalizing priorities', () => {
    const store = createPipelineStore()
    const pipeline = new DataTableViewPipeline<Row>(store)
    syncPipeline(pipeline, store)

    pipeline.cycleSort('status', false)
    pipeline.cycleSort('amount', false)
    expect(pipeline.getState().sort).toEqual([
      { columnId: 'status', direction: 'asc', priority: 0 },
      { columnId: 'amount', direction: 'asc', priority: 1 },
    ])

    pipeline.cycleSort('status', false)
    expect(pipeline.getState().sort).toEqual([
      { columnId: 'amount', direction: 'asc', priority: 0 },
      { columnId: 'status', direction: 'desc', priority: 1 },
    ])

    pipeline.cycleSort('status', false)
    expect(pipeline.getState().sort).toEqual([
      { columnId: 'amount', direction: 'asc', priority: 0 },
    ])
  })

  it('filters rows with nested AND/OR expressions', () => {
    const store = createPipelineStore()
    const pipeline = new DataTableViewPipeline<Row>(store)
    syncPipeline(pipeline, store)

    pipeline.setFilters({
      logic: 'or',
      rules: [
        { columnId: 'name', operator: 'contains', value: 'Zulu' },
        {
          logic: 'and',
          rules: [
            { columnId: 'status', operator: 'equals', value: 'active' },
            { columnId: 'amount', operator: 'gte', value: 20 },
          ],
        },
      ],
    })

    expect(pipeline.getViewRows().map(row => row.rowId)).toEqual(['row-a', 'row-c'])
    expect(pipeline.getQuery().filters).toMatchObject({ logic: 'or' })
  })

  it('searches cells, tracks active matches and stays sparse above maxClientRows', () => {
    const store = createPipelineStore()
    const pipeline = new DataTableViewPipeline<Row>(store)
    syncPipeline(pipeline, store)

    pipeline.setSearch({ text: 'a', scope: 'cells', columns: ['name'], match: 'contains', highlight: 'cell-text' })
    expect(pipeline.getQuery().search?.filter).toBe(true)
    expect(pipeline.getSearchState().matches.map(match => match.rowId)).toEqual(['row-b', 'row-c'])
    expect(pipeline.findNext()).toMatchObject({ rowId: 'row-c', columnId: 'name' })
    expect(pipeline.findPrevious()).toMatchObject({ rowId: 'row-b', columnId: 'name' })
    expect(pipeline.getSearchMatchForCell('row-b', 'name')?.match.ranges[0]).toEqual({ start: 0, end: 1 })
    expect(pipeline.getSearchMatchForRow('row-b')?.match.rowId).toBe('row-b')

    pipeline.setSearch({ text: 'Alpha', scope: 'cells', columns: ['name'], match: 'contains', highlight: 'row-cell', filter: true })
    expect(pipeline.getViewRows().map(row => row.rowId)).toEqual(['row-b'])
    expect(pipeline.getQuery().search?.filter).toBe(true)
    pipeline.clearSearch()
    expect(pipeline.getViewRows().map(row => row.rowId)).toEqual(['row-a', 'row-b', 'row-c'])

    const getRow = vi.fn((index: number) => rows(1, index)[0])
    const lazyStore = createDataTableStore<Row>({
      rowKey: 'id',
      source: { rowCount: 10_000_000, getRow },
    })
    const lazyPipeline = new DataTableViewPipeline<Row>(lazyStore)
    lazyPipeline.sync({
      columns: resolveDataTableColumns<Row>([{ id: 'name', field: 'name' }], {}, new Map(), lazyStore),
      performance: normalizeDataTablePerformance({ maxClientRows: 100_000 }),
      view: {
        sorting: false,
        filtering: false,
        search: {
          mode: 'client',
          scope: 'cells',
          match: 'contains',
          caseSensitive: false,
          columns: ['name'],
          highlight: 'cell-text',
          filter: false,
          highlightColor: '#b45309',
          activeHighlightColor: '#be123c',
          controlled: false,
        },
        serverRowModel: false,
        rowOrdering: false,
        columnOrdering: false,
        filterUi: false,
        grouping: false,
        groupingPinnedRows: false,
      },
    })
    lazyPipeline.setSearch('Row')
    expect(lazyPipeline.rowCount).toBe(10_000_000)
    expect(lazyPipeline.getSearchState().local).toBe(false)
    expect(getRow).not.toHaveBeenCalled()
    expect(lazyPipeline.getQuery().search?.text).toBe('Row')
  })

  it('keeps server mode as identity view while preserving query state', () => {
    const store = createPipelineStore()
    const pipeline = new DataTableViewPipeline<Row>(store)
    const columns = resolveDataTableColumns<Row>([
      { id: 'amount', field: 'amount', sortable: true },
    ], {}, new Map(), store)

    pipeline.sync({
      columns,
      performance: normalizeDataTablePerformance(undefined),
      view: {
        sorting: { mode: 'server', multi: true, headerClick: 'append', controlled: true, initial: [] },
        filtering: { mode: 'server', controlled: true, initial: [] },
        search: false,
        serverRowModel: false,
        rowOrdering: false,
        columnOrdering: false,
        filterUi: false,
        grouping: false,
        groupingPinnedRows: false,
      },
    })
    pipeline.setSort({ columnId: 'amount', direction: 'desc' })

    expect(pipeline.getViewRows().map(row => row.rowId)).toEqual(['row-a', 'row-b', 'row-c'])
    expect(pipeline.getQuery().sort).toEqual([{ columnId: 'amount', direction: 'desc', priority: 0 }])
    expect(pipeline.isServerControlled()).toBe(true)
  })

  it('keeps authoritative server row model sparse even when client modes are configured', () => {
    const getRow = vi.fn((index: number) => rows(1, index)[0])
    const store = createDataTableStore<Row>({
      rowKey: 'id',
      source: {
        rowCount: 10_000_000,
        getRow,
      },
    })
    const pipeline = new DataTableViewPipeline<Row>(store)

    pipeline.sync({
      columns: resolveDataTableColumns<Row>([
        { id: 'amount', field: 'amount', sortable: true },
        { id: 'status', field: 'status', filter: 'set' },
      ], {}, new Map(), store),
      performance: normalizeDataTablePerformance({ maxClientRows: 100_000 }),
      view: {
        sorting: { mode: 'client', multi: true, headerClick: 'append', controlled: false, initial: [] },
        filtering: { mode: 'client', controlled: false, initial: [] },
        search: {
          mode: 'client',
          scope: 'cells',
          match: 'contains',
          caseSensitive: false,
          columns: ['name'],
          highlight: 'cell-text',
          filter: true,
          highlightColor: '#b45309',
          activeHighlightColor: '#be123c',
          controlled: false,
        },
        serverRowModel: { enabled: true, authoritative: true, subscribe: false, loadSummary: false },
        rowOrdering: false,
        columnOrdering: false,
        filterUi: false,
        grouping: false,
        groupingPinnedRows: false,
      },
    })
    pipeline.setSort({ columnId: 'amount', direction: 'desc' })
    pipeline.setFilter('status', { operator: 'equals', value: 'active' })
    pipeline.setSearch('Row')
    pipeline.setServerSearchResult({
      matches: [{ rowId: 'row-5000', rowIndex: 5_000, columnId: 'name', value: 'Row 5000', ranges: [{ start: 0, end: 3 }] }],
      total: 1_000,
    })

    expect(pipeline.rowCount).toBe(10_000_000)
    expect(getRow).not.toHaveBeenCalled()
    expect(pipeline.getSearchState()).toMatchObject({
      total: 1_000,
      activeMatch: { rowId: 'row-5000', rowIndex: 5_000 },
      local: false,
    })
    expect(pipeline.getQuery()).toMatchObject({
      sort: [{ columnId: 'amount', direction: 'desc', priority: 0 }],
      search: { text: 'Row' },
    })
  })

  it('appends paged server search matches without rebuilding local rows', () => {
    const store = createDataTableStore<Row>({
      rowKey: 'id',
      source: { rowCount: 10_000_000 },
    })
    const pipeline = new DataTableViewPipeline<Row>(store)
    pipeline.sync({
      columns: resolveDataTableColumns<Row>([{ id: 'name', field: 'name' }], {}, new Map(), store),
      performance: normalizeDataTablePerformance({ maxClientRows: 100_000 }),
      view: {
        sorting: false,
        filtering: false,
        search: {
          mode: 'server',
          scope: 'cells',
          match: 'contains',
          caseSensitive: false,
          columns: ['name'],
          highlight: 'cell-text',
          filter: true,
          highlightColor: '#b45309',
          activeHighlightColor: '#be123c',
          controlled: false,
        },
        serverRowModel: { enabled: true, authoritative: true, subscribe: false, loadSummary: false },
        rowOrdering: false,
        columnOrdering: false,
        filterUi: false,
        grouping: false,
        groupingPinnedRows: false,
      },
    })
    pipeline.setSearch('Row')
    pipeline.setServerSearchResult({
      matches: [{ rowId: 'row-1', rowIndex: 1, columnId: 'name', value: 'Row 1', ranges: [{ start: 0, end: 3 }] }],
      total: 2,
    })
    pipeline.appendServerSearchResult({
      matches: [{ rowId: 'row-2', rowIndex: 2, columnId: 'name', value: 'Row 2', ranges: [{ start: 0, end: 3 }] }],
      total: 2,
    }, 1)

    expect(pipeline.getSearchState()).toMatchObject({
      total: 2,
      activeIndex: 1,
      activeMatch: { rowId: 'row-2', rowIndex: 2 },
      local: false,
    })
    expect(pipeline.rowCount).toBe(10_000_000)
    expect(pipeline.getViewRowAt(2)?.storeIndex).toBe(2)
  })

  it('prepends previous server search pages and exposes cursor state', () => {
    const store = createDataTableStore<Row>({
      rowKey: 'id',
      source: { rowCount: 10_000_000 },
    })
    const pipeline = new DataTableViewPipeline<Row>(store)
    pipeline.sync({
      columns: resolveDataTableColumns<Row>([{ id: 'name', field: 'name' }], {}, new Map(), store),
      performance: normalizeDataTablePerformance({ maxClientRows: 100_000 }),
      view: {
        sorting: false,
        filtering: false,
        search: {
          mode: 'server',
          scope: 'cells',
          match: 'contains',
          caseSensitive: false,
          columns: ['name'],
          highlight: 'cell-text',
          filter: true,
          highlightColor: '#b45309',
          activeHighlightColor: '#be123c',
          controlled: false,
        },
        serverRowModel: { enabled: true, authoritative: true, subscribe: false, loadSummary: false },
        rowOrdering: false,
        columnOrdering: false,
        filterUi: false,
        grouping: false,
        groupingPinnedRows: false,
      },
    })

    pipeline.setSearch('Row')
    pipeline.setServerSearchLoading(true)
    expect(pipeline.getSearchState().loading).toBe(true)
    pipeline.setServerSearchResult({
      matches: [{ rowId: 'row-10', rowIndex: 10, columnId: 'name', value: 'Row 10', ranges: [{ start: 0, end: 3 }] }],
      total: 3,
      cursor: '20',
      previousCursor: '9',
      hasMore: true,
    })
    pipeline.prependServerSearchResult({
      matches: [
        { rowId: 'row-8', rowIndex: 8, columnId: 'name', value: 'Row 8', ranges: [{ start: 0, end: 3 }] },
        { rowId: 'row-9', rowIndex: 9, columnId: 'name', value: 'Row 9', ranges: [{ start: 0, end: 3 }] },
      ],
      total: 3,
      cursor: '20',
      previousCursor: '7',
    })

    expect(pipeline.getSearchState()).toMatchObject({
      activeIndex: 1,
      cursor: '20',
      previousCursor: '7',
      hasMore: true,
      loading: false,
    })
    expect(pipeline.getSearchState().matches.map(match => match.rowId)).toEqual(['row-8', 'row-9', 'row-10'])
  })

  it('preserves filter expression logic when patching a single column filter', () => {
    const store = createPipelineStore()
    const pipeline = new DataTableViewPipeline<Row>(store)
    pipeline.sync({
      columns: resolveDataTableColumns<Row>([
        { id: 'status', field: 'status', filter: 'set' },
        { id: 'name', field: 'name', filter: 'text' },
        { id: 'amount', field: 'amount', filter: 'number' },
      ], {}, new Map(), store),
      performance: normalizeDataTablePerformance(undefined),
      view: {
        sorting: false,
        filtering: {
          mode: 'client',
          controlled: false,
          initial: {
            logic: 'or',
            rules: [
              { columnId: 'status', operator: 'equals', value: 'active' },
              { columnId: 'name', operator: 'contains', value: 'B' },
            ],
          },
        },
        search: false,
        serverRowModel: false,
        rowOrdering: false,
        columnOrdering: false,
        filterUi: false,
        grouping: false,
        groupingPinnedRows: false,
      },
    })

    pipeline.setFilter('amount', { operator: 'gt', value: 10 })
    expect(pipeline.getState().filters).toMatchObject({
      logic: 'or',
      rules: expect.arrayContaining([
        { columnId: 'status', operator: 'equals', value: 'active' },
        { columnId: 'name', operator: 'contains', value: 'B' },
        { columnId: 'amount', operator: 'gt', value: 10 },
      ]),
    })
    pipeline.clearFilter('name')
    expect(pipeline.getState().filters).toMatchObject({
      logic: 'or',
      rules: expect.not.arrayContaining([
        expect.objectContaining({ columnId: 'name' }),
      ]),
    })
  })

  it('groups rows after filter and sort and exposes aggregate view rows', () => {
    const store = createPipelineStore()
    const pipeline = new DataTableViewPipeline<Row>(store)
    const columns = resolveDataTableColumns<Row>([
      { id: 'status', field: 'status', filter: 'set' },
      { id: 'amount', field: 'amount', sortable: true },
    ], {}, new Map(), store)

    pipeline.sync({
      columns,
      performance: normalizeDataTablePerformance(undefined),
      view: {
        ...createGroupingView('all'),
      },
    })
    pipeline.setFilter('status', { operator: 'equals', value: 'active' })
    pipeline.setSort({ columnId: 'amount', direction: 'desc' })

    const viewRows = pipeline.getViewRows()
    expect(viewRows.map(row => row.kind)).toEqual(['group', 'data', 'data', 'group-footer', 'grand-footer'])
    expect(viewRows[0]).toMatchObject({ kind: 'group', rowId: 'status:active' })
    expect(viewRows[3]).toMatchObject({ kind: 'group-footer', rowId: 'status:active:footer' })
    expect(viewRows[4]).toMatchObject({ kind: 'grand-footer' })
    expect(pipeline.getGroupingState().expandedGroups).toEqual(['status:active'])

    pipeline.collapseGroup('status:active')
    expect(pipeline.getViewRows().map(row => row.kind)).toEqual(['group', 'grand-footer'])

    pipeline.sync({ columns, view: createGroupingView('none'), performance: normalizeDataTablePerformance(undefined) })
    expect(pipeline.getGroupingState().expandedGroups).toEqual([])
  })

  it('places group footer rows before children when grouping pinned policy requests group-start', () => {
    const store = createPipelineStore()
    const pipeline = new DataTableViewPipeline<Row>(store)
    const columns = resolveDataTableColumns<Row>([
      { id: 'status', field: 'status', filter: 'set' },
      { id: 'amount', field: 'amount', sortable: true },
    ], {}, new Map(), store)

    pipeline.sync({
      columns,
      performance: normalizeDataTablePerformance(undefined),
      view: {
        ...createGroupingView('all'),
        groupingPinnedRows: {
          global: 'show',
          insideGroup: true,
          placement: 'group-start',
        },
      },
    })
    pipeline.setFilter('status', { operator: 'equals', value: 'active' })

    expect(pipeline.getViewRows().map(row => row.kind)).toEqual(['group', 'group-footer', 'data', 'data', 'grand-footer'])
  })

  it('keeps server grouping as query state without local materialization', () => {
    const store = createPipelineStore()
    const pipeline = new DataTableViewPipeline<Row>(store)
    pipeline.sync({
      columns: resolveDataTableColumns<Row>([{ id: 'status', field: 'status' }], {}, new Map(), store),
      performance: normalizeDataTablePerformance(undefined),
      view: {
        sorting: false,
        filtering: false,
        search: false,
        serverRowModel: { enabled: true, authoritative: true, subscribe: false, loadSummary: false },
        rowOrdering: false,
        columnOrdering: false,
        filterUi: false,
        grouping: {
          enabled: true,
          mode: 'server',
          groups: [{ id: 'status', field: 'status' }],
          expanded: 'all',
          showGroupRows: true,
          showGroupFooters: false,
          showGrandFooter: false,
          footerPlacement: 'scroll',
          controlled: true,
        },
        groupingPinnedRows: false,
      },
    })

    expect(pipeline.getViewRows().map(row => row.kind)).toEqual(['data', 'data', 'data'])
    expect(pipeline.getQuery().grouping?.groups[0]?.id).toBe('status')
    expect(pipeline.isServerControlled()).toBe(true)
  })

  it('guards client sort/filter/grouping above maxClientRows and stays sparse', () => {
    const getRow = vi.fn((index: number) => rows(1, index)[0])
    const store = createDataTableStore<Row>({
      rowKey: 'id',
      source: {
        rowCount: 10_000_000,
        getRow,
      },
    })
    const pipeline = new DataTableViewPipeline<Row>(store)

    pipeline.sync({
      columns: resolveDataTableColumns<Row>([
        { id: 'amount', field: 'amount', sortable: true },
        { id: 'status', field: 'status', filter: 'set' },
      ], {}, new Map(), store),
      performance: normalizeDataTablePerformance({ maxClientRows: 100_000 }),
      view: {
        sorting: { mode: 'client', multi: true, headerClick: 'append', controlled: false, initial: [{ columnId: 'amount', direction: 'desc' }] },
        filtering: { mode: 'client', controlled: false, initial: [{ columnId: 'status', operator: 'equals', value: 'active' }] },
        search: false,
        serverRowModel: false,
        rowOrdering: false,
        columnOrdering: false,
        filterUi: false,
        grouping: {
          enabled: true,
          mode: 'client',
          groups: [{ id: 'status', field: 'status' }],
          expanded: 'all',
          showGroupRows: true,
          showGroupFooters: false,
          showGrandFooter: false,
          footerPlacement: 'scroll',
          controlled: false,
        },
        groupingPinnedRows: false,
      },
    })

    expect(pipeline.rowCount).toBe(10_000_000)
    expect(getRow).not.toHaveBeenCalled()
    expect(pipeline.getViewRowAt(5_000)?.storeIndex).toBe(5_000)
    expect(getRow).toHaveBeenCalledTimes(1)
  })
})

describe('DataTableSummaryEngine', () => {
  it('computes numeric summaries and updates them incrementally', () => {
    const engine = new DataTableSummaryEngine<Row>()
    const result = engine.compute(rows(4), [
      { id: 'count', aggregate: 'count' },
      { id: 'amountSum', field: 'amount', aggregate: 'sum' },
      { id: 'amountAvg', field: 'amount', aggregate: 'avg' },
      { id: 'amountMin', field: 'amount', aggregate: 'min' },
      { id: 'amountMax', field: 'amount', aggregate: 'max' },
    ])

    expect(result.values).toMatchObject({
      count: 4,
      amountSum: 60,
      amountAvg: 15,
      amountMin: 0,
      amountMax: 30,
    })

    const updated = engine.applyRowChange(
      { id: 'row-3', name: 'Row 3', status: 'draft', amount: 30 },
      { id: 'row-3', name: 'Row 3', status: 'draft', amount: 75 },
      3,
    )
    expect(updated.values).toMatchObject({
      count: 4,
      amountSum: 105,
      amountAvg: 26.25,
      amountMin: 0,
      amountMax: 75,
    })

    const removed = engine.applyRowChange(
      { id: 'row-0', name: 'Row 0', status: 'active', amount: 0 },
      undefined,
      0,
    )
    expect(removed.values).toMatchObject({
      count: 3,
      amountSum: 105,
      amountAvg: 35,
      amountMin: 10,
      amountMax: 75,
    })
  })
})

describe('DataTable DSL templates', () => {
  it('compiles column and pinned row marker nodes', () => {
    const cellSlot = (context: DataTableCellContext<Row>) => [
      h(Surface, { background: '#fff', padding: '0 10' }, () => [
        h(TextBlock, { text: String(context.value), ellipsis: true }),
      ]),
    ]
    const editorSlot = () => [h('input', { value: 'Draft' })]
    const dsl = compileDataTableDslNodes<Row>([
      h(DataTableColumn, {
        id: 'name',
        title: 'Name',
        field: 'name',
        resizable: true,
        sortable: true,
        filter: 'text',
        reorderable: true,
        editable: true,
        editor: 'text',
      }, {
        cell: cellSlot,
        editor: editorSlot,
      }),
    ])

    expect(dsl.columns).toHaveLength(1)
    expect(dsl.columns[0].id).toBe('name')
    expect(dsl.columns[0].resizable).toBe(true)
    expect(dsl.columns[0].sortable).toBe(true)
    expect(dsl.columns[0].filter).toBe('text')
    expect(dsl.columns[0].reorderable).toBe(true)
    expect(dsl.columns[0].editable).toBe(true)
    expect(dsl.columns[0].editor).toBe('text')
    expect(dsl.columns[0].cellTemplate).toBeTypeOf('function')
    expect(dsl.columns[0].editorTemplate).toBeTypeOf('function')
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
        viewRowIndex: 0,
        columnIndex: 0,
        selected: false,
        hovered: false,
        cellHovered: false,
        rowHovered: false,
        columnHovered: false,
        cellSelected: false,
        rowSelected: false,
        columnSelected: false,
        hoverAlpha: 0,
        selectionAlpha: 0,
        zoom: 1,
        rowScale: 1,
        headerScale: 1,
        columnScale: 1,
        textScale: 1,
        iconScale: 1,
        searchMatched: false,
        searchActive: false,
        searchRowMatched: false,
        searchRowActive: false,
        editing: false,
        editingInvalid: false,
        editingDirty: false,
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

  it('compiles interaction layer marker nodes', () => {
    const dsl = compileDataTableDslNodes<Row>([
      h(DataTableInteractionLayer, {}, {
        hover: () => [
          h(Rect, {
            x: 4,
            y: 6,
            width: 20,
            height: 10,
            background: '#2563eb',
          }),
        ],
      }),
    ])
    const schema = dsl.interactionLayerTemplate?.({
      hover: null,
      selection: null,
      viewport: createDataTableViewport({
        width: 200,
        height: 100,
        rowHeight: 20,
        headerHeight: 30,
        overscanRows: 0,
        overscanColumns: 0,
        rowCount: 0,
        columns: [],
        pinnedTopCount: 0,
        pinnedBottomCount: 0,
        scrollX: 0,
        scrollY: 0,
      }),
      rects: [],
      state: {
        hover: null,
        selection: null,
        hoverAlpha: 0,
        selectionAlpha: 0,
      },
    })

    expect(schema?.[0]).toMatchObject({
      type: 'rect',
      x: 4,
      y: 6,
      width: 20,
      height: 10,
    })
  })

  it('compiles scrollbar layer marker nodes', () => {
    const dsl = compileDataTableDslNodes<Row>([
      h(DataTableScrollbarLayer, {}, {
        default: () => [
          h(Surface, {
            x: 10,
            y: 80,
            width: 120,
            height: 8,
            radius: 999,
            background: '#14b8a6',
            opacity: 0.8,
          }),
        ],
      }),
    ])
    const viewport = createDataTableViewport({
      width: 200,
      height: 100,
      rowHeight: 20,
      headerHeight: 30,
      overscanRows: 0,
      overscanColumns: 0,
      rowCount: 0,
      columns: [],
      pinnedTopCount: 0,
      pinnedBottomCount: 0,
      scrollX: 0,
      scrollY: 0,
    })
    const schema = dsl.scrollbarLayerTemplate?.({
      horizontal: null,
      vertical: null,
      viewport,
      state: {
        alpha: 1,
        hoveredAxis: null,
        draggingAxis: null,
        pointerInside: true,
      },
      actions: {
        scrollTo: vi.fn(),
        scrollBy: vi.fn(),
        startDrag: vi.fn(),
      },
      store: createDataTableStore<Row>({ rowKey: 'id', rows: [] }),
      api: {} as never,
    })

    expect(schema?.[0]).toMatchObject({
      type: 'rect',
      x: 10,
      y: 80,
      width: 120,
      height: 8,
      styles: {
        background: '#14b8a6',
        opacity: 0.8,
        border: { radius: 999 },
      },
    })
  })

  it('compiles grouping marker templates', () => {
    const dsl = compileDataTableDslNodes<Row>([
      h(DataTableGrouping, {
        groups: [{ id: 'status', field: 'status' }],
        footerPlacement: 'both',
        showGrandFooter: true,
      }, {
        'group-row': (context: any) => [
          h(Surface, { background: '#eef3f8' }, () => [
            h(TextBlock, { text: context.group?.label ?? 'Group' }),
          ]),
        ],
        'grand-footer': () => [
          h(Rect, { x: 2, y: 3, width: 20, height: 10, background: '#0f172a' }),
        ],
      }),
    ])

    expect(dsl.grouping?.groups).toHaveLength(1)
    expect(dsl.grouping?.footerPlacement).toBe('both')
    expect(dsl.groupRowTemplate).toBeTypeOf('function')
    expect(dsl.grandFooterTemplate).toBeTypeOf('function')
  })
})

describe('DataTable Root runtime', () => {
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

  it('does not clear an external lazy store when rows prop is empty', () => {
    const app = createApp()
    const root = mountRoot(app)
    const store = createDataTableStore<Row>({
      rowKey: 'id',
      source: {
        rowCount: 1_000_000,
        loadRange: range => rows(range.end - range.start, range.start),
      },
    })

    root.setProps({ store, rows: [] } as never)
    app.raph.run()

    expect(store.rowCount).toBe(1_000_000)
    expect(root.getApi().getViewState().rowCount).toBe(1_000_000)
    app.destroy()
  })

  it('roundtrips persisted column state through the public API', () => {
    const app = createApp()
    const root = mountRoot(app)
    const onColumnStateChange = vi.fn()
    root.setProps({
      columnState: {
        widths: { status: 144 },
        order: ['status', 'name', 'amount'],
        hidden: ['amount'],
        pinned: { left: ['status'], right: [] },
      },
      onColumnStateChange,
    } as never)
    app.raph.run()

    expect(root.getApi().getColumnState()).toMatchObject({
      widths: { status: 144 },
      order: ['status', 'name', 'amount'],
      hidden: ['amount'],
      pinned: { left: ['status'], right: [] },
    })

    root.getApi().showColumn('amount')
    root.getApi().pinColumn('amount', 'right')
    root.getApi().hideColumn('name')

    expect(onColumnStateChange).toHaveBeenCalled()
    expect(root.getApi().getColumnState()).toMatchObject({
      hidden: ['name'],
      pinned: { left: ['status'], right: ['amount'] },
    })

    root.getApi().resetColumnState()
    expect(root.getApi().getColumnState()).toMatchObject({
      widths: { status: 144 },
      order: ['status', 'name', 'amount'],
      hidden: ['amount'],
      pinned: { left: ['status'], right: [] },
    })
    app.destroy()
  })

  it('saves and restores configured persisted state slices', () => {
    installStorageMock()
    const key = 'datatable:persistence:test'
    window.localStorage.removeItem(key)

    const app = createApp()
    const root = mountRoot(app)
    root.setProps({
      statePersistence: {
        key,
        include: ['columnState', 'sort', 'filters', 'search'],
        debounceMs: 0,
      },
      view: {
        sorting: { mode: 'client', multi: true },
        filtering: { mode: 'client' },
        search: { mode: 'client' },
      },
      columns: [
        { id: 'name', title: 'Name', field: 'name', width: 180, sortable: true, filter: 'text' },
        { id: 'status', title: 'Status', field: 'status', width: 120, sortable: true, filter: { type: 'set', options: ['active', 'draft'] } },
        { id: 'amount', title: 'Amount', field: 'amount', width: 120, sortable: true, filter: 'number' },
      ],
    } as never)
    app.raph.run()

    root.getApi().setColumnState({
      widths: { status: 166 },
      order: ['status', 'name', 'amount'],
      hidden: ['amount'],
      pinned: { left: ['status'], right: [] },
    })
    root.getApi().setSort([{ columnId: 'status', direction: 'desc' }])
    root.getApi().setFilter('status', { operator: 'equals', value: 'active' })
    root.getApi().setSearch({ text: 'Row 2', scope: 'cells', highlight: 'row-cell-text' })
    const saved = root.getApi().saveState()

    expect(saved).toMatchObject({
      columnState: {
        widths: { status: 166 },
        order: ['status', 'name', 'amount'],
        hidden: ['amount'],
      },
      sort: [{ columnId: 'status', direction: 'desc', priority: 0 }],
      search: { text: 'Row 2', highlight: 'row-cell-text' },
    })
    app.destroy()

    const nextApp = createApp()
    const nextRoot = mountRoot(nextApp)
    nextRoot.setProps({
      statePersistence: {
        key,
        include: ['columnState', 'sort', 'filters', 'search'],
        debounceMs: 0,
      },
      view: {
        sorting: { mode: 'client', multi: true },
        filtering: { mode: 'client' },
        search: { mode: 'client' },
      },
      columns: [
        { id: 'name', title: 'Name', field: 'name', width: 180, sortable: true, filter: 'text' },
        { id: 'status', title: 'Status', field: 'status', width: 120, sortable: true, filter: { type: 'set', options: ['active', 'draft'] } },
        { id: 'amount', title: 'Amount', field: 'amount', width: 120, sortable: true, filter: 'number' },
      ],
    } as never)
    nextApp.raph.run()

    expect(nextRoot.getApi().restoreState()).toBe(true)
    expect(nextRoot.getApi().getColumnState()).toMatchObject({
      widths: { status: 166 },
      order: ['status', 'name', 'amount'],
      hidden: ['amount'],
    })
    expect(nextRoot.getApi().getViewState().sort).toEqual([{ columnId: 'status', direction: 'desc', priority: 0 }])
    expect(nextRoot.getApi().getSearchState().query.text).toBe('Row 2')

    nextRoot.getApi().resetPersistedState()
    expect(window.localStorage.getItem(key)).toBeNull()
    nextApp.destroy()
  })

  it('uses header menu actions before sort and column drag', () => {
    const app = createApp()
    const root = mountRoot(app)
    const onSortChange = vi.fn()
    root.setProps({
      view: {
        sorting: { mode: 'client', multi: true },
        filtering: { mode: 'client' },
        columnOrdering: { enabled: true },
      },
      columns: [
        { id: 'name', title: 'Name', field: 'name', width: 180, sortable: true, filter: 'text', reorderable: true },
        { id: 'status', title: 'Status', field: 'status', width: 120, sortable: true, filter: 'text', reorderable: true },
        { id: 'amount', title: 'Amount', field: 'amount', width: 120, sortable: true, filter: 'number', reorderable: true },
      ],
      onSortChange,
    } as never)
    app.raph.run()

    root.eventHandlers.mousedown?.(new MouseEvent('mousedown', { clientX: 170, clientY: 12 }))
    expect(root.getApi().getViewState().sort).toEqual([])

    root.eventHandlers.mousedown?.(new MouseEvent('mousedown', { clientX: 20, clientY: 50 }))
    expect(onSortChange).toHaveBeenCalledWith([{ columnId: 'name', direction: 'asc', priority: 0 }])
    expect(root.getApi().getViewState().sort).toEqual([{ columnId: 'name', direction: 'asc', priority: 0 }])

    app.destroy()
  })

  it('moves active cells through the keyboard navigation API', () => {
    const app = createApp()
    const root = mountRoot(app)
    const onActiveCellChange = vi.fn()
    const onKeyboardAction = vi.fn()
    root.setProps({
      keyboardNavigation: { enabled: true },
      selection: {
        enabled: true,
        mode: 'cell',
        cardinality: 'multiple',
        gestures: { shiftRange: true },
      },
      onActiveCellChange,
      onKeyboardAction,
    } as never)
    app.raph.run()

    expect(root.getApi().focusCell('row-0', 'name')).toBe(true)
    expect(root.getApi().moveActiveCell('right')).toBe(true)
    expect(root.getApi().getSelection()?.activeCell).toMatchObject({
      rowId: 'row-0',
      columnId: 'status',
      columnIndex: 1,
    })
    expect(root.getApi().moveActiveCell('down', { extend: true })).toBe(true)
    expect(root.getApi().getSelection()?.ranges[0]).toMatchObject({
      unit: 'cell',
      startRowIndex: 0,
      endRowIndex: 1,
      startColumnId: 'status',
      endColumnId: 'status',
    })

    root.eventHandlers.mousedown?.(new MouseEvent('mousedown', { clientX: 210, clientY: 52 }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))
    expect(onKeyboardAction).toHaveBeenCalledWith(expect.objectContaining({ type: 'move', direction: 'right' }))
    expect(onActiveCellChange).toHaveBeenCalled()

    const keyboardActions = onKeyboardAction.mock.calls.length
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))
    expect(onKeyboardAction).toHaveBeenCalledTimes(keyboardActions)
    app.destroy()
  })

  it('reserves Tab movement when keyboard tab action is commit-edit', () => {
    const app = createApp()
    const root = mountRoot(app)
    const tabEvent = new KeyboardEvent('keydown', { key: 'Tab' })

    expect((root as any).resolveKeyboardDirection(tabEvent, {
      enabled: true,
      arrows: true,
      tab: 'commit-edit',
      enter: 'edit',
      pageKeys: true,
      homeEnd: true,
      shiftSelection: true,
      ctrlMetaShortcuts: true,
    })).toBeNull()
    expect((root as any).resolveKeyboardDirection(tabEvent, {
      enabled: true,
      arrows: true,
      tab: 'move',
      enter: 'edit',
      pageKeys: true,
      homeEnd: true,
      shiftSelection: true,
      ctrlMetaShortcuts: true,
    })).toBe('right')

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

  it('updates hover state flags for row-column mode and emits enter/leave', () => {
    const app = createApp()
    const cellTemplate = vi.fn(() => [])
    const onCellEnter = vi.fn()
    const onCellLeave = vi.fn()
    const surface = app.createSurface('datatable-hover-test')
    const uiRoot = app.schema.createNode(surface, {
      type: NovaUIKit.Root,
      props: { width: 640, height: 240 },
      children: [
        {
          type: NovaDataTableSchema.Root,
          props: {
            rows: rows(20),
            rowKey: 'id',
            rowHeight: 20,
            headerHeight: 30,
            interaction: { motion: false },
            columns: [
              { id: 'name', field: 'name', width: 160, pinned: 'left', cellTemplate },
              { id: 'status', field: 'status', width: 120, cellTemplate },
              { id: 'amount', field: 'amount', width: 120, pinned: 'right', cellTemplate },
            ],
            onCellEnter,
            onCellLeave,
          },
          layout: { width: '100%', height: '100%' },
        },
      ],
    })
    app.raph.run()
    app.raph.run()
    const root = uiRoot.children[0] as DataTableRootNode<Row>

    root.eventHandlers.mousemove?.(new MouseEvent('mousemove', { clientX: 210, clientY: 56 }))
    app.raph.run()

    expect(root.getApi().getInteraction().hover?.rowId).toBe('row-1')
    expect(root.getApi().getInteraction().hover?.column.id).toBe('status')
    expect(onCellEnter).toHaveBeenCalledTimes(1)
    const statusContext = [...cellTemplate.mock.calls].reverse().find(call => call[0].column.id === 'status' && call[0].rowId === 'row-1')?.[0]
    const nameContext = [...cellTemplate.mock.calls].reverse().find(call => call[0].column.id === 'name' && call[0].rowId === 'row-1')?.[0]
    expect(statusContext.state.hovered).toBe(true)
    expect(statusContext.state.cellHovered).toBe(true)
    expect(statusContext.state.rowHovered).toBe(true)
    expect(statusContext.state.columnHovered).toBe(true)
    expect(statusContext.state.hoverAlpha).toBe(1)
    expect(nameContext.state.rowHovered).toBe(true)
    expect(nameContext.state.columnHovered).toBe(false)

    root.eventHandlers.mouseleave?.(new MouseEvent('mouseleave'))
    expect(onCellLeave).toHaveBeenCalledTimes(1)
    expect(root.getApi().getInteraction().hover).toBeNull()

    app.destroy()
  })

  it('keeps hover target synchronized with vertical and horizontal scroll', () => {
    const app = createApp()
    const root = mountRoot(app)
    root.setProps({
      interaction: { motion: false },
      columns: [
        { id: 'name', title: 'Name', field: 'name', width: 180, pinned: 'left', resizable: true },
        { id: 'status', title: 'Status', field: 'status', width: 120 },
        { id: 'amount', title: 'Amount', field: 'amount', width: 120 },
        { id: 'extraA', title: 'Extra A', field: 'name', width: 160 },
        { id: 'extraB', title: 'Extra B', field: 'status', width: 160 },
        { id: 'actions', title: 'Actions', field: 'name', width: 120, pinned: 'right' },
      ],
    } as never)
    app.raph.run()

    root.eventHandlers.mousemove?.(new MouseEvent('mousemove', { clientX: 220, clientY: 122 }))
    app.raph.run()

    expect(root.getApi().getInteraction().hover?.rowId).toBe('row-1')
    expect(root.getApi().getInteraction().hover?.rect).toMatchObject({
      x: 180,
      y: 112,
      width: 120,
      height: 36,
    })

    root.getApi().scrollTo(40, 72)
    app.raph.run()

    expect(root.getApi().getInteraction().hover?.rowId).toBe('row-3')
    expect(root.getApi().getInteraction().hover?.column.id).toBe('status')
    expect(root.getApi().getInteraction().hover?.rect).toMatchObject({
      x: 140,
      y: 112,
      width: 120,
      height: 36,
    })

    app.destroy()
  })

  it('does not schedule cell enter fade in sync scheduler mode', () => {
    const app = createApp()
    const root = mountRoot(app)
    const invalidate = vi.spyOn(app, 'invalidate')

    root.setProps({
      interaction: {
        motion: {
          cells: { enter: 'fade', duration: 120, stagger: 4, maxAnimatedCells: 120 },
        },
      },
    } as never)
    invalidate.mockClear()
    app.raph.run()

    expect(invalidate).not.toHaveBeenCalled()
    app.destroy()
  })

  it('acquires a temporary loop lease while animated columns are visible', async () => {
    const app = createApp()
    const release = vi.fn()
    const acquireLoop = vi.spyOn(app.raph, 'acquireLoop').mockReturnValue({ owner: 'test', release })
    const root = mountRoot(app)

    root.setProps({
      columns: [
        { id: 'name', title: 'Name', field: 'name', width: 180, pinned: 'left', resizable: true },
        { id: 'status', title: 'Status', field: 'status', width: 120, animated: true },
        { id: 'amount', title: 'Amount', field: 'amount', width: 120, pinned: 'right' },
      ],
    } as never)
    app.raph.run()
    await Promise.resolve()

    expect(acquireLoop).toHaveBeenCalledWith('nova-datatable:animated-cells')
    app.destroy()
    expect(release).toHaveBeenCalledTimes(1)
  })

  it('resizes columns only from header handles and does not hijack body cells', () => {
    const app = createApp()
    const onSelectionChange = vi.fn()
    const onColumnResize = vi.fn()
    const root = mountRoot(app)
    root.setProps({
      interaction: { motion: false },
      onSelectionChange,
      onColumnResize,
    } as never)

    root.eventHandlers.mousedown?.(new MouseEvent('mousedown', { clientX: 230, clientY: 122 }))
    expect(onSelectionChange).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'cell',
      rowId: 'row-1',
      columnId: 'status',
    }))
    expect(root.getApi().getInteraction().selection?.columnId).toBe('status')

    onSelectionChange.mockClear()
    root.eventHandlers.mousedown?.(new MouseEvent('mousedown', { clientX: 180, clientY: 122 }))
    root.eventHandlers.dragmove?.(
      new MouseEvent('mousemove', { clientX: 210, clientY: 122 }),
      30,
      0,
      {
        pointerId: 1,
        startX: 180,
        startY: 122,
        x: 210,
        y: 122,
        dx: 30,
        dy: 0,
        totalDx: 30,
        totalDy: 0,
      },
    )
    expect(onColumnResize).not.toHaveBeenCalled()
    expect(onSelectionChange).toHaveBeenCalled()

    onColumnResize.mockClear()
    root.eventHandlers.mousedown?.(new MouseEvent('mousedown', { clientX: 180, clientY: 12 }))
    root.eventHandlers.dragmove?.(
      new MouseEvent('mousemove', { clientX: 210, clientY: 12 }),
      30,
      0,
      {
        pointerId: 1,
        startX: 180,
        startY: 12,
        x: 210,
        y: 12,
        dx: 30,
        dy: 0,
        totalDx: 30,
        totalDy: 0,
      },
    )
    expect(onColumnResize).toHaveBeenCalledWith(expect.objectContaining({
      previousWidth: 180,
      width: 210,
      column: expect.objectContaining({ id: 'name' }),
    }))

    app.destroy()
  })

  it('supports shift ranges, ctrl toggles and drag range preview for cell selection', () => {
    const app = createApp()
    const root = mountRoot(app)
    root.setProps({
      interaction: { motion: false },
      selection: {
        mode: 'cell',
        cardinality: 'multiple',
        allowedUnits: { cells: true },
        gestures: { dragRange: true, shiftRange: true, ctrlToggle: true, metaToggle: true },
      },
    } as never)

    root.eventHandlers.mousedown?.(new MouseEvent('mousedown', { clientX: 220, clientY: 84 }))
    expect(root.getApi().getSelection()?.activeCell).toMatchObject({ rowId: 'row-0', columnId: 'status' })

    root.eventHandlers.mousedown?.(new MouseEvent('mousedown', { clientX: 220, clientY: 122, shiftKey: true }))
    expect(root.getApi().getSelection()?.ranges[0]).toMatchObject({
      unit: 'cell',
      startRowIndex: 0,
      endRowIndex: 1,
      columnIds: ['status'],
    })

    root.eventHandlers.mousedown?.(new MouseEvent('mousedown', { clientX: 60, clientY: 84, ctrlKey: true }))
    expect(root.getApi().getSelection()?.ranges.length).toBe(2)

    root.eventHandlers.mousedown?.(new MouseEvent('mousedown', { clientX: 220, clientY: 84 }))
    root.eventHandlers.dragmove?.(
      new MouseEvent('mousemove', { clientX: 220, clientY: 158 }),
      0,
      74,
      { pointerId: 1, startX: 220, startY: 84, x: 220, y: 158, dx: 0, dy: 74, totalDx: 0, totalDy: 74 },
    )
    expect(root.getApi().getSelection()?.previewRange).toMatchObject({ startRowIndex: 0, endRowIndex: 2 })
    root.eventHandlers.dragend?.(
      new MouseEvent('mouseup', { clientX: 220, clientY: 158 }),
      { pointerId: 1, startX: 220, startY: 84, x: 220, y: 158, dx: 0, dy: 0, totalDx: 0, totalDy: 74 },
    )
    expect(root.getApi().getSelection()?.previewRange).toBeNull()
    const ranges = root.getApi().getSelection()?.ranges ?? []
    expect(ranges[ranges.length - 1]).toMatchObject({ startRowIndex: 0, endRowIndex: 2 })

    app.destroy()
  })

  it('copies and pastes selected cells through typed column policies', async () => {
    const app = createApp()
    const root = mountRoot(app)
    root.setProps({
      columns: [
        { id: 'name', title: 'Name', field: 'name', width: 180, pinned: 'left', resizable: true, editable: true, type: 'text', paste: { enabled: true } },
        { id: 'status', title: 'Status', field: 'status', width: 120, editable: true, type: 'text', paste: { enabled: true } },
        { id: 'amount', title: 'Amount', field: 'amount', width: 120, pinned: 'right', editable: true, type: 'number', paste: { enabled: true } },
      ],
      selection: {
        mode: 'cell',
        cardinality: 'multiple',
        allowedUnits: { cells: true },
      },
      clipboard: {
        copy: { format: 'tsv', onlyVisibleColumns: true },
        paste: { enabled: true, invalid: 'reject' },
      },
    } as never)

    root.getApi().selectCell('row-0', 'name')
    expect(root.getApi().copySelection()).toBe('Row 0')

    await root.getApi().pasteClipboard('Renamed\t42')
    expect(root.store.getRow('row-0')?.name).toBe('Renamed')
    expect(root.store.getRow('row-0')?.status).toBe('42')

    root.getApi().selectCell('row-1', 'amount')
    const result = await root.getApi().pasteClipboard('not-a-number')
    expect(result.invalid[0]).toMatchObject({ rowId: 'row-1', columnId: 'amount' })
    expect(root.store.getRow('row-1')?.amount).toBe(10)

    app.destroy()
  })

  it('supports row and column selection without expanding selected cells', () => {
    const app = createApp()
    const root = mountRoot(app)
    root.setProps({
      selection: {
        mode: 'mixed',
        cardinality: 'multiple',
        allowedUnits: { cells: true, rows: true, columns: true },
      },
      clipboard: {
        copy: { format: 'tsv', onlyVisibleColumns: true },
        paste: false,
      },
    } as never)

    root.getApi().selectRow('row-0')
    expect(root.getApi().isRowSelected('row-0')).toBe(true)
    expect(root.getApi().copySelection()).toBe('Row 0\tactive\t0')

    root.getApi().selectColumn('amount', { append: true })
    expect(root.getApi().isColumnSelected('amount')).toBe(true)
    expect(root.getApi().getSelection()?.ranges).toHaveLength(2)

    app.destroy()
  })

  it('renders clipped row-column hover overlay without crossing pinned boundaries', () => {
    const app = createApp(620, 220)
    const root = mountRoot(app)
    root.setProps({
      interaction: { motion: false },
    } as never)
    if (canvasContextStub) canvasContextStub.__sets = []

    root.eventHandlers.mousemove?.(new MouseEvent('mousemove', { clientX: 220, clientY: 84 }))
    app.raph.run()

    const styleSets = canvasContextStub?.__sets as Array<[PropertyKey, unknown]>
    expect(root.getApi().getInteraction().hover?.rect).toMatchObject({
      x: 180,
      y: 76,
      width: 120,
      height: 36,
    })
    expect(styleSets).toContainEqual(['fillStyle', 'rgba(37, 99, 235, 0.08)'])
    expect(styleSets).toContainEqual(['fillStyle', 'rgba(14, 165, 233, 0.07)'])
    expect(styleSets).toContainEqual(['fillStyle', 'rgba(250, 204, 21, 0.16)'])

    app.destroy()
  })

  it('sorts from header clicks and maps rendered rows through the view pipeline', () => {
    const app = createApp()
    const cellTemplate = vi.fn(() => [])
    const headerTemplate = vi.fn(() => [])
    const onSortChange = vi.fn()
    const surface = app.createSurface('datatable-sort-test')
    const uiRoot = app.schema.createNode(surface, {
      type: NovaUIKit.Root,
      props: { width: 420, height: 180 },
      children: [
        {
          type: NovaDataTableSchema.Root,
          props: {
            rows: [
              { id: 'row-a', name: 'Zulu', status: 'draft', amount: 30 },
              { id: 'row-b', name: 'Alpha', status: 'active', amount: 10 },
              { id: 'row-c', name: 'Beta', status: 'active', amount: 20 },
            ],
            rowKey: 'id',
            rowHeight: 20,
            headerHeight: 30,
            view: { sorting: { mode: 'client' } },
            columns: [
              { id: 'name', field: 'name', width: 160, sortable: true, cellTemplate, headerTemplate },
              { id: 'amount', field: 'amount', width: 120 },
            ],
            onSortChange,
          },
          layout: { width: '100%', height: '100%' },
        },
      ],
    })
    app.raph.run()
    app.raph.run()
    const root = uiRoot.children[0] as DataTableRootNode<Row>

    root.eventHandlers.mousedown?.(new MouseEvent('mousedown', { clientX: 40, clientY: 12 }))
    app.raph.run()

    expect(onSortChange).toHaveBeenCalledWith([{ columnId: 'name', direction: 'asc', priority: 0 }])
    expect(root.getApi().getViewState().sort).toEqual([{ columnId: 'name', direction: 'asc', priority: 0 }])
    const firstNameContext = [...cellTemplate.mock.calls].reverse().find(call => call[0].column.id === 'name' && call[0].rowIndex === 0)?.[0]
    expect(firstNameContext.rowId).toBe('row-b')
    expect(firstNameContext.storeIndex).toBe(1)
    const sortedHeaderContext = [...headerTemplate.mock.calls].reverse().find(call => call[0].column.id === 'name')?.[0]
    expect(sortedHeaderContext.state.sorted).toBe('asc')
    expect(sortedHeaderContext.state.sortPriority).toBe(0)

    app.destroy()
  })

  it('renders group rows and toggles them from pointer input', () => {
    const app = createApp()
    const groupRowTemplate = vi.fn(() => [])
    const onGroupingChange = vi.fn()
    const onGroupToggle = vi.fn()
    const surface = app.createSurface('datatable-group-test')
    const uiRoot = app.schema.createNode(surface, {
      type: NovaUIKit.Root,
      props: { width: 520, height: 220 },
      children: [
        {
          type: NovaDataTableSchema.Root,
          props: {
            rows: rows(6),
            rowKey: 'id',
            rowHeight: 20,
            headerHeight: 30,
            columns: [
              { id: 'name', field: 'name', width: 160 },
              { id: 'status', field: 'status', width: 120 },
            ],
            view: {
              grouping: {
                enabled: true,
                mode: 'client',
                groups: [{ id: 'status', field: 'status', title: 'Status' }],
                expanded: 'all',
                showGroupRows: true,
              },
            },
            groupRowTemplate,
            onGroupingChange,
            onGroupToggle,
          },
          layout: { width: '100%', height: '100%' },
        },
      ],
    })
    app.raph.run()
    app.raph.run()
    const root = uiRoot.children[0] as DataTableRootNode<Row>

    expect(groupRowTemplate).toHaveBeenCalled()
    expect(root.getApi().getViewState().grouping.expandedGroups).toContain('status:active')

    root.eventHandlers.mousedown?.(new MouseEvent('mousedown', { clientX: 40, clientY: 36 }))
    app.raph.run()

    expect(onGroupToggle).toHaveBeenCalledWith(expect.objectContaining({ groupId: 'status:active' }))
    expect(onGroupingChange).toHaveBeenCalled()
    expect(root.getApi().getViewState().grouping.expandedGroups).not.toContain('status:active')

    app.destroy()
  })

  it('treats grouped rows as full-row interaction targets', () => {
    const app = createApp()
    const surface = app.createSurface('datatable-group-hover-test')
    const uiRoot = app.schema.createNode(surface, {
      type: NovaUIKit.Root,
      props: { width: 520, height: 220 },
      children: [
        {
          type: NovaDataTableSchema.Root,
          props: {
            rows: rows(6),
            rowKey: 'id',
            rowHeight: 20,
            headerHeight: 30,
            interaction: { motion: false },
            columns: [
              { id: 'name', field: 'name', width: 160 },
              { id: 'status', field: 'status', width: 120 },
            ],
            view: {
              grouping: {
                enabled: true,
                mode: 'client',
                groups: [{ id: 'status', field: 'status', title: 'Status' }],
                expanded: 'none',
                showGroupRows: true,
              },
            },
          },
          layout: { width: '100%', height: '100%' },
        },
      ],
    })
    app.raph.run()
    app.raph.run()
    const root = uiRoot.children[0] as DataTableRootNode<Row>
    if (canvasContextStub) canvasContextStub.__sets = []

    root.eventHandlers.mousemove?.(new MouseEvent('mousemove', { clientX: 210, clientY: 36 }))
    app.raph.run()

    const hover = root.getApi().getInteraction().hover
    expect(hover?.zone).toBe('group')
    expect(hover?.rowId).toBe('status:active')
    expect(hover?.rect).toMatchObject({
      x: 0,
      y: 30,
      width: 520,
      height: 20,
    })
    const styleSets = canvasContextStub?.__sets as Array<[PropertyKey, unknown]>
    expect(styleSets).toContainEqual(['fillStyle', 'rgba(37, 99, 235, 0.08)'])
    expect(styleSets).not.toContainEqual(['fillStyle', 'rgba(14, 165, 233, 0.07)'])
    expect(styleSets).not.toContainEqual(['fillStyle', 'rgba(250, 204, 21, 0.16)'])

    root.eventHandlers.mousedown?.(new MouseEvent('mousedown', { clientX: 210, clientY: 36 }))
    expect(root.getApi().getInteraction().selection).toBeNull()

    app.destroy()
  })

  it('filters rows and reorders columns through the public API', () => {
    const app = createApp()
    const root = mountRoot(app)
    const onFilterChange = vi.fn()
    const onColumnOrderChange = vi.fn()
    root.setProps({
      view: {
        filtering: { mode: 'client' },
        columnOrdering: { enabled: true },
      },
      onFilterChange,
      onColumnOrderChange,
    } as never)

    root.getApi().setFilter('status', { operator: 'equals', value: 'active' })
    expect(onFilterChange).toHaveBeenCalledWith([{ columnId: 'status', operator: 'equals', value: 'active' }])
    expect(root.getApi().getViewState().rowCount).toBe(50)

    root.getApi().reorderColumns({ columnId: 'amount', fromIndex: 2, toIndex: 0 })
    expect(onColumnOrderChange).toHaveBeenCalledWith(expect.objectContaining({
      columnId: 'amount',
      order: ['amount', 'name', 'status'],
    }))
    expect(root.getApi().getViewState().columnOrder).toEqual(['amount', 'name', 'status'])

    root.getApi().setColumnOrder(['status', 'amount'])
    expect(onColumnOrderChange).toHaveBeenCalledWith(expect.objectContaining({
      reason: 'api',
      order: ['status', 'amount', 'name'],
    }))
    expect(root.getApi().getViewState().columnOrder).toEqual(['status', 'amount', 'name'])

    root.getApi().resetColumnOrder()
    expect(onColumnOrderChange).toHaveBeenCalledWith(expect.objectContaining({
      reason: 'reset',
      order: [],
    }))
    expect(root.getApi().getViewState().columnOrder).toEqual([])

    app.destroy()
  })

  it('drag-reorders columns from the header when column ordering is enabled', () => {
    const app = createApp()
    const root = mountRoot(app)
    const onColumnOrderChange = vi.fn()
    root.setProps({
      columns: [
        { id: 'name', title: 'Name', field: 'name', width: 100, sortable: true },
        { id: 'status', title: 'Status', field: 'status', width: 100, sortable: true },
        { id: 'amount', title: 'Amount', field: 'amount', width: 100, sortable: true },
        { id: 'extra', title: 'Extra', field: 'name', width: 100, sortable: true },
      ],
      view: {
        sorting: { mode: 'client' },
        columnOrdering: { enabled: true },
      },
      onColumnOrderChange,
    } as never)

    root.eventHandlers.mousedown?.(new MouseEvent('mousedown', { clientX: 150, clientY: 12 }))
    root.eventHandlers.dragmove?.(
      new MouseEvent('mousemove', { clientX: 800, clientY: 12 }),
      650,
      0,
      {
        pointerId: 1,
        startX: 150,
        startY: 12,
        x: 800,
        y: 12,
        dx: 650,
        dy: 0,
        totalDx: 650,
        totalDy: 0,
      },
    )
    expect(onColumnOrderChange).not.toHaveBeenCalled()
    expect(root.getApi().getViewState().columnOrder).toEqual([])

    root.eventHandlers.dragend?.(
      new MouseEvent('mouseup', { clientX: 800, clientY: 12 }),
      {
        pointerId: 1,
        startX: 150,
        startY: 12,
        x: 800,
        y: 12,
        dx: 0,
        dy: 0,
        totalDx: 650,
        totalDy: 0,
      },
    )

    expect(onColumnOrderChange).toHaveBeenCalledWith(expect.objectContaining({
      columnId: 'status',
      reason: 'drag',
      order: ['name', 'amount', 'extra', 'status'],
    }))
    expect(root.getApi().getViewState().columnOrder).toEqual(['name', 'amount', 'extra', 'status'])

    app.destroy()
  })

  it('coalesces public delta batches before the next render turn', async () => {
    const app = createApp()
    const root = mountRoot(app)
    const revision = root.store.takeRevision()

    root.getApi().applyDeltas([
      { type: 'setCell', rowId: 'row-1', columnId: 'amount', value: 900 },
      { type: 'patch', rowId: 'row-1', patch: { status: 'active' } },
    ])

    expect(root.store.getRow('row-1')?.amount).toBe(10)
    await Promise.resolve()

    expect(root.store.getRow('row-1')).toMatchObject({
      amount: 900,
      status: 'active',
    })
    expect(root.store.takeRevision()).toBe(revision + 1)

    app.destroy()
  })

  it('clips header and pinned rows by horizontal column regions', () => {
    const app = createApp(620, 220)
    const surface = app.createSurface('datatable-horizontal-clip-test')
    const uiRoot = app.schema.createNode(surface, {
      type: NovaUIKit.Root,
      props: { width: 620, height: 220 },
      children: [
        {
          type: NovaDataTableSchema.Root,
          props: {
            rows: rows(80),
            rowKey: 'id',
            rowHeight: 20,
            headerHeight: 30,
            overscanColumns: 1,
            columns: [
              { id: 'name', field: 'name', width: 160, pinned: 'left' },
              ...Array.from({ length: 20 }, (_item, index) => ({
                id: `metric-${index}`,
                width: 100,
              })),
              { id: 'amount', field: 'amount', width: 120, pinned: 'right' },
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
    const root = uiRoot.children[0] as DataTableRootNode<Row>
    const rectSpy = canvasContextStub?.rect
    rectSpy?.mockClear()

    root.getApi().scrollTo(750, 120)
    app.raph.run()

    const rectCalls = rectSpy?.mock.calls ?? []
    expect(rectCalls).toContainEqual([160, 0, 340, 30])
    expect(rectCalls).toContainEqual([0, 0, 160, 30])
    expect(rectCalls).toContainEqual([500, 0, 120, 30])
    expect(rectCalls).toContainEqual([160, 30, 340, 20])
    expect(rectCalls).toContainEqual([160, 50, 340, 150])
    expect(rectCalls).toContainEqual([500, 200, 120, 20])

    app.destroy()
  })
})
