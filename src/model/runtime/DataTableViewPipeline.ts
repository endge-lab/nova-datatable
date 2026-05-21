import { resolveDataTableValue } from '@/model/runtime/datatable-columns'
import type {
  DataTableAggregator,
  DataTableColumnInput,
  DataTableColumnReorderPayload,
  DataTableDataViewRow,
  DataTableFilterContext,
  DataTableFilterExpression,
  DataTableFilterOperator,
  DataTableFilterRule,
  DataTableFilterState,
  DataTableGroupContext,
  DataTableGroupingState,
  DataTableGroupNode,
  DataTableGroupRule,
  DataTableResolvedPerformanceOptions,
  DataTableQueryState,
  DataTableResolvedColumn,
  DataTableResolvedViewOptions,
  DataTableRowId,
  DataTableRowReorderPayload,
  DataTableSearchMatch,
  DataTableSearchQuery,
  DataTableSearchState,
  DataTableSortRule,
  DataTableSortState,
  DataTableStoreApi,
  DataTableViewMode,
  DataTableViewRow,
  DataTableViewState,
} from '@/model/types/datatable.types'

interface DataTableViewPipelineInput<Row extends Record<string, any>> {
  columns: Array<DataTableResolvedColumn<Row>>
  view: DataTableResolvedViewOptions
  performance: DataTableResolvedPerformanceOptions
}

/**
 * Строит текущий view поверх store: sort/filter/manual order/grouping/column order.
 */
export class DataTableViewPipeline<Row extends Record<string, any> = Record<string, any>> {
  private columns: Array<DataTableResolvedColumn<Row>> = []
  private view: DataTableResolvedViewOptions
  private initialized = false
  private sort: DataTableSortState = []
  private filters: DataTableFilterState | DataTableFilterExpression = []
  private search: DataTableSearchQuery = { text: '' }
  private searchMatches: Array<DataTableSearchMatch> = []
  private searchActiveIndex = -1
  private searchTotalOverride: number | undefined
  private searchLoading = false
  private searchCursor: string | undefined
  private searchPreviousCursor: string | undefined
  private searchHasMore = false
  private rowOrder: Array<DataTableRowId> = []
  private columnOrder: Array<string> = []
  private groupingExpanded: 'all' | 'none' | Array<string> = 'all'
  private rows: Array<DataTableViewRow<Row>> = []
  private groupNodes = new Map<string, DataTableGroupNode<Row>>()
  private groupingGroupsOverride: Array<DataTableGroupRule<Row>> | null = null
  private revision = -1
  private viewSignature = ''
  private maxClientRows = 100_000
  private expandedInputSignature = ''
  private passthrough = false
  private localSort = false
  private localFilter = false
  private localSearch = false
  private localGrouping = false

  /**
   * Создает экземпляр DataTableViewPipeline и подготавливает базовое состояние.
   */
  constructor(private readonly store: DataTableStoreApi<Row>) {
    this.view = {
      sorting: false,
      filtering: false,
      search: false,
      serverRowModel: false,
      rowOrdering: false,
      columnOrdering: false,
      filterUi: false,
      grouping: false,
      groupingPinnedRows: false,
    }
  }

  /**
   * Синхронизирует options и пересчитывает view при изменении store или state.
   */
  sync(input: DataTableViewPipelineInput<Row>): void {
    this.columns = input.columns
    this.view = input.view
    this.maxClientRows = input.performance.maxClientRows
    if (this.groupingGroupsOverride && this.view.grouping) {
      this.view = {
        ...this.view,
        grouping: {
          ...this.view.grouping,
          enabled: this.groupingGroupsOverride.length > 0,
          groups: [...this.groupingGroupsOverride],
        },
      }
    }
    const view = this.view
    if (!this.initialized) {
      this.sort = view.sorting ? [...view.sorting.initial] : []
      this.filters = view.filtering ? cloneFilters(view.filtering.initial) : []
      this.search = this.createSearchQuery('')
      this.columnOrder = view.columnOrdering ? [...view.columnOrdering.order] : []
      this.groupingExpanded = view.grouping ? cloneExpanded(view.grouping.expanded) : 'all'
      this.expandedInputSignature = view.grouping ? JSON.stringify(view.grouping.expanded) : ''
      this.initialized = true
    } else {
      if (view.columnOrdering && view.columnOrdering.order.length > 0 && this.columnOrder.length === 0) {
        this.columnOrder = [...view.columnOrdering.order]
      }
      const expandedInputSignature = view.grouping ? JSON.stringify(view.grouping.expanded) : ''
      if (expandedInputSignature !== this.expandedInputSignature) {
        this.groupingExpanded = view.grouping ? cloneExpanded(view.grouping.expanded) : 'all'
        this.expandedInputSignature = expandedInputSignature
      }
    }

    const revision = this.store.takeRevision()
    const viewSignature = createViewSignature(view, this.groupingExpanded)
    if (revision !== this.revision || viewSignature !== this.viewSignature) {
      this.revision = revision
      this.viewSignature = viewSignature
      this.rebuild()
    }
  }

  /**
   * Возвращает row Count для DataTableViewPipeline.
   */
  get rowCount(): number {
    return this.passthrough ? this.store.rowCount : this.rows.length
  }

  /**
   * Возвращает значение состояния DataTableViewPipeline.
   */
  getRowAt(viewIndex: number): Row | undefined {
    const row = this.rows[viewIndex]
    if (!row) return this.store.getRowAt(viewIndex)
    return row.kind === 'data' ? row.row : undefined
  }

  /**
   * Возвращает значение состояния DataTableViewPipeline.
   */
  getRowIdAt(viewIndex: number): DataTableRowId | undefined {
    return this.rows[viewIndex]?.rowId ?? this.store.getRowIdAt(viewIndex)
  }

  /**
   * Возвращает значение состояния DataTableViewPipeline.
   */
  getStoreIndexAt(viewIndex: number): number | undefined {
    return this.rows[viewIndex]?.storeIndex ?? viewIndex
  }

  /**
   * Возвращает значение состояния DataTableViewPipeline.
   */
  getViewRowAt(viewIndex: number): DataTableViewRow<Row> | undefined {
    if (this.passthrough) {
      if (viewIndex < 0 || viewIndex >= this.store.rowCount) return undefined
      const row = this.store.getRowAt(viewIndex)
      return {
        kind: 'data',
        row,
        rowId: this.store.getRowIdAt(viewIndex),
        storeIndex: viewIndex,
        viewIndex,
        depth: 0,
      }
    }
    return this.rows[viewIndex]
  }

