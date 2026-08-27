/**
 * Хранит ревизии областей таблицы для точечной invalidation render-слоев.
 */
export class DataTableInvalidationScope {
  private readonly _revisions = new Map<string, number>()

  /**
   * Увеличивает ревизию одной области.
   */
  bump(kind: string): number {
    const next = (this._revisions.get(kind) ?? 0) + 1
    this._revisions.set(kind, next)
    return next
  }

  /**
   * Увеличивает ревизии нескольких областей.
   */
  bumpMany(kinds: Array<string>): void {
    for (const kind of kinds) {
      this.bump(kind)
    }
  }

  /**
   * Возвращает ревизию области.
   */
  get(kind: string): number {
    return this._revisions.get(kind) ?? 0
  }
}
