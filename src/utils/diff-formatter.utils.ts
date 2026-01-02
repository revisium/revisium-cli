import { DiffResult } from '../types/patch.types';

export function formatDiffAsTable(diff: DiffResult): string {
  const lines: string[] = [];

  lines.push(`Table: ${diff.table}\n`);

  for (const row of diff.rows) {
    const changes = row.patches.filter((p) => p.status === 'CHANGE');
    const errors = row.patches.filter((p) => p.status === 'ERROR');

    if (changes.length === 0 && errors.length === 0) {
      continue;
    }

    const changesText =
      changes.length === 1 ? '1 change' : `${changes.length} changes`;
    const errorSuffix = errors.length === 1 ? '' : 's';
    const errorsText =
      errors.length > 0 ? `, ${errors.length} error${errorSuffix}` : '';

    lines.push(`🔄 ${row.rowId} (${changesText}${errorsText})`);
  }

  return lines.join('\n');
}

export function formatValue(value: unknown): string {
  if (value === null) {
    return 'null';
  }

  if (value === undefined) {
    return 'undefined';
  }

  try {
    const str = JSON.stringify(value);
    return str.length > 100 ? str.slice(0, 97) + '...' : str;
  } catch {
    if (typeof value === 'object') {
      return '[Object]';
    }
    if (typeof value === 'string') {
      return value;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    return '[Unknown]';
  }
}
