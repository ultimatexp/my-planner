import cron from "node-cron";
import { LineBotClient } from "@line/bot-sdk";
import { config } from "./config.js";
import { createLineWebhookApp } from "./line-webhook.js";
import { pushDigest, pushSummary } from "./summary.js";

const lineClient = LineBotClient.fromChannelAccessToken({
  channelAccessToken: config.lineChannelAccessToken
});

function scheduleSummaryPush(horizon, expression) {
  cron.schedule(
    expression,
    async () => {
      if (config.lineTargetIds.length === 0) {
        return;
      }

      for (const targetId of config.lineTargetIds) {
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
      if (config.lineTargetIds.length === 0) {
        return;
      }

      for (const targetId of config.lineTargetIds) {
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
app.listen(config.port, () => {
  console.log(`LINE planner webhook is running on port ${config.port}`);
});

if (config.lineTargetIds.length > 0) {
  Promise.all(
    config.lineTargetIds.flatMap((targetId) =>
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
