import crypto from "node:crypto";
import express from "express";
import {
  addMemoryAction,
  addPlanAction,
  addTaskAction,
  assignTaskAction,
  forgetMemoryAction,
  listMemoriesAction,
  listPlansAction,
  listTasksAction,
  markDoneAction
} from "./action-service.js";
import { helpText, menuTemplate } from "./line-messages.js";
import { buildSummary, summaryToText } from "./summary.js";

function parsePostbackData(data) {
  const params = new URLSearchParams(data || "");
  return {
    action: params.get("action") || "",
    horizon: params.get("horizon") || ""
  };
}

function verifyLineSignature(channelSecret, signature, rawBody) {
  const digest = crypto.createHmac("sha256", channelSecret).update(rawBody).digest("base64");
  return digest === signature;
}

function parseTextCommand(text) {
  const trimmed = (text || "").trim().replace(/^\/+/, "");
  const parts = trimmed.split(/\s+/);
  const [scope, cmd, ...rest] = parts;

  return {
    raw: trimmed,
    scope: (scope || "").toLowerCase(),
    cmd: (cmd || "").toLowerCase(),
    rest
  };
}

function normalizeToken(value) {
  return (value || "").toLowerCase().replace(/[^a-z]/g, "");
}

function resolveCommandShape(parsed) {
  const scope = normalizeToken(parsed.scope);
  const cmd = normalizeToken(parsed.cmd);

  if (scope === "summary") {
    return { type: "summary", horizon: normalizeToken(parsed.cmd) || normalizeToken(parsed.rest[0]) || "week" };
  }

  if (scope === "help" || scope === "menu") {
    return { type: "help" };
  }

  if (scope === "list") {
    return { type: "taskList", horizon: cmd || normalizeToken(parsed.rest[0]) };
  }

  if (scope === "task" && cmd === "add") {
    return { type: "taskAdd" };
  }
  if (scope === "task" && cmd === "list") {
    return { type: "taskList", horizon: normalizeToken(parsed.rest[0]) };
  }
  if (scope === "task" && (cmd === "done" || cmd === "complete")) {
    return { type: "taskDone" };
  }
  if (scope === "task" && cmd === "assign") {
    return { type: "taskAssign" };
  }

  if (scope === "plan" && cmd === "add") {
    return { type: "planAdd" };
  }
  if (scope === "plan" && cmd === "list") {
    return { type: "planList", horizon: normalizeToken(parsed.rest[0]) };
  }

  if (scope === "memory" && cmd === "add") {
    return { type: "memoryAdd" };
  }
  if (scope === "memory" && cmd === "list") {
    return { type: "memoryList" };
  }
  if (scope === "memory" && (cmd === "forget" || cmd === "delete" || cmd === "remove")) {
    return { type: "memoryForget" };
  }

  return { type: "unknown" };
}

async function handlePostback(event, replyMessages) {
  const { action, horizon } = parsePostbackData(event.postback?.data || "");
  const userId = event.source?.userId || "system";

  if (action === "list") {
    const result = listTasksAction(horizon);
    replyMessages.push({ type: "text", text: result.message.slice(0, 4500) });
    return;
  }

  if (action === "summary") {
    const summary = await buildSummary(horizon || "week");
    replyMessages.push({ type: "text", text: summaryToText(summary).slice(0, 4500) });
    return;
  }

  if (action === "digest") {
    const result = listTasksAction(horizon || "week");
    replyMessages.push({ type: "text", text: result.message.slice(0, 4500) });
    return;
  }

  if (action === "menu") {
    replyMessages.push(menuTemplate());
    return;
  }

  replyMessages.push({ type: "text", text: `Unknown postback action from ${userId}.` });
}

