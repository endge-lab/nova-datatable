import type { DataTableStore } from '@/model/module/DataTableStore'
import type { DataTableDelta, DataTableTransaction } from '@/model/types/datatable.types'
import { describe, expect, it } from 'vitest'
import { createDataTableStore } from '@/model/module/DataTableStore'
import { createDataTableCommitPlan, DataTableCommitController } from '@/model/runtime/DataTableCommitController'
import {
  createInverseDataTableDeltas,
  DataTableTransactionHistory,
  normalizeDataTableHistory,
} from '@/model/runtime/DataTableTransactionHistory'

interface HistoryRow {
  id: string
  name: string
  status: string
  amount: number
}

function rows(count: number, start = 0): Array<HistoryRow> {
  return Array.from({ length: count }, (_item, index) => {
    const id = start + index
    return {
      id: `row-${id}`,
      name: `Row ${id}`,
      status: id % 2 === 0 ? 'ready' : 'hold',
      amount: id * 10,
    }
  })
}

function cloneRows(value: Array<HistoryRow>): Array<HistoryRow> {
  return value.map(row => ({ ...row }))
}

function createHistory(store: DataTableStore<HistoryRow>): DataTableTransactionHistory<HistoryRow> {
  return new DataTableTransactionHistory(store, normalizeDataTableHistory({ enabled: true, maxEntries: 10 }))
}

describe('история транзакций DataTable Enterprise', () => {
  it('записывает транзакции ячеек и воспроизводит обратные delta undo/redo', () => {
    const store = createDataTableStore<HistoryRow>({ rowKey: 'id', rows: rows(4) })
    const history = createHistory(store)
    const deltas: Array<DataTableDelta<HistoryRow>> = [
      { type: 'setCell', rowId: 'row-1', columnId: 'amount', value: 999 },
      { type: 'patch', rowId: 'row-1', patch: { name: 'Edited', status: 'done' } },
    ]

    const transaction = history.commit(deltas, { source: 'edit', label: 'edit row' })

    expect(transaction).toMatchObject({
      id: 'dt-tx-1',
      label: 'edit row',
      source: 'edit',
      status: 'committed',
      deltas,
      inverseDeltas: [
        { type: 'patch', rowId: 'row-1', patch: { name: 'Row 1', status: 'hold' } },
        { type: 'setCell', rowId: 'row-1', columnId: 'amount', value: 10 },
      ],
    })
    expect(store.getRow('row-1')).toMatchObject({ name: 'Edited', status: 'done', amount: 999 })
    expect(history.state()).toMatchObject({ canUndo: true, canRedo: false, undoDepth: 1, redoDepth: 0 })

    expect(history.undo()).toBe(true)
    expect(store.getRow('row-1')).toMatchObject({ name: 'Row 1', status: 'hold', amount: 10 })
    expect(history.state()).toMatchObject({ canUndo: false, canRedo: true, undoDepth: 0, redoDepth: 1 })

    expect(history.redo()).toBe(true)
    expect(store.getRow('row-1')).toMatchObject({ name: 'Edited', status: 'done', amount: 999 })
  })

  it('инвертирует структурные delta insert/remove/move/replaceRange как одну транзакцию', () => {
    const store = createDataTableStore<HistoryRow>({ rowKey: 'id', rows: rows(5) })
    const before = cloneRows(store.getRows())
    const deltas: Array<DataTableDelta<HistoryRow>> = [
      { type: 'insert', index: 1, rows: [{ id: 'row-x', name: 'Inserted', status: 'new', amount: 1000 }] },
      { type: 'move', rowId: 'row-0', toIndex: 3 },
      { type: 'replaceRange', start: 2, rows: [{ id: 'row-r', name: 'Range', status: 'done', amount: 777 }] },
      { type: 'remove', rowIds: ['row-4'] },
    ]

    const inverse = createInverseDataTableDeltas(store, deltas)

    store.applyDeltaBatch(deltas)
    expect(store.getRows().map(row => row.id)).toEqual(['row-x', 'row-1', 'row-r', 'row-0', 'row-3'])

    store.applyDeltaBatch(inverse)
    expect(store.getRows()).toEqual(before)
  })
})

describe('контроллер фиксации DataTable Enterprise', () => {
  it('планирует оптимистическую и транзакционную стратегии фиксации без применения side effects', () => {
    const transaction: DataTableTransaction<HistoryRow> = {
      id: 'tx-commit',
      source: 'edit',
      timestamp: 1,
      status: 'pending',
      deltas: [{ type: 'setCell', rowId: 'row-1', columnId: 'amount', value: 42 }],
      inverseDeltas: [{ type: 'setCell', rowId: 'row-1', columnId: 'amount', value: 10 }],
    }
    const controller = new DataTableCommitController<HistoryRow>({ strategy: 'optimistic' })

    const optimistic = controller.createPlan({ transaction })

    expect(optimistic.strategy).toBe('optimistic')
    expect(controller.getDeltas(optimistic, 'beforeCommit')).toEqual(transaction.deltas)
    expect(controller.getDeltas(optimistic, 'afterCommit')).toEqual([])
    expect(controller.getDeltas(optimistic, 'afterError')).toEqual(transaction.inverseDeltas)
    expect(optimistic.effects.map(effect => `${effect.phase}:${effect.type}`)).toEqual([
      'beforeCommit:apply',
      'afterError:rollback',
    ])

    const transactional = createDataTableCommitPlan<HistoryRow>({
      transaction,
      strategy: 'transaction',
    })

    expect(transactional.strategy).toBe('transaction')
    expect(controller.getDeltas(transactional, 'beforeCommit')).toEqual([])
    expect(controller.getDeltas(transactional, 'afterCommit')).toEqual(transaction.deltas)
    expect(controller.getDeltas(transactional, 'afterError')).toEqual([])
    expect(transactional.effects.map(effect => `${effect.phase}:${effect.type}`)).toEqual([
      'afterCommit:apply',
    ])
  })
})
