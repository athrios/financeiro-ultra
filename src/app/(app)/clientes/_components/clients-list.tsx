import Link from "next/link";

import { StatusBadge } from "@/components/form/status-badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { clientDetailHref, describeDocumentLine, formatMonthlyValue, summarizePartners } from "@/domain/cadastros/client-view";
import type { ClientListItem } from "@/server/clients/clients";

export interface ClientRowData {
  client: ClientListItem;
  partnerNames: readonly string[];
}

const LINK_CLASS =
  "rounded-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring";

function DocumentText({ document }: { document: string | null }) {
  const line = describeDocumentLine(document);
  if (line.label === null) return <span className="text-muted-foreground">{line.text}</span>;
  return (
    <>
      <span className="mr-1 text-xs text-muted-foreground">{line.label}</span>
      <span className="tabular-nums">{line.text}</span>
    </>
  );
}

function PartnersText({ row }: { row: ClientRowData }) {
  const summary = summarizePartners(row.partnerNames, row.client.partnerCount);
  return (
    <>
      {summary.names !== "" && (
        <span className="block break-words">
          <span aria-hidden={summary.hiddenCount > 0 ? "true" : undefined}>{summary.names}</span>
          {summary.hiddenCount > 0 && <span className="sr-only">{summary.allNames}</span>}
        </span>
      )}
      <span className="block text-xs text-muted-foreground">{summary.division}</span>
    </>
  );
}

/** Tablet e desktop (a partir de 768 px): tabela de verdade, com cabeçalhos e legenda (UI 3.2). */
export function ClientsTable({ rows }: { rows: readonly ClientRowData[] }) {
  return (
    <Card className="hidden py-0 md:block">
      <Table>
        <TableCaption className="sr-only">
          Clientes, com documento, mensalidade padrão, sócios e situação. Ordem alfabética.
        </TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col" className="pl-4">
              Cliente
            </TableHead>
            <TableHead scope="col">Documento</TableHead>
            <TableHead scope="col" className="text-right">
              Mensalidade padrão
            </TableHead>
            <TableHead scope="col">Sócios</TableHead>
            <TableHead scope="col">Situação</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.client.id}>
              <TableCell className="pl-4 whitespace-normal">
                <Link href={clientDetailHref(row.client.id)} className={LINK_CLASS}>
                  {row.client.legalName}
                </Link>
                {row.client.tradeName && (
                  <span className="block text-xs break-words text-muted-foreground">{row.client.tradeName}</span>
                )}
              </TableCell>
              <TableCell className="min-w-[18ch]">
                <DocumentText document={row.client.document} />
              </TableCell>
              <TableCell className="text-right tabular-nums">{formatMonthlyValue(row.client.monthlyValue)}</TableCell>
              <TableCell className="whitespace-normal">
                <PartnersText row={row} />
              </TableCell>
              <TableCell>
                <StatusBadge active={row.client.active} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

/** Celular (abaixo de 768 px): lista de cartões com a mesma informação (UI 3.4). */
export function ClientsCards({ rows }: { rows: readonly ClientRowData[] }) {
  return (
    <ul aria-label="Clientes" className="grid gap-3 md:hidden">
      {rows.map((row) => (
        <li key={row.client.id}>
          <Card className="gap-2 px-4">
            <div className="flex items-start justify-between gap-2">
              <Link
                href={clientDetailHref(row.client.id)}
                className="min-h-11 rounded-sm font-medium break-words underline underline-offset-4 outline-none focus-visible:ring-3 focus-visible:ring-ring"
              >
                {row.client.legalName}
              </Link>
              <StatusBadge active={row.client.active} />
            </div>
            {row.client.tradeName && <p className="text-sm break-words text-muted-foreground">{row.client.tradeName}</p>}
            <p className="text-sm">
              <DocumentText document={row.client.document} />
            </p>
            <p className="text-sm">
              Mensalidade padrão: <span className="tabular-nums">{formatMonthlyValue(row.client.monthlyValue)}</span>
            </p>
            <p className="text-sm">
              <PartnersText row={row} />
            </p>
          </Card>
        </li>
      ))}
    </ul>
  );
}
