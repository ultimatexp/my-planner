function daysUntil(dateString) {
  if (!dateString) {
    return Number.POSITIVE_INFINITY;
  }
  const due = new Date(dateString);
  const now = new Date();
  return Math.ceil((due.getTime() - now.getTime()) / 86400000);
}

export function classifyTask(task) {
  const urgency = Number(task.urgency || 3);
  const importance = Number(task.importance || 3);
  const daysLeft = daysUntil(task.dueDate);

  const urgent = urgency >= 4 || daysLeft <= 3;
  const important = importance >= 4;

  if (urgent && important) {
    return "Do";
  }
  if (!urgent && important) {
    return "Schedule";
  }
  if (urgent && !important) {
    return "Delegate";
  }
  return "Eliminate";
}

export function scoreTask(task) {
  const urgency = Number(task.urgency || 3);
  const importance = Number(task.importance || 3);
  const daysLeft = daysUntil(task.dueDate);
  const dueBoost = Number.isFinite(daysLeft) ? Math.max(0, 10 - Math.max(daysLeft, 0)) : 0;
  return importance * 10 + urgency * 8 + dueBoost;
}

export function prioritizeTasks(tasks) {
  return [...tasks]
    .map((task) => ({
      ...task,
      matrixQuadrant: classifyTask(task),
      priorityScore: scoreTask(task)
    }))
    .sort((a, b) => b.priorityScore - a.priorityScore);
}
