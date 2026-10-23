import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { CompetencyCompanyRow } from "@/domain/competencies";
import { formatCnpj, formatCurrency } from "@/lib/format";

import { CompanyStatusBadge } from "./company-status-badge";
import { DistributionSummary } from "./distribution-summary";
import { IndicatorBadges } from "./indicator-badges";

interface CompaniesTableProps {
  competencyLabel: string;
  rows: CompetencyCompanyRow[];
}

/** Carteira da competência. Componente apenas de exibição. */
export function CompaniesTable({ competencyLabel, rows }: CompaniesTableProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recebimentos</CardTitle>
        <CardDescription>
          <span className="block font-medium text-foreground">{competencyLabel}</span>
          Acompanhe os recebimentos das empresas da carteira.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Empresa</TableHead>
              <TableHead>CNPJ</TableHead>
              <TableHead className="text-right">Valor esperado</TableHead>
              <TableHead className="text-right">Recebido</TableHead>
              <TableHead>Recebedor</TableHead>
              <TableHead>Indicadores</TableHead>
              <TableHead>Distribuição</TableHead>
              <TableHead className="pr-4">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                  Nenhuma empresa nesta competência.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.companyId}>
                  <TableCell className="pl-4 font-medium">{row.name}</TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {formatCnpj(row.normalizedCnpj)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(row.expectedAmount)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(row.receivedAmount)}
                  </TableCell>
                  <TableCell>
                    {row.receivers.length > 0
                      ? row.receivers.map((receiver) => receiver.name).join(", ")
                      : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell>
                    <IndicatorBadges indicators={row.indicators} />
                  </TableCell>
                  <TableCell>
                    <DistributionSummary distribution={row.distribution} />
                  </TableCell>
                  <TableCell className="pr-4">
                    <CompanyStatusBadge status={row.status} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