  /**
   * Находит сущность по runtime-критериям DataTableViewPipeline.
   */
  findViewIndexByRowId(rowId: DataTableRowId): number | undefined {
    if (this.passthrough) return this.store.getRowIndex(rowId)
    return this.rows.find(row => row.kind === 'data' && row.rowId === rowId)?.viewIndex
  }

  /**
   * Возвращает значение состояния DataTableViewPipeline.
   */
  getViewRows(): Array<DataTableViewRow<Row>> {
    if (this.passthrough) {
      return Array.from({ length: this.store.rowCount }, (_item, viewIndex) => this.getViewRowAt(viewIndex)!)
    }
    return [...this.rows]
  }

  /**
   * Возвращает значение состояния DataTableViewPipeline.
   */
  getQuery(): DataTableQueryState {
    return {
      sort: [...this.sort],
      filters: cloneFilters(this.filters),
      search: this.search.text ? { ...this.search, columns: [...(this.search.columns ?? [])] } : undefined,
      rowOrder: [...this.rowOrder],
      columnOrder: [...this.columnOrder],
      grouping: this.view.grouping
        ? {
            enabled: this.view.grouping.enabled,
            groups: [...this.view.grouping.groups],
            expanded: cloneExpanded(this.groupingExpanded),
            footerPlacement: this.view.grouping.footerPlacement,
          }
        : undefined,
    }
  }

  /**
   * Возвращает значение состояния DataTableViewPipeline.
   */
  getState(): DataTableViewState {
    return {
      sort: [...this.sort],
      filters: cloneFilters(this.filters),
      search: this.getSearchState(),
      rowOrder: [...this.rowOrder],
      columnOrder: [...this.columnOrder],
      grouping: this.getGroupingState(),
      query: this.getQuery(),
      rowCount: this.rowCount,
      mode: {
        sorting: this.view.sorting ? this.view.sorting.mode : 'off',
        filtering: this.view.filtering ? this.view.filtering.mode : 'off',
        search: this.view.search ? this.view.search.mode : 'off',
        grouping: this.view.grouping ? this.view.grouping.mode : 'off',
      },
    }
  }

  /**
   * Возвращает значение состояния DataTableViewPipeline.
   */
  getGroupingState(): DataTableGroupingState<Row> {
    const expandedGroups = [...this.groupNodes.values()]
      .filter(group => group.expanded)
      .map(group => group.groupId)
    return {
      enabled: !!(this.view.grouping && this.view.grouping.enabled),
      mode: this.view.grouping ? this.view.grouping.mode : 'off',
      groups: this.view.grouping ? [...this.view.grouping.groups as Array<DataTableGroupRule<Row>>] : [],
      expanded: cloneExpanded(this.groupingExpanded),
      expandedGroups,
      footerPlacement: this.view.grouping ? this.view.grouping.footerPlacement : 'scroll',
    }
  }

  /**
   * Обновляет значение состояния DataTableViewPipeline.
   */
  setSort(sort: DataTableSortState | DataTableSortRule): void {
    this.sort = normalizeSort(Array.isArray(sort) ? sort : [sort])
    this.rebuild()
  }

  /**
   * Выполняет действие cycleSort в рамках ответственности DataTableViewPipeline.
   */
  cycleSort(columnId: string, additive: boolean): void {
    if (!this.view.sorting) return
    const current = this.sort.find(rule => rule.columnId === columnId)
    const nextDirection = current?.direction === 'asc'
      ? 'desc'
      : current?.direction === 'desc'
        ? undefined
        : 'asc'
    const shouldAppend = this.view.sorting.multi && (additive || this.view.sorting.headerClick === 'append')
    const base = shouldAppend ? this.sort.filter(rule => rule.columnId !== columnId) : []
    this.sort = normalizeSort(nextDirection ? [...base, { columnId, direction: nextDirection }] : base)
    this.rebuild()
  }

  /**
   * Очищает накопленное состояние DataTableViewPipeline.
   */
  clearSort(columnId?: string): void {
    this.sort = normalizeSort(columnId ? this.sort.filter(rule => rule.columnId !== columnId) : [])
    this.rebuild()
  }

  /**
   * Обновляет значение состояния DataTableViewPipeline.
   */
  setFilter(columnId: string, filter: Omit<DataTableFilterRule, 'columnId'> | DataTableFilterRule): void {
    const next = { ...filter, columnId } as DataTableFilterRule
    this.filters = setFilterRule(this.filters, columnId, next)
    this.rebuild()
  }

  /**
   * Обновляет значение состояния DataTableViewPipeline.
   */
  setFilters(filters: DataTableFilterState | DataTableFilterExpression): void {
    this.filters = cloneFilters(filters)
    this.rebuild()
  }

  /**
   * Очищает накопленное состояние DataTableViewPipeline.
   */
  clearFilter(columnId?: string): void {
    this.filters = columnId ? removeFilterRule(this.filters, columnId) : []
    this.rebuild()
  }

  /**
   * Обновляет значение состояния DataTableViewPipeline.
   */
  setSearch(query: string | DataTableSearchQuery): void {
    this.search = this.createSearchQuery(query)
    this.searchTotalOverride = undefined
    this.searchLoading = false
    this.searchCursor = undefined
    this.searchPreviousCursor = undefined
    this.searchHasMore = false
    this.rebuild()
  }

  /**
   * Очищает накопленное состояние DataTableViewPipeline.
   */
  clearSearch(): void {
    this.search = this.createSearchQuery('')
    this.searchMatches = []
    this.searchActiveIndex = -1
    this.searchTotalOverride = undefined
    this.searchLoading = false
    this.searchCursor = undefined
    this.searchPreviousCursor = undefined
    this.searchHasMore = false
    this.rebuild()
  }

  /**
   * Находит сущность по runtime-критериям DataTableViewPipeline.
   */
  findNext(): DataTableSearchMatch | null {
    if (this.searchMatches.length === 0) return null
    const nextIndex = this.searchActiveIndex < 0
      ? 0
      : (this.searchActiveIndex + 1) % this.searchMatches.length
    return this.focusSearchMatch(nextIndex)
  }

  /**
   * Находит сущность по runtime-критериям DataTableViewPipeline.
   */
  findPrevious(): DataTableSearchMatch | null {
    if (this.searchMatches.length === 0) return null
    const nextIndex = this.searchActiveIndex < 0
      ? this.searchMatches.length - 1
      : (this.searchActiveIndex - 1 + this.searchMatches.length) % this.searchMatches.length
    return this.focusSearchMatch(nextIndex)
  }

