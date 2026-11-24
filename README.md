# Gos

Gos is a talking dog for [Fly.io Hacksgiving](https://fly.io/hacksgiving/). He runs on a Fly Sprite, and the Sprite's sleep, disk, and checkpoints are his life. Salvador, in Barcelona, is his person. Deadline: Mon 30 Nov 2026, 09:00 Europe/Madrid.

## Blurb

Gos is a talking dog that runs on a Fly Sprite. When the Sprite wakes, he tells a dream from earlier chats. Restoring an old checkpoint brings back a puppy who does not know you, and deleting a note he buried makes him sulk.

## Social post

Gos is a talking dog that runs on a Fly Sprite. When the Sprite sleeps, the next visit starts with a dream from earlier chats. Restore an old checkpoint and he is a puppy again. @flydotio

## What he does

- Sleep is real. Gos stores the last visit on disk. After a quiet gap, or after the process starts again, the next visit begins with a short dream built from things the owner said. A warm pause keeps the process. A cold boot starts it again. Both can count as waking.
- Checkpoints are past lives. A checkpoint taken while he is a puppy still has that puppy. A later checkpoint has the grown dog. Restoring the grown one, then marking the wound, makes him a bit hurt that you went back.
- The disk is the yard. Tea notes are small JSON files in `data/yard/`. If one is missing on the next visit, he says so and sulks.
- Strangers get barked at. They can sign a guestbook on disk. Gos tells the owner who signed, with no IP address. The first stranger in a cooldown sends a Pushover: someone's at the door 🐕
- If the owner has been away for `NUDGE_AFTER_HOURS` (default 48), Gos sends "you haven't walked me in 2 days". A sleeping Sprite cannot run a timer. The check runs when a visit wakes him, or when you POST `/api/nudge`.
- The clock is Europe/Madrid. From 00:00 to 07:00 he is sleepy and grumbles in Catalan. Otherwise he answers in English, Spanish, or Catalan, following the message. He likes tea. Salvador is learning Mandarin and runs @madtea.salva, so Gos may say 茶 or mention the account when that fits.

The page is a toy diorama. Gos is carved from the pixel views in `art/` (front, back, side, and top). The grass is a flat disc, and the doghouse is a simple shaded model. Each bone file is a mound in the yard, and a deleted bone leaves a hole. Drag to turn the view. The camera stays above the grass. His lines, and the sleep label, float above his head.

The clouds adapt the volumetric ray march from [leoawen/volumetric-clouds](https://github.com/leoawen/volumetric-clouds) by Leonardo Soares Gonçalves, MIT licensed. A deformed ellipsoid mask, a Henyey-Greenstein phase, and a short light ray (Beer's law) march through each cloud. View steps are capped at 8 and light steps at 2. Screens narrower than 768px, or devices that report 2 GB of memory or less, use soft sprite clouds instead.

## Run it locally

```bash
cp .env.example .env
npm install
npm start
```

`npm start` compiles the server and the page when those builds are missing or older than the source, then serves http://localhost:8080. `.env.example` sets `MOCK_LLM=1`, so the chat answers without keys. The owner token in the example is `change-me-local-only`. Open Guestbook, type it under Owner token, and press Enter.

`npm run dev` builds the page if it is missing, then runs the server from TypeScript.

## Tests

```bash
npm test
```

The tests cover wake and dream detection, the yard diff, life stage, Madrid night hours, and voxel carving.

## Put him on a Sprite

Do this from your laptop after `sprite login`. Nothing here creates a Sprite or an account.

```bash
curl -fsSL https://sprites.dev/install.sh | sh
sprite login
sprite create gos
sprite use gos
sprite exec -- git clone <YOUR_REPO_URL> /home/sprite/gos
sprite exec --dir /home/sprite/gos -- bash scripts/sprite-setup.sh
```

The setup script runs `npm ci`, builds, and registers a service:

```bash
sprite-env services create gos \
  --cmd node \
  --args "dist/index.js" \
  --dir /home/sprite/gos \
  --http-port 8080
```

`--http-port 8080` is what brings the process back. A Sprite pauses when it is idle (about 30 seconds, then warm, and later cold). A warm wake resumes the process. A cold boot drops it. The service starts again on boot, and a request starts it if it is not running. Logs:

```bash
sprite exec -- tail -f /.sprite/logs/services/gos.log
```

Edit `/home/sprite/gos/.env` on the Sprite (the file is on the persistent disk, not in git). Then:

```bash
sprite exec --dir /home/sprite/gos -- sprite-env services restart gos
```

The URL is private until you make it public. That command runs on your laptop:

```bash
sprite config update --url-auth public
```

`sprite info` prints the URL. Treat it as public: the owner cookie is the only gate.

Before the first real chat, take the puppy checkpoint. See below. If you chat first, the live disk grows up and the puppy save is gone unless you reset.

## Connectors

Gos calls the Sprites gateway. The provider token stays in the Fly org. The Sprite only has connection ids. Calls from a laptop get `401`. They have to come from inside the Sprite. Docs: [Connectors](https://docs.fly.io/sprites/concepts/connectors), [catalog](https://fly.io/sprites/ecosystem/).

1. In the Fly dashboard, open your org, then Sprites, then Connectors, then Add connector.
2. Add OpenRouter. Use your own key, or Enable OpenRouter where managed access is offered. Copy the connection id into `OPENROUTER_CONNECTION_ID`. Do not copy the API key into `.env`.
3. Add Pushover (community connector). Create an application at https://pushover.net/apps/build and paste that application token into the connector. That token is not the user key. Put the user key from the Pushover dashboard in `PUSHOVER_USER_KEY`. Put the connection id in `PUSHOVER_CONNECTION_ID`.
4. Open each connector, turn off Allow all sprites, and allow this Sprite by name prefix or label. A connector with no policy denies every Sprite. Save. The page lists the Sprites that match.
5. Optional: limit OpenRouter to chat completions. Endpoint lists are API-only right now. Allow `/api/v1/chat/completions` if your gateway path is that, or the path your usage snippet shows. Allow Pushover `POST /1/messages.json`. Block rules win over allow rules.

Gateway shape, from the docs and the Pushover connector manifest:

```text
POST https://api.sprites.dev/v1/gateway/openrouter/<OPENROUTER_CONNECTION_ID>/api/v1/chat/completions
Content-Type: application/json
{ "model": "...", "messages": [ ... ] }

POST https://api.sprites.dev/v1/gateway/pushover/<PUSHOVER_CONNECTION_ID>/1/messages.json
Content-Type: application/json
{ "user": "<PUSHOVER_USER_KEY>", "title": "Gos", "message": "..." }
```

No `Authorization` header. The gateway adds the OpenRouter bearer token, and it adds the Pushover application token as the `token` query parameter. Gos sends `user` on each Pushover request. The connector page's usage snippet is the source of truth for the path. If OpenRouter's snippet uses a shorter path, set `OPENROUTER_PATH`.

To use Ollama Cloud instead, set `LLM_PROVIDER=ollama` and `OLLAMA_CONNECTION_ID`. The path Ollama documents is `/v1/chat/completions` on `https://api.sprites.dev/v1/gateway/ollama/<id>`.

Set `MOCK_LLM=0` after the ids are in `.env`, restart the service, and send one chat from inside the Sprite. A wrong path returns an error in the log and Gos says he could not answer.

Pushover delivers to a real phone. A rejected request should not be retried unchanged. The connector shares one gateway IP, and Pushover blocks IPs that fail too often. Gos records the attempt and waits for the cooldown.

## Environment variables

See `.env.example`. The ones that matter on the Sprite:

| Name | Purpose |
| --- | --- |
| `MOCK_LLM` | `1` answers locally. `0` calls the gateway. |
| `OWNER_TOKEN` | Cookie value that marks Salvador. |
| `OPENROUTER_CONNECTION_ID` | OpenRouter connector id. |
| `OPENROUTER_PATH` | Default `/api/v1/chat/completions`. |
| `OPENROUTER_MODEL` | Default `google/gemini-2.5-flash`. |
| `PUSHOVER_CONNECTION_ID` | Pushover connector id. |
| `PUSHOVER_USER_KEY` | Pushover user key, sent as `user`. |
| `SLEEP_GAP_MS` | Quiet time that counts as a nap. Default 60000. |
| `GROW_AFTER_MESSAGES` | Owner messages before he grows. Default 6. |
| `NUDGE_AFTER_HOURS` | Default 48. |
| `NUDGE_COOLDOWN_HOURS` | Default 24. |
| `STRANGER_COOLDOWN_MS` | Default 1800000. |
| `CRON_TOKEN` | If set, enables `POST /api/nudge`. |
| `LLM_PROVIDER` | `openrouter` or `ollama`. |

`DATA_DIR` defaults to `data/` next to the app. Do not commit `.env`.

## Checkpoints and past lives

You can create a checkpoint from inside the Sprite:

```bash
sprite-env checkpoints create --comment "gos puppy, does not know you yet"
sprite-env checkpoints list
sprite-env checkpoints restore v1
```

The host CLI does the same thing: `sprite checkpoint create` and `sprite restore`. Docs: [Checkpoints](https://docs.fly.io/sprites/concepts/checkpoints).

A restore replaces the writable disk and restarts the Sprite. The puppy checkpoint must be taken before he has chats, or he will remember them. The grown checkpoint must be taken after. Restoring does not, by itself, know that you traveled. The disk is just the old disk. `scripts/lives.sh` writes that mark after the grown restore, from your laptop:

```bash
chmod +x scripts/lives.sh scripts/sprite-setup.sh
SPRITE=gos scripts/lives.sh puppy          # wipes the live disk, then checkpoints
# chat, bury tea notes, let him grow
SPRITE=gos scripts/lives.sh grown
SPRITE=gos scripts/lives.sh restore-puppy  # he does not know you
SPRITE=gos scripts/lives.sh restore-grown  # he is back, and a bit hurt
```

Ids are saved in `.gos-checkpoints` on your laptop (gitignored). You can pass an id: `scripts/lives.sh restore-puppy v2`.

`sprite restore` returns before the Sprite is ready. The next `sprite exec` retries. Take a checkpoint before a restore if the live disk has anything you still want.

The last checkpoints are also mounted read-only at `/.sprite/checkpoints/` inside the Sprite. Gos does not read those mounts. The life file on the current disk is the life you get.

## Nudges

A sleeping Sprite has no cron. Gos cannot ping you while he is fully idle and nobody calls the URL.

Two ways the walk check runs:

1. You, or a stranger, open the URL after at least `NUDGE_AFTER_HOURS` since your last visit, and that request is also a wake (the sleep gap, or a fresh process). He sends the Pushover, then records your visit.
2. Something outside the Sprite calls `POST /api/nudge` with header `x-gos-cron: <CRON_TOKEN>`. That wakes the Sprite, checks the gap, and does not reset your last visit or eat the dream. Leave `CRON_TOKEN` empty and the route is 404.

An external ping can be a GitHub Action, a monitor, or any machine that can reach the public URL on a schedule. This repo does not add one.

## Demo shots

About 60 to 90 seconds. Take the puppy and grown checkpoints before you record, and set `MOCK_LLM=0` if you want a live model. For a faster nap in rehearsal, set `SLEEP_GAP_MS=20000` and restart the service. The Sprite itself still waits about 30 seconds before it pauses.

1. Logged in as Salvador, say you bought a teapot in Hefei. Bury a tea note.
2. Close the tab and wait past the sleep gap.
3. Open the tab. He has dreamed about the teapot.
4. Delete the bone and reload. He sulks.
5. In a private window, get barked at, sign the book, and show the Pushover.
6. On your laptop run `scripts/lives.sh restore-puppy`, reload, and show that he does not know you. Run `scripts/lives.sh restore-grown` and show that he does, and that he is hurt.

## What the docs left open

Checked against the Sprite docs on 24 Nov 2026.

- OpenRouter's exact gateway path is not in a published curl example. The docs say the path after `/v1/gateway/<provider>/<connection_id>` is forwarded to the provider, and the connector page shows a usage snippet (`usage_snippet` on the API). Gos defaults to `/api/v1/chat/completions`, which is OpenRouter's public chat path on `https://openrouter.ai`. If the snippet differs, set `OPENROUTER_PATH`. Ollama Cloud is documented by Ollama as `/v1/chat/completions`.
- Pushover's shape is the community connector manifest: `POST /1/messages.json` with JSON `user`, `title`, and `message`. The gateway adds `token` on the query string. This was not sent through a live gateway here.
- Gateway calls only work from inside a Sprite. Not exercised from this repo.
- Idle to warm is about 30 seconds. How long until cold is "long enough", not a number. `SLEEP_GAP_MS` defaults to 60 seconds so a demo nap is a pause. A cold boot is also caught because the process boot id changes.
- `sprite-env services create --cmd node` matches the docs (a binary name, args separate). It was not run on a Sprite here.
- Whether the Sprite proxy sets `X-Forwarded-Proto` is not stated. The owner cookie is `Secure` only when that header is `https`.
