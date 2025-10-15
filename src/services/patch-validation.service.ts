import { Injectable } from '@nestjs/common';
import { JsonSchemaStore } from '@revisium/schema-toolkit';
import { CoreApiService } from './core-api.service';
import { DraftRevisionService } from './draft-revision.service';
import { JsonValidatorService } from './json-validator.service';
import {
  PatchFile,
  ValidationResult,
  ValidationError,
} from '../types/patch.types';
import { patchFileSchema } from '../config/patch-file.schema';
import { JsonSchema } from '@revisium/schema-toolkit/types';
import {
  createJsonSchemaStore,
  getJsonSchemaStoreByPath,
  convertJsonPathToSchemaPath,
} from '@revisium/schema-toolkit/lib';
import {
  rowIdSchema,
  rowCreatedIdSchema,
  rowVersionIdSchema,
  rowCreatedAtSchema,
  rowPublishedAtSchema,
  rowUpdatedAtSchema,
  rowHashSchema,
  rowSchemaHashSchema,
  fileSchema,
} from '@revisium/schema-toolkit/plugins';
import { SystemSchemaIds } from '@revisium/schema-toolkit/consts';

@Injectable()
export class PatchValidationService {
  private readonly refs: Readonly<Record<string, JsonSchema>>;

  constructor(
    private readonly coreApi: CoreApiService,
    private readonly draftRevisionService: DraftRevisionService,
    private readonly jsonValidator: JsonValidatorService,
  ) {
    this.refs = {
      [SystemSchemaIds.RowId]: rowIdSchema,
      [SystemSchemaIds.RowCreatedId]: rowCreatedIdSchema,
      [SystemSchemaIds.RowVersionId]: rowVersionIdSchema,
      [SystemSchemaIds.RowCreatedAt]: rowCreatedAtSchema,
      [SystemSchemaIds.RowPublishedAt]: rowPublishedAtSchema,
      [SystemSchemaIds.RowUpdatedAt]: rowUpdatedAtSchema,
      [SystemSchemaIds.RowHash]: rowHashSchema,
      [SystemSchemaIds.RowSchemaHash]: rowSchemaHashSchema,
      [SystemSchemaIds.File]: fileSchema,
    };
  }

  public validateFormat(patchFile: PatchFile): ValidationResult {
    const errors: ValidationError[] = [];

    const validate = this.jsonValidator.ajv.compile(patchFileSchema);
    const isValid = validate(patchFile);

    if (!isValid && validate.errors) {
      for (const error of validate.errors) {
        const path = error.instancePath || '';
        const message = `${path} ${error.message || ''}`;
        errors.push({
          rowId: (patchFile as PatchFile).rowId,
          path: path,
          message: message.trim(),
        });
      }
    }

    return { valid: errors.length === 0, errors };
  }

  public validateAgainstSchema(
    patchFile: PatchFile,
    tableSchema: JsonSchema,
  ): ValidationResult {
    const errors: ValidationError[] = [];

    try {
      const schemaStore = createJsonSchemaStore(tableSchema, this.refs);

      for (const patch of patchFile.patches) {
        try {
          const schemaPath = convertJsonPathToSchemaPath(patch.path);
          const fieldSchema = getJsonSchemaStoreByPath(schemaStore, schemaPath);

          if (!fieldSchema) {
            errors.push({
              rowId: patchFile.rowId,
              path: patch.path,
              message: `Path '${patch.path}' does not exist in table schema`,
            });
            continue;
          }

          if (
            (patch.op === 'replace' || patch.op === 'add') &&
            'value' in patch
          ) {
            const typeError = this.validateValueType(
              patch.value,
              fieldSchema,
              patch.path,
            );
            if (typeError) {
              errors.push({
                rowId: patchFile.rowId,
                path: patch.path,
                message: typeError,
              });
            }
          }
        } catch (error) {
          errors.push({
            rowId: patchFile.rowId,
            path: patch.path,
            message: `Invalid path '${patch.path}': ${error instanceof Error ? error.message : String(error)}`,
          });
        }
      }
    } catch (error) {
      errors.push({
        rowId: patchFile.rowId,
        message: `Schema validation error: ${error instanceof Error ? error.message : String(error)}`,
      });
    }

    return { valid: errors.length === 0, errors };
  }

  public async validate(
    patchFile: PatchFile,
    options: { organization?: string; project?: string; branch?: string },
  ): Promise<ValidationResult> {
    const formatResult = this.validateFormat(patchFile);
    if (!formatResult.valid) {
      return formatResult;
    }

    try {
      const revisionId =
        await this.draftRevisionService.getDraftRevisionId(options);

      const tableSchema = await this.getTableSchema(
        patchFile.table,
        revisionId,
      );

      return this.validateAgainstSchema(patchFile, tableSchema);
    } catch (error) {
      return {
        valid: false,
        errors: [
          {
            rowId: patchFile.rowId,
            message: `Failed to fetch table schema: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  }

  public async validateAll(
    patchFiles: PatchFile[],
    options: { organization?: string; project?: string; branch?: string },
  ): Promise<ValidationResult[]> {
    const results: ValidationResult[] = [];

    let revisionId: string;
    try {
      revisionId = await this.draftRevisionService.getDraftRevisionId(options);
    } catch (error) {
      return patchFiles.map((patchFile) => ({
        valid: false,
        errors: [
          {
            rowId: patchFile.rowId,
            message: `Failed to get revision ID: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      }));
    }

    const schemaCache = new Map<string, JsonSchema>();

    for (const patchFile of patchFiles) {
      const formatResult = this.validateFormat(patchFile);
      if (!formatResult.valid) {
        results.push(formatResult);
        continue;
      }

      try {
        let tableSchema = schemaCache.get(patchFile.table);
        if (!tableSchema) {
          tableSchema = await this.getTableSchema(patchFile.table, revisionId);
          schemaCache.set(patchFile.table, tableSchema);
        }

        const schemaResult = this.validateAgainstSchema(patchFile, tableSchema);
        results.push(schemaResult);
      } catch (error) {
        results.push({
          valid: false,
          errors: [
            {
              rowId: patchFile.rowId,
              message: `Failed to fetch table schema: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        });
      }
    }

    return results;
  }

  private async getTableSchema(
    tableName: string,
    revisionId: string,
  ): Promise<JsonSchema> {
    const response = await this.coreApi.api.tableSchema(revisionId, tableName);

    if (response.error) {
      throw new Error(
        `Failed to fetch table schema: ${JSON.stringify(response.error)}`,
      );
    }

    if (!response.data) {
      throw new Error('Table schema not found');
    }

    return response.data as JsonSchema;
  }

  private validateValueType(
    value: unknown,
    fieldSchema: JsonSchemaStore,
    path: string,
  ): string | null {
    try {
      const plainSchema = fieldSchema.getPlainSchema();

      const validate = this.jsonValidator.ajv.compile(plainSchema);
      const isValid = validate(value);

      if (!isValid && validate.errors) {
        const errorMessages = validate.errors
          .map((err) => err.message || 'validation failed')
          .join(', ');
        return `Value at '${path}' validation failed: ${errorMessages}`;
      }

      return null;
    } catch (error) {
      return `Failed to validate value at '${path}': ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}
