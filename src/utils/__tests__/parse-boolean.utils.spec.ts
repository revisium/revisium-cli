import { parseBooleanOption } from '../parse-boolean.utils';

describe('parseBooleanOption', () => {
  describe('returns true', () => {
    it('when value is undefined', () => {
      expect(parseBooleanOption(undefined)).toBe(true);
    });

    it('when value is "true"', () => {
      expect(parseBooleanOption('true')).toBe(true);
    });

    it('when value is "TRUE" (case insensitive)', () => {
      expect(parseBooleanOption('TRUE')).toBe(true);
    });

    it('when value is "1"', () => {
      expect(parseBooleanOption('1')).toBe(true);
    });

    it('when value is "yes"', () => {
      expect(parseBooleanOption('yes')).toBe(true);
    });

    it('when value is "YES" (case insensitive)', () => {
      expect(parseBooleanOption('YES')).toBe(true);
    });
  });

  describe('returns false', () => {
    it('when value is "false"', () => {
      expect(parseBooleanOption('false')).toBe(false);
    });

    it('when value is "FALSE" (case insensitive)', () => {
      expect(parseBooleanOption('FALSE')).toBe(false);
    });

    it('when value is "0"', () => {
      expect(parseBooleanOption('0')).toBe(false);
    });

    it('when value is "no"', () => {
      expect(parseBooleanOption('no')).toBe(false);
    });

    it('when value is "NO" (case insensitive)', () => {
      expect(parseBooleanOption('NO')).toBe(false);
    });
  });

  describe('throws error', () => {
    it('when value is invalid string', () => {
      expect(() => parseBooleanOption('invalid')).toThrow(
        'Invalid boolean value: "invalid"',
      );
    });

    it('when value is empty string', () => {
      expect(() => parseBooleanOption('')).toThrow('Invalid boolean value');
    });

    it('when value is random text', () => {
      expect(() => parseBooleanOption('maybe')).toThrow(
        'Invalid boolean value',
      );
    });
  });
});
