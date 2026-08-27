import type {
  DataTableColumnInput,
  DataTableFilterConfig,
  DataTableFilterOperator,
  DataTableFilterPreset,
  DataTableFilterRule,
  DataTableResolvedColumn,
  DataTableStoreApi,
} from '@/model/types/datatable.types'
import { resolveDataTableValue } from '@/model/runtime/datatable-columns'

export type DataTableFilterMenuReason
  = | 'idle'
    | 'open'
    | 'close'
    | 'operator'
    | 'value'
    | 'search'
    | 'set-values'
    | 'apply'
    | 'clear'
    | 'reset'

export interface DataTableSetFilterValue {
  key: string
  value: unknown
  label: string
  count: number
  selected: boolean
  empty: boolean
}

export interface DataTableSetFilterValuesInput<Row extends Record<string, any> = Record<string, any>> {
  column: DataTableColumnInput<Row> | DataTableResolvedColumn<Row>
  rows?: Array<Row>
  store?: Pick<DataTableStoreApi<Row>, 'rowCount' | 'getRowAt'>
  limit?: number
  search?: string
  selected?: Iterable<unknown>
  includeEmpty?: boolean
  sort?: false | 'asc' | 'count-desc' | ((left: DataTableSetFilterValue, right: DataTableSetFilterValue) => number)
  formatValue?: (value: unknown, count: number) => string
}

export interface DataTableFilterMenuState {
  open: boolean
  columnId: string | null
  operator: DataTableFilterOperator
  value: unknown
  search: string
  operators: Array<DataTableFilterOperator>
  values: Array<DataTableSetFilterValue>
  draftRule: DataTableFilterRule | null
  appliedRule: DataTableFilterRule | null
  dirty: boolean
  valid: boolean
  reason: DataTableFilterMenuReason
}

export type DataTableFilterMenuAction
  = | {
    type: 'open'
    columnId: string
    filter?: DataTableFilterConfig | DataTableFilterPreset | string
    currentRule?: DataTableFilterRule | null
    values?: Array<DataTableSetFilterValue>
    search?: string
  }
  | { type: 'close' }
  | { type: 'set-operator', operator: DataTableFilterOperator }
  | { type: 'set-value', value: unknown }
  | { type: 'set-search', search: string }
  | { type: 'toggle-value', value: unknown, selected?: boolean }
  | { type: 'select-values', values: Array<unknown> }
  | { type: 'apply' }
  | { type: 'clear' }
  | { type: 'reset', state?: DataTableFilterMenuState }

const DEFAULT_FILTER_OPERATORS: Array<DataTableFilterOperator> = ['contains', 'equals', 'startsWith', 'endsWith']

/**
 * Создает закрытое состояние меню фильтра без привязки к UI или root node.
 */
export function createDataTableFilterMenuState(): DataTableFilterMenuState {
  return createFilterMenuState({
    open: false,
    columnId: null,
    operator: 'contains',
    value: '',
    search: '',
    operators: DEFAULT_FILTER_OPERATORS,
    values: [],
    appliedRule: null,
    reason: 'idle',
  })
}

/**
 * Применяет action к pure-состоянию меню фильтра.
 */
export function reduceDataTableFilterMenuAction(
  state: DataTableFilterMenuState,
  action: DataTableFilterMenuAction,
): DataTableFilterMenuState {
  if (action.type === 'reset') {
    return action.state ? cloneFilterMenuState(action.state, 'reset') : createDataTableFilterMenuState()
  }
  if (action.type === 'open') {
    return openFilterMenu(action)
  }
  if (action.type === 'close') {
    return cloneFilterMenuState({ ...state, open: false }, 'close')
  }
  if (action.type === 'set-operator') {
    return setFilterMenuOperator(state, action.operator)
  }
  if (action.type === 'set-value') {
    return setFilterMenuValue(state, action.value, 'value')
  }
  if (action.type === 'set-search') {
    return cloneFilterMenuState({ ...state, search: action.search }, 'search')
  }
  if (action.type === 'toggle-value') {
    return toggleFilterMenuValue(state, action.value, action.selected)
  }
  if (action.type === 'select-values') {
    return setFilterMenuSelectedValues(state, action.values)
  }
  if (action.type === 'apply') {
    return applyFilterMenu(state)
  }
  if (action.type === 'clear') {
    return clearFilterMenu(state)
  }
  return state
}

/**
 * Собирает уникальные значения set-фильтра из массива строк или sparse store.
 */
