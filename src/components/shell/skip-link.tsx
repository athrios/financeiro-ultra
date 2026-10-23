/** Primeiro item focável da página (03-ui-ux.md, 7.1). Fica visível só ao receber foco. */
export function SkipLink() {
  return (
    <a
      href="#conteudo"
      className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[60] focus:rounded-lg focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:shadow-lg focus:ring-3 focus:ring-ring focus:outline-none"
    >
      Pular para o conteúdo
    </a>
  );
}
