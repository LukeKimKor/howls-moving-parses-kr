# KR Azshara dashboard

This adaptation uses GitHub Actions → static Vite build → official Pages artifact deployment. It tracks the 13 KR Azshara characters in `characters.config.json`.

## Verified public data and limits

All 13 character profiles returned real Raider.IO KR/Azshara data during local verification: overall M+ score, realm/region/world ranks, recent and dungeon-best runs, equipped gear, and current-spec talents. Scores, ranks and runs are character-wide. Gear is the currently equipped set, and talents are shown only for the matching current spec. Names remain NFC Hangul and URL components are encoded once; the canonical realm slug is `azshara`.

Without WCL credentials, snapshots use `dataMode=raiderio-only`. Logs and spec meta are marked unqueried and remain empty. No sample logs or rankings are inserted. The owner's authenticated run #4 on 2026-10-16 retrieved raid zone 53 (10 encounters), M+ zone 55 (8 dungeons), M+ logs for all 13 characters, and raid logs for 10. Arms metadata and Demonology raid trinkets hit HTTP 429; those missing samples were not evidence of no records. The subsequent rate-limit fix requires one coordinated validation run before its live behavior can be considered verified.

The upstream meta algorithm samples players with WCL logs, then enriches them with Raider.IO score and equipped trinkets. It is not the complete regional Raider.IO score ranking. Upstream meta talent builds, enchants and damage breakdown stubs remain deferred.

앙귀태 has Havoc and Devourer both marked `tracked`, with `mainSpecPending=true`. The first displayed spec is only an initial navigation fallback. Neither a main nor an offspec has been chosen. After the user decides, remove the pending flag and use `main`/`offspec` roles.

## All-character raid overview

The default page now lists every registered character's Heroic and Mythic raid results. DPS specs have separate Damage (`dps`) and Damage to Bosses (`bossdps`) sections; Preservation Evoker and Holy Paladin have Healing (`hps`). Both DH specs remain within one character section. The existing score/runs/gear/talents/meta dashboard is available through each character's detail button.

The overview uses registered specs and WCL's default partition, rather than claiming to reproduce the screenshot's All Specs/All patch filters. Summary percentiles come directly from WCL; Kills Logged is explicitly labelled as a sum of per-boss kills. Best %, Med, DPS/HPS, All Stars points and rank are separate fields. Missing values remain dashes. Only an explicit API `totalKills=0` creates an un-killed row. Historical snapshots supply only their observed Best % and DPS/HPS; newly requested fields remain unqueried. Boss artwork is optional and falls back to a neutral marker, with spec names shown as text.

WCL's web documentation is blocked by Cloudflare in both execution environments. The authenticated Actions run makes one normal `__type(name: "CharacterPageRankingMetricType")` query, logging only the supported metric names. The new `bossdps` selection is sent only when the enum confirms it. A denied/unavailable schema remains an explicit unqueried state; no alternative access path is used. The already established dps/hps collectors continue safely. No credentials are written or logged.

The two difficulties and requested metrics are batched into one HTTP query per tracked spec (14 for this configuration, down from 28 separate raid queries), with per-alias error states. Query complexity/point usage can still grow with added metrics and must be measured during the coordinated live validation. Existing single-queue spacing, server cooldowns and run-wide 429 stop remain in effect.

Character refreshes remain four times daily. Regional meta is refreshed separately at UTC 04:00 daily, or by checking **refresh_meta** in a manual run; other runs retain the previous meta and show its timestamp. For the first combined validation after 22:35 UTC, check **refresh_meta=true** once to verify both the new raid view and the earlier Arms/Demonology recovery. Do not launch a separate schema or duplicate data run.

## Run locally

Use Node.js 22+ and pnpm 9.15.0.

```sh
pnpm install --frozen-lockfile
pnpm fetch:public
pnpm test
pnpm test:snapshot
pnpm typecheck
pnpm lint
pnpm build
pnpm preview
```

Use `DEPLOY_BASE_PATH=/howls-moving-parses-kr/` for both build and preview to match the project Pages URL. The workflow derives this base from the repository name. Root sites/custom domains use `/`.

## GitHub Actions and Pages

The prepared target is `LukeKimKor/howls-moving-parses-kr`; the expected project URL after successful publishing is `https://LukeKimKor.github.io/howls-moving-parses-kr/`.

The upstream schedule is UTC 04:00, 10:00, 16:00 and 22:00: KST 01:00, 07:00, 13:00 and 19:00 each day. `workflow_dispatch` also permits manual runs; there is no push trigger. GitHub can delay scheduled jobs, and public repositories with 60 days of inactivity can have schedules disabled. [Schedule documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).

Repository variables:

