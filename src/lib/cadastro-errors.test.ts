import { describe, expect, it } from "vitest";

import { CADASTRO_HINTS, joinNames, mapCadastroError, type CadastroHint } from "./cadastro-errors";
import { AppError, fail, mapDatabaseError, toAppError } from "./errors";

/** Erro como o PostgREST entrega: `code` = SQLSTATE, `hint` = chave, `details` = DETAIL do Postgres (JSON em texto). */
function dbError(code: string, hint: string | null, detail?: unknown, message = "mensagem original do banco (tabela public.clients)") {
  return {
    code,
    hint,
    message,
    details: detail === undefined ? null : typeof detail === "string" ? detail : JSON.stringify(detail),
  };
}

const OWNER_CLIENT_ACTIVE = { kind: "client", id: "c0000000-0000-4000-8000-000000000001", name: "Cliente Modelo Ltda", active: true };
const OWNER_CLIENT_INACTIVE = { ...OWNER_CLIENT_ACTIVE, active: false };

describe("contrato 6.3: cobertura", () => {
  it("há mensagem para todos os hints da modelagem e da extensão da E3b", () => {
    const expected: CadastroHint[] = [
      "ADMIN_REQUIRED", "NOT_FOUND", "VERSION_REQUIRED", "STALE_VERSION", "NAME_REQUIRED", "NAME_TOO_LONG",
      "NOTES_TOO_LONG", "INVALID_DOCUMENT", "INVALID_AMOUNT", "INVALID_PIX_KEY", "INVALID_BANK", "INVALID_BRANCH",
      "INVALID_ACCOUNT", "INVALID_IDENTIFIER", "ACTIVE_REQUIRED", "LIST_REQUIRED", "INVALID_FILTER",
      "DOCUMENT_TAKEN", "ALIAS_TAKEN", "PARTNER_NAME_TAKEN", "IDENTIFIER_TAKEN", "PARTNER_INACTIVE",
      "PARTNER_HAS_CLIENTS", "RECEIVERS_CHANGED", "PARTNER_HAS_ACTIVE_RECEIVERS", "CLIENT_WITHOUT_PARTNER",
      "POSSIBLE_DUPLICATE", "RECEIVER_PARTNER_IMMUTABLE", "IMMUTABLE_FIELD", "LIST_LIMIT_EXCEEDED",
    ];
    expect([...CADASTRO_HINTS].sort()).toEqual([...expected].sort());
  });

  it("nenhuma mensagem vaza texto do banco, tabela, SQL ou jargão", () => {
    const samples: Array<[string, string]> = [
      ["42501", "ADMIN_REQUIRED"], ["P0002", "NOT_FOUND"], ["22023", "VERSION_REQUIRED"], ["P0001", "STALE_VERSION"],
      ["22023", "NAME_REQUIRED"], ["22023", "NAME_TOO_LONG"], ["22023", "NOTES_TOO_LONG"], ["22023", "INVALID_DOCUMENT"],
      ["22023", "INVALID_AMOUNT"], ["22023", "INVALID_PIX_KEY"], ["22023", "INVALID_BANK"], ["22023", "INVALID_BRANCH"],
      ["22023", "INVALID_ACCOUNT"], ["22023", "INVALID_IDENTIFIER"], ["22023", "ACTIVE_REQUIRED"],
      ["22023", "LIST_REQUIRED"], ["22023", "INVALID_FILTER"], ["23505", "DOCUMENT_TAKEN"], ["23505", "ALIAS_TAKEN"],
      ["23505", "PARTNER_NAME_TAKEN"], ["23505", "IDENTIFIER_TAKEN"], ["P0001", "PARTNER_INACTIVE"],
      ["P0001", "PARTNER_HAS_CLIENTS"], ["P0001", "RECEIVERS_CHANGED"], ["P0001", "PARTNER_HAS_ACTIVE_RECEIVERS"],
      ["P0001", "CLIENT_WITHOUT_PARTNER"], ["P0001", "POSSIBLE_DUPLICATE"], ["P0001", "RECEIVER_PARTNER_IMMUTABLE"],
      ["P0001", "IMMUTABLE_FIELD"], ["22023", "LIST_LIMIT_EXCEEDED"],
    ];
    expect(samples).toHaveLength(CADASTRO_HINTS.length);
    for (const [code, hint] of samples) {
      const mapped = mapDatabaseError(dbError(code, hint));
      expect(mapped.hint).toBe(hint);
      expect(mapped.message.length).toBeGreaterThan(10);
      expect(mapped.message).not.toMatch(/public\.|clients|partners|SQLSTATE|RLS|constraint|violates|!/i);
      expect(mapped.message).not.toContain("mensagem original");
    }
  });
});

