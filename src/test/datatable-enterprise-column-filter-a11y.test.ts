import type { DataTableColumnGroup } from '@/model/runtime/DataTableColumnSystem'
import type {
  DataTableColumnInput,
  DataTableFilterExpression,
  DataTableResolvedColumn,
  DataTableSearchState,
  DataTableSelectionState,
} from '@/model/types/datatable.types'
import { describe, expect, it } from 'vitest'
import { createDataTableStore } from '@/model/module/DataTableStore'
import {
  buildDataTableAccessibilityLiveMessage,
  buildDataTableAccessibilityState,
  createDataTableCellAriaId,
} from '@/model/runtime/DataTableAccessibility'
import {
  createDataTableColumnChooserState,
  createDataTableColumnGroupLayout,

  reduceDataTableColumnChooserState,
} from '@/model/runtime/DataTableColumnSystem'
import {
  createDataTableFilterMenuState,
  reduceDataTableFilterMenuAction,
  resolveDataTableSetFilterValues,
} from '@/model/runtime/DataTableFilterMenu'

interface EnterpriseGridRow {
  id: string
  flight: string
  status: 'active' | 'draft' | 'hold'
  region: string | null
  departure: string
  arrival: string
  delay: number
}

function rows(): Array<EnterpriseGridRow> {
  return [
    { id: 'row-0', flight: 'NVA-100', status: 'active', region: 'EU', departure: '08:00', arrival: '10:00', delay: 0 },
    { id: 'row-1', flight: 'NVA-101', status: 'draft', region: 'US', departure: '09:00', arrival: '11:00', delay: 12 },
    { id: 'row-2', flight: 'NVA-102', status: 'active', region: 'EU', departure: '10:00', arrival: '12:00', delay: 3 },
    { id: 'row-3', flight: 'NVA-103', status: 'hold', region: null, departure: '11:00', arrival: '13:00', delay: 24 },
    { id: 'row-4', flight: 'NVA-104', status: 'active', region: 'APAC', departure: '12:00', arrival: '14:00', delay: 0 },
  ]
}

function columns(): Array<DataTableColumnInput<EnterpriseGridRow>> {
  return [
    { id: 'flight', title: 'Flight', field: 'flight', width: 160, pinned: 'left', filter: 'text' },
    { id: 'status', title: 'Status', field: 'status', width: 120, filter: { type: 'set' } },
    { id: 'region', title: 'Region', field: 'region', width: 120, filter: { type: 'set' } },
    { id: 'departure', title: 'Departure', field: 'departure', width: 130 },
    { id: 'arrival', title: 'Arrival', field: 'arrival', width: 130 },
    { id: 'delay', title: 'Delay', field: 'delay', width: 100, filter: 'number' },
  ]
}

function resolvedColumns(): Array<DataTableResolvedColumn<EnterpriseGridRow>> {
  return columns().map(column => ({
    ...column,
    width: column.width ?? 120,
    minWidth: 48,
    maxWidth: 640,
    resolvedWidth: typeof column.width === 'number' ? column.width : 120,
    resizable: true,
    align: 'left',
  }))
}

function groups(): Array<DataTableColumnGroup<EnterpriseGridRow>> {
  return [
    {
      id: 'flight-group',
      title: 'Flight',
      children: ['flight', 'status', 'region'],
    },
    {
      id: 'schedule-group',
      title: 'Schedule',
      children: [
        {
          id: 'time-group',
          title: 'Times',
          children: ['departure', 'arrival'],
        },
        'delay',
      ],
    },
  ]
}

