# Specialization icon source

The original icon URL used `/img/warcraft/specs/{Class}-{Spec}.jpg`. This directory was guessed and was incorrect. The corrected directory is `/img/warcraft/icons/`, based on these independently published integration implementations:

- [warcraft-learner environment](https://github.com/gpolcode/warcraft-learner/blob/be52f8bff9cabf58323dfdbd3bd7017d9341385e/frontend/src/environments/base-environment.ts) defines the spec icon root.
- [warcraft-learner spec metadata service](https://github.com/gpolcode/warcraft-learner/blob/be52f8bff9cabf58323dfdbd3bd7017d9341385e/frontend/src/app/domains/raid-analysis/data/data-files/spec-meta-service.ts) builds `{Class}-{Spec}.jpg` from its spec metadata.
- [warcraftlog-blamer PlayerInfo](https://github.com/nkumnberlin/warcraftlog-blamer-frontend/blob/2badb7ccd3a267726c5b3bd2d6dd5d51447a379e/features/player/PlayerInfo.tsx) independently uses the same `/icons/` directory for WCL player icons.

Only known entries in this project's `ALL_SPECS` map produce an image URL. Unknown All Stars spec values use an accessible neutral placeholder instead of an invented filename. All fourteen configured specs have a checked URL shape; both DemonHunter and DeathKnight preserve their canonical capitalization. Image failure preserves the 22px slot and Korean label. Changing the selected spec permits its new image to load independently of an earlier failed source.

No icon files or image-license grants are present in the original project, so no third-party image was copied into the repository. The existing image-host HTTP403 denial was not bypassed or retried through a proxy, alternate host, cookies, request headers, or a mirror. The corrected URL is based on public source metadata; image bytes from the corrected path have not been requested or verified in this local environment. A later ordinary browser check must confirm actual delivery. These images remain owned by their respective owners.