  /**
   * Переводит focus в целевое состояние DataTableViewPipeline.
   */
  focusSearchMatch(index: number): DataTableSearchMatch | null {
    if (this.searchMatches.length === 0) return null
    this.searchActiveIndex = clampInteger(index, 0, this.searchMatches.length - 1)
    return this.searchMatches[this.searchActiveIndex] ?? null
  }

  /**
   * Возвращает значение состояния DataTableViewPipeline.
   */
  getSearchState(): DataTableSearchState {
    const activeMatch = this.searchActiveIndex >= 0
      ? this.searchMatches[this.searchActiveIndex] ?? null
      : null
    return {
      query: { ...this.search, columns: [...(this.search.columns ?? [])] },
      matches: [...this.searchMatches],
      activeIndex: this.searchActiveIndex,
      activeMatch,
      total: this.searchTotalOverride ?? this.searchMatches.length,
      loading: this.searchLoading,
      cursor: this.searchCursor,
      previousCursor: this.searchPreviousCursor,
      hasMore: this.searchHasMore,
      mode: this.view.search ? this.view.search.mode : 'off',
      local: this.localSearch,
    }
  }

  /**
   * Обновляет loading state server-side поиска.
   */
  setServerSearchLoading(loading: boolean): void {
    this.searchLoading = loading
  }

  /**
   * Подставляет результаты server-side поиска без локального скана строк.
   */
  setServerSearchResult(
    result: {
      matches: Array<DataTableSearchMatch>
      total?: number
      cursor?: string
      previousCursor?: string
      hasMore?: boolean
    },
    activeIndex = 0,
  ): void {
    this.searchMatches = result.matches.map(match => ({ ...match, ranges: match.ranges.map(range => ({ ...range })) }))
    this.searchTotalOverride = result.total
    this.searchCursor = result.cursor
    this.searchPreviousCursor = result.previousCursor
    this.searchHasMore = result.hasMore ?? !!result.cursor
    this.searchLoading = false
    this.searchActiveIndex = this.searchMatches.length === 0
      ? -1
      : clampInteger(activeIndex, 0, this.searchMatches.length - 1)
  }

  /**
   * Добавляет следующую server-side страницу поиска без локального скана строк.
   */
  appendServerSearchResult(
    result: {
      matches: Array<DataTableSearchMatch>
      total?: number
      cursor?: string
      previousCursor?: string
      hasMore?: boolean
    },
    activeIndex?: number,
  ): void {
    const nextMatches = result.matches.map(match => ({ ...match, ranges: match.ranges.map(range => ({ ...range })) }))
    this.searchMatches = [...this.searchMatches, ...nextMatches]
    this.searchTotalOverride = result.total ?? this.searchTotalOverride
    this.searchCursor = result.cursor
    this.searchPreviousCursor = result.previousCursor ?? this.searchPreviousCursor
    this.searchHasMore = result.hasMore ?? !!result.cursor
    this.searchLoading = false
    if (this.searchMatches.length === 0) {
      this.searchActiveIndex = -1
      return
    }
    if (typeof activeIndex === 'number') {
      this.searchActiveIndex = clampInteger(activeIndex, 0, this.searchMatches.length - 1)
    } else if (this.searchActiveIndex < 0) {
      this.searchActiveIndex = 0
    }
  }

  /**
   * Добавляет предыдущую server-side страницу поиска без локального скана строк.
   */
  prependServerSearchResult(
    result: {
      matches: Array<DataTableSearchMatch>
      total?: number
      cursor?: string
      previousCursor?: string
      hasMore?: boolean
    },
    activeIndex?: number,
  ): void {
    const previousMatches = result.matches.map(match => ({ ...match, ranges: match.ranges.map(range => ({ ...range })) }))
    this.searchMatches = [...previousMatches, ...this.searchMatches]
    this.searchTotalOverride = result.total ?? this.searchTotalOverride
    this.searchCursor = result.cursor ?? this.searchCursor
    this.searchPreviousCursor = result.previousCursor
    this.searchHasMore = this.searchHasMore || !!this.searchCursor
    this.searchLoading = false
    if (this.searchMatches.length === 0) {
      this.searchActiveIndex = -1
      return
    }
    if (typeof activeIndex === 'number') {
      this.searchActiveIndex = clampInteger(activeIndex, 0, this.searchMatches.length - 1)
    } else {
      this.searchActiveIndex = previousMatches.length > 0
        ? previousMatches.length - 1
        : Math.max(0, this.searchActiveIndex)
    }
  }

  /**
   * Возвращает значение состояния DataTableViewPipeline.
   */
  getSearchMatchForCell(rowId: DataTableRowId, columnId: string): { match: DataTableSearchMatch; index: number } | null {
    for (let index = 0; index < this.searchMatches.length; index += 1) {
      const match = this.searchMatches[index]!
      if (match.rowId === rowId && (match.columnId === columnId || this.search.scope === 'rows')) {
        return { match, index }
      }
    }
    return null
  }

  /**
   * Возвращает значение состояния DataTableViewPipeline.
   */
  getSearchMatchForRow(rowId: DataTableRowId): { match: DataTableSearchMatch; index: number } | null {
    for (let index = 0; index < this.searchMatches.length; index += 1) {
      const match = this.searchMatches[index]!
      if (match.rowId === rowId) return { match, index }
    }
    return null
  }

  /**
   * Обновляет значение состояния DataTableViewPipeline.
   */
  setGrouping(groups: Array<DataTableGroupRule<Row>>): void {
    if (!this.view.grouping) return
    this.groupingGroupsOverride = [...groups]
    this.view = {
      ...this.view,
      grouping: {
        ...this.view.grouping,
        enabled: groups.length > 0,
        groups,
      },
    }
    this.groupingExpanded = this.view.grouping.expanded === 'none' ? 'none' : 'all'
    this.rebuild()
  }

  /**
   * Очищает накопленное состояние DataTableViewPipeline.
   */
  clearGrouping(): void {
    if (!this.view.grouping) return
    this.groupingGroupsOverride = []
    this.view = {
      ...this.view,
      grouping: {
        ...this.view.grouping,
        enabled: false,
        groups: [],
      },
    }
    this.groupingExpanded = 'all'
    this.rebuild()
  }

