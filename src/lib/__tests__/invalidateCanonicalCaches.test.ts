import { describe, it, expect, vi } from "vitest";
import { invalidateCanonicalCaches } from "@/lib/invalidateCanonicalCaches";

describe("invalidateCanonicalCaches", () => {
  it("should invalidate all canonical query keys for the given projetoId", () => {
    const mockInvalidateQueries = vi.fn();
    const fakeQueryClient = {
      invalidateQueries: mockInvalidateQueries,
    } as any;

    const projetoId = "test-projeto-123";
    invalidateCanonicalCaches(fakeQueryClient, projetoId);

    // Should invalidate exactly 10 canonical query keys
    expect(mockInvalidateQueries).toHaveBeenCalledTimes(10);

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

    // All calls should use the correct projetoId
    mockInvalidateQueries.mock.calls.forEach((call: any) => {
      expect(call[0].queryKey[1]).toBe(projetoId);
      expect(call[0].refetchType).toBe("active");
    });
  });

  it("should not mix up projetoIds between calls", () => {
    const mockInvalidateQueries = vi.fn();
    const fakeQueryClient = { invalidateQueries: mockInvalidateQueries } as any;

    invalidateCanonicalCaches(fakeQueryClient, "projeto-A");
    invalidateCanonicalCaches(fakeQueryClient, "projeto-B");

    // 10 keys * 2 calls = 20
    expect(mockInvalidateQueries).toHaveBeenCalledTimes(20);

    const firstBatch = mockInvalidateQueries.mock.calls.slice(0, 10);
    const secondBatch = mockInvalidateQueries.mock.calls.slice(10, 20);

    firstBatch.forEach((call: any) => {
      expect(call[0].queryKey[1]).toBe("projeto-A");
    });
    secondBatch.forEach((call: any) => {
      expect(call[0].queryKey[1]).toBe("projeto-B");
    });
  });
});
