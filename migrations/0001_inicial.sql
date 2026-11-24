-- Esquema inicial do sistema de controle de serviços.
-- Datas/horas: texto ISO 8601 em UTC (ex.: 2026-11-24T13:00:00.000Z).
-- Datas sem hora (ex.: garantia_ate): 'AAAA-MM-DD' no fuso de São Paulo.
-- Colunas "busca": texto normalizado (minúsculo, sem acento) usado pela busca rápida.

CREATE TABLE empresa (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  razao_social TEXT NOT NULL DEFAULT '',
  nome_fantasia TEXT NOT NULL DEFAULT '',
  cnpj TEXT NOT NULL DEFAULT '',
  inscricao_municipal TEXT NOT NULL DEFAULT '',
  inscricao_estadual TEXT NOT NULL DEFAULT '',
  telefone TEXT NOT NULL DEFAULT '',
  whatsapp TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  site TEXT NOT NULL DEFAULT '',
  cep TEXT NOT NULL DEFAULT '',
  logradouro TEXT NOT NULL DEFAULT '',
  numero TEXT NOT NULL DEFAULT '',
  complemento TEXT NOT NULL DEFAULT '',
  bairro TEXT NOT NULL DEFAULT '',
  cidade TEXT NOT NULL DEFAULT '',
  uf TEXT NOT NULL DEFAULT '',
  regime_tributario TEXT NOT NULL DEFAULT 'simples_nacional',
  aliquota_iss REAL NOT NULL DEFAULT 0,
  codigo_servico_municipal TEXT NOT NULL DEFAULT '',
  cnae TEXT NOT NULL DEFAULT '',
  garantia_padrao_dias INTEGER NOT NULL DEFAULT 90,
  dias_reincidencia INTEGER NOT NULL DEFAULT 90,
  texto_os TEXT NOT NULL DEFAULT '',
  atualizado_em TEXT
);
INSERT INTO empresa (id) VALUES (1);

-- Funcionários. Quem tem "login" acessa o sistema conforme o perfil.
CREATE TABLE funcionarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  cpf TEXT NOT NULL DEFAULT '',
  telefone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  cargo TEXT NOT NULL DEFAULT '',
  cnh TEXT NOT NULL DEFAULT '',
  cnh_validade TEXT,
  perfil TEXT NOT NULL DEFAULT 'sem_acesso'
    CHECK (perfil IN ('admin', 'atendente', 'tecnico', 'sem_acesso')),
  login TEXT UNIQUE COLLATE NOCASE,
  senha_hash TEXT,
  ativo INTEGER NOT NULL DEFAULT 1,
  observacoes TEXT NOT NULL DEFAULT '',
  criado_em TEXT NOT NULL,
  atualizado_em TEXT
);

CREATE TABLE sessoes (
  token_hash TEXT PRIMARY KEY,
  funcionario_id INTEGER NOT NULL REFERENCES funcionarios(id) ON DELETE CASCADE,
  expira_em TEXT NOT NULL,
  criado_em TEXT NOT NULL
);
CREATE INDEX idx_sessoes_funcionario ON sessoes(funcionario_id);

CREATE TABLE veiculos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  placa TEXT NOT NULL UNIQUE COLLATE NOCASE,
  marca TEXT NOT NULL DEFAULT '',
  modelo TEXT NOT NULL DEFAULT '',
  ano INTEGER,
  tipo TEXT NOT NULL DEFAULT '',
  equipamento TEXT NOT NULL DEFAULT '',
  km_atual INTEGER,
  responsavel_id INTEGER REFERENCES funcionarios(id) ON DELETE SET NULL,
  ativo INTEGER NOT NULL DEFAULT 1,
  observacoes TEXT NOT NULL DEFAULT '',
  criado_em TEXT NOT NULL,
  atualizado_em TEXT
);

CREATE TABLE condominios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  cnpj TEXT NOT NULL DEFAULT '',
  sindico TEXT NOT NULL DEFAULT '',
  zelador TEXT NOT NULL DEFAULT '',
  telefone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  administradora TEXT NOT NULL DEFAULT '',
  cep TEXT NOT NULL DEFAULT '',
  logradouro TEXT NOT NULL DEFAULT '',
  numero TEXT NOT NULL DEFAULT '',
  bairro TEXT NOT NULL DEFAULT '',
  cidade TEXT NOT NULL DEFAULT '',
  uf TEXT NOT NULL DEFAULT '',
  observacoes TEXT NOT NULL DEFAULT '',
  busca TEXT NOT NULL DEFAULT '',
  busca_endereco TEXT NOT NULL DEFAULT '',
  criado_em TEXT NOT NULL,
  atualizado_em TEXT
);

