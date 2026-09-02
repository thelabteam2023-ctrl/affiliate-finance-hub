import { describe, it, expect } from "vitest";
import { filterParceiros, matchesParceiroStatus } from "@/lib/parceiroStatusFilter";

const ativo = { nome: "Bruno Ativo", cpf: "11111111111", status: "ativo" };
const inativo = { nome: "Ariane Aparecida", cpf: "43428484819", status: "inativo" };
const inativoSujo = { nome: "Carla Sujo", cpf: "22222222222", status: " Inativo " };
const semCpf = { nome: "Diego Sem CPF", cpf: null, status: "ativo" };

describe("filtro de status dos parceiros", () => {
  it("mostra parceiro ativo em 'Em andamento'", () => {
    expect(filterParceiros([ativo, inativo], "", "ativo")).toEqual([ativo]);
  });

  it("não mostra parceiro inativo em 'Em andamento'", () => {
    expect(filterParceiros([inativo], "", "ativo")).toEqual([]);
  });

  it("trata status com espaço/maiúscula como inativo", () => {
    expect(matchesParceiroStatus(inativoSujo, "ativo")).toBe(false);
    expect(matchesParceiroStatus(inativoSujo, "inativo")).toBe(true);
  });

  it("'Inativos' mostra apenas inativos", () => {
    expect(filterParceiros([ativo, inativo, inativoSujo], "", "inativo")).toEqual([
      inativo,
      inativoSujo,
    ]);
  });

  it("'Todos' mostra ambos", () => {
    expect(filterParceiros([ativo, inativo], "", "todos")).toHaveLength(2);
  });

  it("busca por nome e CPF continua funcionando, mesmo sem CPF", () => {
    expect(filterParceiros([ativo, semCpf], "diego", "ativo")).toEqual([semCpf]);
    expect(filterParceiros([ativo, semCpf], "1111", "ativo")).toEqual([ativo]);
  });
});
