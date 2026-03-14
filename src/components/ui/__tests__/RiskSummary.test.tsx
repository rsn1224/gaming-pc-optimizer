import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { RiskSummary } from "../RiskSummary";

describe("RiskSummary", () => {
  it("renders safe count when safe > 0", () => {
    render(<RiskSummary safe={3} caution={0} advanced={0} />);
    expect(screen.getByText(/安全 3件/)).toBeTruthy();
  });

  it("renders caution count when caution > 0", () => {
    render(<RiskSummary safe={0} caution={2} advanced={0} />);
    expect(screen.getByText(/注意 2件/)).toBeTruthy();
  });

  it("renders advanced count when advanced > 0", () => {
    render(<RiskSummary safe={0} caution={0} advanced={1} />);
    expect(screen.getByText(/上級 1件/)).toBeTruthy();
  });

  it("renders all three categories simultaneously", () => {
    render(<RiskSummary safe={5} caution={2} advanced={1} />);
    expect(screen.getByText(/安全 5件/)).toBeTruthy();
    expect(screen.getByText(/注意 2件/)).toBeTruthy();
    expect(screen.getByText(/上級 1件/)).toBeTruthy();
  });

  it("renders nothing when all counts are 0 and no emptyLabel", () => {
    const { container } = render(<RiskSummary safe={0} caution={0} advanced={0} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders emptyLabel when all counts are 0 and emptyLabel is provided", () => {
    render(<RiskSummary safe={0} caution={0} advanced={0} emptyLabel="変更なし" />);
    expect(screen.getByText("変更なし")).toBeTruthy();
  });

  it("does not render emptyLabel when at least one count is non-zero", () => {
    render(<RiskSummary safe={1} caution={0} advanced={0} emptyLabel="変更なし" />);
    expect(screen.queryByText("変更なし")).toBeNull();
  });

  it("does not render zero-count categories", () => {
    render(<RiskSummary safe={2} caution={0} advanced={0} />);
    expect(screen.queryByText(/注意/)).toBeNull();
    expect(screen.queryByText(/上級/)).toBeNull();
  });
});
