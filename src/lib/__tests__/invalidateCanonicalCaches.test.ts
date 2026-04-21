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

    // Should invalidate exactly 11 canonical query keys
    expect(mockInvalidateQueries).toHaveBeenCalledTimes(11);

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

    // 11 keys * 2 calls = 22
    expect(mockInvalidateQueries).toHaveBeenCalledTimes(22);

    const firstBatch = mockInvalidateQueries.mock.calls.slice(0, 11);
    const secondBatch = mockInvalidateQueries.mock.calls.slice(11, 22);

    firstBatch.forEach((call: any) => {
      expect(call[0].queryKey[1]).toBe("projeto-A");
    });
    secondBatch.forEach((call: any) => {
      expect(call[0].queryKey[1]).toBe("projeto-B");
    });
  });
});
