export interface UploadStats {
  totalRows: number;
  uploaded: number;
  updated: number;
  skipped: number;
  invalidSchema: number;
  createErrors: number;
  updateErrors: number;
  otherErrors: number;
}

export function createEmptyUploadStats(): UploadStats {
  return {
    totalRows: 0,
    uploaded: 0,
    updated: 0,
    skipped: 0,
    invalidSchema: 0,
    createErrors: 0,
    updateErrors: 0,
    otherErrors: 0,
  };
}

export function aggregateUploadStats(
  total: UploadStats,
  table: UploadStats,
): void {
  total.totalRows += table.totalRows;
  total.uploaded += table.uploaded;
  total.updated += table.updated;
  total.skipped += table.skipped;
  total.invalidSchema += table.invalidSchema;
  total.createErrors += table.createErrors;
  total.updateErrors += table.updateErrors;
  total.otherErrors += table.otherErrors;
}

export function formatUploadSummary(stats: UploadStats): string[] {
  const successful = stats.uploaded + stats.updated;
  const total = stats.totalRows;
  const totalErrors =
    stats.createErrors + stats.updateErrors + stats.otherErrors;
  const successRate = total > 0 ? ((successful / total) * 100).toFixed(1) : '0';

  return [
    '\n🎉 Upload Summary:',
    `📊 Total rows processed: ${stats.totalRows}`,
    `⬆️  Uploaded (new): ${stats.uploaded}`,
    `🔄 Updated (changed): ${stats.updated}`,
    `⏭️  Skipped (identical): ${stats.skipped}`,
    `❌ Invalid schema: ${stats.invalidSchema}`,
    `🚫 Create errors: ${stats.createErrors}`,
    `⚠️  Update errors: ${stats.updateErrors}`,
    `💥 Other errors: ${stats.otherErrors}`,
    `✅ Success rate: ${successRate}% (${totalErrors} total errors)`,
  ];
}

export function formatTableResult(tableId: string, stats: UploadStats): string {
  return `✅ Table ${tableId}: ${stats.uploaded} uploaded, ${stats.updated} updated, ${stats.skipped} skipped, ${stats.invalidSchema} invalid schema, ${stats.createErrors} create errors, ${stats.updateErrors} update errors, ${stats.otherErrors} other errors`;
}
