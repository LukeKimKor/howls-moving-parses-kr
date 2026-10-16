import { useEffect, useState } from "react";
import { CharacterSelect } from "./components/chrome/CharacterSelect.js";
import { CharacterSpecToggle } from "./components/chrome/CharacterSpecToggle.js";
import { NewBuildBanner } from "./components/chrome/NewBuildBanner.js";
import { SpecSelect } from "./components/chrome/SpecSelect.js";
import { LandingPage } from "./components/pages/LandingPage.js";
import { RaidOverviewPage } from "./components/pages/RaidOverviewPage.js";
import { CharactersSummaryPanel } from "./components/panels/CharactersSummaryPanel.js";
import { GearSnapshotPanel } from "./components/panels/GearSnapshotPanel.js";
import { LogPerformancePanel } from "./components/panels/LogPerformancePanel.js";
import { MythicPlusLeaderboardPanel } from "./components/panels/MythicPlusLeaderboardPanel.js";
import { MythicPlusMetaGearPanel } from "./components/panels/MythicPlusMetaGearPanel.js";
import { MythicScorePanel } from "./components/panels/MythicScorePanel.js";
import { RaidMetaGearPanel } from "./components/panels/RaidMetaGearPanel.js";
import { RecentRunsPanel } from "./components/panels/RecentRunsPanel.js";
import { TalentSnapshotPanel } from "./components/panels/TalentSnapshotPanel.js";
import {
	CollectionNotice,
	collectionFailureMessage,
} from "./components/primitives/CollectionNotice.js";
import { AppStateProvider, useAppState } from "./contexts/AppStateContext.js";
import { ALL_SPECS } from "./data/specs.js";
import { formatDateUtc } from "./lib/format.js";
import { characterProfileUrl } from "./lib/regions.js";
import type { CharacterData, Snapshot } from "./types/snapshot.js";

// Only App.tsx may import snapshot.json
import snapshotRaw from "./data/snapshot.json";

const snapshot = snapshotRaw as unknown as Snapshot;

const STORAGE_KEY = "hmp.defaultCharacter";

function getStoredCharacter(characters: CharacterData[]): CharacterData | null {
	try {
		const name = localStorage.getItem(STORAGE_KEY);
		if (!name) return null;
		return characters.find((c) => c.name === name) ?? null;
	} catch {
		return null;
	}
}

function saveCharacter(name: string): void {
	try {
		localStorage.setItem(STORAGE_KEY, name);
	} catch {}
}

