import { useCallback, useEffect, useRef, useState } from 'react';
import { Grid } from 'antd';
import { api } from './api';

/** true em telas pequenas (celular). */
export function useCelular(): boolean {
  const bp = Grid.useBreakpoint();
  return !bp.md;
}

/** Carrega dados de um endpoint e recarrega quando a URL muda. */
export function useDados<T>(url: string | null) {
  const [dados, setDados] = useState<T | null>(null);
  const [carregando, setCarregando] = useState(!!url);
  const [erro, setErro] = useState<string | null>(null);
  const seq = useRef(0);

  const recarregar = useCallback(async () => {
    if (!url) return;
    const n = ++seq.current;
    setCarregando(true);
    try {
      const r = await api.get<T>(url);
      if (n === seq.current) {
        setDados(r);
        setErro(null);
      }
    } catch (e) {
      if (n === seq.current) setErro((e as Error).message);
    } finally {
      if (n === seq.current) setCarregando(false);
    }
  }, [url]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  return { dados, carregando, erro, recarregar, setDados };
}

/** Valor com atraso (para busca enquanto digita). */
export function useAtraso<T>(valor: T, ms = 300): T {
  const [v, setV] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setV(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return v;
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}
