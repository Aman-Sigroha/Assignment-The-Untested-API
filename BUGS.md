# Bug Report

Three bugs were found in `task-api/src/services/taskService.js` while writing tests.

---

## Bug 1 — `getByStatus`: partial substring match instead of exact match

**File:** `src/services/taskService.js`, line 9

**Broken code:**
```js
const getByStatus = (status) => tasks.filter((t) => t.status.includes(status));
```

**Expected behaviour:**  
`GET /tasks?status=todo` should return only tasks whose status is exactly `"todo"`.

**Actual behaviour:**  
`.includes()` does a substring search on the status string.  
- Querying `status=in` returns `in_progress` tasks.  
- Querying `status=do` returns `done` tasks.  
- Any partial string leaks through.

**How discovered:** Wrote a unit test asserting `getByStatus('in')` returns `[]`; it returned the `in_progress` task instead.

**Fix:**
```js
const getByStatus = (status) => tasks.filter((t) => t.status === status);
```

---

## Bug 2 — `getPaginated`: off-by-one on page offset

**File:** `src/services/taskService.js`, lines 11–14

**Broken code:**
```js
const getPaginated = (page, limit) => {
  const offset = page * limit;
  return tasks.slice(offset, offset + limit);
};
```

**Expected behaviour:**  
`GET /tasks?page=1&limit=10` should return the first 10 tasks (items 0–9).

**Actual behaviour:**  
`offset = 1 * 10 = 10`, so page 1 skips the first 10 items entirely and returns items 10–19.  
Page 1 is always empty when there are fewer items than `limit`, and every page is shifted one page forward.

**How discovered:** Seeded 5 tasks, called `getPaginated(1, 2)` expecting `["Task 1", "Task 2"]`, got `["Task 3", "Task 4"]`.

**Fix:**
```js
const offset = (page - 1) * limit;
```

---

## Bug 3 — `completeTask`: silently resets task priority to `"medium"`

**File:** `src/services/taskService.js`, lines 67–72

**Broken code:**
```js
const updated = {
  ...task,
  priority: 'medium',   // ← hardcoded, overwrites original
  status: 'done',
  completedAt: new Date().toISOString(),
};
```

**Expected behaviour:**  
Completing a task should only set `status = "done"` and record `completedAt`. The task's existing `priority` should be preserved.

**Actual behaviour:**  
Any task with `priority: "high"` or `priority: "low"` silently becomes `priority: "medium"` when completed.  
No error is thrown; the data corruption is invisible to the caller.

**How discovered:** Created a `high`-priority task, called `completeTask`, and asserted `priority === "high"` — it came back `"medium"`.

**Fix:** Remove the `priority: 'medium'` line:
```js
const updated = {
  ...task,
  status: 'done',
  completedAt: new Date().toISOString(),
};
```

---

## Summary

| # | Location | Root cause | Severity |
|---|----------|------------|----------|
| 1 | `getByStatus` | `.includes()` instead of `===` | Medium — wrong results for any status query |
| 2 | `getPaginated` | `page * limit` instead of `(page - 1) * limit` | High — page 1 always returns wrong items |
| 3 | `completeTask` | Hardcoded `priority: 'medium'` | Medium — silent data loss on task completion |

All three bugs have been fixed and covered by regression tests.
