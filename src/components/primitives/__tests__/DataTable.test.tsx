import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DataTable } from "../DataTable.js";

describe("DataTable", () => {
	it("leaves missing cells visually empty and accessible while preserving confirmed zero", () => {
		const { container } = render(
			<DataTable>
				<DataTable.Body>
					<DataTable.Row>
						<DataTable.Cell>—</DataTable.Cell>
						<DataTable.Cell>-/-</DataTable.Cell>
						<DataTable.Cell>
							<span>—</span>
						</DataTable.Cell>
						<DataTable.Cell>{null}</DataTable.Cell>
						<DataTable.Cell>{0}</DataTable.Cell>
					</DataTable.Row>
				</DataTable.Body>
			</DataTable>,
		);
		const cells = [...container.querySelectorAll("td")];
		expect(cells.map((c) => c.textContent)).toEqual(["", "", "", "", "0"]);
		expect(screen.getAllByRole("img", { name: "값 미확인" })).toHaveLength(4);
	});
	it('renders column headers with scope="col"', () => {
		render(
			<DataTable>
				<DataTable.Header columns={["이름", "점수", "순위"]} />
				<DataTable.Body>{null}</DataTable.Body>
			</DataTable>,
		);
		const ths = screen.getAllByRole("columnheader");
		expect(ths).toHaveLength(3);
		for (const th of ths) {
			expect(th.getAttribute("scope")).toBe("col");
		}
	});

	it("renders rows inside tbody", () => {
		const { container } = render(
			<DataTable>
				<DataTable.Header columns={["A"]} />
				<DataTable.Body>
					<DataTable.Row>
						<DataTable.Cell>data</DataTable.Cell>
					</DataTable.Row>
				</DataTable.Body>
			</DataTable>,
		);
		expect(container.querySelector("tbody tr td")).toBeTruthy();
		expect(screen.getByText("data")).toBeTruthy();
	});

	it('DataTable.Cell with scope="row" renders as th', () => {
		const { container } = render(
			<DataTable>
				<DataTable.Header columns={["A"]} />
				<DataTable.Body>
					<DataTable.Row>
						<DataTable.Cell scope="row">header</DataTable.Cell>
					</DataTable.Row>
				</DataTable.Body>
			</DataTable>,
		);
		const th = container.querySelector('tbody th[scope="row"]');
		expect(th).toBeTruthy();
	});
});
