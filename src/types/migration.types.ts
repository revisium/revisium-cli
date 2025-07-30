import { JsonPatch } from 'src/types/json-patch.types';

export type Migration = {
  tableId: string;
  date: string;
  hash: string;
  patches: JsonPatch[];
};
