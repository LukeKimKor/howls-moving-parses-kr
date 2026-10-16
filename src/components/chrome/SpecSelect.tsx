import { useAppState } from "../../contexts/AppStateContext.js";
import { ALL_SPECS } from "../../data/specs.js";

/**
 * Header dropdown listing all 39 WoW specs grouped by class.
 * Selecting a spec updates the right (meta) panel independently of the left panel.
 */
export function SpecSelect() {
	const { selectedMetaSpecSlug, setSelectedMetaSpecSlug } = useAppState();

	// Group specs by classDisplayName in the order they appear in ALL_SPECS
	const groups = new Map<string, typeof ALL_SPECS>();
	for (const spec of ALL_SPECS) {
		const existing = groups.get(spec.classDisplayName);
		if (existing) {
			existing.push(spec);
		} else {
			groups.set(spec.classDisplayName, [spec]);
		}
	}

	return (
		<label>
			<span className="sr-only">Spec Meta</span>
			<select
				value={selectedMetaSpecSlug}
				onChange={(e) => setSelectedMetaSpecSlug(e.target.value)}
				aria-label="Select spec for meta panel"
			>
				{[...groups.entries()].map(([className, specs]) => (
					<optgroup key={className} label={className}>
						{specs.map((spec) => (
							<option key={spec.specSlug} value={spec.specSlug}>
								{spec.specName}
							</option>
						))}
					</optgroup>
				))}
			</select>
		</label>
	);
}
