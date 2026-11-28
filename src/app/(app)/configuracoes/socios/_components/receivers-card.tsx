import Link from "next/link";

import { StatusBadge } from "@/components/form/status-badge";
import { StatusFilter } from "@/components/form/status-filter";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  RECEIVERS_PARTNER_INACTIVE_TEXT,
  describeVariantCount,
  receiverHref,
  receiverNewHref,
  receiversEmptyMessage,
  receiversFilterHref,
} from "@/domain/cadastros/receiver-view";
import { describeAccount } from "@/domain/cadastros/receiver-identifiers";
import type { RowStatus } from "@/domain/cadastros/schemas";
import { cn } from "@/lib/utils";
import type { ReceiverListItem } from "@/server/receivers/receivers";

import { ReceiverActiveControl } from "../[id]/recebedores/_components/receiver-active-control";

interface ReceiversCardProps {
  partner: { id: string; name: string; active: boolean };
  /** Todos os recebedores do sócio (ativos e inativos); o filtro é aplicado aqui. */
  receivers: readonly ReceiverListItem[];
  status: RowStatus;
}

/**
 * Cartão "Recebedores" do detalhe do sócio (UI 5.3 item 5; só o Administrador chega aqui). "Novo
 * recebedor" some se o sócio está inativo (vira o texto "Reative o sócio..."). O filtro de situação
 * fica na URL (`?recebedores=`), então funciona sem JavaScript. Tabela a partir de 768 px e cartões
 * abaixo. Cada linha traz Editar e Inativar/Reativar; o servidor confere tudo de novo ao confirmar.
 */
