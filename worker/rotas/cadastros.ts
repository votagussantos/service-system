import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { PERFIS, REGIMES_TRIBUTARIOS } from '../../shared/constantes';
import type { AppEnv } from '../tipos';
import { criarCrud } from '../lib/crud';
import { exigirLogin, gerarHashSenha } from '../lib/auth';
import { reindexarOrdens } from '../lib/indice';
import { agoraISO, erro, normalizarLogradouro, textoBusca } from '../lib/util';
import { bool01, dataOpc, idOpc, idParam, inteiroOpc, lerCorpo, sqlUpdate, txt, txtObrig } from '../lib/validacao';

const endereco = {
  cep: txt(9),
  logradouro: txt(),
  numero: txt(20),
  bairro: txt(100),
  cidade: txt(100),
  uf: txt(2),
};

// ---------- Clientes ----------
export const clientes = criarCrud({
  tabela: 'clientes',
  schema: z.object({
    tipo: z.enum(['PF', 'PJ']).default('PF'),
    nome: txtObrig('o nome do cliente'),
    cpf_cnpj: txt(20),
    telefone: txt(20),
    telefone2: txt(20),
    email: txt(),
    ...endereco,
    complemento: txt(100),
    condominio_id: idOpc(),
    unidade: txt(50),
    observacoes: txt(2000),
  }),
  select: `SELECT t.*, cd.nome AS condominio_nome,
                  (SELECT COUNT(*) FROM ordens o WHERE o.cliente_id = t.id AND o.status != 'cancelada') AS total_os,
                  (SELECT MAX(o.criado_em) FROM ordens o WHERE o.cliente_id = t.id) AS ultima_os_em
             FROM clientes t LEFT JOIN condominios cd ON cd.id = t.condominio_id`,
  ordem: 't.nome COLLATE NOCASE',
  colunasBusca: ['t.busca', 't.busca_endereco'],
  filtros: { condominio_id: 't.condominio_id' },
  indices: async (d, c) => {
    let condominio = '';
    if (d.condominio_id) {
      const cd = await c.env.DB.prepare('SELECT nome FROM condominios WHERE id = ?').bind(d.condominio_id).first<{ nome: string }>();
      if (!cd) erro(422, 'Condomínio não encontrado.');
      condominio = cd.nome;
    }
    return {
      busca: textoBusca(d.nome, d.cpf_cnpj, d.telefone, d.telefone2, d.email),
      busca_endereco: textoBusca(normalizarLogradouro(d.logradouro), d.numero, d.complemento, d.unidade, d.bairro, d.cidade, d.cep, condominio),
    };
  },
  leitura: ['admin', 'atendente', 'tecnico'],
  escrita: ['admin', 'atendente'],
  depoisSalvar: (c, id) => reindexarOrdens(c.env.DB, 'o.cliente_id = ?', [id]),
});

// ---------- Condomínios ----------
export const condominios = criarCrud({
  tabela: 'condominios',
  schema: z.object({
    nome: txtObrig('o nome do condomínio'),
    cnpj: txt(20),
    sindico: txt(),
    zelador: txt(),
    telefone: txt(20),
    email: txt(),
    administradora: txt(),
    ...endereco,
    observacoes: txt(2000),
  }),
  select: `SELECT t.*,
                  (SELECT COUNT(*) FROM ordens o WHERE o.condominio_id = t.id AND o.status != 'cancelada') AS total_os,
                  (SELECT MAX(o.criado_em) FROM ordens o WHERE o.condominio_id = t.id) AS ultima_os_em
             FROM condominios t`,
  ordem: 't.nome COLLATE NOCASE',
  colunasBusca: ['t.busca', 't.busca_endereco'],
  indices: (d) => ({
    busca: textoBusca(d.nome, d.cnpj, d.sindico, d.zelador, d.administradora, d.telefone),
    busca_endereco: textoBusca(normalizarLogradouro(d.logradouro), d.numero, d.bairro, d.cidade, d.cep),
  }),
  leitura: ['admin', 'atendente', 'tecnico'],
  escrita: ['admin', 'atendente'],
  depoisSalvar: (c, id) => reindexarOrdens(c.env.DB, 'o.condominio_id = ?', [id]),
});

// ---------- Serviços (tipos de serviço) ----------
export const servicos = criarCrud({
  tabela: 'servicos',
  schema: z.object({
    nome: txtObrig('o nome do serviço'),
    descricao: txt(2000),
    categoria: txt(100),
    garantia_dias: inteiroOpc(),
    ativo: bool01().default(1),
  }),
  select: `SELECT t.*, (SELECT COUNT(*) FROM precos p WHERE p.servico_id = t.id AND p.ativo = 1) AS total_precos FROM servicos t`,
  ordem: 't.categoria, t.nome COLLATE NOCASE',
  colunasBusca: ['t.nome', 't.categoria', 't.descricao'],
  temAtivo: true,
  leitura: ['admin', 'atendente', 'tecnico'],
  escrita: ['admin'],
});

