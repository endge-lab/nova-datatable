// @vitest-environment jsdom

import type { NovaApp } from '@endge/nova'
import type { DataTableColumnInput, DataTablePasteResult } from '@/model/types/datatable.types'
import type { DataTableRootNode } from '@/ui/root/DataTableRootNode'
import {
  Nova,

  RaphSchedulerType,
  RendererType,
} from '@endge/nova'
import { NovaUIKit, registerNovaUIKit } from '@endge/nova-ui-kit'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createDataTableClipboardFeedbackHidden,
  createDataTableClipboardPasteErrorFeedback,
  createDataTableClipboardPasteFeedback,
} from '@/model/runtime/DataTableClipboardFeedback'
import {

  NovaDataTableSchema,
} from '@/model/types/datatable.types'
import { registerNovaDataTable } from '@/ui/root/datatable-root.registry'

interface EnterpriseRow {
  id: string
  name: string
  amount: number | null
  active: boolean
  meta: { tier: string } | null
  status: 'READY' | 'DONE' | 'HOLD'
  locked: boolean
  lockedValue: string
}

type TestEvents = Record<string, any>

function enterpriseRows(count: number): Array<EnterpriseRow> {
  return Array.from({ length: count }, (_item, index) => ({
    id: `row-${index}`,
    name: `Customer ${index}`,
    amount: index * 10,
    active: index % 2 === 0,
    meta: { tier: index % 2 === 0 ? 'gold' : 'silver' },
    status: 'READY',
    locked: index === 1,
    lockedValue: `locked-${index}`,
  }))
}

function enterpriseColumns(): Array<DataTableColumnInput<EnterpriseRow>> {
  return [
    { id: 'name', title: 'Name', field: 'name', width: 180, editable: true, type: 'text', paste: { enabled: true } },
    { id: 'amount', title: 'Amount', field: 'amount', width: 120, editable: true, type: 'number', paste: { enabled: true } },
    { id: 'active', title: 'Active', field: 'active', width: 120, editable: true, type: 'boolean', paste: { enabled: true } },
    { id: 'meta', title: 'Meta', field: 'meta', width: 160, editable: true, type: 'json', paste: { enabled: true } },
    {
      id: 'status',
      title: 'Status',
      field: 'status',
      width: 120,
      editable: true,
      type: 'custom',
      paste: { enabled: true },
      parsePasteValue: raw => raw.trim().toUpperCase(),
      validatePasteValue: value => value === 'READY' || value === 'DONE' || value === 'HOLD' ? true : 'Unknown status',
    },
    {
      id: 'lockedValue',
      title: 'Locked',
      field: 'lockedValue',
      width: 140,
      editable: context => !context.row.locked,
      type: 'text',
      paste: { enabled: true },
    },
  ]
}

function create2DContextStub(): CanvasRenderingContext2D {
  const state: Record<PropertyKey, any> = {
    __sets: [],
    measureText: vi.fn((text: string) => ({ width: text.length * 8 })),
    createPattern: vi.fn(() => ({})),
  }
  return new Proxy(state, {
    get(target, prop) {
      if (!(prop in target)) {
        target[prop] = vi.fn()
      }
      return target[prop]
    },
    set(target, prop, value) {
      target[prop] = value
      ;(target.__sets as Array<[PropertyKey, unknown]>).push([prop, value])
      return true
    },
  }) as CanvasRenderingContext2D
}

function installCanvasMocks(): void {
  Object.defineProperty(window, 'devicePixelRatio', {
    value: 1,
    configurable: true,
  })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((type: string) => {
    if (type === RendererType.Web2D) {
      return create2DContextStub()
    }
    return null
  })
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockImplementation(function getRect(this: HTMLCanvasElement) {
    const width = this.width || 900
    const height = this.height || 560
    return {
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: width,
      bottom: height,
      width,
      height,
      toJSON: () => ({}),
    } as DOMRect
  })
}

beforeEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
  installCanvasMocks()
})

function createApp(width = 960, height = 640): NovaApp<TestEvents> {
  const canvas = document.createElement('canvas')
  document.body.appendChild(canvas)
  const app = Nova.createApp<TestEvents>({
    target: canvas,
    size: { width, height, dpr: 1 },
    input: {
      pointer: { enabled: false },
      keyboard: { enabled: false, scope: 'manual' },
    },
    renderer: { main: RendererType.Web2D },
    scheduler: { type: RaphSchedulerType.Sync, loop: false },
  })
  registerNovaUIKit(app.schema)
  registerNovaDataTable(app.schema)
  return app
}

