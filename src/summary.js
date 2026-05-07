import { config } from "./config.js";
import { listPlans, listTasks } from "./storage.js";
import { rankTasksWithAi } from "./ai.js";

function truncate(text, length = 120) {
  if (!text) {
    return "";
  }
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}

function formatTask(task) {
  const due = task.dueDate ? ` | due ${task.dueDate}` : "";
  const assignee = task.assigneeId ? ` | <@${task.assigneeId}>` : "";
  const rationale = task.rationale ? `\n${truncate(task.rationale, 90)}` : "";
  return `**${task.id}** ${task.title} [${task.matrixQuadrant}]${due}${assignee}${rationale}`;
}

function sectionTitle(horizon) {
  if (horizon === "week") {
    return "This Week";
  }
  if (horizon === "month") {
    return "This Month";
  }
  return "This Year";
}

export async function buildSummary(horizon) {
  const tasks = listTasks({ horizon, status: "open" });
  const ranked = await rankTasksWithAi(tasks);
  const plans = listPlans(horizon);

  const topTasks = ranked.slice(0, 8).map(formatTask).join("\n") || "No open tasks.";
  const planLines = plans
    .slice(-8)
    .map((plan) => `• ${truncate(plan.title, 120)}`)
    .join("\n") || "No plan items.";

  return {
    title: `${sectionTitle(horizon)} Planner`,
    description: "LINE planning dashboard with Eisenhower-based prioritization.",
    topTasks,
    planLines,
    timezone: config.timezone,
    updatedAt: new Date().toISOString()
  };
}

export async function buildDigestContent(horizon) {
  const tasks = listTasks({ horizon, status: "open" });
  const ranked = await rankTasksWithAi(tasks);
  const topTasks = ranked.slice(0, 5);

  if (topTasks.length === 0) {
    return `No open ${horizon} tasks right now.`;
  }

  const header =
    horizon === "week"
      ? "Weekly focus"
      : horizon === "month"
        ? "Monthly focus"
        : "Yearly focus";

  return `${header}\n${topTasks.map((task) => `• ${task.title} [${task.matrixQuadrant}]`).join("\n")}`;
}

export function summaryToText(summary) {
  return [
    summary.title,
    summary.description,
    "",
    "Priority Queue",
    summary.topTasks,
    "",
    "Plan",
    summary.planLines,
    "",
    `Timezone: ${summary.timezone}`
  ].join("\n");
}

export function summaryToFlex(summary) {
  return {
    type: "flex",
    altText: summary.title,
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          {
            type: "text",
            text: summary.title,
            weight: "bold",
            size: "lg",
            wrap: true
          },
          {
            type: "text",
            text: summary.description,
            size: "sm",
            color: "#666666",
            wrap: true
          },
          {
            type: "separator"
          },
          {
            type: "text",
            text: "Priority Queue",
            weight: "bold",
            size: "sm"
          },
          {
            type: "text",
            text: truncate(summary.topTasks, 800),
            size: "sm",
            wrap: true
          },
          {
            type: "text",
            text: "Plan",
            weight: "bold",
            size: "sm"
          },
          {
            type: "text",
            text: truncate(summary.planLines, 800),
            size: "sm",
            wrap: true
          },
          {
            type: "separator"
          },
          {
            type: "text",
            text: `Timezone: ${summary.timezone}`,
            size: "xs",
            color: "#999999"
          }
        ]
      }
    }
  };
}

export async function pushSummary(lineClient, to, horizon) {
  const summary = await buildSummary(horizon);
  try {
    return lineClient.pushMessage({
      to,
      messages: [summaryToFlex(summary)]
    });
  } catch (error) {
    console.warn("Flex push failed, falling back to text summary.", error);
    return lineClient.pushMessage({
      to,
      messages: [{ type: "text", text: summaryToText(summary).slice(0, 4500) }]
    });
  }
}

export async function pushDigest(lineClient, to, horizon) {
  const content = await buildDigestContent(horizon);
  return lineClient.pushMessage({
    to,
    messages: [{ type: "text", text: content.slice(0, 4500) }]
  });
}