  /**
   * Переключает флаг состояния DataTableViewPipeline.
   */
  toggleGroup(groupId: string): DataTableGroupNode<Row> | undefined {
    const group = this.groupNodes.get(groupId)
    if (!group) return undefined

    if (group.expanded) this.collapseGroup(groupId)
    else this.expandGroup(groupId)
    return this.groupNodes.get(groupId) ?? group
  }

  /**
   * Выполняет действие expandGroup в рамках ответственности DataTableViewPipeline.
   */
  expandGroup(groupId: string): void {
    this.setGroupExpanded(groupId, true)
  }

  /**
   * Выполняет действие collapseGroup в рамках ответственности DataTableViewPipeline.
   */
  collapseGroup(groupId: string): void {
    this.setGroupExpanded(groupId, false)
  }

  /**
   * Выполняет действие expandAllGroups в рамках ответственности DataTableViewPipeline.
   */
  expandAllGroups(): void {
    this.groupingExpanded = 'all'
    this.rebuild()
  }

  /**
   * Выполняет действие collapseAllGroups в рамках ответственности DataTableViewPipeline.
   */
  collapseAllGroups(): void {
    this.groupingExpanded = 'none'
    this.rebuild()
  }

  /**
   * Выполняет действие reorderRows в рамках ответственности DataTableViewPipeline.
   */
  reorderRows(payload: DataTableRowReorderPayload): DataTableRowReorderPayload {
    const ids = this.rows
      .filter((row): row is DataTableDataViewRow<Row> => row.kind === 'data')
      .map(row => row.rowId)
      .filter((id): id is DataTableRowId => id !== undefined)
    const fromIndex = clampInteger(payload.fromIndex, 0, Math.max(0, ids.length - 1))
    const toIndex = clampInteger(payload.toIndex, 0, Math.max(0, ids.length - 1))
    const [id] = ids.splice(fromIndex, 1)
    if (id !== undefined) ids.splice(toIndex, 0, id)
    this.rowOrder = ids
    this.rebuild()
    return {
      ...payload,
      rowId: payload.rowId ?? id,
      fromIndex,
      toIndex,
      mode: payload.mode ?? ((this.view.rowOrdering && this.view.rowOrdering.mode) || 'view'),
    }
  }

  /**
   * Выполняет действие reorderColumns в рамках ответственности DataTableViewPipeline.
   */
  reorderColumns(payload: DataTableColumnReorderPayload, columns: Array<DataTableColumnInput<Row>>): DataTableColumnReorderPayload {
    const ids = this.columnOrder.length > 0 ? [...this.columnOrder] : columns.map(column => column.id)
    const fromIndex = clampInteger(payload.fromIndex, 0, Math.max(0, ids.length - 1))
    const toIndex = clampInteger(payload.toIndex, 0, Math.max(0, ids.length - 1))
    const [id] = ids.splice(fromIndex, 1)
    if (id !== undefined) ids.splice(toIndex, 0, id)
    this.columnOrder = payload.order ? normalizeColumnOrder(payload.order, columns) : ids
    return {
      ...payload,
      columnId: payload.columnId || id || '',
      fromIndex,
      toIndex,
      order: [...this.columnOrder],
    }
  }

  /**
   * Обновляет значение состояния DataTableViewPipeline.
   */
  setColumnOrder(order: Array<string>, columns: Array<DataTableColumnInput<Row>>): Array<string> {
    this.columnOrder = normalizeColumnOrder(order, columns)
    return [...this.columnOrder]
  }

  /**
   * Сбрасывает состояние к базовым значениям DataTableViewPipeline.
   */
  resetColumnOrder(): void {
    this.columnOrder = []
  }

  /**
   * Сбрасывает состояние к базовым значениям DataTableViewPipeline.
   */
  reset(): void {
    this.sort = this.view.sorting ? [...this.view.sorting.initial] : []
    this.filters = this.view.filtering ? cloneFilters(this.view.filtering.initial) : []
    this.search = this.createSearchQuery('')
    this.searchMatches = []
    this.searchActiveIndex = -1
    this.searchTotalOverride = undefined
    this.searchLoading = false
    this.searchCursor = undefined
    this.searchPreviousCursor = undefined
    this.searchHasMore = false
    this.rowOrder = []
    this.columnOrder = this.view.columnOrdering ? [...this.view.columnOrdering.order] : []
    this.groupingGroupsOverride = null
    this.groupingExpanded = this.view.grouping ? cloneExpanded(this.view.grouping.expanded) : 'all'
    this.rebuild()
  }

  /**
   * Выполняет действие orderColumns в рамках ответственности DataTableViewPipeline.
   */
  orderColumns(columns: Array<DataTableColumnInput<Row>>): Array<DataTableColumnInput<Row>> {
    const order = this.columnOrder.length > 0 ? this.columnOrder : this.view.columnOrdering && this.view.columnOrdering.order
    if (!order || order.length === 0) return columns
    const rank = new Map(order.map((id, index) => [id, index]))
    return [...columns].sort((a, b) => {
      const aRank = rank.get(a.id) ?? Number.MAX_SAFE_INTEGER
      const bRank = rank.get(b.id) ?? Number.MAX_SAFE_INTEGER
      if (aRank !== bRank) return aRank - bRank
      return columns.indexOf(a) - columns.indexOf(b)
    })
  }

  /**
   * Выполняет действие isServerControlled в рамках ответственности DataTableViewPipeline.
   */
  isServerControlled(): boolean {
    return !!(this.view.sorting && this.view.sorting.controlled)
      || !!(this.view.filtering && this.view.filtering.controlled)
      || !!(this.view.search && this.view.search.controlled)
      || !!(this.view.grouping && this.view.grouping.controlled)
  }