-- Cliente = quem contrata/paga. Pode ser um morador (PF), uma empresa ou o próprio condomínio (PJ).
CREATE TABLE clientes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo TEXT NOT NULL DEFAULT 'PF' CHECK (tipo IN ('PF', 'PJ')),
  nome TEXT NOT NULL,
  cpf_cnpj TEXT NOT NULL DEFAULT '',
  telefone TEXT NOT NULL DEFAULT '',
  telefone2 TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  cep TEXT NOT NULL DEFAULT '',
  logradouro TEXT NOT NULL DEFAULT '',
  numero TEXT NOT NULL DEFAULT '',
  complemento TEXT NOT NULL DEFAULT '',
  bairro TEXT NOT NULL DEFAULT '',
  cidade TEXT NOT NULL DEFAULT '',
  uf TEXT NOT NULL DEFAULT '',
  condominio_id INTEGER REFERENCES condominios(id) ON DELETE SET NULL,
  unidade TEXT NOT NULL DEFAULT '',
  observacoes TEXT NOT NULL DEFAULT '',
  busca TEXT NOT NULL DEFAULT '',
  busca_endereco TEXT NOT NULL DEFAULT '',
  criado_em TEXT NOT NULL,
  atualizado_em TEXT
);
CREATE INDEX idx_clientes_condominio ON clientes(condominio_id);
CREATE INDEX idx_clientes_nome ON clientes(nome COLLATE NOCASE);

-- Cadastro de serviços (tipos de serviço) com prazo de garantia próprio.
CREATE TABLE servicos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  descricao TEXT NOT NULL DEFAULT '',
  categoria TEXT NOT NULL DEFAULT '',
  garantia_dias INTEGER,
  ativo INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL,
  atualizado_em TEXT
);

-- Tabela de preços: cada serviço pode ter várias faixas/variações de preço.
CREATE TABLE precos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  servico_id INTEGER NOT NULL REFERENCES servicos(id) ON DELETE CASCADE,
  descricao TEXT NOT NULL DEFAULT '',
  unidade TEXT NOT NULL DEFAULT 'un',
  valor REAL NOT NULL DEFAULT 0,
  ativo INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL,
  atualizado_em TEXT
);
CREATE INDEX idx_precos_servico ON precos(servico_id);

CREATE TABLE ordens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  numero INTEGER NOT NULL UNIQUE,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  condominio_id INTEGER REFERENCES condominios(id) ON DELETE SET NULL,
  unidade TEXT NOT NULL DEFAULT '',
  cep TEXT NOT NULL DEFAULT '',
  logradouro TEXT NOT NULL DEFAULT '',
  numero_endereco TEXT NOT NULL DEFAULT '',
  complemento TEXT NOT NULL DEFAULT '',
  bairro TEXT NOT NULL DEFAULT '',
  cidade TEXT NOT NULL DEFAULT '',
  uf TEXT NOT NULL DEFAULT '',
  -- chave normalizada do endereço (logradouro + número + unidade) para achar reincidência
  endereco_chave TEXT NOT NULL DEFAULT '',
  contato_nome TEXT NOT NULL DEFAULT '',
  contato_telefone TEXT NOT NULL DEFAULT '',
  local_servico TEXT NOT NULL DEFAULT '',
  problema TEXT NOT NULL DEFAULT '',
  servico_executado TEXT NOT NULL DEFAULT '',
  observacoes_internas TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'aberta'
    CHECK (status IN ('aberta', 'agendada', 'em_andamento', 'concluida', 'cancelada')),
  prioridade TEXT NOT NULL DEFAULT 'normal' CHECK (prioridade IN ('normal', 'urgente')),
  data_agendada TEXT,
  tecnico_id INTEGER REFERENCES funcionarios(id) ON DELETE SET NULL,
  ajudante_id INTEGER REFERENCES funcionarios(id) ON DELETE SET NULL,
  veiculo_id INTEGER REFERENCES veiculos(id) ON DELETE SET NULL,
  iniciada_em TEXT,
  concluida_em TEXT,
  garantia_ate TEXT,
  -- retorno em garantia: aponta para a OS original e não gera cobrança
  origem_id INTEGER REFERENCES ordens(id) ON DELETE SET NULL,
  retorno_garantia INTEGER NOT NULL DEFAULT 0,
  valor_servicos REAL NOT NULL DEFAULT 0,
  desconto REAL NOT NULL DEFAULT 0,
  valor_total REAL NOT NULL DEFAULT 0,
  forma_pagamento TEXT NOT NULL DEFAULT '',
  pago INTEGER NOT NULL DEFAULT 0,
  assinatura_key TEXT,
  assinatura_nome TEXT NOT NULL DEFAULT '',
  motivo_cancelamento TEXT NOT NULL DEFAULT '',
  -- busca separada por campo (cliente / endereço / condomínio) + texto geral
  busca_cliente TEXT NOT NULL DEFAULT '',
  busca_endereco TEXT NOT NULL DEFAULT '',
  busca_condominio TEXT NOT NULL DEFAULT '',
  busca TEXT NOT NULL DEFAULT '',
  criado_por INTEGER REFERENCES funcionarios(id) ON DELETE SET NULL,
  criado_em TEXT NOT NULL,
  atualizado_em TEXT
);
CREATE INDEX idx_ordens_cliente ON ordens(cliente_id, criado_em);
CREATE INDEX idx_ordens_endereco ON ordens(endereco_chave, criado_em);
CREATE INDEX idx_ordens_condominio ON ordens(condominio_id, criado_em);
CREATE INDEX idx_ordens_status ON ordens(status, data_agendada);
CREATE INDEX idx_ordens_tecnico ON ordens(tecnico_id, status);
CREATE INDEX idx_ordens_criado ON ordens(criado_em);