describe('проверка Helpers меню фильтра DataTable Enterprise', () => {
  it('строит значения set-filter из строк Store и сохраняет флаги выбора стабильными', () => {
    const store = createDataTableStore<EnterpriseGridRow>({ rowKey: 'id', rows: rows() })
    const [statusColumn] = columns().filter(column => column.id === 'status')

    const values = resolveDataTableSetFilterValues({
      column: statusColumn!,
      store,
      selected: ['active'],
      sort: 'count-desc',
    })

    expect(values).toMatchObject([
      { value: 'active', count: 3, selected: true },
      { value: 'draft', count: 1, selected: false },
      { value: 'hold', count: 1, selected: false },
    ])
  })

  it('поддерживает поиск и явные пустые значения для set filters', () => {
    const [regionColumn] = columns().filter(column => column.id === 'region')

    const values = resolveDataTableSetFilterValues({
      column: regionColumn!,
      rows: rows(),
      includeEmpty: true,
      search: 'empty',
      selected: [null],
    })

    expect(values).toEqual([
      expect.objectContaining({
        label: '(empty)',
        count: 1,
        selected: true,
        empty: true,
      }),
    ])
  })

  it('сводит Actions open, toggle, apply и clear без изменения предыдущего состояния', () => {
    const values = resolveDataTableSetFilterValues({
      column: columns()[1]!,
      rows: rows(),
      selected: ['active'],
    })
    const initial = createDataTableFilterMenuState()
    const opened = reduceDataTableFilterMenuAction(initial, {
      type: 'open',
      columnId: 'status',
      filter: { type: 'set' },
      currentRule: { columnId: 'status', operator: 'in', value: ['active'] },
      values,
    })
    const toggled = reduceDataTableFilterMenuAction(opened, { type: 'toggle-value', value: 'draft' })
    const applied = reduceDataTableFilterMenuAction(toggled, { type: 'apply' })
    const cleared = reduceDataTableFilterMenuAction(applied, { type: 'clear' })

    expect(initial.open).toBe(false)
    expect(opened).toMatchObject({
      open: true,
      columnId: 'status',
      operator: 'in',
      dirty: false,
      valid: true,
    })
    expect(toggled.draftRule).toEqual({
      columnId: 'status',
      operator: 'in',
      value: ['active', 'draft'],
    })
    expect(toggled.values.filter(value => value.selected).map(value => value.value)).toEqual(['active', 'draft'])
    expect(applied.open).toBe(false)
    expect(applied.appliedRule).toEqual(toggled.draftRule)
    expect(cleared.appliedRule).toBeNull()
    expect(cleared.valid).toBe(false)
  })

  it('нормализует скалярные значения и between при изменении оператора', () => {
    const opened = reduceDataTableFilterMenuAction(createDataTableFilterMenuState(), {
      type: 'open',
      columnId: 'delay',
      filter: 'number',
      currentRule: { columnId: 'delay', operator: 'equals', value: 12 },
    })
    const between = reduceDataTableFilterMenuAction(opened, { type: 'set-operator', operator: 'between' })
    const greaterThan = reduceDataTableFilterMenuAction(between, { type: 'set-operator', operator: 'gt' })

    expect(between.value).toEqual([12, 12])
    expect(between.valid).toBe(true)
    expect(greaterThan.value).toBe(12)
  })
})

describe('проверка Helpers системы столбцов DataTable Enterprise', () => {
  it('создаёт вложенный layout заголовка с colspan, rowspan, скрытыми столбцами и закреплёнными областями', () => {
    const layout = createDataTableColumnGroupLayout({
      columns: resolvedColumns(),
      groups: groups(),
      hidden: ['arrival'],
      pinned: { left: ['flight'], right: ['delay'] },
      order: ['flight', 'status', 'region', 'departure', 'arrival', 'delay'],
    })

    const flightGroup = layout.rows[0]!.find(cell => cell.id === 'flight-group')
    const scheduleGroup = layout.rows[0]!.find(cell => cell.id === 'schedule-group')
    const departure = layout.rows[2]!.find(cell => cell.columnId === 'departure')
    const status = layout.rows[1]!.find(cell => cell.columnId === 'status')

    expect(layout.maxDepth).toBe(2)
    expect(layout.visibleColumnIds).toEqual(['flight', 'status', 'region', 'departure', 'delay'])
    expect(layout.hiddenColumnIds).toEqual(['arrival'])
    expect(flightGroup).toMatchObject({ colSpan: 3, pinned: 'mixed' })
    expect(scheduleGroup).toMatchObject({ colSpan: 2, pinned: 'mixed' })
    expect(status).toMatchObject({ rowSpan: 2, startIndex: 1, endIndex: 2 })
    expect(departure).toMatchObject({ rowSpan: 1, startIndex: 3 })
  })

  it('строит состояние chooser и переключает вложенные группы как чистое состояние', () => {
    const chooser = createDataTableColumnChooserState({
      columns: resolvedColumns(),
      groups: groups(),
      hidden: ['arrival'],
      pinned: { left: ['flight'], right: ['delay'] },
    })
    const schedule = chooser.nodes.find(node => node.id === 'schedule-group')
    const shown = reduceDataTableColumnChooserState(chooser, {
      type: 'toggle-group',
      groupId: 'schedule-group',
      hidden: false,
    })
    const pinned = reduceDataTableColumnChooserState(shown, {
      type: 'pin-column',
      columnId: 'status',
      side: 'left',
    })

    expect(schedule).toMatchObject({
      kind: 'group',
      checked: false,
      indeterminate: true,
      leafCount: 3,
      visibleLeafCount: 2,
    })
    expect(shown.hidden).not.toContain('arrival')
    expect(shown.visibleColumnIds).toContain('arrival')
    expect(pinned.pinned.left).toEqual(['flight', 'status'])
    expect(pinned.layout.leaves.find(leaf => leaf.columnId === 'status')?.pinned).toBe('left')
  })
})

