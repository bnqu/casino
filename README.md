# EZBETS

A casino platform: casino originals and slots, Telegram/Google sign-in and a Telegram bot, a VIP
club with rakeback and cashback, a multi-currency append-only ledger, an admin Command Center with
real verification, finance and support workflows, and responsible-gambling controls enforced
server-side.

**Three environments, three separate ledgers.** `EZBETS_WALLET_ENV` picks one, and nothing crosses
between them:

| Environment | What it is | Wallets |
| --- | --- | --- |
| `demo` (default) | Play money. No deposits, no withdrawals, no cash value. | DEMO credits only |
| `testnet` | Crypto wallets on the sandbox provider — testnet-shaped addresses, no keys, no real funds. | BTC, ETH, SOL, USDT |
| `production` | Requires a real regulated custody provider. The bundled sandbox provider **refuses to start** here. | BTC, ETH, SOL, USDT |

There is no built-in production wallet. `src/lib/wallet/providers.ts` defines a `PaymentProvider`
interface and exactly one sandbox implementation; going live means implementing that interface
against a regulated custody or payment provider. Private keys and seed phrases are never stored in
the database, never sent to the frontend, and never put into a Telegram message.

---

## Running it

```bash
npm install
cp .env.example .env.local   # optional — fills in Telegram / Google sign-in
npm run dev
```

The SQLite database is created, migrated and seeded automatically on first boot at `data/ezbets.db`.

### Sign-in providers

Email/password works out of the box. Social sign-in is env-gated and the login page states plainly
when it is not configured:

| Variable | Where it comes from |
| --- | --- |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME` | Create a bot with `@BotFather`, then `/setdomain` to your host (see "Bot domain invalid" below) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google Cloud console; redirect URI `/api/auth/google/callback` |

### What you have to supply yourself

Nothing below can be created for you; each is an account or key you own.

| Variable | You get it from | Needed for |
| --- | --- | --- |
| `TELEGRAM_BOT_TOKEN` | `@BotFather` → `/newbot` | Telegram sign-in and the bot |
| `TELEGRAM_BOT_USERNAME` | The bot's `@name`, without the `@` | Deep links, Login Widget |
| `TELEGRAM_WEBHOOK_SECRET` | Invent one (`openssl rand -hex 32`) | Rejecting forged webhook calls |
| `EZBETS_PUBLIC_URL` | Your externally reachable HTTPS origin | Bot links, webhook registration |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google Cloud console | Google sign-in |
| `EZBETS_TREASURY_*` | Your own **watch-only receiving addresses** | Treasury reporting |
| `EZBETS_WALLET_PROVIDER` | Your custody provider, once implemented | Production wallets |

### Running the bot

The bot answers `/start`, `/login`, `/account`, `/balance`, `/deposit`, `/withdraw`, `/support`,
`/help`, `/mute` and `/unmute`. It never asks for a password, key or seed phrase, and every outbound
message is scanned by `assertNoSecrets()` before it leaves.

```bash
npm run telegram:setup              # publish command list + descriptions to Telegram
npm run telegram:bot                # local development: long-poll for updates
npm run telegram:setup -- --webhook # production: register the webhook
```

Updates reach the same dispatcher (`src/lib/telegram/dispatch.ts`) either way, so the bot behaves
identically whichever transport is in use.

- **Locally**, use `npm run telegram:bot`. Telegram only delivers webhooks to public HTTPS
  endpoints, which `localhost` is not, so polling is the only option without a tunnel. Only one
  poller may run at a time — a second gets `Conflict: terminated by other getUpdates request`.
- **In production**, set `EZBETS_PUBLIC_URL` to your HTTPS origin and register the webhook, either
  with the script or from **Command Center → Platform → Telegram bot**. Registering against an
  `http://` origin is refused rather than silently failing later.

Inline buttons whose URL Telegram cannot reach (anything non-HTTPS, `localhost`, `127.0.0.1`,
`*.local`) are automatically demoted to plain text links, so bot replies still work in development
instead of being rejected wholesale. Everything written into message text is MarkdownV2-escaped —
a single bare `=` in a URL makes Telegram reject the whole message.

## Sound

Every sound is **synthesised at runtime** from oscillators and filtered noise
(`src/lib/audio/`). There are no audio files, so the system adds **zero bytes** to page weight and
every sound is original by construction — there is no sample anywhere that could have come from
somewhere else.

