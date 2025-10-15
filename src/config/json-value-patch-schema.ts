import { Schema } from 'ajv/dist/2020';

export const jsonValuePatchSchema: Schema = {
  $id: 'json-value-patch-schema.json',
  title: 'JSON schema for JSON Value Patch operations',
  type: 'array',
  minItems: 1,
  items: {
    oneOf: [
      {
        type: 'object',
        additionalProperties: false,
        required: ['value', 'op', 'path'],
        properties: {
          path: {
            description:
              'A path string (e.g., "title", "address.city", "tags[0]")',
            type: 'string',
          },
          op: {
            description: 'The operation to perform',
            type: 'string',
            enum: ['add', 'replace'],
          },
          value: {
            description: 'The value to add or replace (any JSON value)',
          },
        },
      },
      {
        type: 'object',
        additionalProperties: false,
        required: ['op', 'path'],
        properties: {
          path: {
            description:
              'A path string (e.g., "title", "address.city", "tags[0]")',
            type: 'string',
          },
          op: {
            description: 'The operation to perform',
            type: 'string',
            enum: ['remove'],
          },
        },
      },
    ],
  },
};
