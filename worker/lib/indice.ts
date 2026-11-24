import { textoBusca, normalizarLogradouro } from './util';

interface LinhaOrdem {
  id: number;
  numero: number;
  unidade: string;
  cep: string;
  logradouro: string;
  numero_endereco: string;
  complemento: string;
  bairro: string;
  cidade: string;
  contato_nome: string;
  contato_telefone: string;
  local_servico: string;
  problema: string;
  servico_executado: string;
  cliente_nome: string;
  cpf_cnpj: string;
  telefone: string;
  telefone2: string;
  email: string;
  condominio_nome: string | null;
  condominio_cnpj: string | null;
}

/**
 * Recalcula as colunas de busca das OS que atendem ao filtro.
 * Chamado ao salvar uma OS e quando cliente/condomínio mudam de nome, documento ou telefone.
 */
export async function reindexarOrdens(db: D1Database, filtroSql: string, params: unknown[]): Promise<void> {
  const { results } = await db
    .prepare(
      `SELECT o.id, o.numero, o.unidade, o.cep, o.logradouro, o.numero_endereco, o.complemento, o.bairro,
              o.cidade, o.contato_nome, o.contato_telefone, o.local_servico, o.problema, o.servico_executado,
              c.nome AS cliente_nome, c.cpf_cnpj, c.telefone, c.telefone2, c.email,
              cd.nome AS condominio_nome, cd.cnpj AS condominio_cnpj
         FROM ordens o
         JOIN clientes c ON c.id = o.cliente_id
         LEFT JOIN condominios cd ON cd.id = o.condominio_id
        WHERE ${filtroSql}`,
    )
    .bind(...params)
    .all<LinhaOrdem>();

  const stmts = results.map((o) => {
    const cliente = textoBusca(o.cliente_nome, o.cpf_cnpj, o.telefone, o.telefone2, o.email, o.contato_nome, o.contato_telefone);
    const endereco = textoBusca(
      normalizarLogradouro(o.logradouro),
      o.numero_endereco,
      o.complemento,
      o.unidade,
      o.bairro,
      o.cidade,
      o.cep,
    );
    const condominio = textoBusca(o.condominio_nome, o.condominio_cnpj);
    const geral = textoBusca(String(o.numero), o.local_servico, o.problema, o.servico_executado) + cliente + endereco + condominio;
    return db
      .prepare('UPDATE ordens SET busca_cliente = ?, busca_endereco = ?, busca_condominio = ?, busca = ? WHERE id = ?')
      .bind(cliente, endereco, condominio, geral, o.id);
  });

  for (let i = 0; i < stmts.length; i += 50) {
    await db.batch(stmts.slice(i, i + 50));
  }
}