export function resolveDataTableSetFilterValues<Row extends Record<string, any>>(
  input: DataTableSetFilterValuesInput<Row>,
): Array<DataTableSetFilterValue> {
  const counts = new Map<string, { value: unknown, count: number, empty: boolean }>()
  const selected = new Set([...(input.selected ?? [])].map(createDataTableSetFilterValueKey))
  const limit = Math.max(0, input.limit ?? resolveSourceRowCount(input))

  for (let index = 0; index < limit; index += 1) {
    const row = input.rows ? input.rows[index] : input.store?.getRowAt(index)
    if (!row) {
      continue
    }

    const value = resolveDataTableValue(row, index, input.column)
    const empty = isEmptySetFilterValue(value)
    if (empty && input.includeEmpty === false) {
      continue
    }

    const key = createDataTableSetFilterValueKey(value)
    const current = counts.get(key)
    if (current) {
      current.count += 1
    }
    else { counts.set(key, { value, count: 1, empty }) }
  }

  const search = normalizeSearch(input.search)
  const values = [...counts.entries()]
    .map(([key, item]) => ({
      key,
      value: item.value,
      label: input.formatValue ? input.formatValue(item.value, item.count) : formatSetFilterValueLabel(item.value),
      count: item.count,
      selected: selected.has(key),
      empty: item.empty,
    }))
    .filter(item => !search || item.label.toLocaleLowerCase().includes(search))

  return sortSetFilterValues(values, input.sort)
}

/**
 * Создает стабильный ключ для сравнения set-filter значений без ссылочного равенства.
 */
export function createDataTableSetFilterValueKey(value: unknown): string {
  if (value === null) {
    return 'null:null'
  }
  if (value === undefined) {
    return 'undefined:undefined'
  }
  const type = typeof value
  if (type === 'object') {
    return `object:${stableStringify(value)}`
  }
  if (type === 'number' && Number.isNaN(value)) {
    return 'number:NaN'
  }
  return `${type}:${String(value)}`
}

/**
 * Возвращает доступные операторы по filter preset/config.
 */
export function resolveDataTableFilterOperators(
  filter: DataTableFilterConfig | DataTableFilterPreset | string | undefined,
): Array<DataTableFilterOperator> {
  if (filter && typeof filter === 'object' && Array.isArray(filter.operators) && filter.operators.length > 0) {
    return [...filter.operators]
  }

  const preset = resolveFilterPreset(filter)
  if (preset === 'number') {
    return ['equals', 'gt', 'gte', 'lt', 'lte', 'between']
  }
  if (preset === 'date') {
    return ['equals', 'gt', 'gte', 'lt', 'lte', 'between']
  }
  if (preset === 'set') {
    return ['in', 'notIn']
  }
  if (preset === 'boolean') {
    return ['is', 'isNot']
  }
  return [...DEFAULT_FILTER_OPERATORS]
}

/**
 * Форматирует rule для compact summary в header/filter menu.
 */
export function formatDataTableFilterRule(rule: DataTableFilterRule): string {
  return `${formatFilterOperator(rule.operator)} ${formatFilterValue(rule.value)}`
}

function openFilterMenu(action: Extract<DataTableFilterMenuAction, { type: 'open' }>): DataTableFilterMenuState {
  const operators = resolveDataTableFilterOperators(action.filter)
  const operator = action.currentRule?.operator ?? resolveDefaultFilterOperator(action.filter, operators)
  const value = action.currentRule ? cloneFilterValue(action.currentRule.value) : resolveDefaultFilterValue(action.filter, operator)
  const selectedValues = normalizeSetFilterSelection(operator, value)

  return createFilterMenuState({
    open: true,
    columnId: action.columnId,
    operator,
    value,
    search: action.search ?? '',
    operators,
    values: syncSetFilterSelection(action.values ?? [], selectedValues),
    appliedRule: action.currentRule ? cloneFilterRule(action.currentRule) : null,
    reason: 'open',
  })
}

function setFilterMenuOperator(
  state: DataTableFilterMenuState,
  operator: DataTableFilterOperator,
): DataTableFilterMenuState {
  const value = normalizeFilterValueForOperator(operator, state.value)
  return createFilterMenuState({
    ...state,
    operator,
    value,
    values: syncSetFilterSelection(state.values, normalizeSetFilterSelection(operator, value)),
    reason: 'operator',
  })
}

