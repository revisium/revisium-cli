import { Test, TestingModule } from '@nestjs/testing';
import { PatchValidationService } from '../patch-validation.service';
import { CoreApiService } from '../core-api.service';
import { DraftRevisionService } from '../draft-revision.service';
import { JsonValidatorService } from '../json-validator.service';
import { PatchFile } from '../../types/patch.types';
import { JsonSchema, JsonSchemaTypeName } from '@revisium/schema-toolkit/types';

describe('PatchValidationService', () => {
  let service: PatchValidationService;
  let coreApiService: jest.Mocked<CoreApiService>;

  const mockTableSchema: JsonSchema = {
    type: JsonSchemaTypeName.Object,
    required: [],
    additionalProperties: false,
    properties: {
      id: { type: JsonSchemaTypeName.String, default: '' },
      title: { type: JsonSchemaTypeName.String, default: '' },
      count: { type: JsonSchemaTypeName.Number, default: 0 },
      price: { type: JsonSchemaTypeName.Number, default: 0 },
      active: { type: JsonSchemaTypeName.Boolean, default: false },
      tags: {
        type: JsonSchemaTypeName.Array,
        items: { type: JsonSchemaTypeName.String, default: '' },
      },
      metadata: {
        type: JsonSchemaTypeName.Object,
        required: [],
        additionalProperties: false,
        properties: {
          author: { type: JsonSchemaTypeName.String, default: '' },
          version: { type: JsonSchemaTypeName.Number, default: 0 },
        },
      },
      description: { type: JsonSchemaTypeName.String, default: '' },
    },
  };

  beforeEach(async () => {
    const mockCoreApi = {
      api: {
        tableSchema: jest.fn(),
      },
    };

    const mockDraftRevision = {
      getDraftRevisionId: jest.fn().mockResolvedValue('test-revision-id'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PatchValidationService,
        JsonValidatorService,
        {
          provide: CoreApiService,
          useValue: mockCoreApi,
        },
        {
          provide: DraftRevisionService,
          useValue: mockDraftRevision,
        },
      ],
    }).compile();

    service = module.get<PatchValidationService>(PatchValidationService);
    coreApiService = module.get(CoreApiService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validateFormat', () => {
    it('validates valid PatchFile', () => {
      const patchFile: PatchFile = {
        version: '1.0',
        table: 'Article',
        rowId: 'row-1',
        createdAt: '2025-10-14T12:00:00Z',
        patches: [{ op: 'replace', path: 'title', value: 'New Title' }],
      };

      const result = service.validateFormat(patchFile);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects invalid version', () => {
      const patchFile = {
        version: '2.0',
        table: 'Article',
        rowId: 'row-1',
        createdAt: '2025-10-14T12:00:00Z',
        patches: [{ op: 'replace', path: 'title', value: 'New Title' }],
      } as unknown as PatchFile;

      const result = service.validateFormat(patchFile);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('rejects missing required fields', () => {
      const patchFile = {
        version: '1.0',
        table: 'Article',
        createdAt: '2025-10-14T12:00:00Z',
        patches: [],
      } as unknown as PatchFile;

      const result = service.validateFormat(patchFile);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('rejects invalid date format', () => {
      const patchFile = {
        version: '1.0',
        table: 'Article',
        rowId: 'row-1',
        createdAt: 'not-a-date',
        patches: [{ op: 'replace', path: 'title', value: 'Title' }],
      } as unknown as PatchFile;

      const result = service.validateFormat(patchFile);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('rejects empty patches array', () => {
      const patchFile: PatchFile = {
        version: '1.0',
        table: 'Article',
        rowId: 'row-1',
        createdAt: '2025-10-14T12:00:00Z',
        patches: [],
      };

      const result = service.validateFormat(patchFile);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('validates multiple patches', () => {
      const patchFile: PatchFile = {
        version: '1.0',
        table: 'Article',
        rowId: 'row-1',
        createdAt: '2025-10-14T12:00:00Z',
        patches: [
          { op: 'replace', path: 'title', value: 'Title 1' },
          { op: 'add', path: 'tags[0]', value: 'tag1' },
          { op: 'remove', path: 'oldField' },
        ],
      };

      const result = service.validateFormat(patchFile);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('validateAgainstSchema', () => {
    it('validates patches with existing paths', () => {
      const patchFile: PatchFile = {
        version: '1.0',
        table: 'Article',
        rowId: 'row-1',
        createdAt: '2025-10-14T12:00:00Z',
        patches: [{ op: 'replace', path: 'title', value: 'New Title' }],
      };

      const result = service.validateAgainstSchema(patchFile, mockTableSchema);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects patches with non-existent paths', () => {
      const patchFile: PatchFile = {
        version: '1.0',
        table: 'Article',
        rowId: 'row-1',
        createdAt: '2025-10-14T12:00:00Z',
        patches: [{ op: 'replace', path: 'nonexistent', value: 'Some Value' }],
      };

      const result = service.validateAgainstSchema(patchFile, mockTableSchema);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain('Invalid path');
    });

    it('validates correct value types', () => {
      const patchFile: PatchFile = {
        version: '1.0',
        table: 'Article',
        rowId: 'row-1',
        createdAt: '2025-10-14T12:00:00Z',
        patches: [
          { op: 'replace', path: 'title', value: 'String Value' },
          { op: 'replace', path: 'count', value: 42 },
          { op: 'replace', path: 'price', value: 99.99 },
          { op: 'replace', path: 'active', value: true },
        ],
      };

      const result = service.validateAgainstSchema(patchFile, mockTableSchema);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects incorrect value types', () => {
      const patchFile: PatchFile = {
        version: '1.0',
        table: 'Article',
        rowId: 'row-1',
        createdAt: '2025-10-14T12:00:00Z',
        patches: [{ op: 'replace', path: 'count', value: 'not-a-number' }],
      };

      const result = service.validateAgainstSchema(patchFile, mockTableSchema);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain('must be number');
    });

    it('validates nested object paths', () => {
      const patchFile: PatchFile = {
        version: '1.0',
        table: 'Article',
        rowId: 'row-1',
        createdAt: '2025-10-14T12:00:00Z',
        patches: [
          { op: 'replace', path: 'metadata.author', value: 'John Doe' },
          { op: 'replace', path: 'metadata.version', value: 2 },
        ],
      };

      const result = service.validateAgainstSchema(patchFile, mockTableSchema);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects invalid nested paths', () => {
      const patchFile: PatchFile = {
        version: '1.0',
        table: 'Article',
        rowId: 'row-1',
        createdAt: '2025-10-14T12:00:00Z',
        patches: [
          { op: 'replace', path: 'metadata.nonexistent', value: 'value' },
        ],
      };

      const result = service.validateAgainstSchema(patchFile, mockTableSchema);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('validates array paths', () => {
      const patchFile: PatchFile = {
        version: '1.0',
        table: 'Article',
        rowId: 'row-1',
        createdAt: '2025-10-14T12:00:00Z',
        patches: [{ op: 'add', path: 'tags[0]', value: 'new-tag' }],
      };

      const result = service.validateAgainstSchema(patchFile, mockTableSchema);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('validates remove operations without type checking', () => {
      const patchFile: PatchFile = {
        version: '1.0',
        table: 'Article',
        rowId: 'row-1',
        createdAt: '2025-10-14T12:00:00Z',
        patches: [{ op: 'remove', path: 'title' }],
      };

      const result = service.validateAgainstSchema(patchFile, mockTableSchema);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('handles schema validation errors gracefully', () => {
      const patchFile: PatchFile = {
        version: '1.0',
        table: 'Article',
        rowId: 'row-1',
        createdAt: '2025-10-14T12:00:00Z',
        patches: [{ op: 'replace', path: 'title', value: 'Value' }],
      };

      const invalidSchema = null as unknown as JsonSchema;

      const result = service.validateAgainstSchema(patchFile, invalidSchema);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('validate', () => {
    it('performs full validation successfully', async () => {
      const patchFile: PatchFile = {
        version: '1.0',
        table: 'Article',
        rowId: 'row-1',
        createdAt: '2025-10-14T12:00:00Z',
        patches: [{ op: 'replace', path: 'title', value: 'New Title' }],
      };

      (coreApiService.api.tableSchema as jest.Mock).mockResolvedValue({
        data: mockTableSchema,
        error: null,
        ok: true,
        status: 200,
      });

      const result = await service.validate(patchFile, {
        organization: 'org',
        project: 'project',
        branch: 'branch',
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(coreApiService.api.tableSchema).toHaveBeenCalledWith(
        'test-revision-id',
        'Article',
      );
    });

    it('returns format errors before fetching schema', async () => {
      const patchFile = {
        version: '2.0',
        table: 'Article',
        rowId: 'row-1',
        createdAt: '2025-10-14T12:00:00Z',
        patches: [{ op: 'replace', path: 'title', value: 'Title' }],
      } as unknown as PatchFile;

      const result = await service.validate(patchFile, {
        organization: 'org',
        project: 'project',
        branch: 'branch',
      });

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(coreApiService.api.tableSchema).not.toHaveBeenCalled();
    });

    it('handles API errors when fetching schema', async () => {
      const patchFile: PatchFile = {
        version: '1.0',
        table: 'Article',
        rowId: 'row-1',
        createdAt: '2025-10-14T12:00:00Z',
        patches: [{ op: 'replace', path: 'title', value: 'Title' }],
      };

      (coreApiService.api.tableSchema as jest.Mock).mockResolvedValue({
        data: null,
        error: { message: 'Table not found' },
        ok: false,
        status: 404,
      });

      const result = await service.validate(patchFile, {
        organization: 'org',
        project: 'project',
        branch: 'branch',
      });

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain(
        'Failed to fetch table schema',
      );
    });

    it('handles missing schema data', async () => {
      const patchFile: PatchFile = {
        version: '1.0',
        table: 'Article',
        rowId: 'row-1',
        createdAt: '2025-10-14T12:00:00Z',
        patches: [{ op: 'replace', path: 'title', value: 'Title' }],
      };

      (coreApiService.api.tableSchema as jest.Mock).mockResolvedValue({
        data: null,
        error: null,
        ok: true,
        status: 200,
      });

      const result = await service.validate(patchFile, {
        organization: 'org',
        project: 'project',
        branch: 'branch',
      });

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain('Table schema not found');
    });

    it('validates schema constraints after format check', async () => {
      const patchFile: PatchFile = {
        version: '1.0',
        table: 'Article',
        rowId: 'row-1',
        createdAt: '2025-10-14T12:00:00Z',
        patches: [{ op: 'replace', path: 'nonexistent', value: 'Some Value' }],
      };

      (coreApiService.api.tableSchema as jest.Mock).mockResolvedValue({
        data: mockTableSchema,
        error: null,
        ok: true,
        status: 200,
      });

      const result = await service.validate(patchFile, {
        organization: 'org',
        project: 'project',
        branch: 'branch',
      });

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain('Invalid path');
    });
  });

  describe('validateAll', () => {
    it('validates multiple patch files', async () => {
      const patchFiles: PatchFile[] = [
        {
          version: '1.0',
          table: 'Article',
          rowId: 'row-1',
          createdAt: '2025-10-14T12:00:00Z',
          patches: [{ op: 'replace', path: 'title', value: 'Title 1' }],
        },
        {
          version: '1.0',
          table: 'Article',
          rowId: 'row-2',
          createdAt: '2025-10-14T12:00:00Z',
          patches: [{ op: 'replace', path: 'title', value: 'Title 2' }],
        },
      ];

      (coreApiService.api.tableSchema as jest.Mock).mockResolvedValue({
        data: mockTableSchema,
        error: null,
        ok: true,
        status: 200,
      });

      const results = await service.validateAll(patchFiles, {
        organization: 'org',
        project: 'project',
        branch: 'branch',
      });

      expect(results).toHaveLength(2);
      expect(results[0].valid).toBe(true);
      expect(results[1].valid).toBe(true);
    });

    it('returns mixed results for valid and invalid files', async () => {
      const patchFiles: PatchFile[] = [
        {
          version: '1.0',
          table: 'Article',
          rowId: 'row-1',
          createdAt: '2025-10-14T12:00:00Z',
          patches: [{ op: 'replace', path: 'title', value: 'Valid' }],
        },
        {
          version: '1.0',
          table: 'Article',
          rowId: 'row-2',
          createdAt: '2025-10-14T12:00:00Z',
          patches: [{ op: 'replace', path: 'nonexistent', value: 'Invalid' }],
        },
      ];

      (coreApiService.api.tableSchema as jest.Mock).mockResolvedValue({
        data: mockTableSchema,
        error: null,
        ok: true,
        status: 200,
      });

      const results = await service.validateAll(patchFiles, {
        organization: 'org',
        project: 'project',
        branch: 'branch',
      });

      expect(results).toHaveLength(2);
      expect(results[0].valid).toBe(true);
      expect(results[1].valid).toBe(false);
      expect(results[1].errors.length).toBeGreaterThan(0);
    });

    it('handles empty array', async () => {
      const results = await service.validateAll([], {
        organization: 'org',
        project: 'project',
        branch: 'branch',
      });

      expect(results).toHaveLength(0);
    });
  });
});
