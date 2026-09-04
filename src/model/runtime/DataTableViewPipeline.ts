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
  DataTableQueryState,
  DataTableResolvedColumn,
  DataTableResolvedPerformanceOptions,
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
import { resolveDataTableValue } from '@/model/runtime/datatable-columns'

interface DataTableViewPipelineInput<Row extends Record<string, any>> {
  columns: Array<DataTableResolvedColumn<Row>>
  view: DataTableResolvedViewOptions
  performance: DataTableResolvedPerformanceOptions
}

/**
 * Строит текущий view поверх store: sort/filter/manual order/grouping/column order.
 */
export class DataTableViewPipeline<Row extends Record<string, any> = Record<string, any>> {
  private _columns: Array<DataTableResolvedColumn<Row>> = []
  private _view: DataTableResolvedViewOptions
  private _initialized = false
  private _sort: DataTableSortState = []
  private _filters: DataTableFilterState | DataTableFilterExpression = []
  private _search: DataTableSearchQuery = { text: '' }
  private _searchMatches: Array<DataTableSearchMatch> = []
  private _searchActiveIndex = -1
  private _searchTotalOverride: number | undefined
  private _searchLoading = false
  private _searchCursor: string | undefined
  private _searchPreviousCursor: string | undefined
  private _searchHasMore = false
  private readonly _searchMatchByCell = new Map<string, { match: DataTableSearchMatch, index: number }>()
  private readonly _searchMatchByRow = new Map<string, { match: DataTableSearchMatch, index: number }>()
  private _rowOrder: Array<DataTableRowId> = []
  private _columnOrder: Array<string> = []
  private _groupingExpanded: 'all' | 'none' | Array<string> = 'all'
  private _rows: Array<DataTableViewRow<Row>> = []
  private _groupNodes = new Map<string, DataTableGroupNode<Row>>()
  private _groupingGroupsOverride: Array<DataTableGroupRule<Row>> | null = null
  private _revision = -1
  private _viewSignature = ''
  private _maxClientRows = 100_000
  private _expandedInputSignature = ''
  private _passthrough = false
  private _localSort = false
  private _localFilter = false
  private _localSearch = false
  private _localGrouping = false

