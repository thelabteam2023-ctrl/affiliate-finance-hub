import { describe, it, expect, vi } from "vitest";
import { invalidateCanonicalCaches } from "@/lib/invalidateCanonicalCaches";

describe("invalidateCanonicalCaches", () => {
  it("should invalidate all canonical query keys for the given projetoId", async () => {
    const mockInvalidateQueries = vi.fn();
    const fakeQueryClient = {
      invalidateQueries: mockInvalidateQueries,
    } as any;

    const projetoId = "test-projeto-123";
    await invalidateCanonicalCaches(fakeQueryClient, projetoId);

    // Should invalidate canonical, operational and promotional query keys
    expect(mockInvalidateQueries).toHaveBeenCalledTimes(25);

    const calledKeys = mockInvalidateQueries.mock.calls.map(
      (call: any) => call[0].queryKey[0]
    );

    expect(calledKeys).toContain("canonical-calendar-daily");
    expect(calledKeys).toContain("calendar-apostas-rpc");
    expect(calledKeys).toContain("projeto-lucro-kpi-canonical");
    expect(calledKeys).toContain("projeto-dashboard-apostas");
    expect(calledKeys).toContain("projeto-dashboard-calendario");
    expect(calledKeys).toContain("projeto-dashboard-extras");
    expect(calledKeys).toContain("projeto-dashboard-data");
    expect(calledKeys).toContain("projeto-resultado");
    expect(calledKeys).toContain("projeto-breakdowns");
    expect(calledKeys).toContain("projeto-financial-metrics");
    expect(calledKeys).toContain("surebets-tab");
    expect(calledKeys).toContain("apostas");
    expect(calledKeys).toContain("bonus");
    expect(calledKeys).toContain("bonus-bets-summary");
    expect(calledKeys).toContain("bonus-analytics");
    expect(calledKeys).toContain("bonus-bets-juice");
    expect(calledKeys).toContain("giros-gratis");
    expect(calledKeys).toContain("giros-disponiveis");
    expect(calledKeys).toContain("cashback-manual");
    expect(calledKeys).toContain("bookmaker-saldos");
    expect(calledKeys).toContain("saldo-operavel-rpc");
    expect(calledKeys).toContain("projeto-vinculos");
    expect(calledKeys).toContain("central-operacoes-data");

    // All project-scoped calls should use the correct projetoId
    mockInvalidateQueries.mock.calls.forEach((call: any) => {
      if (call[0].queryKey[0] !== "central-operacoes-data" && call[0].queryKey[0] !== "bookmaker-saldos") {
        expect(call[0].queryKey).toContain(projetoId);
      }
      expect(call[0].refetchType).toBe("active");
    });
  });

  it("should not mix up projetoIds between calls", async () => {
    const mockInvalidateQueries = vi.fn();
    const fakeQueryClient = { invalidateQueries: mockInvalidateQueries } as any;

    await invalidateCanonicalCaches(fakeQueryClient, "projeto-A");
    await invalidateCanonicalCaches(fakeQueryClient, "projeto-B");

    // 25 keys * 2 calls = 50
    expect(mockInvalidateQueries).toHaveBeenCalledTimes(50);

    const firstBatch = mockInvalidateQueries.mock.calls.slice(0, 25);
    const secondBatch = mockInvalidateQueries.mock.calls.slice(25, 50);

    firstBatch.forEach((call: any) => {
      if (call[0].queryKey[0] !== "central-operacoes-data" && call[0].queryKey[0] !== "bookmaker-saldos") {
        expect(call[0].queryKey).toContain("projeto-A");
      }
    });
    secondBatch.forEach((call: any) => {
      if (call[0].queryKey[0] !== "central-operacoes-data" && call[0].queryKey[0] !== "bookmaker-saldos") {
        expect(call[0].queryKey).toContain("projeto-B");
      }
    });
  });
});
