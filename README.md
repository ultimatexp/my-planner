# LINE Planner Bot

LINE OA planning bot for:

- Weekly action lists
- Monthly roadmap items
- Yearly goals
- Eisenhower Matrix prioritization
- Task assignment by LINE user ID
- Scheduled LINE push summaries and digests

## What the bot does

The bot keeps a local task store and runs through the LINE Messaging API webhook.

It supports:

- Hybrid interactions: text commands plus postback button menu
- Summary delivery for `week`, `month`, and `year`
- Daily digest pushes
- Optional AI ranking with OpenAI (`OPENAI_API_KEY`)

If no OpenAI key is set, it falls back to local urgency/importance/due-date scoring.

## Commands (text in LINE chat)

- `task add <horizon> <importance> <urgency> <title>`
- `task list <week|month|year>`
- `task done <id>`
- `task assign <id> <lineUserId>`
- `plan add <horizon> <title>`
- `plan list <week|month|year>`
- `memory add <content>`
- `memory list`
- `memory forget <id>`
- `summary <week|month|year>`
- `menu` (show quick actions)

## Setup

1. Copy `.env.example` to `.env`
2. Fill in:

- `LINE_CHANNEL_SECRET`
- `LINE_CHANNEL_ACCESS_TOKEN`
- `LINE_TARGET_IDS` (comma-separated user/group/room IDs for scheduled pushes)
- `LINE_TIMEZONE`
- `OPENAI_API_KEY` (optional)

3. Install dependencies:

```bash
npm install
```

4. Start the bot:

```bash
npm start
```

5. Expose your local server for webhook testing (for example with ngrok):

```bash
ngrok http 3000
```

6. In LINE Developers Console:

- Set webhook URL to `https://<your-public-host>/webhook/line`
- Enable webhook
- Add the OA as friend / join target group for push testing

## Render/Railway deployment notes

- Deploy as a Node web service (`npm start`)
- Set env vars from `.env.example`
- Keep webhook URL HTTPS and update it in LINE Developers Console
- Use `PORT` from platform env (already supported)

## Notes

- The bot stores data in `data/planner.sqlite`
- If `data/store.json` exists, it is migrated into SQLite on startup
- Smart memory is stored as durable planner notes and used in AI prioritization
- Cron schedules and timezone are configurable in `.env`
