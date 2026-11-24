import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Perfil } from '../shared/constantes';
import { api } from './api';
import type { Usuario } from './tipos';
import { lerCache, gravarCache } from './offline/armazenamento';

interface Estado {
  carregando: boolean;
  usuario: Usuario | null;
  precisaConfigurar: boolean;
  entrar: (login: string, senha: string) => Promise<void>;
  configurar: (nome: string, login: string, senha: string) => Promise<void>;
  sair: () => Promise<void>;
  pode: (...perfis: Perfil[]) => boolean;
}

const Ctx = createContext<Estado | null>(null);

export function ProvedorAuth({ children }: { children: ReactNode }) {
  const [carregando, setCarregando] = useState(true);
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [precisaConfigurar, setPrecisaConfigurar] = useState(false);

  const definirUsuario = useCallback((u: Usuario | null) => {
    setUsuario(u);
    void gravarCache('usuario', u);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const r = await api.get<{ usuario: Usuario | null; precisa_configurar: boolean }>('/auth/estado');
        definirUsuario(r.usuario);
        setPrecisaConfigurar(r.precisa_configurar);
      } catch {
        // Sem internet: usa o último usuário conhecido para o técnico continuar trabalhando offline.
        setUsuario(await lerCache<Usuario>('usuario'));
      } finally {
        setCarregando(false);
      }
    })();
    const expirou = () => definirUsuario(null);
    window.addEventListener('sessao-expirada', expirou);
    return () => window.removeEventListener('sessao-expirada', expirou);
  }, [definirUsuario]);

  const entrar = useCallback(
    async (login: string, senha: string) => {
      const r = await api.post<{ usuario: Usuario }>('/auth/login', { login, senha });
      definirUsuario(r.usuario);
    },
    [definirUsuario],
  );

  const configurar = useCallback(
    async (nome: string, login: string, senha: string) => {
      const r = await api.post<{ usuario: Usuario }>('/auth/configurar', { nome, login, senha });
      setPrecisaConfigurar(false);
      definirUsuario(r.usuario);
    },
    [definirUsuario],
  );

  const sair = useCallback(async () => {
    await api.post('/auth/logout').catch(() => undefined);
    definirUsuario(null);
  }, [definirUsuario]);

  const pode = useCallback((...perfis: Perfil[]) => !!usuario && perfis.includes(usuario.perfil), [usuario]);

  return (
    <Ctx.Provider value={{ carregando, usuario, precisaConfigurar, entrar, configurar, sair, pode }}>{children}</Ctx.Provider>
  );
}

export function useAuth(): Estado {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth fora do ProvedorAuth');
  return c;
}