  /**
   * Создает экземпляр DataTableViewPipeline и подготавливает базовое состояние.
   */
  constructor(private readonly _store: DataTableStoreApi<Row>) {
    this._view = {
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
    this._columns = input.columns
    this._view = input.view
    this._maxClientRows = input.performance.maxClientRows
    if (this._groupingGroupsOverride && this._view.grouping) {
      this._view = {
        ...this._view,
        grouping: {
          ...this._view.grouping,
          enabled: this._groupingGroupsOverride.length > 0,
          groups: [...this._groupingGroupsOverride],
        },
      }
    }
    const view = this._view
    if (!this._initialized) {
      this._sort = view.sorting ? [...view.sorting.initial] : []
      this._filters = view.filtering ? cloneFilters(view.filtering.initial) : []
      this._search = this._createSearchQuery('')
      this._columnOrder = view.columnOrdering ? [...view.columnOrdering.order] : []
      this._groupingExpanded = view.grouping ? cloneExpanded(view.grouping.expanded) : 'all'
      this._expandedInputSignature = view.grouping ? JSON.stringify(view.grouping.expanded) : ''
      this._initialized = true
    }
    else {
      if (view.columnOrdering && view.columnOrdering.order.length > 0 && this._columnOrder.length === 0) {
        this._columnOrder = [...view.columnOrdering.order]
      }
      const expandedInputSignature = view.grouping ? JSON.stringify(view.grouping.expanded) : ''
      if (expandedInputSignature !== this._expandedInputSignature) {
        this._groupingExpanded = view.grouping ? cloneExpanded(view.grouping.expanded) : 'all'
        this._expandedInputSignature = expandedInputSignature
      }
    }

    const revision = this._store.takeRevision()
    const viewSignature = createViewSignature(view, this._groupingExpanded)
    if (revision !== this._revision || viewSignature !== this._viewSignature) {
      this._revision = revision
      this._viewSignature = viewSignature
      this._rebuild()
    }
  }

  /**
   * Возвращает row Count для DataTableViewPipeline.
   */
  get rowCount(): number {
    return this._passthrough ? this._store.rowCount : this._rows.length
  }

  /**
   * Возвращает значение состояния DataTableViewPipeline.
   */
  getRowAt(viewIndex: number): Row | undefined {
    const row = this._rows[viewIndex]
    if (!row) {
      return this._store.getRowAt(viewIndex)
    }
    return row.kind === 'data' ? row.row : undefined
  }

  /**
   * Возвращает значение состояния DataTableViewPipeline.
   */
  getRowIdAt(viewIndex: number): DataTableRowId | undefined {
    return this._rows[viewIndex]?.rowId ?? this._store.getRowIdAt(viewIndex)
  }

  /**
   * Возвращает значение состояния DataTableViewPipeline.
   */
  getStoreIndexAt(viewIndex: number): number | undefined {
    return this._rows[viewIndex]?.storeIndex ?? viewIndex
  }

  /**
   * Возвращает значение состояния DataTableViewPipeline.
   */
  getViewRowAt(viewIndex: number): DataTableViewRow<Row> | undefined {
    if (this._passthrough) {
      if (viewIndex < 0 || viewIndex >= this._store.rowCount) {
        return undefined
      }
      const row = this._store.getRowAt(viewIndex)
      return {
        kind: 'data',
        row,
        rowId: this._store.getRowIdAt(viewIndex),
        storeIndex: viewIndex,
        viewIndex,
        depth: 0,
      }
    }
    return this._rows[viewIndex]
  }

  /**
   * Находит сущность по runtime-критериям DataTableViewPipeline.
   */
  findViewIndexByRowId(rowId: DataTableRowId): number | undefined {
    if (this._passthrough) {
      return this._store.getRowIndex(rowId)
    }
    return this._rows.find(row => row.kind === 'data' && row.rowId === rowId)?.viewIndex
  }

  /**
   * Возвращает значение состояния DataTableViewPipeline.
   */
  getViewRows(): Array<DataTableViewRow<Row>> {
    if (this._passthrough) {
      return Array.from({ length: this._store.rowCount }, (_item, viewIndex) => this.getViewRowAt(viewIndex)!)
    }
    return [...this._rows]
  }

  /**
   * Возвращает значение состояния DataTableViewPipeline.
   */
  getQuery(): DataTableQueryState {
    return {
      sort: [...this._sort],
      filters: cloneFilters(this._filters),
      search: this._search.text ? { ...this._search, columns: [...(this._search.columns ?? [])] } : undefined,
      rowOrder: [...this._rowOrder],
      columnOrder: [...this._columnOrder],
      grouping: this._view.grouping
        ? {
            enabled: this._view.grouping.enabled,
            groups: [...this._view.grouping.groups],
            expanded: cloneExpanded(this._groupingExpanded),
            footerPlacement: this._view.grouping.footerPlacement,
          }
        : undefined,
    }
  }

  /**
   * Возвращает значение состояния DataTableViewPipeline.
   */
  getState(): DataTableViewState {
    return {
      sort: [...this._sort],
      filters: cloneFilters(this._filters),
      search: this.getSearchState(),
      rowOrder: [...this._rowOrder],
      columnOrder: [...this._columnOrder],
      grouping: this.getGroupingState(),
      query: this.getQuery(),
      rowCount: this.rowCount,
      mode: {
        sorting: this._view.sorting ? this._view.sorting.mode : 'off',
        filtering: this._view.filtering ? this._view.filtering.mode : 'off',
        search: this._view.search ? this._view.search.mode : 'off',
        grouping: this._view.grouping ? this._view.grouping.mode : 'off',
      },
    }
  }

  /**
   * Возвращает значение состояния DataTableViewPipeline.
   */
  getGroupingState(): DataTableGroupingState<Row> {
    const expandedGroups = [...this._groupNodes.values()]
      .filter(group => group.expanded)
      .map(group => group.groupId)
    return {
      enabled: !!(this._view.grouping && this._view.grouping.enabled),
      mode: this._view.grouping ? this._view.grouping.mode : 'off',
      groups: this._view.grouping ? [...this._view.grouping.groups as Array<DataTableGroupRule<Row>>] : [],
      expanded: cloneExpanded(this._groupingExpanded),
      expandedGroups,
      footerPlacement: this._view.grouping ? this._view.grouping.footerPlacement : 'scroll',
    }
  }

  /**
   * Обновляет значение состояния DataTableViewPipeline.
   */
  setSort(sort: DataTableSortState | DataTableSortRule): void {
    this._sort = normalizeSort(Array.isArray(sort) ? sort : [sort])
    this._rebuild()
  }

  /**
   * Выполняет действие cycleSort в рамках ответственности DataTableViewPipeline.
   */
  cycleSort(columnId: string, additive: boolean): void {
    if (!this._view.sorting) {
      return
    }
    const current = this._sort.find(rule => rule.columnId === columnId)
    const nextDirection = current?.direction === 'asc'
      ? 'desc'
      : current?.direction === 'desc'
        ? undefined
        : 'asc'
    const shouldAppend = this._view.sorting.multi && (additive || this._view.sorting.headerClick === 'append')
    const base = shouldAppend ? this._sort.filter(rule => rule.columnId !== columnId) : []
    this._sort = normalizeSort(nextDirection ? [...base, { columnId, direction: nextDirection }] : base)
    this._rebuild()
  }

  /**
   * Очищает накопленное состояние DataTableViewPipeline.
   */
  clearSort(columnId?: string): void {
    this._sort = normalizeSort(columnId ? this._sort.filter(rule => rule.columnId !== columnId) : [])
    this._rebuild()
  }

  /**
   * Обновляет значение состояния DataTableViewPipeline.
   */
  setFilter(columnId: string, filter: Omit<DataTableFilterRule, 'columnId'> | DataTableFilterRule): void {
    const next = { ...filter, columnId } as DataTableFilterRule
    this._filters = setFilterRule(this._filters, columnId, next)
    this._rebuild()
  }

  /**
   * Обновляет значение состояния DataTableViewPipeline.
   */
  setFilters(filters: DataTableFilterState | DataTableFilterExpression): void {
    this._filters = cloneFilters(filters)
    this._rebuild()
  }

  /**
   * Очищает накопленное состояние DataTableViewPipeline.
   */
  clearFilter(columnId?: string): void {
    this._filters = columnId ? removeFilterRule(this._filters, columnId) : []
    this._rebuild()
  }

  /**
   * Обновляет значение состояния DataTableViewPipeline.
   */
  setSearch(query: string | DataTableSearchQuery): void {
    this._search = this._createSearchQuery(query)
    this._searchTotalOverride = undefined
    this._searchLoading = false
    this._searchCursor = undefined
    this._searchPreviousCursor = undefined
    this._searchHasMore = false
    this._rebuild()
  }

  /**
   * Очищает накопленное состояние DataTableViewPipeline.
   */
  clearSearch(): void {
    this._search = this._createSearchQuery('')
    this._searchMatches = []
    this._reindexSearchMatches()
    this._searchActiveIndex = -1
    this._searchTotalOverride = undefined
    this._searchLoading = false
    this._searchCursor = undefined
    this._searchPreviousCursor = undefined
    this._searchHasMore = false
    this._rebuild()
  }

  /**
   * Находит сущность по runtime-критериям DataTableViewPipeline.
   */
  findNext(): DataTableSearchMatch | null {
    if (this._searchMatches.length === 0) {
      return null
    }
    const nextIndex = this._searchActiveIndex < 0
      ? 0
      : (this._searchActiveIndex + 1) % this._searchMatches.length
    return this.focusSearchMatch(nextIndex)
  }

  /**
   * Находит сущность по runtime-критериям DataTableViewPipeline.
   */
  findPrevious(): DataTableSearchMatch | null {
    if (this._searchMatches.length === 0) {
      return null
    }
    const nextIndex = this._searchActiveIndex < 0
      ? this._searchMatches.length - 1
      : (this._searchActiveIndex - 1 + this._searchMatches.length) % this._searchMatches.length
    return this.focusSearchMatch(nextIndex)
  }

  /**
   * Переводит focus в целевое состояние DataTableViewPipeline.
   */
  focusSearchMatch(index: number): DataTableSearchMatch | null {
    if (this._searchMatches.length === 0) {
      return null
    }
    this._searchActiveIndex = clampInteger(index, 0, this._searchMatches.length - 1)
    return this._searchMatches[this._searchActiveIndex] ?? null
  }

  /**
   * Возвращает значение состояния DataTableViewPipeline.
   */
  getSearchState(): DataTableSearchState {
    const activeMatch = this._searchActiveIndex >= 0
      ? this._searchMatches[this._searchActiveIndex] ?? null
      : null
    return {
      query: { ...this._search, columns: [...(this._search.columns ?? [])] },
      matches: [...this._searchMatches],
      activeIndex: this._searchActiveIndex,
      activeMatch,
      total: this._searchTotalOverride ?? this._searchMatches.length,
      loading: this._searchLoading,
      cursor: this._searchCursor,
      previousCursor: this._searchPreviousCursor,
      hasMore: this._searchHasMore,
      mode: this._view.search ? this._view.search.mode : 'off',
      local: this._localSearch,
    }
  }

  /**
   * Обновляет loading state server-side поиска.
   */
  setServerSearchLoading(loading: boolean): void {
    this._searchLoading = loading
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
    this._searchMatches = result.matches.map(match => ({ ...match, ranges: match.ranges.map(range => ({ ...range })) }))
    this._reindexSearchMatches()
    this._searchTotalOverride = result.total
    this._searchCursor = result.cursor
    this._searchPreviousCursor = result.previousCursor
    this._searchHasMore = result.hasMore ?? !!result.cursor
    this._searchLoading = false
    this._searchActiveIndex = this._searchMatches.length === 0
      ? -1
      : clampInteger(activeIndex, 0, this._searchMatches.length - 1)
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
    this._searchMatches = [...this._searchMatches, ...nextMatches]
    this._reindexSearchMatches()
    this._searchTotalOverride = result.total ?? this._searchTotalOverride
    this._searchCursor = result.cursor
    this._searchPreviousCursor = result.previousCursor ?? this._searchPreviousCursor
    this._searchHasMore = result.hasMore ?? !!result.cursor
    this._searchLoading = false
    if (this._searchMatches.length === 0) {
      this._searchActiveIndex = -1
      return
    }
    if (typeof activeIndex === 'number') {
      this._searchActiveIndex = clampInteger(activeIndex, 0, this._searchMatches.length - 1)
    }
    else if (this._searchActiveIndex < 0) {
      this._searchActiveIndex = 0
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
    this._searchMatches = [...previousMatches, ...this._searchMatches]
    this._reindexSearchMatches()
    this._searchTotalOverride = result.total ?? this._searchTotalOverride
    this._searchCursor = result.cursor ?? this._searchCursor
    this._searchPreviousCursor = result.previousCursor
    this._searchHasMore = this._searchHasMore || !!this._searchCursor
    this._searchLoading = false
    if (this._searchMatches.length === 0) {
      this._searchActiveIndex = -1
      return
    }
    if (typeof activeIndex === 'number') {
      this._searchActiveIndex = clampInteger(activeIndex, 0, this._searchMatches.length - 1)
    }
    else {
      this._searchActiveIndex = previousMatches.length > 0
        ? previousMatches.length - 1
        : Math.max(0, this._searchActiveIndex)
    }
  }

  /**
   * Возвращает значение состояния DataTableViewPipeline.
   */
  getSearchMatchForCell(rowId: DataTableRowId, columnId: string): { match: DataTableSearchMatch, index: number } | null {
    return this._search.scope === 'rows'
      ? this._searchMatchByRow.get(createSearchRowKey(rowId)) ?? null
      : this._searchMatchByCell.get(createSearchCellKey(rowId, columnId)) ?? null
  }

  /**
   * Возвращает значение состояния DataTableViewPipeline.
   */
  getSearchMatchForRow(rowId: DataTableRowId): { match: DataTableSearchMatch, index: number } | null {
    return this._searchMatchByRow.get(createSearchRowKey(rowId)) ?? null
  }

  /**
   * Обновляет значение состояния DataTableViewPipeline.
   */
  setGrouping(groups: Array<DataTableGroupRule<Row>>): void {
    if (!this._view.grouping) {
      return
    }
    this._groupingGroupsOverride = [...groups]
    this._view = {
      ...this._view,
      grouping: {
        ...this._view.grouping,
        enabled: groups.length > 0,
        groups,
      },
    }
    this._groupingExpanded = this._view.grouping.expanded === 'none' ? 'none' : 'all'
    this._rebuild()
  }

  /**
   * Очищает накопленное состояние DataTableViewPipeline.
   */
  clearGrouping(): void {
    if (!this._view.grouping) {
      return
    }
    this._groupingGroupsOverride = []
    this._view = {
      ...this._view,
      grouping: {
        ...this._view.grouping,
        enabled: false,
        groups: [],
      },
    }
    this._groupingExpanded = 'all'
    this._rebuild()
  }

  /**
   * Переключает флаг состояния DataTableViewPipeline.
   */
  toggleGroup(groupId: string): DataTableGroupNode<Row> | undefined {
    const group = this._groupNodes.get(groupId)
    if (!group) {
      return undefined
    }

    if (group.expanded) {
      this.collapseGroup(groupId)
    }
    else { this.expandGroup(groupId) }
    return this._groupNodes.get(groupId) ?? group
  }

  /**
   * Выполняет действие expandGroup в рамках ответственности DataTableViewPipeline.
   */
  expandGroup(groupId: string): void {
    this._setGroupExpanded(groupId, true)
  }

  /**
   * Выполняет действие collapseGroup в рамках ответственности DataTableViewPipeline.
   */
  collapseGroup(groupId: string): void {
    this._setGroupExpanded(groupId, false)
  }

  /**
   * Выполняет действие expandAllGroups в рамках ответственности DataTableViewPipeline.
   */
  expandAllGroups(): void {
    this._groupingExpanded = 'all'
    this._rebuild()
  }

  /**
   * Выполняет действие collapseAllGroups в рамках ответственности DataTableViewPipeline.
   */
  collapseAllGroups(): void {
    this._groupingExpanded = 'none'
    this._rebuild()
  }

  /**
   * Восстанавливает сохраненное состояние expand/collapse для grouping.
   */
  setGroupingExpanded(expanded: 'all' | 'none' | Array<string>): void {
    this._groupingExpanded = cloneExpanded(expanded)
    this._rebuild()
  }

  /**
   * Выполняет действие reorderRows в рамках ответственности DataTableViewPipeline.
   */
  reorderRows(payload: DataTableRowReorderPayload): DataTableRowReorderPayload {
    const ids = this._rows
      .filter((row): row is DataTableDataViewRow<Row> => row.kind === 'data')
      .map(row => row.rowId)
      .filter((id): id is DataTableRowId => id !== undefined)
    const fromIndex = clampInteger(payload.fromIndex, 0, Math.max(0, ids.length - 1))
    const toIndex = clampInteger(payload.toIndex, 0, Math.max(0, ids.length - 1))
    const [id] = ids.splice(fromIndex, 1)
    if (id !== undefined) {
      ids.splice(toIndex, 0, id)
    }
    this._rowOrder = ids
    this._rebuild()
    return {
      ...payload,
      rowId: payload.rowId ?? id,
      fromIndex,
      toIndex,
      mode: payload.mode ?? ((this._view.rowOrdering && this._view.rowOrdering.mode) || 'view'),
    }
  }

  /**
   * Выполняет действие reorderColumns в рамках ответственности DataTableViewPipeline.
   */
  reorderColumns(payload: DataTableColumnReorderPayload, columns: Array<DataTableColumnInput<Row>>): DataTableColumnReorderPayload {
    const ids = this._columnOrder.length > 0 ? [...this._columnOrder] : columns.map(column => column.id)
    const fromIndex = clampInteger(payload.fromIndex, 0, Math.max(0, ids.length - 1))
    const toIndex = clampInteger(payload.toIndex, 0, Math.max(0, ids.length - 1))
    const [id] = ids.splice(fromIndex, 1)
    if (id !== undefined) {
      ids.splice(toIndex, 0, id)
    }
    this._columnOrder = payload.order ? normalizeColumnOrder(payload.order, columns) : ids
    return {
      ...payload,
      columnId: payload.columnId || id || '',
      fromIndex,
      toIndex,
      order: [...this._columnOrder],
    }
  }

  /**
   * Обновляет значение состояния DataTableViewPipeline.
   */
  setColumnOrder(order: Array<string>, columns: Array<DataTableColumnInput<Row>>): Array<string> {
    this._columnOrder = normalizeColumnOrder(order, columns)
    return [...this._columnOrder]
  }

  /**
   * Сбрасывает состояние к базовым значениям DataTableViewPipeline.
   */
  resetColumnOrder(): void {
    this._columnOrder = []
  }

  /**
   * Сбрасывает состояние к базовым значениям DataTableViewPipeline.
   */
  reset(): void {
    this._sort = this._view.sorting ? [...this._view.sorting.initial] : []
    this._filters = this._view.filtering ? cloneFilters(this._view.filtering.initial) : []
    this._search = this._createSearchQuery('')
    this._searchMatches = []
    this._reindexSearchMatches()
    this._searchActiveIndex = -1
    this._searchTotalOverride = undefined
    this._searchLoading = false
    this._searchCursor = undefined
    this._searchPreviousCursor = undefined
    this._searchHasMore = false
    this._rowOrder = []
    this._columnOrder = this._view.columnOrdering ? [...this._view.columnOrdering.order] : []
    this._groupingGroupsOverride = null
    this._groupingExpanded = this._view.grouping ? cloneExpanded(this._view.grouping.expanded) : 'all'
    this._rebuild()
  }

  /**
   * Выполняет действие orderColumns в рамках ответственности DataTableViewPipeline.
   */
  orderColumns(columns: Array<DataTableColumnInput<Row>>): Array<DataTableColumnInput<Row>> {
    const order = this._columnOrder.length > 0 ? this._columnOrder : this._view.columnOrdering && this._view.columnOrdering.order
    if (!order || order.length === 0) {
      return columns
    }
    const rank = new Map(order.map((id, index) => [id, index]))
    return [...columns].sort((a, b) => {
      const aRank = rank.get(a.id) ?? Number.MAX_SAFE_INTEGER
      const bRank = rank.get(b.id) ?? Number.MAX_SAFE_INTEGER
      if (aRank !== bRank) {
        return aRank - bRank
      }
      return columns.indexOf(a) - columns.indexOf(b)
    })
  }

  /**
   * Выполняет действие isServerControlled в рамках ответственности DataTableViewPipeline.
   */
  isServerControlled(): boolean {
    return !!(this._view.sorting && this._view.sorting.controlled)
      || !!(this._view.filtering && this._view.filtering.controlled)
      || !!(this._view.search && this._view.search.controlled)
      || !!(this._view.grouping && this._view.grouping.controlled)
  }

  /**
   * Выполняет внутренний шаг rebuild для DataTableViewPipeline.
   */
  private _rebuild(): void {
    this._localSort = this._shouldApplyLocal(this._view.sorting ? this._view.sorting.mode : 'server')
    this._localFilter = this._shouldApplyLocal(this._view.filtering ? this._view.filtering.mode : 'server')
    this._localSearch = this._isSearchActive() && this._shouldApplyLocal(this._view.search ? this._view.search.mode : 'server')
    this._localGrouping = !!(this._view.grouping && this._view.grouping.enabled && this._view.grouping.groups.length > 0)
      && this._shouldApplyLocal(this._view.grouping.mode)

    const needsMaterializedRows = (this._localSort && this._sort.length > 0)
      || (this._localFilter && hasFilters(this._filters))
      || this._localSearch
      || this._localGrouping
      || this._rowOrder.length > 0
    if (!needsMaterializedRows) {
      this._passthrough = true
      this._groupNodes.clear()
      this._rows = []
      this._rebuildSearchMatches()
      return
    }

    this._passthrough = false
    const rows: Array<DataTableDataViewRow<Row>> = []
    for (let storeIndex = 0; storeIndex < this._store.rowCount; storeIndex += 1) {
      const row = this._store.getRowAt(storeIndex)
      if (!row) {
        continue
      }
      const rowId = this._store.getRowIdAt(storeIndex)
      rows.push({ kind: 'data', row, rowId, storeIndex, viewIndex: rows.length, depth: 0 })
    }

    const filtered = this._localFilter ? rows.filter(item => this._matchesFilters(item)) : rows
    const sorted = this._localSort && this._sort.length > 0 ? [...filtered].sort((a, b) => this._compareRows(a, b)) : filtered
    const ordered = this._applyManualOrder(sorted)
    const searched = this._localSearch && this._search.filter
      ? ordered.filter(item => this._matchSearchRow(item).length > 0)
      : ordered
    const grouped = this._localGrouping && this._view.grouping
      ? this._flattenGroupedRows(searched, this._view.grouping.groups as Array<DataTableGroupRule<Row>>)
      : searched
    this._rows = grouped.map((item, viewIndex) => ({ ...item, viewIndex }))
    this._rebuildSearchMatches()
  }

  /**
   * Выполняет внутренний шаг shouldApplyLocal для DataTableViewPipeline.
   */
  private _shouldApplyLocal(mode: DataTableViewMode): boolean {
    if (this._view.serverRowModel && this._view.serverRowModel.enabled && this._view.serverRowModel.authoritative) {
      return false
    }
    if (this._store.rowCount > this._maxClientRows) {
      return false
    }
    if (this._store.loadedRowCount < this._store.rowCount) {
      return false
    }
    if (mode === 'client') {
      return true
    }
    if (mode === 'server') {
      return false
    }
    return this._store.loadedRowCount >= this._store.rowCount
  }

  /**
   * Выполняет внутренний шаг matchesFilters для DataTableViewPipeline.
   */
  private _matchesFilters(item: DataTableDataViewRow<Row>): boolean {
    if (!item.row || item.rowId === undefined) {
      return false
    }
    return this._matchesFilterNode(this._filters, item)
  }

  /**
   * Выполняет внутренний шаг matchesFilterNode для DataTableViewPipeline.
   */
  private _matchesFilterNode(
    node: DataTableFilterState | DataTableFilterExpression | DataTableFilterRule,
    item: DataTableDataViewRow<Row>,
  ): boolean {
    if (Array.isArray(node)) {
      return node.every(rule => this._matchesFilterRule(rule, item))
    }
    if ('logic' in node) {
      return node.logic === 'or'
        ? node.rules.some(rule => this._matchesFilterNode(rule, item))
        : node.rules.every(rule => this._matchesFilterNode(rule, item))
    }
    return this._matchesFilterRule(node, item)
  }

  /**
   * Выполняет внутренний шаг matchesFilterRule для DataTableViewPipeline.
   */
  private _matchesFilterRule(rule: DataTableFilterRule, item: DataTableDataViewRow<Row>): boolean {
    if (!item.row || item.rowId === undefined) {
      return false
    }
    const column = this._columns.find(candidate => candidate.id === rule.columnId)
    if (!column) {
      return true
    }
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
    if (filter?.predicate) {
      return filter.predicate(context)
    }
    return defaultPredicate(rule.operator, value, rule.value)
  }

  /**
   * Выполняет внутренний шаг compareRows для DataTableViewPipeline.
   */
  private _compareRows(a: DataTableDataViewRow<Row>, b: DataTableDataViewRow<Row>): number {
    for (let index = 0; index < this._sort.length; index += 1) {
      const rule = this._sort[index]!
      const column = this._columns.find(item => item.id === rule.columnId)
      if (!column || !a.row || !b.row) {
        continue
      }
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
      if (compared !== 0) {
        return rule.direction === 'asc' ? compared : -compared
      }
    }
    return a.storeIndex - b.storeIndex
  }

  /**
   * Выполняет внутренний шаг isSearchActive для DataTableViewPipeline.
   */
  private _isSearchActive(): boolean {
    return this._search.text.trim().length > 0
  }

  /**
   * Создает runtime-сущность DataTableViewPipeline.
   */
  private _createSearchQuery(query: string | DataTableSearchQuery): DataTableSearchQuery {
    const raw = typeof query === 'string' ? { text: query } : query
    const options = this._view.search
    return {
      text: raw.text ?? '',
      scope: raw.scope ?? options?.scope ?? 'cells',
      match: raw.match ?? options?.match ?? 'contains',
      caseSensitive: raw.caseSensitive ?? options?.caseSensitive ?? false,
      columns: raw.columns ?? options?.columns ?? [],
      highlight: raw.highlight ?? options?.highlight ?? 'cell-text',
      filter: raw.filter ?? true,
      highlightColor: raw.highlightColor ?? options?.highlightColor ?? '#b45309',
      activeHighlightColor: raw.activeHighlightColor ?? options?.activeHighlightColor ?? '#be123c',
    }
  }

  /**
   * Выполняет внутренний шаг rebuildSearchMatches для DataTableViewPipeline.
   */
  private _rebuildSearchMatches(): void {
    if (!this._localSearch || !this._isSearchActive()) {
      this._searchMatches = []
      this._reindexSearchMatches()
      this._searchActiveIndex = -1
      this._searchTotalOverride = undefined
      this._searchLoading = false
      this._searchCursor = undefined
      this._searchPreviousCursor = undefined
      this._searchHasMore = false
      return
    }

    const sourceRows = this._passthrough
      ? Array.from({ length: this._store.rowCount }, (_item, viewIndex) => this.getViewRowAt(viewIndex)!)
      : this._rows
    const matches: Array<DataTableSearchMatch> = []
    for (const viewRow of sourceRows) {
      if (!viewRow || viewRow.kind !== 'data' || !viewRow.row) {
        continue
      }
      matches.push(...this._matchSearchRow(viewRow))
    }
    this._searchMatches = matches
    this._reindexSearchMatches()
    this._searchTotalOverride = undefined
    this._searchLoading = false
    this._searchCursor = undefined
    this._searchPreviousCursor = undefined
    this._searchHasMore = false
    if (matches.length === 0) {
      this._searchActiveIndex = -1
    }
    else if (this._searchActiveIndex < 0) {
      this._searchActiveIndex = 0
    }
    else { this._searchActiveIndex = Math.min(this._searchActiveIndex, matches.length - 1) }
  }

  /**
   * Перестраивает компактные lookup-карты для проверки подсветки поиска во время render.
   */
  private _reindexSearchMatches(): void {
    this._searchMatchByCell.clear()
    this._searchMatchByRow.clear()

    for (let index = 0; index < this._searchMatches.length; index += 1) {
      const match = this._searchMatches[index]!
      const entry = { match, index }
      const rowKey = createSearchRowKey(match.rowId)
      if (!this._searchMatchByRow.has(rowKey)) {
        this._searchMatchByRow.set(rowKey, entry)
      }
      if (match.columnId === undefined) {
        continue
      }
      const cellKey = createSearchCellKey(match.rowId, match.columnId)
      if (!this._searchMatchByCell.has(cellKey)) {
        this._searchMatchByCell.set(cellKey, entry)
      }
    }
  }

  /**
   * Выполняет внутренний шаг matchSearchRow для DataTableViewPipeline.
   */
  private _matchSearchRow(viewRow: DataTableDataViewRow<Row>): Array<DataTableSearchMatch> {
    const row = viewRow.row
    if (!row) {
      return []
    }
    const searchableColumns = this._resolveSearchableColumns()
    const matches: Array<DataTableSearchMatch> = []
    if (this._search.scope === 'rows') {
      const value = searchableColumns
        .map(column => String(resolveDataTableValue(row, viewRow.storeIndex, column) ?? ''))
        .join(' ')
      const ranges = findSearchRanges(value, this._search)
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
      const ranges = findSearchRanges(value, this._search)
      if (ranges.length === 0) {
        continue
      }
      matches.push({
        rowId: viewRow.rowId,
        rowIndex: viewRow.viewIndex,
        storeIndex: viewRow.storeIndex,
        columnId: column.id,
        columnIndex: this._columns.indexOf(column),
        value,
        ranges,
      })
    }
    return matches
  }

  /**
   * Нормализует и возвращает итоговое значение DataTableViewPipeline.
   */
  private _resolveSearchableColumns(): Array<DataTableResolvedColumn<Row>> {
    const ids = this._search.columns ?? []
    if (ids.length === 0) {
      return this._columns
    }
    const allowed = new Set(ids)
    return this._columns.filter(column => allowed.has(column.id))
  }

  /**
   * Применяет подготовленное состояние DataTableViewPipeline.
   */
  private _applyManualOrder(rows: Array<DataTableDataViewRow<Row>>): Array<DataTableDataViewRow<Row>> {
    if (this._rowOrder.length === 0) {
      return rows
    }
    const byId = new Map(rows.map(row => [row.rowId, row]))
    const ordered: Array<DataTableDataViewRow<Row>> = []
    const used = new Set<DataTableRowId>()
    for (const id of this._rowOrder) {
      const row = byId.get(id)
      if (!row) {
        continue
      }
      ordered.push(row)
      used.add(id)
    }
    for (const row of rows) {
      if (row.rowId === undefined || !used.has(row.rowId)) {
        ordered.push(row)
      }
    }
    return ordered
  }

  /**
   * Выполняет внутренний шаг flattenGroupedRows для DataTableViewPipeline.
   */
  private _flattenGroupedRows(
    rows: Array<DataTableDataViewRow<Row>>,
    rules: Array<DataTableGroupRule<Row>>,
  ): Array<DataTableViewRow<Row>> {
    this._groupNodes.clear()
    const grouped = this._buildGroupNodes(rows, rules, 0, undefined)
    const flattened: Array<DataTableViewRow<Row>> = []
    const showGroupRows = this._view.grouping ? this._view.grouping.showGroupRows : true
    const showGroupFooters = this._view.grouping ? this._view.grouping.showGroupFooters : false
    for (const group of grouped) {
      this._appendGroupRows(group, flattened, showGroupRows, showGroupFooters)
    }

    const showGrandFooter = this._view.grouping
      && this._view.grouping.showGrandFooter
      && (this._view.grouping.footerPlacement === 'scroll' || this._view.grouping.footerPlacement === 'both')
    if (showGrandFooter) {
      const materializedRows = rows.map(item => item.row).filter((row): row is Row => !!row)
      flattened.push({
        kind: 'grand-footer',
        rowId: '__grand-footer__',
        storeIndex: -1,
        viewIndex: flattened.length,
        depth: 0,
        aggregate: this._computeAggregate(materializedRows, rules),
        rows: materializedRows,
      })
    }
    return flattened
  }

  /**
   * Собирает runtime-структуру DataTableViewPipeline.
   */
  private _buildGroupNodes(
    rows: Array<DataTableDataViewRow<Row>>,
    rules: Array<DataTableGroupRule<Row>>,
    depth: number,
    parentId: string | undefined,
  ): Array<DataTableGroupNode<Row>> {
    const rule = rules[depth]
    if (!rule) {
      return []
    }

    const buckets = new Map<string, { key: unknown, label: string, rows: Array<DataTableDataViewRow<Row>> }>()
    for (const row of rows) {
      if (!row.row) {
        continue
      }
      const key = this._resolveGroupKey(rule, row.row, row.storeIndex)
      const label = formatGroupLabel(key)
      const bucketId = String(label)
      const bucket = buckets.get(bucketId)
      if (bucket) {
        bucket.rows.push(row)
      }
      else { buckets.set(bucketId, { key, label, rows: [row] }) }
    }

    const groups = [...buckets.values()].map((bucket) => {
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
        aggregate: this._computeAggregate(groupRows, [rule]),
        expanded: this._isGroupExpanded(groupId),
        children: [],
      }
      const childGroups = this._buildGroupNodes(bucket.rows, rules, depth + 1, groupId)
      node.children = childGroups.length > 0 ? childGroups : bucket.rows.map(row => ({ ...row, depth: depth + 1 }))
      this._groupNodes.set(groupId, node)
      return node
    })

    return this._sortGroups(groups, rule)
  }

  /**
   * Добавляет сущность в runtime-коллекцию DataTableViewPipeline.
   */
  private _appendGroupRows(
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
      if (showGroupFooters && this._view.groupingPinnedRows && this._view.groupingPinnedRows.placement === 'group-start') {
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
        if ('kind' in child && child.kind === 'data') {
          target.push({ ...child, viewIndex: target.length })
        }
        else { this._appendGroupRows(child as DataTableGroupNode<Row>, target, showGroupRows, showGroupFooters) }
      }
      if (showGroupFooters && (!this._view.groupingPinnedRows || this._view.groupingPinnedRows.placement !== 'group-start')) {
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
  private _resolveGroupKey(rule: DataTableGroupRule<Row>, row: Row, index: number): unknown {
    if (rule.value) {
      return rule.value(row, index)
    }
    if (rule.field) {
      return row[rule.field as keyof Row]
    }
    return row[rule.id]
  }

  /**
   * Выполняет внутренний шаг sortGroups для DataTableViewPipeline.
   */
  private _sortGroups(groups: Array<DataTableGroupNode<Row>>, rule: DataTableGroupRule<Row>): Array<DataTableGroupNode<Row>> {
    if (!rule.sort) {
      return groups
    }
    const sorted = [...groups]
    if (typeof rule.sort === 'function') {
      return sorted.sort(rule.sort)
    }
    return sorted.sort((a, b) => rule.sort === 'asc'
      ? compareValues(a.label, b.label)
      : compareValues(b.label, a.label))
  }

  /**
   * Вычисляет производное значение DataTableViewPipeline.
   */
  private _computeAggregate(rows: Array<Row>, rules: Array<DataTableGroupRule<Row>>): Record<string, unknown> {
    const aggregate: Record<string, unknown> = { count: rows.length }
    for (const rule of rules) {
      for (const [key, aggregator] of Object.entries(rule.aggregates ?? {})) {
        aggregate[key] = this._resolveAggregate(rows, key, aggregator, rule)
      }
    }
    return aggregate
  }

  /**
   * Нормализует и возвращает итоговое значение DataTableViewPipeline.
   */
  private _resolveAggregate(
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
    if (typeof aggregator === 'function') {
      return aggregator(rows, context)
    }
    if (aggregator === 'count') {
      return rows.length
    }

    const values = rows.map(row => Number(row[key])).filter(Number.isFinite)
    if (values.length === 0) {
      return 0
    }
    if (aggregator === 'sum') {
      return values.reduce((sum, value) => sum + value, 0)
    }
    if (aggregator === 'avg') {
      return values.reduce((sum, value) => sum + value, 0) / values.length
    }
    if (aggregator === 'min') {
      return Math.min(...values)
    }
    if (aggregator === 'max') {
      return Math.max(...values)
    }
    return undefined
  }

  /**
   * Выполняет внутренний шаг isGroupExpanded для DataTableViewPipeline.
   */
  private _isGroupExpanded(groupId: string): boolean {
    if (this._groupingExpanded === 'all') {
      return true
    }
    if (this._groupingExpanded === 'none') {
      return false
    }
    return this._groupingExpanded.includes(groupId)
  }

  /**
   * Обновляет значение состояния DataTableViewPipeline.
   */
  private _setGroupExpanded(groupId: string, expanded: boolean): void {
    const allGroupIds = [...this._groupNodes.keys()]
    if (this._groupingExpanded === 'all') {
      if (expanded) {
        return
      }
      this._groupingExpanded = allGroupIds.filter(id => id !== groupId)
    }
    else if (this._groupingExpanded === 'none') {
      this._groupingExpanded = expanded ? [groupId] : []
    }
    else {
      const set = new Set(this._groupingExpanded)
      if (expanded) {
        set.add(groupId)
      }
      else { set.delete(groupId) }
      this._groupingExpanded = [...set]
    }
    this._rebuild()
  }
}

function compareValues(a: unknown, b: unknown, nulls: 'first' | 'last' = 'last'): number {
  if (a === b) {
    return 0
  }
  if (a === undefined || a === null) {
    return nulls === 'first' ? -1 : 1
  }
  if (b === undefined || b === null) {
    return nulls === 'first' ? 1 : -1
  }
  if (typeof a === 'number' && typeof b === 'number') {
    return a - b
  }
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })
}

function defaultPredicate(operator: DataTableFilterOperator, value: unknown, filterValue: unknown): boolean {
  const text = String(value ?? '').toLowerCase()
  const filterText = String(filterValue ?? '').toLowerCase()
  if (operator === 'contains') {
    return text.includes(filterText)
  }
  if (operator === 'startsWith') {
    return text.startsWith(filterText)
  }
  if (operator === 'endsWith') {
    return text.endsWith(filterText)
  }
  if (operator === 'equals' || operator === 'is') {
    return value === filterValue || text === filterText
  }
  if (operator === 'isNot') {
    return value !== filterValue && text !== filterText
  }
  if (operator === 'in') {
    return Array.isArray(filterValue) ? filterValue.includes(value) : false
  }
  if (operator === 'notIn') {
    return Array.isArray(filterValue) ? !filterValue.includes(value) : true
  }
  const number = Number(value)
  if (!Number.isFinite(number)) {
    return false
  }
  if (operator === 'gt') {
    return number > Number(filterValue)
  }
  if (operator === 'gte') {
    return number >= Number(filterValue)
  }
  if (operator === 'lt') {
    return number < Number(filterValue)
  }
  if (operator === 'lte') {
    return number <= Number(filterValue)
  }
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
    if (!columnSet.has(id) || seen.has(id)) {
      continue
    }
    seen.add(id)
    next.push(id)
  }

