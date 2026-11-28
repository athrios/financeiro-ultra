import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { LIST_LIMITS } from "./limits";

/**
 * Concordância dos tetos de itens (RAT-D026) entre a aplicação (`limits.ts`, espelho) e o banco
 * (`private.cad_list_limit`, autoridade). Conferência estática dos arquivos de migration: se um número
 * mudar só de um lado, este teste quebra. Mesmo padrão de `supabase-config.test.ts`.
 */

function migration(name: string): string {
  return readFileSync(join(process.cwd(), "supabase", "migrations", name), "utf8").replace(/\r\n/g, "\n");
}

/** Recorta de `create function private.cad_list_limit` até o primeiro `$$;` seguinte. */
function cutListLimitFunction(sql: string): string | null {
  const start = sql.indexOf("create function private.cad_list_limit");
  if (start === -1) return null;
  const end = sql.indexOf("$$;", start);
  return end === -1 ? null : sql.slice(start, end + 3);
}

/** Pares `when 'CHAVE' then return N;` do trecho, como objeto. */
function extractLimits(snippet: string): Record<string, number> {
  const limits: Record<string, number> = {};
  for (const match of snippet.matchAll(/when '([A-Z_]+)'\s+then return (\d+);/g)) {
    limits[match[1]] = Number(match[2]);
  }
  return limits;
}

function countOccurrences(text: string, needle: string): number {
  return text.split(needle).length - 1;
}

describe("o extrator dos tetos do SQL", () => {
  const sample = `create function private.cad_list_limit(p_list text)
returns integer
as $$
begin
  case p_list
    when 'PARTNER_ALIAS'         then return 2;
    when 'NAME_VARIANT'          then return 30;
    when 'OUTRA'                 then return 7;
    else
      raise exception 'sem teto';
  end case;
end;
$$;
-- depois da função: não entra no recorte
-- when 'FORA_DO_TRECHO' then return 99;
`;

  it("recorta só a função e lê os pares chave/número", () => {
    const snippet = cutListLimitFunction(sample);
    expect(snippet).not.toBeNull();
    expect(snippet).not.toContain("FORA_DO_TRECHO");
    expect(extractLimits(snippet ?? "")).toEqual({ PARTNER_ALIAS: 2, NAME_VARIANT: 30, OUTRA: 7 });
  });

  it("sem a função, não há recorte; sem pares, não há limites", () => {
    expect(cutListLimitFunction("select 1;")).toBeNull();
    expect(cutListLimitFunction("create function private.cad_list_limit(p_list text) as $$ begin")).toBeNull();
    expect(extractLimits("nada aqui")).toEqual({});
  });
});

describe("RAT-D026: os tetos do banco e da aplicação concordam", () => {
  const sql0300 = migration("20261125000300_cad_partner_receiver_rpcs.sql");
  const sql0400 = migration("20261125000400_cad_client_rpcs.sql");

  it("private.cad_list_limit (0300) tem os mesmos pares de LIST_LIMITS", () => {
    const snippet = cutListLimitFunction(sql0300);
    expect(snippet, "função private.cad_list_limit não encontrada na 0300").not.toBeNull();
    expect(extractLimits(snippet ?? "")).toEqual(LIST_LIMITS);
  });

  it("os números fixos da regra", () => {
    expect(LIST_LIMITS.PARTNER_ALIAS).toBe(2);
    expect(LIST_LIMITS.CLIENT_ALIAS_NAME).toBe(2);
    expect(LIST_LIMITS.CLIENT_ALIAS_DOCUMENT).toBe(2);
    expect(LIST_LIMITS.NAME_VARIANT).toBe(30);
    expect(LIST_LIMITS.PIX_KEY).toBe(10);
    expect(LIST_LIMITS.BANK_ACCOUNT).toBe(10);
  });

  it("o hint LIST_LIMIT_EXCEEDED é levantado pela 0300", () => {
    expect(sql0300).toContain("hint = 'LIST_LIMIT_EXCEEDED'");
  });

  it("a conferência do teto está nas funções de gravação: 2 chamadas na 0300 e 1 na 0400", () => {
    expect(countOccurrences(sql0300, "perform private.assert_list_limit(")).toBe(2);
    expect(countOccurrences(sql0400, "perform private.assert_list_limit(")).toBe(1);
  });
});