describe("hints sem detail", () => {
  it.each([
    ["42501", "ADMIN_REQUIRED", "FORBIDDEN", "Você não tem permissão para fazer esta alteração."],
    ["P0002", "NOT_FOUND", "NOT_FOUND", "Este cadastro não está mais disponível."],
    ["22023", "VERSION_REQUIRED", "VALIDATION", "Não foi possível identificar a versão do cadastro. Atualize a página e tente novamente."],
    ["22023", "NOTES_TOO_LONG", "VALIDATION", "As observações podem ter no máximo 2000 caracteres."],
    ["P0001", "RECEIVER_PARTNER_IMMUTABLE", "RULE_VIOLATION", "O sócio de um recebedor não pode ser trocado. Inative este recebedor e cadastre outro."],
    ["P0001", "IMMUTABLE_FIELD", "RULE_VIOLATION", "Este dado não pode ser alterado depois de cadastrado."],
    ["P0001", "PARTNER_HAS_ACTIVE_RECEIVERS", "RULE_VIOLATION", "O sócio ainda tem recebedores ativos. Atualize a página, confira a lista e tente de novo."],
    ["22023", "ACTIVE_REQUIRED", "VALIDATION", "Não foi possível identificar a ação pedida. Atualize a página e tente novamente."],
  ] as const)("%s %s", (sqlstate, hint, code, message) => {
    const mapped = mapDatabaseError(dbError(sqlstate, hint));
    expect(mapped).toBeInstanceOf(AppError);
    expect(mapped.code).toBe(code);
    expect(mapped.hint).toBe(hint);
    expect(mapped.message).toBe(message);
    expect(mapped.details).toBeUndefined();
  });

  it("INVALID_AMOUNT aponta o campo da mensalidade", () => {
    const mapped = mapDatabaseError(dbError("22023", "INVALID_AMOUNT", { field: "default_monthly_value" }));
    expect(mapped.field).toBe("monthlyValue");
    expect(mapped.code).toBe("VALIDATION");
  });

  it("identificadores de recebedor inválidos apontam o campo `identifiers`", () => {
    for (const hint of ["INVALID_PIX_KEY", "INVALID_BANK", "INVALID_BRANCH", "INVALID_ACCOUNT"]) {
      const mapped = mapDatabaseError(dbError("22023", hint, { field: "identifiers", value: "x" }));
      expect(mapped.field).toBe("identifiers");
      expect(mapped.code).toBe("VALIDATION");
    }
    expect(mapDatabaseError(dbError("22023", "INVALID_BRANCH")).message).toBe("Agência inválida. Use só números, hífen e a letra X.");
  });
});

describe("campos (NAME_*, LIST_REQUIRED, INVALID_*, NOT_FOUND)", () => {
  it("NAME_REQUIRED por campo", () => {
    const cases: Array<[string, string, string]> = [
      ["name", "name", "Informe o nome do sócio."],
      ["holder_name", "holderName", "Informe o nome do titular."],
      ["legal_name", "legalName", "Informe o nome ou a razão social."],
      ["trade_name", "tradeName", "O nome fantasia não pode ter só pontuação. Preencha ou apague o campo."],
      ["aliases", "aliases", "Há um apelido em branco ou só com pontuação. Preencha ou remova."],
      ["identifiers", "identifiers", "Há uma forma do nome em branco ou só com pontuação. Preencha ou remova."],
    ];
    for (const [dbField, formField, message] of cases) {
      const mapped = mapDatabaseError(dbError("22023", "NAME_REQUIRED", { field: dbField }));
      expect(mapped.field).toBe(formField);
      expect(mapped.message).toBe(message);
    }
  });

  it("NAME_TOO_LONG por campo (o texto do titular é o da UI 7.2)", () => {
    const holder = mapDatabaseError(dbError("22023", "NAME_TOO_LONG", { field: "holder_name" }));
    expect(holder.message).toBe("O nome do titular pode ter no máximo 200 caracteres.");
    expect(holder.field).toBe("holderName");
    expect(mapDatabaseError(dbError("22023", "NAME_TOO_LONG", { field: "legal_name" })).field).toBe("legalName");
  });

  it("LIST_REQUIRED e INVALID_IDENTIFIER (E3b) apontam a lista", () => {
    for (const [dbField, formField] of [["aliases", "aliases"], ["identifiers", "identifiers"], ["partner_ids", "partnerIds"]]) {
      const list = mapDatabaseError(dbError("22023", "LIST_REQUIRED", { field: dbField }));
      expect(list.code).toBe("VALIDATION");
      expect(list.field).toBe(formField);
      expect(list.hint).toBe("LIST_REQUIRED");
    }
    const invalid = mapDatabaseError(dbError("22023", "INVALID_IDENTIFIER", { field: "aliases" }));
    expect(invalid.field).toBe("aliases");
    expect(invalid.hint).toBe("INVALID_IDENTIFIER");
  });

  it("INVALID_FILTER (E3b) aponta o filtro", () => {
    for (const field of ["status", "kind", "limit", "offset"]) {
      const mapped = mapDatabaseError(dbError("22023", "INVALID_FILTER", { field }));
      expect(mapped.field).toBe(field);
      expect(mapped.code).toBe("VALIDATION");
    }
  });

  it("NOT_FOUND com detail (E3b): sócio da lista ou do recebedor", () => {
    const list = mapDatabaseError(dbError("P0002", "NOT_FOUND", { field: "partner_ids" }));
    expect(list.field).toBe("partnerIds");
    expect(list.code).toBe("NOT_FOUND");
    const receiver = mapDatabaseError(dbError("P0002", "NOT_FOUND", { field: "partner_id" }));
    expect(receiver.field).toBe("partnerId");
    expect(receiver.message).toBe("O sócio deste recebedor não foi encontrado.");
  });
});

