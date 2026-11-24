import { Hono } from 'hono';
import { CAMPOS_BUSCA, type CampoBusca } from '../../shared/constantes';
import type { AppEnv } from '../tipos';
import { exigirLogin } from '../lib/auth';
import { configuracoes, SQL_EM_GARANTIA } from '../lib/regras';
import { chaveEndereco, condicaoBusca, dataSP, SQL_ISO, termosBusca } from '../lib/util';
import { listarOrdens } from './ordens';

export const busca = new Hono<AppEnv>();

const COLUNAS_OS: Record<CampoBusca, string[]> = {
  todos: ['o.busca'],
  cliente: ['o.busca_cliente'],
  endereco: ['o.busca_endereco'],
  condominio: ['o.busca_condominio'],
};

/**
 * Busca geral: encontra clientes, condomínios e OS (inclusive antigas) por nome, documento,
 * telefone, endereço ou condomínio. Ignora acentos e maiúsculas; todas as palavras precisam aparecer.
 */
busca.get('/', exigirLogin(), async (c) => {
  const q = (c.req.query('q') ?? '').trim();
  const campo = (CAMPOS_BUSCA as readonly string[]).includes(c.req.query('campo') ?? '')
    ? (c.req.query('campo') as CampoBusca)
    : 'todos';
  const termos = termosBusca(q);
  if (termos.length === 0) return c.json({ clientes: [], condominios: [], ordens: [], total_ordens: 0 });

  const db = c.env.DB;
  const hoje = dataSP();
  const u = c.get('usuario');

  // OS
  const condOS = condicaoBusca(COLUNAS_OS[campo], termos);
  const whereOS = [condOS.sql];
  const paramsOS: unknown[] = [...condOS.params];
  if (c.req.query('garantia') === '1') {
    whereOS.push("o.status = 'concluida' AND o.garantia_ate >= ?");
    paramsOS.push(hoje);
  }
  const ordensP = listarOrdens(c, whereOS, paramsOS, { limite: 100 });
  const totalP = db
    .prepare(`SELECT COUNT(*) AS n FROM ordens o WHERE ${whereOS.join(' AND ')}`)
    .bind(...paramsOS)
    .first<{ n: number }>();

  // Clientes
  const colsCli = campo === 'cliente' ? ['t.busca'] : campo === 'endereco' ? ['t.busca_endereco'] : ['t.busca', 't.busca_endereco'];
  const condCli = condicaoBusca(colsCli, termos);
  const clientesP =
    campo === 'condominio'
      ? Promise.resolve({ results: [] as Record<string, unknown>[] })
      : db
          .prepare(
            `SELECT t.id, t.tipo, t.nome, t.cpf_cnpj, t.telefone, t.logradouro, t.numero, t.complemento, t.bairro, t.cidade,
                    t.unidade, cd.nome AS condominio_nome,
                    (SELECT COUNT(*) FROM ordens o WHERE o.cliente_id = t.id AND o.status != 'cancelada') AS total_os,
                    (SELECT MAX(o.criado_em) FROM ordens o WHERE o.cliente_id = t.id) AS ultima_os_em,
                    EXISTS (SELECT 1 FROM ordens o WHERE o.cliente_id = t.id AND ${SQL_EM_GARANTIA}) AS em_garantia
               FROM clientes t LEFT JOIN condominios cd ON cd.id = t.condominio_id
              WHERE ${condCli.sql}
              ORDER BY ultima_os_em DESC NULLS LAST, t.nome
              LIMIT 30`,
          )
          .bind(hoje, ...condCli.params)
          .all();

  // Condomínios
  const colsCond = campo === 'endereco' ? ['t.busca_endereco'] : campo === 'cliente' ? null : ['t.busca', 't.busca_endereco'];
  const condCond = colsCond ? condicaoBusca(colsCond, termos) : null;
  const condominiosP = !condCond
    ? Promise.resolve({ results: [] as Record<string, unknown>[] })
    : db
        .prepare(
          `SELECT t.id, t.nome, t.cnpj, t.sindico, t.telefone, t.logradouro, t.numero, t.bairro, t.cidade,
                  (SELECT COUNT(*) FROM ordens o WHERE o.condominio_id = t.id AND o.status != 'cancelada') AS total_os,
                  (SELECT MAX(o.criado_em) FROM ordens o WHERE o.condominio_id = t.id) AS ultima_os_em,
                  EXISTS (SELECT 1 FROM ordens o WHERE o.condominio_id = t.id AND ${SQL_EM_GARANTIA}) AS em_garantia
             FROM condominios t
            WHERE ${condCond.sql}
            ORDER BY ultima_os_em DESC NULLS LAST, t.nome
            LIMIT 30`,
        )
        .bind(hoje, ...condCond.params)
        .all();

  const [ordens, total, clientes, condominios] = await Promise.all([ordensP, totalP, clientesP, condominiosP]);
  // Técnicos veem o histórico (útil em campo), mas sem valores.
  const ordensVisiveis = u.perfil === 'tecnico' ? ordens.map((o) => ({ ...o, valor_total: null })) : ordens;
  return c.json({
    clientes: clientes.results,
    condominios: condominios.results,
    ordens: ordensVisiveis,
    total_ordens: total?.n ?? 0,
  });
});

/**
 * Histórico para a abertura de uma nova OS: mostra serviços anteriores do cliente/endereço/condomínio,
 * se algum está em garantia e se o novo chamado é reincidência.
 */
