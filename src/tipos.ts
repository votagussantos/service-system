import type { Perfil, StatusNota, StatusOS } from '../shared/constantes';

export interface Usuario {
  id: number;
  nome: string;
  login: string;
  perfil: Perfil;
}

export interface Endereco {
  cep: string;
  logradouro: string;
  numero: string;
  complemento?: string;
  bairro: string;
  cidade: string;
  uf: string;
}

export interface Cliente extends Endereco {
  id: number;
  tipo: 'PF' | 'PJ';
  nome: string;
  cpf_cnpj: string;
  telefone: string;
  telefone2: string;
  email: string;
  condominio_id: number | null;
  condominio_nome?: string | null;
  unidade: string;
  observacoes: string;
  total_os?: number;
  ultima_os_em?: string | null;
  em_garantia?: number;
}

export interface Condominio extends Endereco {
  id: number;
  nome: string;
  cnpj: string;
  sindico: string;
  zelador: string;
  telefone: string;
  email: string;
  administradora: string;
  observacoes: string;
  total_os?: number;
  ultima_os_em?: string | null;
  em_garantia?: number;
}

export interface Servico {
  id: number;
  nome: string;
  descricao: string;
  categoria: string;
  garantia_dias: number | null;
  ativo: number;
  total_precos?: number;
}

export interface Preco {
  id: number;
  servico_id: number;
  servico_nome: string;
  servico_categoria: string;
  servico_garantia_dias: number | null;
  descricao: string;
  unidade: string;
  valor: number;
  ativo: number;
}

export interface Funcionario {
  id: number;
  nome: string;
  cpf: string;
  telefone: string;
  email: string;
  cargo: string;
  cnh: string;
  cnh_validade: string | null;
  perfil: Perfil;
  login: string | null;
  tem_senha: number;
  ativo: number;
  observacoes: string;
}

export interface Veiculo {
  id: number;
  placa: string;
  marca: string;
  modelo: string;
  ano: number | null;
  tipo: string;
  equipamento: string;
  km_atual: number | null;
  responsavel_id: number | null;
  responsavel_nome?: string | null;
  ativo: number;
  observacoes: string;
}

export interface ItemOS {
  id?: number;
  servico_id?: number | null;
  preco_id?: number | null;
  descricao: string;
  unidade: string;
  quantidade: number;
  valor_unitario: number;
  garantia_dias?: number | null;
}

export interface FotoOS {
  id: string;
  tipo: 'antes' | 'depois';
  legenda: string;
  r2_key: string;
  criado_em: string;
  /** URL local (foto ainda não enviada, guardada no celular) */
  url_local?: string;
  pendente?: boolean;
}

/** Linha de OS em listas e na busca. */
export interface OrdemResumo {
  id: number;
  numero: number;
  status: StatusOS;
  prioridade: 'normal' | 'urgente';
  data_agendada: string | null;
  criado_em: string;
  concluida_em: string | null;
  garantia_ate: string | null;
  cliente_id: number;
  cliente_nome: string;
  cliente_telefone: string;
  condominio_id: number | null;
  condominio_nome: string | null;
  unidade: string;
  logradouro: string;
  numero_endereco: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  cep: string;
  problema: string;
  local_servico: string;
  valor_total: number | null;
  pago: number;
  retorno_garantia: number;
  origem_id: number | null;
  tecnico_id: number | null;
  tecnico_nome: string | null;
  veiculo_placa: string | null;
  em_garantia: number;
  reincidencia: number;
}

export interface Ordem extends Omit<OrdemResumo, 'cliente_nome' | 'cliente_telefone' | 'condominio_nome'> {
  contato_nome: string;
  contato_telefone: string;
  servico_executado: string;
  observacoes_internas: string;
  ajudante_id: number | null;
  ajudante_nome: string | null;
  veiculo_id: number | null;
  veiculo_modelo: string | null;
  iniciada_em: string | null;
  valor_servicos: number;
  desconto: number;
  valor_total: number;
  forma_pagamento: string;
  assinatura_key: string | null;
  assinatura_nome: string;
  motivo_cancelamento: string;
  origem_numero: number | null;
  criado_por_nome: string | null;
  cliente: Pick<Cliente, 'id' | 'tipo' | 'nome' | 'cpf_cnpj' | 'telefone' | 'telefone2' | 'email'>;
  condominio: Pick<Condominio, 'id' | 'nome' | 'sindico' | 'zelador' | 'telefone'> | null;
  itens: ItemOS[];
  fotos: FotoOS[];
  notas: { id: number; status: StatusNota; numero: string; data_emissao: string | null }[];
  retornos: { id: number; numero: number; status: StatusOS; criado_em: string; retorno_garantia: number }[];
}

export interface NotaFiscal {
  id: number;
  ordem_id: number | null;
  ordem_numero: number | null;
  cliente_id: number;
  cliente_nome: string;
  cliente_documento: string;
  status: StatusNota;
  numero: string;
  serie: string;
  codigo_verificacao: string;
  data_emissao: string | null;
  competencia: string;
  discriminacao: string;
  codigo_servico: string;
  valor_servicos: number;
  deducoes: number;
  aliquota_iss: number;
  valor_iss: number;
  iss_retido: number;
  motivo_cancelamento: string;
  criado_em: string;
}

export interface Empresa extends Endereco {
  razao_social: string;
  nome_fantasia: string;
  cnpj: string;
  inscricao_municipal: string;
  inscricao_estadual: string;
  telefone: string;
  whatsapp: string;
  email: string;
  site: string;
  regime_tributario: string;
  aliquota_iss: number;
  codigo_servico_municipal: string;
  cnae: string;
  garantia_padrao_dias: number;
  dias_reincidencia: number;
  texto_os: string;
}

export interface Lista<T> {
  itens: T[];
  total: number;
}
