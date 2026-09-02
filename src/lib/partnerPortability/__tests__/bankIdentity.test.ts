import { describe, it, expect } from "vitest";
import { canonicalBankName, canonicalBankCode, matchBanco, type BancoRow } from "../bankIdentity";

const WS = "ws-b";
const bancos: BancoRow[] = [
  { id: "sys-neon", nome: "Neon Pagamentos S.A.", codigo: "735", is_system: true, workspace_id: null },
  { id: "sys-itau", nome: "Itaú Unibanco S.A.", codigo: "341", is_system: true, workspace_id: null },
  { id: "ws-custom", nome: "Banco Interno LabBet", codigo: "999", is_system: false, workspace_id: WS },
  { id: "other-ws", nome: "Banco Alheio", codigo: "998", is_system: false, workspace_id: "ws-a" },
];

describe("bankIdentity", () => {
  it("normaliza nomes ignorando acentos e sufixos societários", () => {
    expect(canonicalBankName("Itaú Unibanco S.A.")).toBe(canonicalBankName("itau unibanco sa"));
  });

  it("normaliza código bancário", () => {
    expect(canonicalBankCode("0735")).toBe("735");
    expect(canonicalBankCode(null)).toBe("");
  });

  it("resolve banco de sistema por código", () => {
    const r = matchBanco(bancos, { banco: "Nome Divergente", banco_codigo: "0735" }, WS);
    expect(r?.row.id).toBe("sys-neon");
    expect(r?.reason).toBe("codigo_sistema");
  });

  it("resolve banco de sistema por nome quando não há código", () => {
    const r = matchBanco(bancos, { banco: "Neon Pagamentos S.A." }, WS);
    expect(r?.row.id).toBe("sys-neon");
    expect(r?.reason).toBe("nome_sistema");
  });

  it("resolve banco personalizado do próprio workspace", () => {
    const r = matchBanco(bancos, { banco: "Banco Interno LabBet" }, WS);
    expect(r?.row.id).toBe("ws-custom");
    expect(r?.reason).toBe("workspace");
  });

  it("não usa banco personalizado de outro workspace", () => {
    expect(matchBanco(bancos, { banco: "Banco Alheio" }, WS)).toBeNull();
  });
});
