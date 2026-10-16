export type Region = "eu" | "kr";

/** Shared by the collector and UI. Never remove Hangul from character names. */
export function realmSlug(realm: string): string {
	if (["아즈샤라", "azshara"].includes(realm.normalize("NFC").trim().toLowerCase()))
		return "azshara";
	return realm
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "")
		.normalize("NFC")
		.toLowerCase()
		.replace(/['’]/g, "")
		.replace(/[^\p{L}\p{N}]+/gu, "-")
		.replace(/^-+|-+$/g, "");
}

export function characterProfileUrl(
	provider: "rio" | "wcl",
	region: Region,
	realm: string,
	name: string,
): string {
	const base =
		provider === "rio" ? "https://raider.io/characters" : "https://www.warcraftlogs.com/character";
	return `${base}/${region}/${encodeURIComponent(realmSlug(realm))}/${encodeURIComponent(name.normalize("NFC"))}`;
}
