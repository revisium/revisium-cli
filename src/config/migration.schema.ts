import { Schema } from 'ajv/dist/2020';

export const migrationSchema: Schema = {
  type: 'array',
  items: {
    $ref: 'table-migrations-schema.json',
  },
};
