import { type ReactNode, createContext, useCallback, useContext, useState } from "react";

/**
 * Application selection state — which character and specs are active.
 *
 * - `selectedCharacterName`: the character currently shown in the left panel
 * - `activeSpecSlugForCharacter`: the spec currently shown in the left panel for the selected character
 * - `selectedMetaSpecSlug`: the spec shown in the right panel (independent of the left panel)
 */
interface AppState {
	selectedCharacterName: string;
	activeSpecSlugForCharacter: string;
	selectedMetaSpecSlug: string;
	setSelectedCharacter: (name: string, mainSpecSlug: string) => void;
	setActiveSpecSlugForCharacter: (slug: string) => void;
	setSelectedMetaSpecSlug: (slug: string) => void;
}

const AppStateContext = createContext<AppState | null>(null);

/**
 * Provides application-level selection state (character, spec toggles) to the component tree.
 * Must wrap all components that consume `useAppState`.
 */
export function AppStateProvider({
	children,
	defaultCharacterName,
	defaultCharacterMainSpecSlug,
	defaultMetaSpecSlug,
}: {
	children: ReactNode;
	defaultCharacterName: string;
	defaultCharacterMainSpecSlug: string;
	defaultMetaSpecSlug: string;
}) {
	const [selectedCharacterName, setSelectedCharacterName] = useState(defaultCharacterName);
	const [activeSpecSlugForCharacter, setActiveSpecSlugForCharacter] = useState(
		defaultCharacterMainSpecSlug,
	);
	const [selectedMetaSpecSlug, setSelectedMetaSpecSlug] = useState(defaultMetaSpecSlug);

	const setSelectedCharacter = useCallback((name: string, mainSpecSlug: string) => {
		setSelectedCharacterName(name);
		setActiveSpecSlugForCharacter(mainSpecSlug);
	}, []);

	return (
		<AppStateContext.Provider
			value={{
				selectedCharacterName,
				activeSpecSlugForCharacter,
				selectedMetaSpecSlug,
				setSelectedCharacter,
				setActiveSpecSlugForCharacter,
				setSelectedMetaSpecSlug,
			}}
		>
			{children}
		</AppStateContext.Provider>
	);
}

/**
 * Consumes the AppStateContext. Must be used within an AppStateProvider.
 * Throws if called outside the provider tree.
 */
export function useAppState(): AppState {
	const ctx = useContext(AppStateContext);
	if (!ctx) throw new Error("useAppState must be used within AppStateProvider");
	return ctx;
}
