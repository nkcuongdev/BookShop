import { describe, expect, it } from "vitest";
import { buildOrderTimeline } from "./timeline";

const statuses = (steps) => steps.map((step) => step.status);
const reached = (steps) =>
  steps.filter((step) => step.reached).map((step) => step.status);

describe("buildOrderTimeline", () => {
  it("does not claim a COD order in transit has been paid", () => {
    const order = {
      payment: { method: "COD", status: "UNPAID" },
      history: [
        { from: "PENDING", to: "PROCESSING" },
        { from: "PROCESSING", to: "SHIPPED" },
      ],
    };

    const steps = buildOrderTimeline(order, "SHIPPED");

    expect(statuses(steps)).toEqual(["PENDING", "PROCESSING", "SHIPPED", "DELIVERED"]);
    expect(reached(steps)).toEqual(["PENDING", "PROCESSING", "SHIPPED"]);
  });

  it("keeps the online flow with the paid step", () => {
    const order = {
      payment: { method: "VNPAY", status: "PAID" },
      history: [{ from: "PENDING", to: "PAID" }],
    };

    const steps = buildOrderTimeline(order, "PAID");

    expect(statuses(steps)).toEqual([
      "PENDING",
      "PAID",
      "PROCESSING",
      "SHIPPED",
      "DELIVERED",
    ]);
    expect(reached(steps)).toEqual(["PENDING", "PAID"]);
  });

  it("shows the branch a cancelled PENDING order actually took", () => {
    const order = {
      payment: { method: "COD" },
      history: [{ from: "PENDING", to: "CANCELLED" }],
    };

    const steps = buildOrderTimeline(order, "CANCELLED");

    expect(statuses(steps)).toEqual(["PENDING", "CANCELLED"]);
    expect(steps.every((step) => step.reached)).toBe(true);
    expect(steps.at(-1).exception).toBe(true);
  });

  it("shows the refund path of a cancelled paid order in order", () => {
    const order = {
      payment: { method: "MOMO" },
      history: [
        { from: "PENDING", to: "PAID" },
        { from: "PAID", to: "CANCELLING" },
        { from: "CANCELLING", to: "REFUNDING" },
        { from: "REFUNDING", to: "REFUNDED" },
      ],
    };

    expect(statuses(buildOrderTimeline(order, "REFUNDED"))).toEqual([
      "PENDING",
      "PAID",
      "CANCELLING",
      "REFUNDING",
      "REFUNDED",
    ]);
  });

  it("falls back to the payment-method flow for legacy orders without history", () => {
    const steps = buildOrderTimeline({ payment: { method: "COD" } }, "PROCESSING");

    expect(reached(steps)).toEqual(["PENDING", "PROCESSING"]);
  });
});