function setFilterMenuValue(
  state: DataTableFilterMenuState,
  value: unknown,
  reason: DataTableFilterMenuReason,
): DataTableFilterMenuState {
  return createFilterMenuState({
    ...state,
    value: cloneFilterValue(value),
    values: syncSetFilterSelection(state.values, normalizeSetFilterSelection(state.operator, value)),
    reason,
  })
}

function toggleFilterMenuValue(
  state: DataTableFilterMenuState,
  value: unknown,
  selected?: boolean,
): DataTableFilterMenuState {
  const key = createDataTableSetFilterValueKey(value)
  const current = normalizeSetFilterSelection(state.operator, state.value)
  const exists = current.some(item => createDataTableSetFilterValueKey(item) === key)
  const shouldSelect = selected ?? !exists
  const next = shouldSelect
    ? exists ? current : [...current, value]
    : current.filter(item => createDataTableSetFilterValueKey(item) !== key)

  return setFilterMenuValue(state, next, 'set-values')
}

function setFilterMenuSelectedValues(
  state: DataTableFilterMenuState,
  values: Array<unknown>,
): DataTableFilterMenuState {
  return setFilterMenuValue(state, [...values], 'set-values')
}

function applyFilterMenu(state: DataTableFilterMenuState): DataTableFilterMenuState {
  const draftRule = state.valid ? state.draftRule : null
  return createFilterMenuState({
    ...state,
    open: false,
    appliedRule: draftRule ? cloneFilterRule(draftRule) : null,
    reason: 'apply',
  })
}

function clearFilterMenu(state: DataTableFilterMenuState): DataTableFilterMenuState {
  return createFilterMenuState({
    ...state,
    value: isSetOperator(state.operator) ? [] : '',
    values: syncSetFilterSelection(state.values, []),
    appliedRule: null,
    reason: 'clear',
  })
}

function createFilterMenuState(
  input: Omit<DataTableFilterMenuState, 'draftRule' | 'dirty' | 'valid'>,
): DataTableFilterMenuState {
  const draftRule = input.columnId
    ? {
        columnId: input.columnId,
        operator: input.operator,
        value: cloneFilterValue(input.value),
      }
    : null
  const valid = !!draftRule && isValidFilterValue(input.operator, input.value)
  const normalizedDraftRule = valid && draftRule ? draftRule : null
  return {
    ...input,
    operators: [...input.operators],
    values: input.values.map(cloneSetFilterValue),
    value: cloneFilterValue(input.value),
    appliedRule: input.appliedRule ? cloneFilterRule(input.appliedRule) : null,
    draftRule: normalizedDraftRule,
    valid,
    dirty: !areFilterRulesEqual(normalizedDraftRule, input.appliedRule),
  }
}

function cloneFilterMenuState(
  state: DataTableFilterMenuState,
  reason: DataTableFilterMenuReason,
): DataTableFilterMenuState {
  return createFilterMenuState({
    ...state,
    reason,
  })
}

function cloneFilterRule(rule: DataTableFilterRule): DataTableFilterRule {
  return {
    columnId: rule.columnId,
    operator: rule.operator,
    value: cloneFilterValue(rule.value),
  }
}

function cloneFilterValue(value: unknown): unknown {
  return Array.isArray(value) ? [...value] : value
}

function cloneSetFilterValue(value: DataTableSetFilterValue): DataTableSetFilterValue {
  return {
    ...value,
  }
}

function resolveDefaultFilterOperator(
  filter: DataTableFilterConfig | DataTableFilterPreset | string | undefined,
  operators: Array<DataTableFilterOperator>,
): DataTableFilterOperator {
  if (filter && typeof filter === 'object' && filter.defaultOperator) {
    return filter.defaultOperator
  }
  return operators[0] ?? 'contains'
}

function resolveDefaultFilterValue(
  filter: DataTableFilterConfig | DataTableFilterPreset | string | undefined,
  operator: DataTableFilterOperator,
): unknown {
  if (filter && typeof filter === 'object' && filter.defaultValue !== undefined) {
    return cloneFilterValue(filter.defaultValue)
  }
  if (isSetOperator(operator)) {
    return []
  }
  if (operator === 'between') {
    return ['', '']
  }

  const options = filter && typeof filter === 'object' && Array.isArray(filter.options) ? filter.options : []
  if (options.length > 0) {
    return options[0]
  }
  if (resolveFilterPreset(filter) === 'number') {
    return 0
  }
  if (resolveFilterPreset(filter) === 'boolean') {
    return true
  }
  return ''
}

