import { Test, TestingModule } from '@nestjs/testing';
import { RowsCommand } from '../rows.command';

describe('RowsCommand', () => {
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
    expect(command).toBeInstanceOf(RowsCommand);
  });

  let command: RowsCommand;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RowsCommand],
    }).compile();

    command = module.get<RowsCommand>(RowsCommand);
  });
});
