import { JsonValidatorService } from '../json-validator.service';
import { Migration } from 'src/types/migration.types';

describe('JsonValidatorService', () => {
  let service: JsonValidatorService;

  beforeEach(() => {
    service = new JsonValidatorService();
  });

  describe('Constructor initialization', () => {
    it('initializes AJV instance with custom keywords and formats', () => {
      expect(service.ajv).toBeDefined();

      // Check if foreignKey keyword is added by trying to get it
      const foreignKeyKeyword = service.ajv.getKeyword('foreignKey');
      expect(foreignKeyKeyword).toBeDefined();

      // Check if regex format is added by testing it
      const testSchema = {
        type: 'string',
        format: 'regex',
      };
      expect(() => service.ajv.compile(testSchema)).not.toThrow();
    });

    it('compiles all required schemas during initialization', () => {
      // The service should not throw during initialization
      expect(() => new JsonValidatorService()).not.toThrow();
    });
  });

  describe('Custom format validation - regex', () => {
    it('validates correct regex patterns', () => {
      // Test the regex format by using it in a schema
      const schemaWithRegex = {
        type: 'object',
        properties: {
          pattern: {
            type: 'string',
            format: 'regex',
          },
        },
      };

      const validator = service.ajv.compile(schemaWithRegex);

      expect(validator({ pattern: '^[a-zA-Z0-9]+$' })).toBe(true);
      expect(validator({ pattern: '\\d{3}-\\d{3}-\\d{4}' })).toBe(true);
      expect(validator({ pattern: '[a-z]+' })).toBe(true);
    });

    it('rejects invalid regex patterns', () => {
      const schemaWithRegex = {
        type: 'object',
        properties: {
          pattern: {
            type: 'string',
            format: 'regex',
          },
        },
      };

      const validator = service.ajv.compile(schemaWithRegex);

      expect(validator({ pattern: '[' })).toBe(false);
      expect(validator({ pattern: '*' })).toBe(false);
      expect(validator({ pattern: '(?' })).toBe(false);
    });
  });

  describe('validateMigration', () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

    beforeEach(() => {
      consoleSpy.mockClear();
    });

    afterAll(() => {
      consoleSpy.mockRestore();
    });

    it('validates valid InitMigration', () => {
      const validInitMigration: Migration[] = [
        {
          changeType: 'init',
          tableId: 'users',
          hash: 'abc123',
          id: '2024-01-01T00:00:00.000Z',
          schema: {
            type: 'object',
            properties: {
              name: { type: 'string', default: '' },
              email: { type: 'string', default: '' },
            },
            additionalProperties: false,
            required: ['name', 'email'],
          },
        },
      ];

      const result = service.validateMigration(validInitMigration);

      expect(result).toEqual(validInitMigration);
      expect(consoleSpy).toHaveBeenCalledWith('✅ JSON file is valid');
      expect(consoleSpy).toHaveBeenCalledWith('Validated 1 items');
    });

    it('validates valid UpdateMigration', () => {
      const validUpdateMigration: Migration[] = [
        {
          changeType: 'update',
          tableId: 'users',
          hash: 'def456',
          id: '2024-01-02T00:00:00.000Z',
          patches: [
            {
              op: 'add',
              path: '/properties/age',
              value: { type: 'number', default: 0 },
            },
          ],
        },
      ];

      const result = service.validateMigration(validUpdateMigration);

      expect(result).toEqual(validUpdateMigration);
      expect(consoleSpy).toHaveBeenCalledWith('✅ JSON file is valid');
      expect(consoleSpy).toHaveBeenCalledWith('Validated 1 items');
    });

    it('validates valid RenameMigration', () => {
      const validRenameMigration: Migration[] = [
        {
          changeType: 'rename',
          id: '2024-01-03T00:00:00.000Z',
          tableId: 'users',
          nextTableId: 'customers',
        },
      ];

      const result = service.validateMigration(validRenameMigration);

      expect(result).toEqual(validRenameMigration);
      expect(consoleSpy).toHaveBeenCalledWith('✅ JSON file is valid');
      expect(consoleSpy).toHaveBeenCalledWith('Validated 1 items');
    });

    it('validates valid RemoveMigration', () => {
      const validRemoveMigration: Migration[] = [
        {
          changeType: 'remove',
          id: '2024-01-04T00:00:00.000Z',
          tableId: 'temporary_table',
        },
      ];

      const result = service.validateMigration(validRemoveMigration);

      expect(result).toEqual(validRemoveMigration);
      expect(consoleSpy).toHaveBeenCalledWith('✅ JSON file is valid');
      expect(consoleSpy).toHaveBeenCalledWith('Validated 1 items');
    });

    it('validates multiple migrations in array', () => {
      const validMigrations: Migration[] = [
        {
          changeType: 'init',
          tableId: 'users',
          hash: 'abc123',
          id: '2024-01-01T00:00:00.000Z',
          schema: {
            type: 'object',
            properties: {
              name: { type: 'string', default: '' },
            },
            additionalProperties: false,
            required: ['name'],
          },
        },
        {
          changeType: 'remove',
          id: '2024-01-02T00:00:00.000Z',
          tableId: 'old_table',
        },
      ];

      const result = service.validateMigration(validMigrations);

      expect(result).toEqual(validMigrations);
      expect(consoleSpy).toHaveBeenCalledWith('✅ JSON file is valid');
      expect(consoleSpy).toHaveBeenCalledWith('Validated 2 items');
    });

    it('throws error for invalid migration - missing required fields', () => {
      const invalidMigration = [
        {
          changeType: 'init',
          // Missing required fields: tableId, hash, id, schema
        },
      ];

      expect(() => service.validateMigration(invalidMigration)).toThrow(
        /❌ JSON file validation failed:/,
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            instancePath: '/0',
            keyword: 'required',
          }),
        ]),
      );
    });

    it('throws error for invalid migration - wrong changeType', () => {
      const invalidMigration = [
        {
          changeType: 'invalid_type',
          tableId: 'users',
          hash: 'abc123',
          id: '2024-01-01T00:00:00.000Z',
          schema: { type: 'object' },
        },
      ];

      expect(() => service.validateMigration(invalidMigration)).toThrow(
        /❌ JSON file validation failed:/,
      );
    });

    it('throws error for invalid migration - extra properties', () => {
      const invalidMigration = [
        {
          changeType: 'remove',
          id: '2024-01-01T00:00:00.000Z',
          tableId: 'users',
          extraProperty: 'not_allowed', // This should be rejected due to additionalProperties: false
        },
      ];

      expect(() => service.validateMigration(invalidMigration)).toThrow(
        /❌ JSON file validation failed:/,
      );
    });

    it('throws error for non-array input', () => {
      const invalidInput = {
        changeType: 'init',
        tableId: 'users',
      };

      expect(() => service.validateMigration(invalidInput)).toThrow(
        /❌ JSON file validation failed:/,
      );
    });

    it('validates empty array', () => {
      const emptyMigrations: Migration[] = [];

      const result = service.validateMigration(emptyMigrations);

      expect(result).toEqual(emptyMigrations);
      expect(consoleSpy).toHaveBeenCalledWith('✅ JSON file is valid');
      expect(consoleSpy).toHaveBeenCalledWith('Validated 0 items');
    });

    it('handles complex schema with foreignKey in InitMigration', () => {
      const migrationWithForeignKey: Migration[] = [
        {
          changeType: 'init',
          tableId: 'posts',
          hash: 'xyz789',
          id: '2024-01-05T00:00:00.000Z',
          schema: {
            type: 'object',
            properties: {
              title: { type: 'string', default: '' },
              authorId: {
                type: 'string',
                default: '',
                foreignKey: 'users',
              },
            },
            additionalProperties: false,
            required: ['title', 'authorId'],
          },
        },
      ];

      const result = service.validateMigration(migrationWithForeignKey);

      expect(result).toEqual(migrationWithForeignKey);
      expect(consoleSpy).toHaveBeenCalledWith('✅ JSON file is valid');
    });

    it('provides detailed error messages with multiple validation errors', () => {
      const invalidMigration = [
        {
          changeType: 'init',
          tableId: '', // Invalid: should be non-empty string
          // Missing: hash, id, schema
        },
        {
          changeType: 'update',
          // Missing all required fields
        },
      ];

      expect(() => service.validateMigration(invalidMigration)).toThrow();

      // Should log the detailed errors array
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            keyword: 'required',
          }),
        ]),
      );
    });
  });

  describe('validateSchema', () => {
    it('compiles valid JSON schema and returns validator function', () => {
      const validSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number', minimum: 0 },
        },
        required: ['name'],
      };

      const validator = service.validateSchema(validSchema);

      expect(validator).toBeInstanceOf(Function);

      // Test the returned validator
      expect(validator({ name: 'John', age: 30 })).toBe(true);
      expect(validator({ name: 'John' })).toBe(true);
      expect(validator({ age: 30 })).toBe(false); // missing required 'name'
      expect(validator({ name: 'John', age: -1 })).toBe(false); // age below minimum
    });

    it('compiles schema with custom foreignKey keyword', () => {
      const schemaWithForeignKey = {
        type: 'object',
        properties: {
          userId: {
            type: 'string',
            foreignKey: 'users',
          },
        },
      };

      const validator = service.validateSchema(schemaWithForeignKey);

      expect(validator).toBeInstanceOf(Function);
      expect(validator({ userId: 'user-123' })).toBe(true);
      expect(validator({ userId: 123 })).toBe(false); // should be string
    });

    it('compiles schema with regex format', () => {
      const schemaWithRegex = {
        type: 'object',
        properties: {
          pattern: {
            type: 'string',
            format: 'regex',
          },
        },
      };

      const validator = service.validateSchema(schemaWithRegex);

      expect(validator).toBeInstanceOf(Function);
      expect(validator({ pattern: '^[a-z]+$' })).toBe(true);
      expect(validator({ pattern: '[' })).toBe(false); // invalid regex
    });

    it('handles complex nested schemas', () => {
      const complexSchema = {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {
              profile: {
                type: 'object',
                properties: {
                  settings: {
                    type: 'object',
                    properties: {
                      theme: { type: 'string', enum: ['light', 'dark'] },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const validator = service.validateSchema(complexSchema);

      expect(validator).toBeInstanceOf(Function);
      expect(
        validator({
          user: {
            profile: {
              settings: {
                theme: 'light',
              },
            },
          },
        }),
      ).toBe(true);

      expect(
        validator({
          user: {
            profile: {
              settings: {
                theme: 'invalid',
              },
            },
          },
        }),
      ).toBe(false);
    });

    it('throws for invalid schema syntax', () => {
      const invalidSchema = {
        type: 'invalid_type',
      };

      expect(() => service.validateSchema(invalidSchema)).toThrow();
    });
  });

  describe('Error handling and edge cases', () => {
    it('handles null input to validateMigration', () => {
      expect(() => service.validateMigration(null)).toThrow(
        /❌ JSON file validation failed:/,
      );
    });

    it('handles undefined input to validateMigration', () => {
      expect(() => service.validateMigration(undefined)).toThrow(
        /❌ JSON file validation failed:/,
      );
    });

    it('handles non-object items in migration array', () => {
      const invalidMigration = ['invalid_string_item', 123, null];

      expect(() => service.validateMigration(invalidMigration)).toThrow(
        /❌ JSON file validation failed:/,
      );
    });

    it('formats error messages properly', () => {
      const invalidMigration = [
        {
          changeType: 'init',
          // Missing required fields
        },
      ];

      try {
        service.validateMigration(invalidMigration);
        fail('Should have thrown an error');
      } catch (error) {
        expect(error instanceof Error).toBe(true);
        if (error instanceof Error) {
          expect(error.message).toContain('❌ JSON file validation failed:');
          expect(error.message).toContain('required');
        }
      }
    });

    it('handles very large migration arrays', () => {
      const largeMigrationArray: Migration[] = Array(1000)
        .fill(null)
        .map((_, index) => ({
          changeType: 'remove' as const,
          id: `2024-01-01T00:${String(index).padStart(2, '0')}:00.000Z`,
          tableId: `table_${index}`,
        }));

      const result = service.validateMigration(largeMigrationArray);

      expect(result).toEqual(largeMigrationArray);
      expect(result).toHaveLength(1000);
    });
  });

  describe('Schema compilation during construction', () => {
    it('should not throw when compiling plugin schemas', () => {
      // This test ensures all plugin schemas compile without error
      expect(() => {
        const testService = new JsonValidatorService();
        expect(testService.ajv).toBeDefined();
      }).not.toThrow();
    });

    it('should have migration schema compiled and ready to use', () => {
      // Test that we can successfully validate migrations (which means the schema is compiled)
      const testMigration: Migration[] = [
        {
          changeType: 'remove',
          id: '2024-01-01T00:00:00.000Z',
          tableId: 'test_table',
        },
      ];

      // This will only work if the schema was properly compiled
      expect(() => service.validateMigration(testMigration)).not.toThrow();
    });
  });
});
