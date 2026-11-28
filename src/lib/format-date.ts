/**
 * Datas da interface (03-ui-ux.md, 12.5): `dd/mm/aaaa` e `hh:mm`, sempre no fuso
 * `America/Sao_Paulo`, qualquer que seja o fuso do servidor. Recebem o texto que o banco entrega
 * (`2026-11-25T18:04:17.980158+00:00`); texto ilegível vira "" (a tela omite a linha).
 */

const TIME_ZONE = "America/Sao_Paulo";

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const timeFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function parse(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "25/11/2026". */
export function formatDate(value: string | null | undefined): string {
  const date = parse(value);
  return date ? dateFormatter.format(date) : "";
}

/** "25/11/2026 às 15:04". */
export function formatDateTime(value: string | null | undefined): string {
  const date = parse(value);
  return date ? `${dateFormatter.format(date)} às ${timeFormatter.format(date)}` : "";
}
