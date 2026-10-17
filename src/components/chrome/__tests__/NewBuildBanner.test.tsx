import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NewBuildBanner } from "../NewBuildBanner.js";

describe("NewBuildBanner", () => {
	it("renders when visible is true", () => {
		render(<NewBuildBanner visible onRefresh={() => {}} onDismiss={() => {}} />);
		expect(screen.getByRole("status")).toBeTruthy();
		expect(screen.getByText(/새 데이터가 있습니다/)).toBeTruthy();
	});

	it("does not render when visible is false", () => {
		const { container } = render(
			<NewBuildBanner visible={false} onRefresh={() => {}} onDismiss={() => {}} />,
		);
		expect(container.firstChild).toBeNull();
	});

	it("clicking Refresh calls onRefresh", () => {
		const onRefresh = vi.fn();
		render(<NewBuildBanner visible onRefresh={onRefresh} onDismiss={() => {}} />);
		fireEvent.click(screen.getByText("새로고침"));
		expect(onRefresh).toHaveBeenCalledOnce();
	});

	it("clicking × calls onDismiss", () => {
		const onDismiss = vi.fn();
		render(<NewBuildBanner visible onRefresh={() => {}} onDismiss={onDismiss} />);
		fireEvent.click(screen.getByLabelText("알림 닫기"));
		expect(onDismiss).toHaveBeenCalledOnce();
	});

	it('has role="status" and aria-live="polite"', () => {
		render(<NewBuildBanner visible onRefresh={() => {}} onDismiss={() => {}} />);
		const banner = screen.getByRole("status");
		expect(banner.getAttribute("aria-live")).toBe("polite");
	});
});
