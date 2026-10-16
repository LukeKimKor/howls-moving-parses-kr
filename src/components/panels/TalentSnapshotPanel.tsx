import type { TalentData } from "../../types/snapshot.js";
import { Card } from "../primitives/Card.js";
import { EmptyState } from "../primitives/EmptyState.js";
import { ExternalLink } from "../primitives/ExternalLink.js";

/**
 * Renders the Talent Snapshot section: list of active talents and optional Wowhead link.
 */
export function TalentSnapshotPanel({ data }: { data: TalentData | null }) {
	if (!data || data.talents.length === 0) {
		return (
			<Card>
				<Card.Header>Talent Snapshot</Card.Header>
				<Card.Body>
					<EmptyState message="No talent data available." />
				</Card.Body>
			</Card>
		);
	}

	return (
		<Card>
			<Card.Header>Talent Snapshot</Card.Header>
			<Card.Body>
				<p>Raider.IO의 현재 전문화 특성입니다. 다른 전문화의 특성은 제공되지 않으면 비워 둡니다.</p>
				{data.loadoutString && (
					<details>
						<summary>게임 내 특성 가져오기 문자열</summary>
						<textarea readOnly aria-label="Talent import string" value={data.loadoutString} />
					</details>
				)}
				<details>
					<summary>선택 특성 {data.talents.length}개 보기</summary>
					<ol className="talent-list">
						{data.talents.map((talent) => (
							<li key={talent}>{talent}</li>
						))}
					</ol>
				</details>
				{data.wowheadUrl && <ExternalLink href={data.wowheadUrl} label="View on Wowhead" />}
			</Card.Body>
		</Card>
	);
}
