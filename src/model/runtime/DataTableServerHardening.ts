export type DataTableServerHardeningRequestKind = 'range' | 'summary' | 'search' | 'resolve' | 'custom'

export interface DataTableServerHardeningRetryOptions {
  retries?: number
  delayMs?: number
  maxDelayMs?: number
  shouldRetry?: (error: unknown, attempt: number) => boolean
}

export interface DataTableServerHardeningCacheOptions {
  ttlMs?: number
  maxEntries?: number
}

export interface DataTableServerHardeningOptions {
  retry?: DataTableServerHardeningRetryOptions
  cache?: false | DataTableServerHardeningCacheOptions
  now?: () => number
  delay?: (delayMs: number) => Promise<void>
}

export interface DataTableServerHardeningRunOptions<T> {
  cacheKey?: string
  cacheTtlMs?: number
  force?: boolean
  abortPrevious?: boolean
  retry?: DataTableServerHardeningRetryOptions
  cacheValue?: (value: T) => boolean
}

export interface DataTableServerHardeningRequestToken {
  kind: DataTableServerHardeningRequestKind
  revision: number
  requestId: number
  cacheKey?: string
  signal?: AbortSignal
}

export interface DataTableServerHardeningMetrics {
  started: number
  resolved: number
  failed: number
  retried: number
  stale: number
  aborted: number
  cacheHits: number
  cacheMisses: number
  cacheSets: number
  cacheEvictions: number
  inFlight: number
  averageLatencyMs: number
}

export type DataTableServerHardeningResult<T> =
  | {
      status: 'success'
      value: T
      token: DataTableServerHardeningRequestToken
      attempts: number
      fromCache: boolean
    }
  | {
      status: 'stale'
      token: DataTableServerHardeningRequestToken
      attempts: number
      fromCache: false
    }
  | {
      status: 'error'
      error: unknown
      token: DataTableServerHardeningRequestToken
      attempts: number
      fromCache: false
    }

interface DataTableServerCacheEntry<T> {
  value: T
  createdAt: number
  expiresAt: number
  hits: number
}

/**
 * Защищает server datasource запросы retry-логикой, stale guard и измеримым cache state.
 */
export class DataTableServerHardening {
  private readonly now: () => number
  private readonly delay: (delayMs: number) => Promise<void>
  private readonly retry: Required<Omit<DataTableServerHardeningRetryOptions, 'shouldRetry'>> & {
    shouldRetry?: DataTableServerHardeningRetryOptions['shouldRetry']
  }
  private readonly cacheOptions: Required<DataTableServerHardeningCacheOptions> | false
  private readonly cache = new Map<string, DataTableServerCacheEntry<unknown>>()
  private readonly activeByKind = new Map<DataTableServerHardeningRequestKind, number>()
  private readonly controllersByKind = new Map<DataTableServerHardeningRequestKind, AbortController>()
  private revision = 0
  private requestId = 0
  private totalLatencyMs = 0
  private latencySamples = 0
  private metricsState: DataTableServerHardeningMetrics = {
    started: 0,
    resolved: 0,
    failed: 0,
    retried: 0,
    stale: 0,
    aborted: 0,
    cacheHits: 0,
    cacheMisses: 0,
    cacheSets: 0,
    cacheEvictions: 0,
    inFlight: 0,
    averageLatencyMs: 0,
  }

  /**
   * Создает hardening runtime для server datasource adapter.
   */
  constructor(options: DataTableServerHardeningOptions = {}) {
    this.now = options.now ?? (() => Date.now())
    this.delay = options.delay ?? (delayMs => delayMs > 0
      ? new Promise(resolve => setTimeout(resolve, delayMs))
      : Promise.resolve())
    this.retry = {
      retries: Math.max(0, Math.floor(options.retry?.retries ?? 0)),
      delayMs: Math.max(0, Math.floor(options.retry?.delayMs ?? 0)),
      maxDelayMs: Math.max(0, Math.floor(options.retry?.maxDelayMs ?? options.retry?.delayMs ?? 0)),
      shouldRetry: options.retry?.shouldRetry,
    }
    this.cacheOptions = options.cache === false
      ? false
      : {
          ttlMs: Math.max(0, Math.floor(options.cache?.ttlMs ?? 0)),
          maxEntries: Math.max(1, Math.floor(options.cache?.maxEntries ?? 128)),
        }
  }