describe('проверка Helpers доступности DataTable Enterprise', () => {
  it('строит ARIA-состояние сетки с активным потомком и live-сообщением поиска', () => {
    const search: DataTableSearchState = {
      query: { text: 'NVA', scope: 'cells' },
      matches: [],
      activeIndex: 1,
      activeMatch: null,
      total: 5,
      mode: 'client',
      local: true,
      loading: false,
      hasMore: false,
    }
    const state = buildDataTableAccessibilityState({
      tableId: 'ops grid',
      label: 'Operations grid',
      rowCount: 1_000_000,
      columns: columns().map(column => ({ id: column.id, title: column.title })),
      hiddenColumnCount: 1,
      activeCell: { rowId: 'row-2', rowIndex: 2, columnId: 'delay', columnIndex: 5 },
      search,
      operation: { type: 'search', search },
      now: 100,
    })

    expect(state).toMatchObject({
      role: 'grid',
      label: 'Operations grid',
      ariaRowCount: 1_000_000,
      ariaColumnCount: 6,
      activeDescendant: 'ops-grid-cell-r2-delay',
      live: {
        id: 'datatable-live-100-search',
        reason: 'search',
        message: 'Search "NVA": 2 of 5',
      },
    })
    expect(state.summaries.focus).toBe('Focus row 3, column Delay')
    expect(state.summaries.columns).toBe('6 columns visible, 1 hidden')
  })

  it('форматирует live-сообщения фильтра, сортировки, фокуса, выбора и viewport', () => {
    const filterExpression: DataTableFilterExpression = {
      logic: 'and',
      rules: [
        { columnId: 'status', operator: 'in', value: ['active'] },
        {
          logic: 'or',
          rules: [
            { columnId: 'delay', operator: 'gt', value: 10 },
            { columnId: 'region', operator: 'equals', value: 'EU' },
          ],
        },
      ],
    }
    const selection: DataTableSelectionState = {
      mode: 'cell',
      activeCell: { rowId: 'row-1', rowIndex: 1, columnId: 'status', columnIndex: 1 },
      anchor: null,
      ranges: [],
      previewRange: null,
    }

    expect(buildDataTableAccessibilityLiveMessage({
      type: 'sort',
      sort: [{ columnId: 'delay', direction: 'desc' }],
    }, { columns: columns(), now: 10 }).message).toBe('Sorted by Delay descending')
    expect(buildDataTableAccessibilityLiveMessage({
      type: 'filter',
      filters: filterExpression,
    }, { now: 11 }).message).toBe('3 filters applied')
    expect(buildDataTableAccessibilityLiveMessage({
      type: 'selection',
      selection,
    }, { columns: columns(), now: 12 }).message).toBe('Focus row 2, column Status')
    expect(buildDataTableAccessibilityLiveMessage({
      type: 'viewport',
      viewport: {
        rowRange: { start: 100, end: 140 },
        centerColumnRange: { start: 2, end: 5 },
      },
    }, { now: 13 }).message).toBe('Rows 101-140, columns 3-5 visible')
    expect(createDataTableCellAriaId('Ops/Grid', 4, 'delay minutes')).toBe('Ops-Grid-cell-r4-delay-minutes')
  })
})
