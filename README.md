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

## DOM overlay editing

V1 редактирует одну активную ячейку через DOM-элемент поверх Canvas. Canvas/Nova DSL остается renderer для таблицы, а `#editor` является обычным Vue/DOM slot.

```vue
<NovaDataTable
  ref="table"
  :store="store"
  :columns="columns"
  :editing="{ renderer: 'dom-overlay', trigger: ['doubleClick', 'enter'] }"
/>
```

```ts
const columns = [
  {
    id: 'name',
    field: 'name',
    title: 'Name',
    editable: true,
    editor: 'text',
    validateEditValue: value => String(value).trim() ? true : 'Name is required',
  },
]
```

```vue
<DataTableColumn id="status" field="status" editable editor="select" :editor-options="{ options: ['active', 'review', 'blocked'] }">
  <template #editor="{ draft, setDraft, commit, cancel }">
    <select :value="draft" @change="setDraft(($event.target as HTMLSelectElement).value)" @keydown.enter="commit" @keydown.esc="cancel">
      <option value="active">active</option>
      <option value="review">review</option>
      <option value="blocked">blocked</option>
    </select>
  </template>
</DataTableColumn>
```
