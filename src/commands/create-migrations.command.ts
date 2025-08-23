import { readdir, readFile, writeFile } from 'fs/promises';
import { join, extname } from 'path';
import { CommandRunner, Option, SubCommand } from 'nest-commander';
import { JsonValidatorService } from 'src/services/json-validator.service';
import { TableDependencyService } from 'src/services/table-dependency.service';
import { JsonSchema } from 'src/types/schema.types';
import { InitMigrationDto } from 'src/__generated__/api';
import * as objectHash from 'object-hash';

type Options = {
  schemasFolder: string;
  file: string;
};

@SubCommand({
  name: 'create-migrations',
  description: 'Convert schemas from folder to migration file',
})
export class CreateMigrationsCommand extends CommandRunner {
  constructor(
    private readonly jsonValidatorService: JsonValidatorService,
    private readonly tableDependencyService: TableDependencyService,
  ) {
    super();
  }

  async run(_inputs: string[], options: Options): Promise<void> {
    if (!options.schemasFolder) {
      throw new Error('Error: --schemas-folder option is required');
    }

    if (!options.file) {
      throw new Error('Error: --file option is required');
    }

    const schemas = await this.loadSchemas(options.schemasFolder);
    const migrations = this.createMigrations(schemas);

    this.jsonValidatorService.validateMigration(migrations);

    await writeFile(options.file, JSON.stringify(migrations, null, 2), 'utf-8');

    console.log(
      `✅ Successfully created ${migrations.length} migrations in: ${options.file}`,
    );
  }

  private async loadSchemas(
    folderPath: string,
  ): Promise<Record<string, JsonSchema>> {
    const schemas: Record<string, JsonSchema> = {};

    try {
      const files = await readdir(folderPath);
      const jsonFiles = files.filter((file) => extname(file) === '.json');

      console.log(
        `📋 Loading ${jsonFiles.length} schema files from: ${folderPath}`,
      );

      for (const file of jsonFiles) {
        const filePath = join(folderPath, file);
        const content = await readFile(filePath, 'utf-8');
        const schema: JsonSchema = JSON.parse(content) as JsonSchema;

        // Use filename without extension as table ID
        const tableId = file.replace('.json', '');
        schemas[tableId] = schema;

        console.log(`✅ Loaded schema for table: ${tableId}`);
      }

      return schemas;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to load schemas from ${folderPath}: ${errorMessage}`,
      );
    }
  }

  private createMigrations(
    schemas: Record<string, JsonSchema>,
  ): InitMigrationDto[] {
    // Analyze dependencies and get sorted tables
    const dependencyResult =
      this.tableDependencyService.analyzeDependencies(schemas);

    // Log dependency analysis
    console.log(
      this.tableDependencyService.formatDependencyInfo(
        dependencyResult,
        Object.keys(schemas),
      ),
    );

    // Show warnings if there are circular dependencies
    if (dependencyResult.warnings.length > 0) {
      console.log('\n⚠️  Warnings:');
      for (const warning of dependencyResult.warnings) {
        console.log(warning);
      }
    }

    // Create migrations in dependency order
    const migrations: InitMigrationDto[] = [];
    const baseTime = Date.now();

    for (let i = 0; i < dependencyResult.sortedTables.length; i++) {
      const tableId = dependencyResult.sortedTables[i];
      const schema = schemas[tableId];

      if (!schema) {
        console.warn(`⚠️  Schema not found for table: ${tableId}`);
        continue;
      }

      // Generate unique ISO date string for each migration
      // Add milliseconds to ensure unique timestamps even when generated rapidly
      const migrationDate = new Date(baseTime + i * 10); // 10ms apart to ensure uniqueness
      const id = migrationDate.toISOString();

      // Generate hash for the schema
      const hash = this.generateSchemaHash(schema);

      const migration: InitMigrationDto = {
        changeType: 'init',
        tableId,
        hash,
        id,
        schema,
      };

      migrations.push(migration);
      console.log(`📦 Created migration for table: ${tableId} (${id})`);
    }

    console.log(`\n🎉 Generated ${migrations.length} migrations`);

    return migrations;
  }

  private generateSchemaHash(schema: JsonSchema): string {
    return objectHash(schema);
  }

  @Option({
    flags: '--schemas-folder <folder>',
    description: 'Folder containing schema JSON files',
    required: true,
  })
  parseSchemasFolder(value: string) {
    return value;
  }

  @Option({
    flags: '-f, --file <file>',
    description: 'Output file for generated migrations',
    required: true,
  })
  parseFile(value: string) {
    return value;
  }
}
