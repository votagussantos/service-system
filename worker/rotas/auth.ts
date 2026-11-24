import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../tipos';
import { conferirSenha, criarSessao, encerrarSessao, exigirLogin, gerarHashSenha } from '../lib/auth';
import { agoraISO, erro } from '../lib/util';
import { lerCorpo, txtObrig } from '../lib/validacao';

export const auth = new Hono<AppEnv>();

async function existeUsuario(db: D1Database) {
  return !!(await db.prepare('SELECT 1 FROM funcionarios WHERE senha_hash IS NOT NULL LIMIT 1').first());
}

/** Estado inicial do app: usuário logado e se ainda precisa criar o primeiro administrador. */
auth.get('/estado', async (c) => {
  const usuario = c.get('usuario') ?? null;
  const configurar = usuario ? false : !(await existeUsuario(c.env.DB));
  return c.json({ usuario, precisa_configurar: configurar });
});

/** Cria o primeiro administrador. Só funciona enquanto não existir nenhum usuário com senha. */
auth.post('/configurar', async (c) => {
  const d = await lerCorpo(
    c,
    z.object({
      nome: txtObrig('o seu nome'),
      login: z
        .string()
        .trim()
        .toLowerCase()
        .min(3, 'O login deve ter pelo menos 3 caracteres.')
        .max(50)
        .regex(/^[a-z0-9._-]+$/, 'O login deve ter apenas letras, números, ponto, hífen ou sublinhado.'),
      senha: z.string().min(6, 'A senha deve ter pelo menos 6 caracteres.').max(100),
    }),
  );
  if (await existeUsuario(c.env.DB)) erro(409, 'O sistema já foi configurado.');
  const r = await c.env.DB.prepare(
    `INSERT INTO funcionarios (nome, cargo, perfil, login, senha_hash, criado_em) VALUES (?, 'Administrador', 'admin', ?, ?, ?) RETURNING id`,
  )
    .bind(d.nome, d.login, await gerarHashSenha(d.senha), agoraISO())
    .first<{ id: number }>();
  await criarSessao(c, r!.id);
  return c.json({ usuario: { id: r!.id, nome: d.nome, login: d.login, perfil: 'admin' } }, 201);
});

auth.post('/login', async (c) => {
  const d = await lerCorpo(c, z.object({ login: z.string().trim().toLowerCase().max(50), senha: z.string().max(100) }));
  const f = await c.env.DB.prepare(
    "SELECT id, nome, login, perfil, senha_hash FROM funcionarios WHERE login = ? AND ativo = 1 AND perfil != 'sem_acesso'",
  )
    .bind(d.login)
    .first<{ id: number; nome: string; login: string; perfil: string; senha_hash: string | null }>();
  const ok = await conferirSenha(d.senha, f?.senha_hash ?? null);
  if (!f || !ok) erro(401, 'Login ou senha incorretos.');
  await criarSessao(c, f.id);
  // Limpa sessões vencidas de vez em quando.
  await c.env.DB.prepare('DELETE FROM sessoes WHERE expira_em < ?').bind(agoraISO()).run();
  return c.json({ usuario: { id: f.id, nome: f.nome, login: f.login, perfil: f.perfil } });
});

auth.post('/logout', async (c) => {
  await encerrarSessao(c);
  return c.json({ ok: true });
});

auth.post('/senha', exigirLogin(), async (c) => {
  const d = await lerCorpo(
    c,
    z.object({
      senha_atual: z.string().max(100),
      nova_senha: z.string().min(6, 'A nova senha deve ter pelo menos 6 caracteres.').max(100),
    }),
  );
  const u = c.get('usuario');
  const f = await c.env.DB.prepare('SELECT senha_hash FROM funcionarios WHERE id = ?').bind(u.id).first<{ senha_hash: string }>();
  if (!(await conferirSenha(d.senha_atual, f?.senha_hash ?? null))) erro(422, 'A senha atual está incorreta.');
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE funcionarios SET senha_hash = ?, atualizado_em = ? WHERE id = ?').bind(await gerarHashSenha(d.nova_senha), agoraISO(), u.id),
    c.env.DB.prepare('DELETE FROM sessoes WHERE funcionario_id = ?').bind(u.id),
  ]);
  await criarSessao(c, u.id);
  return c.json({ ok: true });
});
