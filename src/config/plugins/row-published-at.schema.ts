import { Schema } from 'ajv/dist/2020';
import { SystemSchemaIds } from 'src/config/schema-ids.consts';
import { JsonSchemaTypeName, JsonStringSchema } from 'src/types/schema.types';

export const rowPublishedAtSchema: JsonStringSchema = {
  type: JsonSchemaTypeName.String,
  default: '',
};

export const ajvRowPublishedAtSchema: Schema = {
  $id: SystemSchemaIds.RowPublishedAt,
  ...rowPublishedAtSchema,
};