| Module | Role |
| --- | --- |
| `synth.ts` | Voice primitives: tones, filtered noise, envelopes |
| `catalog.ts` | The 18 sounds, plus the outcome→sound mapping |
| `music.ts` | Four procedural mood beds and the lookahead scheduler |
| `engine.ts` | AudioContext, master/music/effects buses, throttling |
| `store.ts` | Singleton engine and the persisted settings store |

Games do not trigger sounds themselves. `useGame.ts` is the single choke point every one of the 13
games passes through, so audio is consistent everywhere for free.

### What the sound design will not do

These are enforced in code and covered by tests in `tests/audio.test.mts`, not left to good
intentions:

- **A result that returns less than the stake is never a win sound.** A 100 stake paying 50 back is
  a loss and sounds like one. Dressing that up as a celebration is the single most common piece of
  audio manipulation in the industry, and `outcomeTier()` makes it impossible.
- **Win feedback is proportional to the real multiplier** — under 2× is a quiet confirmation, 2–10×
  is a short celebratory phrase, 10×+ is more elaborate but still under 1.2 seconds. A test asserts
  the escalation is monotonic and that the thresholds cannot be quietly lowered.
- **There is no near-miss sound, and no API to request one.** A test fails if one ever appears. An
  "almost" is a loss and is indistinguishable from one.
- **Loss audio is one soft, low, brief tone.** Nothing harsh, nothing punitive, nothing designed to
  provoke an immediate re-bet. Tests cap its length and gain.
- **Nothing plays unprompted.** Every sound is the direct result of an action the player just took.
  There are no idle nags and no "come back" sounds.
- **Music never reacts to how the player is doing.** It is atmosphere, not a pacing device.

### Controls

The 🔊 control sits in the site header (and the mobile drawer) and opens a panel with master, music
and effects volumes, a master mute, background music with four moods, and **reduced stimulation** —
which shortens and quietens everything, disables music entirely, and collapses the elaborate win
effect to the plain one. It defaults on when the OS asks for reduced motion. Settings persist in
`localStorage` under `ezbets.audio.v1` and are clamped on read, so corrupt stored values fall back
to defaults rather than throwing.

Audio only initialises inside a real user gesture — no AudioContext exists before the first tap or
keypress, which is both the mobile browser requirement and the right default.

### Branding

```bash
npm run brand:assets   # regenerate the avatar and message banner
```

Both are rendered from the same vector mark as the site logo, so they cannot drift from it:

| File | Size | Use |
| --- | --- | --- |
| `public/brand/telegram-avatar.png` | 512×512 | The bot's profile picture |
| `public/brand/telegram-banner.png` | 1000×320 | Header on every bot message |

**The avatar has to be uploaded by hand.** The Bot API has no method to set a bot's own profile
picture — send `/setuserpic` to @BotFather and upload the file.

The banner is applied automatically: replies go out as a photo with the text as its caption. The
image uploads once and Telegram's returned `file_id` is cached in `settings`, so every later message
references it instead of re-uploading. Replies longer than the 1024-character caption limit send the
banner with a title line and the body as a follow-up, rather than truncating a balance to fit.
Set `TELEGRAM_MESSAGE_BANNER=off` for plain text.

### "Bot domain invalid"

That is the Login Widget refusing to render because the page's origin does not match the domain set
with `/setdomain` in @BotFather — and BotFather will not accept `localhost` or a bare `http://`
origin, so the widget can never work on a dev machine.

The login page detects this (`telegramWidgetUsable()`) and offers bot sign-in instead: the player
opens the bot, sends `/login`, and taps a single-use link that expires in ten minutes. No domain
required, and the session is minted on our own origin. To get the widget itself working, deploy
behind HTTPS, point `EZBETS_PUBLIC_URL` at that origin, and run `/setdomain` with the same host.

Seeded accounts (override with `EZBETS_ADMIN_PASSWORD` / `EZBETS_DEMO_PASSWORD`):

| Username  | Password         | Role       |
| --------- | ---------------- | ---------- |
| `admin`   | `AdminPass123!`  | superadmin |
| `support` | `AdminPass123!`  | support    |
| `player`  | `PlayerPass123!` | player     |

### Scripts

