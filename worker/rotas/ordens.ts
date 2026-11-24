import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { FORMAS_PAGAMENTO, STATUS_OS } from '../../shared/constantes';
import type { AppEnv } from '../tipos';
import { exigirLogin, type Usuario } from '../lib/auth';
import { reindexarOrdens } from '../lib/indice';
import { configuracoes, SQL_EM_GARANTIA, SQL_REINCIDENCIA } from '../lib/regras';
import { agoraISO, arred, chaveEndereco, condicaoBusca, dataSP, erro, somarDias, termosBusca } from '../lib/util';
import { bool01, idOpc, idParam, lerCorpo, txt } from '../lib/validacao';

export const ordens = new Hono<AppEnv>();

const schemaItem = z.object({
  servico_id: idOpc(),
  preco_id: idOpc(),
  descricao: z.string().trim().min(1, 'Informe a descrição do item.').max(300),
  unidade: txt(20).transform((u) => u || 'un'),
  quantidade: z.coerce.number().positive('A quantidade deve ser maior que zero.').max(100_000).default(1),
  valor_unitario: z.coerce.number().min(0).max(10_000_000).default(0),
  garantia_dias: z.coerce.number().int().min(0).max(3650).nullable().optional(),
});
type Item = z.output<typeof schemaItem>;

const formaPagamentoBase = z
  .string()
  .trim()
  .max(50)
  .refine((f) => f === '' || (FORMAS_PAGAMENTO as readonly string[]).includes(f), 'Forma de pagamento inválida.');
const formaPagamento = formaPagamentoBase.default('');
/** Texto opcional SEM valor padrão: ausente = não alterar. */
const txtOpc = (max: number) => z.string().trim().max(max).optional();
const boolOpc = () =>
  z
    .union([z.boolean(), z.number()])
    .transform((v) => (v ? 1 : 0))
    .optional();

const schemaOrdem = z.object({
  cliente_id: z.coerce.number({ error: 'Selecione o cliente.' }).int().positive('Selecione o cliente.'),
  condominio_id: idOpc(),
  unidade: txt(50),
  cep: txt(9),
  logradouro: txt(),
  numero_endereco: txt(20),
  complemento: txt(100),
  bairro: txt(100),
  cidade: txt(100),
  uf: txt(2),
  contato_nome: txt(),
  contato_telefone: txt(20),
  local_servico: txt(200),
  problema: txt(4000),
  servico_executado: txt(4000),
  observacoes_internas: txt(4000),
  prioridade: z.enum(['normal', 'urgente']).default('normal'),
  data_agendada: z.string().datetime({ offset: true, message: 'Data agendada inválida.' }).nullable().optional(),
  tecnico_id: idOpc(),
  ajudante_id: idOpc(),
  veiculo_id: idOpc(),
  origem_id: idOpc(),
  retorno_garantia: bool01(),
  itens: z.array(schemaItem).max(100).default([]),
  desconto: z.coerce.number().min(0).max(10_000_000).default(0),
  forma_pagamento: formaPagamento,
  pago: bool01(),
});

// Campos que o técnico pode alterar na própria OS durante o atendimento.
const schemaTecnico = z.object({
  servico_executado: txtOpc(4000),
  local_servico: txtOpc(200),
  itens: z.array(schemaItem).max(100).optional(),
  desconto: z.coerce.number().min(0).max(10_000_000).optional(),
  forma_pagamento: formaPagamentoBase.optional(),
  pago: boolOpc(),
});

// ---------- Auxiliares ----------

const SELECT_LISTA = `
  SELECT o.id, o.numero, o.status, o.prioridade, o.data_agendada, o.criado_em, o.concluida_em, o.garantia_ate,
         o.cliente_id, c.nome AS cliente_nome, c.telefone AS cliente_telefone, c.tipo AS cliente_tipo,
         o.condominio_id, cd.nome AS condominio_nome, o.unidade,
         o.logradouro, o.numero_endereco, o.complemento, o.bairro, o.cidade, o.uf, o.cep,
         o.problema, o.local_servico, o.valor_total, o.pago, o.retorno_garantia, o.origem_id,
         o.tecnico_id, t.nome AS tecnico_nome, o.veiculo_id, v.placa AS veiculo_placa,
         ${SQL_EM_GARANTIA} AS em_garantia,
         ${SQL_REINCIDENCIA} AS reincidencia
    FROM ordens o
    JOIN clientes c ON c.id = o.cliente_id
    LEFT JOIN condominios cd ON cd.id = o.condominio_id
    LEFT JOIN funcionarios t ON t.id = o.tecnico_id
    LEFT JOIN veiculos v ON v.id = o.veiculo_id`;

