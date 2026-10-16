# Mobile raid overview

At viewport widths up to 767px, the overview mounts a focused mobile interface. Wider viewports retain the existing full roster table and all 52 raid panels.

- Sticky controls select a character, Heroic/Mythic, and Damage/Damage to Bosses. Healers automatically show Healing. Previous/next character buttons and the full thirteen-character selector avoid scrolling through the entire roster.
- A separate compact roster tab shows all thirteen characters, fourteen tracked specs, and actual Best/Median summary percentiles for the chosen difficulty and damage metric. Healers are explicitly labelled Healing. Selecting a character returns to that character's performance.
- Each boss initially shows its name and Best/Median percentiles. A 44px-or-larger control expands Highest DPS/HPS, Kills, Fastest, All Stars points/rank, spec and the original WCL link. Expand/collapse all is also available. No data columns are removed.
- Failed, deferred, retained, empty and explicit zero-kill rows remain distinct. All Stars, partitions and collection details remain available in an expandable section. No missing values become zero or fabricated records.
- Filters scroll the selected result back below the sticky controls. Returning from the original detailed dashboard retains the selected character. Collection schedules and notices remain accessible in compact disclosure controls.

The browser QA uses the retained actual run #5 snapshot without provider requests. At 360, 390 and 430px: one active panel, thirteen summary cards/fourteen specs, no body or roster horizontal overflow, no touch targets under 44px, working all-boss disclosure, healer/DH switching and detail return. At 1440 and 1920px: all original panels, all 520 boss rows, identical paired boundaries and Damage to Bosses starting positions. Screenshots and measured results are retained locally under `verification/`.

The UI uses the already verified WCL image source; it does not replace it with another CDN. See [icon verification](spec-icons.md). Collection code, schedule, credentials and deployment workflow are unaffected by this mobile change.
