import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Regressão: o diálogo "Aposta já liquidada" precisa ser montado nos DOIS
 * caminhos de render do ApostaDialog (modal e janela standalone/embedded).
 *
 * Se ficar de fora de um deles, `requestLiquidadaConfirm()` nunca resolve e o
 * botão Salvar fica em silêncio absoluto ao editar uma aposta liquidada.
 */
describe("ApostaDialog — confirmação de aposta liquidada", () => {
  const src = readFileSync(
    resolve(__dirname, "../ApostaDialog.tsx"),
    "utf-8",
  );

  it("define o diálogo de confirmação uma única vez", () => {
    const defs = src.match(/const renderLiquidadaConfirmDialog\s*=/g) ?? [];
    expect(defs.length).toBe(1);
  });

  it("monta o diálogo nos dois caminhos de render (embedded e modal)", () => {
    const usos = src.match(/\{renderLiquidadaConfirmDialog\(\)\}/g) ?? [];
    expect(usos.length).toBeGreaterThanOrEqual(2);

    const embeddedIdx = src.indexOf("if (embedded && open)");
    expect(embeddedIdx).toBeGreaterThan(0);

    const primeiroUso = src.indexOf("{renderLiquidadaConfirmDialog()}");
    const ultimoUso = src.lastIndexOf("{renderLiquidadaConfirmDialog()}");
    // um uso dentro do bloco embedded, outro depois dele (modal)
    expect(primeiroUso).toBeGreaterThan(embeddedIdx);
    expect(ultimoUso).toBeGreaterThan(primeiroUso);
  });

  it("tem blindagem contra promessa pendente para sempre", () => {
    expect(src).toMatch(/setTimeout\([\s\S]{0,400}?Não foi possível confirmar a alteração/);
  });
});
