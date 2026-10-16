/**
 * Role classification for a spec. Determines which WCL `metric` to use
 * when fetching rankings: DPS and tanks use 'dps', healers use 'hps'.
 *
 * Tanks are included under 'dps' deliberately — WCL ranks tanks by their
 * damage output, and an 'hps' query returns near-empty data for tanks.
 */
export type SpecRole = "dps" | "tank" | "healer";

export interface SpecDefinition {
	/** URL-safe slug, used as key in snapshot.specs map. */
	specSlug: string;
	/** Human-readable spec name as WCL expects it (e.g. "Beast Mastery"). */
	specName: string;
	/** Human-readable class name as WCL expects it (e.g. "DeathKnight" — note the casing). */
	className: string;
	/** Display name for class in UI dropdowns (e.g. "Death Knight"). */
	classDisplayName: string;
	role: SpecRole;
}

/**
 * Maps a SpecRole to the WCL `metric` enum value to use when querying rankings.
 * - DPS and tanks → 'dps' (tanks are ranked by damage on WCL)
 * - Healers → 'hps'
 */
export function metricForRole(role: SpecRole): "dps" | "hps" {
	return role === "healer" ? "hps" : "dps";
}

/**
 * All 39 retail WoW specs as of The War Within. Order matches the standard
 * in-game class selection order. WCL classNames are case-sensitive and use
 * concatenated forms for two-word classes ("DeathKnight", "DemonHunter").
 */
