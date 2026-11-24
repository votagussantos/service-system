import { SQL_ISO } from './util';

/**
 * Regras de garantia e reincidência.
 *
 * - Garantia: ao concluir a OS, garantia_ate = data de conclusão + maior prazo entre os itens
 *   (prazo do item → prazo do serviço → prazo padrão da empresa).
 *   Retorno em garantia não gera nova garantia: herda a data da OS original.
 * - Reincidência: a OS é reincidente quando, nos N dias anteriores à sua abertura
 *   (N = empresa.dias_reincidencia), houve OS concluída no mesmo endereço (logradouro + número + unidade)
 *   ou para o mesmo cliente pessoa física.
 */

export async function configuracoes(db: D1Database) {
  const e = await db
    .prepare('SELECT garantia_padrao_dias, dias_reincidencia FROM empresa WHERE id = 1')
    .first<{ garantia_padrao_dias: number; dias_reincidencia: number }>();
  return { garantiaPadrao: e?.garantia_padrao_dias ?? 90, diasReincidencia: e?.dias_reincidencia ?? 90 };
}

/** Expressão SQL (0/1) que indica se a OS de alias "o" é reincidência. Usa 1 parâmetro: dias. */
export const SQL_REINCIDENCIA = `EXISTS (
  SELECT 1 FROM ordens p
   WHERE p.id != o.id
     AND p.status = 'concluida'
     AND p.concluida_em < o.criado_em
     AND p.concluida_em >= strftime(${SQL_ISO}, o.criado_em, '-' || ? || ' days')
     AND (
       (o.endereco_chave != '' AND p.endereco_chave = o.endereco_chave)
       OR (p.cliente_id = o.cliente_id AND (SELECT tipo FROM clientes WHERE id = o.cliente_id) = 'PF')
     )
)`;

/** Expressão SQL (0/1) que indica se a OS de alias "o" está em garantia hoje. Usa 1 parâmetro: hoje. */
export const SQL_EM_GARANTIA = `(o.status = 'concluida' AND o.garantia_ate IS NOT NULL AND o.garantia_ate >= ?)`;