// ---------- Tabela de preços ----------
export const precos = criarCrud({
  tabela: 'precos',
  schema: z.object({
    servico_id: z.coerce.number({ error: 'Informe o serviço.' }).int().positive('Informe o serviço.'),
    descricao: txt(),
    unidade: txt(20).transform((u) => u || 'un'),
    valor: z.coerce.number().min(0, 'O valor não pode ser negativo.').max(10_000_000),
    ativo: bool01().default(1),
  }),
  select: `SELECT t.*, s.nome AS servico_nome, s.categoria AS servico_categoria, s.garantia_dias AS servico_garantia_dias
             FROM precos t JOIN servicos s ON s.id = t.servico_id`,
  ordem: 's.categoria, s.nome COLLATE NOCASE, t.valor',
  colunasBusca: ['s.nome', 't.descricao', 's.categoria'],
  filtros: { servico_id: 't.servico_id' },
  temAtivo: true,
  leitura: ['admin', 'atendente', 'tecnico'],
  escrita: ['admin'],
});

// ---------- Veículos ----------
export const veiculos = criarCrud({
  tabela: 'veiculos',
  schema: z.object({
    placa: txtObrig('a placa', 10).transform((p) => p.toUpperCase().replace(/[^A-Z0-9]/g, '')),
    marca: txt(50),
    modelo: txt(100),
    ano: inteiroOpc(),
    tipo: txt(50),
    equipamento: txt(500),
    km_atual: inteiroOpc(),
    responsavel_id: idOpc(),
    ativo: bool01().default(1),
    observacoes: txt(2000),
  }),
  select: `SELECT t.*, f.nome AS responsavel_nome FROM veiculos t LEFT JOIN funcionarios f ON f.id = t.responsavel_id`,
  ordem: 't.ativo DESC, t.placa',
  colunasBusca: ['t.placa', 't.modelo', 't.marca', 't.tipo'],
  temAtivo: true,
  leitura: ['admin', 'atendente', 'tecnico'],
  escrita: ['admin'],
});

// ---------- Funcionários ----------
const schemaFuncionario = z.object({
  nome: txtObrig('o nome'),
  cpf: txt(14),
  telefone: txt(20),
  email: txt(),
  cargo: txt(100),
  cnh: txt(20),
  cnh_validade: dataOpc(),
  perfil: z.enum(PERFIS).default('sem_acesso'),
  login: z
    .string()
    .trim()
    .toLowerCase()
    .max(50)
    .regex(/^[a-z0-9._-]*$/, 'O login deve ter apenas letras, números, ponto, hífen ou sublinhado.')
    .nullable()
    .optional()
    .transform((l) => l || null),
  senha: z.string().min(6, 'A senha deve ter pelo menos 6 caracteres.').max(100).optional().or(z.literal('')),
  ativo: bool01().default(1),
  observacoes: txt(2000),
});

export const funcionarios = new Hono<AppEnv>();
const funcionariosBase = criarCrud({
  tabela: 'funcionarios',
  schema: schemaFuncionario,
  select: `SELECT t.*, (t.senha_hash IS NOT NULL) AS tem_senha FROM funcionarios t`,
  ordem: 't.ativo DESC, t.nome COLLATE NOCASE',
  colunasBusca: ['t.nome', 't.cargo', 't.login'],
  temAtivo: true,
  filtros: { perfil: 't.perfil' },
  leitura: ['admin', 'atendente', 'tecnico'],
  escrita: ['admin'],
  ocultar: ['senha_hash'],
});

