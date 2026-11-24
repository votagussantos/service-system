import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv } from './tipos';
import { carregarUsuario, exigirLogin, verificarOrigem } from './lib/auth';
import { erro } from './lib/util';
import { auth } from './rotas/auth';
import { clientes, condominios, empresa, funcionarios, precos, servicos, veiculos } from './rotas/cadastros';
import { ordens } from './rotas/ordens';
import { busca } from './rotas/busca';
import { notas } from './rotas/notas';

export const app = new Hono<AppEnv>().basePath('/api');

app.use('*', verificarOrigem);
app.use('*', carregarUsuario);
app.use('*', async (c, next) => {
  await next();
  if (!c.res.headers.has('Cache-Control')) c.header('Cache-Control', 'no-store');
});

app.route('/auth', auth);
app.route('/empresa', empresa);
app.route('/clientes', clientes);
app.route('/condominios', condominios);
app.route('/servicos', servicos);
app.route('/precos', precos);
app.route('/funcionarios', funcionarios);
app.route('/veiculos', veiculos);
app.route('/ordens', ordens);
app.route('/busca', busca);
app.route('/notas', notas);

/** Fotos e assinaturas guardadas no R2 (somente usuários com acesso à OS). */
app.get('/arquivos/:chave{.+}', exigirLogin(), async (c) => {
  const chave = c.req.param('chave');
  const m = /^ordens\/(\d+)\//.exec(chave);
  if (!m) erro(404, 'Arquivo não encontrado.');
  const u = c.get('usuario');
  if (u.perfil === 'tecnico') {
    const o = await c.env.DB.prepare('SELECT 1 FROM ordens WHERE id = ? AND (tecnico_id = ? OR ajudante_id = ?)')
      .bind(Number(m[1]), u.id, u.id)
      .first();
    if (!o) erro(403, 'Sem acesso a este arquivo.');
  }
  const obj = await c.env.ARQUIVOS.get(chave);
  if (!obj) erro(404, 'Arquivo não encontrado.');
  return new Response(obj.body, {
    headers: {
      'Content-Type': obj.httpMetadata?.contentType ?? 'application/octet-stream',
      'Cache-Control': 'private, max-age=86400',
      ETag: obj.httpEtag,
    },
  });
});

app.notFound((c) => c.json({ erro: 'Rota não encontrada.' }, 404));

app.onError((e, c) => {
  if (e instanceof HTTPException) return c.json({ erro: e.message }, e.status);
  console.error(e);
  return c.json({ erro: 'Erro interno. Tente novamente.' }, 500);
});

export default app;