async function handleTextMessage(event, replyMessages) {
  const parsed = parseTextCommand(event.message?.text || "");
  const userId = event.source?.userId || "anonymous";
  const command = resolveCommandShape(parsed);

  if (command.type === "help") {
    replyMessages.push({ type: "text", text: helpText() });
    replyMessages.push(menuTemplate());
    return;
  }

  if (command.type === "summary") {
    const summary = await buildSummary(command.horizon || "week");
    replyMessages.push({ type: "text", text: summaryToText(summary).slice(0, 4500) });
    return;
  }

  if (command.type === "taskAdd") {
    const [horizon, importance, urgency, ...titleParts] = parsed.rest;
    const result = addTaskAction(
      {
        horizon,
        importance: Number(importance || 3),
        urgency: Number(urgency || 3),
        title: titleParts.join(" ")
      },
      userId
    );
    replyMessages.push({ type: "text", text: result.message.slice(0, 4500) });
    return;
  }

  if (command.type === "taskList") {
    const result = listTasksAction(command.horizon);
    replyMessages.push({ type: "text", text: result.message.slice(0, 4500) });
    return;
  }

  if (command.type === "taskDone") {
    const result = markDoneAction(parsed.rest[0], userId);
    replyMessages.push({ type: "text", text: result.message.slice(0, 4500) });
    return;
  }

  if (command.type === "taskAssign") {
    const result = assignTaskAction(parsed.rest[0], parsed.rest[1], userId);
    replyMessages.push({ type: "text", text: result.message.slice(0, 4500) });
    return;
  }

  if (command.type === "planAdd") {
    const [horizon, ...titleParts] = parsed.rest;
    const result = addPlanAction(horizon, titleParts.join(" "), userId);
    replyMessages.push({ type: "text", text: result.message.slice(0, 4500) });
    return;
  }

  if (command.type === "planList") {
    const result = listPlansAction(command.horizon);
    replyMessages.push({ type: "text", text: result.message.slice(0, 4500) });
    return;
  }

  if (command.type === "memoryAdd") {
    const result = addMemoryAction({ content: parsed.rest.join(" ") }, userId);
    replyMessages.push({ type: "text", text: result.message.slice(0, 4500) });
    return;
  }

  if (command.type === "memoryList") {
    const result = listMemoriesAction();
    replyMessages.push({ type: "text", text: result.message.slice(0, 4500) });
    return;
  }

  if (command.type === "memoryForget") {
    const result = forgetMemoryAction(parsed.rest[0]);
    replyMessages.push({ type: "text", text: result.message.slice(0, 4500) });
    return;
  }

  replyMessages.push({ type: "text", text: `Unknown command.\n\n${helpText()}` });
}

async function processEvent(event, lineClient) {
  if (!event.replyToken) {
    return;
  }

  const replyMessages = [];
  if (event.type === "message" && event.message?.type === "text") {
    await handleTextMessage(event, replyMessages);
  } else if (event.type === "postback") {
    await handlePostback(event, replyMessages);
  } else {
    replyMessages.push({ type: "text", text: "Event received." });
  }

  if (replyMessages.length === 0) {
    return;
  }

  await lineClient.replyMessage({
    replyToken: event.replyToken,
    messages: replyMessages.slice(0, 5)
  });
}

export function createLineWebhookApp(config, lineClient) {
  const app = express();
  app.use("/webhook/line", express.raw({ type: "*/*" }));

  app.get("/", (_req, res) => {
    res.status(200).send("ok");
  });

  app.get("/health", (_req, res) => {
    res.status(200).send("ok");
  });

  app.post("/webhook/line", async (req, res) => {
    const signature = req.get("x-line-signature") || "";
    const rawBody = req.body instanceof Buffer ? req.body : Buffer.from("");
    if (!verifyLineSignature(config.lineChannelSecret, signature, rawBody)) {
      res.status(401).json({ error: "Invalid LINE signature" });
      return;
    }

    let body = {};
    try {
      body = JSON.parse(rawBody.toString("utf8") || "{}");
    } catch (error) {
      res.status(400).json({ error: "Invalid JSON body" });
      return;
    }
    res.status(200).json({ ok: true });

    const events = Array.isArray(body.events) ? body.events : [];
    Promise.allSettled(events.map((event) => processEvent(event, lineClient))).then((results) => {
      for (const result of results) {
        if (result.status === "rejected") {
          console.error("LINE webhook event processing failed.", result.reason);
        }
      }
    });
  });

  return app;
}
