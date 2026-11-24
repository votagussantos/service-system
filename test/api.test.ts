import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Cliente, criarAmbiente } from './ambiente';

let amb: Awaited<ReturnType<typeof criarAmbiente>>;
let admin: Cliente;
let tecnico: Cliente;
const ids: Record<string, number> = {};

beforeAll(async () => {
  amb = await criarAmbiente();
  admin = new Cliente(amb.env);
  tecnico = new Cliente(amb.env);
});
afterAll(() => amb?.fechar());

describe('configuração inicial e login', () => {
  it('pede configuração quando não há usuários', async () => {
    const r = await admin.get('/auth/estado');
    expect(r.dados).toEqual({ usuario: null, precisa_configurar: true });
  });

  it('bloqueia a API sem login', async () => {
    const r = await admin.get('/clientes');
    expect(r.status).toBe(401);
  });

  it('cria o primeiro administrador e já entra logado', async () => {
    const r = await admin.post('/auth/configurar', { nome: 'Dono', login: 'Dono', senha: 'segredo123' });
    expect(r.status).toBe(201);
    const e = await admin.get('/auth/estado');
    expect(e.dados.usuario).toMatchObject({ login: 'dono', perfil: 'admin' });
  });

  it('não permite configurar de novo', async () => {
    const outro = new Cliente(amb.env);
    const r = await outro.post('/auth/configurar', { nome: 'X', login: 'xxx', senha: 'segredo123' });
    expect(r.status).toBe(409);
  });

  it('recusa senha errada e aceita a certa', async () => {
    const c = new Cliente(amb.env);
    expect((await c.post('/auth/login', { login: 'dono', senha: 'errada' })).status).toBe(401);
    expect((await c.post('/auth/login', { login: 'DONO', senha: 'segredo123' })).status).toBe(200);
    expect((await c.get('/clientes')).status).toBe(200);
  });

  it('bloqueia escrita vinda de outro site (CSRF)', async () => {
    const r = await admin.req('POST', '/clientes', { nome: 'X' }, { origin: 'https://site-malicioso.com' });
    expect(r.status).toBe(403);
  });
});

describe('cadastros', () => {
  it('cadastra empresa com prazos de garantia e reincidência', async () => {
    const r = await admin.put('/empresa', {
      razao_social: 'Desentupidora Exemplo LTDA',
      nome_fantasia: 'Desentupidora Exemplo',
      cnpj: '12.345.678/0001-90',
      cidade: 'São Paulo',
      uf: 'SP',
      aliquota_iss: 5,
      codigo_servico_municipal: '07.19',
      garantia_padrao_dias: 30,
      dias_reincidencia: 90,
    });
    expect(r.status).toBe(200);
    expect(r.dados.garantia_padrao_dias).toBe(30);
  });

  it('cadastra funcionários (técnico com login) e veículo', async () => {
    const t = await admin.post('/funcionarios', { nome: 'João Técnico', cargo: 'Técnico', perfil: 'tecnico', login: 'joao', senha: 'tec12345' });
    expect(t.status).toBe(201);
    expect(t.dados.senha_hash).toBeUndefined();
    ids.tecnico = t.dados.id;
    const semSenha = await admin.post('/funcionarios', { nome: 'Sem senha', perfil: 'tecnico', login: 'semsenha' });
    expect(semSenha.status).toBe(422);
    const ajudante = await admin.post('/funcionarios', { nome: 'Pedro Ajudante', cargo: 'Ajudante' });
    expect(ajudante.status).toBe(201);
    const v = await admin.post('/veiculos', { placa: 'abc-1d23', modelo: 'Strada', tipo: 'Utilitário' });
    expect(v.status).toBe(201);
    expect(v.dados.placa).toBe('ABC1D23');
    ids.veiculo = v.dados.id;
  });

  it('cadastra serviços e tabela de preços', async () => {
    const s1 = await admin.post('/servicos', { nome: 'Desentupimento de pia', categoria: 'Residencial', garantia_dias: 30 });
    const s2 = await admin.post('/servicos', { nome: 'Hidrojateamento', categoria: 'Rede', garantia_dias: 90 });
    ids.servicoPia = s1.dados.id;
    ids.servicoHidro = s2.dados.id;
    const p = await admin.post('/precos', { servico_id: ids.servicoHidro, descricao: 'Até 10 metros', unidade: 'metro', valor: 45 });
    expect(p.status).toBe(201);
    expect(p.dados.servico_nome).toBe('Hidrojateamento');
    ids.preco = p.dados.id;
    const lista = await admin.get(`/precos?servico_id=${ids.servicoHidro}`);
    expect(lista.dados.total).toBe(1);
  });

  it('atendente/técnico não altera tabela de preços', async () => {
    expect((await tecnico.post('/auth/login', { login: 'joao', senha: 'tec12345' })).status).toBe(200);
    expect((await tecnico.post('/precos', { servico_id: ids.servicoPia, valor: 1 })).status).toBe(403);
    expect((await tecnico.get('/precos')).status).toBe(200);
  });

  it('cadastra condomínio e clientes', async () => {
    const cd = await admin.post('/condominios', {
      nome: 'Condomínio Edifício São Jorge',
      sindico: 'Maria',
      logradouro: 'Av. Paulista',
      numero: '1000',
      bairro: 'Bela Vista',
      cidade: 'São Paulo',
      uf: 'SP',
    });
    expect(cd.status).toBe(201);
    ids.condominio = cd.dados.id;
    const c1 = await admin.post('/clientes', {
      nome: 'José da Conceição',
      cpf_cnpj: '123.456.789-09',
      telefone: '(11) 98765-4321',
      logradouro: 'Rua das Flores',
      numero: '45',
      bairro: 'Centro',
      cidade: 'São Paulo',
      uf: 'SP',
    });
    ids.cliente = c1.dados.id;
    const c2 = await admin.post('/clientes', {
      nome: 'Ana Moradora',
      condominio_id: ids.condominio,
      unidade: 'Apto 52',
      logradouro: 'Av. Paulista',
      numero: '1000',
    });
    expect(c2.dados.condominio_nome).toBe('Condomínio Edifício São Jorge');
    ids.clienteCondominio = c2.dados.id;
    const invalido = await admin.post('/clientes', { nome: '' });
    expect(invalido.status).toBe(422);
    expect(invalido.dados.erro).toContain('nome');
  });

  it('busca de clientes ignora acentos e acha por telefone', async () => {
    expect((await admin.get('/clientes?q=jose conceicao')).dados.total).toBe(1);
    expect((await admin.get('/clientes?q=98765')).dados.total).toBe(1);
    expect((await admin.get('/clientes?q=sao jorge')).dados.total).toBe(1);
  });
});

