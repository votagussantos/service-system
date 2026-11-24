import { createStore, get, set, del } from 'idb-keyval';

// Banco local do navegador (IndexedDB) usado para o modo offline.
const loja = createStore('servicos-offline', 'dados');

export async function lerCache<T>(chave: string): Promise<T | null> {
  try {
    return ((await get(chave, loja)) as T | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function gravarCache(chave: string, valor: unknown): Promise<void> {
  try {
    if (valor === null || valor === undefined) await del(chave, loja);
    else await set(chave, valor, loja);
  } catch {
    // armazenamento indisponível (ex.: navegação privada) — segue sem cache
  }
}
