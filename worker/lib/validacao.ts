import { z } from 'zod';
import type { Context } from 'hono';
import { erro } from './util';

export const txt = (max = 200) => z.string().trim().max(max).default('');
export const txtObrig = (campo: string, max = 200) =>
  z.string({ error: `Informe ${campo}.` }).trim().min(1, `Informe ${campo}.`).max(max);
export const inteiroOpc = () => z.coerce.number().int().nullable().optional();
export const idOpc = () => z.coerce.number().int().positive().nullable().optional();
export const dinheiro = () => z.coerce.number().min(0).max(10_000_000).default(0);
export const bool01 = () =>
  z
    .union([z.boolean(), z.number()])
    .transform((v) => (v ? 1 : 0))
    .default(0);
export const dataOpc = () =>
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}/, 'Data inválida.')
    .nullable()
    .optional();

/** Lê e valida o corpo JSON. Em caso de erro devolve 422 com a primeira mensagem. */
export async function lerCorpo<T extends z.ZodType>(c: Context, schema: T): Promise<z.output<T>> {
  let dados: unknown;
  try {
    dados = await c.req.json();
  } catch {
    erro(400, 'Corpo da requisição inválido.');
  }
  const r = schema.safeParse(dados);
  if (!r.success) {
    const p = r.error.issues[0];
    const campo = p.path.length ? ` (${p.path.join('.')})` : '';
    erro(422, `${p.message}${campo}`);
  }
  return r.data;
}

export function idParam(c: Context, nome = 'id'): number {
  const id = Number(c.req.param(nome));
  if (!Number.isInteger(id) || id <= 0) erro(400, 'Identificador inválido.');
  return id;
}

/** Monta INSERT/UPDATE a partir de um objeto já validado. */
export function sqlInsert(tabela: string, dados: Record<string, unknown>) {
  const cols = Object.keys(dados);
  return {
    sql: `INSERT INTO ${tabela} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
    params: cols.map((k) => normalizarValor(dados[k])),
  };
}

export function sqlUpdate(tabela: string, dados: Record<string, unknown>, id: number) {
  const cols = Object.keys(dados);
  return {
    sql: `UPDATE ${tabela} SET ${cols.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`,
    params: [...cols.map((k) => normalizarValor(dados[k])), id],
  };
}

function normalizarValor(v: unknown): unknown {
  if (v === undefined) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  return v;
}