describe('ordens de serviço, garantia e reincidência', () => {
  it('abre OS com itens e calcula total', async () => {
    const r = await admin.post('/ordens', {
      cliente_id: ids.cliente,
      logradouro: 'R. das Flores',
      numero_endereco: '45',
      cidade: 'São Paulo',
      uf: 'SP',
      problema: 'Pia da cozinha entupida',
      local_servico: 'Cozinha',
      tecnico_id: ids.tecnico,
      veiculo_id: ids.veiculo,
      data_agendada: new Date().toISOString(),
      itens: [
        { servico_id: ids.servicoPia, descricao: 'Desentupimento de pia', quantidade: 1, valor_unitario: 150 },
        { servico_id: ids.servicoHidro, preco_id: ids.preco, descricao: 'Hidrojateamento', unidade: 'metro', quantidade: 4, valor_unitario: 45 },
      ],
      desconto: 30,
    });
    expect(r.status).toBe(201);
    expect(r.dados.numero).toBe(1);
    expect(r.dados.status).toBe('agendada');
    expect(r.dados.valor_servicos).toBe(330);
    expect(r.dados.valor_total).toBe(300);
    expect(r.dados.itens[1].garantia_dias).toBe(90);
    ids.os1 = r.dados.id;
  });

  it('técnico vê só as próprias OS e executa o atendimento', async () => {
    const minhas = await tecnico.get('/ordens/minhas');
    expect(minhas.dados.itens.map((o: any) => o.id)).toEqual([ids.os1]);

    expect((await tecnico.post(`/ordens/${ids.os1}/iniciar`)).dados.status).toBe('em_andamento');

    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
    const foto = await tecnico.req('PUT', `/ordens/${ids.os1}/fotos/foto-antes-0001?tipo=antes`, jpeg, { 'content-type': 'image/jpeg' });
    expect(foto.status).toBe(200);
    // reenvio (sincronização offline) não duplica
    await tecnico.req('PUT', `/ordens/${ids.os1}/fotos/foto-antes-0001?tipo=antes`, jpeg, { 'content-type': 'image/jpeg' });
    const ass = await tecnico.req('PUT', `/ordens/${ids.os1}/assinatura?nome=José`, new Uint8Array([0x89, 0x50, 0x4e, 0x47]), {
      'content-type': 'image/png',
    });
    expect(ass.status).toBe(200);

    const semDescricao = await tecnico.post(`/ordens/${ids.os1}/concluir`, { servico_executado: '' });
    expect(semDescricao.status).toBe(422);

    const fim = await tecnico.post(`/ordens/${ids.os1}/concluir`, {
      servico_executado: 'Desobstrução da pia e hidrojateamento do ramal.',
      forma_pagamento: 'Pix',
      pago: true,
    });
    expect(fim.status).toBe(200);
    expect(fim.dados.status).toBe('concluida');
    expect(fim.dados.fotos).toHaveLength(1);
    expect(fim.dados.assinatura_nome).toBe('José');
    expect(fim.dados.em_garantia).toBe(1);
    // garantia = maior prazo dos itens (90 dias)
    const esperado = new Date(Date.now() - 3 * 3600_000);
    esperado.setUTCDate(esperado.getUTCDate() + 90);
    expect(fim.dados.garantia_ate).toBe(esperado.toISOString().slice(0, 10));

    // arquivo da foto acessível
    const arq = await tecnico.get(`/arquivos/${fim.dados.fotos[0].r2_key}`);
    expect(arq.status).toBe(200);
  });

  it('técnico não acessa OS de outro técnico', async () => {
    const outra = await admin.post('/ordens', { cliente_id: ids.clienteCondominio, problema: 'Ralo', condominio_id: ids.condominio });
    ids.osSemTecnico = outra.dados.id;
    expect((await tecnico.get(`/ordens/${outra.dados.id}`)).status).toBe(403);
    const lista = await tecnico.get('/ordens');
    expect(lista.dados.itens.every((o: any) => o.tecnico_id === ids.tecnico)).toBe(true);
  });

  it('histórico na abertura avisa garantia e reincidência no mesmo endereço (mesmo escrito diferente)', async () => {
    const h = await admin.get(`/busca/historico?logradouro=${encodeURIComponent('Rua das Flôres')}&numero=45`);
    expect(h.dados.ordens).toHaveLength(1);
    expect(h.dados.em_garantia).toHaveLength(1);
    expect(h.dados.reincidencia).toMatchObject({ numero: 1 });
  });

  it('abre retorno em garantia sem cobrança e marca reincidência', async () => {
    const r = await admin.post('/ordens', {
      cliente_id: ids.cliente,
      logradouro: 'Rua das Flores',
      numero_endereco: '45',
      problema: 'Voltou a entupir',
      origem_id: ids.os1,
      retorno_garantia: true,
      itens: [{ servico_id: ids.servicoPia, descricao: 'Desentupimento de pia', quantidade: 1, valor_unitario: 150 }],
    });
    expect(r.status).toBe(201);
    expect(r.dados.valor_total).toBe(0);
    expect(r.dados.reincidencia).toBe(1);
    expect(r.dados.origem_numero).toBe(1);
    ids.osRetorno = r.dados.id;
    const orig = await admin.get(`/ordens/${ids.os1}`);
    expect(orig.dados.retornos).toHaveLength(1);
  });

  it('concluir retorno em garantia não estende a garantia original', async () => {
    const fim = await admin.post(`/ordens/${ids.osRetorno}/concluir`, { servico_executado: 'Refeito' });
    const orig = await admin.get(`/ordens/${ids.os1}`);
    expect(fim.dados.garantia_ate).toBe(orig.dados.garantia_ate);
  });

  it('cancela OS com motivo', async () => {
    expect((await admin.post(`/ordens/${ids.osSemTecnico}/cancelar`, {})).status).toBe(422);
    const r = await admin.post(`/ordens/${ids.osSemTecnico}/cancelar`, { motivo: 'Cliente desistiu' });
    expect(r.dados.status).toBe('cancelada');
  });
});

