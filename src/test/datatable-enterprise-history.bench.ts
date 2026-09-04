import type { DataTableDelta, DataTableTransaction } from '@/model/types/datatable.types'
import { bench, describe } from 'vitest'
import { createDataTableStore } from '@/model/module/DataTableStore'
import { DataTableCommitController } from '@/model/runtime/DataTableCommitController'
import { createDataTableFillMatrix, parseDataTableClipboardMatrix } from '@/model/runtime/DataTableFillMatrix'
import { createInverseDataTableDeltas, DataTableTransactionHistory, normalizeDataTableHistory } from '@/model/runtime/DataTableTransactionHistory'

interface HistoryBenchRow {
  id: string
  name: string
  amount: number
}

const BENCH_DELTAS: Array<DataTableDelta<HistoryBenchRow>> = Array.from({ length: 10_000 }, (_item, index) => ({
  type: 'setCell',
  rowId: `row-${index}`,
  columnId: 'amount',
  value: index * 2,
}))
const BENCH_TSV = Array.from({ length: 1_000 }, (_item, rowIndex) => (
  Array.from({ length: 10 }, (_cell, columnIndex) => `${rowIndex}:${columnIndex}`).join('\t')
)).join('\n')

function rows(count: number): Array<HistoryBenchRow> {
  return Array.from({ length: count }, (_item, index) => ({
    id: `row-${index}`,
    name: `Row ${index}`,
    amount: index,
  }))
}

describe('бенчмарки истории NovaDataTable Enterprise', () => {
  bench('build inverse for 10k setCell deltas', () => {
    const store = createDataTableStore<HistoryBenchRow>({ rowKey: 'id', rows: rows(20_000) })
    createInverseDataTableDeltas(store, BENCH_DELTAS)
  }, { iterations: 5 })

  bench('undo/redo playback for 10k deltas', () => {
    const store = createDataTableStore<HistoryBenchRow>({ rowKey: 'id', rows: rows(20_000) })
    const history = new DataTableTransactionHistory(store, normalizeDataTableHistory({ enabled: true }))
    history.commit(BENCH_DELTAS, { source: 'edit' })
    history.undo()
    history.redo()
  }, { iterations: 5 })

  bench('create optimistic commit plan for 10k deltas', () => {
    const transaction: DataTableTransaction<HistoryBenchRow> = {
      id: 'bench-commit',
      source: 'edit',
      timestamp: 1,
      status: 'pending',
      deltas: BENCH_DELTAS,
      inverseDeltas: BENCH_DELTAS,
    }
    new DataTableCommitController<HistoryBenchRow>().createPlan({ transaction })
  }, { iterations: 10 })

  bench('generate 100k fill cells from numeric seed', () => {
    createDataTableFillMatrix({
      source: [[1, 2], [3, 4]],
      rowCount: 10_000,
      columnCount: 10,
    })
  }, { iterations: 5 })

  bench('parse 10k TSV clipboard cells', () => {
    parseDataTableClipboardMatrix(BENCH_TSV, 'tsv')
  }, { iterations: 5 })
})
