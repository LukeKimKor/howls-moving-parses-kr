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
			<span>New data available — click to refresh</span>
			<button type="button" onClick={onRefresh}>
				Refresh
			</button>
			<button type="button" onClick={onDismiss} aria-label="Dismiss notification">
				×
			</button>
		</output>
	);
}
