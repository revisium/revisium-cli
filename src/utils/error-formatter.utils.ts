export interface BatchErrorInfo {
  tableId: string;
  message: string;
  statusCode?: number;
  batchSize?: number;
}

export function formatBatchError(
  error: BatchErrorInfo,
  defaultBatchSize: number,
): string[] {
  const lines: string[] = [
    `\n❌ Operation stopped due to error in table "${error.tableId}"`,
    `   Error: ${error.message}`,
  ];

  if (error.statusCode === 413) {
    lines.push(
      `\n💡 The request payload is too large (HTTP 413).`,
      `   Current batch size: ${error.batchSize ?? defaultBatchSize} rows`,
      `   Try reducing the batch size with --batch-size option.`,
      `   Example: --batch-size 50 or --batch-size 10`,
    );
  } else if (error.statusCode) {
    lines.push(`   HTTP status code: ${error.statusCode}`);
  }

  return lines;
}

export function formatGenericError(context: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `${context}: ${message}`;
}
