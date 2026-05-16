import { Fragment, type VNode, type VNodeArrayChildren } from 'vue'
import type { NovaSchema } from '@endge/nova'
import type {
  DataTableCellContext,
  DataTableCellRect,
  DataTableColumnInput,
  DataTableInteractionLayerContext,
  DataTableInteractionLayerTemplate,
  DataTablePinnedRows,
  DataTableTemplate,
} from '@/model/types/datatable.types'

export interface DataTableDslNodes<Row extends Record<string, any>> {
  columns: Array<DataTableColumnInput<Row>>
  pinnedRows: DataTablePinnedRows<Row>
  interactionLayerTemplate?: DataTableInteractionLayerTemplate<Row>
}

type SlotMap = Record<string, (...args: Array<any>) => Array<VNode>>

const PRIMITIVE_TAGS = new Set(['Rect', 'Surface', 'Text', 'TextBlock'])

export function compileDataTableDslNodes<Row extends Record<string, any>>(nodes: Array<VNode>): DataTableDslNodes<Row> {
  const columns: Array<DataTableColumnInput<Row>> = []
  const pinnedRows: DataTablePinnedRows<Row> = {}
  let interactionLayerTemplate: DataTableInteractionLayerTemplate<Row> | undefined

  for (const node of flattenVNodes(nodes)) {
    const tag = getVNodeTag(node)
    if (tag === 'DataTableColumn') {
      const column = compileColumnNode<Row>(node)
      if (column) columns.push(column)
    }
    if (tag === 'DataTablePinnedRows') {
      const position = readStringProp(node, 'position')
      const rows = readArrayProp<Row>(node, 'rows')
      if (position === 'top') pinnedRows.top = rows
      if (position === 'bottom') pinnedRows.bottom = rows
    }
    if (tag === 'DataTableInteractionLayer') {
      const slots = readSlots(node)
      interactionLayerTemplate = createInteractionLayerTemplate<Row>(
        slots.hover as ((context: DataTableInteractionLayerContext<Row>) => Array<VNode>) | undefined,
      )
    }
  }

  return { columns, pinnedRows, interactionLayerTemplate }
}

export function createSlotTemplate<Row extends Record<string, any>>(
  slot: ((context: DataTableCellContext<Row>) => Array<VNode>) | undefined,
): DataTableTemplate<Row> | undefined {
  if (!slot) return undefined

  return context => {
    const schema: NovaSchema = []
    for (const node of flattenVNodes(slot(context))) {
      appendPrimitiveNode(schema, node, context.rect)
    }
    return schema
  }
}

export function createInteractionLayerTemplate<Row extends Record<string, any>>(
  slot: ((context: DataTableInteractionLayerContext<Row>) => Array<VNode>) | undefined,
): DataTableInteractionLayerTemplate<Row> | undefined {
  if (!slot) return undefined

  return context => {
    const schema: NovaSchema = []
    const rootRect = {
      x: 0,
      y: 0,
      width: context.viewport.width,
      height: context.viewport.height,
    }
    for (const node of flattenVNodes(slot(context))) {
      appendPrimitiveNode(schema, node, rootRect)
    }
    return schema
  }
}

function compileColumnNode<Row extends Record<string, any>>(node: VNode): DataTableColumnInput<Row> | null {
  const id = readStringProp(node, 'id')
  if (!id) return null

  const slots = readSlots(node)
  const column: DataTableColumnInput<Row> = {
    id,
    title: readStringProp(node, 'title'),
    field: readStringProp(node, 'field'),
    value: readFunctionProp(node, 'value') as DataTableColumnInput<Row>['value'],
    width: readProp(node, 'width') as DataTableColumnInput<Row>['width'],
    minWidth: readNumberProp(node, 'minWidth'),
    maxWidth: readNumberProp(node, 'maxWidth'),
    pinned: readPinnedProp(node),
    resizable: readBooleanProp(node, 'resizable'),
    align: readAlignProp(node),
    cellTemplate: createSlotTemplate<Row>(slots.cell as ((context: DataTableCellContext<Row>) => Array<VNode>) | undefined),
    headerTemplate: createSlotTemplate<Row>(slots.header as ((context: DataTableCellContext<Row>) => Array<VNode>) | undefined),
  }

  return dropUndefined(column)
}

function appendPrimitiveNode(schema: NovaSchema, node: VNode, parentRect: DataTableCellRect): void {
  const tag = getVNodeTag(node)
  if (!tag) return
  if (tag === 'template') {
    for (const child of flattenChildren(node.children)) appendPrimitiveNode(schema, child, parentRect)
    return
  }
  if (!PRIMITIVE_TAGS.has(tag)) return
  if (readProp(node, 'if') === false || readProp(node, 'active') === false) return

  if (tag === 'Rect' || tag === 'Surface') {
    const rect = resolveNodeRect(node, parentRect)
    schema.push({
      type: 'rect',
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      active: readProp(node, 'active') as boolean | undefined,
      clip: readBooleanProp(node, 'clip') ? true : undefined,
      styles: {
        background: readStringProp(node, 'background'),
        border: readProp(node, 'border') as any,
        opacity: readNumberProp(node, 'opacity'),
      },
    })

    const contentRect = applyPadding(rect, readProp(node, 'padding'))
    for (const child of flattenChildren(node.children)) appendPrimitiveNode(schema, child, contentRect)
    return
  }

  if (tag === 'Text' || tag === 'TextBlock') {
    const rect = resolveNodeRect(node, parentRect)
    schema.push({
      type: 'text',
      text: String(readProp(node, 'text') ?? ''),
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      active: readProp(node, 'active') as boolean | undefined,
      clip: readBooleanProp(node, 'clip') ? true : undefined,
      styles: {
        color: readStringProp(node, 'color'),
        font: resolveFont(node),
        lineHeight: readNumberProp(node, 'lineHeight'),
        align: resolveAlign(node),
        ellipsis: readBooleanProp(node, 'ellipsis') || undefined,
        opacity: readNumberProp(node, 'opacity'),
      },
    })
  }
}

