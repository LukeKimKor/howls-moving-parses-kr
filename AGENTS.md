# 관리자 안내 (Howl's Moving Parses KR)

이 저장소는 사이트 주인의 와우 대시보드다. 에이전트는 이 사이트의 관리자로서 업데이트와 유지보수를 맡는다.
이 파일과 `AGENTS.md`(Codex용)는 같은 내용을 유지한다. 한쪽을 고치면 다른 쪽도 똑같이 고친다.

- 사이트: https://lukekimkor.github.io/howls-moving-parses-kr/
- 저장소(push 대상): `https://github.com/LukeKimKor/howls-moving-parses-kr` (`origin`, 주인의 포크)
- 세부 결정 사항: [docs/admin-guidelines.md](docs/admin-guidelines.md) — 화면·데이터·디자인 기준은 이 문서가 우선한다. 결정이 바뀌면 이 문서부터 고친다.

## 작업 규칙

1. **작업 시작 전 `git pull`**, 작업이 끝나면 커밋 후 push한다.
2. **push 전에 변경 내용을 주인에게 요약하고 확인받는다.** 코드·화면 변경을 main에 push하면 곧바로(10~20분 안에) 공개 사이트에 배포되기 때문이다(아래 "빌드·배포" 참고). 주인이 그 작업에서 push를 명시적으로 지시한 경우에만 확인 없이 push한다.
3. **비밀값은 절대 커밋하지 않는다.** WCL Client ID/Secret은 GitHub Secrets에만 있다. `.env`는 git 제외 대상이며, 채팅·코드·문서·로그에 값을 적지 않는다. 커밋 전 `git diff --cached`로 확인한다.
4. 커밋 메시지는 Conventional Commits 형식(`feat(scope): ...`, `docs: ...` 등). lefthook `commit-msg` 훅이 검사한다. 무엇을, 왜 바꿨는지 적는다.
5. 변경 후 `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`를 모두 통과시킨다. 화면을 바꾸면 데스크톱(1440px)·모바일(390px)을 확인하고 Lighthouse(성능 90, 접근성 95, 권장사항 100)를 로컬에서 측정한다.
6. 의미 있는 변경은 `docs/admin-guidelines.md`의 "변경 기록"에 날짜와 함께 남긴다.

## 화면·데이터 핵심 규칙

- **종합 현황판 핵심 지표**: WCL 최고 % / 중앙 %, Raider.IO 쐐기 점수, 아이템 레벨. (그 밖에 영웅·신화 처치 수, All Stars 점수·순위도 표시 중 — 세부는 admin-guidelines)
- **화면은 탭으로 분리**: 종합 현황(`#overview`, 기본) / 레이드 로그(`#raid`) / 쐐기(`#mplus`). 새 화면도 탭 구조 안에 둔다. 캐릭터 상세 화면은 없다(이름은 일반 글자, 자세한 기록은 WCL·RIO 링크). 모바일(767px 이하) 레이드 로그 보스 카드는 기본으로 접고 `#raid-character-N`·바로가기로 들어오면 펼친다. 데스크톱은 모두 펼친다(docs/mobile-overview.md).
- **다크 대시보드 디자인 유지**: 배경 `#0b0f16`, 패널 `#111824`, 테두리 `#222e40`. 토큰은 `src/dashboard.css`의 `.dash`. 표 부품은 `src/components/pages/DashParts.tsx`를 재사용한다.
- **앙귀태(악마사냥꾼)는 파멸(Havoc)·포식(Devourer) 두 전문화를 동등하게 표시**한다. `mainSpecPending: true`, 두 전문화 모두 `tracked`. 어느 화면에서도 하나를 주 전문화로 취급하거나, 숨기거나, 두 값을 평균 내지 않는다.
- 없는 값을 지어내지 않는다. "기록 없음"(성공·빈 결과) / "조회 실패" / "미조회"를 구분한다.
- WCL 레이드 값은 전문화별 집계, 쐐기 점수·템렙은 캐릭터 전체 값(Raider.IO). 둘을 섞어 계산하지 않는다.
- **수집기 화면 문구는 `src/lib/collection-messages.ts`(메시지 모듈)에만 둔다.** 스냅샷의 `warnings`·`issues`처럼 수집기(`scripts/`)가 만들어 화면에 나오는 한글 문구는 이 모듈에서 가져다 쓰고, `scripts/`에 한글 문자열을 직접 쓰지 않는다(테스트가 검사한다). 외부 API 오류 메시지를 화면 문구로 넘기지 않으며, 시각은 `… KST` 형식으로 표시한다. 문구를 바꾸면 코어 폰트를 다시 만든다.
- 새 한글 UI 문구를 넣거나 **캐릭터 이름을 바꾸거나 추가하면** 코어 폰트(`public/fonts/HmpDashboardSansCore.woff2`)를 `scripts/fonts/build-core.py`로 다시 만든다. 코어 폰트에 없는 글자가 화면에 나오면 추가 폰트를 받느라 Lighthouse 성능 기준(90)에 걸려 배포가 멈춘다(docs/performance.md).
  - 이 PC에는 Python 3.12가 설치되어 있다. fontTools는 임시 폴더에 설치한다: `python -m pip install --target <임시폴더> -r scripts/fonts/requirements.txt`
  - 원본: `https://github.com/orioncactus/pretendard/raw/v1.3.9/packages/pretendard/dist/web/variable/woff2/PretendardVariable.woff2` (스크립트가 git blob SHA `49c54b5…`를 검증한다)
  - 실행: `python -I scripts/fonts/build-core.py --source <원본.woff2> --tools <임시폴더>`
  - 확인: `core-manifest.json`의 `unicodes`에 모든 캐릭터 이름 글자가 들어 있는지 본다.
  - Git Bash에서는 `DEPLOY_BASE_PATH=/howls-moving-parses-kr/`가 Windows 경로로 바뀌므로 로컬 빌드·Lighthouse 측정은 PowerShell에서 한다.

