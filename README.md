# PapeRide

A ride-hailing platform with two applications that share **one backend**:

| App | Stack | Role |
| --- | --- | --- |
| `Website/` | Node.js · Express · Socket.IO · PostgreSQL | The **TBRide** dispatch platform: riders, drivers, operators, admin. Single source of truth for rides. |
| `telegram-bot/` | Java 17 · telegrambots · Maven | The **PapeRide Telegram bot**: books rides for Telegram users and pushes them live status updates. |

## How they are connected

```
Telegram user ──▶ PapeRideBot (Java) ──HTTP + X-Telegram-Token──▶ Website /api/telegram/* ──▶ PostgreSQL
                        ▲                                                                    │
                        └────────── poller (10 s): status changes ◀── ride_requests table ◀───┘
                                                              ▲
                     operators / drivers (web) ──Socket.IO────┘   (same rows, live events)
```

* The **Website is the single source of truth**. The bot never touches
  PostgreSQL directly — it calls the guarded HTTP API below, so every
  Telegram booking lands on the operator dispatch board in real time
  (`ride:new_request`) and can be assigned by operators or self-accepted by
  drivers exactly like a web booking.
* Telegram riders get a website account keyed by the synthetic phone
  `tg:<telegram_user_id>` (role `user`, random password — they cannot log in
  to the website, Telegram is their channel).
* The bot **polls every 10 s** and messages the rider when a ride status
  changes: driver assigned (name, vehicle, plate, phone, fare), started,
  completed or cancelled.
* The bot supports **English, Russian and Uzbek**. It starts in the language
  configured in the Telegram user's app when available; send `/language` to
  change it. Prompts, ride actions, history and status notifications use the
  selected language.
* Address labels typed in Telegram ("Amir Temur Avenue" → "Tashkent
  Station") are stored in `ride_requests.pickup_label/dropoff_label`
  (migration `002`) and shown to operators next to the coordinates.

### Website API used by the bot

All endpoints require the `X-Telegram-Token` header (shared secret).

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Boot-time reachability check |
| `POST` | `/api/telegram/rides` | Book a ride (`telegram_user_id`, coordinates, labels) |
| `GET` | `/api/telegram/rides?telegram_user_id=` | History + live status for `/rides` and the poller |
| `POST` | `/api/telegram/rides/:id/cancel` | Rider cancels their own pending/assigned ride |

The secret lives in `TELEGRAM_INTERNAL_TOKEN` (`Website/.env`) and must match
`WEBSITE_INTERNAL_TOKEN` (`telegram-bot/.env`).

## Running locally

Prerequisites: PostgreSQL 16+ running locally, Node.js 18+, JDK 17+, Maven.

```bash
# 1. Website
cd Website
npm.cmd install
copy .env.example .env       # set DATABASE_URL and unique production secrets
npm.cmd run db:setup         # create missing tables; preserves existing data
npm.cmd start                # http://localhost:3000

# 2. Telegram bot (second terminal)
cd telegram-bot
# .env must contain BOT_USERNAME, BOT_TOKEN, WEBSITE_URL, WEBSITE_INTERNAL_TOKEN
mvn -q compile
mvn -q dependency:build-classpath -Dmdep.outputFile=cp.txt
java -cp "target\classes;$(Get-Content cp.txt -Raw)" com.example.bot.Main
```

The bot refuses to start when the website is unreachable — start the website
first.

## Free hosting: Render + Neon

The included [`render.yaml`](./render.yaml) defines a **free Render web
service for the website only**. It does not deploy the Telegram bot: Render
does not offer a free always-on background worker, and its free web services
can spin down after inactivity. The bot therefore remains offline in this
configuration.

1. Create a Neon project on its free plan and copy its PostgreSQL connection
   string. Keep the connection string private.
2. In the Neon SQL Editor, run the contents of `Website/schema.sql` once to
   create the application's tables. Do not run this against a database with
   data you need to preserve without reviewing the schema first.
3. Push the source to a Git provider and connect that repository to Render.
   Keep all `.env` files and database connection strings out of source
   control; the root `.gitignore` excludes local environment files.
4. In Render, create a Blueprint from the repository and select
   `render.yaml`. Set the prompted `DATABASE_URL` environment variable to the
   Neon connection string. Render generates the JWT and Telegram bridge
   secrets; the latter is unused while the bot is offline.
5. After the service is healthy, create the first administrator. Keep the
   admin bootstrap credentials out of source control and remove them from the
   service environment after use.

Both providers' free plans have quotas and service limits; check their current
terms, data retention, and backup options before using this for real riders.
Neon Free currently includes 100 compute-hours and 1 GB of database storage
per project; compute scales to zero after inactivity. Render free web services
may sleep, so this is a hobby/demo deployment rather than a guaranteed
always-on production service. The Render health check uses `/healthz` so
health probes do not keep Neon compute awake. See
[Render's free-instance limits](https://render.com/docs/free) and
[Neon's pricing and quotas](https://neon.com/pricing).

### First administrator

The database is not populated with shared sample accounts. Configure
`ADMIN_FULL_NAME`, `ADMIN_PHONE_NUMBER`, and `ADMIN_PASSWORD` as temporary
environment variables locally, set `DATABASE_URL` to the Neon connection
string, then run `npm.cmd run admin:create` once from `Website/`. The command
refuses to run if an administrator already exists. Do not add the bootstrap
credentials to Render or source control; remove the temporary variables after
the account is created. Riders can register from the website; admins can
create operator and driver accounts.

## Tests

```bash
# Website: realtime ride lifecycle (sockets, dispatch, concurrency guards)
cd Website && npm.cmd start            # terminal 1
node scripts/smoke-test.js             # terminal 2

# Website: the Telegram bridge contract (book -> dispatch -> status -> cancel)
npm.cmd run test:telegram

# Bot: round-trip against a running website (book, list, labels, cancel)
cd ../telegram-bot
java -cp "target\classes;$(Get-Content cp.txt -Raw)" com.example.bot.WebsiteSmokeTest
```

The website smoke tests require a dedicated, isolated test database and test
accounts to be provisioned separately; do not run lifecycle tests against
production data.
Set `TEST_ACCOUNT_PASSWORD`, `TEST_RIDER_PHONE`, `TEST_RIDER2_PHONE`,
`TEST_DRIVER_PHONE`, `TEST_DRIVER2_PHONE`, `TEST_OPERATOR_PHONE`, and
`TEST_ADMIN_PHONE` in the test environment before running them. Do not reuse
production credentials for tests.