export async function listarOrdens(
  c: Context<AppEnv>,
  where: string[],
  params: unknown[],
  opcoes: { ordem?: string; limite?: number; offset?: number } = {},
) {
  const { diasReincidencia } = await configuracoes(c.env.DB);
  const hoje = dataSP();
  const sqlWhere = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const { results } = await c.env.DB.prepare(
    `${SELECT_LISTA} ${sqlWhere} ORDER BY ${opcoes.ordem ?? 'o.criado_em DESC'} LIMIT ? OFFSET ?`,
  )
    .bind(hoje, diasReincidencia, ...params, opcoes.limite ?? 50, opcoes.offset ?? 0)
    .all();
  return results;
}

function podeAcessar(u: Usuario, o: { tecnico_id: number | null; ajudante_id: number | null }) {
  if (u.perfil === 'admin' || u.perfil === 'atendente') return true;
  return o.tecnico_id === u.id || o.ajudante_id === u.id;
}

interface OrdemDb {
  id: number;
  numero: number;
  status: (typeof STATUS_OS)[number];
  cliente_id: number;
  tecnico_id: number | null;
  ajudante_id: number | null;
  retorno_garantia: number;
  origem_id: number | null;
  desconto: number;
  concluida_em: string | null;
  garantia_ate: string | null;
  servico_executado: string;
  assinatura_key: string | null;
}

async function carregarOrdem(c: Context<AppEnv>, id: number): Promise<OrdemDb> {
  const o = await c.env.DB.prepare('SELECT * FROM ordens WHERE id = ?').bind(id).first<OrdemDb>();
  if (!o) erro(404, 'Ordem de serviço não encontrada.');
  if (!podeAcessar(c.get('usuario'), o)) erro(403, 'Esta OS não está atribuída a você.');
  return o;
}

/** Completa itens com o prazo de garantia do serviço e calcula totais. */
async function prepararItens(db: D1Database, itens: Item[]) {
  const ids = [...new Set(itens.map((i) => i.servico_id).filter((x): x is number => !!x))];
  const garantias = new Map<number, number | null>();
  if (ids.length) {
    const { results } = await db
      .prepare(`SELECT id, garantia_dias FROM servicos WHERE id IN (${ids.map(() => '?').join(',')})`)
      .bind(...ids)
      .all<{ id: number; garantia_dias: number | null }>();
    for (const r of results) garantias.set(r.id, r.garantia_dias);
  }
  const prontos = itens.map((i) => ({
    ...i,
    garantia_dias: i.garantia_dias ?? (i.servico_id ? (garantias.get(i.servico_id) ?? null) : null),
  }));
  const valorServicos = arred(prontos.reduce((s, i) => s + i.quantidade * i.valor_unitario, 0));
  return { itens: prontos, valorServicos };
}

function totais(valorServicos: number, desconto: number, retornoGarantia: number) {
  if (retornoGarantia) return { valor_servicos: valorServicos, desconto: valorServicos, valor_total: 0 };
  const d = Math.min(desconto, valorServicos);
  return { valor_servicos: valorServicos, desconto: arred(d), valor_total: arred(valorServicos - d) };
}

