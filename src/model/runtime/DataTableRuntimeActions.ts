import type { DataTableRowId } from '@/model/types/datatable.types'
import type { DataTableRootNode } from '@/ui/root/DataTableRootNode'

/**
 * Инкапсулирует runtime-операции viewport, колонок и данных.
 */
export class DataTableRuntimeActions<Row extends Record<string, any>> {
  /**
   * Создает actions для конкретного root node.
   */
  constructor(private readonly _root: DataTableRootNode<Row>) {}

  /**
   * Обновляет scroll viewport.
   */
  scrollTo(x: number, y: number): void {
    this._root.setScroll(x, y)
  }

  /**
   * Прокручивает таблицу к строке.
   */
  scrollToRow(rowIndex: number): void {
    this._root.setScroll(this._root.scrollX, rowIndex * this._root.rowHeight)
  }

  /**
   * Меняет ширину колонки.
   */
  resizeColumn(columnId: string, width: number): boolean {
    return this._root.applyColumnWidth(columnId, width)
  }

  /**
   * Обновляет одну ячейку.
   */
  setCell(rowId: DataTableRowId, columnId: string, value: unknown): void {
    this._root.store.setCell(rowId, columnId, value)
    this._root.invalidateDataTable(['data', 'layout'])
  }
}
