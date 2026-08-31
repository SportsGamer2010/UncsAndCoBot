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
- Asks players which record they believe was set
- Optionally links a claimed player record to a Discord member
- Extracts stat rows from the screenshot with local Tesseract OCR
- Compares OCR stats against saved mode records and flags newly broken records
- Saves every valid record to `data/record-book.json`
- Prevents duplicate screenshot submissions by image hash
- Tracks crew win/loss records by mode
- Publishes single-game team records for points, rebounds, assists, steals, and blocks

## Discord bot requirements

Create a Discord application/bot in the Discord Developer Portal and enable these bot permissions/intents:

- `Send Messages`
- `Embed Links`
- `Attach Files`
- `Read Message History`
- `Manage Channels`
- `Manage Messages` (recommended so the bot can pin the instruction message)
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

## Server workflow

1. A staff member runs `/recordbook setup`.
2. The bot creates or updates `Statistics` > `#record-book`.
3. Players run `/submit-record` in `#record-book` and provide:
   - `mode`: Rec, Pro-Am, or Theater
   - `crew`: their crew name
   - `result`: win or loss
   - `claimed-record`: the record they believe was set, or "Not sure"
   - `screenshot`: end-of-game box score image
   - optional `record-holder`: Discord member who set an individual record
   - optional opponent/final score/notes
4. The bot reads the screenshot, matches OCR player names to Discord members when possible, checks for new team/player records, saves the result, posts a confirmation embed, and refreshes the record book.

## Persistence

Records are saved in:

```text
data/record-book.json
```

Back this file up with your normal hosting backups. If you deploy to a platform with ephemeral disk, mount a persistent volume or point `DATA_DIR` at durable storage.

## OCR notes

The bot uses local Tesseract OCR so it can work without paid API credentials. OCR quality depends on screenshot clarity. Players should submit the full end-of-game stats screen, not a cropped or blurry phone photo.

If a screenshot cannot be parsed, the bot asks the player to submit a clearer image.
