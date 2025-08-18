import { Schema } from 'ajv/dist/2020';
import { SystemSchemaIds } from 'src/config/schema-ids.consts';
import { JsonSchemaTypeName, JsonStringSchema } from 'src/types/schema.types';

export const rowHashSchema: JsonStringSchema = {
  type: JsonSchemaTypeName.String,
  default: '',
  readOnly: true,
};

export const ajvRowHashSchema: Schema = {
  $id: SystemSchemaIds.RowHash,
  ...rowHashSchema,
};
