export const E2E_CONFIG = {
  API_URL: 'http://localhost:8082',
  ADMIN_USERNAME: 'admin',
  ADMIN_PASSWORD: 'admin',
  DOCKER_COMPOSE_FILE: 'e2e/docker-compose.e2e.yml',
  DOCKER_PROJECT_NAME: 'revisium-cli-e2e',
  HEALTH_CHECK_TIMEOUT: 60000,
  HEALTH_CHECK_INTERVAL: 1000,
};

export const FIXTURES_PATH = 'e2e/fixtures/demo-quests';