describe("INVALID_DOCUMENT", () => {
  it("campo do documento: a mensagem segue o tipo do contexto (UI 4.1.2)", () => {
    const detail = { field: "document" };
    expect(mapDatabaseError(dbError("22023", "INVALID_DOCUMENT", detail), { documentLabel: "CPF" }).message).toBe(
      "CPF inválido. Confira os números.",
    );
    expect(mapDatabaseError(dbError("22023", "INVALID_DOCUMENT", detail), { documentLabel: "CNPJ" }).message).toBe(
      "CNPJ inválido. Confira os números e as letras.",
    );
    const generic = mapDatabaseError(dbError("22023", "INVALID_DOCUMENT", detail));
    expect(generic.message).toBe("Documento inválido. Confira os números e as letras.");
    expect(generic.field).toBe("document");
  });

  it("apelido-documento: o tipo vem do tamanho do valor enviado", () => {
    const cpf = mapDatabaseError(dbError("22023", "INVALID_DOCUMENT", { field: "aliases", value: "000.000.001-92" }));
    expect(cpf.message).toBe("CPF inválido. Confira os números.");
    expect(cpf.field).toBe("aliases");
    const cnpj = mapDatabaseError(dbError("22023", "INVALID_DOCUMENT", { field: "aliases", value: "12.ABC.345/01DE-36" }));
    expect(cnpj.message).toBe("CNPJ inválido. Confira os números e as letras.");
    const unknown = mapDatabaseError(dbError("22023", "INVALID_DOCUMENT", { field: "aliases", value: "123" }));
    expect(unknown.message).toBe("Documento inválido. Confira os números e as letras.");
  });
});

describe("STALE_VERSION", () => {
  it("mensagem por tipo de cadastro e a versão atual em texto, com microssegundos", () => {
    const detail = { current_updated_at: "2026-11-25T14:03:11.123456+00:00" };
    const client = mapDatabaseError(dbError("P0001", "STALE_VERSION", detail), { subject: "client" });
    expect(client.code).toBe("CONFLICT");
    expect(client.message).toBe("Este cliente foi alterado enquanto você editava. Suas alterações não foram salvas.");
    expect(client.details).toEqual({ hint: "STALE_VERSION", currentUpdatedAt: "2026-11-25T14:03:11.123456+00:00" });

    expect(mapDatabaseError(dbError("P0001", "STALE_VERSION", detail), { subject: "partner" }).message).toBe(
      "Este sócio foi alterado enquanto você editava. Suas alterações não foram salvas.",
    );
    expect(mapDatabaseError(dbError("P0001", "STALE_VERSION", detail), { subject: "receiver" }).message).toBe(
      "Este recebedor foi alterado enquanto você editava. Suas alterações não foram salvas.",
    );
    expect(mapDatabaseError(dbError("P0001", "STALE_VERSION", detail)).message).toBe(
      "Este cadastro foi alterado por outra pessoa enquanto você editava. Suas alterações não foram salvas.",
    );
  });

  it("T-18: inativar e reativar não falam em edição nem em alterações perdidas", () => {
    const detail = { current_updated_at: "2026-11-25T14:03:11.123456+00:00" };
    const nouns = { client: "cliente", partner: "sócio", receiver: "recebedor" } as const;
    for (const [subject, noun] of Object.entries(nouns) as Array<[keyof typeof nouns, string]>) {
      expect(mapDatabaseError(dbError("P0001", "STALE_VERSION", detail), { subject, operation: "deactivate" }).message).toBe(
        `Este ${noun} foi alterado por outra pessoa. A inativação não foi feita. Atualize a tela e tente de novo.`,
      );
      expect(mapDatabaseError(dbError("P0001", "STALE_VERSION", detail), { subject, operation: "activate" }).message).toBe(
        `Este ${noun} foi alterado por outra pessoa. A reativação não foi feita. Atualize a tela e tente de novo.`,
      );
      // Nos formulários de edição a frase atual fica.
      expect(mapDatabaseError(dbError("P0001", "STALE_VERSION", detail), { subject, operation: "save" }).message).toContain(
        "enquanto você editava",
      );
    }
  });

  it("detail ausente ou malformado não derruba a mensagem", () => {
    for (const detail of [undefined, "isto não é json", "[1,2]", '{"current_updated_at": 5}']) {
      const mapped = mapDatabaseError(dbError("P0001", "STALE_VERSION", detail));
      expect(mapped.hint).toBe("STALE_VERSION");
      expect(mapped.details).toEqual({ hint: "STALE_VERSION", currentUpdatedAt: null });
    }
  });

  it("a versão atual nunca vira Date (a string passa intacta)", () => {
    const mapped = mapDatabaseError(dbError("P0001", "STALE_VERSION", { current_updated_at: "2026-01-02T03:04:05.000001+00:00" }));
    expect(mapped.details).toMatchObject({ currentUpdatedAt: "2026-01-02T03:04:05.000001+00:00" });
  });
});

