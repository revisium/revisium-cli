module.exports = {
  extends: '@istanbuljs/nyc-config-typescript',
  all: true,
  include: ['src/**/*.ts'],
  exclude: [
    'src/**/*.spec.ts',
    'src/**/*.e2e-spec.ts',
    'src/**/__tests__/**',
    'src/**/__mocks__/**',
    'src/__generated__/**',
    'src/types/**',
    'src/main.ts',
  ],
  reporter: ['json', 'lcov', 'text-summary'],
  'report-dir': 'coverage/e2e',
  'temp-dir': '.nyc_output',
  sourceMap: true,
  instrument: true,
};