  /**
   * Возвращает текущую server revision.
   */
  get currentRevision(): number {
    return this.revision
  }

  /**
   * Создает новый request token и помечает предыдущий запрос kind устаревшим.
   */
  begin(kind: DataTableServerHardeningRequestKind, cacheKey?: string, abortPrevious = true): DataTableServerHardeningRequestToken {
    if (abortPrevious) this.abortKind(kind)
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : undefined
    const token = {
      kind,
      revision: this.revision,
      requestId: ++this.requestId,
      cacheKey,
      signal: controller?.signal,
    }
    this.activeByKind.set(kind, token.requestId)
    if (controller) this.controllersByKind.set(kind, controller)
    return token
  }

  /**
   * Выполняет latest-only операцию с retry, stale guard и optional cache.
   */
  async runLatest<T>(
    kind: DataTableServerHardeningRequestKind,
    operation: (token: DataTableServerHardeningRequestToken) => Promise<T> | T,
    options: DataTableServerHardeningRunOptions<T> = {},
  ): Promise<DataTableServerHardeningResult<T>> {
    const cached = options.cacheKey !== undefined && !options.force
      ? this.readCache<T>(options.cacheKey)
      : { hit: false as const }
    if (cached.hit) {
      return {
        status: 'success',
        value: cached.value as T,
        token: this.createCacheToken(kind, options.cacheKey),
        attempts: 0,
        fromCache: true,
      }
    }

    const token = this.begin(kind, options.cacheKey, options.abortPrevious ?? true)
    const startedAt = this.now()
    const retry = this.resolveRetry(options.retry)
    let attempts = 0
    this.metricsState.started += 1
    this.metricsState.inFlight += 1

    try {
      while (attempts <= retry.retries) {
        attempts += 1
        try {
          const value = await operation(token)
          if (this.isStale(token)) {
            this.metricsState.stale += 1
            return { status: 'stale', token, attempts, fromCache: false }
          }
          this.metricsState.resolved += 1
          this.recordLatency(this.now() - startedAt)
          if (options.cacheKey && (options.cacheValue?.(value) ?? true)) {
            this.writeCache(options.cacheKey, value, options.cacheTtlMs)
          }
          return { status: 'success', value, token, attempts, fromCache: false }
        } catch (error) {
          if (this.isStale(token)) {
            this.metricsState.stale += 1
            return { status: 'stale', token, attempts, fromCache: false }
          }
          if (token.signal?.aborted) {
            this.metricsState.aborted += 1
            return { status: 'stale', token, attempts, fromCache: false }
          }
          if (attempts <= retry.retries && this.shouldRetry(error, attempts, retry)) {
            this.metricsState.retried += 1
            await this.delay(resolveRetryDelay(retry, attempts))
            continue
          }
          this.metricsState.failed += 1
          this.recordLatency(this.now() - startedAt)
          return { status: 'error', error, token, attempts, fromCache: false }
        }
      }
    } finally {
      this.metricsState.inFlight = Math.max(0, this.metricsState.inFlight - 1)
      if (this.activeByKind.get(kind) === token.requestId) {
        this.controllersByKind.delete(kind)
      }
    }

    this.metricsState.failed += 1
    return { status: 'error', error: new Error('DataTable server hardening exhausted retries'), token, attempts, fromCache: false }
  }

  /**
   * Увеличивает revision и помечает активные запросы устаревшими.
   */
  bumpRevision(): number {
    this.revision += 1
    for (const controller of this.controllersByKind.values()) controller.abort()
    this.controllersByKind.clear()
    this.activeByKind.clear()
    return this.revision
  }

  /**
   * Проверяет, устарел ли request token.
   */
  isStale(token: DataTableServerHardeningRequestToken): boolean {
    return token.revision !== this.revision
      || this.activeByKind.get(token.kind) !== token.requestId
      || !!token.signal?.aborted
  }

  /**
   * Очищает cache и возвращает количество удаленных записей.
   */
  clearCache(): number {
    const size = this.cache.size
    this.cache.clear()
    return size
  }

  /**
   * Возвращает снимок метрик hardening runtime.
   */
  metrics(): DataTableServerHardeningMetrics {
    return { ...this.metricsState }
  }

