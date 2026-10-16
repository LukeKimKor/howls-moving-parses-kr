import {
	Children,
	type ReactNode,
	cloneElement,
	createContext,
	isValidElement,
	useContext,
	useRef,
} from "react";

/**
 * Context carrying a ref to the current table's column labels.
 * DataTable.Header writes to it synchronously during render (thead comes before tbody
 * in React's tree, so rows always see a populated ref). DataTable.Row reads from it
 * to inject data-label onto each cell for the mobile card layout.
 */
const ColumnsRef = createContext<React.MutableRefObject<string[]>>({ current: [] });

/**
 * Generic accessible table shell.
 *
 * On screens ≤ 640px, rows reflow into stacked cards via CSS. The column header text
 * is injected as a data-label attribute on each td automatically — no changes needed
 * at call sites.
 */
function DataTable({ children }: { children: ReactNode }) {
	const ref = useRef<string[]>([]);
	return (
		<ColumnsRef.Provider value={ref}>
			<table>{children}</table>
		</ColumnsRef.Provider>
	);
}

DataTable.Header = function DataTableHeader({ columns }: { columns: string[] }) {
	// Populate the ref synchronously so rows can read it during the same render pass.
	const ref = useContext(ColumnsRef);
	ref.current = columns;

	return (
		<thead>
			<tr>
				{columns.map((col) => (
					<th key={col} scope="col">
						{col}
					</th>
				))}
			</tr>
		</thead>
	);
};

DataTable.Body = function DataTableBody({ children }: { children: ReactNode }) {
	return <tbody>{children}</tbody>;
};

DataTable.Row = function DataTableRow({
	children,
	onClick,
}: {
	children: ReactNode;
	onClick?: () => void;
}) {
	const ref = useContext(ColumnsRef);
	let colIndex = 0;

	const labelledChildren = Children.map(children, (child) => {
		if (!isValidElement(child)) return child;
		const label = ref.current[colIndex++];
		if (!label) return child;
		// biome-ignore lint/suspicious/noExplicitAny: cloneElement with data-label passthrough
		return cloneElement(child as any, { "data-label": label });
	});

	return (
		<tr
			onClick={onClick}
			style={onClick ? { cursor: "pointer" } : undefined}
			tabIndex={onClick ? 0 : undefined}
			onKeyDown={
				onClick
					? (e) => {
							if (e.key === "Enter" || e.key === " ") {
								e.preventDefault();
								onClick();
							}
						}
					: undefined
			}
		>
			{labelledChildren}
		</tr>
	);
};

DataTable.Cell = function DataTableCell({
	children,
	scope,
	"data-label": dataLabel,
}: {
	children: ReactNode;
	scope?: "row" | "col";
	"data-label"?: string;
}) {
	if (scope) return <th scope={scope}>{children}</th>;
	return <td data-label={dataLabel}>{children}</td>;
};

export { DataTable };
