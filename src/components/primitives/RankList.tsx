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
				<dt>서버</dt>
				<dd>#{ranks.realm.toLocaleString("en-GB")}</dd>
			</div>
			<div className="rank-item">
				<dt>지역</dt>
				<dd>#{ranks.region.toLocaleString("en-GB")}</dd>
			</div>
			<div className="rank-item">
				<dt>세계</dt>
				<dd>#{ranks.world.toLocaleString("en-GB")}</dd>
			</div>
		</dl>
	);
}
