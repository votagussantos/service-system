import type { Context, MiddlewareHandler } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { Perfil } from '../../shared/constantes';
import { agoraISO, erro } from './util';
import type { AppEnv } from '../tipos';

// PBKDF2-SHA256. O Workers aceita no máximo 100.000 iterações; usamos um valor menor
// para caber no limite de CPU do plano gratuito (10 ms). O formato guarda as iterações,
// então dá para aumentar depois sem invalidar senhas antigas.
const ITERACOES = 50_000;
const COOKIE = 'sid';
const DURACAO_SESSAO_DIAS = 30;

export interface Usuario {
  id: number;
  nome: string;
  login: string;
  perfil: Perfil;
}

function b64(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function deB64(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function derivar(senha: string, sal: Uint8Array, iteracoes: number): Promise<Uint8Array> {
  const chave = await crypto.subtle.importKey('raw', new TextEncoder().encode(senha), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: sal, iterations: iteracoes },
    chave,
    256,
  );
  return new Uint8Array(bits);
}

export async function gerarHashSenha(senha: string): Promise<string> {
  const sal = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivar(senha, sal, ITERACOES);
  return `pbkdf2$${ITERACOES}$${b64(sal)}$${b64(hash)}`;
}

export async function conferirSenha(senha: string, armazenado: string | null): Promise<boolean> {
  if (!armazenado) return false;
  const [alg, iter, sal, hash] = armazenado.split('$');
  if (alg !== 'pbkdf2' || !iter || !sal || !hash) return false;
  const calculado = await derivar(senha, deB64(sal), Number(iter));
  const esperado = deB64(hash);
  if (calculado.length !== esperado.length) return false;
  let dif = 0;
  for (let i = 0; i < calculado.length; i++) dif |= calculado[i] ^ esperado[i];
  return dif === 0;
}

async function sha256(texto: string): Promise<string> {
  return b64(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto)));
}

export async function criarSessao(c: Context<AppEnv>, funcionarioId: number): Promise<void> {
  const token = b64(crypto.getRandomValues(new Uint8Array(32)));
  const expira = new Date(Date.now() + DURACAO_SESSAO_DIAS * 86_400_000);
  await c.env.DB.prepare('INSERT INTO sessoes (token_hash, funcionario_id, expira_em, criado_em) VALUES (?, ?, ?, ?)')
    .bind(await sha256(token), funcionarioId, expira.toISOString(), agoraISO())
    .run();
  setCookie(c, COOKIE, token, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === 'https:',
    sameSite: 'Lax',
    path: '/',
    expires: expira,
  });
}

export async function encerrarSessao(c: Context<AppEnv>): Promise<void> {
  const token = getCookie(c, COOKIE);
  if (token) {
    await c.env.DB.prepare('DELETE FROM sessoes WHERE token_hash = ?').bind(await sha256(token)).run();
  }
  deleteCookie(c, COOKIE, { path: '/' });
}

/** Carrega o usuário da sessão (se houver) em c.var.usuario. */
export const carregarUsuario: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = getCookie(c, COOKIE);
  if (token) {
    const tokenHash = await sha256(token);
    const row = await c.env.DB.prepare(
      `SELECT f.id, f.nome, f.login, f.perfil, s.expira_em
         FROM sessoes s JOIN funcionarios f ON f.id = s.funcionario_id
        WHERE s.token_hash = ? AND f.ativo = 1 AND f.perfil != 'sem_acesso'`,
    )
      .bind(tokenHash)
      .first<Usuario & { expira_em: string }>();
    if (row && row.expira_em > agoraISO()) {
      c.set('usuario', { id: row.id, nome: row.nome, login: row.login, perfil: row.perfil });
      // Renova a sessão quando faltar menos da metade do prazo.
      const restante = new Date(row.expira_em).getTime() - Date.now();
      if (restante < (DURACAO_SESSAO_DIAS / 2) * 86_400_000) {
        const expira = new Date(Date.now() + DURACAO_SESSAO_DIAS * 86_400_000);
        await c.env.DB.prepare('UPDATE sessoes SET expira_em = ? WHERE token_hash = ?')
          .bind(expira.toISOString(), tokenHash)
          .run();
        setCookie(c, COOKIE, token, {
          httpOnly: true,
          secure: new URL(c.req.url).protocol === 'https:',
          sameSite: 'Lax',
          path: '/',
          expires: expira,
        });
      }
    } else if (row) {
      await c.env.DB.prepare('DELETE FROM sessoes WHERE token_hash = ?').bind(tokenHash).run();
    }
  }
  await next();
};

export function exigirLogin(...perfis: Perfil[]): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const u = c.get('usuario');
    if (!u) erro(401, 'Faça login para continuar.');
    if (perfis.length > 0 && !perfis.includes(u.perfil)) erro(403, 'Você não tem permissão para esta ação.');
    await next();
  };
}

/** Bloqueia requisições de escrita vindas de outros sites (proteção CSRF). */
export const verificarOrigem: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
    const origem = c.req.header('origin');
    if (origem && origem !== new URL(c.req.url).origin) erro(403, 'Origem da requisição não permitida.');
  }
  await next();
};
