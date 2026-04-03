const taskService = require('../src/services/taskService');

beforeEach(() => {
  taskService._reset();
});

// ---------------------------------------------------------------------------
// getAll
// ---------------------------------------------------------------------------
describe('getAll', () => {
  it('returns an empty array when no tasks exist', () => {
    expect(taskService.getAll()).toEqual([]);
  });

  it('returns a copy of all tasks', () => {
    taskService.create({ title: 'A' });
    taskService.create({ title: 'B' });
    const result = taskService.getAll();
    expect(result).toHaveLength(2);
    expect(result[0].title).toBe('A');
    expect(result[1].title).toBe('B');
  });

  it('returns a shallow copy, not the internal array reference', () => {
    taskService.create({ title: 'A' });
    const result = taskService.getAll();
    result.push({ fake: true });
    expect(taskService.getAll()).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// findById
// ---------------------------------------------------------------------------
describe('findById', () => {
  it('returns the task when the id exists', () => {
    const created = taskService.create({ title: 'Find me' });
    const found = taskService.findById(created.id);
    expect(found).toBeDefined();
    expect(found.title).toBe('Find me');
  });

  it('returns undefined when the id does not exist', () => {
    expect(taskService.findById('non-existent-id')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// create
// ---------------------------------------------------------------------------
describe('create', () => {
  it('creates a task with required fields and sensible defaults', () => {
    const task = taskService.create({ title: 'Do laundry' });
    expect(task.id).toBeDefined();
    expect(task.title).toBe('Do laundry');
    expect(task.description).toBe('');
    expect(task.status).toBe('todo');
    expect(task.priority).toBe('medium');
    expect(task.dueDate).toBeNull();
    expect(task.completedAt).toBeNull();
    expect(task.createdAt).toBeDefined();
  });

  it('accepts optional fields and stores them', () => {
    const task = taskService.create({
      title: 'Deploy',
      description: 'Push to prod',
      status: 'in_progress',
      priority: 'high',
      dueDate: '2099-12-31',
    });
    expect(task.description).toBe('Push to prod');
    expect(task.status).toBe('in_progress');
    expect(task.priority).toBe('high');
    expect(task.dueDate).toBe('2099-12-31');
  });

  it('assigns a unique id to each task', () => {
    const a = taskService.create({ title: 'A' });
    const b = taskService.create({ title: 'B' });
    expect(a.id).not.toBe(b.id);
  });
});

// ---------------------------------------------------------------------------
// getByStatus  (Bug #1 was here: used .includes() instead of ===)
// ---------------------------------------------------------------------------
describe('getByStatus', () => {
  beforeEach(() => {
    taskService.create({ title: 'T1', status: 'todo' });
    taskService.create({ title: 'T2', status: 'in_progress' });
    taskService.create({ title: 'T3', status: 'done' });
  });

  it('returns only tasks with the exact matching status', () => {
    const result = taskService.getByStatus('todo');
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('T1');
  });

  it('returns all in_progress tasks', () => {
    const result = taskService.getByStatus('in_progress');
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('T2');
  });

  it('returns empty array for an unknown status', () => {
    expect(taskService.getByStatus('unknown')).toHaveLength(0);
  });

  it('does NOT do a partial / substring match (bug #1 regression)', () => {
    // Before fix, 'in' would have matched 'in_progress'
    expect(taskService.getByStatus('in')).toHaveLength(0);
    // Before fix, 'do' would have matched 'done'
    expect(taskService.getByStatus('do')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// getPaginated  (Bug #2 was here: offset = page*limit instead of (page-1)*limit)
// ---------------------------------------------------------------------------
describe('getPaginated', () => {
  beforeEach(() => {
    for (let i = 1; i <= 5; i++) {
      taskService.create({ title: `Task ${i}` });
    }
  });

  it('page 1 returns the first N items (bug #2 regression)', () => {
    const result = taskService.getPaginated(1, 2);
    expect(result).toHaveLength(2);
    expect(result[0].title).toBe('Task 1');
    expect(result[1].title).toBe('Task 2');
  });

  it('page 2 returns the next N items', () => {
    const result = taskService.getPaginated(2, 2);
    expect(result).toHaveLength(2);
    expect(result[0].title).toBe('Task 3');
    expect(result[1].title).toBe('Task 4');
  });

  it('last page returns remaining items', () => {
    const result = taskService.getPaginated(3, 2);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Task 5');
  });

  it('returns empty array when page is beyond available data', () => {
    expect(taskService.getPaginated(99, 10)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// getStats
// ---------------------------------------------------------------------------
describe('getStats', () => {
  it('returns all zeroes when no tasks exist', () => {
    expect(taskService.getStats()).toEqual({ todo: 0, in_progress: 0, done: 0, overdue: 0 });
  });

  it('counts tasks by status correctly', () => {
    taskService.create({ title: 'A', status: 'todo' });
    taskService.create({ title: 'B', status: 'todo' });
    taskService.create({ title: 'C', status: 'in_progress' });
    taskService.create({ title: 'D', status: 'done' });
    const stats = taskService.getStats();
    expect(stats.todo).toBe(2);
    expect(stats.in_progress).toBe(1);
    expect(stats.done).toBe(1);
  });

  it('counts overdue tasks correctly (past due, not done)', () => {
    taskService.create({ title: 'Overdue', status: 'todo', dueDate: '2000-01-01' });
    taskService.create({ title: 'Future', status: 'todo', dueDate: '2099-12-31' });
    taskService.create({ title: 'Done but past', status: 'done', dueDate: '2000-01-01' });
    const stats = taskService.getStats();
    expect(stats.overdue).toBe(1);
  });

  it('does not count tasks without a dueDate as overdue', () => {
    taskService.create({ title: 'No due', status: 'todo' });
    expect(taskService.getStats().overdue).toBe(0);
  });

  it('ignores tasks with an unrecognised status in status counts', () => {
    // Bypass the route validator by calling the service directly
    taskService.create({ title: 'Ghost', status: 'archived' });
    const stats = taskService.getStats();
    expect(stats.todo).toBe(0);
    expect(stats.in_progress).toBe(0);
    expect(stats.done).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// update
// ---------------------------------------------------------------------------
describe('update', () => {
  it('updates allowed fields and returns the updated task', () => {
    const task = taskService.create({ title: 'Old title' });
    const updated = taskService.update(task.id, { title: 'New title', status: 'in_progress' });
    expect(updated.title).toBe('New title');
    expect(updated.status).toBe('in_progress');
    expect(updated.id).toBe(task.id);
  });

  it('preserves fields that are not included in the update', () => {
    const task = taskService.create({ title: 'Keep me', priority: 'high' });
    const updated = taskService.update(task.id, { status: 'done' });
    expect(updated.priority).toBe('high');
    expect(updated.title).toBe('Keep me');
  });

  it('returns null for a non-existent id', () => {
    expect(taskService.update('bad-id', { title: 'X' })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// remove
// ---------------------------------------------------------------------------
describe('remove', () => {
  it('removes an existing task and returns true', () => {
    const task = taskService.create({ title: 'Delete me' });
    expect(taskService.remove(task.id)).toBe(true);
    expect(taskService.getAll()).toHaveLength(0);
  });

  it('returns false when the task does not exist', () => {
    expect(taskService.remove('ghost-id')).toBe(false);
  });

  it('only removes the targeted task, leaves others intact', () => {
    taskService.create({ title: 'Keep' });
    const gone = taskService.create({ title: 'Gone' });
    taskService.remove(gone.id);
    const remaining = taskService.getAll();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].title).toBe('Keep');
  });
});

// ---------------------------------------------------------------------------
// completeTask  (Bug #3 was here: priority was reset to 'medium')
// ---------------------------------------------------------------------------
describe('completeTask', () => {
  it('sets status to done and records completedAt', () => {
    const task = taskService.create({ title: 'Finish me' });
    const completed = taskService.completeTask(task.id);
    expect(completed.status).toBe('done');
    expect(completed.completedAt).not.toBeNull();
  });

  it('preserves the original priority (bug #3 regression)', () => {
    const task = taskService.create({ title: 'Important', priority: 'high' });
    const completed = taskService.completeTask(task.id);
    expect(completed.priority).toBe('high');
  });

  it('preserves the original priority when low', () => {
    const task = taskService.create({ title: 'Low priority', priority: 'low' });
    const completed = taskService.completeTask(task.id);
    expect(completed.priority).toBe('low');
  });

  it('returns null for a non-existent id', () => {
    expect(taskService.completeTask('no-such-id')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// assignTask
// ---------------------------------------------------------------------------
describe('assignTask', () => {
  it('assigns an assignee and returns the updated task', () => {
    const task = taskService.create({ title: 'Assign me' });
    const updated = taskService.assignTask(task.id, 'Alice');
    expect(updated.assignee).toBe('Alice');
    expect(updated.id).toBe(task.id);
  });

  it('overwrites an existing assignee', () => {
    const task = taskService.create({ title: 'Reassign' });
    taskService.assignTask(task.id, 'Alice');
    const updated = taskService.assignTask(task.id, 'Bob');
    expect(updated.assignee).toBe('Bob');
  });

  it('returns null for a non-existent id', () => {
    expect(taskService.assignTask('ghost-id', 'Alice')).toBeNull();
  });

  it('persists the assignment — findById reflects it', () => {
    const task = taskService.create({ title: 'Persist check' });
    taskService.assignTask(task.id, 'Carol');
    expect(taskService.findById(task.id).assignee).toBe('Carol');
  });
});