CREATE TABLE ordem_itens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ordem_id INTEGER NOT NULL REFERENCES ordens(id) ON DELETE CASCADE,
  servico_id INTEGER REFERENCES servicos(id) ON DELETE SET NULL,
  preco_id INTEGER REFERENCES precos(id) ON DELETE SET NULL,
  descricao TEXT NOT NULL,
  unidade TEXT NOT NULL DEFAULT 'un',
  quantidade REAL NOT NULL DEFAULT 1,
  valor_unitario REAL NOT NULL DEFAULT 0,
  garantia_dias INTEGER
);
CREATE INDEX idx_ordem_itens_ordem ON ordem_itens(ordem_id);

-- Fotos (antes/depois) guardadas no R2. O id é gerado no celular (permite sincronização offline sem duplicar).
CREATE TABLE ordem_fotos (
  id TEXT PRIMARY KEY,
  ordem_id INTEGER NOT NULL REFERENCES ordens(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('antes', 'depois')),
  r2_key TEXT NOT NULL,
  legenda TEXT NOT NULL DEFAULT '',
  criado_por INTEGER REFERENCES funcionarios(id) ON DELETE SET NULL,
  criado_em TEXT NOT NULL
);
CREATE INDEX idx_ordem_fotos_ordem ON ordem_fotos(ordem_id);

-- Notas fiscais de serviço. Por enquanto apenas registro: a emissão é feita no portal
-- da prefeitura e o número/código de verificação são lançados aqui.
CREATE TABLE notas_fiscais (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ordem_id INTEGER REFERENCES ordens(id) ON DELETE SET NULL,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'emitida', 'cancelada')),
  numero TEXT NOT NULL DEFAULT '',
  serie TEXT NOT NULL DEFAULT '',
  codigo_verificacao TEXT NOT NULL DEFAULT '',
  data_emissao TEXT,
  competencia TEXT NOT NULL DEFAULT '',
  discriminacao TEXT NOT NULL DEFAULT '',
  codigo_servico TEXT NOT NULL DEFAULT '',
  valor_servicos REAL NOT NULL DEFAULT 0,
  deducoes REAL NOT NULL DEFAULT 0,
  aliquota_iss REAL NOT NULL DEFAULT 0,
  valor_iss REAL NOT NULL DEFAULT 0,
  iss_retido INTEGER NOT NULL DEFAULT 0,
  motivo_cancelamento TEXT NOT NULL DEFAULT '',
  criado_por INTEGER REFERENCES funcionarios(id) ON DELETE SET NULL,
  criado_em TEXT NOT NULL,
  atualizado_em TEXT
);
CREATE INDEX idx_notas_ordem ON notas_fiscais(ordem_id);
CREATE INDEX idx_notas_cliente ON notas_fiscais(cliente_id);
CREATE INDEX idx_notas_status ON notas_fiscais(status, criado_em);
