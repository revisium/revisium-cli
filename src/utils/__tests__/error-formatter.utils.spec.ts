import { formatBatchError, formatGenericError } from '../error-formatter.utils';

describe('error-formatter.utils', () => {
  describe('formatBatchError', () => {
    it('formats basic error with table id and message', () => {
      const lines = formatBatchError(
        { tableId: 'users', message: 'Connection failed' },
        100,
      );

      expect(lines).toContain(
        '\n❌ Operation stopped due to error in table "users"',
      );
      expect(lines).toContain('   Error: Connection failed');
    });

    it('formats 413 error with batch size recommendations', () => {
      const lines = formatBatchError(
        { tableId: 'products', message: 'Payload too large', statusCode: 413 },
        100,
      );

      expect(lines).toContain(
        '\n❌ Operation stopped due to error in table "products"',
      );
      expect(lines).toContain('   Error: Payload too large');
      expect(lines).toContain(
        '\n💡 The request payload is too large (HTTP 413).',
      );
      expect(lines).toContain('   Current batch size: 100 rows');
      expect(lines).toContain(
        '   Try reducing the batch size with --batch-size option.',
      );
      expect(lines).toContain('   Example: --batch-size 50 or --batch-size 10');
    });

    it('uses error batchSize when provided', () => {
      const lines = formatBatchError(
        {
          tableId: 'orders',
          message: 'Too large',
          statusCode: 413,
          batchSize: 50,
        },
        100,
      );

      expect(lines).toContain('   Current batch size: 50 rows');
    });

    it('formats other HTTP errors with status code', () => {
      const lines = formatBatchError(
        { tableId: 'items', message: 'Server error', statusCode: 500 },
        100,
      );

      expect(lines).toContain('   HTTP status code: 500');
      expect(lines).not.toContain('payload is too large');
    });

    it('formats error without status code', () => {
      const lines = formatBatchError(
        { tableId: 'data', message: 'Unknown error' },
        100,
      );

      expect(lines.length).toBe(2);
      expect(lines).not.toContain('HTTP status code');
    });
  });

  describe('formatGenericError', () => {
    it('formats Error instance', () => {
      const result = formatGenericError(
        'Operation failed',
        new Error('Network timeout'),
      );
      expect(result).toBe('Operation failed: Network timeout');
    });

    it('formats string error', () => {
      const result = formatGenericError(
        'Process error',
        'Something went wrong',
      );
      expect(result).toBe('Process error: Something went wrong');
    });

    it('formats non-string error', () => {
      const result = formatGenericError('Unknown', { code: 123 });
      expect(result).toBe('Unknown: [object Object]');
    });
  });
});
