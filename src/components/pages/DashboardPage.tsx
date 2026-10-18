import { useEffect, useState } from "react";
import { gameName, raidGroups } from "../../lib/ko.js";
import { raidEncounters } from "../../lib/raid-overview.js";
import { kstTime, nextScheduledAt, raidLastSuccess } from "../../lib/refresh-time.js";
import type { CharacterData, Snapshot } from "../../types/snapshot.js";
import { NewBuildBanner } from "../chrome/NewBuildBanner.js";
import { MythicPlusOverview } from "./MythicPlusOverview.js";
import { RaidLogTab } from "./RaidLogTab.js";
import { RosterOverview } from "./RosterOverview.js";

export type DashboardTab = "overview" | "raid" | "mplus";

export const DASHBOARD_TABS: Array<{ id: DashboardTab; label: string; hint: string }> = [
	{ id: "overview", label: "종합 현황", hint: "템렙 · 쐐기 · 레이드 한눈에" },
	{ id: "raid", label: "레이드 로그", hint: "Warcraft Logs 보스별" },
	{ id: "mplus", label: "쐐기", hint: "Raider.IO 던전별" },
];

/** Tab from the URL hash. Raid anchors (#raid-summary, #raid-character-N) belong to the raid tab. */
export function tabFromHash(hash: string): DashboardTab | null {
	const id = hash.replace(/^#/, "");
	if (id === "overview" || id === "raid" || id === "mplus") return id;
	if (id.startsWith("raid-")) return "raid";
	return null;
}

export function DashboardPage({
	snapshot,
	onOpenCharacter,
	initialTab = "overview",
}: {
	snapshot: Snapshot;
	onOpenCharacter: (character: CharacterData) => void;
	initialTab?: DashboardTab;
}) {
	const [tab, setTab] = useState<DashboardTab>(
		() => tabFromHash(window.location.hash) ?? initialTab,
	);
	useEffect(() => {
		const onHash = () => {
			const next = tabFromHash(window.location.hash);
			if (next) setTab(next);
		};
		window.addEventListener("hashchange", onHash);
		return () => window.removeEventListener("hashchange", onHash);
	}, []);
	const selectTab = (next: DashboardTab) => {
		setTab(next);
		try {
			window.history.replaceState(null, "", `#${next}`);
		} catch {}
	};

	const [mobile, setMobile] = useState(() => window.matchMedia("(max-width: 767px)").matches);
	useEffect(() => {
		const media = window.matchMedia("(max-width: 767px)");
		const update = () => setMobile(media.matches);
		media.addEventListener("change", update);
		update();
		return () => media.removeEventListener("change", update);
	}, []);
	const [now, setNow] = useState(Date.now);
	useEffect(() => {
		const timer = window.setInterval(() => setNow(Date.now()), 60_000);
		return () => window.clearInterval(timer);
	}, []);
	const [newBuild, setNewBuild] = useState(false);
	useEffect(() => {
		if (!("serviceWorker" in navigator)) return;
		const handler = (event: MessageEvent) => {
			if (event.data?.type === "NEW_BUILD_AVAILABLE") setNewBuild(true);
		};
		navigator.serviceWorker.addEventListener("message", handler);
		return () => navigator.serviceWorker.removeEventListener("message", handler);
	}, []);

	const encounters = raidEncounters(snapshot);
	const groups = raidGroups(encounters.map((e) => e.name));
	const lastSuccess = raidLastSuccess(snapshot);
	const nextRun = snapshot.refreshSchedule?.enabled
		? nextScheduledAt(snapshot.refreshSchedule.utcHours, now)
		: undefined;
	const warnings = snapshot.warnings ?? [];

	return (
		<main className="raid-overview dash" data-theme="dark" data-tab={tab}>
			<header className="dash-header">
				<div className="dash-title">
					<p className="raid-eyebrow">내캐릭 로그관리 · 한국 아즈샤라</p>
					<h1>와우 대시보드</h1>
					<p className="dash-subtitle">
						{groups.length > 1 ? groups.join(" · ") : gameName(snapshot.raid?.name ?? "레이드")} ·{" "}
						{snapshot.characters.length}개 캐릭터
					</p>
				</div>
				<div className="dash-status">
					<span className="dash-status-row">
						<span className="dash-dot" aria-hidden="true" />
						최근 갱신 <strong>{kstTime(snapshot.generatedAt)}</strong>
					</span>
					<span className="dash-status-row dash-muted">
						다음 예정 {nextRun ? kstTime(nextRun) : "미확인"}
					</span>
					<details className="dash-status-details">
						<summary>수집 상세</summary>
						<div className="raid-refresh-info">
							<small>
								레이드 최근 수집 성공 {lastSuccess ? `${kstTime(lastSuccess)} KST` : "미확인"}
							</small>
							<small>
								{snapshot.refreshSchedule?.enabled
									? `자동 갱신 하루 ${snapshot.refreshSchedule.utcHours.length}회 · ${snapshot.refreshSchedule.utcHours.map((h) => `${String((h + 9) % 24).padStart(2, "0")}:00`).join(" / ")} KST`
									: "자동 갱신 일정 확인 대기"}
							</small>
							{snapshot.refreshRuntime?.nextEligibleAt && (
								<small>WCL 재시도 가능 {kstTime(snapshot.refreshRuntime.nextEligibleAt)} KST</small>
							)}
							<small>레이드 캐시 4시간 · 상세 12시간 · 메타/영역 정보 24시간</small>
							{snapshot.dataMode === "raiderio-only" && (
								<small>WCL 인증 전 · Raider.IO 데이터만 표시 중</small>
							)}
						</div>
					</details>
				</div>
			</header>

			<NewBuildBanner
				visible={newBuild}
				onRefresh={() => window.location.reload()}
				onDismiss={() => setNewBuild(false)}
			/>
			{warnings.length > 0 && (
				<details className="dash-warnings">
					<summary>수집 알림 {warnings.length}개</summary>
					{warnings.map((warning) => (
						<output className="data-notice" key={warning}>
							{warning}
						</output>
					))}
				</details>
			)}

			<nav className="dash-tabs" aria-label="대시보드 보기">
				<div role="tablist" aria-label="대시보드 보기">
					{DASHBOARD_TABS.map((entry) => (
						<button
							key={entry.id}
							type="button"
							role="tab"
							id={`dash-tab-${entry.id}`}
							aria-selected={tab === entry.id}
							aria-controls={`dash-panel-${entry.id}`}
							onClick={() => selectTab(entry.id)}
						>
							<span className="dash-tab-label">{entry.label}</span>
							<span className="dash-tab-hint">{entry.hint}</span>
						</button>
					))}
				</div>
			</nav>

			<div
				role="tabpanel"
				id={`dash-panel-${tab}`}
				aria-labelledby={`dash-tab-${tab}`}
				className="dash-panel"
			>
				{tab === "overview" && (
					<RosterOverview snapshot={snapshot} onOpenCharacter={onOpenCharacter} />
				)}
				{tab === "raid" && (
					<RaidLogTab snapshot={snapshot} onOpenCharacter={onOpenCharacter} mobile={mobile} />
				)}
				{tab === "mplus" && (
					<MythicPlusOverview snapshot={snapshot} onOpenCharacter={onOpenCharacter} />
				)}
			</div>

			<footer className="raid-overview-footer">
				WCL·Raider.IO 공개 데이터 스냅샷 · 원본 기능 제작 howlsome
			</footer>
		</main>
	);
}
