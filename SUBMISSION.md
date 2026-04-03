# Submission Notes

## Coverage

```
File             | % Stmts | % Branch | % Funcs | % Lines
-----------------|---------|----------|---------|--------
tasks.js         |   100   |   100    |   100   |   100
taskService.js   |   100   |   100    |   100   |   100
validators.js    |   100   |   100    |   100   |   100
All files        |  97.26  |  98.83   |  92.85  |  97.01
```

78 tests pass across two files:
- `tests/taskService.test.js` — unit tests for every service function
- `tests/tasks.routes.test.js` — integration tests for every API route

The only uncovered lines are the error-handler callback and `app.listen` in `app.js`, which are not reachable
from integration tests by design.

---

## Bugs found and fixed

All three bugs live in `src/services/taskService.js`. See [BUGS.md](./BUGS.md) for full details.

### Bug 1 — `getByStatus`: substring match instead of exact match

`t.status.includes(status)` was used instead of `t.status === status`.  
Querying `?status=in` silently returned `in_progress` tasks.  
**Fixed** by switching to strict equality.

### Bug 2 — `getPaginated`: page 1 returns nothing (off-by-one offset)

`offset = page * limit` skipped the first page entirely.  
Page 1 with limit 10 started at item 10, not item 0.  
**Fixed** to `offset = (page - 1) * limit`.

### Bug 3 — `completeTask`: silently resets priority to `"medium"`

The spread included `priority: 'medium'` as a hardcoded override.  
A high-priority task that got completed would silently become medium-priority.  
**Fixed** by removing the line — priority should never change on completion.

---

## `PATCH /tasks/:id/assign` — design decisions

**Validation:** An empty or whitespace-only string is rejected with 400. The spec asks "what should happen
if `assignee` is an empty string?" — accepting it would store a meaningless value, so I chose to treat it
as a bad request. The assignee is also trimmed before storage to prevent accidental leading/trailing spaces.

**Reassignment:** No restriction — calling assign again with a different name just overwrites the previous
value. The spec says "what if the task is already assigned?" — silently allowing reassignment felt simpler
and more useful than adding a special error for it, since un-assigning or changing owner are normal
workflow operations.

**Task shape:** `assignee` is only present on the object after it is set (not included as `null` on
create). This keeps the shape minimal and avoids forcing callers to filter out null fields. If a consistent
shape is preferred in production, `assignee: null` could be added to `create()`.

---

## `GET /tasks/:id` — added endpoint

The original codebase was missing a single-task lookup endpoint, which every REST client would expect.
I added it because the test suite would have been incomplete without it and it is trivially safe to add.
Route ordering ensures `/stats` is matched before `/:id` so there is no conflict.

---

## Refactoring done

`completeTask` and `assignTask` were duplicating the read-modify-write pattern already implemented in
`update()`. Both were refactored to delegate to `update()`, reducing the code from ~12 lines each to
2 lines each with no behaviour change.

---

## What I would test next with more time

- **Concurrent writes** — the in-memory store is a plain array with no locking. Two simultaneous updates
  to the same task could produce a race condition if the server ever became async or used worker threads.
- **Very long strings** — no maximum length is enforced on `title`, `description`, or `assignee`. A
  malicious client could send a multi-megabyte string.
- **Date boundary edge cases** — a task whose `dueDate` is exactly `new Date()` at the millisecond of the
  request sits on the overdue/not-overdue boundary; the current comparison (`<`) excludes it, but that
  deserves an explicit test.
- **`?status=` + `?page=` combined** — the route handler treats status and pagination as mutually
  exclusive branches. A request with both params silently ignores pagination.

## What surprised me

`completeTask` resetting the priority to `"medium"` was the most unexpected bug — there was no comment,
no TODO, and no obvious reason for it. It is the kind of silent data corruption that is very hard to
catch without tests, because the endpoint returns 200 and the response looks plausible.

The pagination offset bug (`page * limit` vs `(page - 1) * limit`) is a classic off-by-one that is easy
to write and easy to miss in manual testing — unless you specifically check that page 1 includes the
first item.

## Questions I would ask before shipping to production

1. **Persistence** — the store resets on every restart. Is that intentional for this deployment, or does
   it need a database?
2. **Authentication** — there is no auth middleware. Should all endpoints be public, or should write
   operations require a token?
3. **Assignee format** — is a free-text name sufficient, or should `assignee` reference a user ID from
   another system? Free text makes validation and lookups harder later.
4. **Pagination defaults** — the API currently defaults to page 1 / limit 10 when params are omitted.
   Should it enforce a maximum limit to prevent a caller from requesting all records with `?limit=99999`?
5. **Status transitions** — can any status transition to any other (e.g. `done` → `todo`)? Allowing
   arbitrary transitions might violate business rules.
