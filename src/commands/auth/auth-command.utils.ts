export interface AuthCommandTarget {
  instanceName?: string;
  baseUrl: string;
  credential: string;
}

export function formatAuthTarget(
  instanceName: string | undefined,
  baseUrl: string,
): string {
  return instanceName ? `instance "${instanceName}" (${baseUrl})` : baseUrl;
}

export function formatAuthLoginHint(target: AuthCommandTarget): string {
  const targetSelector = target.instanceName
    ? `--instance ${target.instanceName}`
    : `--url ${formatAuthRevisiumUrl(target.baseUrl)}`;

  return `${targetSelector} --credential ${target.credential} --api-key`;
}

export function formatAuthRevisiumUrl(baseUrl: string): string {
  return `revisium://${baseUrl.replace(/^https?:\/\//, '')}`;
}
