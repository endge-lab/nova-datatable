import type {
  DataTableQueryState,
  DataTableViewRow,
} from '@/model/types/datatable.types'
import { describe, expect, it } from 'vitest'
import {
  DataTableDetailExpansionController,
  flattenDataTableDetailRows,
  isDataTableDetailRowExpanded,
} from '@/model/runtime/DataTableDetailRows'
import { DataTableServerHardening } from '@/model/runtime/DataTableServerHardening'
import {
  DataTableTreeExpansionController,
  flattenDataTableTreeRows,
  isDataTableTreeRowExpanded,
} from '@/model/runtime/DataTableTreeRows'
import { createDataTableWorkerIndexPipeline } from '@/model/runtime/DataTableWorkerIndexPipeline'

interface EnterpriseRow {
  id: string
  name: string
  status: 'active' | 'draft'
  amount: number
  children?: Array<EnterpriseRow>
}

function enterpriseTreeRows(): Array<EnterpriseRow> {
  return [
    {
      id: 'north',
      name: 'North',
      status: 'active',
      amount: 100,
      children: [
        {
          id: 'north-a',
          name: 'North A',
          status: 'active',
          amount: 60,
          children: [
            { id: 'north-a-1', name: 'North A 1', status: 'draft', amount: 20 },
          ],
        },
        { id: 'north-b', name: 'North B', status: 'draft', amount: 40 },
      ],
    },
    { id: 'south', name: 'South', status: 'draft', amount: 80 },
  ]
}

function flatRows(): Array<EnterpriseRow> {
  return [
    { id: 'row-a', name: 'Zulu', status: 'draft', amount: 30 },
    { id: 'row-b', name: 'Alpha', status: 'active', amount: 10 },
    { id: 'row-c', name: 'Beta', status: 'active', amount: 20 },
    { id: 'row-d', name: 'Alpha Ops', status: 'draft', amount: 40 },
  ]
}

function dataViewRows(rows: Array<EnterpriseRow>): Array<DataTableViewRow<EnterpriseRow>> {
  return rows.map((row, index) => ({
    kind: 'data',
    row,
    rowId: row.id,
    storeIndex: index,
    viewIndex: index,
    depth: 0,
  }))
}

function deferred<T>(): { promise: Promise<T>, resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((next) => {
    resolve = next
  })
  return { promise, resolve }
}

describe('проверка Helpers древовидной модели строк DataTable Enterprise', () => {
  it('разворачивает строки дерева с явным состоянием expand/collapse', () => {
    const controller = new DataTableTreeExpansionController(['north'])

    const first = flattenDataTableTreeRows({
      rows: enterpriseTreeRows(),
      expanded: controller.snapshot(),
      getRowId: row => row.id,
      getChildren: row => row.children,
      getChildCount: row => row.children?.length ?? 0,
    })

    expect(first.rows.map(row => row.rowId)).toEqual(['north', 'north-a', 'north-b', 'south'])
    expect(first.rowById.get('north')).toMatchObject({
      depth: 0,
      expandable: true,
      expanded: true,
      loadedChildCount: 2,
      visibleDescendantCount: 2,
    })
    expect(first.rowById.get('north-a')?.path).toEqual(['north', 'north-a'])

    controller.expand('north-a')
    const expanded = flattenDataTableTreeRows({
      rows: enterpriseTreeRows(),
      expanded: controller.snapshot(),
      getRowId: row => row.id,
      getChildren: row => row.children,
    })

    expect(expanded.rows.map(row => row.rowId)).toEqual(['north', 'north-a', 'north-a-1', 'north-b', 'south'])
    expect(isDataTableTreeRowExpanded(expanded.expanded, 'north-a')).toBe(true)

    controller.collapse('north')
    const collapsed = flattenDataTableTreeRows({
      rows: enterpriseTreeRows(),
      expanded: controller.snapshot(),
      getRowId: row => row.id,
      getChildren: row => row.children,
    })

    expect(collapsed.rows.map(row => row.rowId)).toEqual(['north', 'south'])
  })
})

describe('проверка Helpers строк детализации DataTable Enterprise', () => {
  it('вставляет строки детализации только после раскрытых строк данных', () => {
    const controller = new DataTableDetailExpansionController(['row-b', 'row-d'])
    const flattened = flattenDataTableDetailRows({
      rows: dataViewRows(flatRows()),
      expanded: controller.snapshot(),
      detailHeight: 144,
      canExpand: row => row.kind === 'data' && row.row?.status === 'active',
    })

    expect(flattened.rows.map(row => row.kind)).toEqual(['data', 'data', 'detail', 'data', 'data'])
    expect(flattened.detailRows).toHaveLength(1)
    expect(flattened.detailRows[0]).toMatchObject({
      rowId: 'row-b',
      parentViewIndex: 1,
      viewIndex: 2,
      height: 144,
      depth: 1,
    })
    expect(isDataTableDetailRowExpanded(flattened.expanded, 'row-b')).toBe(true)

    controller.toggle('row-b')
    const collapsed = flattenDataTableDetailRows({
      rows: dataViewRows(flatRows()),
      expanded: controller.snapshot(),
    })

    expect(collapsed.detailRows.map(row => row.rowId)).toEqual(['row-d'])
  })
})

