export type RunStreamEvent =
  | { type: 'run_started'; runId: string }
  | { type: 'assistant_message_delta'; runId: string; messageId: string; delta: string }
  | { type: 'assistant_message_completed'; runId: string; messageId: string; text: string }
  | { type: 'run_completed'; runId: string }
  | { type: 'run_failed'; runId: string; message: string }
