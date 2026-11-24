// Constantes compartilhadas entre o front-end e a API.

export const PERFIS = ['admin', 'atendente', 'tecnico', 'sem_acesso'] as const;
export type Perfil = (typeof PERFIS)[number];

export const PERFIL_LABEL: Record<Perfil, string> = {
  admin: 'Administrador',
  atendente: 'Atendente',
  tecnico: 'Técnico',
  sem_acesso: 'Sem acesso ao sistema',
};

export const STATUS_OS = ['aberta', 'agendada', 'em_andamento', 'concluida', 'cancelada'] as const;
export type StatusOS = (typeof STATUS_OS)[number];

export const STATUS_OS_LABEL: Record<StatusOS, string> = {
  aberta: 'Aberta',
  agendada: 'Agendada',
  em_andamento: 'Em andamento',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
};

export const STATUS_OS_COR: Record<StatusOS, string> = {
  aberta: 'blue',
  agendada: 'purple',
  em_andamento: 'orange',
  concluida: 'green',
  cancelada: 'default',
};

export const STATUS_NOTA = ['pendente', 'emitida', 'cancelada'] as const;
export type StatusNota = (typeof STATUS_NOTA)[number];
export const STATUS_NOTA_LABEL: Record<StatusNota, string> = {
  pendente: 'Pendente de emissão',
  emitida: 'Emitida',
  cancelada: 'Cancelada',
};

export const FORMAS_PAGAMENTO = [
  'Dinheiro',
  'Pix',
  'Cartão de débito',
  'Cartão de crédito',
  'Boleto',
  'Transferência',
  'Faturado',
] as const;

export const UNIDADES = ['un', 'metro', 'hora', 'diária', 'm³', 'visita'] as const;

export const REGIMES_TRIBUTARIOS: Record<string, string> = {
  mei: 'MEI',
  simples_nacional: 'Simples Nacional',
  lucro_presumido: 'Lucro Presumido',
  lucro_real: 'Lucro Real',
};

export const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
] as const;

export const CAMPOS_BUSCA = ['todos', 'cliente', 'endereco', 'condominio'] as const;
export type CampoBusca = (typeof CAMPOS_BUSCA)[number];
