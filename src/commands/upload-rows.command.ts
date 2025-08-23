import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { Option, SubCommand } from 'nest-commander';
import { BaseCommand } from 'src/commands/base.command';
import { CoreApiService } from 'src/services/core-api.service';
import { DraftRevisionService } from 'src/services/draft-revision.service';
import { JsonValidatorService } from 'src/services/json-validator.service';
import { TableDependencyService } from 'src/services/table-dependency.service';
import { JsonValue } from 'src/types/json.types';
import { JsonSchema } from 'src/types/schema.types';

type Options = {
  folder: string;
  tables?: string;
  organization?: string;
  project?: string;
  branch?: string;
};

interface UploadStats {
  totalRows: number;
  uploaded: number;
  updated: number;
  skipped: number;
  invalidSchema: number;
  createErrors: number;
  updateErrors: number;
  otherErrors: number;
}

interface RowData {
  id: string;
  data: JsonValue;
  [key: string]: any;
}

@SubCommand({
  name: 'upload',
  description: 'Upload rows from JSON files to Revisium tables',
})
export class UploadRowsCommand extends BaseCommand {
  constructor(
    private readonly coreApiService: CoreApiService,
    private readonly draftRevisionService: DraftRevisionService,
    private readonly jsonValidatorService: JsonValidatorService,
    private readonly tableDependencyService: TableDependencyService,
  ) {
    super();
  }

  async run(_inputs: string[], options: Options): Promise<void> {
    if (!options.folder) {
      throw new Error('Error: --folder option is required');
    }

    await this.coreApiService.tryToLogin(options);
    const revisionId =
      await this.draftRevisionService.getDraftRevisionId(options);
    await this.uploadAllTableRows(revisionId, options.folder, options.tables);
  }

  private async uploadAllTableRows(
    revisionId: string,
    folderPath: string,
    tableFilter?: string,
  ) {
    try {
      const originalTables = await this.getTargetTables(
        folderPath,
        tableFilter,
      );

      console.log(`📊 Found ${originalTables.length} tables to process`);

      // Get schemas for dependency analysis
      const tableSchemas: Record<string, JsonSchema> = {};
      for (const tableId of originalTables) {
        try {
          const schemaResult = await this.api.tableSchema(revisionId, tableId);
          tableSchemas[tableId] = schemaResult.data as JsonSchema;
        } catch (error) {
          console.warn(
            `⚠️  Could not fetch schema for table ${tableId}:`,
            error,
          );
        }
      }

      // Analyze dependencies and sort tables
      const dependencyResult =
        this.tableDependencyService.analyzeDependencies(tableSchemas);

      // Show dependency information
      console.log(
        this.tableDependencyService.formatDependencyInfo(
          dependencyResult,
          originalTables,
        ),
      );

      // Log warnings for circular dependencies
      for (const warning of dependencyResult.warnings) {
        console.warn(warning);
      }

      const tablesToProcess = dependencyResult.sortedTables.filter((tableId) =>
        originalTables.includes(tableId),
      );

      const totalStats: UploadStats = {
        totalRows: 0,
        uploaded: 0,
        updated: 0,
        skipped: 0,
        invalidSchema: 0,
        createErrors: 0,
        updateErrors: 0,
        otherErrors: 0,
      };

      for (const tableId of tablesToProcess) {
        const tableStats = await this.uploadRowsToTable(
          revisionId,
          tableId,
          folderPath,
        );
        this.aggregateStats(totalStats, tableStats);
      }

      this.printFinalStats(totalStats);
    } catch (error) {
      console.error(
        'Error uploading table rows:',
        error instanceof Error ? error.message : String(error),
      );
      process.exit(1);
    }
  }

