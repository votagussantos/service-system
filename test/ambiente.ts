import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getPlatformProxy } from 'wrangler';
import app from '../worker/index';

/** Sobe D1 e R2 locais (em memória), aplica as migrações e devolve um cliente HTTP para a API. */
export async function criarAmbiente() {
  const proxy = await getPlatformProxy<Env>({ configPath: 'wrangler.jsonc', persist: false });
  const env = proxy.env;
  const dir = 'migrations';
  for (const arquivo of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(dir, arquivo), 'utf8')
      .split('\n')
      .filter((l) => !l.trim().startsWith('--'))
      .join('\n');
    for (const stmt of sql.split(';').map((s) => s.trim()).filter(Boolean)) {
      await env.DB.prepare(stmt).run();
    }
  }
  return { env, fechar: () => proxy.dispose() };
}

export class Cliente {
  cookie = '';
  constructor(private env: Env) {}

  async req(metodo: string, caminho: string, corpo?: unknown, headers: Record<string, string> = {}) {
    const h: Record<string, string> = { ...headers };
    if (this.cookie) h.cookie = this.cookie;
    let body: BodyInit | undefined;
    if (corpo instanceof Uint8Array) body = corpo as unknown as BodyInit;
    else if (corpo !== undefined) {
      body = JSON.stringify(corpo);
      h['content-type'] = 'application/json';
    }
    const res = await app.fetch(new Request(`http://localhost/api${caminho}`, { method: metodo, headers: h, body }), this.env, {
      waitUntil() {},
      passThroughOnException() {},
      props: {},
    } as unknown as ExecutionContext);
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) {
      const valor = setCookie.split(';')[0];
      this.cookie = valor.endsWith('=') ? '' : valor;
    }
    const tipo = res.headers.get('content-type') ?? '';
    const dados = tipo.includes('json') ? await res.json() : await res.arrayBuffer();
    return { status: res.status, dados: dados as any };
  }
  get = (c: string) => this.req('GET', c);
  post = (c: string, b?: unknown) => this.req('POST', c, b ?? {});
  put = (c: string, b?: unknown) => this.req('PUT', c, b);
  del = (c: string) => this.req('DELETE', c);
}