describe('busca de serviços antigos', () => {
  it('por cliente, sem acento', async () => {
    const r = await admin.get('/busca?q=jose&campo=cliente');
    expect(r.dados.clientes).toHaveLength(1);
    expect(r.dados.clientes[0].em_garantia).toBe(1);
    expect(r.dados.ordens.length).toBe(2);
  });

  it('por endereço com abreviação', async () => {
    const r = await admin.get('/busca?q=r flores 45&campo=endereco');
    expect(r.dados.ordens.length).toBe(2);
    expect(r.dados.ordens.some((o: any) => o.reincidencia === 1)).toBe(true);
  });

  it('por condomínio', async () => {
    const r = await admin.get('/busca?q=sao jorge&campo=condominio');
    expect(r.dados.condominios).toHaveLength(1);
    expect(r.dados.ordens).toHaveLength(1);
    expect(r.dados.clientes).toHaveLength(0);
  });

  it('por número da OS e somente em garantia', async () => {
    const r = await admin.get('/busca?q=entupir&garantia=1');
    expect(r.dados.ordens).toHaveLength(1);
  });

  it('esconde valores para o técnico', async () => {
    const r = await tecnico.get('/busca?q=flores');
    expect(r.dados.ordens.every((o: any) => o.valor_total === null)).toBe(true);
  });

  it('busca reflete mudança no nome do cliente', async () => {
    const c = await admin.get(`/clientes/${ids.cliente}`);
    await admin.put(`/clientes/${ids.cliente}`, { ...c.dados, nome: 'José Renomeado' });
    const r = await admin.get('/busca?q=renomeado&campo=cliente');
    expect(r.dados.ordens.length).toBe(2);
  });
});

