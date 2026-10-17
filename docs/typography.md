# Selected A layout and typography

The owner selected proposal A: a compact dark analysis layout with 46px desktop rows and a fixed PC table of contents. The previous Korean interface, verified encounter names and missing-data icon rules are included. Mobile character/spec/difficulty/metric selection and detailed panels remain available.

Pretendard Variable **1.3.9** is redistributed unmodified from the [official release](https://github.com/orioncactus/pretendard/tree/v1.3.9). Its official Git blob is `49c54b5152a184a243e85f7281ed338b6569987e`. The font is self-hosted under `public/fonts/`, with the complete original copyright notice and [SIL OFL 1.1 license](../public/fonts/OFL-Pretendard.txt) next to it. No font package or system font is installed, and the application does not contact a font CDN.

`src/typography.css` declares the original variable weight range (45–920), uses `font-display: swap`, and retains platform fallback fonts. Body copy uses weight 400, table/navigation labels 500, headings and numeric summaries 650, and the page title 700. Numeric values use `tabular-nums lining-nums`; Korean labels keep whole words where possible. No source data, API identifiers, collection settings, credentials or scheduled refresh policy are changed.

The production build contains the selected layout directly. The discarded B proposal and old comparison screenshots remain local verification artifacts and are not deployed.

Character sections use their actual layout height so native table-of-contents links remain accurate after font loading; the former estimated offscreen height could land a link on the preceding character. The scroll position indicator also handles a short final section at the bottom of the page.
