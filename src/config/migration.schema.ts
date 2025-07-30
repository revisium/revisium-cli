import { Schema } from 'ajv/dist/2020';

export const migrationSchema: Schema = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      tableId: { type: 'string' },
      date: { type: 'string' },
      hash: { type: 'string' },
      patches: {
        type: 'array',
        items: { type: 'object' },
      },
    },
    required: ['date', 'hash', 'patches'],
    additionalProperties: false,
  },
};
