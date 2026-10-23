/**
 * Re-exportação de compatibilidade (FND-001 / E6).
 *
 * O algoritmo de maior resto passou para `src/domain/shared/apportion.ts`.
 * Este módulo antigo permanece apenas para não quebrar quem o importa,
 * sem nenhuma mudança de comportamento. Sai do caminho ativo na E5.
 */
export * from "../shared/apportion";
