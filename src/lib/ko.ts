/** Presentation labels only. API identifiers, source snapshots and external links remain unchanged. */
export const CLASS_KO: Record<string, string> = {
	Mage: "마법사",
	Warrior: "전사",
	DemonHunter: "악마사냥꾼",
	"Demon Hunter": "악마사냥꾼",
	Evoker: "기원사",
	DeathKnight: "죽음의 기사",
	"Death Knight": "죽음의 기사",
	Monk: "수도사",
	Warlock: "흑마법사",
	Priest: "사제",
	Druid: "드루이드",
	Hunter: "사냥꾼",
	Rogue: "도적",
	Shaman: "주술사",
	Paladin: "성기사",
};
export const SPEC_KO: Record<string, string> = {
	Arcane: "비전",
	Fire: "화염",
	Frost: "냉기",
	Arms: "무기",
	Fury: "분노",
	Protection: "보호",
	Havoc: "파멸",
	Devourer: "포식",
	Vengeance: "복수",
	Preservation: "보존",
	Devastation: "황폐",
	Augmentation: "증강",
	Blood: "혈기",
	Unholy: "부정",
	Windwalker: "풍운",
	Brewmaster: "양조",
	Mistweaver: "운무",
	Demonology: "악마",
	Affliction: "고통",
	Destruction: "파괴",
	Shadow: "암흑",
	Holy: "신성",
	Discipline: "수양",
	Balance: "조화",
	Feral: "야성",
	Guardian: "수호",
	Restoration: "회복",
	Marksmanship: "사격",
	"Beast Mastery": "야수",
	Survival: "생존",
	Assassination: "암살",
	Outlaw: "무법",
	Subtlety: "잠행",
	Elemental: "정기",
	Enhancement: "고양",
	Retribution: "징벌",
};
export const classLabel = (name: string) => CLASS_KO[name] ?? name;
export function specLabel(name: string, className?: string) {
	if (name === "Protection" && className === "Warrior") return "방어";
	if (name === "Restoration" && className === "Shaman") return "복원";
	return SPEC_KO[name] ?? name;
}
export const difficultyLabel = (name: string) =>
	({ Heroic: "영웅", Mythic: "신화", Normal: "일반" })[name] ?? name;
export const metricLabel = (name: string) =>
	({ dps: "전체 피해", bossdps: "우두머리 피해", hps: "치유량" })[name] ?? name;
export const rateLabel = (metric: string) => (metric === "hps" ? "초당 치유량" : "초당 피해량");
export const regionLabel = (region: string) =>
	({ kr: "한국", eu: "유럽", us: "북미", tw: "대만", cn: "중국" })[region.toLowerCase()] ?? region;

// Verified official Korean names; see docs/korean-labels.md. English keys are intentionally preserved.
export const BOSS_KO: Record<string, string> = {
	"Nek'zali the Soulcoiler": "영혼살무사 네크잘리",
	"Entombed Sentinels": "매장된 파수꾼",
	"Vashnik the Malignant": "악성의 바쉬니크",
	"The Lost Explorers": "길 잃은 탐험가",
	Sszorak: "스조라크",
	"The Twin Fangs": "쌍둥이 송곳니",
	"The Coiled Altar": "똬리의 제단",
	"Ula'tek": "울라텍",
	"Nymrissa Wavecaller": "님리사 웨이브콜러",
	"Kith'ix": "키식스",
};
export const RAID_KO: Record<string, string> = {
	"The Venomous Abyss": "맹독 심연",
	"The Tidebound Grotto": "해일결속 동굴",
	"Tidebound Grotto": "해일결속 동굴",
	"The Unbinding of Kith'ix": "키식스 해방",
};
export const gameName = (name: string) => BOSS_KO[name] ?? RAID_KO[name] ?? name;
export function bossGroup(name: string): string | undefined {
	if (name === "Nymrissa Wavecaller") return "해일결속 동굴";
	if (name === "Kith'ix") return "키식스 해방";
	if (BOSS_KO[name]) return "맹독 심연";
	return undefined;
}
export function raidGroups(names: string[]) {
	return [...new Set(names.map(bossGroup).filter((name): name is string => !!name))];
}
export const hasValue = (value: number | null | undefined) =>
	typeof value === "number" && Number.isFinite(value);
export const hasSummaryPercent = (
	summary:
		| { bestPerformanceAverage: number | null; medianPerformanceAverage: number | null }
		| undefined,
) =>
	!!summary &&
	(hasValue(summary.bestPerformanceAverage) || hasValue(summary.medianPerformanceAverage));
export const SLOT_KO: Record<string, string> = {
	head: "머리",
	neck: "목",
	shoulder: "어깨",
	back: "등",
	chest: "가슴",
	shirt: "속옷",
	tabard: "휘장",
	wrist: "손목",
	hands: "손",
	waist: "허리",
	legs: "다리",
	feet: "발",
	finger1: "손가락 1",
	finger2: "손가락 2",
	trinket1: "장신구 1",
	trinket2: "장신구 2",
	mainhand: "주장비",
	offhand: "보조장비",
};
export const slotLabel = (slot: string) => SLOT_KO[slot] ?? slot;
export const rankLabelKo = (label: string) =>
	({
		Legendary: "전설",
		Epic: "영웅",
		Rare: "희귀",
		Uncommon: "고급",
		Common: "일반",
		Poor: "하급",
	})[label] ?? label;
export const tierLabelKo = (label: string) =>
	({
		Myth: "신화",
		Legend: "전설",
		Celestial: "천상",
		Ethereal: "에테르",
		Immortal: "불멸",
		Awakened: "각성",
		"Keystone Master": "쐐기돌 장인",
		"Keystone Hero": "쐐기돌 영웅",
		"Keystone Conqueror": "쐐기돌 정복자",
		"Keystone Challenger": "쐐기돌 도전자",
	})[label] ?? label;
