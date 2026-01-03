import { Injectable } from '@nestjs/common';
import { JsonSchemaStore } from '@revisium/schema-toolkit';
import { ConnectionService } from './connection.service';
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
    private readonly connectionService: ConnectionService,
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
    try {
      const schemaStore = createJsonSchemaStore(tableSchema, this.refs);
      const errors = patchFile.patches.flatMap((patch) =>
        this.validatePatch(patch, schemaStore, patchFile.rowId),
      );
      return { valid: errors.length === 0, errors };
    } catch (error) {
      return {
        valid: false,
        errors: [
          {
            rowId: patchFile.rowId,
            message: `Schema validation error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  }

  private validatePatch(
    patch: PatchFile['patches'][number],
    schemaStore: JsonSchemaStore,
    rowId: string,
  ): ValidationError[] {
    try {
      return this.validatePatchAgainstSchema(patch, schemaStore, rowId);
    } catch (error) {
      return [
        {
          rowId,
          path: patch.path,
          message: `Invalid path '${patch.path}': ${error instanceof Error ? error.message : String(error)}`,
        },
      ];
    }
  }

  private validatePatchAgainstSchema(
    patch: PatchFile['patches'][number],
    schemaStore: JsonSchemaStore,
    rowId: string,
  ): ValidationError[] {
    const schemaPath = convertJsonPathToSchemaPath(patch.path);
    const fieldSchema = getJsonSchemaStoreByPath(schemaStore, schemaPath);

    if (!fieldSchema) {
      return [
        {
          rowId,
          path: patch.path,
          message: `Path '${patch.path}' does not exist in table schema`,
        },
      ];
    }

    return this.validatePatchValue(patch, fieldSchema, rowId);
  }

  private validatePatchValue(
    patch: PatchFile['patches'][number],
    fieldSchema: JsonSchemaStore,
    rowId: string,
  ): ValidationError[] {
    const isValuePatch =
      (patch.op === 'replace' || patch.op === 'add') && 'value' in patch;

    if (!isValuePatch) {
      return [];
    }

    const typeError = this.validateValueType(
      patch.value,
      fieldSchema,
      patch.path,
    );

    if (typeError) {
      return [{ rowId, path: patch.path, message: typeError }];
    }

    return [];
  }

  public async validateAllWithRevisionId(
    patchFiles: PatchFile[],
    revisionId: string,
  ): Promise<ValidationResult[]> {
    const results: ValidationResult[] = [];
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
    const response = await this.connectionService.api.tableSchema(
      revisionId,
      tableName,
    );

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