  /**
   * Выполняет внутренний шаг rebuild для DataTableViewPipeline.
   */
  private rebuild(): void {
    this.localSort = this.shouldApplyLocal(this.view.sorting ? this.view.sorting.mode : 'server')
    this.localFilter = this.shouldApplyLocal(this.view.filtering ? this.view.filtering.mode : 'server')
    this.localSearch = this.isSearchActive() && this.shouldApplyLocal(this.view.search ? this.view.search.mode : 'server')
    this.localGrouping = !!(this.view.grouping && this.view.grouping.enabled && this.view.grouping.groups.length > 0)
      && this.shouldApplyLocal(this.view.grouping.mode)

    const needsMaterializedRows = (this.localSort && this.sort.length > 0)
      || (this.localFilter && hasFilters(this.filters))
      || this.localSearch
      || this.localGrouping
      || this.rowOrder.length > 0
    if (!needsMaterializedRows) {
      this.passthrough = true
      this.groupNodes.clear()
      this.rows = []
      this.rebuildSearchMatches()
      return
    }

    this.passthrough = false
    const rows: Array<DataTableDataViewRow<Row>> = []
    for (let storeIndex = 0; storeIndex < this.store.rowCount; storeIndex += 1) {
      const row = this.store.getRowAt(storeIndex)
      if (!row) continue
      const rowId = this.store.getRowIdAt(storeIndex)
      rows.push({ kind: 'data', row, rowId, storeIndex, viewIndex: rows.length, depth: 0 })
    }

    const filtered = this.localFilter ? rows.filter(item => this.matchesFilters(item)) : rows
    const sorted = this.localSort && this.sort.length > 0 ? [...filtered].sort((a, b) => this.compareRows(a, b)) : filtered
    const ordered = this.applyManualOrder(sorted)
    const searched = this.localSearch && this.search.filter
      ? ordered.filter(item => this.matchSearchRow(item).length > 0)
      : ordered
    const grouped = this.localGrouping && this.view.grouping
      ? this.flattenGroupedRows(searched, this.view.grouping.groups as Array<DataTableGroupRule<Row>>)
      : searched
    this.rows = grouped.map((item, viewIndex) => ({ ...item, viewIndex }))
    this.rebuildSearchMatches()
  }

  /**
   * Выполняет внутренний шаг shouldApplyLocal для DataTableViewPipeline.
   */
  private shouldApplyLocal(mode: DataTableViewMode): boolean {
    if (this.view.serverRowModel && this.view.serverRowModel.enabled && this.view.serverRowModel.authoritative) return false
    if (this.store.rowCount > this.maxClientRows) return false
    if (mode === 'client') return true
    if (mode === 'server') return false
    return this.store.loadedRowCount >= this.store.rowCount
  }

  /**
   * Выполняет внутренний шаг matchesFilters для DataTableViewPipeline.
   */
  private matchesFilters(item: DataTableDataViewRow<Row>): boolean {
    if (!item.row || item.rowId === undefined) return false
    return this.matchesFilterNode(this.filters, item)
  }

  /**
   * Выполняет внутренний шаг matchesFilterNode для DataTableViewPipeline.
   */
  private matchesFilterNode(
    node: DataTableFilterState | DataTableFilterExpression | DataTableFilterRule,
    item: DataTableDataViewRow<Row>,
  ): boolean {
    if (Array.isArray(node)) return node.every(rule => this.matchesFilterRule(rule, item))
    if ('logic' in node) {
      return node.logic === 'or'
        ? node.rules.some(rule => this.matchesFilterNode(rule, item))
        : node.rules.every(rule => this.matchesFilterNode(rule, item))
    }
    return this.matchesFilterRule(node, item)
  }

  /**
   * Выполняет внутренний шаг matchesFilterRule для DataTableViewPipeline.
   */
  private matchesFilterRule(rule: DataTableFilterRule, item: DataTableDataViewRow<Row>): boolean {
    if (!item.row || item.rowId === undefined) return false
    const column = this.columns.find(candidate => candidate.id === rule.columnId)
    if (!column) return true
    const value = resolveDataTableValue(item.row, item.storeIndex, column)
    const filter = typeof column.filter === 'object' ? column.filter : undefined
    const context: DataTableFilterContext<Row> = {
      row: item.row,
      rowId: item.rowId,
      rowIndex: item.storeIndex,
      column,
      value,
      operator: rule.operator,
      filterValue: rule.value,
    }
    if (filter?.predicate) return filter.predicate(context)
    return defaultPredicate(rule.operator, value, rule.value)
  }

  /**
   * Выполняет внутренний шаг compareRows для DataTableViewPipeline.
   */
  private compareRows(a: DataTableDataViewRow<Row>, b: DataTableDataViewRow<Row>): number {
    for (let index = 0; index < this.sort.length; index += 1) {
      const rule = this.sort[index]!
      const column = this.columns.find(item => item.id === rule.columnId)
      if (!column || !a.row || !b.row) continue
      const sortConfig = typeof column.sortable === 'object' ? column.sortable : undefined
      const aValue = sortConfig?.accessor
        ? sortConfig.accessor(a.row, a.storeIndex)
        : resolveDataTableValue(a.row, a.storeIndex, column)
      const bValue = sortConfig?.accessor
        ? sortConfig.accessor(b.row, b.storeIndex)
        : resolveDataTableValue(b.row, b.storeIndex, column)
      const compared = sortConfig?.compare
        ? sortConfig.compare(aValue, bValue, a.row, b.row)
        : compareValues(aValue, bValue, sortConfig?.nulls)
      if (compared !== 0) return rule.direction === 'asc' ? compared : -compared
    }
    return a.storeIndex - b.storeIndex
  }

  /**
   * Выполняет внутренний шаг isSearchActive для DataTableViewPipeline.
   */
  private isSearchActive(): boolean {
    return this.search.text.trim().length > 0
  }

  /**
   * Создает runtime-сущность DataTableViewPipeline.
   */
  private createSearchQuery(query: string | DataTableSearchQuery): DataTableSearchQuery {
    const raw = typeof query === 'string' ? { text: query } : query
    const options = this.view.search
    return {
      text: raw.text ?? '',
      scope: raw.scope ?? options?.scope ?? 'cells',
      match: raw.match ?? options?.match ?? 'contains',
      caseSensitive: raw.caseSensitive ?? options?.caseSensitive ?? false,
      columns: raw.columns ?? options?.columns ?? [],
      highlight: raw.highlight ?? options?.highlight ?? 'cell-text',
      filter: raw.filter ?? options?.filter ?? true,
      highlightColor: raw.highlightColor ?? options?.highlightColor ?? '#b45309',
      activeHighlightColor: raw.activeHighlightColor ?? options?.activeHighlightColor ?? '#be123c',
    }
  }

  /**
   * Выполняет внутренний шаг rebuildSearchMatches для DataTableViewPipeline.
   */
  private rebuildSearchMatches(): void {
    if (!this.localSearch || !this.isSearchActive()) {
      this.searchMatches = []
      this.searchActiveIndex = -1
      this.searchTotalOverride = undefined
      this.searchLoading = false
      this.searchCursor = undefined
      this.searchPreviousCursor = undefined
      this.searchHasMore = false
      return
    }

    const sourceRows = this.passthrough
      ? Array.from({ length: this.store.rowCount }, (_item, viewIndex) => this.getViewRowAt(viewIndex)!)
      : this.rows
    const matches: Array<DataTableSearchMatch> = []
    for (const viewRow of sourceRows) {
      if (!viewRow || viewRow.kind !== 'data' || !viewRow.row) continue
      matches.push(...this.matchSearchRow(viewRow))
    }
    this.searchMatches = matches
    this.searchTotalOverride = undefined
    this.searchLoading = false
    this.searchCursor = undefined
    this.searchPreviousCursor = undefined
    this.searchHasMore = false
    if (matches.length === 0) this.searchActiveIndex = -1
    else if (this.searchActiveIndex < 0) this.searchActiveIndex = 0
    else this.searchActiveIndex = Math.min(this.searchActiveIndex, matches.length - 1)
  }

