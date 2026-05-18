export type DataTableSummaryAggregator = 'count' | 'sum' | 'avg' | 'min' | 'max'

export interface DataTableSummaryRule<Row extends Record<string, any> = Record<string, any>> {
  id: string
  field?: keyof Row | string
  value?: (row: Row, index: number) => unknown
  aggregate: DataTableSummaryAggregator
}

export interface DataTableSummaryResult {
  values: Record<string, unknown>
  rowCount: number
  revision: number
}

interface SummaryAccumulator {
  aggregate: DataTableSummaryAggregator
  count: number
  sum: number
  min: number
  max: number
  values: Map<number, number>
  dirtyExtrema: boolean
}

/**
 * Инкрементально считает summary для видимых/загруженных строк без участия UI render pass.
 */
export class DataTableSummaryEngine<Row extends Record<string, any> = Record<string, any>> {
  private readonly accumulators = new Map<string, SummaryAccumulator>()
  private rules: Array<DataTableSummaryRule<Row>> = []
  private rowCount = 0
  private revision = 0

  compute(rows: Array<Row>, rules: Array<DataTableSummaryRule<Row>>): DataTableSummaryResult {
    this.rules = [...rules]
    this.accumulators.clear()
    this.rowCount = rows.length

    for (const rule of rules) {
      this.accumulators.set(rule.id, createAccumulator(rule.aggregate))
    }

    rows.forEach((row, index) => {
      for (const rule of rules) this.addValue(rule, row, index)
    })
    this.revision += 1
    return this.snapshot()
  }

  applyRowChange(previous: Row | undefined, next: Row | undefined, index = 0): DataTableSummaryResult {
    if (!previous && !next) return this.snapshot()
    if (!previous && next) this.rowCount += 1
    if (previous && !next) this.rowCount = Math.max(0, this.rowCount - 1)

    for (const rule of this.rules) {
      if (previous) this.removeValue(rule, previous, index)
      if (next) this.addValue(rule, next, index)
    }
    this.revision += 1
    return this.snapshot()
  }

  snapshot(): DataTableSummaryResult {
    const values: Record<string, unknown> = {}
    for (const [id, accumulator] of this.accumulators) {
      values[id] = resolveAccumulatorValue(accumulator)
    }
    return {
      values,
      rowCount: this.rowCount,
      revision: this.revision,
    }
  }

  private addValue(rule: DataTableSummaryRule<Row>, row: Row, index: number): void {
    const accumulator = this.accumulators.get(rule.id)
    if (!accumulator) return
    if (rule.aggregate === 'count') {
      accumulator.count += 1
      return
    }

    const value = this.resolveNumber(rule, row, index)
    if (value === undefined) return
    accumulator.count += 1
    accumulator.sum += value
    accumulator.min = accumulator.count === 1 ? value : Math.min(accumulator.min, value)
    accumulator.max = accumulator.count === 1 ? value : Math.max(accumulator.max, value)
    accumulator.values.set(value, (accumulator.values.get(value) ?? 0) + 1)
  }

  private removeValue(rule: DataTableSummaryRule<Row>, row: Row, index: number): void {
    const accumulator = this.accumulators.get(rule.id)
    if (!accumulator) return
    if (rule.aggregate === 'count') {
      accumulator.count = Math.max(0, accumulator.count - 1)
      return
    }

    const value = this.resolveNumber(rule, row, index)
    if (value === undefined) return

    accumulator.count = Math.max(0, accumulator.count - 1)
    accumulator.sum -= value
    const nextCount = (accumulator.values.get(value) ?? 0) - 1
    if (nextCount > 0) accumulator.values.set(value, nextCount)
    else accumulator.values.delete(value)

    if (accumulator.count === 0) {
      accumulator.min = 0
      accumulator.max = 0
    } else if (value === accumulator.min || value === accumulator.max) {
      accumulator.dirtyExtrema = true
    }
  }

  private resolveNumber(rule: DataTableSummaryRule<Row>, row: Row, index: number): number | undefined {
    const raw = rule.value
      ? rule.value(row, index)
      : rule.field
        ? row[rule.field as keyof Row]
        : row[rule.id]
    const value = Number(raw)
    return Number.isFinite(value) ? value : undefined
  }
}

function createAccumulator(aggregate: DataTableSummaryAggregator): SummaryAccumulator {
  return {
    aggregate,
    count: 0,
    sum: 0,
    min: 0,
    max: 0,
    values: new Map(),
    dirtyExtrema: false,
  }
}

function resolveAccumulatorValue(accumulator: SummaryAccumulator): unknown {
  if (accumulator.aggregate === 'count') return accumulator.count
  if (accumulator.aggregate === 'sum') return accumulator.sum
  if (accumulator.aggregate === 'avg') return accumulator.count === 0 ? 0 : accumulator.sum / accumulator.count
  if (accumulator.dirtyExtrema) recomputeExtrema(accumulator)
  if (accumulator.aggregate === 'min') return accumulator.count === 0 ? 0 : accumulator.min
  return accumulator.count === 0 ? 0 : accumulator.max
}

function recomputeExtrema(accumulator: SummaryAccumulator): void {
  accumulator.dirtyExtrema = false
  if (accumulator.count === 0) {
    accumulator.min = 0
    accumulator.max = 0
    return
  }

  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  for (const value of accumulator.values.keys()) {
    if (value < min) min = value
    if (value > max) max = value
  }
  accumulator.min = min
  accumulator.max = max
}
