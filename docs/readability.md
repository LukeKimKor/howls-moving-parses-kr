# Right navigation and readable type

The owner requested that the fixed PC table of contents move to the right and text feel similar to, or slightly larger than, [erinndata.pages.dev](https://erinndata.pages.dev/). The selected A design, Pretendard-derived glyphs, colors, underlying records and collection behavior are retained.

The reference home and dashboard were opened read-only in an isolated Chrome at 1440px. Computed styles were measured after its fonts loaded: home body 14px, dashboard body 16px, navigation 13px, dashboard controls 15px, dashboard section headings 16px, and main titles 22–28px. No form, account or publishing action was used.

| Dashboard element | Previous | Updated |
|---|---:|---:|
| Desktop body | 13px | 16px |
| Desktop table values | 12px | 16px |
| Table column labels | 11px | 14px |
| Page title | 27px | 32px |
| Character heading | 19px | 24px |
| Fixed menu links | 12px | 15px |
| Mobile boss names / percentiles | 14px / 15px | 16px / 17px |
| Mobile score summary | 21px | 25px |

At 1440px and wider, the right menu is 208px wide and the content reserves 252px on that side, including the gap. At 1800px and wider, difficulty panels use two columns; below that breakpoint they stack with wider tables instead of shrinking text. Desktop rows are 60px high, headings have more line space, and fully empty status/ranking slots collapse equally across each pair. The roster summary keeps readable values and its existing contained scrolling on narrower tablet widths. Phones retain their focused character/spec/difficulty/metric navigation with at least 44px controls.

There are no API, source snapshot, character configuration, font binary or performance-gate changes in this update. The optimized UI font core and official fallback glyph subsets remain in place.

Validation used the existing real cached snapshot: all 520 rows matched their source values. At 1440/1920px the menu stayed fixed on the right with a reserved gap and no overlap; there was no table clipping or horizontal overflow. Mobile 360/390/430px navigation, disclosures and specialization switching passed, as did the additional 768/1024/1799/1800px layout boundaries. Lighthouse 13.5 default cold mobile runs scored 98/98/98 (accessibility and Best Practices 100), with the same single 97KB font request. The performance threshold remains 90. Unit tests (227), snapshot checks (23), typecheck, lint and build passed.
