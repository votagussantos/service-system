import { Hono } from 'hono';
import { z } from 'zod';
import { STATUS_NOTA } from '../../shared/constantes';
import type { AppEnv } from '../tipos';
import { exigirLogin } from '../lib/auth';
import { agoraISO, arred, condicaoBusca, dataSP, erro, termosBusca } from '../lib/util';
import { bool01, idOpc, idParam, lerCorpo, sqlUpdate, txt } from '../lib/validacao';

/**
 * Notas fiscais de serviço (NFS-e) — por enquanto apenas registro.
 * Fluxo: gerar a partir da OS concluída (pendente) → emitir no portal da prefeitura →
 * lançar número, série, código de verificação e data (emitida).
 * A estrutura já guarda os dados necessários para integrar com um provedor/emissor no futuro.
 */
export const notas = new Hono<AppEnv>();
notas.use('*', exigirLogin('admin', 'atendente'));

const SELECT = `
  SELECT n.*, c.nome AS cliente_nome, c.cpf_cnpj AS cliente_documento, c.tipo AS cliente_tipo,
         o.numero AS ordem_numero
    FROM notas_fiscais n
    JOIN clientes c ON c.id = n.cliente_id
    LEFT JOIN ordens o ON o.id = n.ordem_id`;

const schemaNota = z.object({
  ordem_id: idOpc(),
  cliente_id: z.coerce.number({ error: 'Selecione o cliente.' }).int().positive('Selecione o cliente.'),
  competencia: z.string().regex(/^\d{4}-\d{2}$/, 'Competência inválida (use AAAA-MM).'),
  discriminacao: z.string().trim().min(1, 'Informe a discriminação dos serviços.').max(4000),
  codigo_servico: txt(30),
  valor_servicos: z.coerce.number().positive('O valor dos serviços deve ser maior que zero.').max(10_000_000),
  deducoes: z.coerce.number().min(0).max(10_000_000).default(0),
  aliquota_iss: z.coerce.number().min(0).max(100).default(0),
  iss_retido: bool01(),
});

function calcularIss(d: z.output<typeof schemaNota>) {
  const base = Math.max(0, d.valor_servicos - d.deducoes);
  return arred((base * d.aliquota_iss) / 100);
}

notas.get('/', async (c) => {
  const where: string[] = [];
  const params: unknown[] = [];
  const status = c.req.query('status');
  if (status && (STATUS_NOTA as readonly string[]).includes(status)) {
    where.push('n.status = ?');
    params.push(status);
  }
  const q = c.req.query('q');
  if (q) {
    const cond = condicaoBusca(['c.busca', "(' ' || n.numero || ' ')", "(' ' || o.numero || ' ')"], termosBusca(q));
    where.push(cond.sql);
    params.push(...cond.params);
  }
  const limite = Math.min(Number(c.req.query('limite') ?? 50) || 50, 200);
  const pagina = Math.max(Number(c.req.query('pagina') ?? 1) || 1, 1);
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [{ results }, total] = await Promise.all([
    c.env.DB.prepare(`${SELECT} ${w} ORDER BY n.criado_em DESC LIMIT ? OFFSET ?`)
      .bind(...params, limite, (pagina - 1) * limite)
      .all(),
    c.env.DB.prepare(`SELECT COUNT(*) AS n FROM (${SELECT} ${w})`).bind(...params).first<{ n: number }>(),
  ]);
  return c.json({ itens: results, total: total?.n ?? 0 });
});

/** Dados sugeridos para uma nova nota a partir de uma OS (não grava nada). */
notas.get('/sugestao/:ordemId', async (c) => {
  const id = idParam(c, 'ordemId');
  const o = await c.env.DB.prepare('SELECT * FROM ordens WHERE id = ?').bind(id).first<Record<string, any>>();
  if (!o) erro(404, 'OS não encontrada.');
  const empresa = await c.env.DB.prepare('SELECT aliquota_iss, codigo_servico_municipal FROM empresa WHERE id = 1').first<{
    aliquota_iss: number;
    codigo_servico_municipal: string;
  }>();
  const { results: itens } = await c.env.DB.prepare('SELECT descricao, quantidade, unidade, valor_unitario FROM ordem_itens WHERE ordem_id = ?')
    .bind(id)
    .all<{ descricao: string; quantidade: number; unidade: string; valor_unitario: number }>();
  const fmt = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const endereco = [o.logradouro, o.numero_endereco, o.unidade || o.complemento, o.bairro, o.cidade && `${o.cidade}/${o.uf}`]
    .filter(Boolean)
    .join(', ');
  const linhas = [
    ...itens.map((i) => `${i.descricao} - ${i.quantidade} ${i.unidade} x R$ ${fmt(i.valor_unitario)}`),
    o.desconto > 0 ? `Desconto: R$ ${fmt(o.desconto)}` : '',
    `Referente à OS nº ${o.numero}${endereco ? ` - Local: ${endereco}` : ''}.`,
  ].filter(Boolean);
  return c.json({
    ordem_id: id,
    cliente_id: o.cliente_id,
    competencia: dataSP(o.concluida_em ?? new Date()).slice(0, 7),
    discriminacao: linhas.join('\n'),
    codigo_servico: empresa?.codigo_servico_municipal ?? '',
    valor_servicos: o.valor_total,
    deducoes: 0,
    aliquota_iss: empresa?.aliquota_iss ?? 0,
    iss_retido: 0,
  });
});