## 저장소 구조

| 경로 | 내용 |
|---|---|
| `characters.config.json` | 추적 캐릭터 13명(KR 아즈샤라, `realmSlug: azshara`)과 전문화. 캐릭터 추가·삭제·전문화 변경은 이 파일만 고친다 |
| `scripts/` | 빌드 시 데이터 수집기(Node + tsx). `fetch-data.ts`(수집 본체), `refresh-data.ts`(WCL Secret 유무로 모드 선택), `wcl-transport.ts`·`wcl-runtime.ts`·`wcl-query-cache.ts`(WCL 요청 큐·한도·캐시), `raid-performance.ts`, `raid-patch-metadata.ts`, `restore-snapshot.ts`(이전 공개 스냅샷 복원), `fonts/`(코어 폰트 생성) |
| `src/` | React 18 + TypeScript 앱. `App.tsx`, `components/pages/`(`DashboardPage` 탭 틀과 탭 화면 `RosterOverview`, `RaidLogTab`, `MythicPlusOverview`, 공통 표 부품 `DashParts`), `components/chrome/`(`NewBuildBanner`), `components/primitives/`, `lib/`(`roster.ts`, `raid-overview.ts`, `all-stars.ts`, `ko.ts` 한글 라벨 등), `types/snapshot.ts`(스냅샷 스키마), `sw.ts`(새 빌드 알림 서비스 워커) |
| `src/data/snapshot.json` | 수집 결과(빌드에 포함). **git 제외**, 커밋하지 않는다 |
| `docs/` | 관리 지침과 세부 정책(refresh-policy, all-stars, performance, typography 등) |
| `.github/workflows/refresh.yml` | 수집·검증·빌드·배포 워크플로 |
| `README.md`, `KR_DEPLOYMENT.md` | 원본(upstream) 설명과 KR 배포 기록 |

## 데이터 소스

