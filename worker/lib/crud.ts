import { Hono, type Context } from 'hono';
import type { z } from 'zod';
import type { Perfil } from '../../shared/constantes';
import type { AppEnv } from '../tipos';
import { exigirLogin } from './auth';
import { agoraISO, condicaoBusca, erro, termosBusca } from './util';
import { idParam, lerCorpo, sqlInsert, sqlUpdate } from './validacao';

export interface ConfigCrud<S extends z.ZodObject> {
  tabela: string;
  schema: S;
  /** SELECT base com alias "t" para a tabela principal (pode ter joins). */
  select?: string;
  ordem: string;
  colunasBusca: string[];
  /** Colunas extras de busca calculadas a partir dos dados (ex.: { busca: '...' }). */
  indices?: (dados: z.output<S>, c: Context<AppEnv>) => Promise<Record<string, string>> | Record<string, string>;
  /** Filtros extras por query string: nome do parâmetro -> coluna SQL. */
  filtros?: Record<string, string>;
  temAtivo?: boolean;
  leitura: Perfil[];
  escrita: Perfil[];
  depoisSalvar?: (c: Context<AppEnv>, id: number) => Promise<void>;
  /** Colunas a remover da resposta (ex.: senha_hash). */
  ocultar?: string[];
}

function limpar<T extends Record<string, unknown>>(row: T, ocultar: string[] = []): T {
  for (const k of ocultar) delete row[k];
  for (const k of Object.keys(row)) if (k.startsWith('busca')) delete row[k];
  return row;
}

/** Rotas padrão de listagem/consulta/inclusão/alteração/exclusão para cadastros simples. */
export function criarCrud<S extends z.ZodObject>(cfg: ConfigCrud<S>) {
  const app = new Hono<AppEnv>();
  const select = cfg.select ?? `SELECT t.* FROM ${cfg.tabela} t`;

  app.get('/', exigirLogin(...cfg.leitura), async (c) => {
    const q = c.req.query('q') ?? '';
    const limite = Math.min(Number(c.req.query('limite') ?? 50) || 50, 500);
    const pagina = Math.max(Number(c.req.query('pagina') ?? 1) || 1, 1);
    const cond = condicaoBusca(cfg.colunasBusca, termosBusca(q));
    const where = [cond.sql];
    const params: unknown[] = [...cond.params];
    if (cfg.temAtivo && c.req.query('ativos') === '1') where.push('t.ativo = 1');
    for (const [param, coluna] of Object.entries(cfg.filtros ?? {})) {
      const v = c.req.query(param);
      if (v !== undefined && v !== '') {
        where.push(`${coluna} = ?`);
        params.push(v);
      }
    }
    const base = `${select} WHERE ${where.join(' AND ')}`;
    const [{ results }, total] = await Promise.all([
      c.env.DB.prepare(`${base} ORDER BY ${cfg.ordem} LIMIT ? OFFSET ?`)
        .bind(...params, limite, (pagina - 1) * limite)
        .all<Record<string, unknown>>(),
      c.env.DB.prepare(`SELECT COUNT(*) AS n FROM (${base})`)
        .bind(...params)
        .first<{ n: number }>(),
    ]);
    return c.json({ itens: results.map((r) => limpar(r, cfg.ocultar)), total: total?.n ?? 0 });
  });

  app.get('/:id', exigirLogin(...cfg.leitura), async (c) => {
    const id = idParam(c);
    const row = await c.env.DB.prepare(`${select} WHERE t.id = ?`).bind(id).first<Record<string, unknown>>();
    if (!row) erro(404, 'Registro não encontrado.');
    return c.json(limpar(row, cfg.ocultar));
  });

  app.post('/', exigirLogin(...cfg.escrita), async (c) => {
    const dados = await lerCorpo(c, cfg.schema);
    const indices = cfg.indices ? await cfg.indices(dados, c) : {};
    const { sql, params } = sqlInsert(cfg.tabela, { ...dados, ...indices, criado_em: agoraISO() });
    const r = await c.env.DB.prepare(sql + ' RETURNING id').bind(...params).first<{ id: number }>();
    const id = r!.id;
    if (cfg.depoisSalvar) await cfg.depoisSalvar(c, id);
    const row = await c.env.DB.prepare(`${select} WHERE t.id = ?`).bind(id).first<Record<string, unknown>>();
    return c.json(limpar(row!, cfg.ocultar), 201);
  });

  app.put('/:id', exigirLogin(...cfg.escrita), async (c) => {
    const id = idParam(c);
    const existe = await c.env.DB.prepare(`SELECT id FROM ${cfg.tabela} WHERE id = ?`).bind(id).first();
    if (!existe) erro(404, 'Registro não encontrado.');
    const dados = await lerCorpo(c, cfg.schema);
    const indices = cfg.indices ? await cfg.indices(dados, c) : {};
    const { sql, params } = sqlUpdate(cfg.tabela, { ...dados, ...indices, atualizado_em: agoraISO() }, id);
    await c.env.DB.prepare(sql).bind(...params).run();
    if (cfg.depoisSalvar) await cfg.depoisSalvar(c, id);
    const row = await c.env.DB.prepare(`${select} WHERE t.id = ?`).bind(id).first<Record<string, unknown>>();
    return c.json(limpar(row!, cfg.ocultar));
  });

  app.delete('/:id', exigirLogin(...cfg.escrita), async (c) => {
    const id = idParam(c);
    try {
      const r = await c.env.DB.prepare(`DELETE FROM ${cfg.tabela} WHERE id = ?`).bind(id).run();
      if (!r.meta.changes) erro(404, 'Registro não encontrado.');
    } catch (e) {
      if (String(e).includes('FOREIGN KEY')) {
        erro(
          409,
          cfg.temAtivo
            ? 'Este registro está em uso e não pode ser excluído. Desative-o em vez de excluir.'
            : 'Este registro está em uso (ex.: ordens de serviço) e não pode ser excluído.',
        );
      }
      throw e;
    }
    return c.json({ ok: true });
  });

  return app;
}
