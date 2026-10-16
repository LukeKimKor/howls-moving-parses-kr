import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Card } from "../Card.js";

describe("Card", () => {
	it("renders children inside an article", () => {
		const { container } = render(
			<Card>
				<p>content</p>
			</Card>,
		);
		expect(container.querySelector("article")).toBeTruthy();
	});

	it("Card.Header renders an h2", () => {
		render(
			<Card>
				<Card.Header>Title</Card.Header>
			</Card>,
		);
		expect(screen.getByRole("heading", { level: 2, name: "Title" })).toBeTruthy();
	});

	it("Card.Body renders children", () => {
		render(
			<Card>
				<Card.Body>
					<p>body</p>
				</Card.Body>
			</Card>,
		);
		expect(screen.getByText("body")).toBeTruthy();
	});

	it("Card.Footer renders in footer element", () => {
		const { container } = render(
			<Card>
				<Card.Footer>footer</Card.Footer>
			</Card>,
		);
		expect(container.querySelector("footer")).toBeTruthy();
	});
});
