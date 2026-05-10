export interface AuthCommandTarget {
  instanceName?: string;
  baseUrl: string;
  credential: string;
}

function quoteArg(value: string): string {
  return JSON.stringify(value);
}

export function formatAuthTarget(
  instanceName: string | undefined,
  baseUrl: string,
): string {
  return instanceName ? `instance "${instanceName}" (${baseUrl})` : baseUrl;
}

export function formatAuthLoginHint(target: AuthCommandTarget): string {
  const targetSelector = target.instanceName
    ? `--instance ${quoteArg(target.instanceName)}`
    : `--url ${quoteArg(formatAuthRevisiumUrl(target.baseUrl))}`;

  return `${targetSelector} --credential ${quoteArg(target.credential)} --api-key`;
}

export function formatAuthRevisiumUrl(baseUrl: string): string {
  if (baseUrl.startsWith('http://')) {
    return `revisium+http://${baseUrl.slice('http://'.length)}`;
  }

  return `revisium://${baseUrl.replace(/^https:\/\//, '')}`;
}