- **Raider.IO** (공개 API, 키 불필요): 쐐기 점수, 서버/지역/세계 순위, 던전별 최고 기록, 장비(템렙). 캐릭터 단위 값. 동시 요청 6개 제한. 최근 기록·특성은 수집하지 않는다.
- **Warcraft Logs** (GraphQL `/api/v2/client`, OAuth `client_credentials`): 전문화별 레이드 백분위(최고·중앙), 처치 수, DPS/우두머리 DPS/HPS, All Stars 점수·순위와 공식 패치 정보. `WCL_CLIENT_ID`/`WCL_CLIENT_SECRET` 필요. 상세 화면 전용 지역 메타·쐐기 로그·피해 구성·레이드 날짜는 수집하지 않는다. 옛 스냅샷은 읽되 새 결과에는 상세 전용 필드를 다시 쓰지 않는다.
  - 요청 간격 1.5초 이상, `rateLimitData`로 예산 관리(20% 예비). 429를 받으면 Retry-After를 저장하고 그 실행은 중단 — **한도 초과 뒤 재시도 실행을 반복하지 않는다**(docs/refresh-policy.md).
  - 선택 환경변수: `WCL_CURRENT_RAID_ZONE_ID`, `WCL_CURRENT_RAID_HINT`, `WCL_CURRENT_MPLUS_HINT`(새 패치 때 현재 레이드/시즌 고정).
- 실패한 구간은 이전 데이터를 원래 시각과 함께 유지하고, 성공한 빈 결과는 이전 데이터를 지운다.

## 빌드·배포

- 도구: Node 22+, pnpm 9.15.0, Vite 6, Vitest, Biome, Lefthook.
- 로컬:
  - `pnpm install --frozen-lockfile`
  - `pnpm fetch:public` (Raider.IO만, 키 불필요) 또는 `pnpm fetch:data` (`.env`의 WCL 키 필요)
  - `pnpm test` / `pnpm test:snapshot` / `pnpm typecheck` / `pnpm lint` / `pnpm build` / `pnpm preview`
  - 프로젝트 Pages 경로에 맞추려면 빌드·미리보기 모두 `DEPLOY_BASE_PATH=/howls-moving-parses-kr/`.
- GitHub Actions `Refresh Data & Deploy` (`.github/workflows/refresh.yml`):
  - 트리거와 수집 모드(`Select refresh scope` 단계에서 결정):

    | 트리거 | 모드 | 외부 API |
    |---|---|---|
    | main push — 코드·화면 변경 | `cache`: 마지막 스냅샷으로 화면만 다시 빌드, 데이터 시각 유지 | 호출 없음 |
    | main push — `characters.config.json` 변경 포함, 또는 설정의 캐릭터가 마지막 스냅샷에 없음(이전 push에서 이름을 바꾼 뒤 아직 수집 전 등) | `characters`: 새·바뀐 캐릭터 데이터를 받아야 하므로 | 호출 |
    | main push — `docs/**`, `*.md`만 변경 | 실행 안 함 | — |
    | 예약 UTC 04·10·16·22시 (KST 13·19·01·07시) | 모두 `characters` | 호출 |
    | 수동 `workflow_dispatch` | 선택한 모드(characters / cache / patches), 이전 meta/all 요청은 characters로 호환 | cache 외 호출 |

  - 순서: 테스트 → 캐시·이전 공개 스냅샷 복원 → 모드 선택 → `pnpm fetch:refresh` → 스냅샷 검증 → typecheck → lint → build → (예약 실행 외) Lighthouse → Pages artifact 업로드 → `deploy` 잡이 main에서만 GitHub Pages 배포. 어느 단계든 실패하면 배포하지 않는다.
  - 저장소 변수 `ENABLE_SCHEDULED_REFRESH=true`, `ENABLE_PUBLIC_DEPLOY=true`가 켜져 있어, **main에 push한 코드·화면 변경은 곧바로 공개 사이트에 배포된다.**
  - 수집기(`scripts/`)나 스냅샷 형식을 바꾼 경우 `cache` 빌드로는 새 데이터가 생기지 않는다. push 후 주인 승인하에 수동으로 `characters` 모드를 실행한다. `refresh_meta` 입력과 `REFRESH_META`는 더 이상 사용하지 않는다. WCL 한도 때문에 수동 실행을 짧은 간격으로 반복하지 않는다.
  - 실행은 하나씩만 돈다(`concurrency`). 기다리는 실행이 있을 때 새 실행이 들어오면 기다리던 것은 취소되고 최신 것만 남는다.
  - 빌드 잡은 `contents: read`, 배포 잡만 `pages: write`·`id-token: write`.