  /**
   * Выполняет внутренний шаг matchSearchRow для DataTableViewPipeline.
   */
  private matchSearchRow(viewRow: DataTableDataViewRow<Row>): Array<DataTableSearchMatch> {
    const row = viewRow.row
    if (!row) return []
    const searchableColumns = this.resolveSearchableColumns()
    const matches: Array<DataTableSearchMatch> = []
    if (this.search.scope === 'rows') {
      const value = searchableColumns
        .map(column => String(resolveDataTableValue(row, viewRow.storeIndex, column) ?? ''))
        .join(' ')
      const ranges = findSearchRanges(value, this.search)
      if (ranges.length > 0) {
        matches.push({
          rowId: viewRow.rowId,
          rowIndex: viewRow.viewIndex,
          storeIndex: viewRow.storeIndex,
          value,
          ranges,
        })
      }
      return matches
    }

    for (const column of searchableColumns) {
      const value = String(resolveDataTableValue(row, viewRow.storeIndex, column) ?? '')
      const ranges = findSearchRanges(value, this.search)
      if (ranges.length === 0) continue
      matches.push({
        rowId: viewRow.rowId,
        rowIndex: viewRow.viewIndex,
        storeIndex: viewRow.storeIndex,
        columnId: column.id,
        columnIndex: this.columns.indexOf(column),
        value,
        ranges,
      })
    }
    return matches
  }

  /**
   * Нормализует и возвращает итоговое значение DataTableViewPipeline.
   */
  private resolveSearchableColumns(): Array<DataTableResolvedColumn<Row>> {
    const ids = this.search.columns ?? []
    if (ids.length === 0) return this.columns
    const allowed = new Set(ids)
    return this.columns.filter(column => allowed.has(column.id))
  }

  /**
   * Применяет подготовленное состояние DataTableViewPipeline.
   */
  private applyManualOrder(rows: Array<DataTableDataViewRow<Row>>): Array<DataTableDataViewRow<Row>> {
    if (this.rowOrder.length === 0) return rows
    const byId = new Map(rows.map(row => [row.rowId, row]))
    const ordered: Array<DataTableDataViewRow<Row>> = []
    const used = new Set<DataTableRowId>()
    for (const id of this.rowOrder) {
      const row = byId.get(id)
      if (!row) continue
      ordered.push(row)
      used.add(id)
    }
    for (const row of rows) {
      if (row.rowId === undefined || !used.has(row.rowId)) ordered.push(row)
    }
    return ordered
  }

  /**
   * Выполняет внутренний шаг flattenGroupedRows для DataTableViewPipeline.
   */
  private flattenGroupedRows(
    rows: Array<DataTableDataViewRow<Row>>,
    rules: Array<DataTableGroupRule<Row>>,
  ): Array<DataTableViewRow<Row>> {
    this.groupNodes.clear()
    const grouped = this.buildGroupNodes(rows, rules, 0, undefined)
    const flattened: Array<DataTableViewRow<Row>> = []
    const showGroupRows = this.view.grouping ? this.view.grouping.showGroupRows : true
    const showGroupFooters = this.view.grouping ? this.view.grouping.showGroupFooters : false
    for (const group of grouped) {
      this.appendGroupRows(group, flattened, showGroupRows, showGroupFooters)
    }

    const showGrandFooter = this.view.grouping
      && this.view.grouping.showGrandFooter
      && (this.view.grouping.footerPlacement === 'scroll' || this.view.grouping.footerPlacement === 'both')
    if (showGrandFooter) {
      const materializedRows = rows.map(item => item.row).filter((row): row is Row => !!row)
      flattened.push({
        kind: 'grand-footer',
        rowId: '__grand-footer__',
        storeIndex: -1,
        viewIndex: flattened.length,
        depth: 0,
        aggregate: this.computeAggregate(materializedRows, rules),
        rows: materializedRows,
      })
    }
    return flattened
  }

  /**
   * Собирает runtime-структуру DataTableViewPipeline.
   */
  private buildGroupNodes(
    rows: Array<DataTableDataViewRow<Row>>,
    rules: Array<DataTableGroupRule<Row>>,
    depth: number,
    parentId: string | undefined,
  ): Array<DataTableGroupNode<Row>> {
    const rule = rules[depth]
    if (!rule) return []

    const buckets = new Map<string, { key: unknown; label: string; rows: Array<DataTableDataViewRow<Row>> }>()
    for (const row of rows) {
      if (!row.row) continue
      const key = this.resolveGroupKey(rule, row.row, row.storeIndex)
      const label = formatGroupLabel(key)
      const bucketId = String(label)
      const bucket = buckets.get(bucketId)
      if (bucket) bucket.rows.push(row)
      else buckets.set(bucketId, { key, label, rows: [row] })
    }

    const groups = [...buckets.values()].map(bucket => {
      const groupId = `${parentId ? `${parentId}/` : ''}${rule.id}:${bucket.label}`
      const groupRows = bucket.rows.map(item => item.row).filter((row): row is Row => !!row)
      const node: DataTableGroupNode<Row> = {
        rule,
        groupId,
        key: bucket.key,
        label: bucket.label,
        title: rule.title ?? rule.id,
        depth,
        rows: groupRows,
        count: groupRows.length,
        parentId,
        aggregate: this.computeAggregate(groupRows, [rule]),
        expanded: this.isGroupExpanded(groupId),
        children: [],
      }
      const childGroups = this.buildGroupNodes(bucket.rows, rules, depth + 1, groupId)
      node.children = childGroups.length > 0 ? childGroups : bucket.rows.map(row => ({ ...row, depth: depth + 1 }))
      this.groupNodes.set(groupId, node)
      return node
    })

    return this.sortGroups(groups, rule)
  }