  private async getTargetTables(
    folderPath: string,
    tableFilter?: string,
  ): Promise<string[]> {
    if (tableFilter) {
      return tableFilter.split(',').map((id) => id.trim());
    }

    // Scan folder for table directories
    const entries = await readdir(folderPath, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  }

  private async uploadRowsToTable(
    revisionId: string,
    tableId: string,
    folderPath: string,
  ): Promise<UploadStats> {
    const stats: UploadStats = {
      totalRows: 0,
      uploaded: 0,
      updated: 0,
      skipped: 0,
      invalidSchema: 0,
      createErrors: 0,
      updateErrors: 0,
      otherErrors: 0,
    };

    try {
      console.log(`📋 Processing table: ${tableId}`);

      // Get table schema for validation
      const schemaResult = await this.api.tableSchema(revisionId, tableId);
      const tableSchema = schemaResult.data as JsonSchema;
      const validator = this.createDataValidator(tableSchema);

      // Get all row files from table folder
      const tableFolderPath = join(folderPath, tableId);
      const rowFiles = await readdir(tableFolderPath);
      const jsonFiles = rowFiles.filter((file) => file.endsWith('.json'));

      stats.totalRows = jsonFiles.length;
      console.log(`  📊 Found ${stats.totalRows} rows in table ${tableId}`);

      // Process each row file
      for (const fileName of jsonFiles) {
        const filePath = join(tableFolderPath, fileName);
        try {
          const fileContent = await readFile(filePath, 'utf-8');
          const rowData = JSON.parse(fileContent) as RowData;

          // Validate entire row against schema
          if (!validator(rowData.data)) {
            stats.invalidSchema++;
            continue;
          }

          // Check if row exists and upload/update accordingly
          const uploadResult = await this.uploadOrUpdateRow(
            revisionId,
            tableId,
            rowData,
          );

          switch (uploadResult) {
            case 'uploaded':
              stats.uploaded++;
              break;
            case 'updated':
              stats.updated++;
              break;
            case 'skipped':
              stats.skipped++;
              break;
            case 'createError':
              stats.createErrors++;
              break;
            case 'updateError':
              stats.updateErrors++;
              break;
          }
        } catch {
          stats.otherErrors++;
        }
      }

      console.log(
        `✅ Table ${tableId}: ${stats.uploaded} uploaded, ${stats.updated} updated, ${stats.skipped} skipped, ${stats.invalidSchema} invalid schema, ${stats.createErrors} create errors, ${stats.updateErrors} update errors, ${stats.otherErrors} other errors`,
      );

      return stats;
    } catch (error) {
      console.error(`❌ Failed to process table ${tableId}:`, error);
      stats.otherErrors = stats.totalRows;
      return stats;
    }
  }

  private createDataValidator(
    tableSchema: JsonSchema,
  ): (rowData: JsonValue) => boolean {
    // Table schema is ready to validate the entire JSON row file
    if (tableSchema) {
      const validate = this.jsonValidatorService.validateSchema(tableSchema);
      return (rowData: JsonValue) => validate(rowData);
    }

    // If no schema found, accept all data
    return () => false;
  }

  private async uploadOrUpdateRow(
    revisionId: string,
    tableId: string,
    rowData: RowData,
  ): Promise<
    'uploaded' | 'updated' | 'skipped' | 'createError' | 'updateError'
  > {
    try {
      // Check if row exists
      const existingRowResult = await this.api.row(
        revisionId,
        tableId,
        rowData.id,
      );

      if (existingRowResult.data) {
        // Row exists, check if data is different
        const existingRow = existingRowResult.data as RowData;

        if (this.isDataIdentical(rowData.data, existingRow.data)) {
          return 'skipped'; // No changes needed
        }

        // Update existing row
        try {
          const updateResult = await this.api.updateRow(
            revisionId,
            tableId,
            rowData.id,
            {
              data: rowData.data as object,
              isRestore: true,
            },
          );

          if (updateResult.error) {
            console.error(
              `❌ Update failed for row ${rowData.id}:`,
              updateResult.error,
            );
            return 'updateError';
          }

          if (updateResult.data) {
            return 'updated';
          }

          console.error(
            `❌ Update failed for row ${rowData.id}: No data or error in response`,
          );
          return 'updateError';
        } catch (error) {
          console.error(`❌ Update exception for row ${rowData.id}:`, error);
          return 'updateError';
        }
      }
    } catch {
      // Row doesn't exist or error occurred, try to create new row
    }

    // Create new row
    try {
      const createResult = await this.api.createRow(revisionId, tableId, {
        rowId: rowData.id,
        data: rowData.data as object,
        isRestore: true,
      });

      if (createResult.error) {
        console.error(
          `❌ Create failed for row ${rowData.id}:`,
          createResult.error,
        );
        return 'createError';
      }

      if (createResult.data) {
        return 'uploaded';
      }

      console.error(
        `❌ Create failed for row ${rowData.id}: No data or error in response`,
      );
      return 'createError';
    } catch (error) {
      console.error(`❌ Create exception for row ${rowData.id}:`, error);
      return 'createError';
    }
  }

  private isDataIdentical(data1: JsonValue, data2: JsonValue): boolean {
    return JSON.stringify(data1) === JSON.stringify(data2);
  }

  private aggregateStats(total: UploadStats, table: UploadStats) {
    total.totalRows += table.totalRows;
    total.uploaded += table.uploaded;
    total.updated += table.updated;
    total.skipped += table.skipped;
    total.invalidSchema += table.invalidSchema;
    total.createErrors += table.createErrors;
    total.updateErrors += table.updateErrors;
    total.otherErrors += table.otherErrors;
  }

  private printFinalStats(stats: UploadStats) {
    console.log('\n🎉 Upload Summary:');
    console.log(`📊 Total rows processed: ${stats.totalRows}`);
    console.log(`⬆️  Uploaded (new): ${stats.uploaded}`);
    console.log(`🔄 Updated (changed): ${stats.updated}`);
    console.log(`⏭️  Skipped (identical): ${stats.skipped}`);
    console.log(`❌ Invalid schema: ${stats.invalidSchema}`);
    console.log(`🚫 Create errors: ${stats.createErrors}`);
    console.log(`⚠️  Update errors: ${stats.updateErrors}`);
    console.log(`💥 Other errors: ${stats.otherErrors}`);

    const successful = stats.uploaded + stats.updated;
    const total = stats.totalRows;
    const totalErrors =
      stats.createErrors + stats.updateErrors + stats.otherErrors;
    const successRate =
      total > 0 ? ((successful / total) * 100).toFixed(1) : '0';
    console.log(
      `✅ Success rate: ${successRate}% (${totalErrors} total errors)`,
    );
  }

  private get api() {
    return this.coreApiService.api;
  }

  @Option({
    flags: '-f, --folder <folder>',
    description: 'Folder path containing row files',
    required: true,
  })
  parseFolder(val: string) {
    return val;
  }

  @Option({
    flags: '-t, --tables <tables>',
    description:
      'Comma-separated table IDs (e.g., table1,table2). If not specified, processes all tables found in folder.',
    required: false,
  })
  parseTables(val: string) {
    return val;
  }
}
