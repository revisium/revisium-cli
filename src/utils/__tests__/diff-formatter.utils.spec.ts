import { formatDiffAsTable, formatValue } from '../diff-formatter.utils';
import { DiffResult } from '../../types/patch.types';

describe('diff-formatter utils', () => {
  describe('formatDiffAsTable', () => {
    it('formats diff with changes correctly', () => {
      const diff: DiffResult = {
        table: 'Article',
        rows: [
          {
            rowId: 'row-1',
            patches: [
              {
                path: 'title',
                currentValue: 'Old Title',
                newValue: 'New Title',
                op: 'replace',
                status: 'CHANGE',
              },
            ],
          },
        ],
        summary: {
          totalRows: 1,
          totalChanges: 1,
          skipped: 0,
          errors: 0,
        },
      };

      const result = formatDiffAsTable(diff);

      expect(result).toContain('Table: Article');
      expect(result).toContain('🔄 row-1 (1 change)');
    });

    it('does not show SKIP patches in output', () => {
      const diff: DiffResult = {
        table: 'Article',
        rows: [
          {
            rowId: 'row-1',
            patches: [
              {
                path: 'status',
                currentValue: 'published',
                newValue: 'published',
                op: 'replace',
                status: 'SKIP',
              },
            ],
          },
        ],
        summary: {
          totalRows: 1,
          totalChanges: 0,
          skipped: 1,
          errors: 0,
        },
      };

      const result = formatDiffAsTable(diff);

      // SKIP patches should not be shown
      expect(result).not.toContain('⏭️');
      expect(result).not.toContain('Path: status');
      expect(result).not.toContain('Row: row-1');
    });

    it('shows only CHANGE patches when mixed with SKIP', () => {
      const diff: DiffResult = {
        table: 'Article',
        rows: [
          {
            rowId: 'row-1',
            patches: [
              {
                path: 'title',
                currentValue: 'Old Title',
                newValue: 'New Title',
                op: 'replace',
                status: 'CHANGE',
              },
              {
                path: 'status',
                currentValue: 'published',
                newValue: 'published',
                op: 'replace',
                status: 'SKIP',
              },
              {
                path: 'author',
                currentValue: 'John',
                newValue: 'Jane',
                op: 'replace',
                status: 'CHANGE',
              },
            ],
          },
        ],
        summary: {
          totalRows: 1,
          totalChanges: 2,
          skipped: 1,
          errors: 0,
        },
      };

      const result = formatDiffAsTable(diff);

      // Row should be shown with 2 changes
      expect(result).toContain('🔄 row-1 (2 changes)');

      // SKIP patch should not be shown
      expect(result).not.toContain('⏭️');
    });

    it('formats diff with errors correctly', () => {
      const diff: DiffResult = {
        table: 'Article',
        rows: [
          {
            rowId: 'row-1',
            patches: [
              {
                path: 'invalid.path',
                currentValue: null,
                newValue: 'value',
                op: 'replace',
                status: 'ERROR',
                error: 'Path not found',
              },
            ],
          },
        ],
        summary: {
          totalRows: 1,
          totalChanges: 0,
          skipped: 0,
          errors: 1,
        },
      };

      const result = formatDiffAsTable(diff);

      expect(result).toContain('🔄 row-1 (0 changes, 1 error)');
    });

    it('formats multiple rows correctly', () => {
      const diff: DiffResult = {
        table: 'Article',
        rows: [
          {
            rowId: 'row-1',
            patches: [
              {
                path: 'title',
                currentValue: 'Title 1',
                newValue: 'New Title 1',
                op: 'replace',
                status: 'CHANGE',
              },
            ],
          },
          {
            rowId: 'row-2',
            patches: [
              {
                path: 'title',
                currentValue: 'Title 2',
                newValue: 'New Title 2',
                op: 'replace',
                status: 'CHANGE',
              },
            ],
          },
        ],
        summary: {
          totalRows: 2,
          totalChanges: 2,
          skipped: 0,
          errors: 0,
        },
      };

      const result = formatDiffAsTable(diff);

      expect(result).toContain('🔄 row-1 (1 change)');
      expect(result).toContain('🔄 row-2 (1 change)');
    });

    it('formats nested paths correctly', () => {
      const diff: DiffResult = {
        table: 'Article',
        rows: [
          {
            rowId: 'row-1',
            patches: [
              {
                path: 'metadata.author',
                currentValue: 'John',
                newValue: 'Jane',
                op: 'replace',
                status: 'CHANGE',
              },
            ],
          },
        ],
        summary: {
          totalRows: 1,
          totalChanges: 1,
          skipped: 0,
          errors: 0,
        },
      };

      const result = formatDiffAsTable(diff);

      expect(result).toContain('🔄 row-1 (1 change)');
    });

    it('handles empty rows array', () => {
      const diff: DiffResult = {
        table: 'Article',
        rows: [],
        summary: {
          totalRows: 0,
          totalChanges: 0,
          skipped: 0,
          errors: 0,
        },
      };

      const result = formatDiffAsTable(diff);

      expect(result).toContain('Table: Article');
    });
  });

  describe('formatValue', () => {
    it('formats null as "null"', () => {
      expect(formatValue(null)).toBe('null');
    });

    it('formats undefined as "undefined"', () => {
      expect(formatValue(undefined)).toBe('undefined');
    });

    it('formats strings with quotes', () => {
      expect(formatValue('hello')).toBe('"hello"');
    });

    it('formats numbers correctly', () => {
      expect(formatValue(42)).toBe('42');
      expect(formatValue(3.14)).toBe('3.14');
    });

    it('formats booleans correctly', () => {
      expect(formatValue(true)).toBe('true');
      expect(formatValue(false)).toBe('false');
    });

    it('formats objects as JSON', () => {
      const result = formatValue({ key: 'value' });
      expect(result).toContain('key');
      expect(result).toContain('value');
    });

    it('formats arrays as JSON', () => {
      const result = formatValue([1, 2, 3]);
      expect(result).toContain('[');
      expect(result).toContain(']');
    });

    it('truncates long strings', () => {
      const longString = 'a'.repeat(200);
      const result = formatValue(longString);

      expect(result.length).toBeLessThan(105);
      expect(result).toContain('...');
    });

    it('truncates long objects', () => {
      const longObject = {
        key1: 'value1'.repeat(20),
        key2: 'value2'.repeat(20),
        key3: 'value3'.repeat(20),
      };
      const result = formatValue(longObject);

      expect(result.length).toBeLessThanOrEqual(100);
      expect(result).toContain('...');
    });

    it('handles nested objects', () => {
      const nested = {
        outer: {
          inner: {
            value: 'deep',
          },
        },
      };
      const result = formatValue(nested);

      expect(result).toContain('outer');
      expect(result).toContain('inner');
    });

    it('handles objects that cannot be stringified', () => {
      const circular: Record<string, unknown> = {};
      circular.self = circular;

      const result = formatValue(circular);

      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('formats empty string correctly', () => {
      expect(formatValue('')).toBe('""');
    });

    it('formats empty array correctly', () => {
      expect(formatValue([])).toBe('[]');
    });

    it('formats empty object correctly', () => {
      expect(formatValue({})).toBe('{}');
    });
  });
});