```bash
npm run dev        # dev server
npm run build      # production build
npm test           # game maths, ledger, auth, verification and VIP tests
npm run db:check   # schema, seed data and wallet reconciliation report

npm run telegram:setup   # publish the bot's commands and descriptions
npm run telegram:bot     # long-poll the bot locally (no public URL needed)
npm run brand:assets     # regenerate the bot avatar and message banner
```

`scripts/calibrate-slots.ts` re-measures slot RTP by Monte Carlo; run it after changing any reel
weights or paytable, then update the published figure in `catalog.ts` and add a migration.

---

## Stack

- **Next.js 16** (App Router, React 19, Turbopack)
- **SQLite** via Node's built-in `node:sqlite` — no native build step, no external database
- **Tailwind CSS v4** with a CSS-first token layer in `globals.css`
- **Zod** for request validation
- Node's `node:crypto` for scrypt password hashing and HMAC-SHA256 randomness
- Telegram Login Widget and Google OAuth 2.0, both verified server-side

---

## Architecture

```
src/
  app/
    (site)/            player-facing routes (header, footer, mobile tab bar)
    (auth)/            login, register, password reset
    admin/             staff console, guarded by permission
    api/               route handlers — the only mutation surface
  lib/
    db/                connection, versioned migrations, seed
    auth/              scrypt hashing, sessions, roles + permissions, social providers
    games/             engine, RNG primitives, one module per game
    wallet/            append-only ledger + reconciliation
    server/            server-only queries, analytics, audit logging
  components/          UI, game boards, admin widgets
```

### Money

Every amount is an **integer count of minor units**. Demo credits use 100 units = 1.00 EZ; each
crypto asset carries its own `scale` in `src/lib/wallet/assets.ts` (BTC/ETH/SOL 8 dp, USDT 6 dp). No
float ever touches a balance, and an amount typed with more precision than the asset has is rejected
rather than silently rounded.

Wallets are keyed on `(user_id, currency, environment)`. `environmentFor()` maps DEMO to `demo`
always and every crypto asset to whatever `EZBETS_WALLET_ENV` says, so a demo balance and a testnet
balance are different rows that can never be summed, spent against each other, or converted.

### Deposits and withdrawals

Deposits enter through exactly one function, `recordProviderDeposit()`, which is reachable only from
the provider poller or the operator-only sandbox simulation in Command Center → Finance — never from
a player request. A unique index on `(tx_hash, network, address)` plus a ledger idempotency key make
a double credit impossible even if the provider replays an event. Funds credit only once the asset's
required confirmations are reached.

Withdrawals debit the balance at request time (`withdrawal_hold`), which is what stops the same
funds being withdrawn twice or gambled while a payout is queued. Each request is address-validated
against the asset's own chain (an ETH address is refused for BTC), quoted with network and platform
fees before confirmation, and risk-scored; anything above the threshold goes straight to manual
review. Rejection and failure refund through a key derived from the withdrawal, so a repeated failure
cannot refund twice, and a completed withdrawal can no longer be refunded at all.

### Cashback

Daily, weekly and monthly programs, all **disabled by default** so the economics are a deliberate
operator choice. Rates are basis points capped at 10% server-side, apply identically to every player,
and the admin page has a cost preview that replays the last completed period against proposed
settings without writing anything.

### Ledger

`ledger_transactions` is append-only. `wallets.balance` is a cache that is written inside the same
transaction as the entry, and `reconcileWallet()` proves `SUM(amount) === balance`. Reconciliation
is surfaced to the player on `/wallet` and to staff on `/admin` and `/admin/settings`.

Debits below zero are rejected unless a caller explicitly opts in (`allowNegative`), which only the
admin adjustment path does. Idempotency keys make bet/win postings safe to retry.

### Game engine

Games implement one interface (`src/lib/games/types.ts`) and register in `registry.ts`:

- **instant** games resolve in a single call (Dice, Limbo, Plinko, Keno, Wheel, Roulette, slots)
- **stateful** games open a round and take actions (Mines, Crash, Hi-Lo, Coin Flip, Blackjack)

The engine owns everything that matters: wager bounds, responsible-gambling limits, the wallet
debit, round and bet records, the max-payout cap, and the credit. A game module only maps random
floats to an outcome and a multiplier — it never touches the database.

### Result generation

Outcomes are produced server-side from a cryptographically secure random stream
(HMAC-SHA256 over a per-account server seed, client seed and an incrementing
nonce) and written to the bet record before the browser is told anything. The
client only renders what the server already decided — nothing in the page can
influence a result. Everything a multi-step round will ever need is derived up
front, so a Mines reveal or a Blackjack hit cannot change what was already
committed.

