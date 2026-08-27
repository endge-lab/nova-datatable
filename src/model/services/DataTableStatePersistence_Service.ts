import type { DataTableResolvedStatePersistenceOptions } from '@/model/types/datatable.types'

/** Изолирует доступ DataTable runtime к browser storage. */
export class DataTableStatePersistence_Service {
  /**
   * --------------------
   * PUBLIC
   * --------------------
   */

  /** Возвращает сохранённую строку или null, если storage недоступен. */
  public read(options: DataTableResolvedStatePersistenceOptions): string | null {
    try {
      return this._resolveStorage(options)?.getItem(options.key) ?? null
    }
    catch {
      return null
    }
  }

  /** Сохраняет строку и сообщает, выполнилась ли операция. */
  public write(options: DataTableResolvedStatePersistenceOptions, value: string): boolean {
    try {
      const storage = this._resolveStorage(options)
      if (!storage) {
        return false
      }
      storage.setItem(options.key, value)
      return true
    }
    catch {
      return false
    }
  }

  /** Удаляет сохранённое состояние в best-effort режиме. */
  public remove(options: DataTableResolvedStatePersistenceOptions): void {
    try {
      this._resolveStorage(options)?.removeItem(options.key)
    }
    catch {
      // Browser storage может быть недоступен в private mode.
    }
  }

  /**
   * --------------------
   * PRIVATE
   * --------------------
   */

  /** Возвращает выбранное browser storage. */
  private _resolveStorage(options: DataTableResolvedStatePersistenceOptions): Storage | null {
    if (typeof window === 'undefined') {
      return null
    }

    try {
      return options.storage === 'sessionStorage' ? window.sessionStorage : window.localStorage
    }
    catch {
      return null
    }
  }
}
