import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type ModoTema = 'auto' | 'claro' | 'escuro';

const CHAVE = 'tema';
const CORES = { claro: '#0b5cad', escuro: '#141414' };

function lerModo(): ModoTema {
  try {
    const v = localStorage.getItem(CHAVE);
    return v === 'claro' || v === 'escuro' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

const consultaEscuro = () => window.matchMedia?.('(prefers-color-scheme: dark)');

interface Estado {
  modo: ModoTema;
  escuro: boolean;
  setModo: (m: ModoTema) => void;
}

const Ctx = createContext<Estado | null>(null);

/** Tema claro/escuro. "auto" segue a configuração do celular/computador. */
export function ProvedorTema({ children }: { children: ReactNode }) {
  const [modo, setModoEstado] = useState<ModoTema>(lerModo);
  const [sistemaEscuro, setSistemaEscuro] = useState(() => !!consultaEscuro()?.matches);

  useEffect(() => {
    const mq = consultaEscuro();
    if (!mq) return;
    const mudou = (e: MediaQueryListEvent) => setSistemaEscuro(e.matches);
    mq.addEventListener('change', mudou);
    return () => mq.removeEventListener('change', mudou);
  }, []);

  const escuro = modo === 'escuro' || (modo === 'auto' && sistemaEscuro);

  useEffect(() => {
    document.documentElement.dataset.tema = escuro ? 'escuro' : 'claro';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', escuro ? CORES.escuro : CORES.claro);
  }, [escuro]);

  const setModo = (m: ModoTema) => {
    setModoEstado(m);
    try {
      if (m === 'auto') localStorage.removeItem(CHAVE);
      else localStorage.setItem(CHAVE, m);
    } catch {
      // armazenamento indisponível: vale só nesta sessão
    }
  };

  return <Ctx.Provider value={{ modo, escuro, setModo }}>{children}</Ctx.Provider>;
}

export function useTema(): Estado {
  const c = useContext(Ctx);
  if (!c) throw new Error('useTema fora do ProvedorTema');
  return c;
}

export const OPCOES_TEMA: { value: ModoTema; label: string }[] = [
  { value: 'auto', label: 'Automático' },
  { value: 'claro', label: 'Claro' },
  { value: 'escuro', label: 'Escuro' },
];
