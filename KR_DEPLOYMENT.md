# KR Azshara dashboard

This adaptation preserves the upstream GitHub Actions → static Vite build → `gh-pages` → GitHub Pages structure. It tracks the 13 KR Azshara characters in `characters.config.json`.

## Verified public data and limits

All 13 character profiles returned real Raider.IO KR/Azshara data during local verification: overall M+ score, realm/region/world ranks, recent and dungeon-best runs, equipped gear, and current-spec talents. Scores, ranks and runs are character-wide. Gear is the currently equipped set, and talents are shown only for the matching current spec. Names remain NFC Hangul and URL components are encoded once; the canonical realm slug is `azshara`.

Without WCL credentials, snapshots use `dataMode=raiderio-only`. Logs and spec meta are marked unqueried and remain empty. No sample logs or rankings are inserted. WCL character/spec query parameters and KR response filtering have mocked tests; actual WCL logs, current zones, healer HPS, KR meta samples and rate usage still require an authenticated run.

The upstream meta algorithm samples players with WCL logs, then enriches them with Raider.IO score and equipped trinkets. It is not the complete regional Raider.IO score ranking. Upstream meta talent builds, enchants and damage breakdown stubs remain deferred.

앙귀태 has Havoc and Devourer both marked `tracked`, with `mainSpecPending=true`. The first displayed spec is only an initial navigation fallback. Neither a main nor an offspec has been chosen. After the user decides, remove the pending flag and use `main`/`offspec` roles.

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

The flags are inert until set on the remote repository. The build job has `contents: read`; only the deploy job receives `contents: write`. Deployment uses the automatically provided `GITHUB_TOKEN` in the same repository. No personal access token, SSH deploy key, `pages: write`, or `id-token: write` is required for this branch-based publishing workflow. [Token permissions](https://docs.github.com/en/actions/tutorials/authenticate-with-github_token).

After the first deploy creates `gh-pages`, configure **Settings → Pages → Source: Deploy from a branch → gh-pages → /(root)**, then rerun if required. The action adds `.nojekyll`. This repository does not use `actions/deploy-pages` artifact publishing. [Pages setup](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site), [first deployment notes](https://github.com/peaceiris/actions-gh-pages#%EF%B8%8F-first-deployment-with-github_token).

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
