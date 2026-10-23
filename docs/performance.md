# Font loading performance regression

Deployment [#9](https://github.com/LukeKimKor/howls-moving-parses-kr/actions/runs/38990637241) stopped at the unchanged Lighthouse performance threshold: 59/75/74, average 69, against a minimum of 90. Accessibility and Best Practices were 100; SEO was 63 because the dashboard intentionally uses noindex/nofollow. Deployment was skipped.

The failed run did not retain detailed JSON reports: the report upload step followed the failed assertion with the implicit success condition. It now uses `always()` for manual runs, so future failed checks retain diagnostics. Collection, the three-run measurement, thresholds (90/95/100), and the deployment success dependency are unchanged.

## Controlled local reproduction

The published-source build was frozen before optimization and measured with Lighthouse **13.5.0**, Headless Chrome **155**, Windows, the default mobile viewport 412×823 / DPR 1.75, simulated 150ms RTT / 1,638.4Kbps throughput, and 4× CPU slowdown. These are the same default Lighthouse mobile settings used by the workflow, with an OS/host difference from the Linux runner. Each run used a fresh Chrome profile and the existing real snapshot; there were no provider API requests.

| Build | Performance, three runs | LCP | First paint | Blocking time | Layout shift |
|---|---|---|---|---|---|
| Whole-font preload | 75 / 75 / 75 | 11.71–11.73s | 1.41–1.43s | 1–16ms | 0 |
| Official split files only (intermediate) | 92 / 76 / 92 | 2.87–4.37s | 2.50–3.92s | 0ms | <0.001 |
| UI core + original fallback subsets | **98 / 98 / 98** | **2.19–2.26s** | **1.52–1.53s** | **0ms** | **0** |

The original UI requested a 2,057,688-byte full variable font on every cold navigation. The controlled reproduction identified font transfer and Korean text LCP as the bottleneck; low blocking time did not justify changing the fixed navigation or rendering fewer records. Merely splitting the font still requested 16 files / roughly 449KB, so it lacked reliable margin above the gate.

The final build preloads one 96,944-byte core (roughly 97KB with HTTP headers), a 95.3% reduction from the full font. The observed LCP element was the Korean season/character summary text. The selected A layout, all records and typography weights remain intact.

## Font provenance and coverage

The UI core is generated from the official Pretendard 1.3.9 variable font with fontTools 4.67.0 and Brotli 1.2.0. It keeps the code points used by UI sources (including the collector display-message module `src/lib/collection-messages.ts`) and registered names: 428 code points / 98,492 bytes as of 2026-10-23 stage 4 (previously 424 / 97,736 bytes after the detail-page glyphs were dropped and collector-message glyphs added, and 449 / 101,460 bytes before that). The stage-4 labels (boss-table fold button, kill-count and All Stars notes, retained-value mark, new-version banner) added four glyphs; a local mobile Lighthouse 13.5.0 run measured 99/100/100 three times with no fallback subset request on first load. Text that reaches the screen only through the snapshot (warnings and collection issues) must therefore come from that module, or it falls back to the subsets below. OpenType features including tabular numerals, hinting and weight axes 45–920 are preserved; 180 outline/advance comparisons at weights 400/500/650/700 match the original. The modified subset is renamed **HMP Dashboard Sans** to comply with the OFL Reserved Font Name condition, and the full original copyright/license remains bundled.

All 92 unmodified official dynamic subsets remain self-hosted as fallback for any glyph absent from the core, including future data. Their hashes match the pinned upstream release. No font CDN, browser sniffing, hidden content, reduced performance threshold, disabled audit, or provider collection is used.

The font is committed as a generated asset, so routine CI/data refresh does not need Python or font tools. To rebuild the core manually, install the pinned `scripts/fonts/requirements.txt` in an isolated development directory, obtain the official source font recorded in the manifest, and run `scripts/fonts/build-core.py --source <source.woff2> --tools <isolated-directory>`.

For reproduction use the workflow command (`pnpm dlx lighthouse@13.5.0` with its default mobile configuration), three cold-profile runs, and the same real cached data. As of 2026-10-23, both workflow jobs use `ubuntu-24.04` to avoid automatic OS migration; Chrome and other image tools still receive updates. Routine builds use the committed font and do not run Python. Linux CI remains the final deployment gate; local results are evidence, not a claim that the site is already deployed.
