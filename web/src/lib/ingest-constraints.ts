export const EXPORT_LIMITS = {
  fileBytes: 10 * 1024 * 1024,
  expandedBytes: 40 * 1024 * 1024,
  entries: 256,
  sheets: 32,
  rows: 10_000,
  columns: 32,
  messageChars: 100_000,
  maxMergeCells: 128,
  maxMergeArea: 1_024,
  maxDataValidations: 32,
  maxDataValidationArea: 1_024,
} as const;

export const UPLOAD_FILE_ACCEPT = ".csv,.json,.txt,.xlsx,.eml,.mbox,text/csv,application/json,text/plain";
