import Link from "next/link";

import { StatusBadge } from "@/components/form/status-badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ALIAS_KIND_LABELS, describeAliasOwner, describeAliasText } from "@/domain/cadastros/alias-view";
import type { AliasSearchItem } from "@/server/clients/clients";

const LINK_CLASS =
  "rounded-sm font-medium break-words underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring";

function rowKey(item: AliasSearchItem): string {
  return `${item.kind}:${item.itemId}`;
}

function OwnerLink({ item, className }: { item: AliasSearchItem; className?: string }) {
  const owner = describeAliasOwner(item);
  const note = owner.inactiveNote ? <span className="text-muted-foreground"> {owner.inactiveNote}</span> : null;
  const context = owner.context ? <span>{owner.context}</span> : null;
  if (owner.href === null) {
    return (
      <span className="break-words">
        {owner.label}
        {note}
        {context}
      </span>
    );
  }
  return (
    <>
      <Link href={owner.href} className={className ?? LINK_CLASS}>
        {owner.label}
      </Link>
      {note}
      {context}
    </>
  );
}

/** Tablet e desktop (a partir de 768 px): tabela de verdade, com cabeçalhos e legenda (UI 5.4). */
export function AliasesTable({ items }: { items: readonly AliasSearchItem[] }) {
  return (
    <Card className="hidden py-0 md:block">
      <Table>
        <TableCaption className="sr-only">
          Apelidos, variações de nome, chaves Pix e contas bancárias, com o tipo, a quem pertencem e a situação. Ordem alfabética do texto.
        </TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col" className="pl-4">
              Texto
            </TableHead>
            <TableHead scope="col">Tipo</TableHead>
            <TableHead scope="col">Pertence a</TableHead>
            <TableHead scope="col">Situação</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={rowKey(item)}>
              <TableCell className="pl-4 whitespace-normal break-words">{describeAliasText(item)}</TableCell>
              <TableCell className="whitespace-normal">{ALIAS_KIND_LABELS[item.kind]}</TableCell>
              <TableCell className="whitespace-normal">
                <OwnerLink item={item} />
              </TableCell>
              <TableCell>
                <StatusBadge active={item.active} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

/** Celular (abaixo de 768 px): lista de cartões com a mesma informação (UI 5.4). */
export function AliasesCards({ items }: { items: readonly AliasSearchItem[] }) {
  return (
    <ul aria-label="Apelidos" className="grid gap-3 md:hidden">
      {items.map((item) => (
        <li key={rowKey(item)}>
          <Card className="gap-2 px-4">
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 font-medium break-words">{describeAliasText(item)}</p>
              <StatusBadge active={item.active} />
            </div>
            <p className="text-sm text-muted-foreground">{ALIAS_KIND_LABELS[item.kind]}</p>
            <p className="text-sm">
              <span className="text-muted-foreground">Pertence a: </span>
              <OwnerLink
                item={item}
                className="inline-flex min-h-11 items-center rounded-sm break-words underline underline-offset-4 outline-none focus-visible:ring-3 focus-visible:ring-ring"
              />
            </p>
          </Card>
        </li>
      ))}
    </ul>
  );
}
