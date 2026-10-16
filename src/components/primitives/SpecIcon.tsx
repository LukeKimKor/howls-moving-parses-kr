import { useState } from "react";
import { ALL_SPECS } from "../../data/specs.js";
import { SPEC_LABELS } from "../../lib/raid-overview.js";

export const CLASS_COLORS: Record<string, string> = {
	DemonHunter: "#c77df4",
	DeathKnight: "#f16a86",
	Mage: "#69ccf0",
	Warrior: "#c79c6e",
	"Demon Hunter": "#c77df4",
	Evoker: "#69bba7",
	"Death Knight": "#f16a86",
	Monk: "#00ff98",
	Warlock: "#b59bf4",
	Priest: "#ffffff",
	Druid: "#ff9b4b",
	Hunter: "#abd473",
	Rogue: "#fff569",
	Shaman: "#57a7ff",
	Paladin: "#f58cba",
};
export function specIconUrl(className: string, specName: string) {
	const compact = (name: string) => (typeof name === "string" ? name.replaceAll(" ", "") : "");
	const spec = ALL_SPECS.find(
		(entry) =>
			compact(entry.className) === compact(className) &&
			compact(entry.specName) === compact(specName),
	);
	if (!spec) return undefined;
	// Public WCL integrations use /icons/{Class}-{Spec}.jpg; the previous /specs/ root was incorrect.
	return `https://assets.rpglogs.com/img/warcraft/icons/${spec.className}-${compact(spec.specName)}.jpg`;
}
export function SpecIcon({ className, specName }: { className: string; specName: string }) {
	const [failedSource, setFailedSource] = useState<string>();
	const source = specIconUrl(className, specName);
	const label = SPEC_LABELS[specName] ?? (source ? specName : "전문화 미확인");
	return (
		<span className="spec-icon-slot" title={label}>
			{!source || failedSource === source ? (
				<span role="img" aria-label={label} className="spec-icon-fallback">
					◆
				</span>
			) : (
				<img
					src={source}
					alt={label}
					width={22}
					height={22}
					loading="lazy"
					onError={() => setFailedSource(source)}
				/>
			)}
		</span>
	);
}
