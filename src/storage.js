import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";

const dataDir = path.resolve("data");
const databaseFile = path.join(dataDir, "planner.sqlite");
const legacyJsonFile = path.join(dataDir, "store.json");

let db = null;

function ensureDataDir() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

function getDb() {
  if (db) {
    return db;
  }

  ensureDataDir();
  db = new Database(databaseFile);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate();
  migrateLegacyJson();
  return db;
}

function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      horizon TEXT NOT NULL,
      importance INTEGER NOT NULL,
      urgency INTEGER NOT NULL,
      due_date TEXT NOT NULL DEFAULT '',
      assignee_id TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'open'
    );

    CREATE TABLE IF NOT EXISTS plans (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      horizon TEXT NOT NULL,
      title TEXT NOT NULL,
      owner_id TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS banners (
      guild_id TEXT NOT NULL,
      horizon TEXT NOT NULL,
      message_id TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (guild_id, horizon)
    );

    CREATE TABLE IF NOT EXISTS memory_items (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      type TEXT NOT NULL,
      scope TEXT NOT NULL,
      subject TEXT NOT NULL,
      content TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 1,
      source TEXT NOT NULL DEFAULT 'manual',
      status TEXT NOT NULL DEFAULT 'active'
    );

    CREATE TABLE IF NOT EXISTS task_events (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      task_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      actor_id TEXT NOT NULL DEFAULT '',
      payload TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS priority_decisions (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      task_id TEXT NOT NULL,
      matrix_quadrant TEXT NOT NULL,
      priority_score REAL NOT NULL,
      rationale TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT 'heuristic'
    );
  `);
}

function migrateLegacyJson() {
  if (!fs.existsSync(legacyJsonFile)) {
    return;
  }

  const markerFile = path.join(dataDir, ".json-migrated");
  if (fs.existsSync(markerFile)) {
    return;
  }

  const legacy = JSON.parse(fs.readFileSync(legacyJsonFile, "utf8"));
  const taskCount = getDb().prepare("SELECT COUNT(*) AS count FROM tasks").get().count;
  const planCount = getDb().prepare("SELECT COUNT(*) AS count FROM plans").get().count;

  if (taskCount === 0) {
    for (const task of legacy.tasks || []) {
      insertTask(task);
    }
  }

  if (planCount === 0) {
    for (const plan of legacy.plans || []) {
      insertPlan(plan);
    }
  }

  for (const [guildId, banners] of Object.entries(legacy.banners || {})) {
    for (const [horizon, messageId] of Object.entries(banners)) {
      upsertBannerRecord(guildId, horizon, messageId);
    }
  }

  fs.writeFileSync(markerFile, new Date().toISOString());
}

function nowIso() {
  return new Date().toISOString();
}

function toTask(row) {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    title: row.title,
    description: row.description,
    horizon: row.horizon,
    importance: row.importance,
    urgency: row.urgency,
    dueDate: row.due_date,
    assigneeId: row.assignee_id,
    status: row.status
  };
}

function toPlan(row) {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    horizon: row.horizon,
    title: row.title,
    ownerId: row.owner_id
  };
}

function toMemory(row) {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    type: row.type,
    scope: row.scope,
    subject: row.subject,
    content: row.content,
    confidence: row.confidence,
    source: row.source,
    status: row.status
  };
}

function insertTask(task) {
  const database = getDb();
  const createdAt = task.createdAt || nowIso();
  const updatedAt = task.updatedAt || createdAt;
  const nextTask = {
    id: task.id || randomUUID().slice(0, 8),
    createdAt,
    updatedAt,
    status: task.status || "open",
    assigneeId: task.assigneeId || "",
    dueDate: task.dueDate || "",
    description: task.description || "",
    ...task
  };

  database.prepare(`
    INSERT OR REPLACE INTO tasks
      (id, created_at, updated_at, title, description, horizon, importance, urgency, due_date, assignee_id, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    nextTask.id,
    nextTask.createdAt,
    nextTask.updatedAt,
    nextTask.title,
    nextTask.description,
    nextTask.horizon,
    nextTask.importance,
    nextTask.urgency,
    nextTask.dueDate,
    nextTask.assigneeId,
    nextTask.status
  );

  return nextTask;
}

function insertPlan(plan) {
  const database = getDb();
  const createdAt = plan.createdAt || nowIso();
  const updatedAt = plan.updatedAt || createdAt;
  const nextPlan = {
    id: plan.id || randomUUID().slice(0, 8),
    createdAt,
    updatedAt,
    ownerId: plan.ownerId || "",
    ...plan
  };

  database.prepare(`
    INSERT OR REPLACE INTO plans
      (id, created_at, updated_at, horizon, title, owner_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    nextPlan.id,
    nextPlan.createdAt,
    nextPlan.updatedAt,
    nextPlan.horizon,
    nextPlan.title,
    nextPlan.ownerId
  );

  return nextPlan;
}

export function listTasks(filters = {}) {
  const database = getDb();
  const clauses = [];
  const values = [];

  if (filters.status) {
    clauses.push("status = ?");
    values.push(filters.status);
  }
  if (filters.horizon) {
    clauses.push("horizon = ?");
    values.push(filters.horizon);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return database
    .prepare(`SELECT * FROM tasks ${where} ORDER BY created_at ASC`)
    .all(...values)
    .map(toTask);
}

export function createTask(task) {
  const nextTask = insertTask(task);
  recordTaskEvent(nextTask.id, "created", task.actorId || nextTask.assigneeId, {
    title: nextTask.title,
    horizon: nextTask.horizon,
    importance: nextTask.importance,
    urgency: nextTask.urgency,
    dueDate: nextTask.dueDate,
    assigneeId: nextTask.assigneeId
  });
  return nextTask;
}

export function updateTask(id, updater, actorId = "") {
  const database = getDb();
  const currentRow = database.prepare("SELECT * FROM tasks WHERE id = ?").get(id);
  if (!currentRow) {
    return null;
  }

  const current = toTask(currentRow);
  const next = {
    ...current,
    ...updater(current),
    updatedAt: nowIso()
  };

  database.prepare(`
    UPDATE tasks
    SET updated_at = ?, title = ?, description = ?, horizon = ?, importance = ?, urgency = ?,
        due_date = ?, assignee_id = ?, status = ?
    WHERE id = ?
  `).run(
    next.updatedAt,
    next.title,
    next.description,
    next.horizon,
    next.importance,
    next.urgency,
    next.dueDate,
    next.assigneeId,
    next.status,
    next.id
  );

  recordTaskEvent(id, "updated", actorId, {
    before: current,
    after: next
  });
  return next;
}

export function listPlans(horizon = "") {
  const database = getDb();
  if (!horizon) {
    return database.prepare("SELECT * FROM plans ORDER BY created_at ASC").all().map(toPlan);
  }
  return database
    .prepare("SELECT * FROM plans WHERE horizon = ? ORDER BY created_at ASC")
    .all(horizon)
    .map(toPlan);
}

export function createPlan(plan) {
  const nextPlan = insertPlan(plan);
  createMemory({
    type: "goal",
    scope: nextPlan.horizon,
    subject: nextPlan.title,
    content: `Planning goal: ${nextPlan.title}`,
    source: "plan"
  });
  return nextPlan;
}

export function upsertBannerRecord(guildId, horizon, messageId) {
  getDb().prepare(`
    INSERT INTO banners (guild_id, horizon, message_id, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(guild_id, horizon)
    DO UPDATE SET message_id = excluded.message_id, updated_at = excluded.updated_at
  `).run(guildId, horizon, messageId, nowIso());
}

export function getBannerRecord(guildId, horizon) {
  const row = getDb()
    .prepare("SELECT message_id FROM banners WHERE guild_id = ? AND horizon = ?")
    .get(guildId, horizon);
  return row?.message_id || "";
}

export function createMemory(memory) {
  const createdAt = nowIso();
  const nextMemory = {
    id: randomUUID().slice(0, 8),
    createdAt,
    updatedAt: createdAt,
    type: memory.type || "note",
    scope: memory.scope || "global",
    subject: memory.subject || "",
    content: memory.content,
    confidence: memory.confidence ?? 1,
    source: memory.source || "manual",
    status: "active"
  };

  getDb().prepare(`
    INSERT INTO memory_items
      (id, created_at, updated_at, type, scope, subject, content, confidence, source, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    nextMemory.id,
    nextMemory.createdAt,
    nextMemory.updatedAt,
    nextMemory.type,
    nextMemory.scope,
    nextMemory.subject,
    nextMemory.content,
    nextMemory.confidence,
    nextMemory.source,
    nextMemory.status
  );

  return nextMemory;
}

export function listMemories(filters = {}) {
  const clauses = ["status = 'active'"];
  const values = [];

  if (filters.type) {
    clauses.push("type = ?");
    values.push(filters.type);
  }
  if (filters.scope) {
    clauses.push("(scope = ? OR scope = 'global')");
    values.push(filters.scope);
  }

  return getDb()
    .prepare(`SELECT * FROM memory_items WHERE ${clauses.join(" AND ")} ORDER BY updated_at DESC LIMIT ?`)
    .all(...values, filters.limit || 20)
    .map(toMemory);
}

export function archiveMemory(id) {
  const result = getDb()
    .prepare("UPDATE memory_items SET status = 'archived', updated_at = ? WHERE id = ?")
    .run(nowIso(), id);
  return result.changes > 0;
}

export function recordTaskEvent(taskId, eventType, actorId = "", payload = {}) {
  getDb().prepare(`
    INSERT INTO task_events (id, created_at, task_id, event_type, actor_id, payload)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID().slice(0, 8),
    nowIso(),
    taskId,
    eventType,
    actorId,
    JSON.stringify(payload)
  );
}

export function recordPriorityDecision(decision) {
  getDb().prepare(`
    INSERT INTO priority_decisions
      (id, created_at, task_id, matrix_quadrant, priority_score, rationale, source)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID().slice(0, 8),
    nowIso(),
    decision.taskId,
    decision.matrixQuadrant,
    decision.priorityScore,
    decision.rationale || "",
    decision.source || "heuristic"
  );
}

export function getMemoryContext(horizon = "", limit = 12) {
  const memories = listMemories({ scope: horizon || "global", limit });
  return memories.map((memory) => ({
    type: memory.type,
    scope: memory.scope,
    subject: memory.subject,
    content: memory.content,
    confidence: memory.confidence,
    source: memory.source
  }));
}
