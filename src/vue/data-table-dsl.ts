import { defineComponent, type ComponentObjectPropsOptions } from 'vue'

const primitiveProps = [
  'x',
  'y',
  'width',
  'height',
  'background',
  'border',
  'opacity',
  'color',
  'font',
  'fontSize',
  'fontWeight',
  'lineHeight',
  'padding',
  'align',
  'verticalAlign',
  'ellipsis',
  'active',
  'clip',
  'text',
  'if',
] as const

function createDataTableDslMarker(name: string, props: ComponentObjectPropsOptions = {}) {
  return defineComponent({
    name,
    inheritAttrs: false,
    props,
    setup(_props, { slots }) {
      return () => slots.default?.() ?? null
    },
  })
}

const commonPrimitiveProps = Object.fromEntries(primitiveProps.map(name => [name, { required: false }]))

export const DataTableColumn = createDataTableDslMarker('DataTableColumn', {
  id: {
    type: String,
    required: true,
  },
  title: {
    type: String,
    required: false,
  },
  field: {
    type: String,
    required: false,
  },
  value: {
    type: Function,
    required: false,
  },
  width: {
    type: [Number, Object],
    required: false,
  },
  minWidth: {
    type: Number,
    required: false,
  },
  maxWidth: {
    type: Number,
    required: false,
  },
  pinned: {
    type: String,
    required: false,
  },
  resizable: {
    type: Boolean,
    required: false,
    default: false,
  },
  align: {
    type: String,
    required: false,
  },
  sortable: {
    type: [Boolean, Object],
    required: false,
    default: false,
  },
  filter: {
    type: [String, Object],
    required: false,
  },
  reorderable: {
    type: Boolean,
    required: false,
    default: false,
  },
})

export const DataTablePinnedRows = createDataTableDslMarker('DataTablePinnedRows', {
  position: {
    type: String,
    required: true,
  },
  rows: {
    type: Array,
    required: true,
  },
})

export const DataTableInteractionLayer = createDataTableDslMarker('DataTableInteractionLayer')

export const DataTableGrouping = createDataTableDslMarker('DataTableGrouping', {
  enabled: {
    type: Boolean,
    required: false,
    default: true,
  },
  mode: {
    type: String,
    required: false,
  },
  groups: {
    type: Array,
    required: false,
  },
  expanded: {
    type: [String, Array],
    required: false,
  },
  showGroupRows: {
    type: Boolean,
    required: false,
    default: true,
  },
  showGroupFooters: {
    type: Boolean,
    required: false,
    default: false,
  },
  showGrandFooter: {
    type: Boolean,
    required: false,
    default: false,
  },
  footerPlacement: {
    type: String,
    required: false,
  },
})

export const Rect = createDataTableDslMarker('Rect', commonPrimitiveProps)
export const Surface = createDataTableDslMarker('Surface', commonPrimitiveProps)
export const Text = createDataTableDslMarker('Text', commonPrimitiveProps)
export const TextBlock = createDataTableDslMarker('TextBlock', commonPrimitiveProps)
