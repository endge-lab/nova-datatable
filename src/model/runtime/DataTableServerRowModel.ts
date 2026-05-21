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
}

/**
 * Координирует lazy/server-side запросы, summary и SSE deltas без материализации view.
 */
export class DataTableServerRowModel<Row extends Record<string, any> = Record<string, any>> {
  private query: DataTableQueryState | null = null
  private querySignature = ''
  private revision = 0
  private requestId = 0
  private summaryRequestId = 0
  private summary: DataTableSummaryState | null = null
  private unsubscribe: (() => void) | void
  private abortController: AbortController | null = null

  constructor(
    private readonly store: DataTableStoreApi<Row>,
    private readonly emitDelta: (delta: DataTableDelta<Row> | Array<DataTableDelta<Row>>) => void,
  ) {}

  /**
   * Обновляет query и возвращает true, если server-side состояние изменилось.
   */
  sync(query: DataTableQueryState, options: { subscribe: boolean }): boolean {
    const signature = JSON.stringify(query)
    const queryChanged = signature !== this.querySignature
    const subscribeChanged = options.subscribe !== !!this.unsubscribe
    if (!queryChanged && !subscribeChanged) return false

    if (!queryChanged) {
      this.syncSubscription(options.subscribe)
      return false
    }

    this.query = cloneQuery(query)
    this.querySignature = signature
    this.revision += 1
    this.summary = null
    this.abortController?.abort()
    this.abortController = null
    this.syncSubscription(options.subscribe)
    return true
  }

  /**
   * Загружает range с защитой от устаревших ответов.
   */
  async ensureRange(range: DataTableRange): Promise<boolean> {
    const query = this.query
    if (!query) return false
    const revision = this.revision
    const requestId = ++this.requestId
    const abortController = typeof AbortController !== 'undefined' ? new AbortController() : null
    this.abortController = abortController
    try {
      await this.store.ensureRange(range, query, {
        revision,
        requestId,
        signal: abortController?.signal,
      })
      return revision === this.revision && !abortController?.signal.aborted
    } finally {
      if (this.abortController === abortController) this.abortController = null
    }
  }

  /**
   * Загружает server-side summary для текущего query.
   */
  async loadSummary(): Promise<DataTableSummaryState | null> {
    const query = this.query
    if (!query) return null
    const revision = this.revision
    const requestId = ++this.summaryRequestId
    const loadingState = {
      values: this.summary?.values ?? {},
      rowCount: this.store.rowCount,
      revision,
      source: 'server' as const,
      loading: true,
    }
    this.summary = loadingState
    const values = await this.store.loadSummary(query)
    if (revision !== this.revision || requestId !== this.summaryRequestId) return this.summary
    this.summary = {
      values: values ?? {},
      rowCount: this.store.rowCount,
      revision,
      source: 'server',
      loading: false,
    }
    return this.summary
  }

  /**
   * Делегирует поиск source adapter с текущим query.
   */
  search(
    search: DataTableSearchQuery,
    cursor?: string,
    direction: DataTableSearchDirection = 'next',
  ): Promise<DataTableSearchResult | undefined> {
    return this.store.searchSource(search, this.query ?? undefined, cursor, direction)
  }

  /**
   * Делегирует lookup rowId -> view index текущему server-side adapter.
   */
  resolveRowIndex(rowId: DataTableRowId): Promise<number | undefined> {
    return this.store.resolveSourceRowIndex(rowId, this.query ?? undefined)
  }

  /**
   * Возвращает текущий снимок server-side состояния.
   */
  snapshot(): DataTableServerRowModelSnapshot {
    return {
      query: this.query ? cloneQuery(this.query) : null,
      revision: this.revision,
      requestId: this.requestId,
      summary: this.summary ? { ...this.summary, values: { ...this.summary.values } } : null,
      subscribed: !!this.unsubscribe,
    }
  }

  /**
   * Освобождает активную server-side подписку.
   */
  dispose(): void {
    this.unsubscribe?.()
    this.abortController?.abort()
    this.unsubscribe = undefined
    this.abortController = null
    this.query = null
    this.querySignature = ''
    this.summary = null
  }

  /**
   * Синхронизирует source.subscribe с текущим query.
   */
  private syncSubscription(enabled: boolean): void {
    this.unsubscribe?.()
    this.unsubscribe = undefined
    if (!enabled || !this.query) return
    this.unsubscribe = this.store.subscribe(this.query, this.emitDelta)
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
  if (Array.isArray(filters)) return filters.map(rule => ({ ...rule })) as T
  return {
    logic: filters.logic,
    rules: filters.rules.map(rule => ('logic' in rule ? cloneFilterExpression(rule) : { ...rule })),
  } as T
}
