import { JsonValuePatch } from '@revisium/schema-toolkit/types';

export interface PatchFile {
  version: '1.0';
  table: string;
  rowId: string;
  createdAt: string;
  patches: JsonValuePatch[];
}

export interface PatchFileMerged {
  version: '1.0';
  table: string;
  createdAt: string;
  rows: PatchRow[];
}

export interface PatchRow {
  rowId: string;
  patches: JsonValuePatch[];
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export interface ValidationError {
  rowId?: string;
  path?: string;
  message: string;
}

export interface DiffResult {
  table: string;
  rows: RowDiff[];
  summary: DiffSummary;
}

export interface RowDiff {
  rowId: string;
  patches: PatchDiff[];
}

export interface PatchDiff {
  path: string;
  currentValue: any;
  newValue: any;
  op: string;
  status: 'CHANGE' | 'SKIP' | 'ERROR';
  error?: string;
}

export interface DiffSummary {
  totalRows: number;
  totalChanges: number;
  skipped: number;
  errors: number;
}
