/**
 * Standard empty-state slot used across all panels.
 * Renders a paragraph with the provided message.
 */
export function EmptyState({ message }: { message: string }) {
	return <p className="empty-state">{message}</p>;
}
