import { describe, expect, it } from 'vitest'
import {
  createDataTableFillMatrix,
  parseDataTableClipboardMatrix,
  parseDataTableCsv,
  parseDataTableHtmlTable,
  parseDataTableTsv,
} from '@/model/runtime/DataTableFillMatrix'

describe('DataTable enterprise fill matrix', () => {
  it('repeats source cells over a larger fill target', () => {
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

  it('continues numeric series vertically and horizontally', () => {
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

describe('DataTable enterprise clipboard parsing', () => {
  it('parses TSV with quoted tabs and CRLF rows', () => {
    expect(parseDataTableTsv('"A\tB"\t42\r\nC\tD')).toEqual([
      ['A\tB', '42'],
      ['C', 'D'],
    ])
    expect(parseDataTableClipboardMatrix('Alpha\tBeta', 'auto')).toEqual([['Alpha', 'Beta']])
  })

  it('parses CSV with quoted commas and quoted newlines', () => {
    expect(parseDataTableCsv('name,notes\n"ACME, Inc","Line 1\nLine 2"\n')).toEqual([
      ['name', 'notes'],
      ['ACME, Inc', 'Line 1\nLine 2'],
    ])
    expect(parseDataTableClipboardMatrix('A,B', 'auto')).toEqual([['A', 'B']])
  })

  it('parses HTML table clipboard payloads and decodes common entities', () => {
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

  it('keeps plain clipboard text as a single-cell matrix', () => {
    expect(parseDataTableClipboardMatrix('single cell', 'plain')).toEqual([['single cell']])
  })
})
