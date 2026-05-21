import { bench, describe } from 'vitest'
import { createDataTableStore } from '@/model/module/DataTableStore'
import { buildDataTableAccessibilityLiveMessage } from '@/model/runtime/DataTableAccessibility'
import {
  createDataTableColumnChooserState,
  createDataTableColumnGroupLayout,
  reduceDataTableColumnChooserState,
  type DataTableColumnGroup,
} from '@/model/runtime/DataTableColumnSystem'
import {
  createDataTableFilterMenuState,
  reduceDataTableFilterMenuAction,
  resolveDataTableSetFilterValues,
} from '@/model/runtime/DataTableFilterMenu'
import type { DataTableColumnInput, DataTableResolvedColumn } from '@/model/types/datatable.types'

interface EnterpriseBenchRow {
  id: string
  status: string
  region: string
  metric: number
}

function rows(count: number): Array<EnterpriseBenchRow> {
  return Array.from({ length: count }, (_item, index) => ({
    id: `row-${index}`,
    status: index % 5 === 0 ? 'hold' : index % 2 === 0 ? 'active' : 'draft',
    region: `region-${index % 64}`,
    metric: index,
  }))
}

function columns(count: number): Array<DataTableResolvedColumn<EnterpriseBenchRow>> {
  return Array.from({ length: count }, (_item, index) => ({
    id: `c-${index}`,
    title: `Column ${index}`,
    field: index % 3 === 0 ? 'status' : index % 3 === 1 ? 'region' : 'metric',
    width: 120,
    minWidth: 48,
    maxWidth: 640,
    resolvedWidth: 120,
    pinned: index < 2 ? 'left' : index > count - 3 ? 'right' : undefined,
    resizable: true,
    align: 'left',
  }))
}

function groupedColumns(groupCount: number, columnsPerGroup: number): Array<DataTableColumnGroup<EnterpriseBenchRow>> {
  return Array.from({ length: groupCount }, (_item, groupIndex) => ({
    id: `g-${groupIndex}`,
    title: `Group ${groupIndex}`,
    children: [
      {
        id: `g-${groupIndex}-a`,
        title: `A ${groupIndex}`,
        children: Array.from({ length: columnsPerGroup / 2 }, (_child, index) => `c-${groupIndex * columnsPerGroup + index}`),
      },
      {
        id: `g-${groupIndex}-b`,
        title: `B ${groupIndex}`,
        children: Array.from({ length: columnsPerGroup / 2 }, (_child, index) => `c-${groupIndex * columnsPerGroup + columnsPerGroup / 2 + index}`),
      },
    ],
  }))
}

describe('NovaDataTable enterprise column filter a11y benchmarks', () => {
  bench('set-filter values from 200k sparse store rows', () => {
    const store = createDataTableStore<EnterpriseBenchRow>({ rowKey: 'id', rows: rows(200_000) })
    const column: DataTableColumnInput<EnterpriseBenchRow> = {
      id: 'region',
      field: 'region',
      filter: { type: 'set' },
    }

    resolveDataTableSetFilterValues({
      column,
      store,
      selected: ['region-1', 'region-2'],
      sort: 'count-desc',
    })
  }, { iterations: 2 })

  bench('filter menu reducer 10k set toggles', () => {
    const values = Array.from({ length: 256 }, (_item, index) => ({
      key: `string:value-${index}`,
      value: `value-${index}`,
      label: `value-${index}`,
      count: index + 1,
      selected: false,
      empty: false,
    }))
    let state = reduceDataTableFilterMenuAction(createDataTableFilterMenuState(), {
      type: 'open',
      columnId: 'status',
      filter: { type: 'set' },
      values,
    })

    for (let index = 0; index < 10_000; index += 1) {
      state = reduceDataTableFilterMenuAction(state, {
        type: 'toggle-value',
        value: `value-${index % values.length}`,
      })
    }
    reduceDataTableFilterMenuAction(state, { type: 'apply' })
  }, { iterations: 5 })

  bench('nested column group layout for 1k columns', () => {
    createDataTableColumnGroupLayout({
      columns: columns(1_000),
      groups: groupedColumns(100, 10),
      hidden: Array.from({ length: 100 }, (_item, index) => `c-${index * 7}`),
      pinned: {
        left: ['c-0', 'c-1'],
        right: ['c-998', 'c-999'],
      },
    })
  }, { iterations: 10 })

  bench('column chooser group toggle over 1k columns', () => {
    const state = createDataTableColumnChooserState({
      columns: columns(1_000),
      groups: groupedColumns(100, 10),
      hidden: [],
    })

    reduceDataTableColumnChooserState(state, {
      type: 'toggle-group',
      groupId: 'g-50',
      hidden: true,
    })
  }, { iterations: 20 })

  bench('10k accessibility live message builds', () => {
    const cols = columns(64)
    for (let index = 0; index < 10_000; index += 1) {
      if (index % 2 === 0) {
        buildDataTableAccessibilityLiveMessage({
          type: 'sort',
          sort: [{ columnId: `c-${index % cols.length}`, direction: 'asc' }],
        }, {
          columns: cols,
          now: index,
        })
      } else {
        buildDataTableAccessibilityLiveMessage({
          type: 'viewport',
          viewport: {
            rowRange: { start: index, end: index + 40 },
            centerColumnRange: { start: 0, end: 10 },
          },
        }, {
          columns: cols,
          now: index,
        })
      }
    }
  }, { iterations: 10 })
})