function mountRoot(app: NovaApp<TestEvents>): DataTableRootNode<EnterpriseRow> {
  const surface = app.createSurface('datatable-clipboard-enterprise-test')
  const uiRoot = app.schema.createNode(surface, {
    type: NovaUIKit.Root,
    id: 'ui-root',
    props: { width: 900, height: 520 },
    children: [
      {
        type: NovaDataTableSchema.Root,
        id: 'table',
        props: {
          rows: enterpriseRows(16),
          rowKey: 'id',
          columns: enterpriseColumns(),
          selection: {
            mode: 'cell',
            cardinality: 'multiple',
            allowedUnits: { cells: true },
          },
          clipboard: {
            copy: { format: 'tsv', onlyVisibleColumns: true },
            paste: { enabled: true, parseFormat: 'tsv', invalid: 'reject', readonly: 'reject' },
          },
        },
        layout: {
          width: '100%',
          height: '100%',
        },
      },
    ],
  })
  app.raph.run()
  app.raph.run()
  return uiRoot.children[0] as DataTableRootNode<EnterpriseRow>
}

describe('dataTable enterprise clipboard paste', () => {
  it('parses and validates a typed TSV matrix through the public root API', async () => {
    const app = createApp()
    const root = mountRoot(app)
    const onPasteCommit = vi.fn()
    const onPasteError = vi.fn()

    root.setProps({
      onPasteCommit,
      onPasteError,
    } as never)
    root.getApi().selectCell('row-0', 'name')

    const result = await root.getApi().pasteClipboard([
      'Alpha\t42.5\ttrue\t{"tier":"platinum"}\tdone',
      'Beta\t7\t0\t{"tier":"bronze"}\thold',
    ].join('\n'))

    expect(result).toMatchObject({
      committed: 10,
      skipped: 0,
      invalid: [],
    })
    expect(root.store.getRow('row-0')).toMatchObject({
      name: 'Alpha',
      amount: 42.5,
      active: true,
      meta: { tier: 'platinum' },
      status: 'DONE',
    })
    expect(root.store.getRow('row-1')).toMatchObject({
      name: 'Beta',
      amount: 7,
      active: false,
      meta: { tier: 'bronze' },
      status: 'HOLD',
    })
    expect(onPasteCommit).toHaveBeenCalledWith(result)
    expect(onPasteError).not.toHaveBeenCalled()

    app.destroy()
  })

  it('rejects invalid typed cells and reports paste errors without committing deltas', async () => {
    const app = createApp()
    const root = mountRoot(app)
    const onPasteCommit = vi.fn()
    const onPasteError = vi.fn()

    root.setProps({
      onPasteCommit,
      onPasteError,
    } as never)
    root.getApi().selectCell('row-0', 'amount')

    const result = await root.getApi().pasteClipboard('not-a-number')

    expect(result).toMatchObject({
      committed: 0,
      skipped: 1,
      deltas: [],
    })
    expect(result.invalid[0]).toMatchObject({
      rowId: 'row-0',
      rowIndex: 0,
      columnId: 'amount',
      raw: 'not-a-number',
      message: 'Invalid number',
    })
    expect((root as any)._clipboardFeedback).toMatchObject({
      visible: true,
      tone: 'error',
      reason: 'paste-rejected',
      committed: 0,
      invalid: result.invalid,
      result,
    })
    expect(root.store.getRow('row-0')?.amount).toBe(0)
    expect(onPasteCommit).not.toHaveBeenCalled()
    expect(onPasteError).toHaveBeenCalledWith({
      message: 'Paste validation failed',
      result,
    })

    app.destroy()
  })

  it('commits valid cells and keeps invalid cells visible when invalid policy is commit-valid', async () => {
    const app = createApp()
    const root = mountRoot(app)
    const onPasteCommit = vi.fn()
    const onPasteError = vi.fn()

    root.setProps({
      clipboard: {
        copy: { format: 'tsv', onlyVisibleColumns: true },
        paste: { enabled: true, parseFormat: 'tsv', invalid: 'commit-valid', readonly: 'reject' },
      },
      onPasteCommit,
      onPasteError,
    } as never)
    root.getApi().selectCell('row-0', 'name')

    const result = await root.getApi().pasteClipboard('Updated\tnot-a-number\t1')

    expect(result.committed).toBe(2)
    expect(result.skipped).toBe(1)
    expect(result.invalid).toHaveLength(1)
    expect(result.invalid[0]).toMatchObject({ columnId: 'amount', message: 'Invalid number' })
    expect((root as any)._clipboardFeedback).toMatchObject({
      visible: true,
      tone: 'warning',
      reason: 'paste-partial',
      committed: 2,
      invalid: result.invalid,
      result,
    })
    expect(root.store.getRow('row-0')).toMatchObject({
      name: 'Updated',
      amount: 0,
      active: true,
    })
    expect(onPasteCommit).toHaveBeenCalledWith(result)
    expect(onPasteError).not.toHaveBeenCalled()

    app.destroy()
  })

  it('applies readonly skip and reject policies for locked cells', async () => {
    const app = createApp()
    const root = mountRoot(app)
    const onPasteError = vi.fn()

    root.setProps({
      clipboard: {
        copy: { format: 'tsv', onlyVisibleColumns: true },
        paste: { enabled: true, parseFormat: 'tsv', invalid: 'commit-valid', readonly: 'skip' },
      },
      onPasteError,
    } as never)
    root.getApi().selectCell('row-1', 'lockedValue')

    const skipped = await root.getApi().pasteClipboard('allowed-only-on-unlocked')

    expect(skipped).toMatchObject({
      committed: 0,
      skipped: 1,
      invalid: [],
      deltas: [],
    })
    expect(root.store.getRow('row-1')?.lockedValue).toBe('locked-1')
    expect(onPasteError).not.toHaveBeenCalled()

    root.setProps({
      clipboard: {
        copy: { format: 'tsv', onlyVisibleColumns: true },
        paste: { enabled: true, parseFormat: 'tsv', invalid: 'reject', readonly: 'reject' },
      },
    } as never)

    const rejected = await root.getApi().pasteClipboard('reject-locked')

    expect(rejected.committed).toBe(0)
    expect(rejected.invalid[0]).toMatchObject({
      rowId: 'row-1',
      columnId: 'lockedValue',
      raw: 'reject-locked',
      message: 'Cell is readonly',
    })
    expect(root.store.getRow('row-1')?.lockedValue).toBe('locked-1')
    expect(onPasteError).toHaveBeenCalledWith({
      message: 'Paste validation failed',
      result: rejected,
    })

    app.destroy()
  })

  it('allows onBeforePaste to replace parsed matrix commits with an explicit delta transaction', async () => {
    const app = createApp()
    const root = mountRoot(app)
    const overrideDeltas = [
      { type: 'setCell' as const, rowId: 'row-0', columnId: 'name', value: 'Callback override' },
      { type: 'setCell' as const, rowId: 'row-0', columnId: 'amount', value: 777 },
    ]
    const onBeforePaste = vi.fn(() => overrideDeltas)
    const onPasteCommit = vi.fn()

    root.setProps({
      onBeforePaste,
      onPasteCommit,
    } as never)
    root.getApi().selectCell('row-0', 'name')

    const result = await root.getApi().pasteClipboard('ignored\t999')

    expect(onBeforePaste).toHaveBeenCalledWith(expect.objectContaining({
      text: 'ignored\t999',
      matrix: [['ignored', '999']],
      selection: root.getApi().getSelection(),
      store: root.store,
      api: root.getApi(),
    }))
    expect(result).toMatchObject({
      committed: 2,
      skipped: 0,
      invalid: [],
      deltas: overrideDeltas,
    })
    expect(root.store.getRow('row-0')).toMatchObject({
      name: 'Callback override',
      amount: 777,
    })
    expect(onPasteCommit).toHaveBeenCalledWith(result)

    app.destroy()
  })

  it('allows onBeforePaste to cancel paste without commit callbacks', async () => {
    const app = createApp()
    const root = mountRoot(app)
    const onBeforePaste = vi.fn(() => false)
    const onPasteCommit = vi.fn()
    const onPasteError = vi.fn()

    root.setProps({
      onBeforePaste,
      onPasteCommit,
      onPasteError,
    } as never)
    root.getApi().selectCell('row-0', 'name')

    const result = await root.getApi().pasteClipboard('Canceled')

    expect(result).toMatchObject({
      committed: 0,
      skipped: 0,
      invalid: [],
      deltas: [],
    })
    expect(root.store.getRow('row-0')?.name).toBe('Customer 0')
    expect(onPasteCommit).not.toHaveBeenCalled()
    expect(onPasteError).not.toHaveBeenCalled()

    app.destroy()
  })
})

