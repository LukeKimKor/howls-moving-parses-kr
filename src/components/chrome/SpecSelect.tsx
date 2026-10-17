import { useAppState } from "../../contexts/AppStateContext.js";
import { ALL_SPECS } from "../../data/specs.js";
import { classLabel, specLabel } from "../../lib/ko.js";

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
			<span className="sr-only">전문화별 표본</span>
			<select
				value={selectedMetaSpecSlug}
				onChange={(e) => setSelectedMetaSpecSlug(e.target.value)}
				aria-label="표본을 조회할 전문화 선택"
			>
				{[...groups.entries()].map(([className, specs]) => (
					<optgroup key={className} label={classLabel(className)}>
						{specs.map((spec) => (
							<option key={spec.specSlug} value={spec.specSlug}>
								{specLabel(spec.specName, spec.className)}
							</option>
						))}
					</optgroup>
				))}
			</select>
		</label>
	);
}
