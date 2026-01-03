import { execSync } from 'child_process';
import { E2E_CONFIG } from './constants';

export function startDocker(): void {
  console.log('Starting Docker containers...');

  execSync(
    `docker compose -f ${E2E_CONFIG.DOCKER_COMPOSE_FILE} -p ${E2E_CONFIG.DOCKER_PROJECT_NAME} up -d --wait`,
    { stdio: 'inherit' },
  );

  console.log('Docker containers started');
}

export function stopDocker(): void {
  console.log('Stopping Docker containers...');

  execSync(
    `docker compose -f ${E2E_CONFIG.DOCKER_COMPOSE_FILE} -p ${E2E_CONFIG.DOCKER_PROJECT_NAME} down -v`,
    { stdio: 'inherit' },
  );

  console.log('Docker containers stopped');
}

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
