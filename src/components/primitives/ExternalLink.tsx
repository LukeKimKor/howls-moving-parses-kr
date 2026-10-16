/**
 * An anchor with a consistent ↗ glyph and secure `target="_blank"` attributes.
 * Always includes `rel="noopener noreferrer"` to prevent tab-napping.
 */
export function ExternalLink({ href, label }: { href: string; label: string }) {
	return (
		<a href={href} target="_blank" rel="noopener noreferrer">
			{label} <span aria-hidden="true">↗</span>
		</a>
	);
}