describe('симулятор запросов worker/index DataTable Enterprise', () => {
  it('фильтрует, сортирует, ищет и разбивает индексированные строки на страницы', async () => {
    const pipeline = createDataTableWorkerIndexPipeline({
      rows: flatRows(),
      getRowId: row => row.id,
      columns: [
        { id: 'name', field: 'name', searchable: true },
        { id: 'status', field: 'status', filterable: true },
        { id: 'amount', field: 'amount', sortable: true },
      ],
    })
    const query: DataTableQueryState = {
      sort: [{ columnId: 'amount', direction: 'desc' }],
      filters: {
        logic: 'and',
        rules: [
          { columnId: 'status', operator: 'equals', value: 'active' },
          { columnId: 'amount', operator: 'gte', value: 10 },
        ],
      },
      search: { text: 'a', scope: 'cells', columns: ['name'], filter: false },
      rowOrder: ['row-b', 'row-c'],
      columnOrder: [],
    }

    const result = await pipeline.dispatch(query, { includeRows: true, limit: 1 })

    expect(result.rowIds).toEqual(['row-b'])
    expect(result.total).toBe(2)
    expect(result.rows?.[0]?.name).toBe('Alpha')
    expect(result.matches.map(match => match.rowId)).toEqual(['row-b', 'row-c'])
    expect(result.metrics).toMatchObject({
      inputRows: 4,
      scannedRows: 4,
      filteredRows: 2,
      sortedRows: 2,
      returnedRows: 1,
      materializedRows: 1,
      searchMatches: 2,
    })
  })
})

describe('защита серверного datasource DataTable Enterprise', () => {
  it('помечает более старые latest-only запросы устаревшими и записывает метрики', async () => {
    const hardening = new DataTableServerHardening({ delay: () => Promise.resolve() })
    const firstGate = deferred<string>()

    const first = hardening.runLatest('range', async () => firstGate.promise)
    const second = await hardening.runLatest('range', async () => 'fresh')
    firstGate.resolve('stale')

    await expect(first).resolves.toMatchObject({
      status: 'stale',
      attempts: 1,
    })
    expect(second).toMatchObject({
      status: 'success',
      value: 'fresh',
      attempts: 1,
      fromCache: false,
    })
    expect(hardening.metrics()).toMatchObject({
      started: 2,
      resolved: 1,
      stale: 1,
      aborted: 1,
      inFlight: 0,
    })
  })

  it('повторяет временные ошибки и обслуживает повторные запросы из cache', async () => {
    let attempts = 0
    let now = 1000
    const hardening = new DataTableServerHardening({
      now: () => now,
      delay: () => Promise.resolve(),
      retry: { retries: 2, delayMs: 0 },
      cache: { ttlMs: 1000, maxEntries: 2 },
    })

    const first = await hardening.runLatest('summary', async () => {
      attempts += 1
      if (attempts === 1) {
        throw new Error('temporary')
      }
      return { count: 42 }
    }, { cacheKey: 'summary:active' })

    expect(first).toMatchObject({
      status: 'success',
      value: { count: 42 },
      attempts: 2,
      fromCache: false,
    })
    expect(hardening.metrics()).toMatchObject({
      retried: 1,
      cacheMisses: 1,
      cacheSets: 1,
    })

    const cached = await hardening.runLatest('summary', async () => ({ count: 0 }), { cacheKey: 'summary:active' })

    expect(cached).toMatchObject({
      status: 'success',
      value: { count: 42 },
      attempts: 0,
      fromCache: true,
    })
    expect(hardening.metrics().cacheHits).toBe(1)

    now = 2501
    const refreshed = await hardening.runLatest('summary', async () => ({ count: 43 }), { cacheKey: 'summary:active' })

    expect(refreshed).toMatchObject({
      status: 'success',
      value: { count: 43 },
      attempts: 1,
      fromCache: false,
    })
    expect(hardening.metrics().cacheEvictions).toBeGreaterThanOrEqual(1)
  })

  it('инвалидирует tokens активных запросов при изменении серверной ревизии', () => {
    const hardening = new DataTableServerHardening()
    const token = hardening.begin('search')

    expect(hardening.isStale(token)).toBe(false)
    expect(hardening.bumpRevision()).toBe(1)
    expect(hardening.isStale(token)).toBe(true)
    expect(hardening.currentRevision).toBe(1)
  })
})
