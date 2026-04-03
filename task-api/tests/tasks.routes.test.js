const request = require('supertest');
const app = require('../src/app');
const taskService = require('../src/services/taskService');

beforeEach(() => {
  taskService._reset();
});

// ---------------------------------------------------------------------------
// GET /tasks
// ---------------------------------------------------------------------------
describe('GET /tasks', () => {
  it('returns 200 and an empty array when no tasks exist', async () => {
    const res = await request(app).get('/tasks');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns all tasks', async () => {
    await request(app).post('/tasks').send({ title: 'Alpha' });
    await request(app).post('/tasks').send({ title: 'Beta' });
    const res = await request(app).get('/tasks');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it('GET /tasks is not swallowed by the GET /tasks/:id route', async () => {
    // Guards against accidental route-ordering regressions
    await request(app).post('/tasks').send({ title: 'Guard' });
    const list = await request(app).get('/tasks');
    expect(list.statusCode).toBe(200);
    expect(Array.isArray(list.body)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// GET /tasks?status=
// ---------------------------------------------------------------------------
describe('GET /tasks?status=', () => {
  beforeEach(async () => {
    await request(app).post('/tasks').send({ title: 'Todo task', status: 'todo' });
    await request(app).post('/tasks').send({ title: 'In progress task', status: 'in_progress' });
    await request(app).post('/tasks').send({ title: 'Done task', status: 'done' });
  });

  it('filters by status=todo', async () => {
    const res = await request(app).get('/tasks?status=todo');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].status).toBe('todo');
  });

  it('filters by status=in_progress', async () => {
    const res = await request(app).get('/tasks?status=in_progress');
    expect(res.body).toHaveLength(1);
    expect(res.body[0].status).toBe('in_progress');
  });

  it('returns empty array for a status with no matches', async () => {
    const res = await request(app).get('/tasks?status=unknown');
    expect(res.body).toEqual([]);
  });

  it('does not partial-match statuses (bug #1 regression)', async () => {
    const res = await request(app).get('/tasks?status=in');
    expect(res.body).toHaveLength(0);
  });

  it('when status and page are both provided, status filter takes precedence', async () => {
    // Documents the current behaviour: status is checked first, pagination is ignored
    const res = await request(app).get('/tasks?status=todo&page=1&limit=1');
    expect(res.statusCode).toBe(200);
    // Returns all todo tasks, not just 1 — pagination is silently ignored
    expect(res.body.every((t) => t.status === 'todo')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// GET /tasks?page=&limit=
// ---------------------------------------------------------------------------
describe('GET /tasks?page=&limit=', () => {
  beforeEach(async () => {
    for (let i = 1; i <= 5; i++) {
      await request(app).post('/tasks').send({ title: `Task ${i}` });
    }
  });

  it('page=1 returns the first page (bug #2 regression)', async () => {
    const res = await request(app).get('/tasks?page=1&limit=2');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].title).toBe('Task 1');
  });

  it('page=2 returns the second page', async () => {
    const res = await request(app).get('/tasks?page=2&limit=2');
    expect(res.body).toHaveLength(2);
    expect(res.body[0].title).toBe('Task 3');
  });

  it('returns remaining items on the last page', async () => {
    const res = await request(app).get('/tasks?page=3&limit=2');
    expect(res.body).toHaveLength(1);
    expect(res.body[0].title).toBe('Task 5');
  });

  it('defaults page to 1 when only limit is provided', async () => {
    const res = await request(app).get('/tasks?limit=2');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].title).toBe('Task 1');
  });

  it('defaults limit to 10 when only page is provided', async () => {
    const res = await request(app).get('/tasks?page=1');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(5);
  });

  it('defaults to page 1 when page param is not a valid number', async () => {
    const res = await request(app).get('/tasks?page=abc&limit=2');
    expect(res.statusCode).toBe(200);
    expect(res.body[0].title).toBe('Task 1');
  });

  it('clamps negative page to 1 and returns the first page', async () => {
    const res = await request(app).get('/tasks?page=-1&limit=2');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].title).toBe('Task 1');
  });

  it('clamps negative limit to 1 and returns a single item', async () => {
    const res = await request(app).get('/tasks?page=1&limit=-5');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].title).toBe('Task 1');
  });
});

// ---------------------------------------------------------------------------
// GET /tasks/stats
// ---------------------------------------------------------------------------
describe('GET /tasks/stats', () => {
  it('returns zeroed stats when no tasks exist', async () => {
    const res = await request(app).get('/tasks/stats');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ todo: 0, in_progress: 0, done: 0, overdue: 0 });
  });

  it('counts tasks by status', async () => {
    await request(app).post('/tasks').send({ title: 'T1', status: 'todo' });
    await request(app).post('/tasks').send({ title: 'T2', status: 'in_progress' });
    await request(app).post('/tasks').send({ title: 'T3', status: 'done' });
    const res = await request(app).get('/tasks/stats');
    expect(res.body.todo).toBe(1);
    expect(res.body.in_progress).toBe(1);
    expect(res.body.done).toBe(1);
  });

  it('counts overdue tasks', async () => {
    await request(app).post('/tasks').send({ title: 'Old', status: 'todo', dueDate: '2000-01-01' });
    await request(app).post('/tasks').send({ title: 'New', status: 'todo', dueDate: '2099-12-31' });
    const res = await request(app).get('/tasks/stats');
    expect(res.body.overdue).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// GET /tasks/:id
// ---------------------------------------------------------------------------
describe('GET /tasks/:id', () => {
  it('returns 200 and the task for a valid id', async () => {
    const created = await request(app).post('/tasks').send({ title: 'Find me' });
    const res = await request(app).get(`/tasks/${created.body.id}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.id).toBe(created.body.id);
    expect(res.body.title).toBe('Find me');
  });

  it('returns 404 for a non-existent id', async () => {
    const res = await request(app).get('/tasks/non-existent-id');
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// POST /tasks
// ---------------------------------------------------------------------------
describe('POST /tasks', () => {
  it('creates a task and returns 201 with the new task', async () => {
    const res = await request(app).post('/tasks').send({ title: 'New task' });
    expect(res.statusCode).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.title).toBe('New task');
    expect(res.body.status).toBe('todo');
    expect(res.body.priority).toBe('medium');
  });

  it('creates a task with all optional fields', async () => {
    const res = await request(app).post('/tasks').send({
      title: 'Full task',
      description: 'desc',
      status: 'in_progress',
      priority: 'high',
      dueDate: '2099-06-30',
    });
    expect(res.statusCode).toBe(201);
    expect(res.body.description).toBe('desc');
    expect(res.body.status).toBe('in_progress');
    expect(res.body.priority).toBe('high');
  });

  it('returns 400 when title is missing', async () => {
    const res = await request(app).post('/tasks').send({ priority: 'high' });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('returns 400 when title is an empty string', async () => {
    const res = await request(app).post('/tasks').send({ title: '   ' });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 for an invalid status value', async () => {
    const res = await request(app).post('/tasks').send({ title: 'X', status: 'invalid' });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 for an invalid priority value', async () => {
    const res = await request(app).post('/tasks').send({ title: 'X', priority: 'critical' });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 for an invalid dueDate', async () => {
    const res = await request(app).post('/tasks').send({ title: 'X', dueDate: 'not-a-date' });
    expect(res.statusCode).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// PUT /tasks/:id
// ---------------------------------------------------------------------------
describe('PUT /tasks/:id', () => {
  let taskId;

  beforeEach(async () => {
    const res = await request(app).post('/tasks').send({ title: 'Original', priority: 'high' });
    taskId = res.body.id;
  });

  it('updates a task and returns 200 with the updated task', async () => {
    const res = await request(app).put(`/tasks/${taskId}`).send({ title: 'Updated' });
    expect(res.statusCode).toBe(200);
    expect(res.body.title).toBe('Updated');
    expect(res.body.id).toBe(taskId);
  });

  it('returns 404 for a non-existent task id', async () => {
    const res = await request(app).put('/tasks/non-existent-id').send({ title: 'X' });
    expect(res.statusCode).toBe(404);
  });

  it('returns 400 for an invalid status in the body', async () => {
    const res = await request(app).put(`/tasks/${taskId}`).send({ status: 'bad-status' });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when title is set to an empty string', async () => {
    const res = await request(app).put(`/tasks/${taskId}`).send({ title: '' });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 for an invalid dueDate in an update', async () => {
    const res = await request(app).put(`/tasks/${taskId}`).send({ dueDate: 'not-a-date' });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 for an invalid priority in an update', async () => {
    const res = await request(app).put(`/tasks/${taskId}`).send({ priority: 'urgent' });
    expect(res.statusCode).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// DELETE /tasks/:id
// ---------------------------------------------------------------------------
describe('DELETE /tasks/:id', () => {
  it('deletes an existing task and returns 204', async () => {
    const created = await request(app).post('/tasks').send({ title: 'Bye' });
    const res = await request(app).delete(`/tasks/${created.body.id}`);
    expect(res.statusCode).toBe(204);
  });

  it('returns 404 for a non-existent task id', async () => {
    const res = await request(app).delete('/tasks/ghost-id');
    expect(res.statusCode).toBe(404);
  });

  it('task is no longer retrievable after deletion', async () => {
    const created = await request(app).post('/tasks').send({ title: 'Delete check' });
    await request(app).delete(`/tasks/${created.body.id}`);
    const all = await request(app).get('/tasks');
    expect(all.body.find((t) => t.id === created.body.id)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// PATCH /tasks/:id/complete
// ---------------------------------------------------------------------------
describe('PATCH /tasks/:id/complete', () => {
  it('marks a task as done and returns 200', async () => {
    const created = await request(app).post('/tasks').send({ title: 'Finish me' });
    const res = await request(app).patch(`/tasks/${created.body.id}/complete`);
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('done');
    expect(res.body.completedAt).not.toBeNull();
  });

  it('preserves the original priority when completing (bug #3 regression)', async () => {
    const created = await request(app).post('/tasks').send({ title: 'High prio', priority: 'high' });
    const res = await request(app).patch(`/tasks/${created.body.id}/complete`);
    expect(res.body.priority).toBe('high');
  });

  it('returns 404 for a non-existent task id', async () => {
    const res = await request(app).patch('/tasks/ghost-id/complete');
    expect(res.statusCode).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// PATCH /tasks/:id/assign
// ---------------------------------------------------------------------------
describe('PATCH /tasks/:id/assign', () => {
  let taskId;

  beforeEach(async () => {
    const res = await request(app).post('/tasks').send({ title: 'Assign test' });
    taskId = res.body.id;
  });

  it('assigns a task to a user and returns 200 with updated task', async () => {
    const res = await request(app).patch(`/tasks/${taskId}/assign`).send({ assignee: 'Alice' });
    expect(res.statusCode).toBe(200);
    expect(res.body.assignee).toBe('Alice');
    expect(res.body.id).toBe(taskId);
  });

  it('trims whitespace from the assignee name', async () => {
    const res = await request(app).patch(`/tasks/${taskId}/assign`).send({ assignee: '  Bob  ' });
    expect(res.statusCode).toBe(200);
    expect(res.body.assignee).toBe('Bob');
  });

  it('returns 400 when assignee is missing', async () => {
    const res = await request(app).patch(`/tasks/${taskId}/assign`).send({});
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('returns 400 when assignee is an empty string', async () => {
    const res = await request(app).patch(`/tasks/${taskId}/assign`).send({ assignee: '   ' });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when assignee is not a string', async () => {
    const res = await request(app).patch(`/tasks/${taskId}/assign`).send({ assignee: 42 });
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 for a non-existent task id', async () => {
    const res = await request(app).patch('/tasks/ghost-id/assign').send({ assignee: 'Alice' });
    expect(res.statusCode).toBe(404);
  });

  it('can reassign a task to a different person', async () => {
    await request(app).patch(`/tasks/${taskId}/assign`).send({ assignee: 'Alice' });
    const res = await request(app).patch(`/tasks/${taskId}/assign`).send({ assignee: 'Bob' });
    expect(res.body.assignee).toBe('Bob');
  });
});
