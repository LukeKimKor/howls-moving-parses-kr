# Korean presentation labels

The application is called **와우 대시보드** / **내캐릭 로그관리**. This change localizes presentation labels, accessibility names, class/spec labels and verified encounter names. Source snapshot strings, IDs, API enum values, lookup keys and profile URLs remain unchanged. No provider API collection is part of the preview work.

## Verified encounter names

| Source name | Korean display | Individual raid |
|---|---|---|
| Nek'zali the Soulcoiler | 영혼살무사 네크잘리 | 맹독 심연 |
| Entombed Sentinels | 매장된 파수꾼 | 맹독 심연 |
| Vashnik the Malignant | 악성의 바쉬니크 | 맹독 심연 |
| The Lost Explorers | 길 잃은 탐험가 | 맹독 심연 |
| Sszorak | 스조라크 | 맹독 심연 |
| The Twin Fangs | 쌍둥이 송곳니 | 맹독 심연 |
| The Coiled Altar | 똬리의 제단 | 맹독 심연 |
| Ula'tek | 울라텍 | 맹독 심연 |
| Nymrissa Wavecaller | 님리사 웨이브콜러 | 해일결속 동굴 |
| Kith'ix | 키식스 | 키식스 해방 |

Sources supplied and verified by the parent:

- [Blizzard Korean raid achievements](https://worldofwarcraft.blizzard.com/ko-kr/worldsoul/kr/armory/character/azshara/한설아/achievements/dungeons-raids/midnight-raid) confirms the eight Venomous Abyss encounters and official spacing.
- [Blizzard Korean achievements including Nymrissa](https://worldofwarcraft.blizzard.com/ko-kr/worldsoul/kr/armory/character/azshara/셧더마우스/achievements/dungeons-raids/midnight-raid).
- [Blizzard Korean 12.1.5 news](https://news.blizzard.com/ko-kr/article/24295093/12-1-5) confirms Kith'ix.
- [Blizzard Korean Venomous Abyss announcement](https://news.blizzard.com/ko-kr/article/24294062) and [Tidebound Grotto announcement](https://news.blizzard.com/ko-kr/article/24295085) provide the individual raid context.

The source WCL zone currently groups ten encounters under one zone name. The overview therefore labels this **season-integrated raid data**, with the three individual raid names shown separately; no query classification was changed.

## Metrics, missing values and icons

Best and Median are **highest / median ranking percentiles**, not average DPS. The summary values retain the source's performance-percentile averages. Highest DPS/HPS is separately labelled highest damage/healing per second. A numeric zero remains zero; null/undefined remains unknown. Specialization images are omitted only from data cells without either percentile, not from spec-selection controls.

Boss artwork has been removed consistently because only two icon stems were independently identified; no unverified artwork was guessed. Working specialization images remain unchanged.

Unverified dynamic source names (equipment, individual talent/spell names and any unmapped dungeon names) remain verbatim instead of receiving guessed translations. Their source data are retained in full. The UI labels around those values are localized. These data-name gaps are tracked separately from the completed interface-label work.

## Local design proposals

The owner selected proposal A, the dense dark analysis layout, and requested Pretendard typography. Its production styles are `src/raid-analysis.css` and `src/typography.css`; see [font origin and license](typography.md). The B proposal and original comparison files remain local under `verification/korean-design/` and are not deployed. The verification screenshots use the actual published snapshot, not synthetic performance values.
