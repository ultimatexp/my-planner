import {
  archiveMemory,
  createMemory,
  createPlan,
  createTask,
  listMemories,
  listPlans,
  listTasks,
  updateTask
} from "./storage.js";
import { prioritizeTasks } from "./eisenhower.js";

function taskLine(task) {
  const assignee = task.assigneeId ? ` | assignee ${task.assigneeId}` : "";
  const due = task.dueDate ? ` | due ${task.dueDate}` : "";
  return `• ${task.id} ${task.title} [${task.matrixQuadrant}]${assignee}${due}`;
}

function memoryLine(memory) {
  const subject = memory.subject ? ` ${memory.subject}:` : "";
  return `• ${memory.id} [${memory.type}/${memory.scope}]${subject} ${memory.content}`;
}

function parseHorizon(value) {
  const candidate = (value || "").toLowerCase();
  if (candidate === "week" || candidate === "month" || candidate === "year") {
    return candidate;
  }
  return "";
}

export function addTaskAction(input, actorId) {
  const horizon = parseHorizon(input.horizon);
  if (!horizon || !input.title) {
    return { ok: false, message: "Missing required fields: title and valid horizon (week|month|year)." };
  }

  const task = createTask({
    title: input.title,
    description: input.description || "",
    horizon,
    importance: Number(input.importance || 3),
    urgency: Number(input.urgency || 3),
    dueDate: input.dueDate || "",
    assigneeId: input.assigneeId || actorId,
    actorId
  });
  const prioritized = prioritizeTasks([task])[0];

  return {
    ok: true,
    message: `Created task ${task.id}: ${task.title}\nQuadrant: ${prioritized.matrixQuadrant}`
  };
}

export function listTasksAction(horizon) {
  const parsed = parseHorizon(horizon);
  if (!parsed) {
    return { ok: false, message: "Use: task list week|month|year" };
  }

  const tasks = prioritizeTasks(listTasks({ horizon: parsed, status: "open" }));
  return {
    ok: true,
    message: tasks.length ? tasks.map(taskLine).join("\n") : "No open tasks."
  };
}

export function markDoneAction(id, actorId) {
  if (!id) {
    return { ok: false, message: "Use: task done <id>" };
  }

  const task = updateTask(id, () => ({ status: "done" }), actorId);
  return {
    ok: true,
    message: task ? `Marked ${id} as done.` : `Task ${id} not found.`
  };
}

export function assignTaskAction(id, assigneeId, actorId) {
  if (!id || !assigneeId) {
    return { ok: false, message: "Use: task assign <id> <lineUserId>" };
  }

  const task = updateTask(id, () => ({ assigneeId }), actorId);
  if (task) {
    createMemory({
      type: "assignment",
      scope: task.horizon,
      subject: task.title,
      content: `Task "${task.title}" was assigned to ${assigneeId}.`,
      source: "assignment"
    });
  }
  return {
    ok: true,
    message: task ? `Assigned ${id} to ${assigneeId}.` : `Task ${id} not found.`
  };
}

export function addPlanAction(horizon, title, actorId) {
  const parsed = parseHorizon(horizon);
  if (!parsed || !title) {
    return { ok: false, message: "Use: plan add week|month|year <title>" };
  }

  const plan = createPlan({
    horizon: parsed,
    title,
    ownerId: actorId
  });
  return {
    ok: true,
    message: `Added ${plan.horizon} plan item ${plan.id}.`
  };
}

export function listPlansAction(horizon) {
  const parsed = parseHorizon(horizon);
  if (!parsed) {
    return { ok: false, message: "Use: plan list week|month|year" };
  }
  const plans = listPlans(parsed);
  return {
    ok: true,
    message: plans.length ? plans.map((plan) => `• ${plan.id} ${plan.title}`).join("\n") : "No plan items."
  };
}

export function addMemoryAction(input, actorId) {
  if (!input.content) {
    return { ok: false, message: "Use: memory add <content>" };
  }

  const memory = createMemory({
    type: input.type || "note",
    scope: input.scope || "global",
    subject: input.subject || "",
    content: input.content,
    source: `line:${actorId}`
  });

  return {
    ok: true,
    message: `Remembered ${memory.id}: ${memory.content}`
  };
}

export function listMemoriesAction(input = {}) {
  const memories = listMemories({
    scope: input.scope || "",
    type: input.type || "",
    limit: 15
  });

  return {
    ok: true,
    message: memories.length ? memories.map(memoryLine).join("\n") : "No active memories."
  };
}

export function forgetMemoryAction(id) {
  if (!id) {
    return { ok: false, message: "Use: memory forget <id>" };
  }

  const forgotten = archiveMemory(id);
  return {
    ok: true,
    message: forgotten ? `Archived memory ${id}.` : `Memory ${id} not found.`
  };
}

