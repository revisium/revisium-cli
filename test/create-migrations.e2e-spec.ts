/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/unbound-method, @typescript-eslint/no-unused-vars */
import { Test, TestingModule } from '@nestjs/testing';
import { mkdir, writeFile, rm, readFile } from 'fs/promises';
import { join } from 'path';
import * as os from 'os';
import { CreateMigrationsCommand } from '../src/commands/create-migrations.command';
import { JsonValidatorService } from '../src/services/json-validator.service';
import { TableDependencyService } from '../src/services/table-dependency.service';
import { JsonSchema, JsonSchemaTypeName } from '../src/types/schema.types';
import { InitMigrationDto } from '../src/__generated__/api';

describe('CreateMigrationsCommand (e2e)', () => {
  let command: CreateMigrationsCommand;
  let testDir: string;
  let schemasDir: string;
  let outputFile: string;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreateMigrationsCommand,
        JsonValidatorService,
        TableDependencyService,
      ],
    }).compile();

    command = module.get<CreateMigrationsCommand>(CreateMigrationsCommand);

    // Create temporary directory for tests
    testDir = join(os.tmpdir(), `create-migrations-test-${Date.now()}`);
    schemasDir = join(testDir, 'schemas');
    outputFile = join(testDir, 'migrations.json');

    await mkdir(schemasDir, { recursive: true });
  });

  afterEach(async () => {
    // Cleanup test directory
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Basic functionality', () => {
    it('should create migrations from simple schema files', async () => {
      // Arrange: Create test schema files
      const userSchema: JsonSchema = {
        type: JsonSchemaTypeName.Object,
        additionalProperties: false,
        properties: {
          data: {
            type: JsonSchemaTypeName.Object,
            additionalProperties: false,
            properties: {
              name: { type: JsonSchemaTypeName.String, default: '' },
              email: { type: JsonSchemaTypeName.String, default: '' },
            },
            required: ['name', 'email'],
          },
        },
        required: ['data'],
      };

      const postSchema: JsonSchema = {
        type: JsonSchemaTypeName.Object,
        additionalProperties: false,
        properties: {
          data: {
            type: JsonSchemaTypeName.Object,
            additionalProperties: false,
            properties: {
              title: { type: JsonSchemaTypeName.String, default: '' },
              content: { type: JsonSchemaTypeName.String, default: '' },
            },
            required: ['title'],
          },
        },
        required: ['data'],
      };

      await writeFile(
        join(schemasDir, 'users.json'),
        JSON.stringify(userSchema, null, 2),
      );
      await writeFile(
        join(schemasDir, 'posts.json'),
        JSON.stringify(postSchema, null, 2),
      );

      // Act: Run the command
      await command.run([], {
        schemasFolder: schemasDir,
        file: outputFile,
      });

      // Assert: Check the generated migrations file
      const migrationsContent = await readFile(outputFile, 'utf-8');
      const migrations: InitMigrationDto[] = JSON.parse(migrationsContent);

      expect(migrations).toHaveLength(2);
      expect(migrations.every((m) => m.changeType === 'init')).toBe(true);
      expect(migrations.every((m) => typeof m.id === 'string')).toBe(true);
      expect(migrations.every((m) => typeof m.hash === 'string')).toBe(true);
      expect(migrations.every((m) => m.schema)).toBeDefined();

      // Check that table IDs match file names
      const tableIds = migrations.map((m) => m.tableId).sort();
      expect(tableIds).toEqual(['posts', 'users']);

      // Check that IDs are properly formatted ISO dates
      migrations.forEach((migration) => {
        expect(new Date(migration.id).toISOString()).toBe(migration.id);
      });
    });

    it('should generate unique timestamps for migrations', async () => {
      // Create multiple schema files
      const schemas = Array.from({ length: 5 }, (_, i) => ({
        [`table${i}`]: {
          type: JsonSchemaTypeName.Object,
          additionalProperties: false,
          properties: {
            data: {
              type: JsonSchemaTypeName.Object,
              additionalProperties: false,
              properties: {
                name: { type: JsonSchemaTypeName.String, default: '' },
              },
              required: ['name'],
            },
          },
          required: ['data'],
        },
      }));

      for (let i = 0; i < schemas.length; i++) {
        const schema = schemas[i];
        const tableName = Object.keys(schema)[0];
        await writeFile(
          join(schemasDir, `${tableName}.json`),
          JSON.stringify(schema[tableName], null, 2),
        );
      }

      await command.run([], {
        schemasFolder: schemasDir,
        file: outputFile,
      });

      const migrationsContent = await readFile(outputFile, 'utf-8');
      const migrations: InitMigrationDto[] = JSON.parse(migrationsContent);

      // All IDs should be unique
      const ids = migrations.map((m) => m.id);
      const uniqueIds = [...new Set(ids)];
      expect(uniqueIds).toHaveLength(migrations.length);

      // IDs should be in chronological order
      const sortedIds = [...ids].sort();
      expect(ids).toEqual(sortedIds);
    });

    it('should generate proper SHA256 hashes for schemas', async () => {
      const schema: JsonSchema = {
        type: JsonSchemaTypeName.Object,
        additionalProperties: false,
        properties: {
          data: {
            type: JsonSchemaTypeName.Object,
            additionalProperties: false,
            properties: {
              name: { type: JsonSchemaTypeName.String, default: '' },
            },
            required: ['name'],
          },
        },
        required: ['data'],
      };

      await writeFile(
        join(schemasDir, 'test.json'),
        JSON.stringify(schema, null, 2),
      );

      await command.run([], {
        schemasFolder: schemasDir,
        file: outputFile,
      });

      const migrationsContent = await readFile(outputFile, 'utf-8');
      const migrations: InitMigrationDto[] = JSON.parse(migrationsContent);

      expect(migrations).toHaveLength(1);
      expect(migrations[0].hash).toMatch(/^[a-f0-9]+$/); // Hex format hash
    });
  });

  describe('Dependency sorting', () => {
    it('should sort tables based on foreign key dependencies', async () => {
      // Create schemas with dependencies: images -> posts -> users
      const imageSchema: JsonSchema = {
        type: JsonSchemaTypeName.Object,
        additionalProperties: false,
        properties: {
          data: {
            type: JsonSchemaTypeName.Object,
            additionalProperties: false,
            properties: {
              url: { type: JsonSchemaTypeName.String, default: '' },
            },
            required: ['url'],
          },
        },
        required: ['data'],
      };

      const postSchema: JsonSchema = {
        type: JsonSchemaTypeName.Object,
        additionalProperties: false,
        properties: {
          data: {
            type: JsonSchemaTypeName.Object,
            additionalProperties: false,
            properties: {
              title: { type: JsonSchemaTypeName.String, default: '' },
              imageId: {
                type: JsonSchemaTypeName.String,
                default: '',
                foreignKey: 'images',
              },
            },
            required: ['title'],
          },
        },
        required: ['data'],
      };

      const userSchema: JsonSchema = {
        type: JsonSchemaTypeName.Object,
        additionalProperties: false,
        properties: {
          data: {
            type: JsonSchemaTypeName.Object,
            additionalProperties: false,
            properties: {
              name: { type: JsonSchemaTypeName.String, default: '' },
              postId: {
                type: JsonSchemaTypeName.String,
                default: '',
                foreignKey: 'posts',
              },
            },
            required: ['name'],
          },
        },
        required: ['data'],
      };

      // Write schemas in reverse dependency order to test sorting
      await writeFile(
        join(schemasDir, 'users.json'),
        JSON.stringify(userSchema, null, 2),
      );
      await writeFile(
        join(schemasDir, 'posts.json'),
        JSON.stringify(postSchema, null, 2),
      );
      await writeFile(
        join(schemasDir, 'images.json'),
        JSON.stringify(imageSchema, null, 2),
      );

      await command.run([], {
        schemasFolder: schemasDir,
        file: outputFile,
      });

      const migrationsContent = await readFile(outputFile, 'utf-8');
      const migrations: InitMigrationDto[] = JSON.parse(migrationsContent);

      // Should be sorted in dependency order: images, posts, users
      const tableIds = migrations.map((m) => m.tableId);
      expect(tableIds).toEqual(['images', 'posts', 'users']);
    });

    it('should handle complex multi-table dependencies', async () => {
      // Create a more complex dependency graph
      const schemas = {
        categories: {
          type: JsonSchemaTypeName.Object,
          additionalProperties: false,
          properties: {
            data: {
              type: JsonSchemaTypeName.Object,
              additionalProperties: false,
              properties: {
                name: { type: JsonSchemaTypeName.String, default: '' },
              },
              required: ['name'],
            },
          },
          required: ['data'],
        },
        products: {
          type: JsonSchemaTypeName.Object,
          additionalProperties: false,
          properties: {
            data: {
              type: JsonSchemaTypeName.Object,
              additionalProperties: false,
              properties: {
                name: { type: JsonSchemaTypeName.String, default: '' },
                categoryId: {
                  type: JsonSchemaTypeName.String,
                  default: '',
                  foreignKey: 'categories',
                },
              },
              required: ['name'],
            },
          },
          required: ['data'],
        },
        users: {
          type: JsonSchemaTypeName.Object,
          additionalProperties: false,
          properties: {
            data: {
              type: JsonSchemaTypeName.Object,
              additionalProperties: false,
              properties: {
                name: { type: JsonSchemaTypeName.String, default: '' },
              },
              required: ['name'],
            },
          },
          required: ['data'],
        },
        orders: {
          type: JsonSchemaTypeName.Object,
          additionalProperties: false,
          properties: {
            data: {
              type: JsonSchemaTypeName.Object,
              additionalProperties: false,
              properties: {
                userId: {
                  type: JsonSchemaTypeName.String,
                  default: '',
                  foreignKey: 'users',
                },
                productId: {
                  type: JsonSchemaTypeName.String,
                  default: '',
                  foreignKey: 'products',
                },
              },
              required: ['userId', 'productId'],
            },
          },
          required: ['data'],
        },
      };

      // Write schemas in random order
      const tableNames = Object.keys(schemas);
      const shuffledNames = ['orders', 'users', 'categories', 'products'];

      for (const tableName of shuffledNames) {
        await writeFile(
          join(schemasDir, `${tableName}.json`),
          JSON.stringify(schemas[tableName as keyof typeof schemas], null, 2),
        );
      }

      await command.run([], {
        schemasFolder: schemasDir,
        file: outputFile,
      });

      const migrationsContent = await readFile(outputFile, 'utf-8');
      const migrations: InitMigrationDto[] = JSON.parse(migrationsContent);

      const tableIds = migrations.map((m) => m.tableId);

      // Check that categories comes before products
      const categoriesIndex = tableIds.indexOf('categories');
      const productsIndex = tableIds.indexOf('products');
      expect(categoriesIndex).toBeLessThan(productsIndex);

      // Check that users and products come before orders
      const usersIndex = tableIds.indexOf('users');
      const ordersIndex = tableIds.indexOf('orders');
      expect(usersIndex).toBeLessThan(ordersIndex);
      expect(productsIndex).toBeLessThan(ordersIndex);
    });
  });

  describe('Circular dependency detection', () => {
    it('should detect and handle simple circular dependencies', async () => {
      // Create schemas with circular dependency: users <-> posts
      const userSchema: JsonSchema = {
        type: JsonSchemaTypeName.Object,
        additionalProperties: false,
        properties: {
          data: {
            type: JsonSchemaTypeName.Object,
            additionalProperties: false,
            properties: {
              name: { type: JsonSchemaTypeName.String, default: '' },
              postId: {
                type: JsonSchemaTypeName.String,
                default: '',
                foreignKey: 'posts',
              },
            },
            required: ['name'],
          },
        },
        required: ['data'],
      };

      const postSchema: JsonSchema = {
        type: JsonSchemaTypeName.Object,
        additionalProperties: false,
        properties: {
          data: {
            type: JsonSchemaTypeName.Object,
            additionalProperties: false,
            properties: {
              title: { type: JsonSchemaTypeName.String, default: '' },
              userId: {
                type: JsonSchemaTypeName.String,
                default: '',
                foreignKey: 'users',
              },
            },
            required: ['title'],
          },
        },
        required: ['data'],
      };

      await writeFile(
        join(schemasDir, 'users.json'),
        JSON.stringify(userSchema, null, 2),
      );
      await writeFile(
        join(schemasDir, 'posts.json'),
        JSON.stringify(postSchema, null, 2),
      );

      // Mock console.log to capture warnings
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await command.run([], {
        schemasFolder: schemasDir,
        file: outputFile,
      });

      const migrationsContent = await readFile(outputFile, 'utf-8');
      const migrations: InitMigrationDto[] = JSON.parse(migrationsContent);

      expect(migrations).toHaveLength(2);

      // Should have logged warnings about circular dependencies
      const logCalls = consoleSpy.mock.calls.flat();
      const warningLogs = logCalls.filter((call) =>
        call.includes('Circular dependency detected'),
      );
      expect(warningLogs.length).toBeGreaterThan(0);

      consoleSpy.mockRestore();
    });

    it('should detect complex circular dependencies', async () => {
      // Create three-way circular dependency: A -> B -> C -> A
      const schemas = {
        tableA: {
          type: JsonSchemaTypeName.Object,
          additionalProperties: false,
          properties: {
            data: {
              type: JsonSchemaTypeName.Object,
              additionalProperties: false,
              properties: {
                name: { type: JsonSchemaTypeName.String, default: '' },
                tableBId: {
                  type: JsonSchemaTypeName.String,
                  default: '',
                  foreignKey: 'tableB',
                },
              },
              required: ['name'],
            },
          },
          required: ['data'],
        },
        tableB: {
          type: JsonSchemaTypeName.Object,
          additionalProperties: false,
          properties: {
            data: {
              type: JsonSchemaTypeName.Object,
              additionalProperties: false,
              properties: {
                name: { type: JsonSchemaTypeName.String, default: '' },
                tableCId: {
                  type: JsonSchemaTypeName.String,
                  default: '',
                  foreignKey: 'tableC',
                },
              },
              required: ['name'],
            },
          },
          required: ['data'],
        },
        tableC: {
          type: JsonSchemaTypeName.Object,
          additionalProperties: false,
          properties: {
            data: {
              type: JsonSchemaTypeName.Object,
              additionalProperties: false,
              properties: {
                name: { type: JsonSchemaTypeName.String, default: '' },
                tableAId: {
                  type: JsonSchemaTypeName.String,
                  default: '',
                  foreignKey: 'tableA',
                },
              },
              required: ['name'],
            },
          },
          required: ['data'],
        },
      };

      for (const [tableName, schema] of Object.entries(schemas)) {
        await writeFile(
          join(schemasDir, `${tableName}.json`),
          JSON.stringify(schema, null, 2),
        );
      }

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await command.run([], {
        schemasFolder: schemasDir,
        file: outputFile,
      });

      const migrationsContent = await readFile(outputFile, 'utf-8');
      const migrations: InitMigrationDto[] = JSON.parse(migrationsContent);

      expect(migrations).toHaveLength(3);

      // Should log circular dependency warnings
      const logCalls = consoleSpy.mock.calls.flat();
      const warningLogs = logCalls.filter((call) =>
        call.includes('Circular dependency'),
      );
      expect(warningLogs.length).toBeGreaterThan(0);

      consoleSpy.mockRestore();
    });
  });

  describe('Error handling', () => {
    it('should fail when schemas folder does not exist', async () => {
      const nonExistentDir = join(testDir, 'non-existent');

      // Mock process.exit to capture the exit call
      const originalExit = process.exit;
      const mockExit = jest.fn() as any;
      process.exit = mockExit;

      // Mock console.error to capture error output
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      await command.run([], {
        schemasFolder: nonExistentDir,
        file: outputFile,
      });

      expect(mockExit).toHaveBeenCalledWith(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error creating migrations:',
        expect.any(Error),
      );

      // Restore
      process.exit = originalExit;
      consoleErrorSpy.mockRestore();
    });

    it('should fail when schemas folder is not provided', async () => {
      // Mock process.exit to capture the exit call
      const originalExit = process.exit;
      const mockExit = jest.fn() as any;
      process.exit = mockExit;

      await command.run([], {
        schemasFolder: '',
        file: outputFile,
      });

      expect(mockExit).toHaveBeenCalledWith(1);

      // Restore process.exit
      process.exit = originalExit;
    });

    it('should fail when output file is not provided', async () => {
      const originalExit = process.exit;
      const mockExit = jest.fn() as any;
      process.exit = mockExit;

      await command.run([], {
        schemasFolder: schemasDir,
        file: '',
      });

      expect(mockExit).toHaveBeenCalledWith(1);

      process.exit = originalExit;
    });

    it('should handle invalid JSON files gracefully', async () => {
      // Create an invalid JSON file
      await writeFile(join(schemasDir, 'invalid.json'), '{ invalid json }');

      // Mock process.exit to capture the exit call
      const originalExit = process.exit;
      const mockExit = jest.fn() as any;
      process.exit = mockExit;

      // Mock console.error to capture error output
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      await command.run([], {
        schemasFolder: schemasDir,
        file: outputFile,
      });

      expect(mockExit).toHaveBeenCalledWith(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error creating migrations:',
        expect.any(Error),
      );

      // Restore
      process.exit = originalExit;
      consoleErrorSpy.mockRestore();
    });

    it('should handle empty schemas folder', async () => {
      await command.run([], {
        schemasFolder: schemasDir,
        file: outputFile,
      });

      const migrationsContent = await readFile(outputFile, 'utf-8');
      const migrations: InitMigrationDto[] = JSON.parse(migrationsContent);

      expect(migrations).toHaveLength(0);
    });

    it('should handle non-JSON files in schemas folder', async () => {
      // Create a non-JSON file
      await writeFile(join(schemasDir, 'not-json.txt'), 'This is not JSON');

      // Create a valid JSON file
      const schema: JsonSchema = {
        type: JsonSchemaTypeName.Object,
        additionalProperties: false,
        properties: {
          data: {
            type: JsonSchemaTypeName.Object,
            additionalProperties: false,
            properties: {
              name: { type: JsonSchemaTypeName.String, default: '' },
            },
            required: ['name'],
          },
        },
        required: ['data'],
      };

      await writeFile(
        join(schemasDir, 'valid.json'),
        JSON.stringify(schema, null, 2),
      );

      await command.run([], {
        schemasFolder: schemasDir,
        file: outputFile,
      });

      const migrationsContent = await readFile(outputFile, 'utf-8');
      const migrations: InitMigrationDto[] = JSON.parse(migrationsContent);

      // Should only process the JSON file
      expect(migrations).toHaveLength(1);
      expect(migrations[0].tableId).toBe('valid');
    });
  });

  describe('Integration with validation', () => {
    it('should generate migrations that pass JSON schema validation', async () => {
      const userSchema: JsonSchema = {
        type: JsonSchemaTypeName.Object,
        additionalProperties: false,
        properties: {
          data: {
            type: JsonSchemaTypeName.Object,
            additionalProperties: false,
            properties: {
              name: { type: JsonSchemaTypeName.String, default: '' },
              age: { type: JsonSchemaTypeName.Number, default: 0 },
            },
            required: ['name'],
          },
        },
        required: ['data'],
      };

      await writeFile(
        join(schemasDir, 'users.json'),
        JSON.stringify(userSchema, null, 2),
      );

      // Mock console.log to capture validation success message
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await command.run([], {
        schemasFolder: schemasDir,
        file: outputFile,
      });

      // Should not throw validation errors
      const migrationsContent = await readFile(outputFile, 'utf-8');
      const migrations: InitMigrationDto[] = JSON.parse(migrationsContent);

      expect(migrations).toHaveLength(1);
      expect(migrations[0]).toMatchObject({
        changeType: 'init',
        tableId: 'users',
        schema: userSchema,
      });

      // Should log validation success
      const logCalls = consoleSpy.mock.calls.flat();
      const validationLogs = logCalls.filter((call) =>
        call.includes('JSON file is valid'),
      );
      expect(validationLogs.length).toBeGreaterThan(0);

      consoleSpy.mockRestore();
    });

    it('should validate array items with foreign keys', async () => {
      const postSchema: JsonSchema = {
        type: JsonSchemaTypeName.Object,
        additionalProperties: false,
        properties: {
          data: {
            type: JsonSchemaTypeName.Object,
            additionalProperties: false,
            properties: {
              title: { type: JsonSchemaTypeName.String, default: '' },
              tags: {
                type: JsonSchemaTypeName.Array,
                items: {
                  type: JsonSchemaTypeName.String,
                  default: '',
                  foreignKey: 'tags',
                },
              },
            },
            required: ['title'],
          },
        },
        required: ['data'],
      };

      const tagSchema: JsonSchema = {
        type: JsonSchemaTypeName.Object,
        additionalProperties: false,
        properties: {
          data: {
            type: JsonSchemaTypeName.Object,
            additionalProperties: false,
            properties: {
              name: { type: JsonSchemaTypeName.String, default: '' },
            },
            required: ['name'],
          },
        },
        required: ['data'],
      };

      await writeFile(
        join(schemasDir, 'posts.json'),
        JSON.stringify(postSchema, null, 2),
      );
      await writeFile(
        join(schemasDir, 'tags.json'),
        JSON.stringify(tagSchema, null, 2),
      );

      await command.run([], {
        schemasFolder: schemasDir,
        file: outputFile,
      });

      const migrationsContent = await readFile(outputFile, 'utf-8');
      const migrations: InitMigrationDto[] = JSON.parse(migrationsContent);

      expect(migrations).toHaveLength(2);

      // Should be sorted with tags first (dependency)
      const tableIds = migrations.map((m) => m.tableId);
      expect(tableIds).toEqual(['tags', 'posts']);
    });
  });

  describe('Console output', () => {
    it('should provide detailed progress information', async () => {
      const schemas = {
        table1: {
          type: JsonSchemaTypeName.Object,
          additionalProperties: false,
          properties: {
            data: {
              type: JsonSchemaTypeName.Object,
              additionalProperties: false,
              properties: {
                name: { type: JsonSchemaTypeName.String, default: '' },
              },
              required: ['name'],
            },
          },
          required: ['data'],
        },
        table2: {
          type: JsonSchemaTypeName.Object,
          additionalProperties: false,
          properties: {
            data: {
              type: JsonSchemaTypeName.Object,
              additionalProperties: false,
              properties: {
                title: { type: JsonSchemaTypeName.String, default: '' },
              },
              required: ['title'],
            },
          },
          required: ['data'],
        },
      };

      for (const [tableName, schema] of Object.entries(schemas)) {
        await writeFile(
          join(schemasDir, `${tableName}.json`),
          JSON.stringify(schema, null, 2),
        );
      }

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await command.run([], {
        schemasFolder: schemasDir,
        file: outputFile,
      });

      const logCalls = consoleSpy.mock.calls.flat();

      // Should log loading progress
      expect(
        logCalls.some((call) => call.includes('Loading 2 schema files')),
      ).toBe(true);

      // Should log schema loading for each table
      expect(
        logCalls.some((call) =>
          call.includes('Loaded schema for table: table1'),
        ),
      ).toBe(true);
      expect(
        logCalls.some((call) =>
          call.includes('Loaded schema for table: table2'),
        ),
      ).toBe(true);

      // Should log migration creation
      expect(
        logCalls.some((call) => call.includes('Created migration for table')),
      ).toBe(true);

      // Should log summary
      expect(
        logCalls.some((call) => call.includes('Generated 2 migrations')),
      ).toBe(true);
      expect(
        logCalls.some((call) =>
          call.includes('Successfully created 2 migrations'),
        ),
      ).toBe(true);

      consoleSpy.mockRestore();
    });
  });
});