function stmtsItens(db: D1Database, ordemId: number, itens: Item[]) {
  return [
    db.prepare('DELETE FROM ordem_itens WHERE ordem_id = ?').bind(ordemId),
    ...itens.map((i) =>
      db
        .prepare(
          `INSERT INTO ordem_itens (ordem_id, servico_id, preco_id, descricao, unidade, quantidade, valor_unitario, garantia_dias)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(ordemId, i.servico_id ?? null, i.preco_id ?? null, i.descricao, i.unidade, i.quantidade, i.valor_unitario, i.garantia_dias ?? null),
    ),
  ];
}

/** Calcula a data de fim da garantia para uma OS concluída. */
async function calcularGarantia(db: D1Database, ordemId: number, concluidaEm: string): Promise<string | null> {
  const o = await db.prepare('SELECT retorno_garantia, origem_id FROM ordens WHERE id = ?').bind(ordemId).first<{ retorno_garantia: number; origem_id: number | null }>();
  if (o?.retorno_garantia && o.origem_id) {
    const orig = await db.prepare('SELECT garantia_ate FROM ordens WHERE id = ?').bind(o.origem_id).first<{ garantia_ate: string | null }>();
    return orig?.garantia_ate ?? null;
  }
  const { garantiaPadrao } = await configuracoes(db);
  const r = await db
    .prepare('SELECT MAX(COALESCE(garantia_dias, ?)) AS dias, COUNT(*) AS n FROM ordem_itens WHERE ordem_id = ?')
    .bind(garantiaPadrao, ordemId)
    .first<{ dias: number | null; n: number }>();
  const dias = r?.n ? (r.dias ?? garantiaPadrao) : garantiaPadrao;
  if (dias <= 0) return null;
  return somarDias(dataSP(concluidaEm), dias);
}

async function validarReferencias(c: Context<AppEnv>, d: z.output<typeof schemaOrdem>, idAtual?: number) {
  const db = c.env.DB;
  const cliente = await db.prepare('SELECT id FROM clientes WHERE id = ?').bind(d.cliente_id).first();
  if (!cliente) erro(422, 'Cliente não encontrado.');
  if (d.condominio_id) {
    const cd = await db.prepare('SELECT id FROM condominios WHERE id = ?').bind(d.condominio_id).first();
    if (!cd) erro(422, 'Condomínio não encontrado.');
  }
  for (const [campo, nome] of [
    ['tecnico_id', 'Técnico'],
    ['ajudante_id', 'Ajudante'],
  ] as const) {
    const id = d[campo];
    if (id) {
      const f = await db.prepare('SELECT ativo FROM funcionarios WHERE id = ?').bind(id).first<{ ativo: number }>();
      if (!f) erro(422, `${nome} não encontrado.`);
    }
  }
  if (d.veiculo_id) {
    const v = await db.prepare('SELECT id FROM veiculos WHERE id = ?').bind(d.veiculo_id).first();
    if (!v) erro(422, 'Veículo não encontrado.');
  }
  if (d.retorno_garantia && !d.origem_id) erro(422, 'Para retorno em garantia, informe a OS original.');
  if (d.origem_id) {
    if (d.origem_id === idAtual) erro(422, 'A OS não pode ser origem dela mesma.');
    const orig = await db
      .prepare('SELECT numero, status, garantia_ate FROM ordens WHERE id = ?')
      .bind(d.origem_id)
      .first<{ numero: number; status: string; garantia_ate: string | null }>();
    if (!orig) erro(422, 'OS original não encontrada.');
    if (d.retorno_garantia && idAtual === undefined) {
      if (orig.status !== 'concluida') erro(422, `A OS nº ${orig.numero} ainda não foi concluída.`);
      if (!orig.garantia_ate || orig.garantia_ate < dataSP()) {
        erro(422, `A garantia da OS nº ${orig.numero} não está mais válida${orig.garantia_ate ? ` (venceu em ${orig.garantia_ate.split('-').reverse().join('/')})` : ''}. Abra uma OS normal vinculada a ela.`);
      }
    }
  }
}

function statusInicial(d: { data_agendada?: string | null; tecnico_id?: number | null }) {
  return d.data_agendada && d.tecnico_id ? 'agendada' : 'aberta';
}

export async function detalheOrdem(c: Context<AppEnv>, id: number) {
  const db = c.env.DB;
  const { diasReincidencia } = await configuracoes(db);
  const o = await db
    .prepare(
      `SELECT o.*, ${SQL_EM_GARANTIA} AS em_garantia, ${SQL_REINCIDENCIA} AS reincidencia,
              t.nome AS tecnico_nome, a.nome AS ajudante_nome, v.placa AS veiculo_placa, v.modelo AS veiculo_modelo,
              orig.numero AS origem_numero, cr.nome AS criado_por_nome
         FROM ordens o
         LEFT JOIN funcionarios t ON t.id = o.tecnico_id
         LEFT JOIN funcionarios a ON a.id = o.ajudante_id
         LEFT JOIN veiculos v ON v.id = o.veiculo_id
         LEFT JOIN ordens orig ON orig.id = o.origem_id
         LEFT JOIN funcionarios cr ON cr.id = o.criado_por
        WHERE o.id = ?`,
    )
    .bind(dataSP(), diasReincidencia, id)
    .first<Record<string, unknown>>();
  if (!o) erro(404, 'Ordem de serviço não encontrada.');
  const [cliente, condominio, itens, fotos, notas, retornos] = await Promise.all([
    db.prepare('SELECT id, tipo, nome, cpf_cnpj, telefone, telefone2, email FROM clientes WHERE id = ?').bind(o.cliente_id).first(),
    o.condominio_id
      ? db.prepare('SELECT id, nome, sindico, zelador, telefone FROM condominios WHERE id = ?').bind(o.condominio_id).first()
      : Promise.resolve(null),
    db.prepare('SELECT * FROM ordem_itens WHERE ordem_id = ? ORDER BY id').bind(id).all(),
    db.prepare('SELECT id, tipo, legenda, r2_key, criado_em FROM ordem_fotos WHERE ordem_id = ? ORDER BY criado_em').bind(id).all(),
    db.prepare('SELECT id, status, numero, data_emissao FROM notas_fiscais WHERE ordem_id = ? ORDER BY id DESC').bind(id).all(),
    db.prepare('SELECT id, numero, status, criado_em, retorno_garantia FROM ordens WHERE origem_id = ? ORDER BY criado_em').bind(id).all(),
  ]);
  for (const k of Object.keys(o)) if (k.startsWith('busca')) delete o[k];
  return { ...o, cliente, condominio, itens: itens.results, fotos: fotos.results, notas: notas.results, retornos: retornos.results };
}

// ---------- Rotas ----------

ordens.get('/', exigirLogin(), async (c) => {
  const u = c.get('usuario');
  const where: string[] = [];
  const params: unknown[] = [];
  const q = c.req.query('q') ?? '';
  if (q) {
    const cond = condicaoBusca(['o.busca'], termosBusca(q));
    where.push(cond.sql);
    params.push(...cond.params);
  }
  const status = c.req.query('status');
  if (status) {
    const lista = status.split(',').filter((s) => (STATUS_OS as readonly string[]).includes(s));
    if (lista.length) {
      where.push(`o.status IN (${lista.map(() => '?').join(',')})`);
      params.push(...lista);
    }
  }
  const tecnico = Number(c.req.query('tecnico_id'));
  if (tecnico) {
    where.push('(o.tecnico_id = ? OR o.ajudante_id = ?)');
    params.push(tecnico, tecnico);
  }
  if (u.perfil === 'tecnico') {
    where.push('(o.tecnico_id = ? OR o.ajudante_id = ?)');
    params.push(u.id, u.id);
  }
  // Período pela data agendada (ou de abertura, se não agendada), no fuso de São Paulo.
  const de = c.req.query('de');
  const ate = c.req.query('ate');
  const dataRef = `date(COALESCE(o.data_agendada, o.criado_em), '-3 hours')`;
  if (de) {
    where.push(`${dataRef} >= ?`);
    params.push(de);
  }
  if (ate) {
    where.push(`${dataRef} <= ?`);
    params.push(ate);
  }
  const limite = Math.min(Number(c.req.query('limite') ?? 50) || 50, 200);
  const pagina = Math.max(Number(c.req.query('pagina') ?? 1) || 1, 1);
  const ordem =
    c.req.query('ordem') === 'agenda'
      ? `CASE o.status WHEN 'em_andamento' THEN 0 WHEN 'agendada' THEN 1 WHEN 'aberta' THEN 2 ELSE 3 END, o.prioridade = 'urgente' DESC, COALESCE(o.data_agendada, o.criado_em)`
      : 'o.criado_em DESC';
  const itens = await listarOrdens(c, where, params, { ordem, limite, offset: (pagina - 1) * limite });
  const total = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM ordens o ${where.length ? 'WHERE ' + where.join(' AND ') : ''}`)
    .bind(...params)
    .first<{ n: number }>();
  return c.json({ itens, total: total?.n ?? 0 });
});

/** OS do técnico logado (pendentes + concluídas hoje), com detalhes completos para uso offline. */
ordens.get('/minhas', exigirLogin(), async (c) => {
  const u = c.get('usuario');
  const hoje = dataSP();
  const { results } = await c.env.DB.prepare(
    `SELECT id FROM ordens
      WHERE (tecnico_id = ? OR ajudante_id = ?)
        AND (status IN ('aberta', 'agendada', 'em_andamento') OR (status = 'concluida' AND concluida_em >= ?))
      ORDER BY CASE status WHEN 'em_andamento' THEN 0 WHEN 'agendada' THEN 1 WHEN 'aberta' THEN 2 ELSE 3 END,
               prioridade = 'urgente' DESC, COALESCE(data_agendada, criado_em)
      LIMIT 50`,
  )
    .bind(u.id, u.id, new Date(Date.now() - 86_400_000).toISOString())
    .all<{ id: number }>();
  const lista = await Promise.all(results.map((r) => detalheOrdem(c, r.id)));
  return c.json({ itens: lista, hoje, sincronizado_em: agoraISO() });
});

ordens.get('/:id', exigirLogin(), async (c) => {
  const id = idParam(c);
  await carregarOrdem(c, id);
  return c.json(await detalheOrdem(c, id));
});

ordens.post('/', exigirLogin('admin', 'atendente'), async (c) => {
  const d = await lerCorpo(c, schemaOrdem);
  await validarReferencias(c, d);
  const { itens, valorServicos } = await prepararItens(c.env.DB, d.itens);
  const { itens: _ignorar, ...campos } = d;
  const registro = {
    ...campos,
    ...totais(valorServicos, d.desconto, d.retorno_garantia),
    data_agendada: d.data_agendada ? new Date(d.data_agendada).toISOString() : null,
    endereco_chave: chaveEndereco(d.logradouro, d.numero_endereco, d.unidade || d.complemento),
    status: statusInicial(d),
    criado_por: c.get('usuario').id,
    criado_em: agoraISO(),
  };
  const cols = Object.keys(registro);
  const r = await c.env.DB.prepare(
    `INSERT INTO ordens (numero, ${cols.join(', ')})
     VALUES ((SELECT COALESCE(MAX(numero), 0) + 1 FROM ordens), ${cols.map(() => '?').join(', ')})
     RETURNING id`,
  )
    .bind(...cols.map((k) => (registro as Record<string, unknown>)[k] ?? null))
    .first<{ id: number }>();
  const id = r!.id;
  await c.env.DB.batch(stmtsItens(c.env.DB, id, itens));
  await reindexarOrdens(c.env.DB, 'o.id = ?', [id]);
  return c.json(await detalheOrdem(c, id), 201);
});

ordens.put('/:id', exigirLogin(), async (c) => {
  const id = idParam(c);
  const atual = await carregarOrdem(c, id);
  const u = c.get('usuario');
  const db = c.env.DB;

  if (u.perfil === 'tecnico') {
    if (!['aberta', 'agendada', 'em_andamento'].includes(atual.status)) erro(422, 'Esta OS já foi encerrada.');
    const d = await lerCorpo(c, schemaTecnico);
    const sets: Record<string, unknown> = {};
    for (const k of ['servico_executado', 'local_servico', 'forma_pagamento', 'pago'] as const) {
      if (d[k] !== undefined) sets[k] = d[k];
    }
    const stmts: D1PreparedStatement[] = [];
    if (d.itens || d.desconto !== undefined) {
      let valorServicos: number;
      if (d.itens) {
        const prep = await prepararItens(db, d.itens);
        valorServicos = prep.valorServicos;
        stmts.push(...stmtsItens(db, id, prep.itens));
      } else {
        const s = await db.prepare('SELECT COALESCE(SUM(quantidade * valor_unitario), 0) AS v FROM ordem_itens WHERE ordem_id = ?').bind(id).first<{ v: number }>();
        valorServicos = arred(s?.v ?? 0);
      }
      Object.assign(sets, totais(valorServicos, d.desconto ?? atual.desconto, atual.retorno_garantia));
    }
    sets.atualizado_em = agoraISO();
    const cols = Object.keys(sets);
    stmts.push(db.prepare(`UPDATE ordens SET ${cols.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).bind(...cols.map((k) => sets[k]), id));
    await db.batch(stmts);
  } else {
    const d = await lerCorpo(c, schemaOrdem);
    await validarReferencias(c, d, id);
    const { itens, valorServicos } = await prepararItens(db, d.itens);
    const { itens: _ignorar, ...campos } = d;
    const registro: Record<string, unknown> = {
      ...campos,
      ...totais(valorServicos, d.desconto, d.retorno_garantia),
      data_agendada: d.data_agendada ? new Date(d.data_agendada).toISOString() : null,
      endereco_chave: chaveEndereco(d.logradouro, d.numero_endereco, d.unidade || d.complemento),
      atualizado_em: agoraISO(),
    };
    // Ao agendar/desagendar uma OS ainda não iniciada, ajusta o status automaticamente.
    if (atual.status === 'aberta' || atual.status === 'agendada') registro.status = statusInicial(d);
    const cols = Object.keys(registro);
    await db.batch([
      db.prepare(`UPDATE ordens SET ${cols.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).bind(...cols.map((k) => registro[k] ?? null), id),
      ...stmtsItens(db, id, itens),
    ]);
  }
  // Se já concluída, recalcula a garantia (itens podem ter mudado).
  if (atual.status === 'concluida' && atual.concluida_em) {
    const garantia = await calcularGarantia(db, id, atual.concluida_em);
    await db.prepare('UPDATE ordens SET garantia_ate = ? WHERE id = ?').bind(garantia, id).run();
  }
  await reindexarOrdens(db, 'o.id = ?', [id]);
  return c.json(await detalheOrdem(c, id));
});

/** Instante informado pelo celular (útil quando a ação foi feita offline). */
function instante(valor: string | undefined | null): string {
  if (!valor) return agoraISO();
  const t = new Date(valor).getTime();
  if (Number.isNaN(t)) erro(422, 'Data/hora inválida.');
  const agora = Date.now();
  if (t > agora + 10 * 60_000 || t < agora - 30 * 86_400_000) return agoraISO();
  return new Date(t).toISOString();
}

ordens.post('/:id/iniciar', exigirLogin('admin', 'atendente', 'tecnico'), async (c) => {
  const id = idParam(c);
  const o = await carregarOrdem(c, id);
  const corpo = await c.req.json<{ quando?: string }>().catch(() => ({}) as { quando?: string });
  if (o.status === 'em_andamento' || o.status === 'concluida') return c.json(await detalheOrdem(c, id)); // idempotente
  if (o.status === 'cancelada') erro(422, 'Esta OS foi cancelada.');
  await c.env.DB.prepare("UPDATE ordens SET status = 'em_andamento', iniciada_em = ?, atualizado_em = ? WHERE id = ?")
    .bind(instante(corpo.quando), agoraISO(), id)
    .run();
  return c.json(await detalheOrdem(c, id));
});

const schemaConcluir = z.object({
  servico_executado: z.string().trim().min(1, 'Descreva o serviço executado.').max(4000),
  itens: z.array(schemaItem).max(100).optional(),
  desconto: z.coerce.number().min(0).max(10_000_000).optional(),
  forma_pagamento: formaPagamentoBase.optional(),
  pago: boolOpc(),
  assinatura_nome: txtOpc(200),
  quando: z.string().optional(),
});

ordens.post('/:id/concluir', exigirLogin('admin', 'atendente', 'tecnico'), async (c) => {
  const id = idParam(c);
  const o = await carregarOrdem(c, id);
  const d = await lerCorpo(c, schemaConcluir);
  if (o.status === 'concluida') return c.json(await detalheOrdem(c, id)); // idempotente (reenvio offline)
  if (o.status === 'cancelada') erro(422, 'Esta OS foi cancelada.');
  const db = c.env.DB;
  const stmts: D1PreparedStatement[] = [];
  let valorServicos: number;
  if (d.itens) {
    const prep = await prepararItens(db, d.itens);
    valorServicos = prep.valorServicos;
    stmts.push(...stmtsItens(db, id, prep.itens));
  } else {
    const s = await db.prepare('SELECT COALESCE(SUM(quantidade * valor_unitario), 0) AS v FROM ordem_itens WHERE ordem_id = ?').bind(id).first<{ v: number }>();
    valorServicos = arred(s?.v ?? 0);
  }
  const t = totais(valorServicos, d.desconto ?? o.desconto, o.retorno_garantia);
  const quando = instante(d.quando);
  stmts.push(
    db
      .prepare(
        `UPDATE ordens SET status = 'concluida', servico_executado = ?, concluida_em = ?, iniciada_em = COALESCE(iniciada_em, ?),
                valor_servicos = ?, desconto = ?, valor_total = ?,
                forma_pagamento = COALESCE(?, forma_pagamento), pago = COALESCE(?, pago),
                assinatura_nome = COALESCE(?, assinatura_nome), atualizado_em = ?
          WHERE id = ?`,
      )
      .bind(
        d.servico_executado,
        quando,
        quando,
        t.valor_servicos,
        t.desconto,
        t.valor_total,
        d.forma_pagamento ?? null,
        d.pago ?? null,
        d.assinatura_nome || null,
        agoraISO(),
        id,
      ),
  );
  await db.batch(stmts);
  const garantia = await calcularGarantia(db, id, quando);
  await db.prepare('UPDATE ordens SET garantia_ate = ? WHERE id = ?').bind(garantia, id).run();
  await reindexarOrdens(db, 'o.id = ?', [id]);
  return c.json(await detalheOrdem(c, id));
});

ordens.post('/:id/cancelar', exigirLogin('admin', 'atendente'), async (c) => {
  const id = idParam(c);
  const o = await carregarOrdem(c, id);
  const d = await lerCorpo(c, z.object({ motivo: z.string().trim().min(1, 'Informe o motivo do cancelamento.').max(1000) }));
  if (o.status === 'cancelada') erro(422, 'Esta OS já está cancelada.');
  const nota = await c.env.DB.prepare("SELECT 1 FROM notas_fiscais WHERE ordem_id = ? AND status = 'emitida'").bind(id).first();
  if (nota) erro(422, 'Esta OS tem nota fiscal emitida. Cancele a nota antes.');
  await c.env.DB.prepare("UPDATE ordens SET status = 'cancelada', motivo_cancelamento = ?, garantia_ate = NULL, atualizado_em = ? WHERE id = ?")
    .bind(d.motivo, agoraISO(), id)
    .run();
  return c.json(await detalheOrdem(c, id));
});

ordens.post('/:id/reabrir', exigirLogin('admin'), async (c) => {
  const id = idParam(c);
  const o = await carregarOrdem(c, id);
  if (o.status !== 'concluida' && o.status !== 'cancelada') erro(422, 'Só é possível reabrir OS concluída ou cancelada.');
  const novo = o.servico_executado ? 'em_andamento' : 'aberta';
  await c.env.DB.prepare(
    `UPDATE ordens SET status = ?, concluida_em = NULL, garantia_ate = NULL, motivo_cancelamento = '', atualizado_em = ? WHERE id = ?`,
  )
    .bind(novo, agoraISO(), id)
    .run();
  return c.json(await detalheOrdem(c, id));
});

// ---------- Fotos e assinatura (R2) ----------

const TIPOS_IMAGEM = ['image/jpeg', 'image/png', 'image/webp'];
const TAMANHO_MAX = 8 * 1024 * 1024;

async function lerImagem(c: Context<AppEnv>) {
  const tipo = (c.req.header('content-type') ?? '').split(';')[0].trim();
  if (!TIPOS_IMAGEM.includes(tipo)) erro(422, 'Envie uma imagem JPEG, PNG ou WEBP.');
  const corpo = await c.req.arrayBuffer();
  if (corpo.byteLength === 0) erro(422, 'Imagem vazia.');
  if (corpo.byteLength > TAMANHO_MAX) erro(422, 'Imagem muito grande (máximo 8 MB).');
  return { tipo, corpo, ext: tipo === 'image/png' ? 'png' : tipo === 'image/webp' ? 'webp' : 'jpg' };
}

/** PUT idempotente: o id da foto vem do celular, então reenvios não duplicam. */
ordens.put('/:id/fotos/:fotoId', exigirLogin('admin', 'atendente', 'tecnico'), async (c) => {
  const id = idParam(c);
  const o = await carregarOrdem(c, id);
  if (o.status === 'cancelada') erro(422, 'Esta OS foi cancelada.');
  const fotoId = c.req.param('fotoId');
  if (!/^[a-zA-Z0-9-]{8,64}$/.test(fotoId)) erro(400, 'Identificador da foto inválido.');
  const tipoFoto = c.req.query('tipo') === 'depois' ? 'depois' : 'antes';
  const legenda = (c.req.query('legenda') ?? '').slice(0, 200);
  const existente = await c.env.DB.prepare('SELECT ordem_id FROM ordem_fotos WHERE id = ?').bind(fotoId).first<{ ordem_id: number }>();
  if (existente && existente.ordem_id !== id) erro(409, 'Identificador de foto já usado.');
  if (!existente) {
    const img = await lerImagem(c);
    const key = `ordens/${id}/${fotoId}.${img.ext}`;
    await c.env.ARQUIVOS.put(key, img.corpo, { httpMetadata: { contentType: img.tipo } });
    await c.env.DB.prepare('INSERT INTO ordem_fotos (id, ordem_id, tipo, r2_key, legenda, criado_por, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(fotoId, id, tipoFoto, key, legenda, c.get('usuario').id, instante(c.req.query('quando')))
      .run();
  }
  const foto = await c.env.DB.prepare('SELECT id, tipo, legenda, r2_key, criado_em FROM ordem_fotos WHERE id = ?').bind(fotoId).first();
  return c.json(foto);
});

ordens.delete('/:id/fotos/:fotoId', exigirLogin('admin', 'atendente', 'tecnico'), async (c) => {
  const id = idParam(c);
  const o = await carregarOrdem(c, id);
  if (c.get('usuario').perfil === 'tecnico' && o.status === 'concluida') erro(422, 'Esta OS já foi concluída.');
  const foto = await c.env.DB.prepare('SELECT r2_key FROM ordem_fotos WHERE id = ? AND ordem_id = ?')
    .bind(c.req.param('fotoId'), id)
    .first<{ r2_key: string }>();
  if (foto) {
    await c.env.ARQUIVOS.delete(foto.r2_key);
    await c.env.DB.prepare('DELETE FROM ordem_fotos WHERE id = ?').bind(c.req.param('fotoId')).run();
  }
  return c.json({ ok: true });
});

ordens.put('/:id/assinatura', exigirLogin('admin', 'atendente', 'tecnico'), async (c) => {
  const id = idParam(c);
  const o = await carregarOrdem(c, id);
  if (o.status === 'cancelada') erro(422, 'Esta OS foi cancelada.');
  const img = await lerImagem(c);
  const key = `ordens/${id}/assinatura.${img.ext}`;
  await c.env.ARQUIVOS.put(key, img.corpo, { httpMetadata: { contentType: img.tipo } });
  const nome = (c.req.query('nome') ?? '').slice(0, 200);
  await c.env.DB.prepare('UPDATE ordens SET assinatura_key = ?, assinatura_nome = COALESCE(NULLIF(?, \'\'), assinatura_nome), atualizado_em = ? WHERE id = ?')
    .bind(key, nome, agoraISO(), id)
    .run();
  return c.json({ assinatura_key: key });
});
