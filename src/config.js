import dotenv from "dotenv";

dotenv.config();

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  lineChannelSecret: requireEnv("LINE_CHANNEL_SECRET"),
  lineChannelAccessToken: requireEnv("LINE_CHANNEL_ACCESS_TOKEN"),
  lineTargetIds: (process.env.LINE_TARGET_IDS || "").split(",").map((item) => item.trim()).filter(Boolean),
  timezone: process.env.LINE_TIMEZONE || "UTC",
  host: process.env.HOST || "0.0.0.0",
  port: Number(process.env.PORT || 3000),
  dailyDigestCron: process.env.DAILY_DIGEST_CRON || "0 9 * * *",
  weeklyDigestCron: process.env.WEEKLY_DIGEST_CRON || "0 9 * * 1",
  monthlyDigestCron: process.env.MONTHLY_DIGEST_CRON || "0 9 1 * *",
  yearlyDigestCron: process.env.YEARLY_DIGEST_CRON || "0 9 1 1 *",
  openAiApiKey: process.env.OPENAI_API_KEY || "",
  openAiModel: process.env.OPENAI_MODEL || "gpt-5-mini"
};
