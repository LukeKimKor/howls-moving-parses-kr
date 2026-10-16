# Howl's Moving Parses

A personal static web dashboard that aggregates WoW character performance data and spec-level meta from Raider.IO and WarcraftLogs. Supports multiple tracked characters and all 40 playable specs. Data is fetched at build time via GitHub Actions, baked into the static site, and can be deployed to GitHub Pages after owner approval.

This adaptation tracks 13 KR Azshara characters. See [KR_DEPLOYMENT.md](KR_DEPLOYMENT.md) for setup, verified data, the unresolved Havoc/Devourer choice, and the remaining WarcraftLogs integration checks. Scheduled refresh and public deployment are disabled by default until repository setup is completed.

## Features

- Character overall M+ score, realm/region/world ranks, and regional top-1% score comparison
- Recent M+ runs and best run per dungeon
- Log performance from WarcraftLogs (raid parses and M+ dungeon logs)
- Damage breakdown from most recent raid log
- Gear snapshot and talent snapshot from Raider.IO
- Regional spec meta: a WarcraftLogs player sample enriched with Raider.IO scores and equipped trinkets; supports EU or KR per snapshot
- Multi-spec tracking per character: main spec + offspecs with a spec toggle in the header
- Service worker notifies you when new data is available — no page refresh required to check
- Static build: no API keys in the browser, no runtime network calls, instant tab switching

## Tech Stack

| Concern | Choice |
|---|---|
| Language | TypeScript (strict mode) |
| Framework | React 18 |
| Styling | PicoCSS (classless, semantic HTML) |
| Build tool | Vite |
| Data fetching | Node.js scripts at build time via `tsx` |
| Deployment | GitHub Pages |
| CI/CD | GitHub Actions |
| Offline/staleness | Service Worker |
| Testing | Vitest + React Testing Library |
| Formatting & linting | Biome |
| Git hooks | Lefthook |

## Prerequisites

- Node.js 22+
- pnpm 9.15.0

## Local Setup

```bash
git clone https://github.com/LukeKimKor/howls-moving-parses-kr.git
cd howls-moving-parses-kr
pnpm install
```

Copy the environment file and fill in your WarcraftLogs credentials:

```bash
cp .env.example .env
# Edit .env and add your WCL_CLIENT_ID and WCL_CLIENT_SECRET
```

To get WarcraftLogs credentials:

1. Go to [warcraftlogs.com/api/docs](https://www.warcraftlogs.com/api/docs)
2. Create a client under **Manage Clients**. Leave the "Public Client" checkbox **unchecked** — the build script uses the `client_credentials` OAuth grant (confidential client). Use any valid HTTPS URL for "Redirect URLs".
3. Copy your **Client ID** and **Client Secret** into `.env`

## Running Locally

Fetch full live data after WCL credentials have been configured locally (the command loads `.env`):

```bash
pnpm fetch:data
```

For a preview using only real, public Raider.IO data, without WCL authentication:

```bash
pnpm fetch:public
pnpm typecheck
pnpm build
pnpm preview
```

Public-only mode explicitly leaves WCL logs and spec meta unqueried and displays that limitation. It never inserts sample logs. The explicit full mode (`fetch:data`) fails if credentials are missing. The workflow uses `fetch:refresh`, which selects full mode only when both WCL Secrets are configured, uses public-only mode when neither exists, and fails on an incomplete one-secret setup.

Start the dev server:

```bash
pnpm dev
```

Build for production:

```bash
pnpm build
pnpm dlx serve dist -l 3000
```

## Running Tests

```bash
pnpm test              # Unit and component tests
pnpm test:snapshot     # Snapshot schema validation (requires fetch-data to have run first)
```

## Configuration

Edit `characters.config.json` at the repo root to control which characters are tracked.

### Example

```json
{
  "characters": [
    {
      "name": "Hxwl",
      "realm": "Draenor",
      "region": "eu",
      "class": "Shaman",
      "default": true,
      "specs": [
        { "spec": "Elemental",   "role": "main" },
        { "spec": "Enhancement", "role": "offspec" },
        { "spec": "Restoration", "role": "inactive" }
      ]
    }
  ]
}
```

### Field Reference

| Field | Type | Description |
|---|---|---|
| `name` | string | Character name (exact, case-sensitive) |
| `realm` | string | Realm display name (e.g. `"Draenor"`, `"Twisting Nether"`) |
| `region` | `"eu"` or `"kr"` | One region per snapshot; all configured characters must use the same region |
| `realmSlug` | optional string | Explicit canonical slug; `"azshara"` for KR `"아즈샤라"` |
| `mainSpecPending` | optional boolean | When true, use two or more `tracked` specs without assigning a main/offspec |
| `class` | string | WoW class name as WarcraftLogs expects it (e.g. `"Shaman"`, `"DeathKnight"`) |
| `default` | boolean | Exactly one character must have `true` — shown on page load |
| `specs` | array | One or more spec entries |
| `specs[].spec` | string | Spec name (e.g. `"Elemental"`, `"Beast Mastery"`) |
| `specs[].role` | `"main"` \| `"offspec"` \| `"inactive"` \| `"tracked"` | Role for this spec; `tracked` requires `mainSpecPending` |

### Tracking Multiple Specs Per Character

Each character can declare multiple specs with a `role` per entry:

- **`"main"`** — the primary spec. Exactly one per character. Pre-selected on page load, and the spec used for the M+ score in the Characters Summary table.
- **`"offspec"`** — a secondary spec. Data is fetched and shown when the user toggles to it using the spec toggle in the header.
- **`"inactive"`** — not fetched, not displayed. Useful as a placeholder to re-activate later by changing the role.

A confirmed character must have exactly one `"main"` spec. Inactive specs cost nothing at build time. A character with `mainSpecPending: true` instead uses `tracked` roles, has no confirmed main, and keeps both specs available in the UI. The snapshot's legacy `mainSpecSlug` field is then only an initial navigation fallback, not a main-spec decision.

Raider.IO scores, ranks, recent runs and best runs are character-wide, and are labelled accordingly. Equipped gear is the current profile snapshot. Talent data is shown only for the matching current spec; the collector does not copy one spec's loadout to another.

### Adding a Second Character

```json
{
  "characters": [
    {
      "name": "Hxwl",
      "realm": "Draenor",
      "region": "eu",
      "class": "Shaman",
      "default": true,
      "specs": [
        { "spec": "Elemental", "role": "main" },
        { "spec": "Enhancement", "role": "offspec" }
      ]
    },
    {
      "name": "Howlbear",
      "realm": "Twisting Nether",
      "region": "eu",
      "class": "Druid",
      "default": false,
      "specs": [
        { "spec": "Guardian", "role": "main" },
        { "spec": "Restoration", "role": "offspec" }
      ]
    }
  ]
}
```

## GitHub Actions Deployment

The workflow in `.github/workflows/refresh.yml` is prepared for on-demand runs. Scheduled runs additionally require `ENABLE_SCHEDULED_REFRESH=true`; deployment additionally requires `ENABLE_PUBLIC_DEPLOY=true` and the `github-pages` environment. Keep these disabled until the owner approves setup. It:

1. Runs unit tests
2. Fetches live data from Raider.IO and WarcraftLogs
3. Validates the generated `snapshot.json`
4. Builds the static site
5. Runs Lighthouse CI (95 Performance, 100 Accessibility/Best Practices/SEO)
6. Saves a build artifact; deploys to the `gh-pages` branch only when explicitly enabled

### Required GitHub Secrets

| Secret | Description |
|---|---|
| `WCL_CLIENT_ID` | WarcraftLogs OAuth client ID |
| `WCL_CLIENT_SECRET` | WarcraftLogs OAuth client secret |
| `WCL_CURRENT_RAID_HINT` | Optional: current raid tier name substring (e.g. `VS / DR / MQD`) |
| `WCL_CURRENT_MPLUS_HINT` | Optional: current M+ season name substring (e.g. `Mythic+ Season 1`) |

The hint env vars let you pin the current tier without a code change when a new patch drops.

### GitHub Pages Setup

1. In your repo settings, go to **Pages**
2. Set source to **Deploy from a branch**, branch `gh-pages`, folder `/`
3. Set `DEPLOY_BASE_PATH` to `/your-repository/` (or `/` for a root/custom-domain site). The same path is used by Vite, the service worker, and Lighthouse. The workflow defaults to the repository name.
4. After approval, enable the refresh and deployment flags. The UTC schedule is 04:00, 10:00, 16:00 and 22:00 (KST 13:00, 19:00, 01:00 and 07:00).

## Rate Limits

Only active tracked specs fetch meta. HTTP concurrency is bounded to six requests. With 13 characters and 14 active specs, actual WCL point usage must be measured after approved authentication; the original one-character estimate is not a verified budget for this configuration.

## Out of Scope (v1)

- Meta talent builds and meta gear (deferred — WarcraftLogs `characterRankings` does not include talent or gear data)
- Damage breakdown for characters with no raid logs
- Historical trend charts
- In-page character adding (config file only)
- Mixing multiple regions within one snapshot (EU and KR are supported separately)
- Blizzard API / Armory integration

## Licence

MIT