  /**
   * Отменяет активный запрос конкретного kind.
   */
  private abortKind(kind: DataTableServerHardeningRequestKind): void {
    const controller = this.controllersByKind.get(kind)
    if (!controller) return
    controller.abort()
    this.controllersByKind.delete(kind)
    this.activeByKind.delete(kind)
    this.metricsState.aborted += 1
  }

  /**
   * Создает token для cache hit без регистрации active request.
   */
  private createCacheToken(kind: DataTableServerHardeningRequestKind, cacheKey?: string): DataTableServerHardeningRequestToken {
    return {
      kind,
      revision: this.revision,
      requestId: this.requestId,
      cacheKey,
    }
  }

  /**
   * Читает cache entry с учетом TTL и eviction stale entries.
   */
  private readCache<T>(cacheKey: string): { hit: true; value: T } | { hit: false; value?: undefined } {
    if (!this.cacheOptions) return { hit: false }
    this.evictExpired()
    const entry = this.cache.get(cacheKey) as DataTableServerCacheEntry<T> | undefined
    if (!entry) {
      this.metricsState.cacheMisses += 1
      return { hit: false }
    }
    entry.hits += 1
    this.metricsState.cacheHits += 1
    return { hit: true, value: entry.value }
  }

  /**
   * Записывает успешный result в cache.
   */
  private writeCache<T>(cacheKey: string, value: T, ttlMs: number | undefined): void {
    if (!this.cacheOptions) return
    const ttl = Math.max(0, Math.floor(ttlMs ?? this.cacheOptions.ttlMs))
    const createdAt = this.now()
    this.cache.set(cacheKey, {
      value,
      createdAt,
      expiresAt: ttl > 0 ? createdAt + ttl : Number.POSITIVE_INFINITY,
      hits: 0,
    })
    this.metricsState.cacheSets += 1
    this.evictOverflow()
  }

  /**
   * Удаляет просроченные cache entries.
   */
  private evictExpired(): void {
    const now = this.now()
    for (const [key, entry] of this.cache) {
      if (entry.expiresAt > now) continue
      this.cache.delete(key)
      this.metricsState.cacheEvictions += 1
    }
  }

  /**
   * Ограничивает размер cache самым старым entry.
   */
  private evictOverflow(): void {
    if (!this.cacheOptions) return
    while (this.cache.size > this.cacheOptions.maxEntries) {
      const oldest = [...this.cache.entries()]
        .sort((left, right) => left[1].createdAt - right[1].createdAt)[0]
      if (!oldest) return
      this.cache.delete(oldest[0])
      this.metricsState.cacheEvictions += 1
    }
  }

  /**
   * Объединяет default и per-request retry options.
   */
  private resolveRetry(options: DataTableServerHardeningRetryOptions | undefined): Required<Omit<DataTableServerHardeningRetryOptions, 'shouldRetry'>> & {
    shouldRetry?: DataTableServerHardeningRetryOptions['shouldRetry']
  } {
    return {
      retries: Math.max(0, Math.floor(options?.retries ?? this.retry.retries)),
      delayMs: Math.max(0, Math.floor(options?.delayMs ?? this.retry.delayMs)),
      maxDelayMs: Math.max(0, Math.floor(options?.maxDelayMs ?? this.retry.maxDelayMs)),
      shouldRetry: options?.shouldRetry ?? this.retry.shouldRetry,
    }
  }

  /**
   * Проверяет retry policy для ошибки.
   */
  private shouldRetry(
    error: unknown,
    attempt: number,
    retry: DataTableServerHardeningRetryOptions,
  ): boolean {
    return retry.shouldRetry?.(error, attempt) ?? true
  }

  /**
   * Обновляет среднюю latency.
   */
  private recordLatency(durationMs: number): void {
    this.totalLatencyMs += Math.max(0, durationMs)
    this.latencySamples += 1
    this.metricsState.averageLatencyMs = this.totalLatencyMs / this.latencySamples
  }
}

function resolveRetryDelay(
  retry: Required<Omit<DataTableServerHardeningRetryOptions, 'shouldRetry'>>,
  attempt: number,
): number {
  const delay = retry.delayMs * Math.max(1, attempt)
  return retry.maxDelayMs > 0 ? Math.min(delay, retry.maxDelayMs) : delay
}
