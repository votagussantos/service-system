import { HTTPException } from 'hono/http-exception';

export const FUSO = 'America/Sao_Paulo';

/** Erro de negócio com mensagem amigável para o usuário. */
export function erro(status: 400 | 401 | 403 | 404 | 409 | 422, mensagem: string): never {
  throw new HTTPException(status, { message: mensagem });
}

export function agoraISO(): string {
  return new Date().toISOString();
}

/** Data (AAAA-MM-DD) no fuso de São Paulo para um instante. */
export function dataSP(instante: Date | string = new Date()): string {
  const d = typeof instante === 'string' ? new Date(instante) : instante;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

export function somarDias(dataISO: string, dias: number): string {
  const [a, m, d] = dataISO.split('-').map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d + dias));
  return dt.toISOString().slice(0, 10);
}

/** Minúsculo, sem acentos, sem pontuação, espaços simples. */
export function normalizar(texto: string | null | undefined): string {
  return (texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function soDigitos(texto: string | null | undefined): string {
  return (texto ?? '').replace(/\D+/g, '');
}

const ABREVIACOES: Record<string, string> = {
  r: 'rua',
  av: 'avenida',
  avda: 'avenida',
  al: 'alameda',
  tv: 'travessa',
  trav: 'travessa',
  pc: 'praca',
  pca: 'praca',
  rod: 'rodovia',
  estr: 'estrada',
  est: 'estrada',
  lgo: 'largo',
  dr: 'doutor',
  prof: 'professor',
  cel: 'coronel',
  gal: 'general',
  sta: 'santa',
  sto: 'santo',
  sao: 'sao',
};

const PALAVRAS_UNIDADE = new Set(['apto', 'ap', 'apt', 'apartamento', 'unidade', 'un', 'casa', 'sala', 'cj', 'conjunto', 'n', 'no']);

/** Normaliza o logradouro expandindo abreviações comuns (R. → rua, Av. → avenida...). */
export function normalizarLogradouro(logradouro: string): string {
  return normalizar(logradouro)
    .split(' ')
    .filter(Boolean)
    .map((p) => ABREVIACOES[p] ?? p)
    .join(' ');
}

/**
 * Chave do endereço usada para detectar reincidência no mesmo local.
 * "Av. São João, 100 - Apto 12" e "avenida sao joao 100 ap 12" geram a mesma chave.
 */
export function chaveEndereco(logradouro: string, numero: string, unidade: string): string {
  const log = normalizarLogradouro(logradouro);
  if (!log) return '';
  const num = normalizar(numero).replace(/\s+/g, '');
  const uni = normalizar(unidade)
    .split(' ')
    .filter((p) => p && !PALAVRAS_UNIDADE.has(p))
    .join('');
  return [log, num, uni].join('|');
}

/** Monta texto de busca a partir de vários campos (normalizado + versões só com dígitos). */
export function textoBusca(...partes: (string | number | null | undefined)[]): string {
  const textos: string[] = [];
  for (const p of partes) {
    if (p === null || p === undefined || p === '') continue;
    const s = String(p);
    const n = normalizar(s);
    if (n) textos.push(n);
    const dig = soDigitos(s);
    if (dig.length >= 3 && dig !== n.replace(/\s/g, '')) textos.push(dig);
  }
  return ' ' + textos.join(' ') + ' ';
}

/** Expande abreviações também no termo pesquisado ("av paulista" acha "Avenida Paulista"). */
export function termosBusca(q: string): string[] {
  return normalizarLogradouro(q)
    .split(' ')
    .filter((t) => t.length > 0)
    .slice(0, 8);
}

/** Condição SQL "todas as palavras aparecem" para uma ou mais colunas de busca. */
export function condicaoBusca(colunas: string[], termos: string[]): { sql: string; params: string[] } {
  if (termos.length === 0) return { sql: '1=1', params: [] };
  const partes: string[] = [];
  const params: string[] = [];
  for (const termo of termos) {
    const like = `%${termo.replace(/[%_]/g, '')}%`;
    partes.push('(' + colunas.map((c) => `${c} LIKE ?`).join(' OR ') + ')');
    for (let i = 0; i < colunas.length; i++) params.push(like);
  }
  return { sql: partes.join(' AND '), params };
}

export function arred(valor: number): number {
  return Math.round(valor * 100) / 100;
}

/** Formato ISO usado pelo SQLite para comparar com toISOString(). */
export const SQL_ISO = "'%Y-%m-%dT%H:%M:%fZ'";
