// Popula um ambiente LOCAL com dados de exemplo para testar o sistema.
// Uso: node scripts/dados-exemplo.mjs [http://localhost:5173]
// Cria o administrador "admin" (senha "admin123") se o sistema ainda não foi configurado.

const BASE = (process.argv[2] ?? 'http://localhost:5173') + '/api';
let cookie = '';

async function req(metodo, caminho, corpo) {
  const r = await fetch(BASE + caminho, {
    method: metodo,
    headers: { 'content-type': 'application/json', cookie },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const sc = r.headers.get('set-cookie');
  if (sc) cookie = sc.split(';')[0];
  const dados = await r.json();
  if (!r.ok) throw new Error(`${metodo} ${caminho}: ${dados.erro}`);
  return dados;
}

const estado = await req('GET', '/auth/estado');
if (estado.precisa_configurar) await req('POST', '/auth/configurar', { nome: 'Administrador', login: 'admin', senha: 'admin123' });
else await req('POST', '/auth/login', { login: 'admin', senha: 'admin123' });

await req('PUT', '/empresa', {
  razao_social: 'Desentupidora Exemplo LTDA',
  nome_fantasia: 'Desentupidora Exemplo',
  cnpj: '12.345.678/0001-90',
  telefone: '(11) 3333-4444',
  whatsapp: '(11) 98888-7777',
  email: 'contato@exemplo.com.br',
  logradouro: 'Rua Exemplo',
  numero: '100',
  bairro: 'Centro',
  cidade: 'São Paulo',
  uf: 'SP',
  regime_tributario: 'simples_nacional',
  aliquota_iss: 2,
  codigo_servico_municipal: '7.19',
  garantia_padrao_dias: 30,
  dias_reincidencia: 90,
  texto_os: 'Garantia conforme prazo indicado, válida para o mesmo ponto atendido. Não cobre mau uso (descarte de gordura, papel, objetos) nem rompimento de tubulação.',
});

const tec1 = await req('POST', '/funcionarios', { nome: 'Carlos Silva', cargo: 'Técnico', telefone: '(11) 97777-1111', perfil: 'tecnico', login: 'carlos', senha: 'carlos123' });
const tec2 = await req('POST', '/funcionarios', { nome: 'Rafael Souza', cargo: 'Técnico', telefone: '(11) 97777-2222', perfil: 'tecnico', login: 'rafael', senha: 'rafael123' });
const ajud = await req('POST', '/funcionarios', { nome: 'Lucas Pereira', cargo: 'Ajudante' });
await req('POST', '/funcionarios', { nome: 'Fernanda Lima', cargo: 'Atendente', perfil: 'atendente', login: 'fernanda', senha: 'fernanda123' });

const v1 = await req('POST', '/veiculos', { placa: 'FXT4A21', marca: 'Fiat', modelo: 'Fiorino', ano: 2021, tipo: 'Utilitário', equipamento: 'Máquina rotativa, sonda elétrica', responsavel_id: tec1.id });
await req('POST', '/veiculos', { placa: 'GHJ7B89', marca: 'VW', modelo: 'Delivery 9.170', ano: 2019, tipo: 'Caminhão hidrojato', equipamento: 'Hidrojato 3000 psi, 80 m de mangueira', responsavel_id: tec2.id });

const servicos = {};
for (const [nome, categoria, garantia, precos] of [
  ['Desentupimento de pia', 'Residencial', 30, [['Pia de cozinha', 'un', 180], ['Pia de banheiro / lavatório', 'un', 150]]],
  ['Desentupimento de vaso sanitário', 'Residencial', 30, [['', 'un', 200]]],
  ['Desentupimento de ralo', 'Residencial', 30, [['', 'un', 140]]],
  ['Limpeza de caixa de gordura', 'Residencial', 60, [['Até 100 litros', 'un', 250], ['Acima de 100 litros', 'un', 400]]],
  ['Hidrojateamento de rede', 'Rede de esgoto', 90, [['Por metro', 'metro', 35], ['Mínimo (até 10 m)', 'un', 450]]],
  ['Inspeção por câmera', 'Diagnóstico', 0, [['', 'un', 350]]],
  ['Visita técnica', 'Diagnóstico', 0, [['Sem execução de serviço', 'visita', 90]]],
]) {
  const s = await req('POST', '/servicos', { nome, categoria, garantia_dias: garantia });
  servicos[nome] = { ...s, precos: [] };
  for (const [descricao, unidade, valor] of precos) {
    servicos[nome].precos.push(await req('POST', '/precos', { servico_id: s.id, descricao, unidade, valor }));
  }
}

const cond = await req('POST', '/condominios', {
  nome: 'Condomínio Edifício Jardim das Acácias',
  sindico: 'Roberto Alves',
  zelador: 'Sr. Antônio',
  telefone: '(11) 3222-1100',
  administradora: 'Admin Predial',
  cep: '01310-100',
  logradouro: 'Avenida Paulista',
  numero: '1500',
  bairro: 'Bela Vista',
  cidade: 'São Paulo',
  uf: 'SP',
});

const c1 = await req('POST', '/clientes', { nome: 'João da Conceição', cpf_cnpj: '123.456.789-09', telefone: '(11) 98765-4321', cep: '04001-000', logradouro: 'Rua das Flores', numero: '45', bairro: 'Vila Mariana', cidade: 'São Paulo', uf: 'SP' });
const c2 = await req('POST', '/clientes', { nome: 'Maria Aparecida Santos', telefone: '(11) 91234-5678', condominio_id: cond.id, unidade: 'Bloco A apto 52', logradouro: 'Avenida Paulista', numero: '1500', bairro: 'Bela Vista', cidade: 'São Paulo', uf: 'SP' });
const c3 = await req('POST', '/clientes', { tipo: 'PJ', nome: 'Condomínio Edifício Jardim das Acácias', cpf_cnpj: '11.222.333/0001-44', telefone: '(11) 3222-1100', condominio_id: cond.id, logradouro: 'Avenida Paulista', numero: '1500', bairro: 'Bela Vista', cidade: 'São Paulo', uf: 'SP' });
const c4 = await req('POST', '/clientes', { tipo: 'PJ', nome: 'Restaurante Sabor Caseiro', cpf_cnpj: '22.333.444/0001-55', telefone: '(11) 3555-6666', logradouro: 'Rua Augusta', numero: '890', bairro: 'Consolação', cidade: 'São Paulo', uf: 'SP' });

const item = (servico, i = 0, quantidade = 1) => {
  const p = servicos[servico].precos[i];
  return { servico_id: servicos[servico].id, preco_id: p.id, descricao: [servico, p.descricao].filter(Boolean).join(' - '), unidade: p.unidade, quantidade, valor_unitario: p.valor };
};
const em = (dias, hora = 9) => {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  d.setHours(hora, 0, 0, 0);
  return d.toISOString();
};

// OS concluída (em garantia)
const os1 = await req('POST', '/ordens', {
  cliente_id: c1.id, logradouro: 'Rua das Flores', numero_endereco: '45', bairro: 'Vila Mariana', cidade: 'São Paulo', uf: 'SP',
  local_servico: 'Cozinha', problema: 'Pia da cozinha entupida, água não desce', tecnico_id: tec1.id, veiculo_id: v1.id, data_agendada: em(0, 8),
  itens: [item('Desentupimento de pia')], contato_nome: 'João', contato_telefone: '(11) 98765-4321',
});
await req('POST', `/ordens/${os1.id}/iniciar`);
await req('POST', `/ordens/${os1.id}/concluir`, { servico_executado: 'Desobstrução do sifão e ramal com máquina rotativa. Orientado a não descartar gordura na pia.', forma_pagamento: 'Pix', pago: true });

// OS concluída de condomínio (caixa de gordura)
const os2 = await req('POST', '/ordens', {
  cliente_id: c3.id, condominio_id: cond.id, unidade: 'Área comum', logradouro: 'Avenida Paulista', numero_endereco: '1500', bairro: 'Bela Vista', cidade: 'São Paulo', uf: 'SP',
  local_servico: 'Caixa de gordura do térreo', problema: 'Mau cheiro e transbordamento', tecnico_id: tec2.id, ajudante_id: ajud.id, data_agendada: em(0, 10),
  itens: [item('Limpeza de caixa de gordura', 1), item('Hidrojateamento de rede', 0, 15)],
});
await req('POST', `/ordens/${os2.id}/concluir`, { servico_executado: 'Limpeza completa da caixa de gordura e hidrojateamento de 15 m da rede até a caixa de inspeção.', forma_pagamento: 'Boleto', pago: false });

// OS agendadas para hoje/amanhã
await req('POST', '/ordens', {
  cliente_id: c2.id, condominio_id: cond.id, unidade: 'Bloco A apto 52', logradouro: 'Avenida Paulista', numero_endereco: '1500', bairro: 'Bela Vista', cidade: 'São Paulo', uf: 'SP',
  local_servico: 'Banheiro social', problema: 'Vaso sanitário entupido', tecnico_id: tec1.id, data_agendada: em(0, 14), contato_nome: 'Maria', contato_telefone: '(11) 91234-5678',
  itens: [item('Desentupimento de vaso sanitário')],
});
await req('POST', '/ordens', {
  cliente_id: c4.id, logradouro: 'Rua Augusta', numero_endereco: '890', bairro: 'Consolação', cidade: 'São Paulo', uf: 'SP', prioridade: 'urgente',
  local_servico: 'Cozinha industrial', problema: 'Ralo da cozinha transbordando', tecnico_id: tec1.id, veiculo_id: v1.id, data_agendada: em(0, 16),
});
await req('POST', '/ordens', {
  cliente_id: c4.id, logradouro: 'Rua Augusta', numero_endereco: '890', bairro: 'Consolação', cidade: 'São Paulo', uf: 'SP',
  local_servico: 'Caixa de gordura', problema: 'Limpeza preventiva mensal', data_agendada: em(1, 9),
});

console.log('Dados de exemplo criados.');
console.log('Logins: admin/admin123 (administrador), fernanda/fernanda123 (atendente), carlos/carlos123 e rafael/rafael123 (técnicos).');