notas.get('/:id', async (c) => {
  const n = await c.env.DB.prepare(`${SELECT} WHERE n.id = ?`).bind(idParam(c)).first();
  if (!n) erro(404, 'Nota não encontrada.');
  return c.json(n);
});

notas.post('/', async (c) => {
  const d = await lerCorpo(c, schemaNota);
  const cliente = await c.env.DB.prepare('SELECT id FROM clientes WHERE id = ?').bind(d.cliente_id).first();
  if (!cliente) erro(422, 'Cliente não encontrado.');
  if (d.ordem_id) {
    const o = await c.env.DB.prepare('SELECT status FROM ordens WHERE id = ?').bind(d.ordem_id).first<{ status: string }>();
    if (!o) erro(422, 'OS não encontrada.');
    if (o.status !== 'concluida') erro(422, 'Só é possível gerar nota de OS concluída.');
    const existe = await c.env.DB.prepare("SELECT id FROM notas_fiscais WHERE ordem_id = ? AND status != 'cancelada'").bind(d.ordem_id).first();
    if (existe) erro(409, 'Esta OS já tem uma nota fiscal registrada.');
  }
  const r = await c.env.DB.prepare(
    `INSERT INTO notas_fiscais (ordem_id, cliente_id, competencia, discriminacao, codigo_servico, valor_servicos, deducoes,
                                aliquota_iss, valor_iss, iss_retido, status, criado_por, criado_em)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendente', ?, ?) RETURNING id`,
  )
    .bind(
      d.ordem_id ?? null,
      d.cliente_id,
      d.competencia,
      d.discriminacao,
      d.codigo_servico,
      d.valor_servicos,
      d.deducoes,
      d.aliquota_iss,
      calcularIss(d),
      d.iss_retido,
      c.get('usuario').id,
      agoraISO(),
    )
    .first<{ id: number }>();
  return c.json(await c.env.DB.prepare(`${SELECT} WHERE n.id = ?`).bind(r!.id).first(), 201);
});

notas.put('/:id', async (c) => {
  const id = idParam(c);
  const atual = await c.env.DB.prepare('SELECT status FROM notas_fiscais WHERE id = ?').bind(id).first<{ status: string }>();
  if (!atual) erro(404, 'Nota não encontrada.');
  if (atual.status !== 'pendente') erro(422, 'Só é possível alterar notas pendentes de emissão.');
  const d = await lerCorpo(c, schemaNota);
  const { ordem_id: _o, ...campos } = d;
  const { sql, params } = sqlUpdate('notas_fiscais', { ...campos, valor_iss: calcularIss(d), atualizado_em: agoraISO() }, id);
  await c.env.DB.prepare(sql).bind(...params).run();
  return c.json(await c.env.DB.prepare(`${SELECT} WHERE n.id = ?`).bind(id).first());
});

/** Registra os dados da nota emitida no portal da prefeitura. */
notas.post('/:id/emitida', async (c) => {
  const id = idParam(c);
  const d = await lerCorpo(
    c,
    z.object({
      numero: z.string().trim().min(1, 'Informe o número da nota.').max(30),
      serie: txt(10),
      codigo_verificacao: txt(60),
      data_emissao: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data de emissão inválida.'),
    }),
  );
  const atual = await c.env.DB.prepare('SELECT status FROM notas_fiscais WHERE id = ?').bind(id).first<{ status: string }>();
  if (!atual) erro(404, 'Nota não encontrada.');
  if (atual.status === 'cancelada') erro(422, 'Esta nota está cancelada.');
  await c.env.DB.prepare(
    "UPDATE notas_fiscais SET status = 'emitida', numero = ?, serie = ?, codigo_verificacao = ?, data_emissao = ?, atualizado_em = ? WHERE id = ?",
  )
    .bind(d.numero, d.serie, d.codigo_verificacao, d.data_emissao, agoraISO(), id)
    .run();
  return c.json(await c.env.DB.prepare(`${SELECT} WHERE n.id = ?`).bind(id).first());
});

notas.post('/:id/cancelar', async (c) => {
  const id = idParam(c);
  const d = await lerCorpo(c, z.object({ motivo: z.string().trim().min(1, 'Informe o motivo do cancelamento.').max(1000) }));
  const atual = await c.env.DB.prepare('SELECT status FROM notas_fiscais WHERE id = ?').bind(id).first<{ status: string }>();
  if (!atual) erro(404, 'Nota não encontrada.');
  if (atual.status === 'cancelada') erro(422, 'Esta nota já está cancelada.');
  await c.env.DB.prepare("UPDATE notas_fiscais SET status = 'cancelada', motivo_cancelamento = ?, atualizado_em = ? WHERE id = ?")
    .bind(d.motivo, agoraISO(), id)
    .run();
  return c.json(await c.env.DB.prepare(`${SELECT} WHERE n.id = ?`).bind(id).first());
});