busca.get('/historico', exigirLogin(), async (c) => {
  const db = c.env.DB;
  const { diasReincidencia } = await configuracoes(db);
  const hoje = dataSP();
  const clienteId = Number(c.req.query('cliente_id')) || null;
  const condominioId = Number(c.req.query('condominio_id')) || null;
  const ignorar = Number(c.req.query('ignorar_id')) || 0;
  const chave = chaveEndereco(c.req.query('logradouro') ?? '', c.req.query('numero') ?? '', c.req.query('unidade') ?? '');

  const cond: string[] = [];
  const params: unknown[] = [];
  if (clienteId) {
    cond.push('o.cliente_id = ?');
    params.push(clienteId);
  }
  if (chave) {
    cond.push('o.endereco_chave = ?');
    params.push(chave);
  }
  if (cond.length === 0 && !condominioId) {
    return c.json({ ordens: [], em_garantia: [], reincidencia: null, condominio: [], dias_reincidencia: diasReincidencia });
  }

  const ordens = cond.length
    ? await listarOrdens(c, [`(${cond.join(' OR ')})`, "o.status != 'cancelada'", 'o.id != ?'], [...params, ignorar], { limite: 30 })
    : [];

  const emGarantia = ordens.filter((o) => o.em_garantia);

  // Reincidência: OS concluída no mesmo endereço (ou mesmo cliente PF) nos últimos N dias.
  const limite = new Date(Date.now() - diasReincidencia * 86_400_000).toISOString();
  const condReinc: string[] = [];
  const paramsReinc: unknown[] = [];
  if (chave) {
    condReinc.push('o.endereco_chave = ?');
    paramsReinc.push(chave);
  }
  if (clienteId) {
    condReinc.push("(o.cliente_id = ? AND (SELECT tipo FROM clientes WHERE id = o.cliente_id) = 'PF')");
    paramsReinc.push(clienteId);
  }
  const reincidencia = condReinc.length
    ? await db
        .prepare(
          `SELECT o.id, o.numero, o.concluida_em, o.garantia_ate
             FROM ordens o
            WHERE (${condReinc.join(' OR ')}) AND o.status = 'concluida' AND o.concluida_em >= ? AND o.id != ?
            ORDER BY o.concluida_em DESC LIMIT 1`,
        )
        .bind(...paramsReinc, limite, ignorar)
        .first()
    : null;

  // Outras OS no mesmo condomínio (outras unidades) — informativo.
  const doCondominio = condominioId
    ? await listarOrdens(c, ['o.condominio_id = ?', "o.status != 'cancelada'", 'o.id != ?'], [condominioId, ignorar], { limite: 10 })
    : [];

  return c.json({
    ordens,
    em_garantia: emGarantia,
    reincidencia,
    condominio: doCondominio.filter((o) => !ordens.some((x) => x.id === o.id)),
    dias_reincidencia: diasReincidencia,
  });
});

/** Resumo para a tela inicial. */
busca.get('/painel', exigirLogin(), async (c) => {
  const db = c.env.DB;
  const hoje = dataSP();
  const u = c.get('usuario');
  const filtroTec = u.perfil === 'tecnico' ? ' AND (o.tecnico_id = ? OR o.ajudante_id = ?)' : '';
  const pTec = u.perfil === 'tecnico' ? [u.id, u.id] : [];
  const inicioMes = hoje.slice(0, 8) + '01';
  const r = await db
    .prepare(
      `SELECT
         SUM(o.status IN ('aberta', 'agendada', 'em_andamento')) AS pendentes,
         SUM(o.status = 'em_andamento') AS em_andamento,
         SUM(o.status IN ('aberta', 'agendada', 'em_andamento') AND date(o.data_agendada, '-3 hours') = ?) AS hoje,
         SUM(o.status = 'aberta' AND o.tecnico_id IS NULL) AS sem_tecnico,
         SUM(o.status = 'concluida' AND date(o.concluida_em, '-3 hours') >= ?) AS concluidas_mes,
         SUM(CASE WHEN o.status = 'concluida' AND date(o.concluida_em, '-3 hours') >= ? THEN o.valor_total ELSE 0 END) AS faturado_mes,
         SUM(o.status = 'concluida' AND o.pago = 0 AND o.valor_total > 0) AS a_receber,
         SUM(o.status = 'concluida' AND o.garantia_ate >= ?) AS em_garantia,
         SUM(o.retorno_garantia = 1 AND o.criado_em >= strftime(${SQL_ISO}, 'now', '-30 days')) AS retornos_30d
       FROM ordens o WHERE 1=1 ${filtroTec}`,
    )
    .bind(hoje, inicioMes, inicioMes, hoje, ...pTec)
    .first<Record<string, number | null>>();
  const notasPendentes =
    u.perfil === 'tecnico'
      ? 0
      : ((await db.prepare("SELECT COUNT(*) AS n FROM notas_fiscais WHERE status = 'pendente'").first<{ n: number }>())?.n ?? 0);
  const resumo = Object.fromEntries(Object.entries(r ?? {}).map(([k, v]) => [k, v ?? 0]));
  if (u.perfil === 'tecnico') {
    delete resumo.faturado_mes;
    delete resumo.a_receber;
  }
  return c.json({ ...resumo, notas_pendentes: notasPendentes, hoje });
});
