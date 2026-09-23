import {
  AuthRecipeSchema,
  ClearSchema,
  ProjectSchema,
  TagSchema,
  UserSchema,
  type AppState,
  type Project,
  type SeedInput,
  type SeedUserInput,
} from './schema';
import { slugId } from './util';

export type MergeResult = {
  projectsAdded: number;
  projectsUpdated: number;
  usersAdded: number;
  usersUpdated: number;
  errors: string[];
};

function upsertUser(project: Project, seedUser: SeedUserInput, result: MergeResult): void {
  const id = seedUser.id ?? crypto.randomUUID();
  const user = UserSchema.parse({ ...seedUser, id });
  const index = project.users.findIndex((entry) => entry.id === id || entry.name === user.name);
  const current = project.users[index];
  if (current) {
    project.users[index] = { ...current, ...user, id: current.id };
    result.usersUpdated++;
  } else {
    project.users.push(user);
    result.usersAdded++;
  }
}

/** Copies the state with passwords and cached auth tokens blanked (cookies stay — they are the seed payload). */
export function stripSecrets(state: AppState): AppState {
  const next = structuredClone(state) as AppState;
  for (const project of next.projects) {
    for (const user of project.users) {
      user.credentials.password = '';
      user.session = { vars: {} };
    }
  }
  return next;
}

/** Merges a seed file into the state: projects by id/name, users by id/name (seed wins). */
export function mergeSeed(state: AppState, seed: SeedInput): { state: AppState; result: MergeResult } {
  const next = structuredClone(state) as AppState;
  const result: MergeResult = { projectsAdded: 0, projectsUpdated: 0, usersAdded: 0, usersUpdated: 0, errors: [] };

  for (const seedProject of seed.projects) {
    const existing = next.projects.find((entry) => entry.id === seedProject.id || entry.name === seedProject.name);
    if (!existing) {
      if (!seedProject.origins || seedProject.origins.length === 0) {
        result.errors.push(`Project "${seedProject.name}" skipped: origins are required for new projects`);
        continue;
      }
      const created = ProjectSchema.parse({
        ...seedProject,
        id: seedProject.id ?? slugId(seedProject.name),
        users: [],
      });
      for (const seedUser of seedProject.users ?? []) upsertUser(created, seedUser, result);
      next.projects.push(created);
      result.projectsAdded++;
      continue;
    }

    if (seedProject.origins && seedProject.origins.length > 0) existing.origins = seedProject.origins;
    if (seedProject.tags) existing.tags = seedProject.tags.map((tag) => TagSchema.parse(tag));
    if (seedProject.auth) existing.auth = AuthRecipeSchema.parse(seedProject.auth);
    if (seedProject.clear) existing.clear = ClearSchema.parse(seedProject.clear);
    if (seedProject.reload) existing.reload = seedProject.reload;
    for (const seedUser of seedProject.users ?? []) upsertUser(existing, seedUser, result);
    result.projectsUpdated++;
  }

  return { state: next, result };
}
