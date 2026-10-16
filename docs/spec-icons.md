# Specialization icon source

The original icon URL used `/img/warcraft/specs/{Class}-{Spec}.jpg`. This directory was guessed and was incorrect. The corrected directory is `/img/warcraft/icons/`, based on these independently published integration implementations:

- [warcraft-learner environment](https://github.com/gpolcode/warcraft-learner/blob/be52f8bff9cabf58323dfdbd3bd7017d9341385e/frontend/src/environments/base-environment.ts) defines the spec icon root.
- [warcraft-learner spec metadata service](https://github.com/gpolcode/warcraft-learner/blob/be52f8bff9cabf58323dfdbd3bd7017d9341385e/frontend/src/app/domains/raid-analysis/data/data-files/spec-meta-service.ts) builds `{Class}-{Spec}.jpg` from its spec metadata.
- [warcraftlog-blamer PlayerInfo](https://github.com/nkumnberlin/warcraftlog-blamer-frontend/blob/2badb7ccd3a267726c5b3bd2d6dd5d51447a379e/features/player/PlayerInfo.tsx) independently uses the same `/icons/` directory for WCL player icons.

Only known entries in this project's `ALL_SPECS` map produce an image URL. Unknown All Stars spec values use an accessible neutral placeholder instead of an invented filename. All fourteen configured specs have a checked URL shape; both DemonHunter and DeathKnight preserve their canonical capitalization. Image failure preserves the 22px slot and Korean label. Changing the selected spec permits its new image to load independently of an earlier failed source.

No icon files or image-license grants are present in the original project, so no third-party image was copied into the repository. The existing image-host HTTP403 denial was not bypassed or retried through a proxy, alternate host, cookies, request headers, or a mirror. The corrected URL is based on public source metadata; image bytes from the corrected path have not been requested or verified in this local environment. A later ordinary browser check must confirm actual delivery. These images remain owned by their respective owners.

## Production and mapping checks

The parent browser verified cache deployment #7 on the public site: all fourteen specialization images loaded with `complete=true`, `naturalWidth=36`, and all 84 roster-table images loaded with zero fallbacks. The working `/icons/` delivery remains unchanged for the mobile update.

Wowhead's Arcane guide returned a robot-verification screen, so its challenge was not completed or bypassed. Mapping accuracy was instead cross-checked against the maintained [WoWAnalyzer specialization definitions](https://github.com/WoWAnalyzer/WoWAnalyzer/blob/0ffe84575780ee3d3fae9ef29f0791dd135d0fc9/src/game/SPECS.ts), which provide the exact WCL class/spec names and game specialization IDs. All fourteen registered combinations match:

| Game ID | WCL image stem |
|---|---|
| 62 | Mage-Arcane |
| 71 | Warrior-Arms |
| 577 | DemonHunter-Havoc |
| 1480 | DemonHunter-Devourer |
| 1468 | Evoker-Preservation |
| 252 | DeathKnight-Unholy |
| 269 | Monk-Windwalker |
| 266 | Warlock-Demonology |
| 258 | Priest-Shadow |
| 102 | Druid-Balance |
| 254 | Hunter-Marksmanship |
| 259 | Rogue-Assassination |
| 262 | Shaman-Elemental |
| 65 | Paladin-Holy |

The thirteen pre-Devourer standard game icon names also agree with this public [talent-calculator icon map](https://github.com/ginpachi987/wow-df-talent-calculator/blob/4543b9e0fabe3ede5d8380372206106c9ab9c040/src/data/class-list.ts). No unverified Wowhead filename was guessed for Devourer; its maintained WCL identifier and production image were verified directly as described above.