  /**
   * Добавляет сущность в runtime-коллекцию DataTableViewPipeline.
   */
  private appendGroupRows(
    group: DataTableGroupNode<Row>,
    target: Array<DataTableViewRow<Row>>,
    showGroupRows: boolean,
    showGroupFooters: boolean,
  ): void {
    if (showGroupRows) {
      target.push({
        kind: 'group',
        group,
        rowId: group.groupId,
        storeIndex: -1,
        viewIndex: target.length,
        depth: group.depth,
      })
    }

    if (group.expanded) {
      if (showGroupFooters && this.view.groupingPinnedRows && this.view.groupingPinnedRows.placement === 'group-start') {
        target.push({
          kind: 'group-footer',
          group,
          rowId: `${group.groupId}:footer`,
          storeIndex: -1,
          viewIndex: target.length,
          depth: group.depth,
        })
      }
      for (const child of group.children) {
        if ('kind' in child && child.kind === 'data') target.push({ ...child, viewIndex: target.length })
        else this.appendGroupRows(child as DataTableGroupNode<Row>, target, showGroupRows, showGroupFooters)
      }
      if (showGroupFooters && (!this.view.groupingPinnedRows || this.view.groupingPinnedRows.placement !== 'group-start')) {
        target.push({
          kind: 'group-footer',
          group,
          rowId: `${group.groupId}:footer`,
          storeIndex: -1,
          viewIndex: target.length,
          depth: group.depth,
        })
      }
    }
  }

  /**
   * Нормализует и возвращает итоговое значение DataTableViewPipeline.
   */
  private resolveGroupKey(rule: DataTableGroupRule<Row>, row: Row, index: number): unknown {
    if (rule.value) return rule.value(row, index)
    if (rule.field) return row[rule.field as keyof Row]
    return row[rule.id]
  }

  /**
   * Выполняет внутренний шаг sortGroups для DataTableViewPipeline.
   */
  private sortGroups(groups: Array<DataTableGroupNode<Row>>, rule: DataTableGroupRule<Row>): Array<DataTableGroupNode<Row>> {
    if (!rule.sort) return groups
    const sorted = [...groups]
    if (typeof rule.sort === 'function') return sorted.sort(rule.sort)
    return sorted.sort((a, b) => rule.sort === 'asc'
      ? compareValues(a.label, b.label)
      : compareValues(b.label, a.label))
  }

  /**
   * Вычисляет производное значение DataTableViewPipeline.
   */
  private computeAggregate(rows: Array<Row>, rules: Array<DataTableGroupRule<Row>>): Record<string, unknown> {
    const aggregate: Record<string, unknown> = { count: rows.length }
    for (const rule of rules) {
      for (const [key, aggregator] of Object.entries(rule.aggregates ?? {})) {
        aggregate[key] = this.resolveAggregate(rows, key, aggregator, rule)
      }
    }
    return aggregate
  }

  /**
   * Нормализует и возвращает итоговое значение DataTableViewPipeline.
   */
  private resolveAggregate(
    rows: Array<Row>,
    key: string,
    aggregator: DataTableAggregator<Row>,
    rule: DataTableGroupRule<Row>,
  ): unknown {
    const context: DataTableGroupContext<Row> = {
      rule,
      groupId: rule.id,
      key,
      label: key,
      title: rule.title ?? rule.id,
      depth: 0,
      rows,
      count: rows.length,
    }
    if (typeof aggregator === 'function') return aggregator(rows, context)
    if (aggregator === 'count') return rows.length

    const values = rows.map(row => Number(row[key])).filter(Number.isFinite)
    if (values.length === 0) return 0
    if (aggregator === 'sum') return values.reduce((sum, value) => sum + value, 0)
    if (aggregator === 'avg') return values.reduce((sum, value) => sum + value, 0) / values.length
    if (aggregator === 'min') return Math.min(...values)
    if (aggregator === 'max') return Math.max(...values)
    return undefined
  }

  /**
   * Выполняет внутренний шаг isGroupExpanded для DataTableViewPipeline.
   */
  private isGroupExpanded(groupId: string): boolean {
    if (this.groupingExpanded === 'all') return true
    if (this.groupingExpanded === 'none') return false
    return this.groupingExpanded.includes(groupId)
  }

  /**
   * Обновляет значение состояния DataTableViewPipeline.
   */
  private setGroupExpanded(groupId: string, expanded: boolean): void {
    const allGroupIds = [...this.groupNodes.keys()]
    if (this.groupingExpanded === 'all') {
      if (expanded) return
      this.groupingExpanded = allGroupIds.filter(id => id !== groupId)
    } else if (this.groupingExpanded === 'none') {
      this.groupingExpanded = expanded ? [groupId] : []
    } else {
      const set = new Set(this.groupingExpanded)
      if (expanded) set.add(groupId)
      else set.delete(groupId)
      this.groupingExpanded = [...set]
    }
    this.rebuild()
  }
}

function compareValues(a: unknown, b: unknown, nulls: 'first' | 'last' = 'last'): number {
  if (a === b) return 0
  if (a === undefined || a === null) return nulls === 'first' ? -1 : 1
  if (b === undefined || b === null) return nulls === 'first' ? 1 : -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })
}

function defaultPredicate(operator: DataTableFilterOperator, value: unknown, filterValue: unknown): boolean {
  const text = String(value ?? '').toLowerCase()
  const filterText = String(filterValue ?? '').toLowerCase()
  if (operator === 'contains') return text.includes(filterText)
  if (operator === 'startsWith') return text.startsWith(filterText)
  if (operator === 'endsWith') return text.endsWith(filterText)
  if (operator === 'equals' || operator === 'is') return value === filterValue || text === filterText
  if (operator === 'isNot') return value !== filterValue && text !== filterText
  if (operator === 'in') return Array.isArray(filterValue) ? filterValue.includes(value) : false
  if (operator === 'notIn') return Array.isArray(filterValue) ? !filterValue.includes(value) : true
  const number = Number(value)
  if (!Number.isFinite(number)) return false
  if (operator === 'gt') return number > Number(filterValue)
  if (operator === 'gte') return number >= Number(filterValue)
  if (operator === 'lt') return number < Number(filterValue)
  if (operator === 'lte') return number <= Number(filterValue)
  if (operator === 'between' && Array.isArray(filterValue)) {
    return number >= Number(filterValue[0]) && number <= Number(filterValue[1])
  }
  return true
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(Number.isFinite(value) ? value : min)))
}

function cloneExpanded(value: 'all' | 'none' | Array<string>): 'all' | 'none' | Array<string> {
  return Array.isArray(value) ? [...value] : value
}

