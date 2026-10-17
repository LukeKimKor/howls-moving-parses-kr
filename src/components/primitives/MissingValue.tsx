import { Children, type ReactNode, cloneElement, isValidElement } from "react";

/** Visually empty while keeping missing data distinct from a confirmed zero. */
export function MissingValue({ label = "값 미확인" }: { label?: string }) {
	return <span className="missing-value" role="img" aria-label={label} />;
}

export function blankTablePlaceholders(value: ReactNode): ReactNode {
	if (
		value == null ||
		(typeof value === "string" && /^(?:\s*[—–-]\s*)(?:\/\s*[—–-]\s*)?$/.test(value))
	)
		return <MissingValue />;
	if (Array.isArray(value)) return Children.map(value, blankTablePlaceholders);
	if (
		isValidElement<{ children?: ReactNode }>(value) &&
		typeof value.type === "string" &&
		value.props.children !== undefined
	)
		return cloneElement(value, {}, blankTablePlaceholders(value.props.children));
	return value;
}