function resolveNodeRect(node: VNode, parentRect: DataTableCellRect): DataTableCellRect {
  const x = readNumberProp(node, 'x') ?? 0
  const y = readNumberProp(node, 'y') ?? 0
  const width = readNumberProp(node, 'width') ?? parentRect.width
  const height = readNumberProp(node, 'height') ?? parentRect.height

  return {
    x: parentRect.x + x,
    y: parentRect.y + y,
    width,
    height,
  }
}

function resolveFont(node: VNode): Record<string, unknown> | undefined {
  const explicit = readProp(node, 'font')
  if (explicit && typeof explicit === 'object') return explicit as Record<string, unknown>

  const fontSize = readNumberProp(node, 'fontSize')
  const fontWeight = readProp(node, 'fontWeight')
  if (!fontSize && !fontWeight) return undefined

  return {
    size: fontSize,
    weight: fontWeight,
  }
}

function resolveAlign(node: VNode): Record<string, unknown> | undefined {
  const align = readProp(node, 'align')
  const verticalAlign = readProp(node, 'verticalAlign')
  if (!align && !verticalAlign) return undefined

  return {
    horizontal: align,
    vertical: verticalAlign,
  }
}

function applyPadding(rect: DataTableCellRect, padding: unknown): DataTableCellRect {
  if (typeof padding === 'number') {
    return {
      x: rect.x + padding,
      y: rect.y + padding,
      width: Math.max(0, rect.width - padding * 2),
      height: Math.max(0, rect.height - padding * 2),
    }
  }

  if (typeof padding !== 'string') return rect

  const parts = padding.trim().split(/\s+/).map(part => Number.parseFloat(part)).filter(Number.isFinite)
  if (parts.length === 0) return rect

  const top = parts[0] ?? 0
  const right = parts[1] ?? top
  const bottom = parts[2] ?? top
  const left = parts[3] ?? right

  return {
    x: rect.x + left,
    y: rect.y + top,
    width: Math.max(0, rect.width - left - right),
    height: Math.max(0, rect.height - top - bottom),
  }
}

function flattenVNodes(nodes: Array<VNode>): Array<VNode> {
  return nodes.flatMap(node => {
    if (node.type === Fragment) return flattenChildren(node.children)
    return [node]
  })
}

function flattenChildren(children: VNode['children']): Array<VNode> {
  if (typeof children === 'function') return flattenVNodes((children as () => Array<VNode>)())
  if (children && typeof children === 'object' && !Array.isArray(children) && 'default' in children) {
    const defaultSlot = (children as { default?: () => Array<VNode> }).default
    return defaultSlot ? flattenVNodes(defaultSlot()) : []
  }
  if (!Array.isArray(children)) return []
  return (children as VNodeArrayChildren).flatMap(child => {
    if (!isVNode(child)) return []
    if (child.type === Fragment) return flattenChildren(child.children)
    return [child]
  })
}

function isVNode(value: unknown): value is VNode {
  return value !== null && typeof value === 'object' && 'type' in value
}

function getVNodeTag(node: VNode): string | null {
  if (typeof node.type === 'string') return node.type
  if (typeof node.type === 'object' && 'name' in node.type && typeof node.type.name === 'string') return node.type.name
  return null
}

function readSlots(node: VNode): SlotMap {
  return (node.children && !Array.isArray(node.children) && typeof node.children === 'object'
    ? node.children
    : {}) as SlotMap
}

function readProp(node: VNode, key: string): unknown {
  return node.props?.[key] ?? node.props?.[toKebabCase(key)]
}

function readStringProp(node: VNode, key: string): string | undefined {
  const value = readProp(node, key)
  return typeof value === 'string' ? value : undefined
}

function readNumberProp(node: VNode, key: string): number | undefined {
  const value = readProp(node, key)
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function readBooleanProp(node: VNode, key: string): boolean {
  const value = readProp(node, key)
  if (typeof value === 'boolean') return value
  if (value === '' || value === key) return true
  return false
}

function readFunctionProp(node: VNode, key: string): Function | undefined {
  const value = readProp(node, key)
  return typeof value === 'function' ? value : undefined
}

function readArrayProp<Row>(node: VNode, key: string): Array<Row> {
  const value = readProp(node, key)
  return Array.isArray(value) ? value as Array<Row> : []
}

function readPinnedProp(node: VNode): DataTableColumnInput['pinned'] {
  const value = readProp(node, 'pinned')
  return value === 'left' || value === 'right' ? value : undefined
}

function readAlignProp(node: VNode): DataTableColumnInput['align'] {
  const value = readProp(node, 'align')
  return value === 'left' || value === 'center' || value === 'right' ? value : undefined
}

function toKebabCase(value: string): string {
  return value.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`)
}

function dropUndefined<T extends Record<string, any>>(value: T): T {
  const result = { ...value }
  for (const key of Object.keys(result)) {
    if (result[key] === undefined) delete result[key]
  }
  return result
}