export function ReceiversCard({ partner, receivers, status }: ReceiversCardProps) {
  const shown = receivers.filter((receiver) =>
    status === "ALL" ? true : status === "ACTIVE" ? receiver.active : !receiver.active,
  );
  const inactiveTotal = receivers.filter((receiver) => !receiver.active).length;
  const empty = receiversEmptyMessage(status, inactiveTotal > 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>
            <h2>Recebedores</h2>
          </CardTitle>
          {partner.active && (
            <Link href={receiverNewHref(partner.id)} className={cn(buttonVariants(), "h-11 md:h-9")}>
              Novo recebedor
            </Link>
          )}
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        {!partner.active && <p>{RECEIVERS_PARTNER_INACTIVE_TEXT}</p>}

        <div>
          <StatusFilter
            label="Situação dos recebedores"
            options={[
              { label: "Ativos", href: receiversFilterHref(partner.id, "ACTIVE"), current: status === "ACTIVE" },
              { label: "Inativos", href: receiversFilterHref(partner.id, "INACTIVE"), current: status === "INACTIVE" },
              { label: "Todos", href: receiversFilterHref(partner.id, "ALL"), current: status === "ALL" },
            ]}
          />
        </div>

        {shown.length === 0 ? (
          <div className="grid gap-2">
            <p className="font-medium">{empty.title}</p>
            {empty.text && <p className="text-muted-foreground">{empty.text}</p>}
            {status === "ACTIVE" && inactiveTotal > 0 && (
              <p className="text-muted-foreground">
                {inactiveTotal === 1 ? "Há 1 recebedor inativo neste sócio." : `Há ${inactiveTotal} recebedores inativos neste sócio.`}
              </p>
            )}
            {partner.active && status !== "INACTIVE" && (
              <div>
                <Link href={receiverNewHref(partner.id)} className={cn(buttonVariants(), "h-11 md:h-9")}>
                  Novo recebedor
                </Link>
              </div>
            )}
          </div>
        ) : (
          <>
            <ReceiversTable partner={partner} receivers={shown} />
            <ReceiversCards partner={partner} receivers={shown} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

function PixKeys({ keys }: { keys: readonly string[] }) {
  if (keys.length === 0) {
    return (
      <>
        <span aria-hidden="true">—</span>
        <span className="sr-only">Nenhuma chave Pix</span>
      </>
    );
  }
  return keys.map((key) => (
    <span key={key} className="block break-words">
      {key}
    </span>
  ));
}

function Accounts({ accounts }: { accounts: ReceiverListItem["accounts"] }) {
  if (accounts.length === 0) {
    return (
      <>
        <span aria-hidden="true">—</span>
        <span className="sr-only">Nenhuma conta</span>
      </>
    );
  }
  return accounts.map((account) => (
    <span key={`${account.bankName}|${account.branch}|${account.accountNumber}`} className="block break-words">
      {describeAccount(account)}
    </span>
  ));
}

function RowActions({ partner, receiver }: { partner: ReceiversCardProps["partner"]; receiver: ReceiverListItem }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link
        href={receiverHref(partner.id, receiver.id)}
        aria-label={`Editar recebedor ${receiver.holderName}`}
        className={cn(buttonVariants({ variant: "outline" }), "h-11 md:h-8")}
      >
        Editar
      </Link>
      <ReceiverActiveControl
        key={`${receiver.id}:${receiver.updatedAt}:${receiver.active}:${partner.active}`}
        receiver={{ id: receiver.id, holderName: receiver.holderName, active: receiver.active, updatedAt: receiver.updatedAt }}
        partner={partner}
        compact
      />
    </div>
  );
}

function HolderCell({ partner, receiver }: { partner: ReceiversCardProps["partner"]; receiver: ReceiverListItem }) {
  const variants = describeVariantCount(receiver.nameVariantCount);
  return (
    <>
      <Link
        href={receiverHref(partner.id, receiver.id)}
        className="rounded-sm font-medium break-words underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring"
      >
        {receiver.holderName}
      </Link>
      {variants && <span className="block text-xs text-muted-foreground">{variants}</span>}
    </>
  );
}

/** Tablet e desktop (a partir de 768 px): tabela de verdade, com cabeçalhos e legenda. */
function ReceiversTable({ partner, receivers }: { partner: ReceiversCardProps["partner"]; receivers: readonly ReceiverListItem[] }) {
  return (
    <div className="hidden rounded-lg border md:block">
      <Table>
        <TableCaption className="sr-only">Recebedores de {partner.name}</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col" className="pl-3">
              Titular
            </TableHead>
            <TableHead scope="col">Chaves Pix</TableHead>
            <TableHead scope="col">Contas</TableHead>
            <TableHead scope="col">Situação</TableHead>
            <TableHead scope="col">
              <span className="sr-only">Ações</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {receivers.map((receiver) => (
            <TableRow key={receiver.id}>
              <TableCell className="pl-3 whitespace-normal">
                <HolderCell partner={partner} receiver={receiver} />
              </TableCell>
              <TableCell className="whitespace-normal">
                <PixKeys keys={receiver.pixKeys} />
              </TableCell>
              <TableCell className="whitespace-normal">
                <Accounts accounts={receiver.accounts} />
              </TableCell>
              <TableCell>
                <StatusBadge active={receiver.active} />
              </TableCell>
              <TableCell>
                <RowActions partner={partner} receiver={receiver} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/** Celular (abaixo de 768 px): lista de cartões, com a mesma informação e na mesma ordem. */
function ReceiversCards({ partner, receivers }: { partner: ReceiversCardProps["partner"]; receivers: readonly ReceiverListItem[] }) {
  return (
    <ul aria-label="Recebedores" className="grid gap-3 md:hidden">
      {receivers.map((receiver) => (
        <li key={receiver.id} className="grid gap-2 rounded-lg border bg-background px-3 py-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <HolderCell partner={partner} receiver={receiver} />
            </div>
            <StatusBadge active={receiver.active} />
          </div>
          <dl className="grid gap-2">
            <div>
              <dt className="text-xs text-muted-foreground">Chaves Pix</dt>
              <dd>
                <PixKeys keys={receiver.pixKeys} />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Contas</dt>
              <dd>
                <Accounts accounts={receiver.accounts} />
              </dd>
            </div>
          </dl>
          <RowActions partner={partner} receiver={receiver} />
        </li>
      ))}
    </ul>
  );
}
