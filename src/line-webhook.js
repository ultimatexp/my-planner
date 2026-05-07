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
  const trimmed = (text || "").trim();
  const parts = trimmed.split(/\s+/);
  const [scope, cmd, ...rest] = parts;

  return {
    raw: trimmed,
    scope: (scope || "").toLowerCase(),
    cmd: (cmd || "").toLowerCase(),
    rest
  };
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

  if (parsed.raw === "help" || parsed.raw === "menu") {
    replyMessages.push({ type: "text", text: helpText() });
    replyMessages.push(menuTemplate());
    return;
  }

  if (parsed.raw.startsWith("summary ")) {
    const summary = await buildSummary(parsed.raw.split(/\s+/)[1] || "week");
    replyMessages.push({ type: "text", text: summaryToText(summary).slice(0, 4500) });
    return;
  }

  if (parsed.scope === "task" && parsed.cmd === "add") {
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

  if (parsed.scope === "task" && parsed.cmd === "list") {
    const result = listTasksAction(parsed.rest[0]);
    replyMessages.push({ type: "text", text: result.message.slice(0, 4500) });
    return;
  }

  if (parsed.scope === "task" && parsed.cmd === "done") {
    const result = markDoneAction(parsed.rest[0], userId);
    replyMessages.push({ type: "text", text: result.message.slice(0, 4500) });
    return;
  }

  if (parsed.scope === "task" && parsed.cmd === "assign") {
    const result = assignTaskAction(parsed.rest[0], parsed.rest[1], userId);
    replyMessages.push({ type: "text", text: result.message.slice(0, 4500) });
    return;
  }

  if (parsed.scope === "plan" && parsed.cmd === "add") {
    const [horizon, ...titleParts] = parsed.rest;
    const result = addPlanAction(horizon, titleParts.join(" "), userId);
    replyMessages.push({ type: "text", text: result.message.slice(0, 4500) });
    return;
  }

  if (parsed.scope === "plan" && parsed.cmd === "list") {
    const result = listPlansAction(parsed.rest[0]);
    replyMessages.push({ type: "text", text: result.message.slice(0, 4500) });
    return;
  }

  if (parsed.scope === "memory" && parsed.cmd === "add") {
    const result = addMemoryAction({ content: parsed.rest.join(" ") }, userId);
    replyMessages.push({ type: "text", text: result.message.slice(0, 4500) });
    return;
  }

  if (parsed.scope === "memory" && parsed.cmd === "list") {
    const result = listMemoriesAction();
    replyMessages.push({ type: "text", text: result.message.slice(0, 4500) });
    return;
  }

  if (parsed.scope === "memory" && parsed.cmd === "forget") {
    const result = forgetMemoryAction(parsed.rest[0]);
    replyMessages.push({ type: "text", text: result.message.slice(0, 4500) });
    return;
  }

  replyMessages.push({ type: "text", text: `Unknown command.\n\n${helpText()}` });
}

export function createLineWebhookApp(config, lineClient) {
  const app = express();
  app.use("/webhook/line", express.raw({ type: "*/*" }));

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
    const events = body.events || [];

    for (const event of events) {
      if (!event.replyToken) {
        continue;
      }

      const replyMessages = [];
      if (event.type === "message" && event.message?.type === "text") {
        await handleTextMessage(event, replyMessages);
      } else if (event.type === "postback") {
        await handlePostback(event, replyMessages);
      } else {
        replyMessages.push({ type: "text", text: "Event received." });
      }

      if (replyMessages.length > 0) {
        await lineClient.replyMessage({
          replyToken: event.replyToken,
          messages: replyMessages.slice(0, 5)
        });
      }
    }

    res.status(200).json({ ok: true });
  });

  return app;
}

