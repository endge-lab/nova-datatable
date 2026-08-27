import type { DataTableDelta, DataTableTransaction } from '@/model/types/datatable.types'

export type DataTableCommitStrategy = 'optimistic' | 'transaction'
export type DataTableCommitPhase = 'beforeCommit' | 'afterCommit' | 'afterError'
export type DataTableCommitEffectType = 'apply' | 'rollback'

export interface DataTableCommitEffect<Row extends Record<string, any> = Record<string, any>> {
  phase: DataTableCommitPhase
  type: DataTableCommitEffectType
  deltas: Array<DataTableDelta<Row>>
}

export interface DataTableCommitPlan<Row extends Record<string, any> = Record<string, any>> {
  strategy: DataTableCommitStrategy
  transaction: Pick<DataTableTransaction<Row>, 'deltas' | 'inverseDeltas'> & Partial<DataTableTransaction<Row>>
  effects: Array<DataTableCommitEffect<Row>>
}

export interface DataTableCommitControllerOptions {
  strategy?: DataTableCommitStrategy
}

export interface DataTableCommitPlanInput<Row extends Record<string, any> = Record<string, any>> {
  transaction: Pick<DataTableTransaction<Row>, 'deltas' | 'inverseDeltas'> & Partial<DataTableTransaction<Row>>
  strategy?: DataTableCommitStrategy
}

/**
 * Создает pure-планы применения транзакций для optimistic и transactional commit стратегий.
 */
export class DataTableCommitController<Row extends Record<string, any> = Record<string, any>> {
  private readonly defaultStrategy: DataTableCommitStrategy

  /**
   * Создает controller без прямого доступа к store или network layer.
   */
  constructor(options: DataTableCommitControllerOptions = {}) {
    this.defaultStrategy = options.strategy ?? 'optimistic'
  }

  /**
   * Возвращает план эффектов для выбранной commit стратегии.
   */
  createPlan(input: DataTableCommitPlanInput<Row>): DataTableCommitPlan<Row> {
    return createDataTableCommitPlan({
      transaction: input.transaction,
      strategy: input.strategy ?? this.defaultStrategy,
    })
  }

  /**
   * Возвращает эффекты плана для конкретной фазы.
   */
  getEffects(plan: DataTableCommitPlan<Row>, phase: DataTableCommitPhase): Array<DataTableCommitEffect<Row>> {
    return plan.effects
      .filter(effect => effect.phase === phase)
      .map(cloneCommitEffect)
  }

  /**
   * Возвращает объединенный delta batch для конкретной фазы.
   */
  getDeltas(plan: DataTableCommitPlan<Row>, phase: DataTableCommitPhase): Array<DataTableDelta<Row>> {
    return this.getEffects(plan, phase).flatMap(effect => effect.deltas)
  }
}

/**
 * Строит декларативный commit plan без выполнения побочных эффектов.
 */
export function createDataTableCommitPlan<Row extends Record<string, any> = Record<string, any>>(
  input: DataTableCommitPlanInput<Row>,
): DataTableCommitPlan<Row> {
  const strategy = input.strategy ?? 'optimistic'
  const deltas = cloneCommitDeltas(input.transaction.deltas)
  const inverseDeltas = cloneCommitDeltas(input.transaction.inverseDeltas)
  const transaction = {
    ...input.transaction,
    deltas,
    inverseDeltas,
  }
  const effects: Array<DataTableCommitEffect<Row>> = strategy === 'optimistic'
    ? [
        { phase: 'beforeCommit', type: 'apply', deltas },
        { phase: 'afterError', type: 'rollback', deltas: inverseDeltas },
      ]
    : [
        { phase: 'afterCommit', type: 'apply', deltas },
      ]

  return {
    strategy,
    transaction,
    effects: effects.map(cloneCommitEffect),
  }
}

function cloneCommitEffect<Row extends Record<string, any>>(
  effect: DataTableCommitEffect<Row>,
): DataTableCommitEffect<Row> {
  return {
    ...effect,
    deltas: cloneCommitDeltas(effect.deltas),
  }
}

function cloneCommitDeltas<Row extends Record<string, any>>(
  deltas: Array<DataTableDelta<Row>>,
): Array<DataTableDelta<Row>> {
  return deltas.map(delta => cloneCommitValue(delta))
}

function cloneCommitValue<T>(value: T): T {
  if (value === null || value === undefined || typeof value !== 'object') {
    return value
  }
  try {
    return structuredClone(value) as T
  }
  catch {
    try {
      return JSON.parse(JSON.stringify(value)) as T
    }
    catch {
      return Array.isArray(value) ? ([...value] as T) : ({ ...(value as Record<string, unknown>) } as T)
    }
  }
}
