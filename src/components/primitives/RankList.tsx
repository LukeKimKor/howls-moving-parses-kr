/**
 * Renders a three-line realm/region/world rank display.
 * Each rank is labelled to ensure accessibility without colour dependency.
 */
export function RankList({
	ranks,
}: {
	ranks: { realm: number; region: number; world: number };
}) {
	return (
		<dl className="rank-list">
			<div className="rank-item">
				<dt>Realm</dt>
				<dd>#{ranks.realm.toLocaleString("en-GB")}</dd>
			</div>
			<div className="rank-item">
				<dt>Region</dt>
				<dd>#{ranks.region.toLocaleString("en-GB")}</dd>
			</div>
			<div className="rank-item">
				<dt>World</dt>
				<dd>#{ranks.world.toLocaleString("en-GB")}</dd>
			</div>
		</dl>
	);
}
