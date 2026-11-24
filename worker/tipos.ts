import type { Usuario } from './lib/auth';

export type AppEnv = {
  Bindings: Env;
  Variables: { usuario: Usuario };
};
