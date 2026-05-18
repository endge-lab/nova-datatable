import { bench, describe } from 'vitest'
import { createDataTableStore } from '@/model/module/DataTableStore'
import { autosizeDataTableColumn, resolveDataTableColumns } from '@/model/runtime/datatable-columns'
import { createDataTableViewport } from '@/model/runtime/datatable-layout'
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

describe('NovaDataTable benchmarks', () => {
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
    store.batch(api => {
      for (let index = 0; index < 10_000; index += 1) {
        api.patch(`row-${index}`, { status: 'active' })
      }
    })
  }, { iterations: 8 })

  bench('10k edit commits through setCell path', () => {
    const store = createDataTableStore<BenchRow>({ rowKey: 'id', rows: rows(20_000) })
    store.batch(api => {
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
})
