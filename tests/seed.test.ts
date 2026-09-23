import { describe, expect, it } from 'vitest';
import { mergeSeed } from '../lib/seed';
import { StateSchema } from '../lib/schema';

const state = StateSchema.parse({
  activeProjectId: 'my-app',
  projects: [
    {
      id: 'my-app',
      name: 'My App',
      origins: ['http://localhost:3000'],
      users: [{ id: 'u1', name: 'Admin', cookies: [{ name: 'session', value: 'old' }] }],
    },
  ],
});

describe('mergeSeed', () => {
  it('updates existing users (by id/name) and adds new ones', () => {
    const { state: next, result } = mergeSeed(state, {
      projects: [
        {
          name: 'My App',
          users: [
            { id: 'u1', name: 'Admin', cookies: [{ name: 'session', value: 'new' }] },
            { name: 'Tester' },
          ],
        },
      ],
    });

    expect(result.projectsAdded).toBe(0);
    expect(result.projectsUpdated).toBe(1);
    expect(result.usersAdded).toBe(1);
    expect(result.usersUpdated).toBe(1);

    const project = next.projects[0];
    expect(project?.users).toHaveLength(2);
    expect(project?.users.find((user) => user.name === 'Admin')?.cookies[0]?.value).toBe('new');
    const tester = project?.users.find((user) => user.name === 'Tester');
    expect(tester?.id).toBeTruthy();
  });

  it('adds a new project and reports one without origins', () => {
    const { state: next, result } = mergeSeed(state, {
      projects: [
        { name: 'Fresh', origins: ['http://localhost:5173'], users: [{ name: 'Dev' }] },
        { name: 'NoOrigins' },
      ],
    });

    expect(result.projectsAdded).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('NoOrigins');
    expect(next.projects.map((project) => project.name)).toContain('Fresh');
    expect(next.projects).toHaveLength(2);
  });

  it('does not mutate the original state', () => {
    mergeSeed(state, { projects: [{ name: 'My App', users: [{ name: 'Zed' }] }] });
    expect(state.projects[0]?.users).toHaveLength(1);
  });
});
