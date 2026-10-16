import { useAppState } from "../../contexts/AppStateContext.js";
import type { CharacterData } from "../../types/snapshot.js";

/**
 * Header dropdown for selecting among tracked characters.
 * Shows "Name — Spec Class" (e.g. "Flukey — Retribution Paladin").
 */
export function CharacterSelect({ characters }: { characters: CharacterData[] }) {
	const { selectedCharacterName, setSelectedCharacter } = useAppState();

	function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
		const char = characters.find((c) => c.name === e.target.value);
		if (char) setSelectedCharacter(char.name, char.mainSpecSlug);
	}

	return (
		<label>
			<span className="sr-only">Character</span>
			<select value={selectedCharacterName} onChange={handleChange} aria-label="Select character">
				{characters.map((char) => {
					const specName = char.mainSpecPending
						? "주 전문화 미확정"
						: (char.specs[char.mainSpecSlug]?.specName ?? "");
					return (
						<option key={char.name} value={char.name}>
							{char.name} — {specName} {char.class}
						</option>
					);
				})}
			</select>
		</label>
	);
}
