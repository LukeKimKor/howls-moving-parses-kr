import { useState } from "react";
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
	return `https://assets.rpglogs.com/img/warcraft/specs/${className.replaceAll(" ", "")}-${specName.replaceAll(" ", "")}.jpg`;
}
export function SpecIcon({ className, specName }: { className: string; specName: string }) {
	const [failed, setFailed] = useState(false);
	const label = SPEC_LABELS[specName] ?? specName;
	return (
		<span className="spec-icon-slot" title={label}>
			{failed ? (
				<span role="img" aria-label={label} className="spec-icon-fallback">
					◆
				</span>
			) : (
				<img
					src={specIconUrl(className, specName)}
					alt={label}
					width={22}
					height={22}
					loading="lazy"
					onError={() => setFailed(true)}
				/>
			)}
		</span>
	);
}
