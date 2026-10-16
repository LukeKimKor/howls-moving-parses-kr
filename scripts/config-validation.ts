import { ALL_SPECS } from "../src/data/specs.js";
import type { Region } from "../src/lib/regions.js";
import { toRealmSlug } from "./realm-slug.js";

interface SpecEntry {
	spec: string;
	role: "main" | "offspec" | "inactive" | "tracked";
}

export interface CharacterConfig {
	name: string;
	realm: string;
	region: Region;
	realmSlug?: string;
	mainSpecPending?: boolean;
	class: string;
	default: boolean;
	specs: SpecEntry[];
}

export interface CharactersConfig {
	characters: CharacterConfig[];
}

/**
 * Validates characters.config.json against all rules specified in the PRD.
 * Throws a descriptive error on the first violation found.
 *
 * @param config - Parsed characters.config.json content
 */
export function validateConfig(config: CharactersConfig): void {
	if (!config.characters || !Array.isArray(config.characters)) {
		throw new Error('characters.config.json must have a "characters" array');
	}
	if (config.characters.length === 0) {
		throw new Error('characters.config.json "characters" array must not be empty');
	}

	const defaultCount = config.characters.filter((c) => c.default).length;
	if (defaultCount === 0) {
		throw new Error('Exactly one character must have "default": true — none found');
	}
	if (defaultCount > 1) {
		throw new Error('Exactly one character must have "default": true — multiple found');
	}

	const knownClasses = new Set(ALL_SPECS.map((s) => s.className));
	const validRoles = new Set(["main", "offspec", "inactive", "tracked"]);
	if (new Set(config.characters.map((c) => c.region)).size !== 1) {
		throw new Error("One snapshot must use a single region so spec meta cannot mix regions");
	}
	const identities = new Set<string>();

	for (const char of config.characters) {
		const id = `Character "${char.name ?? "(unnamed)"}"`;

		for (const field of ["name", "realm", "region", "class", "specs"] as const) {
			if (char[field] === undefined || char[field] === null) {
				throw new Error(`${id}: missing required field "${field}"`);
			}
		}

		if (char.region !== "eu" && char.region !== "kr") {
			throw new Error(`${id}: "region" must be "eu" or "kr", got "${char.region}"`);
		}
		for (const field of ["name", "realm"] as const) {
			if (
				typeof char[field] !== "string" ||
				!char[field].trim() ||
				char[field] !== char[field].normalize("NFC")
			) {
				throw new Error(`${id}: "${field}" must be a non-empty NFC string`);
			}
		}
		const slug = char.realmSlug ?? toRealmSlug(char.realm);
		if (!slug || (char.realmSlug !== undefined && !/^[a-z0-9-]+$/.test(char.realmSlug)))
			throw new Error(`${id}: invalid realmSlug`);
		const identity = `${char.region}/${slug}/${char.name.toLowerCase()}`;
		if (identities.has(identity)) throw new Error(`${id}: duplicate character`);
		identities.add(identity);

		if (!knownClasses.has(char.class)) {
			throw new Error(
				`${id}: unknown class "${char.class}". Valid values: ${[...knownClasses].join(", ")}`,
			);
		}

		if (!Array.isArray(char.specs) || char.specs.length === 0) {
			throw new Error(`${id}: "specs" must be a non-empty array`);
		}

		const seenSpecs = new Set<string>();
		for (const specEntry of char.specs) {
			if (!specEntry.spec) {
				throw new Error(`${id}: a specs entry is missing the "spec" field`);
			}
			if (!specEntry.role) {
				throw new Error(`${id}: spec "${specEntry.spec}" is missing the "role" field`);
			}
			if (!validRoles.has(specEntry.role)) {
				throw new Error(
					`${id}: spec "${specEntry.spec}" has invalid role "${specEntry.role}". Must be "main", "offspec", "inactive", or pending "tracked"`,
				);
			}

			if (seenSpecs.has(specEntry.spec)) {
				throw new Error(`${id}: duplicate spec "${specEntry.spec}" in specs array`);
			}
			seenSpecs.add(specEntry.spec);

			const validSpec = ALL_SPECS.find(
				(s) => s.specName === specEntry.spec && s.className === char.class,
			);
			if (!validSpec) {
				throw new Error(`${id}: "${specEntry.spec}" is not a valid spec for class "${char.class}"`);
			}
		}

		const mainEntries = char.specs.filter((s) => s.role === "main");
		if (char.mainSpecPending) {
			if (
				mainEntries.length ||
				char.specs.filter((s) => s.role === "tracked").length < 2 ||
				char.specs.some((s) => s.role === "offspec")
			) {
				throw new Error(
					`${id}: pending main spec requires at least two tracked specs and no main/offspec`,
				);
			}
			continue;
		}
		if (char.specs.some((s) => s.role === "tracked"))
			throw new Error(`${id}: tracked role requires mainSpecPending`);
		if (mainEntries.length === 0) {
			throw new Error(`${id}: must have exactly one spec with role "main" — none found`);
		}
		if (mainEntries.length > 1) {
			throw new Error(`${id}: must have exactly one spec with role "main" — multiple found`);
		}

		const activeSpecs = char.specs.filter((s) => s.role !== "inactive");
		if (activeSpecs.length === 0) {
			throw new Error(`${id}: has only "inactive" specs. At least one "main" spec is required.`);
		}
	}
}
