import Ajv, { Schema, ValidateFunction } from 'ajv/dist/2020';
import { jsonPatchSchema } from 'src/config/json-patch-schema';
import { metaSchema } from 'src/config/meta-schema';
import { migrationSchema } from 'src/config/migration.schema';
import {
  ajvFileSchema,
  ajvRowCreatedAtSchema,
  ajvRowCreatedIdSchema,
  ajvRowHashSchema,
  ajvRowIdSchema,
  ajvRowPublishedAtSchema,
  ajvRowSchemaHashSchema,
  ajvRowUpdatedAtSchema,
  ajvRowVersionIdSchema,
} from 'src/config/plugins';
import { tableMigrationsSchema } from 'src/config/table-migrations-schema';
import { Migration } from 'src/types/migration.types';

export class JsonValidatorService {
  public readonly ajv = new Ajv();

  private readonly validator: ValidateFunction<Migration[]>;

  constructor() {
    this.ajv.addKeyword({
      keyword: 'foreignKey',
      type: 'string',
    });
    this.ajv.addFormat('regex', {
      type: 'string',
      validate: (str: string) => {
        try {
          new RegExp(str);
          return true;
        } catch {
          return false;
        }
      },
    });

    this.compilePluginSchemas();
    this.ajv.compile(metaSchema);
    this.ajv.compile(jsonPatchSchema);
    this.ajv.compile(tableMigrationsSchema);
    this.validator = this.ajv.compile(migrationSchema);
  }

  public validateMigration(data: unknown): Migration[] {
    const valid = this.validator(data);

    if (valid) {
      console.log('✅ JSON file is valid');
      console.log(`Validated ${data.length} items`);
    } else {
      console.log(this.validator.errors);
      throw new Error(
        `❌ JSON file validation failed:\n${this.ajv.errorsText(this.validator.errors ?? [], { separator: '\n' })}`,
      );
    }

    return data;
  }

  public validateSchema(schema: unknown) {
    return this.ajv.compile(schema as Schema);
  }

  private compilePluginSchemas(): void {
    this.ajv.compile(ajvRowIdSchema);
    this.ajv.compile(ajvRowCreatedIdSchema);
    this.ajv.compile(ajvRowVersionIdSchema);
    this.ajv.compile(ajvRowCreatedAtSchema);
    this.ajv.compile(ajvRowPublishedAtSchema);
    this.ajv.compile(ajvRowUpdatedAtSchema);
    this.ajv.compile(ajvRowHashSchema);
    this.ajv.compile(ajvRowSchemaHashSchema);
    this.ajv.compile(ajvFileSchema);
  }
}
