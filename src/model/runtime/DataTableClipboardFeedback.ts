import type {
  DataTablePasteError,
  DataTablePasteInvalidCell,
  DataTablePasteResult,
} from '@/model/types/datatable.types'

export type DataTableClipboardFeedbackTone = 'idle' | 'success' | 'warning' | 'error'
export type DataTableClipboardFeedbackReason = 'idle' | 'paste-committed' | 'paste-partial' | 'paste-rejected'

export interface DataTableClipboardFeedbackState<Row extends Record<string, any> = Record<string, any>> {
  visible: boolean
  tone: DataTableClipboardFeedbackTone
  reason: DataTableClipboardFeedbackReason
  message: string
  committed: number
  skipped: number
  invalid: Array<DataTablePasteInvalidCell>
  result?: DataTablePasteResult<Row>
  error?: unknown
  ttlMs: number
  createdAt: number
}

export const DATATABLE_CLIPBOARD_FEEDBACK_TTL_MS = 1600

/**
 * Создает скрытое состояние clipboard feedback для будущей привязки к root API.
 */
export function createDataTableClipboardFeedbackHidden(
  createdAt = Date.now(),
): DataTableClipboardFeedbackState {
  return {
    visible: false,
    tone: 'idle',
    reason: 'idle',
    message: '',
    committed: 0,
    skipped: 0,
    invalid: [],
    ttlMs: DATATABLE_CLIPBOARD_FEEDBACK_TTL_MS,
    createdAt,
  }
}

/**
 * Создает видимое состояние результата paste без зависимости от DataTableRootNode.
 */
export function createDataTableClipboardPasteFeedback<Row extends Record<string, any>>(
  result: DataTablePasteResult<Row>,
  createdAt = Date.now(),
): DataTableClipboardFeedbackState<Row> {
  const rejected = result.committed === 0 && result.invalid.length > 0
  const partial = !rejected && (result.skipped > 0 || result.invalid.length > 0)

  return {
    visible: true,
    tone: rejected ? 'error' : partial ? 'warning' : 'success',
    reason: rejected ? 'paste-rejected' : partial ? 'paste-partial' : 'paste-committed',
    message: formatPasteFeedbackMessage(result, rejected, partial),
    committed: result.committed,
    skipped: result.skipped,
    invalid: result.invalid,
    result,
    ttlMs: DATATABLE_CLIPBOARD_FEEDBACK_TTL_MS,
    createdAt,
  }
}

/**
 * Создает видимое состояние ошибки paste без привязки к DOM overlay.
 */
export function createDataTableClipboardPasteErrorFeedback<Row extends Record<string, any>>(
  error: DataTablePasteError<Row>,
  createdAt = Date.now(),
): DataTableClipboardFeedbackState<Row> {
  const fallback = error.result
    ? createDataTableClipboardPasteFeedback(error.result, createdAt)
    : createDataTableClipboardFeedbackHidden(createdAt)

  return {
    ...fallback,
    visible: true,
    tone: 'error',
    reason: 'paste-rejected',
    message: error.message,
    error: error.error,
    result: error.result,
  }
}

function formatPasteFeedbackMessage<Row extends Record<string, any>>(
  result: DataTablePasteResult<Row>,
  rejected: boolean,
  partial: boolean,
): string {
  if (rejected) return `Paste rejected: ${result.invalid.length} invalid cells`
  if (partial) return `Pasted ${result.committed} cells, skipped ${result.skipped}`
  return `Pasted ${result.committed} cells`
}