function resolveFilterPreset(filter: DataTableFilterConfig | DataTableFilterPreset | string | undefined): string | undefined {
  if (!filter) {
    return undefined
  }
  if (typeof filter === 'string') {
    return filter
  }
  return filter.type
}

function normalizeFilterValueForOperator(operator: DataTableFilterOperator, value: unknown): unknown {
  if (isSetOperator(operator)) {
    return normalizeSetFilterSelection(operator, value)
  }
  if (operator === 'between') {
    if (Array.isArray(value)) {
      return [value[0] ?? '', value[1] ?? '']
    }
    return [value ?? '', value ?? '']
  }
  if (Array.isArray(value)) {
    return value[0] ?? ''
  }
  return value
}

function normalizeSetFilterSelection(operator: DataTableFilterOperator, value: unknown): Array<unknown> {
  if (!isSetOperator(operator)) {
    return []
  }
  return Array.isArray(value) ? [...value] : value === undefined ? [] : [value]
}

function syncSetFilterSelection(
  values: Array<DataTableSetFilterValue>,
  selectedValues: Array<unknown>,
): Array<DataTableSetFilterValue> {
  const selected = new Set(selectedValues.map(createDataTableSetFilterValueKey))
  return values.map(value => ({
    ...value,
    selected: selected.has(value.key),
  }))
}

function isSetOperator(operator: DataTableFilterOperator): boolean {
  return operator === 'in' || operator === 'notIn'
}

function isValidFilterValue(operator: DataTableFilterOperator, value: unknown): boolean {
  if (isSetOperator(operator)) {
    return Array.isArray(value) && value.length > 0
  }
  if (operator === 'between') {
    return Array.isArray(value) && value.length >= 2 && !isBlankValue(value[0]) && !isBlankValue(value[1])
  }
  if (operator === 'is' || operator === 'isNot') {
    return value !== undefined
  }
  return !isBlankValue(value)
}

function isBlankValue(value: unknown): boolean {
  return value === undefined || value === null || value === ''
}

function isEmptySetFilterValue(value: unknown): boolean {
  return value === undefined || value === null || value === ''
}

function areFilterRulesEqual(left: DataTableFilterRule | null, right: DataTableFilterRule | null): boolean {
  if (!left || !right) {
    return left === right
  }
  return left.columnId === right.columnId
    && left.operator === right.operator
    && stableStringify(left.value) === stableStringify(right.value)
}

function resolveSourceRowCount<Row extends Record<string, any>>(
  input: DataTableSetFilterValuesInput<Row>,
): number {
  if (input.rows) {
    return input.rows.length
  }
  return input.store?.rowCount ?? 0
}

function normalizeSearch(value: string | undefined): string {
  return value?.trim().toLocaleLowerCase() ?? ''
}

function sortSetFilterValues(
  values: Array<DataTableSetFilterValue>,
  sort: DataTableSetFilterValuesInput['sort'],
): Array<DataTableSetFilterValue> {
  const next = [...values]
  if (sort === false) {
    return next
  }
  if (typeof sort === 'function') {
    return next.sort(sort)
  }
  if (sort === 'count-desc') {
    return next.sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
  }
  return next.sort((left, right) => left.label.localeCompare(right.label))
}

function formatSetFilterValueLabel(value: unknown): string {
  if (value === undefined || value === null || value === '') {
    return '(empty)'
  }
  if (typeof value === 'object') {
    return stableStringify(value)
  }
  return String(value)
}

function formatFilterOperator(operator: DataTableFilterOperator): string {
  const labels: Record<DataTableFilterOperator, string> = {
    contains: 'has',
    equals: '=',
    startsWith: '^',
    endsWith: '$',
    gt: '>',
    gte: '>=',
    lt: '<',
    lte: '<=',
    between: 'between',
    in: 'in',
    notIn: 'not in',
    is: 'is',
    isNot: 'is not',
  }
  return labels[operator] ?? operator
}

function formatFilterValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map(formatFilterValue).join(', ')
  }
  if (value === undefined || value === null || value === '') {
    return 'empty'
  }
  if (typeof value === 'object') {
    return stableStringify(value)
  }
  return String(value)
}

function stableStringify(value: unknown): string {
  if (!value || typeof value !== 'object') {
    return String(JSON.stringify(value))
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`
  }
  const record = value as Record<string, unknown>
  const keys = Object.keys(record).sort()
  return `{${keys.map(key => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`
}
