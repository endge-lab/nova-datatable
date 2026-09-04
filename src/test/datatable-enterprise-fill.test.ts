import { describe, expect, it } from 'vitest'
import {
  createDataTableFillMatrix,
  parseDataTableClipboardMatrix,
  parseDataTableCsv,
  parseDataTableHtmlTable,
  parseDataTableTsv,
} from '@/model/runtime/DataTableFillMatrix'

describe('матрица заполнения DataTable Enterprise', () => {
  it('повторяет исходные ячейки по большей target заполнения', () => {
    const matrix = createDataTableFillMatrix({
      source: [
        ['A', 'B'],
        ['C', 'D'],
      ],
      rowCount: 3,
      columnCount: 5,
      series: 'repeat',
    })

    expect(matrix).toEqual([
      ['A', 'B', 'A', 'B', 'A'],
      ['C', 'D', 'C', 'D', 'C'],
      ['A', 'B', 'A', 'B', 'A'],
    ])
  })

  it('продолжает числовые серии по вертикали и горизонтали', () => {
    expect(createDataTableFillMatrix({
      source: [[1], [3]],
      rowCount: 5,
      columnCount: 1,
    })).toEqual([
      [1],
      [3],
      [5],
      [7],
      [9],
    ])

    expect(createDataTableFillMatrix({
      source: [[10, 20]],
      rowCount: 1,
      columnCount: 5,
    })).toEqual([
      [10, 20, 30, 40, 50],
    ])
  })
})

describe('разбор буфера обмена DataTable Enterprise', () => {
  it('разбирает TSV с tab в кавычках и строками CRLF', () => {
    expect(parseDataTableTsv('"A\tB"\t42\r\nC\tD')).toEqual([
      ['A\tB', '42'],
      ['C', 'D'],
    ])
    expect(parseDataTableClipboardMatrix('Alpha\tBeta', 'auto')).toEqual([['Alpha', 'Beta']])
  })

  it('разбирает CSV с запятыми и переносами строк в кавычках', () => {
    expect(parseDataTableCsv('name,notes\n"ACME, Inc","Line 1\nLine 2"\n')).toEqual([
      ['name', 'notes'],
      ['ACME, Inc', 'Line 1\nLine 2'],
    ])
    expect(parseDataTableClipboardMatrix('A,B', 'auto')).toEqual([['A', 'B']])
  })

  it('разбирает payload HTML-таблицы из буфера обмена и декодирует распространённые entities', () => {
    const html = [
      '<table><tbody>',
      '<tr><th>Name</th><th>Amount</th></tr>',
      '<tr><td>A&amp;B</td><td><strong>42</strong>&nbsp;USD</td></tr>',
      '</tbody></table>',
    ].join('')

    expect(parseDataTableHtmlTable(html)).toEqual([
      ['Name', 'Amount'],
      ['A&B', '42 USD'],
    ])
    expect(parseDataTableClipboardMatrix(html, 'auto')).toEqual([
      ['Name', 'Amount'],
      ['A&B', '42 USD'],
    ])
  })

  it('сохраняет обычный текст буфера обмена как матрицу из одной ячейки', () => {
    expect(parseDataTableClipboardMatrix('single cell', 'plain')).toEqual([['single cell']])
  })
})
