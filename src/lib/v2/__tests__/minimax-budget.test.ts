import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSupabaseAdminClient } = vi.hoisted(() => ({ getSupabaseAdminClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdminClient }));

import { getMonthlyMinimaxSpend } from "../minimax";

function ledger(result: { data: Array<{ cost_usd: unknown }> | null; error: unknown }) {
  const chain = { select: vi.fn(), eq: vi.fn(), gte: vi.fn().mockResolvedValue(result) };
  chain.select.mockReturnValue(chain); chain.eq.mockReturnValue(chain);
  return { from: vi.fn(() => chain) };
}

describe("MiniMax budget ledger", () => {
  beforeEach(() => getSupabaseAdminClient.mockReset());

  it("fails closed when the ledger query fails", async () => {
    getSupabaseAdminClient.mockReturnValue(ledger({ data: null, error: { message: "private detail" } }));
    await expect(getMonthlyMinimaxSpend("workspace")).rejects.toThrow("No se pudo leer el consumo mensual de IA");
  });

  it.each([[[{ cost_usd: -1 }]], [[{ cost_usd: "NaN" }]]])("rejects invalid ledger values", async (data) => {
    getSupabaseAdminClient.mockReturnValue(ledger({ data, error: null }));
    await expect(getMonthlyMinimaxSpend("workspace")).rejects.toThrow("Consumo mensual de IA inválido");
  });
});
