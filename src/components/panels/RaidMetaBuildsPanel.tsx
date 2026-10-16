import { Card } from "../primitives/Card.js";
import { EmptyState } from "../primitives/EmptyState.js";

/**
 * Renders the Raid Meta Talent Builds section.
 * Always shows empty state in v1 — meta talent aggregation is deferred.
 * See "Meta gear and meta talents (DEFERRED)" in the PRD.
 */
export function RaidMetaBuildsPanel() {
	return (
		<Card>
			<Card.Header>Raid Meta Talent Builds</Card.Header>
			<Card.Body>
				<EmptyState message="Meta builds will be available in a future release." />
			</Card.Body>
		</Card>
	);
}