export const ALL_SPECS: SpecDefinition[] = [
	// Death Knight
	{
		specSlug: "blood-death-knight",
		specName: "Blood",
		className: "DeathKnight",
		classDisplayName: "Death Knight",
		role: "tank",
	},
	{
		specSlug: "frost-death-knight",
		specName: "Frost",
		className: "DeathKnight",
		classDisplayName: "Death Knight",
		role: "dps",
	},
	{
		specSlug: "unholy-death-knight",
		specName: "Unholy",
		className: "DeathKnight",
		classDisplayName: "Death Knight",
		role: "dps",
	},
	// Demon Hunter
	{
		specSlug: "devourer-demon-hunter",
		specName: "Devourer",
		className: "DemonHunter",
		classDisplayName: "Demon Hunter",
		role: "dps",
	},
	{
		specSlug: "havoc-demon-hunter",
		specName: "Havoc",
		className: "DemonHunter",
		classDisplayName: "Demon Hunter",
		role: "dps",
	},
	{
		specSlug: "vengeance-demon-hunter",
		specName: "Vengeance",
		className: "DemonHunter",
		classDisplayName: "Demon Hunter",
		role: "tank",
	},
	// Druid
	{
		specSlug: "balance-druid",
		specName: "Balance",
		className: "Druid",
		classDisplayName: "Druid",
		role: "dps",
	},
	{
		specSlug: "feral-druid",
		specName: "Feral",
		className: "Druid",
		classDisplayName: "Druid",
		role: "dps",
	},
	{
		specSlug: "guardian-druid",
		specName: "Guardian",
		className: "Druid",
		classDisplayName: "Druid",
		role: "tank",
	},
	{
		specSlug: "restoration-druid",
		specName: "Restoration",
		className: "Druid",
		classDisplayName: "Druid",
		role: "healer",
	},
	// Evoker
	{
		specSlug: "augmentation-evoker",
		specName: "Augmentation",
		className: "Evoker",
		classDisplayName: "Evoker",
		role: "dps",
	},
	{
		specSlug: "devastation-evoker",
		specName: "Devastation",
		className: "Evoker",
		classDisplayName: "Evoker",
		role: "dps",
	},
	{
		specSlug: "preservation-evoker",
		specName: "Preservation",
		className: "Evoker",
		classDisplayName: "Evoker",
		role: "healer",
	},
	// Hunter
	{
		specSlug: "beast-mastery-hunter",
		specName: "Beast Mastery",
		className: "Hunter",
		classDisplayName: "Hunter",
		role: "dps",
	},
	{
		specSlug: "marksmanship-hunter",
		specName: "Marksmanship",
		className: "Hunter",
		classDisplayName: "Hunter",
		role: "dps",
	},
	{
		specSlug: "survival-hunter",
		specName: "Survival",
		className: "Hunter",
		classDisplayName: "Hunter",
		role: "dps",
	},
	// Mage
	{
		specSlug: "arcane-mage",
		specName: "Arcane",
		className: "Mage",
		classDisplayName: "Mage",
		role: "dps",
	},
	{
		specSlug: "fire-mage",
		specName: "Fire",
		className: "Mage",
		classDisplayName: "Mage",
		role: "dps",
	},
	{
		specSlug: "frost-mage",
		specName: "Frost",
		className: "Mage",
		classDisplayName: "Mage",
		role: "dps",
	},
	// Monk
	{
		specSlug: "brewmaster-monk",
		specName: "Brewmaster",
		className: "Monk",
		classDisplayName: "Monk",
		role: "tank",
	},
	{
		specSlug: "mistweaver-monk",
		specName: "Mistweaver",
		className: "Monk",
		classDisplayName: "Monk",
		role: "healer",
	},
	{
		specSlug: "windwalker-monk",
		specName: "Windwalker",
		className: "Monk",
		classDisplayName: "Monk",
		role: "dps",
	},
	// Paladin
	{
		specSlug: "holy-paladin",
		specName: "Holy",
		className: "Paladin",
		classDisplayName: "Paladin",
		role: "healer",
	},
	{
		specSlug: "protection-paladin",
		specName: "Protection",
		className: "Paladin",
		classDisplayName: "Paladin",
		role: "tank",
	},
	{
		specSlug: "retribution-paladin",
		specName: "Retribution",
		className: "Paladin",
		classDisplayName: "Paladin",
		role: "dps",
	},
	// Priest
	{
		specSlug: "discipline-priest",
		specName: "Discipline",
		className: "Priest",
		classDisplayName: "Priest",
		role: "healer",
	},
	{
		specSlug: "holy-priest",
		specName: "Holy",
		className: "Priest",
		classDisplayName: "Priest",
		role: "healer",
	},
	{
		specSlug: "shadow-priest",
		specName: "Shadow",
		className: "Priest",
		classDisplayName: "Priest",
		role: "dps",
	},
	// Rogue
	{
		specSlug: "assassination-rogue",
		specName: "Assassination",
		className: "Rogue",
		classDisplayName: "Rogue",
		role: "dps",
	},
	{
		specSlug: "outlaw-rogue",
		specName: "Outlaw",
		className: "Rogue",
		classDisplayName: "Rogue",
		role: "dps",
	},
	{
		specSlug: "subtlety-rogue",
		specName: "Subtlety",
		className: "Rogue",
		classDisplayName: "Rogue",
		role: "dps",
	},
	// Shaman
	{
		specSlug: "elemental-shaman",
		specName: "Elemental",
		className: "Shaman",
		classDisplayName: "Shaman",
		role: "dps",
	},
	{
		specSlug: "enhancement-shaman",
		specName: "Enhancement",
		className: "Shaman",
		classDisplayName: "Shaman",
		role: "dps",
	},
	{
		specSlug: "restoration-shaman",
		specName: "Restoration",
		className: "Shaman",
		classDisplayName: "Shaman",
		role: "healer",
	},
	// Warlock
	{
		specSlug: "affliction-warlock",
		specName: "Affliction",
		className: "Warlock",
		classDisplayName: "Warlock",
		role: "dps",
	},
	{
		specSlug: "demonology-warlock",
		specName: "Demonology",
		className: "Warlock",
		classDisplayName: "Warlock",
		role: "dps",
	},
	{
		specSlug: "destruction-warlock",
		specName: "Destruction",
		className: "Warlock",
		classDisplayName: "Warlock",
		role: "dps",
	},
	// Warrior
	{
		specSlug: "arms-warrior",
		specName: "Arms",
		className: "Warrior",
		classDisplayName: "Warrior",
		role: "dps",
	},
	{
		specSlug: "fury-warrior",
		specName: "Fury",
		className: "Warrior",
		classDisplayName: "Warrior",
		role: "dps",
	},
	{
		specSlug: "protection-warrior",
		specName: "Protection",
		className: "Warrior",
		classDisplayName: "Warrior",
		role: "tank",
	},
];

if (ALL_SPECS.length !== 40) {
	throw new Error(`ALL_SPECS must contain 40 specs, found ${ALL_SPECS.length}`);
}
