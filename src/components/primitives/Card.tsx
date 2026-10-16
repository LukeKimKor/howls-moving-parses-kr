import type { ReactNode } from "react";

/**
 * Generic card container composed of Header, Body, and Footer sub-components.
 * Maps to a semantic `<article>` element.
 */
function Card({ children }: { children: ReactNode }) {
	return <article>{children}</article>;
}

Card.Header = function CardHeader({
	children,
	right,
}: {
	children: ReactNode;
	right?: ReactNode;
}) {
	return (
		<header className={right ? "card-header-row" : undefined}>
			<h2>{children}</h2>
			{right && <div className="card-header-right">{right}</div>}
		</header>
	);
};

Card.Body = function CardBody({ children }: { children: ReactNode }) {
	return <div className="card-body">{children}</div>;
};

Card.Footer = function CardFooter({ children }: { children: ReactNode }) {
	return <footer>{children}</footer>;
};

export { Card };