describe('dataTable clipboard feedback contract', () => {
  it('defines visible feedback state expected from future root API integration', () => {
    const partialResult: DataTablePasteResult<EnterpriseRow> = {
      committed: 2,
      skipped: 1,
      invalid: [{ rowId: 'row-0', rowIndex: 0, columnId: 'amount', raw: 'x', message: 'Invalid number' }],
      deltas: [],
    }
    const feedback = createDataTableClipboardPasteFeedback(partialResult, 100)

    expect(feedback).toMatchObject({
      visible: true,
      tone: 'warning',
      reason: 'paste-partial',
      message: 'Pasted 2 cells, skipped 1',
      committed: 2,
      skipped: 1,
      invalid: partialResult.invalid,
      result: partialResult,
      ttlMs: 1600,
      createdAt: 100,
    })
    expect(createDataTableClipboardFeedbackHidden(99)).toMatchObject({
      visible: false,
      tone: 'idle',
      reason: 'idle',
      createdAt: 99,
    })
  })

  it('maps paste errors to visible rejected feedback', () => {
    const result: DataTablePasteResult<EnterpriseRow> = {
      committed: 0,
      skipped: 1,
      invalid: [{ rowId: 'row-0', rowIndex: 0, columnId: 'amount', raw: 'x', message: 'Invalid number' }],
      deltas: [],
    }
    const feedback = createDataTableClipboardPasteErrorFeedback({
      message: 'Paste validation failed',
      result,
    }, 101)

    expect(feedback).toMatchObject({
      visible: true,
      tone: 'error',
      reason: 'paste-rejected',
      message: 'Paste validation failed',
      result,
      createdAt: 101,
    })
  })
})
