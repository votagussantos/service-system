import { useEffect, useState } from 'react';
import { api, ErroApi, ErroRede, qs } from '../api';
import type { FotoOS, ItemOS, Ordem } from '../tipos';
import { gravarCache, lerCache } from './armazenamento';

/**
 * Fila de ações do técnico. Tudo o que ele faz no atendimento (iniciar, fotos, assinatura,
 * concluir...) entra aqui primeiro e é enviado ao servidor em ordem. Sem internet, as ações
 * ficam guardadas no celular e são enviadas automaticamente quando a conexão volta.
 * O servidor trata reenvios sem duplicar (ids de foto gerados no celular, conclusão idempotente).
 */

export interface DadosAtendimento {
  servico_executado?: string;
  itens?: ItemOS[];
  desconto?: number;
  forma_pagamento?: string;
  pago?: boolean;
}

type AcaoBase = { id: string; ordemId: number; numeroOS: number; criadaEm: string };
export type Acao = AcaoBase &
  (
    | { tipo: 'iniciar' }
    | { tipo: 'atualizar'; dados: DadosAtendimento }
    | { tipo: 'foto'; fotoId: string; fotoTipo: 'antes' | 'depois'; blob: Blob }
    | { tipo: 'excluirFoto'; fotoId: string }
    | { tipo: 'assinatura'; blob: Blob; nome: string }
    | { tipo: 'concluir'; dados: DadosAtendimento & { servico_executado: string; assinatura_nome?: string } }
  );

/** Ação ainda sem id/data (Omit distribuído sobre a união). */
export type NovaAcao = Acao extends infer A ? (A extends Acao ? Omit<A, 'id' | 'criadaEm'> : never) : never;

export interface ErroSincronizacao {
  acao: Omit<Acao, 'blob'> & { tipo: Acao['tipo'] };
  mensagem: string;
  em: string;
}

const CHAVE_FILA = 'fila';
const CHAVE_ERROS = 'fila-erros';
export const CHAVE_MINHAS = 'minhas-os';

let trava: Promise<unknown> = Promise.resolve();
/** Executa operações na fila uma de cada vez (evita gravações concorrentes). */
function exclusivo<T>(fn: () => Promise<T>): Promise<T> {
  const p = trava.then(fn, fn);
  trava = p.catch(() => undefined);
  return p;
}

function avisar() {
  window.dispatchEvent(new Event('fila-mudou'));
}

export async function lerFila(): Promise<Acao[]> {
  return (await lerCache<Acao[]>(CHAVE_FILA)) ?? [];
}

export async function lerErros(): Promise<ErroSincronizacao[]> {
  return (await lerCache<ErroSincronizacao[]>(CHAVE_ERROS)) ?? [];
}

export async function limparErros() {
  await gravarCache(CHAVE_ERROS, null);
  avisar();
}

export function novoId(): string {
  return crypto.randomUUID();
}

export async function enfileirar(acao: NovaAcao): Promise<void> {
  await exclusivo(async () => {
    const fila = await lerFila();
    // "atualizar" consecutivos da mesma OS são mesclados para economizar envios.
    const ultima = fila[fila.length - 1];
    if (acao.tipo === 'atualizar' && ultima?.tipo === 'atualizar' && ultima.ordemId === acao.ordemId) {
      ultima.dados = { ...ultima.dados, ...acao.dados };
    } else {
      fila.push({ ...acao, id: novoId(), criadaEm: new Date().toISOString() } as Acao);
    }
    await gravarCache(CHAVE_FILA, fila);
  });
  avisar();
  void sincronizar();
}

async function enviar(a: Acao): Promise<void> {
  switch (a.tipo) {
    case 'iniciar':
      await api.post(`/ordens/${a.ordemId}/iniciar`, { quando: a.criadaEm });
      return;
    case 'atualizar':
      await api.put(`/ordens/${a.ordemId}`, a.dados);
      return;
    case 'foto':
      await api.put(`/ordens/${a.ordemId}/fotos/${a.fotoId}${qs({ tipo: a.fotoTipo, quando: a.criadaEm })}`, a.blob, {
        'Content-Type': a.blob.type || 'image/jpeg',
      });
      return;
    case 'excluirFoto':
      await api.del(`/ordens/${a.ordemId}/fotos/${a.fotoId}`);
      return;
    case 'assinatura':
      await api.put(`/ordens/${a.ordemId}/assinatura${qs({ nome: a.nome })}`, a.blob, { 'Content-Type': a.blob.type || 'image/png' });
      return;
    case 'concluir':
      await api.post(`/ordens/${a.ordemId}/concluir`, { ...a.dados, quando: a.criadaEm });
      return;
  }
}

let sincronizando = false;

