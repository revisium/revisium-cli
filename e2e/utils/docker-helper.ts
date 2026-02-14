import { E2E_CONFIG } from './constants';

export async function waitForHealthy(
  url: string,
  timeout: number = E2E_CONFIG.HEALTH_CHECK_TIMEOUT,
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        console.log(`Health check passed: ${url}`);
        return;
      }
    } catch {
      // Service not ready yet
    }

    await new Promise((resolve) =>
      setTimeout(resolve, E2E_CONFIG.HEALTH_CHECK_INTERVAL),
    );
  }

  throw new Error(`Health check timeout: ${url} not ready after ${timeout}ms`);
}
