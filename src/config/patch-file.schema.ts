import { Schema } from 'ajv/dist/2020';

export const patchFileSchema: Schema = {
  $id: 'patch-file-schema.json',
  type: 'object',
  required: ['version', 'table', 'rowId', 'createdAt', 'patches'],
  properties: {
    version: {
      type: 'string',
      enum: ['1.0'],
      description: 'Patch file format version',
    },
    table: {
      type: 'string',
      minLength: 1,
      description: 'Table name',
    },
    rowId: {
      type: 'string',
      minLength: 1,
      description: 'Row ID',
    },
    createdAt: {
      type: 'string',
      format: 'date-time',
      description: 'ISO date when patches were created',
    },
    patches: {
      $ref: 'json-value-patch-schema.json',
      description: 'Array of JSON Value Patch operations',
    },
  },
  additionalProperties: false,
};

export const patchFileMergedSchema: Schema = {
  $id: 'patch-file-merged-schema.json',
  type: 'object',
  required: ['version', 'table', 'createdAt', 'rows'],
  properties: {
    version: {
      type: 'string',
      enum: ['1.0'],
      description: 'Patch file format version',
    },
    table: {
      type: 'string',
      minLength: 1,
      description: 'Table name',
    },
    createdAt: {
      type: 'string',
      format: 'date-time',
      description: 'ISO date when patches were created',
    },
    rows: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['rowId', 'patches'],
        properties: {
          rowId: {
            type: 'string',
            minLength: 1,
            description: 'Row ID',
          },
          patches: {
            $ref: 'json-value-patch-schema.json',
            description: 'Array of JSON Value Patch operations',
          },
        },
        additionalProperties: false,
      },
      description: 'Array of row patches',
    },
  },
  additionalProperties: false,
};