| Variable | Value after setup |
|---|---|
| `ENABLE_PUBLIC_DEPLOY` | `true` |
| `ENABLE_SCHEDULED_REFRESH` | `true` |
| `DEPLOY_BASE_PATH` | Optional; defaults to `/repository-name/` |

The build job has `contents: read`. Only the deploy job receives `pages: write` and `id-token: write`, and it permits only `refs/heads/main`. It uses the built-in workflow token/OIDC; no personal access token or code-write permission is required. [Official Pages workflow](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

Set **Settings → Pages → Source: GitHub Actions** and explicitly permit `main` in the `github-pages` environment. Preserve other environment protection settings. Deployment uses `actions/upload-pages-artifact@v4` and `actions/deploy-pages@v4` directly.

## WCL limits and partial results

OAuth and GraphQL share a single queue with at least 1.5 seconds between HTTP starts. Each query gets at most five attempts. HTTP 429 uses 30/60/120/240-second exponential delays plus additive jitter; a longer `Retry-After` (seconds or HTTP date) always takes precedence. Transient server/network errors also back off. A long cooldown or exhausted 429 retries stops further WCL requests for that run rather than starting new retry batches. This is a conservative client policy, not a claim about WCL's permitted request rate. [Retry-After semantics](https://www.rfc-editor.org/rfc/rfc9110.html#name-retry-after).

Each character source and each M+/raid meta section records `ok`, `empty`, `partial`, `failed`, or `skipped`, final query failure counts and timestamps. GraphQL partial errors count as failures even with HTTP 200. The site distinguishes failed/unqueried data from a successful empty response. CI counts tracked specs, complete/partial/failed lookups, and displayable data separately; retained data is not counted as a fresh success.

Failed sections retain a previous nonempty sample, with its original timestamp. Successful empty responses clear old records. A snapshot cache carries these public data across runs; an uncached run first reads the site's public snapshot, falling back to literal-only extraction from older public JS bundles. No bundle code executes, and no credentials are needed for this restore. WCL data are retained only for matching zones (legacy snapshots without zone IDs are accepted for seven days). Previously incomplete meta samples are fetched first; this prioritizes the incomplete Arms/Demonology samples from run #4. `public/snapshot.json` contains the same public character/meta data already embedded in the app.

After a rate-limit incident, coordinate one validation run after cooldown rather than launching repeated runs. Check Arms M+/raid and Demonology raid first, then all 13 characters and 14 tracked specs. An Actions run may deploy a partial snapshot successfully; the site warnings and Collection results summary are the data-completeness checks.

The workflow runs tests, selects the appropriate data mode, validates the generated snapshot, checks TypeScript and lint, builds, and uploads the reviewed build before deployment. Manual runs also retain the upstream Lighthouse checks (performance 90, accessibility 95, best practices 100; SEO is excluded). Data refreshes change the build hash even without code commits; the service worker checks for updates on tab focus and every five minutes.

## WCL registration and secure input

The owner must create and enter credentials directly; do not paste values into chat or source code.

1. Open [WCL Manage Your Clients](https://www.warcraftlogs.com/api/clients/) and choose **Create Client**.
2. Use an identifiable app name, leave **Public Client unchecked** as instructed by upstream, and enter a valid HTTPS Redirect URL. The final Pages URL can be used. The `client_credentials` flow does not invoke the redirect.
3. Add `WCL_CLIENT_ID` and `WCL_CLIENT_SECRET` under repository **Settings → Secrets and variables → Actions → New repository secret**. `GITHUB_TOKEN` is automatic and must not be entered manually. [Secrets documentation](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets).
4. Trigger the workflow, confirm it selects full mode, and verify actual KR logs, both DH specs, healer HPS, current zones, meta sampling and rate usage. Optional overrides are `WCL_CURRENT_RAID_ZONE_ID`, `WCL_CURRENT_RAID_HINT`, and `WCL_CURRENT_MPLUS_HINT`.

The collector uses public `/api/v2/client` data. It does not request user authorization-code access, private-report access, upload permissions or a refresh token. [WCL OAuth/API documentation](https://www.warcraftlogs.com/api/docs).

With neither WCL Secret configured, `pnpm fetch:refresh` safely refreshes only public Raider.IO data; once both are supplied it selects full mode. A partially configured pair fails rather than silently hiding a mistake. Explicit `pnpm fetch:data` always requires WCL; explicit `pnpm fetch:public` never authenticates to WCL.

Direct setup links after repository creation: [Pages](https://github.com/LukeKimKor/howls-moving-parses-kr/settings/pages), [Secrets](https://github.com/LukeKimKor/howls-moving-parses-kr/settings/secrets/actions), [Variables](https://github.com/LukeKimKor/howls-moving-parses-kr/settings/variables/actions), [workflow runs](https://github.com/LukeKimKor/howls-moving-parses-kr/actions/workflows/refresh.yml).
