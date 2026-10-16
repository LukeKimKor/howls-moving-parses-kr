import { useEffect } from "react";
import { useAppState } from "../../contexts/AppStateContext.js";
import { ALL_SPECS } from "../../data/specs.js";
import type { CharacterData } from "../../types/snapshot.js";

/**
 * Renders a button group for toggling between a character's main spec and offspecs.
 * Only visible when the selected character has one or more offspecs.
 * Resets to the main spec when the selected character changes.
 */
export function CharacterSpecToggle({ character }: { character: CharacterData }) {
	const { activeSpecSlugForCharacter, setActiveSpecSlugForCharacter } = useAppState();

	// Reset to main spec when character changes
	useEffect(() => {
		setActiveSpecSlugForCharacter(character.mainSpecSlug);
		// character.name changes when the character changes — mainSpecSlug is what we actually set
	}, [character.mainSpecSlug, setActiveSpecSlugForCharacter]);

	// Only render when the character has offspecs
	if (character.specOrder.length <= 1) return null;

	return (
		<fieldset className="spec-toggle" aria-label="Select spec">
			<legend className="sr-only">Spec</legend>
			{character.specOrder.map((slug) => {
				const specDef = ALL_SPECS.find((s) => s.specSlug === slug);
				const isActive = slug === activeSpecSlugForCharacter;
				return (
					<button
						key={slug}
						type="button"
						aria-pressed={isActive}
						onClick={() => setActiveSpecSlugForCharacter(slug)}
						className={isActive ? "spec-toggle-btn active" : "spec-toggle-btn"}
					>
						{specDef?.specName ?? slug}
					</button>
				);
			})}
		</fieldset>
	);
}
