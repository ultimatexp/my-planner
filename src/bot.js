import cron from "node-cron";
import { LineBotClient } from "@line/bot-sdk";
import { config } from "./config.js";
import { createLineWebhookApp } from "./line-webhook.js";
import { pushDigest, pushSummary } from "./summary.js";

const lineClient = LineBotClient.fromChannelAccessToken({
  channelAccessToken: config.lineChannelAccessToken
});

function isValidLineToId(id) {
  // LINE userId/groupId/roomId typically looks like U/C/R + 32 hex chars.
  return /^[UCR][0-9a-fA-F]{32}$/.test(id);
}

const validTargetIds = config.lineTargetIds.filter(isValidLineToId);
const invalidTargetIds = config.lineTargetIds.filter((id) => !isValidLineToId(id));
if (invalidTargetIds.length > 0) {
  console.warn(
    `Ignoring invalid LINE_TARGET_IDS: ${invalidTargetIds.map((id) => JSON.stringify(id)).join(", ")}`
  );
}

function scheduleSummaryPush(horizon, expression) {
  cron.schedule(
    expression,
    async () => {
      if (validTargetIds.length === 0) {
        return;
      }

      for (const targetId of validTargetIds) {
        try {
          await pushSummary(lineClient, targetId, horizon);
        } catch (error) {
          console.error(`Failed to push ${horizon} summary to target ${targetId}.`, error);
        }
      }
    },
    { timezone: config.timezone }
  );
}

function scheduleDigestPush(horizon, expression) {
  cron.schedule(
    expression,
    async () => {
      if (validTargetIds.length === 0) {
        return;
      }

      for (const targetId of validTargetIds) {
        try {
          await pushDigest(lineClient, targetId, horizon);
        } catch (error) {
          console.error(`Failed to post ${horizon} digest to target ${targetId}.`, error);
        }
      }
    },
    { timezone: config.timezone }
  );
}

scheduleDigestPush("week", config.dailyDigestCron);
scheduleSummaryPush("week", config.weeklyDigestCron);
scheduleSummaryPush("month", config.monthlyDigestCron);
scheduleSummaryPush("year", config.yearlyDigestCron);

const app = createLineWebhookApp(config, lineClient);
app.listen(config.port, config.host, () => {
  console.log(`LINE planner webhook is running on ${config.host}:${config.port}`);
});

if (config.lineTargetIds.length > 0) {
  Promise.all(
    validTargetIds.flatMap((targetId) =>
      ["week", "month", "year"].map((horizon) => pushSummary(lineClient, targetId, horizon))
    )
  )
    .then(() => {
      console.log("Initial LINE summaries pushed.");
    })
    .catch((error) => {
      console.error("Initial LINE summary push failed.", error);
    });
}
