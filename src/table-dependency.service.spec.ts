import { Test, TestingModule } from '@nestjs/testing';
import { TableDependencyService } from './table-dependency.service';
import { JsonSchema, JsonSchemaTypeName } from './types/schema.types';

describe('TableDependencyService', () => {
  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('analyzeDependencies', () => {
    it('should handle empty schema object', () => {
      const schemas: Record<string, JsonSchema> = {};
      const result = service.analyzeDependencies(schemas);

      expect(result.sortedTables).toEqual([]);
      expect(result.circularDependencies).toEqual([]);
      expect(result.warnings).toEqual([]);
    });

    it('should handle single table without dependencies', () => {
      const schemas: Record<string, JsonSchema> = {
        users: {
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
        },
      };

      const result = service.analyzeDependencies(schemas);

      expect(result.sortedTables).toEqual(['users']);
      expect(result.circularDependencies).toEqual([]);
      expect(result.warnings).toEqual([]);
    });

    it('should sort tables by simple dependency chain', () => {
      const schemas: Record<string, JsonSchema> = {
        users: {
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
        },
        posts: {
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
        },
        images: {
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
        },
      };

      const result = service.analyzeDependencies(schemas);

      expect(result.sortedTables).toEqual(['images', 'posts', 'users']);
      expect(result.circularDependencies).toEqual([]);
      expect(result.warnings).toEqual([]);
    });

    it('should detect simple circular dependency', () => {
      const schemas: Record<string, JsonSchema> = {
        users: {
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
        },
        posts: {
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
        },
      };

      const result = service.analyzeDependencies(schemas);

      expect(result.sortedTables).toHaveLength(2);
      expect(result.sortedTables).toEqual(
        expect.arrayContaining(['users', 'posts']),
      );
      expect(result.circularDependencies).toHaveLength(1);
      expect(result.circularDependencies[0]).toEqual(
        expect.arrayContaining(['users', 'posts']),
      );
      expect(result.warnings).toHaveLength(2); // One warning for cycle + one suggestion
      expect(result.warnings[0]).toContain('Circular dependency detected');
    });

    it('should detect complex circular dependency', () => {
      const schemas: Record<string, JsonSchema> = {
        users: {
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
        },
        posts: {
          type: JsonSchemaTypeName.Object,
          additionalProperties: false,
          properties: {
            data: {
              type: JsonSchemaTypeName.Object,
              additionalProperties: false,
              properties: {
                title: { type: JsonSchemaTypeName.String, default: '' },
                categoryId: {
                  type: JsonSchemaTypeName.String,
                  default: '',
                  foreignKey: 'categories',
                },
              },
              required: ['title'],
            },
          },
          required: ['data'],
        },
        categories: {
          type: JsonSchemaTypeName.Object,
          additionalProperties: false,
          properties: {
            data: {
              type: JsonSchemaTypeName.Object,
              additionalProperties: false,
              properties: {
                name: { type: JsonSchemaTypeName.String, default: '' },
                userId: {
                  type: JsonSchemaTypeName.String,
                  default: '',
                  foreignKey: 'users',
                },
              },
              required: ['name'],
            },
          },
          required: ['data'],
        },
      };

      const result = service.analyzeDependencies(schemas);

      expect(result.sortedTables).toHaveLength(3);
      expect(result.circularDependencies).toHaveLength(1);
      expect(result.circularDependencies[0]).toHaveLength(4); // users -> posts -> categories -> users
      expect(result.warnings).toHaveLength(2);
    });

    it('should handle multiple foreign keys in same table', () => {
      const schemas: Record<string, JsonSchema> = {
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
                amount: { type: JsonSchemaTypeName.Number, default: 0 },
              },
              required: ['userId', 'productId'],
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
        products: {
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
      };

      const result = service.analyzeDependencies(schemas);

      expect(result.sortedTables).toEqual(['users', 'products', 'orders']);
      expect(result.circularDependencies).toEqual([]);
      expect(result.warnings).toEqual([]);
    });

    it('should handle nested foreign keys in arrays', () => {
      const schemas: Record<string, JsonSchema> = {
        posts: {
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
        },
        tags: {
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
      };

      const result = service.analyzeDependencies(schemas);

      expect(result.sortedTables).toEqual(['tags', 'posts']);
      expect(result.circularDependencies).toEqual([]);
      expect(result.warnings).toEqual([]);
    });

    it('should ignore self-references', () => {
      const schemas: Record<string, JsonSchema> = {
        categories: {
          type: JsonSchemaTypeName.Object,
          additionalProperties: false,
          properties: {
            data: {
              type: JsonSchemaTypeName.Object,
              additionalProperties: false,
              properties: {
                name: { type: JsonSchemaTypeName.String, default: '' },
                parentId: {
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
      };

      const result = service.analyzeDependencies(schemas);

      expect(result.sortedTables).toEqual(['categories']);
      expect(result.circularDependencies).toEqual([]);
      expect(result.warnings).toEqual([]);
    });

    it('should handle references to non-existent tables', () => {
      const schemas: Record<string, JsonSchema> = {
        posts: {
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
                }, // users table not provided
              },
              required: ['title'],
            },
          },
          required: ['data'],
        },
      };

      const result = service.analyzeDependencies(schemas);

      expect(result.sortedTables).toEqual(['posts']);
      expect(result.circularDependencies).toEqual([]);
      expect(result.warnings).toEqual([]);
    });
  });

  describe('formatDependencyInfo', () => {
    it('should format info when no reordering needed', () => {
      const result = {
        sortedTables: ['images', 'posts', 'users'],
        circularDependencies: [],
        warnings: [],
      };
      const originalOrder = ['images', 'posts', 'users'];

      const formatted = service.formatDependencyInfo(result, originalOrder);

      expect(formatted).toContain('Table Dependency Analysis');
      expect(formatted).toContain('Upload order: images → posts → users');
      expect(formatted).toContain('No reordering needed');
    });

    it('should format info when reordering needed', () => {
      const result = {
        sortedTables: ['images', 'posts', 'users'],
        circularDependencies: [],
        warnings: [],
      };
      const originalOrder = ['users', 'posts', 'images'];

      const formatted = service.formatDependencyInfo(result, originalOrder);

      expect(formatted).toContain('Table Dependency Analysis');
      expect(formatted).toContain('Upload order: images → posts → users');
      expect(formatted).toContain('Original order: users → posts → images');
      expect(formatted).toContain(
        'Tables reordered based on foreign key dependencies',
      );
    });

    it('should format info with circular dependencies', () => {
      const result = {
        sortedTables: ['users', 'posts'],
        circularDependencies: [['users', 'posts', 'users']],
        warnings: ['⚠️  Circular dependency detected'],
      };
      const originalOrder = ['users', 'posts'];

      const formatted = service.formatDependencyInfo(result, originalOrder);

      expect(formatted).toContain('Table Dependency Analysis');
      expect(formatted).toContain('Found 1 circular dependencies');
    });

    it('should handle empty tables list', () => {
      const result = {
        sortedTables: [],
        circularDependencies: [],
        warnings: [],
      };
      const originalOrder: string[] = [];

      const formatted = service.formatDependencyInfo(result, originalOrder);

      expect(formatted).toContain('Table Dependency Analysis');
      expect(formatted).not.toContain('Upload order');
    });
  });

  describe('edge cases', () => {
    it('should handle deeply nested schema structures', () => {
      const schemas: Record<string, JsonSchema> = {
        complex: {
          type: JsonSchemaTypeName.Object,
          additionalProperties: false,
          properties: {
            data: {
              type: JsonSchemaTypeName.Object,
              additionalProperties: false,
              properties: {
                nested: {
                  type: JsonSchemaTypeName.Object,
                  additionalProperties: false,
                  properties: {
                    deepArray: {
                      type: JsonSchemaTypeName.Array,
                      items: {
                        type: JsonSchemaTypeName.Object,
                        additionalProperties: false,
                        properties: {
                          foreignRef: {
                            type: JsonSchemaTypeName.String,
                            default: '',
                            foreignKey: 'simple',
                          },
                        },
                        required: [],
                      },
                    },
                  },
                  required: [],
                },
              },
              required: [],
            },
          },
          required: ['data'],
        },
        simple: {
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
      };

      const result = service.analyzeDependencies(schemas);

      expect(result.sortedTables).toEqual(['simple', 'complex']);
      expect(result.circularDependencies).toEqual([]);
      expect(result.warnings).toEqual([]);
    });

    it('should handle malformed schemas gracefully', () => {
      const schemas: Record<string, JsonSchema> = {
        malformed: null as unknown as JsonSchema,
        valid: {
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
      };

      const result = service.analyzeDependencies(schemas);

      expect(result.sortedTables).toEqual(['malformed', 'valid']);
      expect(result.circularDependencies).toEqual([]);
      expect(result.warnings).toEqual([]);
    });
  });

  let service: TableDependencyService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TableDependencyService],
    }).compile();

    service = module.get<TableDependencyService>(TableDependencyService);
  });
});
