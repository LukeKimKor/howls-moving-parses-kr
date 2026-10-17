import { Card } from "../primitives/Card.js";
import { EmptyState } from "../primitives/EmptyState.js";

/**
 * Renders the M+ Meta Talent Builds section.
 * Always shows empty state in v1 — meta talent aggregation is deferred.
 * See "Meta gear and meta talents (DEFERRED)" in the PRD.
 */
export function MythicPlusMetaBuildsPanel() {
	return (
		<Card>
			<Card.Header>쐐기 특성 빌드 표본</Card.Header>
			<Card.Body>
				<EmptyState message="특성 빌드 집계는 아직 제공되지 않습니다." />
			</Card.Body>
		</Card>
	);
}
