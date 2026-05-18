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
import { DataTableViewPipeline } from '@/model/runtime/DataTableViewPipeline'
import { NovaDataTableSchema, type DataTableCellContext } from '@/model/types/datatable.types'
import { registerNovaDataTable } from '@/ui/root/datatable-root.registry'
import type { DataTableRootNode } from '@/ui/root/DataTableRootNode'
import { DataTableColumn, DataTableGrouping, DataTableInteractionLayer, Rect, Surface, TextBlock } from '@/vue/data-table-dsl'
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
    get(target, prop) {
      if (!(prop in target)) target[prop] = vi.fn()
      return target[prop]
    },
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

    expect(loadRange).toHaveBeenCalledWith({ start: 0, end: 5 }, query)
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
      view: {
        sorting: false,
        filtering: false,
        rowOrdering: false,
        columnOrdering: false,
        filterUi: false,
        grouping: false,
      },
    })

    expect(pipeline.rowCount).toBe(1_000_000)
    expect(getRow).not.toHaveBeenCalled()
    expect(pipeline.getViewRowAt(120)?.row?.id).toBe('row-120')
    expect(getRow).toHaveBeenCalledTimes(1)
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
      view: {
        sorting: { mode: 'client', multi: true, controlled: false, initial: [] },
        filtering: { mode: 'client', controlled: false, initial: [] },
        rowOrdering: { enabled: true, mode: 'view', manualLayer: true },
        columnOrdering: { enabled: true, allowCrossPinned: false, order: [] },
        filterUi: { headerMenu: false, filterRow: false },
      },
    })
  }

  function createGroupingView(expanded: 'all' | 'none') {
    return {
      sorting: { mode: 'client' as const, multi: true, controlled: false, initial: [] },
      filtering: { mode: 'client' as const, controlled: false, initial: [] },
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
    }
  }

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

  it('keeps server mode as identity view while preserving query state', () => {
    const store = createPipelineStore()
    const pipeline = new DataTableViewPipeline<Row>(store)
    const columns = resolveDataTableColumns<Row>([
      { id: 'amount', field: 'amount', sortable: true },
    ], {}, new Map(), store)

    pipeline.sync({
      columns,
      view: {
        sorting: { mode: 'server', multi: true, controlled: true, initial: [] },
        filtering: { mode: 'server', controlled: true, initial: [] },
        rowOrdering: false,
        columnOrdering: false,
        filterUi: false,
      },
    })
    pipeline.setSort({ columnId: 'amount', direction: 'desc' })

    expect(pipeline.getViewRows().map(row => row.rowId)).toEqual(['row-a', 'row-b', 'row-c'])
    expect(pipeline.getQuery().sort).toEqual([{ columnId: 'amount', direction: 'desc' }])
    expect(pipeline.isServerControlled()).toBe(true)
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

    pipeline.sync({ columns, view: createGroupingView('none') })
    expect(pipeline.getGroupingState().expandedGroups).toEqual([])
  })

  it('keeps server grouping as query state without local materialization', () => {
    const store = createPipelineStore()
    const pipeline = new DataTableViewPipeline<Row>(store)
    pipeline.sync({
      columns: resolveDataTableColumns<Row>([{ id: 'status', field: 'status' }], {}, new Map(), store),
      view: {
        sorting: false,
        filtering: false,
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
      },
    })

    expect(pipeline.getViewRows().map(row => row.kind)).toEqual(['data', 'data', 'data'])
    expect(pipeline.getQuery().grouping?.groups[0]?.id).toBe('status')
    expect(pipeline.isServerControlled()).toBe(true)
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
      h(DataTableColumn, { id: 'name', title: 'Name', field: 'name', resizable: true, sortable: true, filter: 'text', reorderable: true }, { cell: cellSlot }),
    ])

    expect(dsl.columns).toHaveLength(1)
    expect(dsl.columns[0].id).toBe('name')
    expect(dsl.columns[0].resizable).toBe(true)
    expect(dsl.columns[0].sortable).toBe(true)
    expect(dsl.columns[0].filter).toBe('text')
    expect(dsl.columns[0].reorderable).toBe(true)
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
        cellHovered: false,
        rowHovered: false,
        columnHovered: false,
        cellSelected: false,
        rowSelected: false,
        columnSelected: false,
        hoverAlpha: 0,
        selectionAlpha: 0,
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

  it('selects cells without hijacking resize handles', () => {
    const app = createApp()
    const onSelectionChange = vi.fn()
    const root = mountRoot(app)
    root.setProps({
      interaction: { motion: false },
      onSelectionChange,
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
    expect(onSelectionChange).not.toHaveBeenCalled()

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
              { id: 'name', field: 'name', width: 160, sortable: true, cellTemplate },
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

    expect(onSortChange).toHaveBeenCalledWith([{ columnId: 'name', direction: 'asc' }])
    expect(root.getApi().getViewState().sort).toEqual([{ columnId: 'name', direction: 'asc' }])
    const firstNameContext = [...cellTemplate.mock.calls].reverse().find(call => call[0].column.id === 'name' && call[0].rowIndex === 0)?.[0]
    expect(firstNameContext.rowId).toBe('row-b')
    expect(firstNameContext.storeIndex).toBe(1)

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