describe("documento, apelido, nome e identificador repetidos (dono com id, nome e situação)", () => {
  it("DOCUMENT_TAKEN, cliente ativo (UI 4.1.2)", () => {
    const mapped = mapDatabaseError(
      dbError("23505", "DOCUMENT_TAKEN", { field: "document", owner: OWNER_CLIENT_ACTIVE }),
      { documentLabel: "CNPJ" },
    );
    expect(mapped.code).toBe("CONFLICT");
    expect(mapped.message).toBe("Já existe um cliente com este CNPJ: Cliente Modelo Ltda.");
    expect(mapped.field).toBe("document");
    expect(mapped.details).toEqual({
      hint: "DOCUMENT_TAKEN",
      field: "document",
      value: null,
      owner: OWNER_CLIENT_ACTIVE,
    });
  });

  it("DOCUMENT_TAKEN, cliente inativo manda reativar", () => {
    const mapped = mapDatabaseError(
      dbError("23505", "DOCUMENT_TAKEN", { field: "document", owner: OWNER_CLIENT_INACTIVE }),
      { documentLabel: "CPF" },
    );
    expect(mapped.message).toBe(
      "Já existe um cliente inativo com este CPF: Cliente Modelo Ltda. Para voltar a usar este cadastro, reative-o.",
    );
    expect(mapped.details).toMatchObject({ owner: { id: OWNER_CLIENT_INACTIVE.id, active: false } });
  });

  it("DOCUMENT_TAKEN sem contexto diz 'documento'; como apelido, usa a frase do apelido", () => {
    expect(mapDatabaseError(dbError("23505", "DOCUMENT_TAKEN", { field: "document", owner: OWNER_CLIENT_ACTIVE })).message).toBe(
      "Já existe um cliente com este documento: Cliente Modelo Ltda.",
    );
    const alias = mapDatabaseError(dbError("23505", "DOCUMENT_TAKEN", { field: "aliases", owner: OWNER_CLIENT_ACTIVE }));
    expect(alias.message).toBe("Este documento já é o documento do cliente Cliente Modelo Ltda.");
    expect(alias.field).toBe("aliases");
  });

  it("DOCUMENT_TAKEN sem detail legível ainda devolve mensagem e campo, sem dados do dono", () => {
    const mapped = mapDatabaseError(dbError("23505", "DOCUMENT_TAKEN", "{lixo"), { documentLabel: "CPF" });
    expect(mapped.message).toBe("Já existe um cliente com este CPF.");
    expect(mapped.field).toBe("document");
    expect(mapped.details).toBeUndefined();
  });

  it("ALIAS_TAKEN", () => {
    const mapped = mapDatabaseError(
      dbError("23505", "ALIAS_TAKEN", { field: "aliases", value: "mod semente", owner: OWNER_CLIENT_ACTIVE }),
    );
    expect(mapped.message).toBe("Este apelido já pertence ao cliente Cliente Modelo Ltda.");
    expect(mapped.details).toMatchObject({ hint: "ALIAS_TAKEN", value: "mod semente", owner: { name: "Cliente Modelo Ltda" } });
  });

  const partnerOwner = (via: string, active = true) => ({
    kind: "partner", id: "a0000000-0000-4000-8000-000000000001", name: "Sócio Exemplo A", active, via,
  });

  it("PARTNER_NAME_TAKEN: nome de sócio (ativo e inativo) e apelido (UI 5.2)", () => {
    const active = mapDatabaseError(
      dbError("23505", "PARTNER_NAME_TAKEN", { field: "name", value: "socio exemplo a", owner: partnerOwner("NAME") }),
    );
    expect(active.message).toBe(
      "Já existe um sócio com este nome. Nomes que só mudam em acento, maiúscula ou pontuação contam como o mesmo.",
    );
    expect(active.field).toBe("name");
    expect(active.details).toMatchObject({ owner: { kind: "partner", via: "NAME", active: true } });

    const inactive = mapDatabaseError(
      dbError("23505", "PARTNER_NAME_TAKEN", { field: "name", owner: partnerOwner("NAME", false) }),
    );
    expect(inactive.message).toBe("Já existe um sócio inativo com este nome. Para voltar a usar este cadastro, reative-o.");

    expect(
      mapDatabaseError(dbError("23505", "PARTNER_NAME_TAKEN", { field: "aliases", owner: partnerOwner("ALIAS") })).message,
    ).toBe("Este apelido já pertence ao sócio Sócio Exemplo A.");
    expect(
      mapDatabaseError(dbError("23505", "PARTNER_NAME_TAKEN", { field: "aliases", owner: partnerOwner("NAME") })).message,
    ).toBe("Este apelido já é o nome do sócio Sócio Exemplo A.");
    expect(
      mapDatabaseError(dbError("23505", "PARTNER_NAME_TAKEN", { field: "aliases", owner: partnerOwner("NAME_VARIANT") })).message,
    ).toBe("Este apelido já é usado por um recebedor do sócio Sócio Exemplo A.");
    expect(
      mapDatabaseError(dbError("23505", "PARTNER_NAME_TAKEN", { field: "name", owner: partnerOwner("ALIAS") })).message,
    ).toBe("Este nome já é um apelido do sócio Sócio Exemplo A.");
  });

  it("PARTNER_NAME_TAKEN na variação do nome do recebedor (UI 7.2, R-R09)", () => {
    const mapped = mapDatabaseError(
      dbError("23505", "PARTNER_NAME_TAKEN", { field: "identifiers", owner: partnerOwner("NAME") }),
    );
    expect(mapped.message).toBe(
      "Este nome já é usado pelo sócio Sócio Exemplo A. Use um nome que identifique só este recebedor.",
    );
    expect(mapped.field).toBe("identifiers");
  });

  describe("IDENTIFIER_TAKEN (frases da UI 7.2, uma por tipo)", () => {
    const owner = {
      kind: "receiver", id: "r0000000-0000-4000-8000-000000000001", name: "Titular Fictício A",
      partner_id: "a0000000-0000-4000-8000-000000000001", partner_name: "Sócio Exemplo A", active: true,
    };
    const ownerView = {
      kind: "receiver", id: owner.id, name: "Titular Fictício A", active: true,
      partnerId: owner.partner_id, partnerName: "Sócio Exemplo A",
    };

    it.each([
      ["PIX_KEY", "semente.a@example.com", "Esta chave Pix já está cadastrada no recebedor Titular Fictício A, do sócio Sócio Exemplo A."],
      ["BANK_ACCOUNT", "banco exemplo|1|123456", "Esta conta já está cadastrada no recebedor Titular Fictício A, do sócio Sócio Exemplo A."],
      ["NAME_VARIANT", "s alfa", "Esta forma do nome já está cadastrada no recebedor Titular Fictício A, do sócio Sócio Exemplo A."],
    ] as const)("%s", (type, value, message) => {
      const mapped = mapDatabaseError(
        dbError("23505", "IDENTIFIER_TAKEN", { field: "identifiers", identifier_type: type, value, owner }),
      );
      expect(mapped.code).toBe("CONFLICT");
      expect(mapped.message).toBe(message);
      expect(mapped.field).toBe("identifiers");
      expect(mapped.details).toEqual({
        hint: "IDENTIFIER_TAKEN", field: "identifiers", identifierType: type, value, owner: ownerView,
      });
    });

    it("sem o tipo (detail antigo): frase que cobre os três e identifierType nulo", () => {
      const mapped = mapDatabaseError(dbError("23505", "IDENTIFIER_TAKEN", { field: "identifiers", value: "x", owner }));
      expect(mapped.message).toBe(
        "Esta chave Pix, conta ou forma do nome já está cadastrada no recebedor Titular Fictício A, do sócio Sócio Exemplo A.",
      );
      expect(mapped.details).toMatchObject({ hint: "IDENTIFIER_TAKEN", identifierType: null });
    });

    it("tipo desconhecido no detail: o detail é descartado e a mensagem sai genérica", () => {
      const mapped = mapDatabaseError(
        dbError("23505", "IDENTIFIER_TAKEN", { field: "identifiers", identifier_type: "OUTRO", value: "x", owner }),
      );
      expect(mapped.message).toBe("Este item já está cadastrado em outro recebedor.");
      expect(mapped.details).toBeUndefined();
    });

    it("reativação (UI 6.5): chave Pix e conta com a frase própria", () => {
      const pix = mapDatabaseError(
        dbError("23505", "IDENTIFIER_TAKEN", { field: "identifiers", identifier_type: "PIX_KEY", value: "semente.a@example.com", owner }),
        { subject: "receiver", operation: "activate" },
      );
      expect(pix.message).toBe(
        "Não foi possível reativar: a chave Pix semente.a@example.com já está em uso pelo recebedor Titular Fictício A, do sócio Sócio Exemplo A. Retire do cadastro de um dos dois e tente de novo.",
      );
      const account = mapDatabaseError(
        dbError("23505", "IDENTIFIER_TAKEN", { field: "identifiers", identifier_type: "BANK_ACCOUNT", value: "banco exemplo|1|123456", owner }),
        { subject: "receiver", operation: "activate" },
      );
      expect(account.message).toBe(
        "Não foi possível reativar: a conta Banco banco exemplo · Ag. 1 · Conta 123456 já está em uso pelo recebedor Titular Fictício A, do sócio Sócio Exemplo A. Retire do cadastro de um dos dois e tente de novo.",
      );
    });
  });

  it("a mensagem do banco e o valor do documento não aparecem na tela", () => {
    const mapped = mapDatabaseError(
      dbError("23505", "DOCUMENT_TAKEN", { field: "document", value: "12ABC34501DE35", owner: OWNER_CLIENT_ACTIVE }, "duplicate key value (document)=(12ABC34501DE35)"),
    );
    expect(mapped.message).not.toContain("12ABC34501DE35");
    expect(mapped.message).not.toContain("duplicate key");
  });
});

