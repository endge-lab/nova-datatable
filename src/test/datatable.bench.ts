import { bench, describe } from 'vitest'
import { createDataTableStore } from '@/model/module/DataTableStore'
import { autosizeDataTableColumn, resolveDataTableColumns } from '@/model/runtime/datatable-columns'
import { createDataTableViewport } from '@/model/runtime/datatable-layout'

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
