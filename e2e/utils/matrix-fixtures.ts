/**
 * Pure fixture builders for the matrix. Each function returns deep copies so
 * tests can mutate freely without leaking state between cases.
 */

export interface BootstrapTableConfig {
  id: string;
  schema: object;
}

export interface BootstrapRowConfig {
  tableId: string;
  rowId: string;
  data: object;
}

export interface BootstrapConfigShape {
  projectName?: string;
  branchName?: string;
  endpoints?: Array<'REST_API' | 'GRAPHQL'>;
  tables?: BootstrapTableConfig[];
  rows?: BootstrapRowConfig[];
  commitMessage?: string;
}

// --- table schemas ----------------------------------------------------------

export function tagSchema(): object {
  return clone({
    type: 'object',
    required: ['label'],
    additionalProperties: false,
    properties: {
      label: { type: 'string', default: '' },
      slug: { type: 'string', default: '' },
    },
  });
}

export function faqSchema(): object {
  return clone({
    type: 'object',
    required: ['name'],
    additionalProperties: false,
    properties: {
      name: { type: 'string', default: '' },
      summary: { type: 'string', default: '' },
    },
  });
}

export function questSchema(): object {
  return clone({
    type: 'object',
    required: ['title'],
    additionalProperties: false,
    properties: {
      title: { type: 'string', default: '' },
      points: { type: 'integer', default: 0 },
      published: { type: 'boolean', default: false },
    },
  });
}

// --- row builders -----------------------------------------------------------

export function tagRows(count: number = 3): BootstrapRowConfig[] {
  return Array.from({ length: count }, (_, i) => ({
    tableId: 'Tag',
    rowId: `tag-${i + 1}`,
    data: { label: `Tag ${i + 1}`, slug: `tag-${i + 1}` },
  }));
}

export function faqRows(): BootstrapRowConfig[] {
  return [
    {
      tableId: 'FaqCategory',
      rowId: 'billing',
      data: { name: 'Billing', summary: 'Payments and invoices' },
    },
    {
      tableId: 'FaqCategory',
      rowId: 'general',
      data: { name: 'General', summary: 'Anything else' },
    },
  ];
}

export function questRows(count: number = 50): BootstrapRowConfig[] {
  return Array.from({ length: count }, (_, i) => ({
    tableId: 'Quest',
    rowId: `quest-${String(i + 1).padStart(3, '0')}`,
    data: {
      title: `Quest ${i + 1}`,
      points: (i + 1) * 10,
      published: i % 2 === 0,
    },
  }));
}

// --- bootstrap configs ------------------------------------------------------

export function bootstrapConfig(
  partial: BootstrapConfigShape = {},
): BootstrapConfigShape {
  return clone({
    endpoints: ['REST_API', 'GRAPHQL'],
    tables: [],
    rows: [],
    ...partial,
  });
}

export function tagBootstrapConfig(projectName: string): BootstrapConfigShape {
  return bootstrapConfig({
    projectName,
    branchName: 'master',
    endpoints: ['REST_API'],
    tables: [{ id: 'Tag', schema: tagSchema() }],
    rows: tagRows(3),
    commitMessage: 'Bootstrap tag fixture',
  });
}

export function faqBootstrapConfig(projectName: string): BootstrapConfigShape {
  return bootstrapConfig({
    projectName,
    branchName: 'master',
    endpoints: ['REST_API', 'GRAPHQL'],
    tables: [{ id: 'FaqCategory', schema: faqSchema() }],
    rows: faqRows(),
    commitMessage: 'Bootstrap faq fixture',
  });
}

// --- helpers ----------------------------------------------------------------

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
