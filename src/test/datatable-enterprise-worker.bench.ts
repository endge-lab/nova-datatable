import type { DataTableQueryState } from '@/model/types/datatable.types'
import { bench, describe } from 'vitest'
import { createDataTableWorkerIndexPipeline } from '@/model/runtime/DataTableWorkerIndexPipeline'

interface BenchRow {
  id: string
  name: string
  status: 'active' | 'draft' | 'blocked'
  region: string
  amount: number
}

function rows(count: number): Array<BenchRow> {
  return Array.from({ length: count }, (_item, index) => ({
    id: `row-${index}`,
    name: `Customer ${index}`,
    status: index % 7 === 0 ? 'blocked' : index % 3 === 0 ? 'active' : 'draft',
    region: index % 2 === 0 ? 'north' : 'south',
    amount: index % 100_000,
  }))
}

const source = rows(100_000)
const columns = [
  { id: 'name', field: 'name' as const, searchable: true },
  { id: 'status', field: 'status' as const, filterable: true },
  { id: 'region', field: 'region' as const, filterable: true },
  { id: 'amount', field: 'amount' as const, sortable: true },
]
const query: DataTableQueryState = {
  sort: [{ columnId: 'amount', direction: 'desc' }],
  filters: {
    logic: 'and',
    rules: [
      { columnId: 'status', operator: 'equals', value: 'active' },
      { columnId: 'region', operator: 'equals', value: 'north' },
      { columnId: 'amount', operator: 'gte', value: 25_000 },
    ],
  },
  search: { text: 'Customer 9', scope: 'cells', columns: ['name'], filter: false },
  rowOrder: [],
  columnOrder: [],
}

describe('бенчмарки worker/index NovaDataTable Enterprise', () => {
  bench('build 100k worker index', () => {
    createDataTableWorkerIndexPipeline({
      rows: source,
      columns,
      getRowId: row => row.id,
    })
  }, { iterations: 5 })

  bench('query 100k worker index with filter sort search and paging', () => {
    const pipeline = createDataTableWorkerIndexPipeline({
      rows: source,
      columns,
      getRowId: row => row.id,
    })

    const result = pipeline.query(query, { offset: 100, limit: 120 })
    if (result.rowIds.length !== 120) {
      throw new Error('Worker query did not return requested page')
    }
  }, { iterations: 10 })

  bench('dispatch repeated worker index query without materializing rows', async () => {
    const pipeline = createDataTableWorkerIndexPipeline({
      rows: source,
      columns,
      getRowId: row => row.id,
    })

    const result = await pipeline.dispatch(query, { limit: 64 })
    if (result.metrics.materializedRows !== 0) {
      throw new Error('Worker query materialized rows unexpectedly')
    }
  }, { iterations: 10 })
})