  for (const id of columnIds) {
    if (seen.has(id)) {
      continue
    }
    next.push(id)
  }

  return next
}

function cloneFilters(filters: DataTableFilterState | DataTableFilterExpression): DataTableFilterState | DataTableFilterExpression {
  if (Array.isArray(filters)) {
    return filters.map(rule => ({ ...rule }))
  }
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
  if (Array.isArray(filters)) {
    return filters.filter(rule => rule.columnId !== columnId).map(rule => ({ ...rule }))
  }

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
  if (!('logic' in rule)) {
    return rule.columnId === columnId ? null : { ...rule }
  }

  const rules = rule.rules
    .map(child => removeFilterNode(child, columnId))
    .filter((child): child is DataTableFilterRule | DataTableFilterExpression => child !== null)
  return rules.length === 0 ? null : { logic: rule.logic, rules }
}

function _flattenFilterRules(filters: DataTableFilterState | DataTableFilterExpression): DataTableFilterState {
  if (Array.isArray(filters)) {
    return filters.map(rule => ({ ...rule }))
  }
  return filters.rules.flatMap(rule => 'logic' in rule ? _flattenFilterRules(rule) : [{ ...rule }])
}

function hasFilters(filters: DataTableFilterState | DataTableFilterExpression): boolean {
  if (Array.isArray(filters)) {
    return filters.length > 0
  }
  return filters.rules.length > 0
}

