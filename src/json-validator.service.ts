import Ajv, { ValidateFunction } from 'ajv/dist/2020';
import { jsonPatchSchema } from 'src/config/json-patch-schema';
import { metaSchema } from 'src/config/meta-schema';
import { migrationSchema } from 'src/config/migration.schema';
import { tableMigrationsSchema } from 'src/config/table-migrations-schema';
import { Migration } from 'src/types/migration.types';

export class JsonValidatorService {
  private readonly ajv = new Ajv();

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

    this.ajv.compile(metaSchema);
    this.ajv.compile(jsonPatchSchema);
    this.ajv.compile(tableMigrationsSchema);
    this.validator = this.ajv.compile(migrationSchema);
  }

  public validate(data: unknown): Migration[] {
    const valid = this.validator(data);

    if (valid) {
      console.log('✅ JSON file is valid');
      console.log(`Validated ${data.length} items`);
    } else {
      console.log('❌ JSON file validation failed:');
      console.log(this.validator.errors);
      process.exit(1);
    }

    return data;
  }
}