describe('notas fiscais (registro)', () => {
  it('sugere dados a partir da OS, registra e lança emissão', async () => {
    const s = await admin.get(`/notas/sugestao/${ids.os1}`);
    expect(s.dados.valor_servicos).toBe(300);
    expect(s.dados.aliquota_iss).toBe(5);
    expect(s.dados.discriminacao).toContain('OS nº 1');
    const n = await admin.post('/notas', s.dados);
    expect(n.status).toBe(201);
    expect(n.dados.valor_iss).toBe(15);
    expect(n.dados.status).toBe('pendente');
    const dup = await admin.post('/notas', s.dados);
    expect(dup.status).toBe(409);
    const em = await admin.post(`/notas/${n.dados.id}/emitida`, { numero: '2026/123', codigo_verificacao: 'ABCD-1234', data_emissao: '2026-11-24' });
    expect(em.dados.status).toBe('emitida');
    // OS com nota emitida não pode ser cancelada
    expect((await admin.post(`/ordens/${ids.os1}/cancelar`, { motivo: 'x' })).status).toBe(422);
  });

  it('técnico não acessa notas', async () => {
    expect((await tecnico.get('/notas')).status).toBe(403);
  });

  it('painel mostra resumo', async () => {
    const r = await admin.get('/busca/painel');
    expect(r.dados.em_garantia).toBe(2);
    expect(r.dados.faturado_mes).toBe(300);
  });
});

describe('segurança de usuários', () => {
  it('não permite remover o último administrador', async () => {
    const eu = await admin.get('/auth/estado');
    const r = await admin.put(`/funcionarios/${eu.dados.usuario.id}`, { nome: 'Dono', perfil: 'tecnico', login: 'dono' });
    expect(r.status).toBe(422);
  });

  it('desativar técnico encerra a sessão dele', async () => {
    const f = await admin.get(`/funcionarios/${ids.tecnico}`);
    await admin.put(`/funcionarios/${ids.tecnico}`, { ...f.dados, ativo: 0 });
    expect((await tecnico.get('/ordens')).status).toBe(401);
  });
});

describe('edição parcial pelo técnico', () => {
  it('não apaga campos que não foram enviados', async () => {
    const t = new Cliente(amb.env);
    await admin.post('/funcionarios', { nome: 'Tec 2', perfil: 'tecnico', login: 'tec2', senha: 'tec12345' });
    await t.post('/auth/login', { login: 'tec2', senha: 'tec12345' });
    const eu = (await t.get('/auth/estado')).dados.usuario;
    const os = await admin.post('/ordens', {
      cliente_id: ids.cliente,
      tecnico_id: eu.id,
      local_servico: 'Banheiro',
      forma_pagamento: 'Dinheiro',
      itens: [{ descricao: 'Visita', valor_unitario: 80 }],
    });
    const r = await t.put(`/ordens/${os.dados.id}`, { servico_executado: 'Parcial' });
    expect(r.status).toBe(200);
    expect(r.dados.local_servico).toBe('Banheiro');
    expect(r.dados.forma_pagamento).toBe('Dinheiro');
    expect(r.dados.valor_total).toBe(80);
    // técnico não consegue trocar cliente/endereço (campos ignorados)
    const r2 = await t.put(`/ordens/${os.dados.id}`, { cliente_id: ids.clienteCondominio, servico_executado: 'X' });
    expect(r2.dados.cliente_id).toBe(ids.cliente);
  });
});