function createSearchRowKey(rowId: DataTableRowId): string {
  return `${typeof rowId}:${String(rowId)}`
}

function createSearchCellKey(rowId: DataTableRowId, columnId: string): string {
  return `${createSearchRowKey(rowId)}\u0000${columnId}`
}

function findSearchRanges(value: string, query: DataTableSearchQuery): Array<{ start: number, end: number }> {
  const needle = query.text
  if (!needle) {
    return []
  }

  const source = query.caseSensitive ? value : value.toLowerCase()
  const target = query.caseSensitive ? needle : needle.toLowerCase()
  const ranges: Array<{ start: number, end: number }> = []

  if (query.match === 'regex') {
    try {
      const flags = query.caseSensitive ? 'g' : 'gi'
      const regex = new RegExp(needle, flags)
      for (const match of source.matchAll(regex)) {
        const start = match.index ?? -1
        const text = match[0] ?? ''
        if (start >= 0 && text.length > 0) {
          ranges.push({ start, end: start + text.length })
        }
      }
    }
    catch {
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
    if (index < 0) {
      break
    }
    ranges.push({ start: index, end: index + needle.length })
    cursor = index + Math.max(1, needle.length)
  }
  return ranges
}

function formatGroupLabel(value: unknown): string {
  if (value === undefined || value === null || value === '') {
    return 'Empty'
  }
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