function normalizeSort(sort: DataTableSortState): DataTableSortState {
  return sort.map((rule, index) => ({ ...rule, priority: index }))
}

function normalizeColumnOrder<Row extends Record<string, any>>(
  order: Array<string>,
  columns: Array<DataTableColumnInput<Row>>,
): Array<string> {
  const columnIds = columns.map(column => column.id)
  const columnSet = new Set(columnIds)
  const seen = new Set<string>()
  const next: Array<string> = []

  for (const id of order) {
    if (!columnSet.has(id) || seen.has(id)) continue
    seen.add(id)
    next.push(id)
  }

  for (const id of columnIds) {
    if (seen.has(id)) continue
    next.push(id)
  }

  return next
}

function cloneFilters(filters: DataTableFilterState | DataTableFilterExpression): DataTableFilterState | DataTableFilterExpression {
  if (Array.isArray(filters)) return filters.map(rule => ({ ...rule }))
  return {
    logic: filters.logic,
    rules: filters.rules.map(rule => cloneFilterNode(rule)),
  }
}

function cloneFilterNode(rule: DataTableFilterRule | DataTableFilterExpression): DataTableFilterRule | DataTableFilterExpression {
  if ('logic' in rule) {
    return {
      logic: rule.logic,
      rules: rule.rules.map(child => cloneFilterNode(child)),
    }
  }
  return { ...rule }
}

function setFilterRule(
  filters: DataTableFilterState | DataTableFilterExpression,
  columnId: string,
  next: DataTableFilterRule,
): DataTableFilterState | DataTableFilterExpression {
  if (Array.isArray(filters)) {
    return [...filters.filter(rule => rule.columnId !== columnId), { ...next }]
  }

  const expression = removeFilterRule(filters, columnId) as DataTableFilterExpression
  return {
    logic: expression.logic,
    rules: [...expression.rules, { ...next }],
  }
}

function removeFilterRule(
  filters: DataTableFilterState | DataTableFilterExpression,
  columnId: string,
): DataTableFilterState | DataTableFilterExpression {
  if (Array.isArray(filters)) return filters.filter(rule => rule.columnId !== columnId).map(rule => ({ ...rule }))

  return {
    logic: filters.logic,
    rules: filters.rules
      .map(rule => removeFilterNode(rule, columnId))
      .filter((rule): rule is DataTableFilterRule | DataTableFilterExpression => rule !== null),
  }
}

function removeFilterNode(
  rule: DataTableFilterRule | DataTableFilterExpression,
  columnId: string,
): DataTableFilterRule | DataTableFilterExpression | null {
  if (!('logic' in rule)) return rule.columnId === columnId ? null : { ...rule }

  const rules = rule.rules
    .map(child => removeFilterNode(child, columnId))
    .filter((child): child is DataTableFilterRule | DataTableFilterExpression => child !== null)
  return rules.length === 0 ? null : { logic: rule.logic, rules }
}

function flattenFilterRules(filters: DataTableFilterState | DataTableFilterExpression): DataTableFilterState {
  if (Array.isArray(filters)) return filters.map(rule => ({ ...rule }))
  return filters.rules.flatMap(rule => 'logic' in rule ? flattenFilterRules(rule) : [{ ...rule }])
}

function hasFilters(filters: DataTableFilterState | DataTableFilterExpression): boolean {
  if (Array.isArray(filters)) return filters.length > 0
  return filters.rules.length > 0
}

function findSearchRanges(value: string, query: DataTableSearchQuery): Array<{ start: number; end: number }> {
  const needle = query.text
  if (!needle) return []

  const source = query.caseSensitive ? value : value.toLowerCase()
  const target = query.caseSensitive ? needle : needle.toLowerCase()
  const ranges: Array<{ start: number; end: number }> = []

  if (query.match === 'regex') {
    try {
      const flags = query.caseSensitive ? 'g' : 'gi'
      const regex = new RegExp(needle, flags)
      for (const match of source.matchAll(regex)) {
        const start = match.index ?? -1
        const text = match[0] ?? ''
        if (start >= 0 && text.length > 0) ranges.push({ start, end: start + text.length })
      }
    } catch {
      return []
    }
    return ranges
  }

  if (query.match === 'equals') {
    return source === target ? [{ start: 0, end: value.length }] : []
  }

  if (query.match === 'startsWith') {
    return source.startsWith(target) ? [{ start: 0, end: needle.length }] : []
  }

  let cursor = 0
  while (cursor <= source.length) {
    const index = source.indexOf(target, cursor)
    if (index < 0) break
    ranges.push({ start: index, end: index + needle.length })
    cursor = index + Math.max(1, needle.length)
  }
  return ranges
}

function formatGroupLabel(value: unknown): string {
  if (value === undefined || value === null || value === '') return 'Empty'
  return String(value)
}

function createViewSignature(view: DataTableResolvedViewOptions, expanded: 'all' | 'none' | Array<string>): string {
  return JSON.stringify({
    sorting: view.sorting && {
      mode: view.sorting.mode,
      multi: view.sorting.multi,
      headerClick: view.sorting.headerClick,
      controlled: view.sorting.controlled,
    },
    filtering: view.filtering && { mode: view.filtering.mode, controlled: view.filtering.controlled },
    serverRowModel: view.serverRowModel && {
      enabled: view.serverRowModel.enabled,
      authoritative: view.serverRowModel.authoritative,
    },
    search: view.search && {
      mode: view.search.mode,
      scope: view.search.scope,
      match: view.search.match,
      caseSensitive: view.search.caseSensitive,
      columns: view.search.columns,
      highlight: view.search.highlight,
      filter: view.search.filter,
      highlightColor: view.search.highlightColor,
      activeHighlightColor: view.search.activeHighlightColor,
      controlled: view.search.controlled,
    },
    grouping: view.grouping && {
      enabled: view.grouping.enabled,
      mode: view.grouping.mode,
      controlled: view.grouping.controlled,
      groups: view.grouping.groups.map(group => [group.id, group.title, String(group.field ?? '')]),
      showGroupRows: view.grouping.showGroupRows,
      showGroupFooters: view.grouping.showGroupFooters,
      showGrandFooter: view.grouping.showGrandFooter,
      footerPlacement: view.grouping.footerPlacement,
      expanded,
    },
    groupingPinnedRows: view.groupingPinnedRows && {
      global: view.groupingPinnedRows.global,
      insideGroup: view.groupingPinnedRows.insideGroup,
      placement: view.groupingPinnedRows.placement,
    },
  })
}
