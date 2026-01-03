export type ProgressOperation = 'fetch' | 'create' | 'update';

export type ProgressState = {
  operation: ProgressOperation;
  current: number;
  total?: number;
};

export type ProgressLabels = {
  fetch?: string;
  create?: string;
  update?: string;
};

const DEFAULT_LABELS: ProgressLabels = {
  fetch: 'Fetching',
  create: 'Creating',
  update: 'Updating',
};

export function printProgress(
  state: ProgressState,
  options: { labels?: ProgressLabels; indent?: string } = {},
): void {
  const labels = { ...DEFAULT_LABELS, ...options.labels };
  const indent = options.indent ?? '  ';

  const label = labels[state.operation] ?? state.operation;
  const progress =
    state.operation === 'fetch' || state.total === undefined
      ? `${indent}${label}: ${state.current} rows`
      : `${indent}${label}: ${state.current}/${state.total} rows`;

  process.stdout.write(`\r${progress}`);
}

export function clearProgressLine(): void {
  process.stdout.write('\r\x1b[K');
}

export type ProgressReporter = {
  update: (state: ProgressState) => void;
  clear: () => void;
};

export function createProgressReporter(
  options: { labels?: ProgressLabels; indent?: string } = {},
): ProgressReporter {
  return {
    update: (state: ProgressState) => printProgress(state, options),
    clear: clearProgressLine,
  };
}
