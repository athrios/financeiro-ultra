import { beforeAll, describe, expect, it } from "vitest";

import {
  CLIENTS_PATH,
  cadSessions,
  callAction,
  clientFields,
  createClient,
  createPartner,
  errorOf,
  flashOf,
  runSuffix,
  versionAt,
  type ActionResult,
} from "./support/cadastros";
import type { Session } from "./support/http";
import { getPage } from "./support/pages";

/**
 * CAD-001 · concorrência na gravação do cliente (E10, testes permanentes; CA-07 e CA-18, fecha a
 * lacuna QA-CAD-03), por HTTP e sem navegador. Dois envios de `saveClientAction` disparados juntos
 * (`Promise.all`) sobre o mesmo cliente e a mesma versão (token): exatamente um grava e o outro
 * recebe `STALE_VERSION`; e, quando cada envio retira um sócio diferente de um cliente com dois
 * sócios, o cliente ativo nunca fica sem sócio. A defesa é a trava da linha do cliente mais a
 * conferência de versão no banco; este teste repete a prova da B1 de forma automática.
 *
 * Cada rodada usa um cliente próprio, com nome único da execução. Tudo fictício (RAT-D019).
 */

const run = runSuffix();
const ROUNDS = 4;

let admin: Session;
let partnerA = "";
let partnerB = "";

beforeAll(async () => {
  admin = cadSessions().admin;
  partnerA = await createPartner(admin, `Sócio Conc A ${run}`);
  partnerB = await createPartner(admin, `Sócio Conc B ${run}`);
});

const editPath = (id: string) => `${CLIENTS_PATH}/${id}/editar`;

function save(id: string, name: string, partnerIds: string[], version: string, notes: string): Promise<ActionResult> {
  return callAction(admin, editPath(id), "saveClientAction", clientFields({ name, notes, partnerIds }, { id, version }));
}

/** Um grava (303 'salvo') e o outro falha com STALE_VERSION, sem redirecionamento. */
function expectOneWinnerOneStale(results: [ActionResult, ActionResult]): { winner: 0 | 1 } {
  const saved = results.map((result) => flashOf(result) === "salvo");
  expect(saved.filter(Boolean), `gravaram: ${saved.join(",")}`).toHaveLength(1);
  const winner = saved[0] ? 0 : 1;
  const loser = results[winner === 0 ? 1 : 0];
  expect(loser.failed).toBe(true);
  // O banco responde com a chave estável STALE_VERSION (dica); o código geral da ação é CONFLICT.
  expect(loser.hint).toBe("STALE_VERSION");
  expect(errorOf(loser)?.code).toBe("CONFLICT");
  expect(errorOf(loser)?.message).toBe("Este cliente foi alterado enquanto você editava. Suas alterações não foram salvas.");
  expect(loser.text).toContain("currentUpdatedAt");
  expect(loser.location).toBeNull();
  return { winner };
}

describe("duas gravações simultâneas com a mesma versão (CA-18)", () => {
  it(`exatamente uma grava e a outra devolve STALE_VERSION (${ROUNDS} rodadas, cada uma com cliente novo)`, async () => {
    for (let round = 1; round <= ROUNDS; round += 1) {
      const name = `Concorrente ${round} ${run}`;
      const id = await createClient(admin, { name, partnerIds: [partnerA] });
      const version = await versionAt(admin, editPath(id));

      const results = await Promise.all([
        save(id, name, [partnerA], version, `Observação 1 da rodada ${round} ${run}`),
        save(id, name, [partnerA], version, `Observação 2 da rodada ${round} ${run}`),
      ]);
      const { winner } = expectOneWinnerOneStale(results);

      // Só o texto do vencedor ficou gravado; o do perdedor não aparece em lugar nenhum.
      const detail = await getPage(admin.jar, `${CLIENTS_PATH}/${id}`);
      expect(detail.text, `rodada ${round}`).toContain(`Observação ${winner + 1} da rodada ${round} ${run}`);
      expect(detail.text, `rodada ${round}`).not.toContain(`Observação ${winner === 0 ? 2 : 1} da rodada ${round} ${run}`);
    }
  });

  it("o perdedor, relendo a versão, grava normalmente (o conflito não deixa o cliente travado)", async () => {
    const name = `Concorrente Retoma ${run}`;
    const id = await createClient(admin, { name, partnerIds: [partnerA] });
    const version = await versionAt(admin, editPath(id));
    const results = await Promise.all([save(id, name, [partnerA], version, "Primeira"), save(id, name, [partnerA], version, "Segunda")]);
    expectOneWinnerOneStale(results);
    const again = await save(id, name, [partnerA], await versionAt(admin, editPath(id)), "Depois do conflito");
    expect(flashOf(again)).toBe("salvo");
    const detail = await getPage(admin.jar, `${CLIENTS_PATH}/${id}`);
    expect(detail.text).toContain("Depois do conflito");
  });
});

describe("duas retiradas simultâneas de sócios diferentes (CA-07)", () => {
  it(`cada envio retira um sócio de um cliente com 2 sócios: um grava, o outro é recusado e o cliente fica com pelo menos 1 sócio ativo (${ROUNDS} rodadas)`, async () => {
    for (let round = 1; round <= ROUNDS; round += 1) {
      const name = `Retirada ${round} ${run}`;
      const id = await createClient(admin, { name, partnerIds: [partnerA, partnerB] });
      const version = await versionAt(admin, editPath(id));

      // Um retira o B (fica o A) e o outro retira o A (fica o B).
      const results = await Promise.all([save(id, name, [partnerA], version, "retira B"), save(id, name, [partnerB], version, "retira A")]);
      const { winner } = expectOneWinnerOneStale(results);

      const detail = await getPage(admin.jar, `${CLIENTS_PATH}/${id}`);
      const keptName = winner === 0 ? `Sócio Conc A ${run}` : `Sócio Conc B ${run}`;
      const goneName = winner === 0 ? `Sócio Conc B ${run}` : `Sócio Conc A ${run}`;
      expect(detail.text, `rodada ${round}`).toContain(keptName);
      expect(detail.text, `rodada ${round}`).not.toContain(goneName);
      expect(detail.text, `rodada ${round}`).toContain("divisão: 1/1");
      expect(detail.text, `rodada ${round}`).not.toContain("Cliente inativo");
    }
  });

  it("a mesma retirada em dobro (as duas tiram o mesmo sócio) também grava uma só vez", async () => {
    const name = `Retirada Igual ${run}`;
    const id = await createClient(admin, { name, partnerIds: [partnerA, partnerB] });
    const version = await versionAt(admin, editPath(id));
    const results = await Promise.all([save(id, name, [partnerA], version, "x"), save(id, name, [partnerA], version, "y")]);
    expectOneWinnerOneStale(results);
    const detail = await getPage(admin.jar, `${CLIENTS_PATH}/${id}`);
    expect(detail.text).toContain(`Sócio Conc A ${run}`);
    expect(detail.text).not.toContain(`Sócio Conc B ${run}`);
  });
});
