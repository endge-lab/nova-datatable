import type { DataTableRowId } from '@/model/types/datatable.types'
import type { DataTableRootNode } from '@/ui/root/DataTableRootNode'

/**
 * Инкапсулирует runtime-операции viewport, колонок и данных.
 */
export class DataTableRuntimeActions<Row extends Record<string, any>> {
  /**
   * Создает actions для конкретного root node.
   */
  constructor(private readonly root: DataTableRootNode<Row>) {}

  /**
   * Обновляет scroll viewport.
   */
  scrollTo(x: number, y: number): void {
    this.root.setScroll(x, y)
  }

  /**
   * Прокручивает таблицу к строке.
   */
  scrollToRow(rowIndex: number): void {
    this.root.setScroll(this.root.scrollX, rowIndex * this.root.rowHeight)
  }

  /**
   * Меняет ширину колонки.
   */
  resizeColumn(columnId: string, width: number): boolean {
    return this.root.applyColumnWidth(columnId, width)
  }

  /**
   * Обновляет одну ячейку.
   */
  setCell(rowId: DataTableRowId, columnId: string, value: unknown): void {
    this.root.store.setCell(rowId, columnId, value)
    this.root.invalidateDataTable(['data', 'layout'])
  }
}