describe("PARTNER_INACTIVE", () => {
  const detail = (...names: string[]) => ({ partners: names.map((name, i) => ({ id: `a000000${i}-0000-4000-8000-000000000001`, name })) });

  it("cliente: um sócio inativado enquanto o formulário estava aberto (UI 4.1.4)", () => {
    const mapped = mapDatabaseError(dbError("P0001", "PARTNER_INACTIVE", detail("Sócio Exemplo B")), { subject: "client" });
    expect(mapped.message).toBe("O sócio Sócio Exemplo B foi inativado e não pode mais ser indicado. Desmarque-o ou escolha outro.");
    expect(mapped.field).toBe("partnerIds");
    expect(mapped.code).toBe("RULE_VIOLATION");
    expect(mapped.details).toMatchObject({ hint: "PARTNER_INACTIVE", partners: [{ name: "Sócio Exemplo B" }] });
  });

  it("cliente: vários sócios", () => {
    const mapped = mapDatabaseError(dbError("P0001", "PARTNER_INACTIVE", detail("Sócio A", "Sócio B", "Sócio C")));
    expect(mapped.message).toBe(
      "Os sócios Sócio A, Sócio B e Sócio C foram inativados e não podem mais ser indicados. Desmarque-os ou escolha outros.",
    );
  });

  it("recebedor: sócio dono inativo (UI 6.5 e 7.2)", () => {
    const mapped = mapDatabaseError(dbError("P0001", "PARTNER_INACTIVE", detail("Sócio Exemplo C")), { subject: "receiver" });
    expect(mapped.message).toBe("O sócio Sócio Exemplo C está inativo. Reative o sócio antes de cadastrar ou reativar um recebedor.");
    expect(mapped.field).toBeUndefined();
  });

  it("sem lista legível ainda devolve uma mensagem útil", () => {
    expect(mapDatabaseError(dbError("P0001", "PARTNER_INACTIVE")).message).toBe(
      "Há sócio inativo na lista. Desmarque-o ou escolha outro.",
    );
  });
});

