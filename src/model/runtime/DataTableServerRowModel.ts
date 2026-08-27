import type {
  DataTableDelta,
  DataTableQueryState,
  DataTableRange,
  DataTableRowId,
  DataTableSearchDirection,
  DataTableSearchQuery,
  DataTableSearchResult,
  DataTableStoreApi,
  DataTableSummaryState,
} from '@/model/types/datatable.types'

export interface DataTableServerRowModelSnapshot {
  query: DataTableQueryState | null
  revision: number
  requestId: number
  summary: DataTableSummaryState | null
  subscribed: boolean
  loading: boolean
  error: string | null
  staleResponsesIgnored: number
  cacheHitRate: number
}

/**
 * Координирует lazy/server-side запросы, summary и SSE deltas без материализации view.
 */
export class DataTableServerRowModel<Row extends Record<string, any> = Record<string, any>> {
  private _query: DataTableQueryState | null = null
  private _querySignature = ''
  private _revision = 0
  private _requestId = 0
  private _summaryRequestId = 0
  private _summary: DataTableSummaryState | null = null
  private _unsubscribe: (() => void) | void
  private _abortController: AbortController | null = null
  private _loading = false
  private _error: string | null = null
  private _staleResponsesIgnored = 0
  private _cacheHits = 0
  private _cacheMisses = 0

  constructor(
    private readonly _store: DataTableStoreApi<Row>,
    private readonly _emitDelta: (delta: DataTableDelta<Row> | Array<DataTableDelta<Row>>) => void,
  ) {}

  /**
   * Обновляет query и возвращает true, если server-side состояние изменилось.
   */
  sync(query: DataTableQueryState, options: { subscribe: boolean }): boolean {
    const signature = JSON.stringify(query)
    const queryChanged = signature !== this._querySignature
    const subscribeChanged = options.subscribe !== !!this._unsubscribe
    if (!queryChanged && !subscribeChanged) {
      return false
    }

    if (!queryChanged) {
      this._syncSubscription(options.subscribe)
      return false
    }

    this._query = cloneQuery(query)
    this._querySignature = signature
    this._revision += 1
    this._summary = null
    this._abortController?.abort()
    this._abortController = null
    this._syncSubscription(options.subscribe)
    return true
  }

  /**
   * Загружает range с защитой от устаревших ответов.
   */
  async ensureRange(range: DataTableRange): Promise<boolean> {
    const query = this._query
    if (!query) {
      return false
    }
    const revision = this._revision
    const requestId = ++this._requestId
    const abortController = typeof AbortController !== 'undefined' ? new AbortController() : null
    this._abortController = abortController
    this._loading = true
    this._error = null
    try {
      await this._store.ensureRange(range, query, {
        revision,
        requestId,
        signal: abortController?.signal,
      })
      const fresh = revision === this._revision && !abortController?.signal.aborted
      if (!fresh) {
        this._staleResponsesIgnored += 1
      }
      else { this._cacheMisses += 1 }
      return fresh
    }
    catch (error) {
      this._error = error instanceof Error ? error.message : 'Range request failed'
      throw error
    }
    finally {
      if (this._abortController === abortController) {
        this._abortController = null
      }
      if (revision === this._revision) {
        this._loading = false
      }
    }
  }

  /**
   * Загружает server-side summary для текущего query.
   */
  async loadSummary(): Promise<DataTableSummaryState | null> {
    const query = this._query
    if (!query) {
      return null
    }
    const revision = this._revision
    const requestId = ++this._summaryRequestId
    const loadingState = {
      values: this._summary?.values ?? {},
      rowCount: this._store.rowCount,
      revision,
      source: 'server' as const,
      loading: true,
    }
    this._summary = loadingState
    const values = await this._store.loadSummary(query)
    if (revision !== this._revision || requestId !== this._summaryRequestId) {
      return this._summary
    }
    this._summary = {
      values: values ?? {},
      rowCount: this._store.rowCount,
      revision,
      source: 'server',
      loading: false,
    }
    return this._summary
  }

  /**
   * Загружает distinct filter values через server-side adapter.
   */
  async loadFilterValues(columnId: string, cursor?: string): Promise<{ values: Array<unknown>, cursor?: string, hasMore?: boolean } | undefined> {
    return this._store.loadFilterValues(columnId, this._query ?? undefined, cursor)
  }

  /**
   * Делегирует поиск source adapter с текущим query.
   */
  search(
    search: DataTableSearchQuery,
    cursor?: string,
    direction: DataTableSearchDirection = 'next',
  ): Promise<DataTableSearchResult | undefined> {
    return this._store.searchSource(search, this._query ?? undefined, cursor, direction)
  }

  /**
   * Делегирует lookup rowId -> view index текущему server-side adapter.
   */
  resolveRowIndex(rowId: DataTableRowId): Promise<number | undefined> {
    return this._store.resolveSourceRowIndex(rowId, this._query ?? undefined)
  }

  /**
   * Возвращает текущий снимок server-side состояния.
   */
  snapshot(): DataTableServerRowModelSnapshot {
    return {
      query: this._query ? cloneQuery(this._query) : null,
      revision: this._revision,
      requestId: this._requestId,
      summary: this._summary ? { ...this._summary, values: { ...this._summary.values } } : null,
      subscribed: !!this._unsubscribe,
      loading: this._loading,
      error: this._error,
      staleResponsesIgnored: this._staleResponsesIgnored,
      cacheHitRate: this._cacheHits + this._cacheMisses === 0 ? 0 : this._cacheHits / (this._cacheHits + this._cacheMisses),
    }
  }

  /**
   * Освобождает активную server-side подписку.
   */
  dispose(): void {
    this._unsubscribe?.()
    this._abortController?.abort()
    this._unsubscribe = undefined
    this._abortController = null
    this._query = null
    this._querySignature = ''
    this._summary = null
  }

  /**
   * Синхронизирует source.subscribe с текущим query.
   */
  private _syncSubscription(enabled: boolean): void {
    this._unsubscribe?.()
    this._unsubscribe = undefined
    if (!enabled || !this._query) {
      return
    }
    this._unsubscribe = this._store.subscribe(this._query, this._emitDelta)
  }
}

function cloneQuery(query: DataTableQueryState): DataTableQueryState {
  return {
    sort: query.sort.map(rule => ({ ...rule })),
    filters: Array.isArray(query.filters)
      ? query.filters.map(rule => ({ ...rule }))
      : cloneFilterExpression(query.filters),
    search: query.search ? { ...query.search, columns: [...(query.search.columns ?? [])] } : undefined,
    rowOrder: [...query.rowOrder],
    columnOrder: [...query.columnOrder],
    grouping: query.grouping
      ? {
          ...query.grouping,
          groups: [...query.grouping.groups],
          expanded: Array.isArray(query.grouping.expanded) ? [...query.grouping.expanded] : query.grouping.expanded,
        }
      : undefined,
  }
}

function cloneFilterExpression<T extends DataTableQueryState['filters']>(filters: T): T {
  if (Array.isArray(filters)) {
    return filters.map(rule => ({ ...rule })) as T
  }
  return {
    logic: filters.logic,
    rules: filters.rules.map(rule => ('logic' in rule ? cloneFilterExpression(rule) : { ...rule })),
  } as T
}
