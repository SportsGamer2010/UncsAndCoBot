# Uncs & Co Record Book Bot

A Discord bot for tracking screenshot-backed NBA 2K crew records in the Uncs & Co server.

Players submit end-of-game box score screenshots with `/submit-record`. The bot runs OCR on the image, extracts player stat lines, saves the submission, and refreshes a professional record-book channel under the **Statistics** category with separate sections for:

- Rec
- Pro-Am
- Theater

## What it does

- Creates/refreshes `Statistics` > `#record-book` with `/recordbook setup`
- Pins a clear instruction embed explaining that screenshots are required
- Accepts player submissions through `/submit-record`
- Asks players which player record was set
- Links the submitted player record to a Discord member
- Extracts stat rows from the screenshot with local Tesseract OCR
- Compares OCR stats against saved mode records and flags newly broken records
- Posts a group-visible notification when a new player record is set
- Keeps detailed OCR/submission info admin-only through `/recordbook latest`
- Awards mode/stat record-holder roles for verified individual records when Discord member matching succeeds
- Saves every valid record to `data/record-book.json`
- Prevents duplicate screenshot submissions by image hash
- Publishes single-game player records for points, rebounds, assists, steals, and blocks
- Provides `/records` so members can view saved player records

## Discord bot requirements

Create a Discord application/bot in the Discord Developer Portal and enable these bot permissions/intents:

- `Send Messages`
- `Embed Links`
- `Attach Files`
- `Read Message History`
- `Manage Channels`
- `Manage Messages` (recommended so the bot can pin the instruction message)
- `Manage Roles` (recommended so the bot can award record-holder roles)
- Server Members intent is not required
- Message Content intent is not required

Invite the bot with the `bot` and `applications.commands` scopes.

## Setup

```bash
npm install
cp .env.example .env
```

Edit `.env`:

```bash
DISCORD_TOKEN=your-bot-token
DISCORD_GUILD_ID=1539616713501310996
```

`1539616713501310996` is the Uncs & Co server ID. Keeping `DISCORD_GUILD_ID` set makes slash commands update immediately in that server.

## Run locally

```bash
npm run dev
```

For production:

```bash
npm run build
npm start
```

## Deploy

This is a long-running Discord bot, so it should run on a host that supports persistent background services such as Railway, Fly.io, Render Background Workers, a VPS, or a Docker host. It is not a Vercel/static-site style deployment.

### Docker

Build the image:

```bash
docker build -t uncs-record-book-bot .
```

Run it with a persistent data volume:

```bash
docker run -d \
  --name uncs-record-book-bot \
  --restart unless-stopped \
  -e DISCORD_TOKEN=your-bot-token \
  -e DISCORD_GUILD_ID=1539616713501310996 \
  -v uncs-record-book-data:/data \
  uncs-record-book-bot
```

### Hosted services

Use these settings on a bot-friendly host:

- Build command: `npm ci && npm run build`
- Start command: `npm start`
- Required environment variable: `DISCORD_TOKEN`
- Recommended environment variable: `DISCORD_GUILD_ID=1539616713501310996`
- Persistent disk/volume path: `/data`

### Railway variable checklist

Add these variables to the Railway service. Paste your Discord bot token only in Railway's variable field:

```bash
DISCORD_TOKEN=
DISCORD_GUILD_ID=1539616713501310996
DATA_DIR=/data
NODE_ENV=production
```

Railway should use `railway.json` and the included `Dockerfile` automatically after the repository is connected.

In production, relative `DATA_DIR` values are forced to `/data` so Railway does not try to write inside the read-only app directory.

## Server workflow

1. A staff member runs `/recordbook setup`.
2. The bot creates or updates `Statistics` > `#record-book`.
3. Players run `/submit-record` in `#record-book` and provide:
   - `mode`: Rec, Pro-Am, or Theater
   - `record`: the player record that was set, or "Not sure"
   - `record-holder`: searchable Discord member who set the individual record
   - `screenshot`: end-of-game box score image
4. The bot reads the screenshot, matches OCR player names to Discord members when possible, checks for new player records, saves the result, posts a confirmation embed, and refreshes the record book.

When a Discord member is matched to a verified individual record, the bot creates/assigns a role such as `Rec BLK Record Holder`. The bot's server role must be higher than those record-holder roles for assignment to work.

Members can also run `/records` to view current player records by mode.

Discord limits autocomplete dropdowns to 25 results. In `record-holder`, type part of the player's Discord display name or username, then select the matching member.

Admins can run `/recordbook latest` to privately view the latest submission details, including parsed player rows.

## Persistence

Records are saved in:

```text
data/record-book.json
```

Back this file up with your normal hosting backups. If you deploy to a platform with ephemeral disk, mount a persistent volume or point `DATA_DIR` at durable storage.

## OCR notes

The bot uses local Tesseract OCR so it can work without paid API credentials. OCR quality depends on screenshot clarity. Players should submit the full end-of-game stats screen, not a cropped or blurry phone photo.

If a screenshot cannot be parsed, the bot asks the player to submit a clearer image.