describe("PARTNER_HAS_CLIENTS (RAT-D025)", () => {
  const clients = [
    { id: "c0000000-0000-4000-8000-000000000001", name: "Cliente Modelo Ltda", active: true },
    { id: "c0000000-0000-4000-8000-000000000002", name: "Cliente Antigo Ltda", active: false },
  ];

  it("lista os clientes (ativos e inativos) e diz quantos", () => {
    const mapped = mapDatabaseError(dbError("P0001", "PARTNER_HAS_CLIENTS", { clients }), { subjectName: "Sócio Exemplo A" });
    expect(mapped.code).toBe("RULE_VIOLATION");
    expect(mapped.message).toBe(
      "Sócio Exemplo A ainda está indicado em 2 clientes, entre ativos e inativos. Para inativar, primeiro retire este sócio de todos eles.",
    );
    expect(mapped.details).toEqual({ hint: "PARTNER_HAS_CLIENTS", clients });
  });

  it("singular e sem nome no contexto", () => {
    const mapped = mapDatabaseError(dbError("P0001", "PARTNER_HAS_CLIENTS", { clients: [clients[1]] }));
    expect(mapped.message).toBe(
      "O sócio ainda está indicado em 1 cliente, entre ativos e inativos. Para inativar, primeiro retire este sócio de todos eles.",
    );
  });

  it("T-38: sem a lista, a contagem desconhecida sai 'em clientes'", () => {
    const mapped = mapDatabaseError(dbError("P0001", "PARTNER_HAS_CLIENTS", { clients: [] }), { subjectName: "Sócio Exemplo A" });
    expect(mapped.message).toBe(
      "Sócio Exemplo A ainda está indicado em clientes, entre ativos e inativos. Para inativar, primeiro retire este sócio de todos eles.",
    );
  });
});

describe("RECEIVERS_CHANGED", () => {
  it("traz a lista atual para a tela refazer a confirmação (UI 6.1)", () => {
    const receivers = [{ id: "r0000000-0000-4000-8000-000000000001", name: "Titular Fictício A" }];
    const mapped = mapDatabaseError(dbError("P0001", "RECEIVERS_CHANGED", { receivers }));
    expect(mapped.message).toBe("A lista de recebedores deste sócio mudou. Confira a lista atualizada e confirme de novo.");
    expect(mapped.details).toEqual({ hint: "RECEIVERS_CHANGED", receivers });
  });

  it("lista vazia (todos os recebedores foram inativados no meio) também é válida", () => {
    const mapped = mapDatabaseError(dbError("P0001", "RECEIVERS_CHANGED", { receivers: [] }));
    expect(mapped.details).toEqual({ hint: "RECEIVERS_CHANGED", receivers: [] });
  });
});