// Inclusão/alteração de funcionário tratam login e senha à parte.
async function salvarFuncionario(c: Context<AppEnv>, id: number | null) {
  const d = await lerCorpo(c, schemaFuncionario);
  const { senha, ...dados } = d;
  if (dados.perfil !== 'sem_acesso' && !dados.login) erro(422, 'Informe o login para quem acessa o sistema.');
  if (dados.login) {
    const dup = await c.env.DB.prepare('SELECT id FROM funcionarios WHERE login = ? AND id != ?')
      .bind(dados.login, id ?? 0)
      .first();
    if (dup) erro(409, 'Este login já está em uso.');
  }
  const atual = id
    ? await c.env.DB.prepare('SELECT senha_hash, perfil FROM funcionarios WHERE id = ?').bind(id).first<{ senha_hash: string | null; perfil: string }>()
    : null;
  if (id && !atual) erro(404, 'Funcionário não encontrado.');
  if (dados.perfil !== 'sem_acesso' && !senha && !atual?.senha_hash) erro(422, 'Defina uma senha para o acesso.');

  // Não permitir remover o último administrador ativo.
  if (id && atual?.perfil === 'admin' && (dados.perfil !== 'admin' || !dados.ativo)) {
    const outros = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM funcionarios WHERE perfil = 'admin' AND ativo = 1 AND id != ?")
      .bind(id)
      .first<{ n: number }>();
    if (!outros?.n) erro(422, 'É preciso manter pelo menos um administrador ativo.');
  }

  const registro: Record<string, unknown> = { ...dados };
  if (senha) registro.senha_hash = await gerarHashSenha(senha);
  if (id) {
    const { sql, params } = sqlUpdate('funcionarios', { ...registro, atualizado_em: agoraISO() }, id);
    await c.env.DB.prepare(sql).bind(...params).run();
    // Ao desativar, trocar perfil ou senha, encerra as sessões abertas.
    if (!dados.ativo || dados.perfil === 'sem_acesso' || senha || atual?.perfil !== dados.perfil) {
      const usuarioAtual = c.get('usuario');
      await c.env.DB.prepare('DELETE FROM sessoes WHERE funcionario_id = ? AND funcionario_id != ?').bind(id, usuarioAtual.id).run();
    }
  } else {
    const cols = Object.keys({ ...registro, criado_em: '' });
    const vals = cols.map((k) => (k === 'criado_em' ? agoraISO() : (registro[k] ?? null)));
    const r = await c.env.DB.prepare(
      `INSERT INTO funcionarios (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')}) RETURNING id`,
    )
      .bind(...vals)
      .first<{ id: number }>();
    id = r!.id;
  }
  const row = await c.env.DB.prepare('SELECT t.*, (t.senha_hash IS NOT NULL) AS tem_senha FROM funcionarios t WHERE t.id = ?')
    .bind(id)
    .first<Record<string, unknown>>();
  delete row!.senha_hash;
  return row!;
}

funcionarios.post('/', exigirLogin('admin'), async (c) => c.json(await salvarFuncionario(c, null), 201));
funcionarios.put('/:id', exigirLogin('admin'), async (c) => c.json(await salvarFuncionario(c, idParam(c))));
funcionarios.delete('/:id', exigirLogin('admin'), async (c) => {
  const id = idParam(c);
  if (id === c.get('usuario').id) erro(422, 'Você não pode excluir o seu próprio usuário.');
  const admin = await c.env.DB.prepare("SELECT perfil FROM funcionarios WHERE id = ? AND perfil = 'admin'").bind(id).first();
  if (admin) {
    const outros = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM funcionarios WHERE perfil = 'admin' AND ativo = 1 AND id != ?")
      .bind(id)
      .first<{ n: number }>();
    if (!outros?.n) erro(422, 'É preciso manter pelo menos um administrador ativo.');
  }
  // Mantém o histórico: OS antigas guardam o técnico. Funcionário com OS é apenas desativado.
  const usado = await c.env.DB.prepare('SELECT 1 FROM ordens WHERE tecnico_id = ? OR ajudante_id = ? OR criado_por = ? LIMIT 1')
    .bind(id, id, id)
    .first();
  if (usado) {
    await c.env.DB.batch([
      c.env.DB.prepare('UPDATE funcionarios SET ativo = 0, atualizado_em = ? WHERE id = ?').bind(agoraISO(), id),
      c.env.DB.prepare('DELETE FROM sessoes WHERE funcionario_id = ?').bind(id),
    ]);
    return c.json({ ok: true, desativado: true });
  }
  await c.env.DB.prepare('DELETE FROM funcionarios WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});
funcionarios.route('/', funcionariosBase);

// ---------- Empresa ----------
export const empresa = new Hono<AppEnv>();
const schemaEmpresa = z.object({
  razao_social: txt(),
  nome_fantasia: txt(),
  cnpj: txt(20),
  inscricao_municipal: txt(30),
  inscricao_estadual: txt(30),
  telefone: txt(20),
  whatsapp: txt(20),
  email: txt(),
  site: txt(),
  ...endereco,
  complemento: txt(100),
  regime_tributario: z.enum(Object.keys(REGIMES_TRIBUTARIOS) as [string, ...string[]]).default('simples_nacional'),
  aliquota_iss: z.coerce.number().min(0).max(100).default(0),
  codigo_servico_municipal: txt(30),
  cnae: txt(20),
  garantia_padrao_dias: z.coerce.number().int().min(0).max(3650).default(90),
  dias_reincidencia: z.coerce.number().int().min(1).max(3650).default(90),
  texto_os: txt(4000),
});

empresa.get('/', exigirLogin(), async (c) => {
  return c.json(await c.env.DB.prepare('SELECT * FROM empresa WHERE id = 1').first());
});

empresa.put('/', exigirLogin('admin'), async (c) => {
  const d = await lerCorpo(c, schemaEmpresa);
  const { sql, params } = sqlUpdate('empresa', { ...d, atualizado_em: agoraISO() }, 1);
  await c.env.DB.prepare(sql).bind(...params).run();
  return c.json(await c.env.DB.prepare('SELECT * FROM empresa WHERE id = 1').first());
});
