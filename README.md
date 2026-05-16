# @endge/nova-datatable

Canvas DataTable на Nova для больших виртуальных таблиц.

## API

```ts
import { createDataTableStore } from '@endge/nova-datatable'

const store = createDataTableStore({
  rowKey: 'id',
  source: {
    rowCount: 1_000_000,
    loadRange: range => api.loadRows(range),
  },
})

store.replaceRange(1000, rows)
store.insertMany(rows)
store.patch('row-1', { status: 'active' })
store.setCell('row-1', 'status', 'blocked')
store.batch(api => {
  api.insertMany(rows)
  api.patch('row-2', { status: 'active' })
})
```

```vue
<NovaDataTable :store="store" :pinned-columns="{ left: ['name'], right: ['actions'] }">
  <DataTableColumn id="name" title="Name" field="name" pinned="left" resizable />
  <DataTableColumn id="amount" title="Amount" :value="row => row.amount" align="right" />
  <DataTablePinnedRows position="top" :rows="summaryRows" />
  <DataTablePinnedRows position="bottom" :rows="totalsRows" />
</NovaDataTable>
```

Если template ячейки не задан, колонка рендерит значение встроенным text fallback с `ellipsis`. Порядок templates: column `#cell`, table `#cell`, default text fallback.
