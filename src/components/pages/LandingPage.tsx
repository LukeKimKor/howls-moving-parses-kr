import type { CharacterData } from "../../types/snapshot.js";

interface LandingPageProps {
	characters: CharacterData[];
	onSelect: (char: CharacterData) => void;
}

/**
 * Shown on first load when no default character is stored in localStorage.
 * The user picks their character to enter the dashboard.
 */
export function LandingPage({ characters, onSelect }: LandingPageProps) {
	return (
		<main>
			<h1>Howl&apos;s Moving Parses</h1>
			<p>Pick your character to get started.</p>
			<ul>
				{characters.map((char) => {
					const specName = char.mainSpecPending
						? "주 전문화 미확정"
						: (char.specs[char.mainSpecSlug]?.specName ?? "");
					return (
						<li key={char.name}>
							<button type="button" onClick={() => onSelect(char)}>
								{char.name}
								<br />
								<small>
									{specName} {char.class}
								</small>
							</button>
						</li>
					);
				})}
			</ul>
		</main>
	);
}