/** Envia as ações pendentes. Para no primeiro erro de rede (tenta de novo depois). */
export async function sincronizar(): Promise<void> {
  if (sincronizando || !navigator.onLine) return;
  sincronizando = true;
  avisar();
  let enviouAlgo = false;
  try {
    for (;;) {
      const fila = await lerFila();
      const a = fila[0];
      if (!a) break;
      try {
        await enviar(a);
        enviouAlgo = true;
      } catch (e) {
        if (e instanceof ErroRede) break;
        if (e instanceof ErroApi && (e.status === 401 || e.status >= 500)) break;
        // Erro de validação (ex.: OS cancelada pelo escritório): registra e descarta a ação.
        const { blob: _b, ...semBlob } = a as Acao & { blob?: Blob };
        const erros = await lerErros();
        erros.push({ acao: semBlob, mensagem: (e as Error).message, em: new Date().toISOString() });
        await gravarCache(CHAVE_ERROS, erros.slice(-30));
      }
      await exclusivo(async () => {
        const atual = await lerFila();
        await gravarCache(
          CHAVE_FILA,
          atual.filter((x) => x.id !== a.id),
        );
      });
      avisar();
    }
    if (enviouAlgo) await atualizarMinhasOS().catch(() => undefined);
  } finally {
    sincronizando = false;
    avisar();
  }
}

export interface CacheMinhas {
  itens: Ordem[];
  sincronizado_em: string;
}

/** Baixa as OS do técnico (com detalhes) para usar sem internet. */
export async function atualizarMinhasOS(): Promise<CacheMinhas> {
  const r = await api.get<CacheMinhas>('/ordens/minhas');
  await gravarCache(CHAVE_MINHAS, r);
  avisar();
  return r;
}

const urlsLocais = new Map<string, string>();
function urlLocal(id: string, blob: Blob): string {
  let u = urlsLocais.get(id);
  if (!u) {
    u = URL.createObjectURL(blob);
    urlsLocais.set(id, u);
  }
  return u;
}

/** Aplica sobre a OS as ações ainda não enviadas (o técnico vê o que fez, mesmo offline). */
export type OrdemLocal = Ordem & { pendencias: number; assinatura_local?: string };

export function aplicarPendencias(o: Ordem, fila: Acao[]): OrdemLocal {
  const r: OrdemLocal = { ...o, fotos: [...o.fotos], pendencias: 0 };
  for (const a of fila) {
    if (a.ordemId !== o.id) continue;
    r.pendencias++;
    switch (a.tipo) {
      case 'iniciar':
        if (r.status === 'aberta' || r.status === 'agendada') {
          r.status = 'em_andamento';
          r.iniciada_em = a.criadaEm;
        }
        break;
      case 'atualizar':
        Object.assign(r, normalizarDados(a.dados));
        break;
      case 'foto':
        if (!r.fotos.some((f) => f.id === a.fotoId)) {
          const foto: FotoOS = {
            id: a.fotoId,
            tipo: a.fotoTipo,
            legenda: '',
            r2_key: '',
            criado_em: a.criadaEm,
            url_local: urlLocal(a.fotoId, a.blob),
            pendente: true,
          };
          r.fotos.push(foto);
        }
        break;
      case 'excluirFoto':
        r.fotos = r.fotos.filter((f) => f.id !== a.fotoId);
        break;
      case 'assinatura':
        r.assinatura_local = urlLocal(a.id, a.blob);
        r.assinatura_nome = a.nome || r.assinatura_nome;
        break;
      case 'concluir':
        Object.assign(r, normalizarDados(a.dados));
        r.status = 'concluida';
        r.concluida_em = a.criadaEm;
        if (a.dados.assinatura_nome) r.assinatura_nome = a.dados.assinatura_nome;
        break;
    }
  }
  if (r.pendencias > 0) {
    const t = Math.max(0, (r.valor_servicos ?? 0) - (r.desconto ?? 0));
    r.valor_total = r.retorno_garantia ? 0 : Math.round(t * 100) / 100;
  }
  return r;
}

function normalizarDados(d: DadosAtendimento): Partial<Ordem> {
  const p: Partial<Ordem> = {};
  if (d.servico_executado !== undefined) p.servico_executado = d.servico_executado;
  if (d.forma_pagamento !== undefined) p.forma_pagamento = d.forma_pagamento;
  if (d.pago !== undefined) p.pago = d.pago ? 1 : 0;
  if (d.itens !== undefined) {
    p.itens = d.itens;
    p.valor_servicos = d.itens.reduce((s, i) => s + i.quantidade * i.valor_unitario, 0);
  }
  if (d.desconto !== undefined) p.desconto = d.desconto;
  return p;
}

/** Estado da fila para mostrar na tela. */
export function useFila() {
  const [fila, setFila] = useState<Acao[]>([]);
  const [erros, setErros] = useState<ErroSincronizacao[]>([]);
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => {
    let ativo = true;
    const ler = async () => {
      const [f, e] = await Promise.all([lerFila(), lerErros()]);
      if (ativo) {
        setFila(f);
        setErros(e);
        setOcupado(sincronizando);
      }
    };
    void ler();
    window.addEventListener('fila-mudou', ler);
    return () => {
      ativo = false;
      window.removeEventListener('fila-mudou', ler);
    };
  }, []);
  return { fila, erros, sincronizando: ocupado };
}

/** Liga a sincronização automática (ao voltar a internet e a cada 30 s). */
export function iniciarSincronizacaoAutomatica() {
  window.addEventListener('online', () => void sincronizar());
  setInterval(() => void sincronizar(), 30_000);
  void sincronizar();
}