This is deliberately plumbing rather than a marketing surface: there is no
seed-verification UI in the product.

### House edge

The edge comes only from published payout maths. Table-driven games generate their paytables from
real outcome probabilities and normalise them to the configured RTP (`payout-math.ts`), so the
realised RTP of the rounded table is computed rather than asserted. Slot RTP is measured by Monte
Carlo over 1.5M spins and published as measured — it is read-only in the admin console for that
reason.

There is no per-player adjustment, no adaptive difficulty, and no code path that reads a player's
loss history when deciding an outcome.

---

## Authentication

Three ways in, all landing on the same session:

- **Email + password** — scrypt hashed, rate limited, with lockout after repeated failures.
- **Telegram** — the official Login Widget. The browser posts the widget's payload and the server
  recomputes `HMAC-SHA256(data_check_string, SHA256(bot_token))` before trusting a single field of
  it. Stale payloads (>24h) are rejected. EZBETS never sees a Telegram password.
- **Google** — standard OAuth 2.0 authorization-code flow with a single-use, expiring `state`
  record; the code is exchanged server-side.

A social identity is resolved in this order: existing link → sign in; provider-**verified** email
matching an account → link and sign in; otherwise create an account with welcome credits. Only a
verified email may claim an existing account. Unlinking your last remaining sign-in method is
refused so an account can never lock itself out.

Connected accounts are managed at `/profile/security`, alongside the device/session list, sign-in
history and "log out all other sessions".

---

## Account states and verification

Accounts are always in exactly one explicit state:

| State | Sign in | Play | Notes |
| --- | --- | --- | --- |
| `active` | yes | yes | Normal. |
| `verification_required` | yes | **no** | Player keeps read access and sees the reason. |
| `suspended` | no | no | Temporary staff action. |
| `self_excluded` | no | no | Player-initiated, cannot be lifted early. |
| `closed` | no | no | Permanent, player-initiated. |
| `banned` | no | no | Super admin only. |

**Locking is never silent.** Opening a case requires a player-visible reason *and* an internal note,
records the admin, timestamp and the previous status, writes an audit entry, and notifies the
player. They land on `/profile/verification` showing the status, the reason, exactly what is needed
and a running timeline.

Case flow: `pending_review → documents_requested / under_review / info_required → approved | rejected`.
Approving restores the account's previous state; rejecting keeps the hold; releasing lifts it
without a decision. Staff can add notes (internal or player-visible), request more information,
escalate, and reassign. Every transition writes both a case event and an audit entry.

Nothing is auto-approved — there is no document upload or identity-provider integration in this
build, and the reviewer UI says so rather than implying documents were machine-checked.

---

## VIP and rakeback

Rank is driven purely by lifetime amount wagered — Bronze through Obsidian — and never by losses.
Each tier returns a published share of the house edge on every bet:

```
rakeback = wager × houseEdge × tierRate
```

Accrual is tracked in thousandths of a minor unit so small bets are not silently rounded to zero;
claims pay whole units and carry the remainder forward, with a 24-hour cooldown.

---

## Security

- Sessions are random 32-byte tokens; only their SHA-256 hash is stored. Cookies are `httpOnly`
  and `SameSite=Lax`.
- Every mutating request requires an `x-csrf-token` header matching the session secret, plus a
  same-origin check.
- Passwords use scrypt with per-password salts; verification is constant-time.
- Login is rate limited per IP and per identifier, with account lockout after repeated failures.
- Roles and permissions live in code (`auth/roles.ts`), never in client-controlled data. Permissions
  are granular (`users.verify`, `wallets.adjust`, `users.ban`, `admins.manage`, and so on) — support
  can work verification cases but cannot move money, suspend or ban. Staff cannot act on an account
  at or above their own role level, cannot grant a role above their own, and cannot suspend themselves.
- All SQL uses bound parameters.
- The server is authoritative for balances, outcomes, permissions and limits. The client only
  displays what the server already decided.

Sensitive admin actions write an `admin_audit_logs` entry with actor, target, reason, metadata and
IP. Audit entries are append-only.

---

## Responsible gambling

- Wager, loss, credit and session-time limits, checked before every bet.
- **Tightening a limit is immediate; loosening or removing one takes 24 hours.** Removal is
  scheduled, not instant.