function AppInner({ onSelectCharacter }: { onSelectCharacter: (name: string) => void }) {
	const {
		selectedCharacterName,
		setSelectedCharacter,
		activeSpecSlugForCharacter,
		selectedMetaSpecSlug,
	} = useAppState();
	useEffect(
		() => onSelectCharacter(selectedCharacterName),
		[onSelectCharacter, selectedCharacterName],
	);

	const [newBuildVisible, setNewBuildVisible] = useState(false);

	useEffect(() => {
		if (!("serviceWorker" in navigator)) return;
		const handler = (event: MessageEvent) => {
			if ((event.data as { type: string })?.type === "NEW_BUILD_AVAILABLE") {
				setNewBuildVisible(true);
			}
		};
		navigator.serviceWorker.addEventListener("message", handler);
		return () => navigator.serviceWorker.removeEventListener("message", handler);
	}, []);

	const foundChar = snapshot.characters.find(
		(c: CharacterData) => c.name === selectedCharacterName,
	);
	const firstChar = snapshot.characters[0];
	if (!foundChar && !firstChar) throw new Error("No characters in snapshot");
	const character = (foundChar ?? firstChar) as CharacterData;

	const activeSlug = character.specs[activeSpecSlugForCharacter]
		? activeSpecSlugForCharacter
		: character.mainSpecSlug;
	const specData = character.specs[activeSlug];
	const specDef = ALL_SPECS.find((s) => s.specSlug === activeSlug);
	const metaDef = ALL_SPECS.find((s) => s.specSlug === selectedMetaSpecSlug);
	const metaData = snapshot.specs[selectedMetaSpecSlug];

	function handleSelectCharacter(name: string) {
		const char = snapshot.characters.find((c: CharacterData) => c.name === name);
		if (char) {
			setSelectedCharacter(char.name, char.mainSpecSlug);
			onSelectCharacter(char.name);
		}
	}

	return (
		<div className="page-wrap">
			<header className="site-header">
				<h1>Howl&apos;s Moving Parses</h1>
				<div className="header-right">
					<small className="updated-date">
						Updated: {formatDateUtc(snapshot.generatedAt, snapshot.region)}
					</small>
					<CharacterSelect characters={snapshot.characters} />
				</div>
			</header>

			<NewBuildBanner
				visible={newBuildVisible}
				onRefresh={() => window.location.reload()}
				onDismiss={() => setNewBuildVisible(false)}
			/>
			{snapshot.warnings?.map((message) => (
				<output className="data-notice" key={message}>
					{message}
				</output>
			))}

			<div className="character-bar">
				<div className="character-identity">
					<strong className="character-name">{character.name}</strong>
					<span className="character-meta">
						{specDef?.specName} {character.class} · {character.realm} (
						{character.region.toUpperCase()})
					</span>
					{character.mainSpecPending && (
						<small>주 전문화 미확정 · Havoc / Devourer 동시 추적</small>
					)}
					<CharacterSpecToggle character={character} />
					<span className="profile-links">
						<a
							href={characterProfileUrl(
								"rio",
								character.region,
								character.realmSlug ?? character.realm,
								character.name,
							)}
							target="_blank"
							rel="noopener noreferrer"
						>
							Raider.IO
						</a>
						{" · "}
						<a
							href={characterProfileUrl(
								"wcl",
								character.region,
								character.realmSlug ?? character.realm,
								character.name,
							)}
							target="_blank"
							rel="noopener noreferrer"
						>
							WarcraftLogs
						</a>
					</span>
				</div>
				<CharactersSummaryPanel
					characters={snapshot.characters}
					generatedAt={snapshot.generatedAt}
					onSelectCharacter={handleSelectCharacter}
				/>
			</div>

			<main>
				<div className="grid">
					<section aria-label={`${character.name} — ${specData?.specName ?? ""}`}>
						<MythicScorePanel data={specData?.mythicPlus ?? null} />
						<RecentRunsPanel
							recentRuns={specData?.mythicPlus?.recentRuns ?? []}
							bestRuns={specData?.mythicPlus?.bestRuns ?? []}
						/>
						<LogPerformancePanel
							key={`${character.name}/${activeSlug}`}
							unavailableReason={
								snapshot.dataMode === "raiderio-only"
									? "WCL 인증 전: 레이드·쐐기 로그를 아직 조회하지 않았습니다."
									: (collectionFailureMessage(specData?.collection?.raid) ??
										collectionFailureMessage(specData?.collection?.mythicPlus))
							}
							raidUnavailableReason={collectionFailureMessage(specData?.collection?.raid)}
							mplusUnavailableReason={collectionFailureMessage(specData?.collection?.mythicPlus)}
							data={specData?.logs ?? null}
							metric={specDef?.role === "healer" ? "hps" : "dps"}
						/>
						<CollectionNotice label="Raider.IO 캐릭터" status={specData?.collection?.raiderio} />
						<CollectionNotice label="레이드 로그" status={specData?.collection?.raid} />
						<CollectionNotice label="쐐기 로그" status={specData?.collection?.mythicPlus} />
						<CollectionNotice label="레이드 로그 날짜" status={specData?.collection?.raidDates} />
						<GearSnapshotPanel data={specData?.gear ?? null} />
						<TalentSnapshotPanel data={specData?.talents ?? null} />
					</section>

					<section
						aria-label={`${metaDef?.specName ?? ""} ${metaDef?.classDisplayName ?? ""} meta`}
					>
						<SpecSelect />
						<p className="meta-source-note">
							{metaData?.sourceNote ??
								(snapshot.dataMode === "raiderio-only"
									? "전문화 메타는 WCL 인증 후 수집됩니다."
									: "이 전문화는 추적 설정에 포함되지 않아 메타를 조회하지 않았습니다.")}
						</p>
						<CollectionNotice label="쐐기 메타" status={metaData?.mythicPlus.collection} />
						<MythicPlusLeaderboardPanel
							leaderboard={metaData?.mythicPlus.leaderboard ?? []}
							metric={metaDef?.role === "healer" ? "hps" : "dps"}
							region={snapshot.region ?? character.region}
						/>
						<MythicPlusMetaGearPanel
							trinkets={metaData?.mythicPlus.metaGear.trinkets ?? []}
							region={snapshot.region ?? character.region}
						/>
						<RaidMetaGearPanel
							trinkets={metaData?.raid.metaGear.trinkets ?? []}
							region={snapshot.region ?? character.region}
						/>
						<CollectionNotice label="레이드 장신구 메타" status={metaData?.raid.collection} />
					</section>
				</div>
			</main>

			<footer className="site-footer">
				<small>Made with love by howlsome</small>
				<small className="footer-schedule">
					{snapshot.dataMode === "raiderio-only"
						? "Raider.IO 공개 데이터 스냅샷 · WCL 연결 대기"
						: "정적 데이터 스냅샷 · 예약 갱신 설정 시 하루 4회"}
				</small>
			</footer>
		</div>
	);
}

/** Root application component. Imports snapshot.json and provides context. */
export default function App() {
	const [view, setView] = useState<"overview" | "detail">("overview");
	const [storedChar, setStoredChar] = useState<CharacterData | null>(() =>
		getStoredCharacter(snapshot.characters),
	);
	if (view === "overview")
		return (
			<RaidOverviewPage
				snapshot={snapshot}
				initialCharacterName={storedChar?.name}
				onOpenCharacter={(character) => {
					saveCharacter(character.name);
					setStoredChar(character);
					setView("detail");
					window.scrollTo(0, 0);
				}}
			/>
		);

	if (storedChar === null) {
		return (
			<LandingPage
				characters={snapshot.characters}
				onSelect={(char) => {
					saveCharacter(char.name);
					setStoredChar(char);
				}}
			/>
		);
	}

	return (
		<AppStateProvider
			defaultCharacterName={storedChar.name}
			defaultCharacterMainSpecSlug={storedChar.mainSpecSlug}
			defaultMetaSpecSlug={storedChar.mainSpecSlug}
		>
			<div className="overview-return">
				<button
					type="button"
					onClick={() => {
						setView("overview");
						window.scrollTo(0, 0);
					}}
				>
					← 전체 캐릭터 레이드 성적
				</button>
			</div>
			<AppInner onSelectCharacter={saveCharacter} />
		</AppStateProvider>
	);
}
