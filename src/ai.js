import OpenAI from "openai";
import { config } from "./config.js";
import { prioritizeTasks } from "./eisenhower.js";
import { getMemoryContext, recordPriorityDecision } from "./storage.js";

let client = null;

function getClient() {
  if (!config.openAiApiKey) {
    return null;
  }
  if (!client) {
    client = new OpenAI({ apiKey: config.openAiApiKey });
  }
  return client;
}

export async function rankTasksWithAi(tasks) {
  const fallback = prioritizeTasks(tasks);
  const openai = getClient();
  const horizon = tasks.find((task) => task.horizon)?.horizon || "";
  const memoryContext = getMemoryContext(horizon);

  if (!openai || tasks.length === 0) {
    for (const task of fallback) {
      recordPriorityDecision({
        taskId: task.id,
        matrixQuadrant: task.matrixQuadrant,
        priorityScore: task.priorityScore,
        source: "heuristic"
      });
    }
    return fallback;
  }

  try {
    const response = await openai.responses.create({
      model: config.openAiModel,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: "Rank the tasks using the Eisenhower Matrix, while considering durable planning memories. Return strict JSON with an items array. Each item must contain id, matrixQuadrant, priorityScore, and rationale."
            }
          ]
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: JSON.stringify({
                tasks,
                memoryContext
              })
            }
          ]
        }
      ]
    });

    const text = response.output_text;
    const parsed = JSON.parse(text);
    const byId = new Map(parsed.items.map((item) => [item.id, item]));

    const ranked = tasks
      .map((task) => {
        const aiItem = byId.get(task.id);
        if (!aiItem) {
          return fallback.find((candidate) => candidate.id === task.id) || task;
        }
        return {
          ...task,
          matrixQuadrant: aiItem.matrixQuadrant,
          priorityScore: aiItem.priorityScore,
          rationale: aiItem.rationale
        };
      })
      .sort((a, b) => b.priorityScore - a.priorityScore);

    for (const task of ranked) {
      recordPriorityDecision({
        taskId: task.id,
        matrixQuadrant: task.matrixQuadrant,
        priorityScore: task.priorityScore,
        rationale: task.rationale,
        source: "ai"
      });
    }

    return ranked;
  } catch (error) {
    console.error("AI ranking failed, using heuristic fallback.", error);
    for (const task of fallback) {
      recordPriorityDecision({
        taskId: task.id,
        matrixQuadrant: task.matrixQuadrant,
        priorityScore: task.priorityScore,
        source: "heuristic"
      });
    }
    return fallback;
  }
}
