import { api, Project } from './api-client';

const createdProjects: Array<{ orgId: string; name: string }> = [];

export function generateProjectName(prefix: string = 'e2e'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function createTestProject(
  name?: string,
  orgId: string = 'admin',
): Promise<Project> {
  const projectName = name || generateProjectName();

  const project = await api.createProject(orgId, projectName);
  createdProjects.push({ orgId, name: projectName });

  return project;
}

export async function deleteTestProject(
  projectName: string,
  orgId: string = 'admin',
): Promise<void> {
  try {
    await api.deleteProject(orgId, projectName);
  } catch (error) {
    // Ignore errors - project might not exist
    console.warn(`Failed to delete project ${projectName}:`, error);
  }
}

export async function cleanupAllTestProjects(): Promise<void> {
  for (const { orgId, name } of createdProjects) {
    await deleteTestProject(name, orgId);
  }
  createdProjects.length = 0;
}