describe("POSSIBLE_DUPLICATE (R-C15)", () => {
  it("traz os parecidos com documento, situação e motivo", () => {
    const matches = [
      { id: "c0000000-0000-4000-8000-000000000001", name: "Cliente Modelo Ltda", document: "12ABC34501DE35", document_type: "CNPJ", active: true, match: "SAME_NAME" },
      { id: "c0000000-0000-4000-8000-000000000002", name: "Pessoa Exemplo", document: null, document_type: null, active: false, match: "SAME_ALIAS" },
    ];
    const mapped = mapDatabaseError(dbError("P0001", "POSSIBLE_DUPLICATE", { matches }));
    expect(mapped.code).toBe("RULE_VIOLATION");
    expect(mapped.message).toBe(
      "Já existe um cliente com nome ou apelido igual. Confira se não é o mesmo cliente. Se for outra filial ou outra pessoa com o mesmo nome, você pode salvar mesmo assim.",
    );
    expect(mapped.details).toEqual({
      hint: "POSSIBLE_DUPLICATE",
      matches: [
        { id: matches[0].id, name: "Cliente Modelo Ltda", document: "12ABC34501DE35", documentType: "CNPJ", active: true, match: "SAME_NAME" },
        { id: matches[1].id, name: "Pessoa Exemplo", document: null, documentType: null, active: false, match: "SAME_ALIAS" },
      ],
    });
  });

  it("detail com formato fora do contrato é descartado (zod), a mensagem fica", () => {
    const mapped = mapDatabaseError(dbError("P0001", "POSSIBLE_DUPLICATE", { matches: [{ id: 1, name: null }] }));
    expect(mapped.hint).toBe("POSSIBLE_DUPLICATE");
    expect(mapped.details).toEqual({ hint: "POSSIBLE_DUPLICATE", matches: [] });
  });
});

describe("CLIENT_WITHOUT_PARTNER", () => {
  it("ao salvar (P0001) e no gatilho diferido do COMMIT (23514)", () => {
    for (const sqlstate of ["P0001", "23514"]) {
      const mapped = mapDatabaseError(dbError(sqlstate, "CLIENT_WITHOUT_PARTNER"));
      expect(mapped.code).toBe("RULE_VIOLATION");
      expect(mapped.message).toBe("Escolha pelo menos um sócio. Todo cliente ativo precisa de um.");
      expect(mapped.field).toBe("partnerIds");
    }
  });

  it("ao reativar, a mensagem é a da UI 6.4", () => {
    const mapped = mapDatabaseError(dbError("P0001", "CLIENT_WITHOUT_PARTNER"), { subject: "client", operation: "activate" });
    expect(mapped.message).toBe("Este cliente não tem sócio ativo. Indique pelo menos um sócio na edição e tente reativar de novo.");
    expect(mapped.field).toBeUndefined();
  });
});

describe("proteções do mapeamento", () => {
  it("hint desconhecido cai no mapa por SQLSTATE, com a mensagem padrão", () => {
    const mapped = mapDatabaseError(dbError("P0001", "ALGO_NOVO"));
    expect(mapped.code).toBe("RULE_VIOLATION");
    expect(mapped.hint).toBeUndefined();
  });

  it("hint do contrato com SQLSTATE diferente do contrato é ignorado", () => {
    const mapped = mapDatabaseError(dbError("23505", "STALE_VERSION"));
    expect(mapped.code).toBe("CONFLICT");
    expect(mapped.hint).toBeUndefined();
    expect(mapCadastroError(dbError("23505", "STALE_VERSION"))).toBeNull();
  });

  it("hint de texto livre do PostgREST não é confundido com chave", () => {
    const mapped = mapDatabaseError({ code: "PGRST202", message: "x", hint: "Perhaps you meant to call the function public.save_client", details: null });
    expect(mapped.code).toBe("UNEXPECTED");
    expect(mapped.hint).toBeUndefined();
  });

  it("23505 sem hint (índice único como última barreira) continua CONFLICT genérico", () => {
    const mapped = mapDatabaseError(dbError("23505", null));
    expect(mapped.code).toBe("CONFLICT");
    expect(mapped.message).toBe("Já existe um registro com estes dados.");
  });

  it("o erro original fica em cause, só para o log", () => {
    const original = dbError("P0001", "STALE_VERSION", { current_updated_at: "2026-01-01T00:00:00+00:00" });
    expect(mapDatabaseError(original).cause).toBe(original);
  });

  it("toAppError aceita o contexto e não reencapsula AppError", () => {
    const original = new AppError("FORBIDDEN");
    expect(toAppError(original, { subject: "client" })).toBe(original);
    expect(toAppError(dbError("P0001", "STALE_VERSION"), { subject: "client" }).message).toContain("Este cliente");
  });

  it("fail() leva hint e details, e continua sem eles quando não há", () => {
    const withDetails = fail(
      mapDatabaseError(dbError("P0001", "RECEIVERS_CHANGED", { receivers: [] })),
    );
    expect(withDetails.error.hint).toBe("RECEIVERS_CHANGED");
    expect(withDetails.error.details).toEqual({ hint: "RECEIVERS_CHANGED", receivers: [] });
    expect(JSON.parse(JSON.stringify(withDetails))).toEqual(withDetails);

    expect(fail(new AppError("FORBIDDEN"))).toEqual({
      ok: false,
      error: { code: "FORBIDDEN", message: "Você não tem permissão para realizar esta operação." },
    });
  });

  it("o resultado de fail não carrega a mensagem original do banco", () => {
    const result = fail(mapDatabaseError(dbError("P0001", "STALE_VERSION", { current_updated_at: "x" }, "segredo interno public.clients")));
    expect(JSON.stringify(result)).not.toContain("segredo interno");
  });
});

