export class TableOperationError extends Error {
  constructor(
    message: string,
    public readonly tableId: string,
    public readonly statusCode?: number,
    public readonly batchSize?: number,
  ) {
    super(message);
    this.name = 'TableOperationError';
  }
}

export class RowSyncError extends TableOperationError {
  constructor(
    message: string,
    tableId: string,
    statusCode?: number,
    batchSize?: number,
  ) {
    super(message, tableId, statusCode, batchSize);
    this.name = 'RowSyncError';
  }
}

export class UploadError extends TableOperationError {
  constructor(
    message: string,
    tableId: string,
    statusCode?: number,
    batchSize?: number,
  ) {
    super(message, tableId, statusCode, batchSize);
    this.name = 'UploadError';
  }
}
