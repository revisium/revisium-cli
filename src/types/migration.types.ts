import {
  InitMigrationDto,
  RemoveMigrationDto,
  RenameMigrationDto,
  UpdateMigrationDto,
} from 'src/__generated__/api';

export type Migration =
  | InitMigrationDto
  | RenameMigrationDto
  | UpdateMigrationDto
  | RemoveMigrationDto;
