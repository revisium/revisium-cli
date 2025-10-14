import Ajv from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { patchFileSchema, patchFileMergedSchema } from '../patch-file.schema';
import { jsonValuePatchSchema } from '../json-value-patch-schema';

describe('Patch File Schemas', () => {
  let ajv: Ajv;

  beforeEach(() => {
    ajv = new Ajv();
    addFormats(ajv);

    ajv.compile(jsonValuePatchSchema);
    ajv.compile(patchFileSchema);
    ajv.compile(patchFileMergedSchema);
  });

  describe('jsonValuePatchSchema', () => {
    it('validates replace operation', () => {
      const validate = ajv.compile(jsonValuePatchSchema);

      const data = [
        {
          op: 'replace',
          path: 'title',
          value: 'New Title',
        },
      ];

      expect(validate(data)).toBe(true);
    });

    it('validates add operation', () => {
      const validate = ajv.compile(jsonValuePatchSchema);

      const data = [
        {
          op: 'add',
          path: 'tags[0]',
          value: 'new-tag',
        },
      ];

      expect(validate(data)).toBe(true);
    });

    it('validates remove operation', () => {
      const validate = ajv.compile(jsonValuePatchSchema);

      const data = [
        {
          op: 'remove',
          path: 'oldField',
        },
      ];

      expect(validate(data)).toBe(true);
    });

    it('validates multiple operations', () => {
      const validate = ajv.compile(jsonValuePatchSchema);

      const data = [
        { op: 'replace', path: 'title', value: 'Title' },
        { op: 'add', path: 'tags[0]', value: 'tag' },
        { op: 'remove', path: 'oldField' },
      ];

      expect(validate(data)).toBe(true);
    });

    it('validates nested path', () => {
      const validate = ajv.compile(jsonValuePatchSchema);

      const data = [
        {
          op: 'replace',
          path: 'address.city',
          value: 'Moscow',
        },
      ];

      expect(validate(data)).toBe(true);
    });

    it('validates array path', () => {
      const validate = ajv.compile(jsonValuePatchSchema);

      const data = [
        {
          op: 'replace',
          path: 'users[0].name',
          value: 'John',
        },
      ];

      expect(validate(data)).toBe(true);
    });

    it('validates value of any type', () => {
      const validate = ajv.compile(jsonValuePatchSchema);

      const testCases = [
        { op: 'replace', path: 'stringField', value: 'string' },
        { op: 'replace', path: 'numberField', value: 123 },
        { op: 'replace', path: 'booleanField', value: true },
        { op: 'replace', path: 'nullField', value: null },
        { op: 'replace', path: 'objectField', value: { a: 1 } },
        { op: 'replace', path: 'arrayField', value: [1, 2, 3] },
      ];

      for (const testCase of testCases) {
        expect(validate([testCase])).toBe(true);
      }
    });

    it('rejects empty array', () => {
      const validate = ajv.compile(jsonValuePatchSchema);
      expect(validate([])).toBe(false);
    });

    it('rejects invalid operation', () => {
      const validate = ajv.compile(jsonValuePatchSchema);

      const data = [
        {
          op: 'invalid',
          path: 'field',
          value: 'value',
        },
      ];

      expect(validate(data)).toBe(false);
    });

    it('rejects missing required fields for replace', () => {
      const validate = ajv.compile(jsonValuePatchSchema);

      expect(validate([{ op: 'replace', path: 'field' }])).toBe(false);
      expect(validate([{ op: 'replace', value: 'value' }])).toBe(false);
    });

    it('rejects missing required fields for remove', () => {
      const validate = ajv.compile(jsonValuePatchSchema);

      expect(validate([{ op: 'remove' }])).toBe(false);
    });

    it('rejects missing required fields for move', () => {
      const validate = ajv.compile(jsonValuePatchSchema);

      expect(validate([{ op: 'move', path: 'newPath' }])).toBe(false);
      expect(validate([{ op: 'move', from: 'oldPath' }])).toBe(false);
    });

    it('rejects additional properties', () => {
      const validate = ajv.compile(jsonValuePatchSchema);

      const data = [
        {
          op: 'replace',
          path: 'field',
          value: 'value',
          extra: 'not allowed',
        },
      ];

      expect(validate(data)).toBe(false);
    });
  });

  describe('patchFileSchema', () => {
    it('validates valid PatchFile', () => {
      const validate = ajv.compile(patchFileSchema);

      const data = {
        version: '1.0',
        table: 'Article',
        rowId: 'row-123',
        createdAt: '2025-10-14T12:00:00Z',
        patches: [
          {
            op: 'replace',
            path: 'title',
            value: 'New Title',
          },
        ],
      };

      expect(validate(data)).toBe(true);
    });

    it('rejects missing required fields', () => {
      const validate = ajv.compile(patchFileSchema);

      expect(validate({ version: '1.0', table: 'Article' })).toBe(false);
      expect(validate({ version: '1.0', rowId: 'row-123' })).toBe(false);
      expect(
        validate({
          version: '1.0',
          table: 'Article',
          rowId: 'row-123',
          createdAt: '2025-10-14T12:00:00Z',
        }),
      ).toBe(false);
    });

    it('rejects invalid version', () => {
      const validate = ajv.compile(patchFileSchema);

      const data = {
        version: '2.0',
        table: 'Article',
        rowId: 'row-123',
        createdAt: '2025-10-14T12:00:00Z',
        patches: [],
      };

      expect(validate(data)).toBe(false);
    });

    it('rejects empty table name', () => {
      const validate = ajv.compile(patchFileSchema);

      const data = {
        version: '1.0',
        table: '',
        rowId: 'row-123',
        createdAt: '2025-10-14T12:00:00Z',
        patches: [{ op: 'replace', path: 'title', value: 'Title' }],
      };

      expect(validate(data)).toBe(false);
    });

    it('rejects empty rowId', () => {
      const validate = ajv.compile(patchFileSchema);

      const data = {
        version: '1.0',
        table: 'Article',
        rowId: '',
        createdAt: '2025-10-14T12:00:00Z',
        patches: [{ op: 'replace', path: 'title', value: 'Title' }],
      };

      expect(validate(data)).toBe(false);
    });

    it('rejects invalid date format', () => {
      const validate = ajv.compile(patchFileSchema);

      const data = {
        version: '1.0',
        table: 'Article',
        rowId: 'row-123',
        createdAt: 'not-a-date',
        patches: [{ op: 'replace', path: 'title', value: 'Title' }],
      };

      expect(validate(data)).toBe(false);
    });

    it('rejects additional properties', () => {
      const validate = ajv.compile(patchFileSchema);

      const data = {
        version: '1.0',
        table: 'Article',
        rowId: 'row-123',
        createdAt: '2025-10-14T12:00:00Z',
        patches: [{ op: 'replace', path: 'title', value: 'Title' }],
        extra: 'not allowed',
      };

      expect(validate(data)).toBe(false);
    });
  });

  describe('patchFileMergedSchema', () => {
    it('validates valid PatchFileMerged', () => {
      const validate = ajv.compile(patchFileMergedSchema);

      const data = {
        version: '1.0',
        table: 'Article',
        createdAt: '2025-10-14T12:00:00Z',
        rows: [
          {
            rowId: 'row-1',
            patches: [{ op: 'replace', path: 'title', value: 'Title 1' }],
          },
          {
            rowId: 'row-2',
            patches: [{ op: 'replace', path: 'title', value: 'Title 2' }],
          },
        ],
      };

      expect(validate(data)).toBe(true);
    });

    it('rejects missing required fields', () => {
      const validate = ajv.compile(patchFileMergedSchema);

      expect(validate({ version: '1.0', table: 'Article' })).toBe(false);
      expect(validate({ version: '1.0', rows: [] })).toBe(false);
    });

    it('rejects empty rows array', () => {
      const validate = ajv.compile(patchFileMergedSchema);

      const data = {
        version: '1.0',
        table: 'Article',
        createdAt: '2025-10-14T12:00:00Z',
        rows: [],
      };

      expect(validate(data)).toBe(false);
    });

    it('rejects invalid row structure', () => {
      const validate = ajv.compile(patchFileMergedSchema);

      const data = {
        version: '1.0',
        table: 'Article',
        createdAt: '2025-10-14T12:00:00Z',
        rows: [
          {
            rowId: 'row-1',
            // missing patches
          },
        ],
      };

      expect(validate(data)).toBe(false);
    });

    it('rejects empty rowId in rows', () => {
      const validate = ajv.compile(patchFileMergedSchema);

      const data = {
        version: '1.0',
        table: 'Article',
        createdAt: '2025-10-14T12:00:00Z',
        rows: [
          {
            rowId: '',
            patches: [{ op: 'replace', path: 'title', value: 'Title' }],
          },
        ],
      };

      expect(validate(data)).toBe(false);
    });

    it('rejects additional properties in rows', () => {
      const validate = ajv.compile(patchFileMergedSchema);

      const data = {
        version: '1.0',
        table: 'Article',
        createdAt: '2025-10-14T12:00:00Z',
        rows: [
          {
            rowId: 'row-1',
            patches: [{ op: 'replace', path: 'title', value: 'Title' }],
            extra: 'not allowed',
          },
        ],
      };

      expect(validate(data)).toBe(false);
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });
});