- Reality checks summarise the session at a configurable interval.
- Cooling-off blocks play; self-exclusion blocks sign-in; closure is permanent. None of these can
  be lifted early by the player, and only cooling-off can be lifted by staff — the API refuses to
  lift a self-exclusion regardless of permission level.
- No dark patterns: promotions are never targeted at losses, and the leaderboard ranks volume
  rather than profit so it never rewards chasing.

---

## Testing

`npm test` runs 55 tests covering:

- RNG determinism and stream uniformity
- simulated RTP for every game against its configured house edge, with variance-aware tolerances
- generated paytables for Plinko, Keno and Wheel
- roulette payout structure (36 / coverage on a single-zero wheel)
- blackjack shoe integrity and round termination
- ledger correctness: overdrafts, idempotency, integer-only amounts, reconciliation
- engine safety: bet bounds, insufficient funds leaving no trace, one player unable to act on
  another player's round, double-settlement rejection
- Telegram HMAC verification — valid payloads accepted; tampered ids, missing or forged signatures,
  stale timestamps, and signatures from a different bot token all rejected
- social account resolution: first sign-in creates, second reuses, and the last remaining sign-in
  method cannot be unlinked
- verification workflow: lock blocks play, approval restores the prior state, rejection keeps the
  hold, release lifts it, duplicate cases are refused, and the full timeline is recorded
- granular permissions, and which account states may sign in or play
- VIP thresholds plus rakeback accrual and claim through the ledger, including sub-unit carry
- asset scaling and parsing, and address validation refusing every cross-chain mistake
- deposit crediting: nothing before confirmations, exactly once after, and never twice on a replay
- withdrawal holds, fee quoting, limits, risk routing to review, and refund-once semantics
- environment separation: a demo and a testnet balance for one user stay in separate wallet rows
- cashback computation, capping, single-use claims, expiry, and the cost preview
- Telegram command handling and `assertNoSecrets()` against tokens, keys, hashes and seed phrases

---

## Command Center

The admin console is grouped into Operations, Players, Money, Product, Insight and Platform:
dashboard, users, verification queue, support, finance, wallets, transactions, treasury, games,
promotions, cashback, bonuses, VIP, leaderboards, analytics, economics, reports, audit logs, system
health, Telegram bot and settings. Each section is gated by its own permission and hidden from the
nav when not granted.

Finance carries the withdrawal queue with review, approve, reject, complete and assign, plus the
sandbox deposit simulation. Treasury shows the configured watch-only addresses, which environment
variable supplies each one, and a per-asset reconciliation of deposits against withdrawals and user
balances. Economics breaks GGR down against promotional cost and shows realised versus configured
RTP per game — there is no mechanism anywhere to adjust an individual player's odds, and the page
says so.

The staff flow works end to end: search a user → open their profile → lock for verification with a
reason and internal note → track it in the queue → request documents → approve or release → confirm
in the audit log.

---

## Known limitations

- **No mail transport.** Password reset generates and stores a hashed token correctly, but there is
  no SMTP integration; in development the link is returned in the response instead of emailed.
- **Email verification** is modelled and displayed but not enforced. Only a provider-verified email
  (Google) marks an account verified.
- **No document upload.** Verification collects self-declared details only, and the reviewer UI says
  so rather than implying anything was machine-checked.
- **2FA** has its schema table (`user_totp`) but no enrolment UI yet.
- **No production wallet.** Only the sandbox provider ships. It generates deterministic
  testnet-shaped addresses, holds no keys, and cannot move real funds — and it throws rather than
  run when `EZBETS_WALLET_ENV=production`. Real deposits and withdrawals need a regulated custody
  provider implemented behind `PaymentProvider`.
- **The sandbox has no chain to watch.** `pollDeposits()` returns nothing; in testnet, deposits
  arrive through the audited operator simulation instead. A real provider implementation supplies
  the watcher.
- **The bot outbox has no scheduled flush.** It drains when a notification is queued, after each
  polled update, and on demand from the admin page. A busy deployment should add a periodic flush so
  a message queued during a Telegram outage is not left waiting for the next event.
- SQLite suits a single-node deployment. The ledger uses `BEGIN IMMEDIATE` transactions, so it is
  correct under concurrency, but a multi-node deployment would need Postgres.
- Crash runs per-player rather than as a shared synchronised round.
