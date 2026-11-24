export class ErroApi extends Error {
  constructor(
    public status: number,
    mensagem: string,
  ) {
    super(mensagem);
  }
}

/** Erro de rede (sem internet / servidor inacessível). */
export class ErroRede extends Error {
  constructor() {
    super('Sem conexão com o servidor. Verifique a internet.');
  }
}

type Corpo = unknown;

async function requisicao<T>(metodo: string, caminho: string, corpo?: Corpo, headers: Record<string, string> = {}): Promise<T> {
  let body: BodyInit | undefined;
  const h: Record<string, string> = { ...headers };
  if (corpo instanceof Blob) body = corpo;
  else if (corpo !== undefined) {
    body = JSON.stringify(corpo);
    h['Content-Type'] = 'application/json';
  }
  let res: Response;
  try {
    res = await fetch(`/api${caminho}`, { method: metodo, headers: h, body, credentials: 'same-origin' });
  } catch {
    throw new ErroRede();
  }
  const tipo = res.headers.get('content-type') ?? '';
  const dados = tipo.includes('application/json') ? await res.json() : null;
  if (!res.ok) {
    if (res.status === 401 && !caminho.startsWith('/auth/')) {
      window.dispatchEvent(new Event('sessao-expirada'));
    }
    throw new ErroApi(res.status, (dados as { erro?: string })?.erro ?? `Erro ${res.status}`);
  }
  return dados as T;
}

export const api = {
  get: <T>(caminho: string) => requisicao<T>('GET', caminho),
  post: <T>(caminho: string, corpo: Corpo = {}) => requisicao<T>('POST', caminho, corpo),
  put: <T>(caminho: string, corpo: Corpo, headers?: Record<string, string>) => requisicao<T>('PUT', caminho, corpo, headers),
  del: <T>(caminho: string) => requisicao<T>('DELETE', caminho),
};

/** Monta query string ignorando valores vazios. */
export function qs(params: Record<string, string | number | boolean | null | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '' && v !== false) p.set(k, String(v === true ? 1 : v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

export function urlArquivo(chave: string): string {
  return `/api/arquivos/${chave}`;
}