describe("LIST_LIMIT_EXCEEDED (RAT-D026)", () => {
  // Os seis detail que o banco envia (modelagem 6.6.5), com a frase e o campo de cada um.
  it.each([
    [{ field: "aliases", list: "PARTNER_ALIAS", max: 2 }, "No máximo 2 apelidos.", "aliases", "PARTNER_ALIAS", 2],
    [{ field: "aliases", list: "CLIENT_ALIAS_NAME", alias_type: "NAME", max: 2 }, "No máximo 2 nomes.", "aliases", "CLIENT_ALIAS_NAME", 2],
    [
      { field: "aliases", list: "CLIENT_ALIAS_DOCUMENT", alias_type: "DOCUMENT", max: 2 },
      "No máximo 2 documentos.",
      "aliases",
      "CLIENT_ALIAS_DOCUMENT",
      2,
    ],
    [
      { field: "identifiers", list: "NAME_VARIANT", identifier_type: "NAME_VARIANT", max: 30 },
      "No máximo 30 formas do nome.",
      "identifiers",
      "NAME_VARIANT",
      30,
    ],
    [{ field: "identifiers", list: "PIX_KEY", identifier_type: "PIX_KEY", max: 10 }, "No máximo 10 chaves Pix.", "identifiers", "PIX_KEY", 10],
    [{ field: "identifiers", list: "BANK_ACCOUNT", identifier_type: "BANK_ACCOUNT", max: 10 }, "No máximo 10 contas.", "identifiers", "BANK_ACCOUNT", 10],
  ] as const)("detail %j", (detail, message, field, list, max) => {
    const mapped = mapDatabaseError(dbError("22023", "LIST_LIMIT_EXCEEDED", detail));
    expect(mapped.code).toBe("VALIDATION");
    expect(mapped.hint).toBe("LIST_LIMIT_EXCEEDED");
    expect(mapped.message).toBe(message);
    expect(mapped.field).toBe(field);
    expect(mapped.details).toEqual({ hint: "LIST_LIMIT_EXCEEDED", list, max });
  });

  it("o número da frase vem do max do detail, não da tabela do app", () => {
    const mapped = mapDatabaseError(dbError("22023", "LIST_LIMIT_EXCEEDED", { field: "aliases", list: "PARTNER_ALIAS", max: 5 }));
    expect(mapped.message).toBe("No máximo 5 apelidos.");
  });

  it("sem list ou com max inválido: a frase genérica, e a leitura não quebra", () => {
    const generic = "A lista passou do limite de itens. Inative algum item e tente novamente.";
    for (const detail of [
      { field: "aliases", max: 2 },
      { field: "aliases", list: "PARTNER_ALIAS" },
      { field: "aliases", list: "PARTNER_ALIAS", max: 0 },
      { field: "aliases", list: "PARTNER_ALIAS", max: -3 },
      { field: "aliases", list: "PARTNER_ALIAS", max: 2.5 },
      { field: "aliases", list: "PARTNER_ALIAS", max: "dois" },
      { field: "aliases", list: "OUTRA_LISTA", max: 2 },
      {},
      [],
      "não é json",
      null,
      undefined,
    ]) {
      const mapped = mapDatabaseError(dbError("22023", "LIST_LIMIT_EXCEEDED", detail as unknown));
      expect(mapped.hint).toBe("LIST_LIMIT_EXCEEDED");
      expect(mapped.code).toBe("VALIDATION");
      expect(mapped.message).toBe(generic);
    }
  });

  it("sem detail: frase genérica, sem campo, e details com list e max nulos", () => {
    const mapped = mapDatabaseError(dbError("22023", "LIST_LIMIT_EXCEEDED"));
    expect(mapped.message).toBe("A lista passou do limite de itens. Inative algum item e tente novamente.");
    expect(mapped.field).toBeUndefined();
    expect(mapped.details).toEqual({ hint: "LIST_LIMIT_EXCEEDED", list: null, max: null });
  });

  it("SQLSTATE diferente de 22023 não é mapeado para este hint", () => {
    const detail = { field: "aliases", list: "PARTNER_ALIAS", max: 2 };
    for (const code of ["P0001", "23505", "42501", "23514"]) {
      expect(mapCadastroError(dbError(code, "LIST_LIMIT_EXCEEDED", detail))).toBeNull();
      expect(mapDatabaseError(dbError(code, "LIST_LIMIT_EXCEEDED", detail)).hint).toBeUndefined();
    }
  });

  it("a mensagem não vaza texto do banco", () => {
    const mapped = mapDatabaseError(
      dbError("22023", "LIST_LIMIT_EXCEEDED", { field: "aliases", list: "PARTNER_ALIAS", max: 2 }, "segredo interno public.partner_aliases"),
    );
    expect(JSON.stringify(mapped.message)).not.toContain("segredo interno");
  });
});

describe("joinNames", () => {
  it("junta em português", () => {
    expect(joinNames([])).toBe("");
    expect(joinNames(["A"])).toBe("A");
    expect(joinNames(["A", "B"])).toBe("A e B");
    expect(joinNames(["A", "B", "C"])).toBe("A, B e C");
  });
});
