import { Schema } from 'ajv/dist/2020';
import { SystemSchemaIds } from 'src/config/schema-ids.consts';
import { JsonSchemaTypeName, JsonStringSchema } from 'src/types/schema.types';
export const rowCreatedAtSchema: JsonStringSchema = {
  type: JsonSchemaTypeName.String,
  default: '',
  readOnly: true,
};

export const ajvRowCreatedAtSchema: Schema = {
  $id: SystemSchemaIds.RowCreatedAt,
  ...rowCreatedAtSchema,
};
