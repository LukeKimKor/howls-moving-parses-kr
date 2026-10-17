/**
 * Dismissible banner that notifies the user when a newer build is available.
 * Only renders when `visible` is true. Uses aria-live for screen reader announcement.
 */
export function NewBuildBanner({
	visible,
	onRefresh,
	onDismiss,
}: {
	visible: boolean;
	onRefresh: () => void;
	onDismiss: () => void;
}) {
	if (!visible) return null;

	return (
		<output id="new-build-banner" aria-live="polite" className="new-build-banner">
			<span>새 데이터가 있습니다. 새로고침하면 반영됩니다.</span>
			<button type="button" onClick={onRefresh}>
				새로고침
			</button>
			<button type="button" onClick={onDismiss} aria-label="알림 닫기">
				×
			</button>
		</output>
	);
}
