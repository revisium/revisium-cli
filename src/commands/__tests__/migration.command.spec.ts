import { Test, TestingModule } from '@nestjs/testing';
import { MigrationCommand } from '../migration.command';

describe('MigrationCommand', () => {
  it('runs without errors', async () => {
    // Mock the protected command property
    Object.defineProperty(command, 'command', {
      value: { help: jest.fn() },
      configurable: true,
    });

    const result = await command.run();
    expect(result).toBeUndefined();
  });

  it('initializes without errors', () => {
    expect(command).toBeDefined();
    expect(command).toBeInstanceOf(MigrationCommand);
  });

  let command: MigrationCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MigrationCommand],
    }).compile();

    command = module.get<MigrationCommand>(MigrationCommand);
  });
});
