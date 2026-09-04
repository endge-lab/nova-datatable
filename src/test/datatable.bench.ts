import type { DataTableQueryState, DataTableSelectionRange } from '@/model/types/datatable.types'
import { bench, describe } from 'vitest'
import { createDataTableStore } from '@/model/module/DataTableStore'
import { autosizeDataTableColumn, resolveDataTableColumns } from '@/model/runtime/datatable-columns'
import { createDataTableViewport } from '@/model/runtime/datatable-layout'
import { DataTableServerRowModel } from '@/model/runtime/DataTableServerRowModel'
import { DataTableSummaryEngine } from '@/model/runtime/DataTableSummaryEngine'
import { DataTableViewPipeline } from '@/model/runtime/DataTableViewPipeline'
import { normalizeDataTablePerformance, normalizeDataTableView } from '@/ui/root/datatable-root.config'

interface BenchRow {
  id: string
  name: string
  status: string
  amount: number
}

function rows(count: number, start = 0): Array<BenchRow> {
  return Array.from({ length: count }, (_item, index) => {
    const id = start + index
    return {
      id: `row-${id}`,
      name: `Customer ${id}`,
      status: id % 3 === 0 ? 'active' : 'draft',
      amount: id,
    }
  })
}

describe('бенчмарки NovaDataTable', () => {
  bench('10M lazy store initialization', () => {
    const store = createDataTableStore<BenchRow>({
      rowKey: 'id',
      source: {
        rowCount: 10_000_000,
        getRow: index => ({
          id: `row-${index}`,
          name: `Customer ${index}`,
          status: index % 3 === 0 ? 'active' : 'draft',
          amount: index,
        }),
      },
    })
    store.getRowAt(9_999_999)
  }, { iterations: 20 })

  bench('1M row store indexing', () => {
    const store = createDataTableStore<BenchRow>({ rowKey: 'id', rows: rows(1_000_000) })
    store.getRow('row-999999')
    store.getRowAt(500_000)
  }, { iterations: 3 })

  bench('10k patches in one batch', () => {
    const store = createDataTableStore<BenchRow>({ rowKey: 'id', rows: rows(20_000) })
    store.batch((api) => {
      for (let index = 0; index < 10_000; index += 1) {
        api.patch(`row-${index}`, { status: 'active' })
      }
    })
  }, { iterations: 8 })

  bench('10k edit commits through setCell path', () => {
    const store = createDataTableStore<BenchRow>({ rowKey: 'id', rows: rows(20_000) })
    store.batch((api) => {
      for (let index = 0; index < 10_000; index += 1) {
        api.setCell(`row-${index}`, 'name', `Edited ${index}`)
      }
    })
  }, { iterations: 8 })

  bench('100k cell patches in one delta batch', () => {
    const store = createDataTableStore<BenchRow>({ rowKey: 'id', rows: rows(120_000) })
    store.applyDeltaBatch(Array.from({ length: 100_000 }, (_item, index) => ({
      type: 'setCell' as const,
      rowId: `row-${index}`,
      columnId: 'amount',
      value: index * 2,
    })))
  }, { iterations: 2 })

  bench('1M coalesced cell patches over 10k loaded rows', () => {
    const store = createDataTableStore<BenchRow>({ rowKey: 'id', rows: rows(10_000) })
    store.applyDeltaBatch(Array.from({ length: 1_000_000 }, (_item, index) => ({
      type: 'setCell' as const,
      rowId: `row-${index % 10_000}`,
      columnId: 'amount',
      value: index,
    })))
  }, { iterations: 1 })

  bench('100k structural insert/remove/move workload', () => {
    const store = createDataTableStore<BenchRow>({ rowKey: 'id', rows: rows(100_000) })
    store.insertMany(rows(1_000, 200_000), 50_000)
    for (let index = 0; index < 100; index += 1) {
      store.move(`row-${index}`, 90_000 - index)
    }
    store.removeMany(Array.from({ length: 1_000 }, (_item, index) => `row-${index + 1_000}`))
  }, { iterations: 1 })

  bench('visible range calculation for huge logical grid', () => {
    const store = createDataTableStore<BenchRow>({ rowKey: 'id', rows: rows(1_000) })
    const columns = resolveDataTableColumns<BenchRow>(
      Array.from({ length: 1_000 }, (_item, index) => ({
        id: `c-${index}`,
        field: 'name',
        width: 120,
        pinned: index < 2 ? 'left' as const : index > 997 ? 'right' as const : undefined,
      })),
      { left: ['c-0', 'c-1'], right: ['c-998', 'c-999'] },
      new Map(),
      store,
    )

    createDataTableViewport({
      width: 1440,
      height: 800,
      rowHeight: 32,
      headerHeight: 40,
      overscanRows: 16,
      overscanColumns: 4,
      rowCount: 10_000_000,
      columns,
      pinnedTopCount: 2,
      pinnedBottomCount: 2,
      scrollX: 24_000,
      scrollY: 1_200_000,
    })
  })

  bench('server/lazy query update on 10M rows', () => {
    const store = createDataTableStore<BenchRow>({
      rowKey: 'id',
      source: {
        rowCount: 10_000_000,
        getRow: index => rows(1, index)[0],
      },
    })
    const pipeline = new DataTableViewPipeline(store)
    const columns = resolveDataTableColumns<BenchRow>([
      { id: 'status', field: 'status', filter: 'set' },
      { id: 'amount', field: 'amount', sortable: true },
    ], {}, new Map(), store)

    pipeline.sync({
      columns,
      performance: normalizeDataTablePerformance({ maxClientRows: 100_000 }),
      view: normalizeDataTableView({
        sorting: { mode: 'server' },
        filtering: { mode: 'server' },
        grouping: {
          enabled: true,
          mode: 'server',
          groups: [{ id: 'status', field: 'status' }],
        },
      }),
    })
    pipeline.setSort({ columnId: 'amount', direction: 'desc' })
    pipeline.setFilter('status', { operator: 'equals', value: 'active' })
    pipeline.getQuery()
  })

  bench('10M server row model range summary and search contract', async () => {
    const store = createDataTableStore<BenchRow>({
      rowKey: 'id',
      source: {
        rowCount: 10_000_000,
        loadRange: range => rows(range.end - range.start, range.start),
        loadSummary: () => ({ count: 10_000_000, amount: 500_000 }),
        search: () => ({
          matches: [{ rowId: 'row-500000', rowIndex: 500_000, columnId: 'name', value: 'Customer 500000', ranges: [{ start: 0, end: 8 }] }],
          total: 1,
        }),
        resolveRowIndex: rowId => Number(String(rowId).replace('row-', '')),
      },
    })
    const query: DataTableQueryState = {
      sort: [{ columnId: 'amount', direction: 'desc' }],
      filters: [{ columnId: 'status', operator: 'equals', value: 'active' }],
      search: { text: 'Customer 500000', scope: 'cells', columns: ['name'] },
      rowOrder: [],
      columnOrder: [],
    }
    const model = new DataTableServerRowModel(store, delta => store.applyDeltaBatch(delta))

    model.sync(query, { subscribe: false })
    await model.ensureRange({ start: 500_000, end: 500_120 })
    await model.loadSummary()
    await model.search({ text: 'Customer 500000', scope: 'cells', columns: ['name'] })
    await model.resolveRowIndex('row-500000')
    model.snapshot()
  }, { iterations: 20 })

  bench('server search next previous cursor navigation', async () => {
    const store = createDataTableStore<BenchRow>({
      rowKey: 'id',
      source: {
        rowCount: 10_000_000,
        search: (_search, _query, cursor, direction = 'next') => {
          const base = Number(cursor ?? (direction === 'previous' ? 500_000 : 0))
          const start = direction === 'previous' ? Math.max(0, base - 80) : base
          const matches = Array.from({ length: 80 }, (_item, index) => {
            const rowIndex = start + index
            return {
              rowId: `row-${rowIndex}`,
              rowIndex,
              columnId: 'name',
              value: `Customer ${rowIndex}`,
              ranges: [{ start: 0, end: 8 }],
            }
          })
          return {
            matches,
            total: 10_000,
            cursor: String(start + 80),
            previousCursor: start > 0 ? String(start - 1) : undefined,
            hasMore: true,
          }
        },
        resolveRowIndex: rowId => Number(String(rowId).replace('row-', '')),
      },
    })
    const model = new DataTableServerRowModel(store, delta => store.applyDeltaBatch(delta))
    model.sync({ sort: [], filters: [], rowOrder: [], columnOrder: [] }, { subscribe: false })
    await model.search({ text: 'Customer', scope: 'cells', columns: ['name'] })
    await model.search({ text: 'Customer', scope: 'cells', columns: ['name'] }, '80', 'next')
    await model.search({ text: 'Customer', scope: 'cells', columns: ['name'] }, '79', 'previous')
    await model.resolveRowIndex('row-500000')
  }, { iterations: 20 })

  bench('100k client multi-sort', () => {
    const store = createDataTableStore<BenchRow>({ rowKey: 'id', rows: rows(100_000) })
    const pipeline = new DataTableViewPipeline(store)
    pipeline.sync({
      columns: resolveDataTableColumns<BenchRow>([
        { id: 'status', field: 'status', sortable: true },
        { id: 'amount', field: 'amount', sortable: true },
        { id: 'name', field: 'name', sortable: true },
      ], {}, new Map(), store),
      performance: normalizeDataTablePerformance({ maxClientRows: 100_000 }),
      view: normalizeDataTableView({
        sorting: { mode: 'client', multi: true, headerClick: 'append' },
        filtering: false,
        search: false,
        grouping: false,
      }),
    })
    pipeline.setSort([
      { columnId: 'status', direction: 'asc' },
      { columnId: 'amount', direction: 'desc' },
      { columnId: 'name', direction: 'asc' },
    ])
    pipeline.getViewRowAt(0)
  }, { iterations: 3 })

  bench('100k client filter expression', () => {
    const store = createDataTableStore<BenchRow>({ rowKey: 'id', rows: rows(100_000) })
    const pipeline = new DataTableViewPipeline(store)
    pipeline.sync({
      columns: resolveDataTableColumns<BenchRow>([
        { id: 'status', field: 'status', filter: 'set' },
        { id: 'amount', field: 'amount', filter: 'number' },
      ], {}, new Map(), store),
      performance: normalizeDataTablePerformance({ maxClientRows: 100_000 }),
      view: normalizeDataTableView({
        sorting: false,
        filtering: { mode: 'client' },
        search: false,
        grouping: false,
      }),
    })
    pipeline.setFilters({
      logic: 'and',
      rules: [
        { columnId: 'status', operator: 'equals', value: 'active' },
        { columnId: 'amount', operator: 'gte', value: 50_000 },
      ],
    })
    pipeline.getViewRows()
  }, { iterations: 3 })

  bench('100k client OR filter expression', () => {
    const store = createDataTableStore<BenchRow>({ rowKey: 'id', rows: rows(100_000) })
    const pipeline = new DataTableViewPipeline(store)
    pipeline.sync({
      columns: resolveDataTableColumns<BenchRow>([
        { id: 'status', field: 'status', filter: 'set' },
        { id: 'amount', field: 'amount', filter: 'number' },
        { id: 'name', field: 'name', filter: 'text' },
      ], {}, new Map(), store),
      performance: normalizeDataTablePerformance({ maxClientRows: 100_000 }),
      view: normalizeDataTableView({
        sorting: false,
        filtering: { mode: 'client' },
        search: false,
        grouping: false,
      }),
    })
    pipeline.setFilters({
      logic: 'or',
      rules: [
        { columnId: 'status', operator: 'equals', value: 'active' },
        { columnId: 'amount', operator: 'gte', value: 90_000 },
        { columnId: 'name', operator: 'contains', value: '777' },
      ],
    })
    pipeline.setFilter('amount', { operator: 'lt', value: 10_000 })
    pipeline.getViewRows()
  }, { iterations: 3 })

  bench('100k client cell search', () => {
    const store = createDataTableStore<BenchRow>({ rowKey: 'id', rows: rows(100_000) })
    const pipeline = new DataTableViewPipeline(store)
    pipeline.sync({
      columns: resolveDataTableColumns<BenchRow>([
        { id: 'name', field: 'name' },
        { id: 'status', field: 'status' },
      ], {}, new Map(), store),
      performance: normalizeDataTablePerformance({ maxClientRows: 100_000 }),
      view: normalizeDataTableView({
        sorting: false,
        filtering: false,
        search: { mode: 'client', scope: 'cells', columns: ['name'] },
        grouping: false,
      }),
    })
    pipeline.setSearch({ text: 'Customer 99', scope: 'cells', columns: ['name'], match: 'contains' })
    pipeline.findNext()
  }, { iterations: 3 })

  bench('10M lazy search query stays sparse', () => {
    const store = createDataTableStore<BenchRow>({
      rowKey: 'id',
      source: {
        rowCount: 10_000_000,
        getRow: index => rows(1, index)[0],
      },
    })
    const pipeline = new DataTableViewPipeline(store)
    pipeline.sync({
      columns: resolveDataTableColumns<BenchRow>([{ id: 'name', field: 'name' }], {}, new Map(), store),
      performance: normalizeDataTablePerformance({ maxClientRows: 100_000 }),
      view: normalizeDataTableView({
        sorting: false,
        filtering: false,
        search: { mode: 'client', scope: 'cells', columns: ['name'] },
        grouping: false,
      }),
    })
    pipeline.setSearch('Customer')
    pipeline.getQuery()
  }, { iterations: 20 })

  bench('grouped summary update after 10k deltas', () => {
    const engine = new DataTableSummaryEngine<BenchRow>()
    const source = rows(50_000)
    engine.compute(source, [
      { id: 'count', aggregate: 'count' },
      { id: 'amountSum', field: 'amount', aggregate: 'sum' },
      { id: 'amountAvg', field: 'amount', aggregate: 'avg' },
      { id: 'amountMin', field: 'amount', aggregate: 'min' },
      { id: 'amountMax', field: 'amount', aggregate: 'max' },
    ])
    for (let index = 0; index < 10_000; index += 1) {
      const previous = source[index]!
      const next = { ...previous, amount: previous.amount + 100 }
      source[index] = next
      engine.applyRowChange(previous, next, index)
    }
    engine.snapshot()
  }, { iterations: 4 })

  bench('auto-width sampling', () => {
    const store = createDataTableStore<BenchRow>({ rowKey: 'id', rows: rows(20_000) })
    autosizeDataTableColumn({
      id: 'name',
      title: 'Customer',
      field: 'name',
      width: { mode: 'auto', min: 120, max: 320, sampleSize: 500 },
    }, store)
  })

  bench('render-plan column resolution for huge grid', () => {
    const store = createDataTableStore<BenchRow>({ rowKey: 'id', rows: rows(1_000) })
    resolveDataTableColumns<BenchRow>(
      Array.from({ length: 2_000 }, (_item, index) => ({
        id: `column-${index}`,
        title: `Column ${index}`,
        field: 'name',
        width: index % 10 === 0
          ? { mode: 'auto' as const, min: 80, max: 220, sampleSize: 50 }
          : 120,
      })),
      {},
      new Map(),
      store,
    )
  })

  bench('100x50 visible render plan generation', () => {
    const visibleRows = rows(100)
    const visibleColumns = Array.from({ length: 50 }, (_item, index) => ({
      id: `column-${index}`,
      field: index % 3 === 0 ? 'name' : index % 3 === 1 ? 'status' : 'amount',
      x: index * 96,
      width: 96,
    }))
    const plan: Array<{ key: string, x: number, y: number, width: number, text: string }> = []
    for (let rowIndex = 0; rowIndex < visibleRows.length; rowIndex += 1) {
      const row = visibleRows[rowIndex]!
      const y = 40 + rowIndex * 32
      for (const column of visibleColumns) {
        plan.push({
          key: `${row.id}:${column.id}`,
          x: column.x,
          y,
          width: column.width,
          text: String(row[column.field as keyof BenchRow] ?? ''),
        })
      }
    }
    if (plan.length !== 5_000) {
      throw new Error('Render plan did not cover 100x50 cells')
    }
  })

  bench('column drag layout preview over 1k columns', () => {
    const columns = Array.from({ length: 1_000 }, (_item, index) => ({
      id: `column-${index}`,
      width: 80 + (index % 5) * 8,
    }))
    let insertionIndex = 0
    let cursorX = 24_000
    for (let frame = 0; frame < 120; frame += 1) {
      cursorX += 17
      let x = 0
      for (let index = 0; index < columns.length; index += 1) {
        const width = columns[index]!.width
        if (cursorX < x + width / 2) {
          insertionIndex = index
          break
        }
        x += width
      }
    }
    if (insertionIndex < 0) {
      throw new Error('Invalid column insertion index')
    }
  })

  bench('selection overlay intersections for 1M logical selected rows', () => {
    const range: DataTableSelectionRange = {
      id: 'range-1',
      unit: 'row',
      startRowIndex: 0,
      endRowIndex: 999_999,
      columnIds: ['name', 'status', 'amount'],
    }
    const viewport = { start: 50_000, end: 50_140 }
    let visible = 0
    for (let rowIndex = viewport.start; rowIndex < viewport.end; rowIndex += 1) {
      if (rowIndex >= (range.startRowIndex ?? 0) && rowIndex <= (range.endRowIndex ?? 0)) {
        visible += 1
      }
    }
    if (visible === 0) {
      throw new Error('Selection range was not visible')
    }
  })

  bench('10k paste cells parse and delta generation', () => {
    const source = Array.from({ length: 10_000 }, (_item, index) => `${index}\tactive`)
    const deltas = source.flatMap((line, index) => {
      const [amount, status] = line.split('\t')
      return [
        { type: 'setCell' as const, rowId: `row-${index}`, columnId: 'amount', value: Number(amount) },
        { type: 'setCell' as const, rowId: `row-${index}`, columnId: 'status', value: status },
      ]
    })
    if (deltas.length !== 20_000) {
      throw new Error('Invalid paste delta count')
    }
  })

  bench('state persistence serialize restore for 1k columns', () => {
    const state = {
      version: 1 as const,
      savedAt: Date.now(),
      columnState: {
        widths: Object.fromEntries(Array.from({ length: 1_000 }, (_item, index) => [`column-${index}`, 80 + index % 120])),
        order: Array.from({ length: 1_000 }, (_item, index) => `column-${999 - index}`),
        hidden: Array.from({ length: 100 }, (_item, index) => `column-${index * 3}`),
        pinned: {
          left: ['column-0', 'column-1'],
          right: ['column-998', 'column-999'],
        },
      },
      sort: [
        { columnId: 'column-20', direction: 'asc' as const },
        { columnId: 'column-40', direction: 'desc' as const },
      ],
      filters: {
        logic: 'and' as const,
        rules: [
          { columnId: 'column-2', operator: 'contains', value: 'active' },
          { columnId: 'column-4', operator: 'gte', value: 100 },
        ],
      },
      search: { text: 'Customer', scope: 'cells' as const, columns: ['column-10', 'column-11'] },
      grouping: {
        enabled: true,
        groups: [{ id: 'status', field: 'status' }],
        expanded: 'all' as const,
      },
    }
    const encoded = JSON.stringify(state)
    const restored = JSON.parse(encoded) as typeof state
    if (restored.columnState.order.length !== 1_000) {
      throw new Error('Invalid restored column order')
    }
  })
})
