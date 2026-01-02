/**
 * Safely parses a boolean option value.
 * Returns true for: undefined, 'true', '1', 'yes'
 * Returns false for: 'false', '0', 'no'
 * Throws error for other values.
 */
export function parseBooleanOption(value: string | undefined): boolean {
  if (value === undefined) {
    return true;
  }

  const lowered = value.toLowerCase();

  if (lowered === 'true' || lowered === '1' || lowered === 'yes') {
    return true;
  }

  if (lowered === 'false' || lowered === '0' || lowered === 'no') {
    return false;
  }

  throw new Error(
    `Invalid boolean value: "${value}". Use true/false, yes/no, or 1/0.`,
  );
}
