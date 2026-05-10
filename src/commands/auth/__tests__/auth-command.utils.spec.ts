import {
  formatAuthLoginHint,
  formatAuthRevisiumUrl,
  formatAuthTarget,
} from '../auth-command.utils';

describe('auth command formatting helpers', () => {
  it('formats instance and URL targets consistently', () => {
    expect(formatAuthTarget('cloud', 'https://cloud.revisium.io')).toBe(
      'instance "cloud" (https://cloud.revisium.io)',
    );
    expect(formatAuthTarget(undefined, 'https://cloud.revisium.io')).toBe(
      'https://cloud.revisium.io',
    );
  });

  it('formats login hints for instance and URL targets', () => {
    expect(
      formatAuthLoginHint({
        instanceName: 'cloud',
        baseUrl: 'https://cloud.revisium.io',
        credential: 'admin',
      }),
    ).toBe('--instance \'cloud\' --credential \'admin\' --api-key');

    expect(
      formatAuthLoginHint({
        baseUrl: 'https://cloud.revisium.io',
        credential: 'default',
      }),
    ).toBe(
      '--url \'revisium://cloud.revisium.io\' --credential \'default\' --api-key',
    );
  });

  it('formats HTTP base URLs as revisium URLs', () => {
    expect(formatAuthRevisiumUrl('http://localhost:9222')).toBe(
      'revisium+http://localhost:9222',
    );
  });
});
