export interface SyncOptions {
  commit?: boolean;
  dryRun?: boolean;
  tables?: string[];
  batchSize?: number;
}

export interface SchemaSyncResult {
  migrationsApplied: number;
  tablesCreated: string[];
  tablesUpdated: string[];
  tablesRemoved: string[];
}

export interface TableSyncResult {
  tableId: string;
  rowsCreated: number;
  rowsUpdated: number;
  rowsSkipped: number;
  errors: number;
}

export interface DataSyncResult {
  tables: TableSyncResult[];
  totalRowsCreated: number;
  totalRowsUpdated: number;
  totalRowsSkipped: number;
  totalErrors: number;
}

export interface SyncResult {
  schema?: SchemaSyncResult;
  data?: DataSyncResult;
}
