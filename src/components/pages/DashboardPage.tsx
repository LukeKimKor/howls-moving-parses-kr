import { type KeyboardEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import { displayWarning } from "../../lib/collection-messages.js";
import { gameName, raidGroups } from "../../lib/ko.js";
import { raidEncounters } from "../../lib/raid-overview.js";
import { kstTime, nextScheduledAt, raidLastSuccess } from "../../lib/refresh-time.js";
import type { Snapshot } from "../../types/snapshot.js";
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

/** Tab from the URL hash (any case). Raid anchors (#raid-summary, #raid-character-N) belong to the raid tab. */
export function tabFromHash(hash: string): DashboardTab | null {
	const id = hash.replace(/^#/, "").toLowerCase();
	if (id === "overview" || id === "raid" || id === "mplus") return id;
	if (id.startsWith("raid-")) return "raid";
	return null;
}

/** True only when the worker names a deployed build other than the one this page loaded. */
export function isNewerBuild(deployed: unknown, loaded: string | undefined): boolean {
	return typeof deployed === "string" && deployed.length > 0 && deployed !== loaded;
}

export function DashboardPage({
	snapshot,
}: {
	snapshot: Snapshot;
}) {
	const [tab, setTab] = useState<DashboardTab>(
		() => tabFromHash(window.location.hash) ?? "overview",
	);
	useEffect(() => {
		const onHash = () => {
			const next = tabFromHash(window.location.hash);
			if (next) setTab(next);
		};
		window.addEventListener("hashchange", onHash);
		return () => window.removeEventListener("hashchange", onHash);
	}, []);
	// A tab switch starts the new tab at the tab bar instead of mid-page; a page already above it stays.
	const tabsAnchor = useRef<HTMLDivElement>(null);
	const tabButtons = useRef<Partial<Record<DashboardTab, HTMLButtonElement | null>>>({});
	const [tabSwitches, setTabSwitches] = useState(0);
	useLayoutEffect(() => {
		if (!tabSwitches || !tabsAnchor.current) return;
		const top = tabsAnchor.current.getBoundingClientRect().top + window.scrollY;
		if (window.scrollY > top) window.scrollTo({ top });
	}, [tabSwitches]);
	const selectTab = (next: DashboardTab) => {
		if (next !== tab) setTabSwitches((n) => n + 1);
		setTab(next);
		try {
			window.history.replaceState(null, "", `#${next}`);
		} catch {}
	};
	/** WAI-ARIA tabs: arrows move and select (wrapping), Home/End jump to the ends. */
	const onTabKey = (event: KeyboardEvent<HTMLDivElement>) => {
		const index = DASHBOARD_TABS.findIndex((entry) => entry.id === tab);
		const last = DASHBOARD_TABS.length - 1;
		const target = {
			ArrowRight: index === last ? 0 : index + 1,
			ArrowLeft: index === 0 ? last : index - 1,
			Home: 0,
			End: last,
		}[event.key];
		const next = target === undefined ? undefined : DASHBOARD_TABS[target]?.id;
		if (!next) return;
		event.preventDefault();
		selectTab(next);
		tabButtons.current[next]?.focus();
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
		// The worker reports the deployed hash; a page that already runs that build needs no banner.
		const handler = (event: MessageEvent) => {
			if (
				event.data?.type === "NEW_BUILD_AVAILABLE" &&
				isNewerBuild(event.data.hash, snapshot.buildHash)
			)
				setNewBuild(true);
		};
		navigator.serviceWorker.addEventListener("message", handler);
		return () => navigator.serviceWorker.removeEventListener("message", handler);
	}, [snapshot.buildHash]);

	const encounters = raidEncounters(snapshot);
	const groups = raidGroups(encounters.map((e) => e.name));
	const lastSuccess = raidLastSuccess(snapshot);
	const nextRun = snapshot.refreshSchedule?.enabled
		? nextScheduledAt(snapshot.refreshSchedule.utcHours, now)
		: undefined;
	const warnings = (snapshot.warnings ?? []).map(displayWarning);

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
						데이터 기준 <strong>{kstTime(snapshot.generatedAt)} KST</strong>
					</span>
					<span className="dash-status-row dash-muted">
						다음 갱신 예정 {nextRun ? `${kstTime(nextRun)} KST` : "미확인"}
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

			<div className="dash-tabs-anchor" ref={tabsAnchor} />
			<nav className="dash-tabs">
				<div role="tablist" aria-label="대시보드 보기" onKeyDown={onTabKey}>
					{DASHBOARD_TABS.map((entry) => (
						<button
							key={entry.id}
							ref={(element) => {
								tabButtons.current[entry.id] = element;
							}}
							type="button"
							role="tab"
							id={`dash-tab-${entry.id}`}
							aria-selected={tab === entry.id}
							// Only the selected tab's panel is rendered.
							aria-controls={tab === entry.id ? `dash-panel-${entry.id}` : undefined}
							tabIndex={tab === entry.id ? 0 : -1}
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
				{tab === "overview" && <RosterOverview snapshot={snapshot} />}
				{tab === "raid" && <RaidLogTab snapshot={snapshot} mobile={mobile} />}
				{tab === "mplus" && <MythicPlusOverview snapshot={snapshot} />}
			</div>

			<footer className="raid-overview-footer">
				WCL·Raider.IO 공개 데이터 스냅샷 · 원본 기능 제작 howlsome
			</footer>
		</main>
	);
}
