import type {
  InitMigrationDto,
  RemoveMigrationDto,
  RenameMigrationDto,
  UpdateMigrationDto,
} from '@revisium/client';

export type Migration =
  | InitMigrationDto
  | RenameMigrationDto
  | UpdateMigrationDto
  | RemoveMigrationDto;
