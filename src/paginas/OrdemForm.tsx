import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Divider,
  Drawer,
  Flex,
  Form,
  Input,
  InputNumber,
  Row,
  Segmented,
  Select,
  Skeleton,
  Space,
  Switch,
  Typography,
} from 'antd';
import { DeleteOutlined, PlusOutlined, RollbackOutlined, SaveOutlined, UserAddOutlined } from '@ant-design/icons';
import { FORMAS_PAGAMENTO, UNIDADES } from '../../shared/constantes';
import { api, qs } from '../api';
import { CamposEndereco } from '../componentes/Endereco';
import { SelecaoRemota } from '../componentes/SelecaoRemota';
import { dataSimples, dayjs, dinheiro, enderecoCurto, mascaraDocumento, mascaraTelefone } from '../formato';
import { useAtraso, useCelular, useDados } from '../hooks';
import type { Cliente, Condominio, Funcionario, ItemOS, Lista, Ordem, OrdemResumo, Preco, Veiculo } from '../tipos';

interface Historico {
  ordens: OrdemResumo[];
  em_garantia: OrdemResumo[];
  reincidencia: { id: number; numero: number; concluida_em: string; garantia_ate: string | null } | null;
  condominio: OrdemResumo[];
  dias_reincidencia: number;
}

/** Aviso de histórico: cliente já atendido, serviço em garantia ou reincidência. */
function AlertaHistorico({
  filtro,
  idAtual,
  origemId,
  onUsarGarantia,
}: {
  filtro: Record<string, string | number | undefined | null>;
  idAtual?: number;
  origemId?: number | null;
  onUsarGarantia: (o: OrdemResumo) => void;
}) {
  const f = useAtraso(filtro, 500);
  const temFiltro = !!(f.cliente_id || f.condominio_id || (f.logradouro && f.numero));
  const { dados } = useDados<Historico>(temFiltro ? `/busca/historico${qs({ ...f, ignorar_id: idAtual })}` : null);
  const nav = useNavigate();
  if (!temFiltro || !dados) return null;
  const { ordens, em_garantia, reincidencia, condominio } = dados;
  if (!ordens.length && !condominio.length) {
    return <Alert type="success" showIcon title="Primeiro atendimento neste cliente/endereço." style={{ marginBottom: 16 }} />;
  }
  const abrir = (id: number) => window.open(`/ordens/${id}`, '_blank');
  return (
    <Space orientation="vertical" style={{ width: '100%', marginBottom: 16 }}>
      {em_garantia.map((o) => (
        <Alert
          key={o.id}
          type="warning"
          showIcon
          title={`Em garantia: OS nº ${o.numero} (${dataSimples(o.concluida_em)}) — garantia até ${dataSimples(o.garantia_ate)}`}
          description={`${o.problema || 'Sem descrição'} · ${enderecoCurto(o)}`}
          action={
            origemId === o.id ? (
              <Typography.Text type="success">Vinculada</Typography.Text>
            ) : (
              <Button size="small" type="primary" icon={<RollbackOutlined />} onClick={() => onUsarGarantia(o)}>
                É retorno em garantia
              </Button>
            )
          }
        />
      ))}
      {reincidencia && !em_garantia.some((o) => o.id === reincidencia.id) && (
        <Alert
          type="error"
          showIcon
          title={`Reincidência: serviço concluído aqui ${dayjs(reincidencia.concluida_em).fromNow()} (OS nº ${reincidencia.numero}).`}
          description={`Chamado dentro da janela de ${dados.dias_reincidencia} dias. Verifique a causa antes de cobrar.`}
          action={
            <Button size="small" onClick={() => abrir(reincidencia.id)}>
              Ver OS
            </Button>
          }
        />
      )}
      {ordens.length > 0 && (
        <Alert
          type="info"
          showIcon
          title={`Cliente/endereço já atendido ${ordens.length} vez(es).`}
          description={
            <Space orientation="vertical" size={2}>
              {ordens.slice(0, 5).map((o) => (
                <a key={o.id} onClick={() => abrir(o.id)}>
                  OS {o.numero} · {dataSimples(o.concluida_em ?? o.criado_em)} · {o.problema || 'sem descrição'} {o.status !== 'concluida' ? `(${o.status.replace('_', ' ')})` : ''}
                </a>
              ))}
              {ordens.length > 5 && <a onClick={() => nav(`/busca${qs({ q: String(f.logradouro ?? '') })}`)}>ver todas…</a>}
            </Space>
          }
        />
      )}
      {condominio.length > 0 && (
        <Alert
          type="info"
          title={`Outras ${condominio.length} OS recentes neste condomínio (outras unidades).`}
          description={condominio
            .slice(0, 3)
            .map((o) => `OS ${o.numero} · ${o.unidade || 'área comum'} · ${dataSimples(o.criado_em)}`)
            .join('  |  ')}
        />
      )}
    </Space>
  );
}

/** Cadastro rápido de cliente sem sair da OS. */
function NovoClienteRapido({ aberto, onFechar, onCriado }: { aberto: boolean; onFechar: () => void; onCriado: (c: Cliente) => void }) {
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const celular = useCelular();
  const [salvando, setSalvando] = useState(false);
  return (
    <Drawer
      open={aberto}
      onClose={onFechar}
      title="Novo cliente"
      size={celular ? '100%' : 640}
      destroyOnHidden
      footer={
        <Flex justify="end" gap={8}>
          <Button onClick={onFechar}>Cancelar</Button>
          <Button
            type="primary"
            loading={salvando}
            onClick={async () => {
              const v = await form.validateFields();
              setSalvando(true);
              try {
                const c = await api.post<Cliente>('/clientes', { ...v, condominio_id: v.condominio_id ?? null });
                message.success('Cliente cadastrado.');
                onCriado(c);
              } catch (e) {
                message.error((e as Error).message);
              } finally {
                setSalvando(false);
              }
            }}
          >
            Salvar cliente
          </Button>
        </Flex>
      }
    >
      <Form form={form} layout="vertical" initialValues={{ tipo: 'PF' }}>
        <Form.Item name="tipo">
          <Segmented options={[{ value: 'PF', label: 'Pessoa física' }, { value: 'PJ', label: 'Empresa / Condomínio' }]} />
        </Form.Item>
        <Row gutter={12}>
          <Col xs={24} md={14}>
            <Form.Item name="nome" label="Nome" rules={[{ required: true, message: 'Informe o nome' }]}>
              <Input autoFocus />
            </Form.Item>
          </Col>
          <Col xs={24} md={10}>
            <Form.Item name="telefone" label="Telefone / WhatsApp" normalize={mascaraTelefone}>
              <Input inputMode="tel" />
            </Form.Item>
          </Col>
          <Col xs={24} md={10}>
            <Form.Item name="cpf_cnpj" label="CPF / CNPJ" normalize={mascaraDocumento}>
              <Input inputMode="numeric" />
            </Form.Item>
          </Col>
          <Col xs={24} md={14}>
            <Form.Item name="condominio_id" label="Condomínio">
              <SelecaoRemota<Condominio>
                endpoint="/condominios"
                allowClear
                rotulo={(c) => c.nome}
                descricao={(c) => enderecoCurto(c)}
                onChange={(_, c) => c && form.setFieldsValue({ cep: c.cep, logradouro: c.logradouro, numero: c.numero, bairro: c.bairro, cidade: c.cidade, uf: c.uf })}
              />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="unidade" label="Unidade (apto/bloco)">
          <Input />
        </Form.Item>
        <CamposEndereco form={form} />
      </Form>
    </Drawer>
  );
}

function paraLocal(iso: string | null | undefined): string {
  return iso ? dayjs(iso).format('YYYY-MM-DDTHH:mm') : '';
}

export function PaginaOrdemForm() {
  const { id } = useParams();
  const editando = id ? Number(id) : undefined;
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [salvando, setSalvando] = useState(false);
  const [novoCliente, setNovoCliente] = useState(false);
  const [rotulos, setRotulos] = useState<Record<string, string>>({});
  const { dados: ordem, carregando } = useDados<Ordem>(editando ? `/ordens/${editando}` : null);
  const { dados: precos } = useDados<Lista<Preco>>('/precos?ativos=1&limite=500');

  // Valores observados para o alerta de histórico e o total.
  const clienteId = Form.useWatch('cliente_id', form);
  const condominioId = Form.useWatch('condominio_id', form);
  const logradouro = Form.useWatch('logradouro', form);
  const numero = Form.useWatch('numero_endereco', form);
  const unidade = Form.useWatch('unidade', form);
  const complemento = Form.useWatch('complemento', form);
  const origemId = Form.useWatch('origem_id', form);
  const retorno = Form.useWatch('retorno_garantia', form);
  const itens: ItemOS[] = Form.useWatch('itens', form) ?? [];
  const desconto: number = Form.useWatch('desconto', form) ?? 0;
  const subtotal = itens.reduce((s, i) => s + (Number(i?.quantidade) || 0) * (Number(i?.valor_unitario) || 0), 0);
  const total = retorno ? 0 : Math.max(0, subtotal - (desconto || 0));

  const filtroHistorico = useMemo(
    () => ({ cliente_id: clienteId, condominio_id: condominioId, logradouro, numero, unidade: unidade || complemento }),
    [clienteId, condominioId, logradouro, numero, unidade, complemento],
  );

  // Carrega OS para edição.
  useEffect(() => {
    if (!ordem) return;
    form.setFieldsValue({ ...ordem, data_agendada: paraLocal(ordem.data_agendada), retorno_garantia: !!ordem.retorno_garantia, pago: !!ordem.pago });
    setRotulos({
      cliente: ordem.cliente.nome,
      condominio: ordem.condominio?.nome ?? '',
      tecnico: ordem.tecnico_nome ?? '',
      ajudante: ordem.ajudante_nome ?? '',
      veiculo: ordem.veiculo_placa ?? '',
    });
  }, [ordem, form]);

  // Nova OS: dados vindos da URL (cliente, condomínio ou retorno em garantia).
  useEffect(() => {
    if (editando) return;
    const cid = Number(params.get('cliente_id'));
    const cdid = Number(params.get('condominio_id'));
    const orig = Number(params.get('origem_id'));
    (async () => {
      if (orig) {
        const o = await api.get<Ordem>(`/ordens/${orig}`);
        usarOrdemOrigem(o, params.get('retorno') === '1');
      } else if (cid) {
        const c = await api.get<Cliente>(`/clientes/${cid}`);
        selecionarCliente(c);
      } else if (cdid) {
        const c = await api.get<Condominio>(`/condominios/${cdid}`);
        form.setFieldsValue({ condominio_id: c.id, cep: c.cep, logradouro: c.logradouro, numero_endereco: c.numero, bairro: c.bairro, cidade: c.cidade, uf: c.uf });
        setRotulos((r) => ({ ...r, condominio: c.nome }));
      }
    })().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function selecionarCliente(c: Cliente) {
    setRotulos((r) => ({ ...r, cliente: c.nome, condominio: c.condominio_nome ?? r.condominio }));
    const atual = form.getFieldsValue();
    const semEndereco = !atual.logradouro;
    form.setFieldsValue({
      cliente_id: c.id,
      contato_nome: atual.contato_nome || c.nome,
      contato_telefone: atual.contato_telefone || c.telefone,
      ...(semEndereco
        ? {
            condominio_id: c.condominio_id,
            unidade: c.unidade,
            cep: c.cep,
            logradouro: c.logradouro,
            numero_endereco: c.numero,
            complemento: c.complemento,
            bairro: c.bairro,
            cidade: c.cidade,
            uf: c.uf,
          }
        : {}),
    });
  }

  function usarOrdemOrigem(o: Ordem | OrdemResumo, retornoGarantia: boolean) {
    const nomeCliente = 'cliente' in o ? o.cliente.nome : o.cliente_nome;
    const nomeCond = 'condominio' in o ? o.condominio?.nome : o.condominio_nome;
    setRotulos((r) => ({ ...r, cliente: nomeCliente, condominio: nomeCond ?? '' }));
    form.setFieldsValue({
      origem_id: o.id,
      retorno_garantia: retornoGarantia,
      cliente_id: o.cliente_id,
      condominio_id: o.condominio_id,
      unidade: o.unidade,
      cep: o.cep,
      logradouro: o.logradouro,
      numero_endereco: o.numero_endereco,
      complemento: o.complemento,
      bairro: o.bairro,
      cidade: o.cidade,
      uf: o.uf,
      local_servico: o.local_servico,
      ...('contato_nome' in o ? { contato_nome: o.contato_nome, contato_telefone: o.contato_telefone } : {}),
    });
    setRotulos((r) => ({ ...r, origem: `OS nº ${o.numero}` }));
  }

  const adicionarPreco = (precoId: number, add: (v: ItemOS) => void) => {
    const p = precos?.itens.find((x) => x.id === precoId);
    if (!p) return;
    add({
      servico_id: p.servico_id,
      preco_id: p.id,
      descricao: [p.servico_nome, p.descricao].filter(Boolean).join(' - '),
      unidade: p.unidade,
      quantidade: 1,
      valor_unitario: p.valor,
    });
  };

  const salvar = async () => {
    let v: Record<string, unknown>;
    try {
      v = await form.validateFields();
    } catch {
      message.warning('Confira os campos destacados.');
      return;
    }
    const corpo = {
      ...v,
      data_agendada: v.data_agendada ? dayjs(v.data_agendada as string).toISOString() : null,
      itens: ((v.itens as ItemOS[]) ?? []).filter((i) => i?.descricao),
      condominio_id: v.condominio_id ?? null,
      tecnico_id: v.tecnico_id ?? null,
      ajudante_id: v.ajudante_id ?? null,
      veiculo_id: v.veiculo_id ?? null,
      origem_id: v.origem_id ?? null,
      desconto: v.desconto ?? 0,
    };
    setSalvando(true);
    try {
      const r = editando ? await api.put<Ordem>(`/ordens/${editando}`, corpo) : await api.post<Ordem>('/ordens', corpo);
      message.success(editando ? 'OS atualizada.' : `OS nº ${r.numero} aberta.`);
      nav(`/ordens/${r.id}`, { replace: true });
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  if (editando && carregando && !ordem) return <Skeleton active />;

  return (
    <div style={{ maxWidth: 1000 }}>
      <Typography.Title level={3}>{editando ? `Editar OS nº ${ordem?.numero ?? ''}` : 'Nova ordem de serviço'}</Typography.Title>
      <Form
        form={form}
        layout="vertical"
        requiredMark="optional"
        initialValues={{ prioridade: 'normal', itens: [], desconto: 0, pago: false, retorno_garantia: false }}
        onFinish={salvar}
      >
        <Form.Item name="origem_id" hidden>
          <Input />
        </Form.Item>

        <Card title="Cliente e local" style={{ marginBottom: 16 }}>
          <Row gutter={12}>
            <Col xs={24} md={16}>
              <Form.Item label="Cliente" required>
                <Space.Compact style={{ width: '100%' }}>
                  <Form.Item name="cliente_id" noStyle rules={[{ required: true, message: 'Selecione o cliente' }]}>
                    <SelecaoRemota<Cliente>
                      endpoint="/clientes"
                      placeholder="Nome, telefone, CPF ou endereço..."
                      size="large"
                      style={{ width: '100%' }}
                      rotulo={(c) => c.nome}
                      descricao={(c) => [c.telefone, enderecoCurto(c), c.condominio_nome].filter(Boolean).join(' · ')}
                      rotuloInicial={rotulos.cliente}
                      onChange={(_, c) => c && selecionarCliente(c)}
                    />
                  </Form.Item>
                  <Button size="large" icon={<UserAddOutlined />} onClick={() => setNovoCliente(true)} title="Cadastrar cliente novo">
                    Novo
                  </Button>
                </Space.Compact>
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="prioridade" label="Prioridade">
                <Segmented block options={[{ value: 'normal', label: 'Normal' }, { value: 'urgente', label: 'Urgente' }]} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="contato_nome" label="Contato no local">
                <Input placeholder="Quem vai receber o técnico" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="contato_telefone" label="Telefone do contato" normalize={mascaraTelefone}>
                <Input inputMode="tel" />
              </Form.Item>
            </Col>
            <Col xs={24} md={16}>
              <Form.Item name="condominio_id" label="Condomínio">
                <SelecaoRemota<Condominio>
                  endpoint="/condominios"
                  allowClear
                  placeholder="Se o serviço for em condomínio"
                  rotulo={(c) => c.nome}
                  descricao={(c) => enderecoCurto(c)}
                  rotuloInicial={rotulos.condominio || undefined}
                  onChange={(_, c) => {
                    if (c) {
                      setRotulos((r) => ({ ...r, condominio: c.nome }));
                      form.setFieldsValue({ cep: c.cep, logradouro: c.logradouro, numero_endereco: c.numero, bairro: c.bairro, cidade: c.cidade, uf: c.uf });
                    }
                  }}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="unidade" label="Unidade (apto/bloco) ou área">
                <Input placeholder="Ex.: Bl. A apto 31, área comum" />
              </Form.Item>
            </Col>
          </Row>
          <CamposEndereco form={form} campoNumero="numero_endereco" />
        </Card>

        <AlertaHistorico
          filtro={filtroHistorico}
          idAtual={editando}
          origemId={origemId}
          onUsarGarantia={(o) => {
            usarOrdemOrigem(o, true);
            message.info(`Vinculada à OS nº ${o.numero} como retorno em garantia (sem cobrança).`);
          }}
        />

        {origemId && (
          <Alert
            type={retorno ? 'warning' : 'info'}
            showIcon
            style={{ marginBottom: 16 }}
            title={
              <Flex justify="space-between" align="center" wrap gap={8}>
                <span>
                  Vinculada à {rotulos.origem ?? `OS de origem`}
                  {retorno ? ' — retorno em garantia (valor zerado)' : ' — novo atendimento cobrado'}
                </span>
                <Space>
                  <span>Retorno em garantia</span>
                  <Form.Item name="retorno_garantia" valuePropName="checked" noStyle>
                    <Switch />
                  </Form.Item>
                  <Button size="small" onClick={() => form.setFieldsValue({ origem_id: null, retorno_garantia: false })}>
                    Desvincular
                  </Button>
                </Space>
              </Flex>
            }
          />
        )}

        <Card title="Serviço solicitado" style={{ marginBottom: 16 }}>
          <Row gutter={12}>
            <Col xs={24} md={8}>
              <Form.Item name="local_servico" label="Onde (no imóvel)">
                <Input placeholder="Cozinha, banheiro, caixa de gordura..." />
              </Form.Item>
            </Col>
            <Col xs={24} md={16}>
              <Form.Item name="problema" label="Problema relatado" rules={[{ required: true, message: 'Descreva o problema' }]}>
                <Input.TextArea rows={2} placeholder="Ex.: pia da cozinha entupida, água voltando pelo ralo" />
              </Form.Item>
            </Col>
          </Row>
        </Card>

        <Card title="Agendamento e equipe" style={{ marginBottom: 16 }}>
          <Row gutter={12}>
            <Col xs={24} md={8}>
              <Form.Item name="data_agendada" label="Data e hora">
                <Input type="datetime-local" />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="tecnico_id" label="Técnico">
                <SelecaoRemota<Funcionario> endpoint="/funcionarios" extra={{ ativos: 1 }} allowClear rotulo={(f) => f.nome} descricao={(f) => f.cargo} rotuloInicial={rotulos.tecnico || undefined} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="ajudante_id" label="Ajudante">
                <SelecaoRemota<Funcionario> endpoint="/funcionarios" extra={{ ativos: 1 }} allowClear rotulo={(f) => f.nome} descricao={(f) => f.cargo} rotuloInicial={rotulos.ajudante || undefined} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="veiculo_id" label="Veículo">
                <SelecaoRemota<Veiculo>
                  endpoint="/veiculos"
                  extra={{ ativos: 1 }}
                  allowClear
                  rotulo={(v) => `${v.placa} · ${v.modelo}`}
                  descricao={(v) => v.tipo}
                  rotuloInicial={rotulos.veiculo || undefined}
                />
              </Form.Item>
            </Col>
          </Row>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Com data e técnico definidos, a OS fica como “Agendada” e aparece no celular do técnico.
          </Typography.Text>
        </Card>

        <Card title="Serviços e valores" style={{ marginBottom: 16 }}>
          <Form.List name="itens">
            {(campos, { add, remove }) => (
              <>
                {campos.map(({ key, name }) => (
                  <Row gutter={8} key={key} align="bottom" className="linha-tracejada">
                    <Form.Item name={[name, 'servico_id']} hidden>
                      <Input />
                    </Form.Item>
                    <Form.Item name={[name, 'preco_id']} hidden>
                      <Input />
                    </Form.Item>
                    <Col xs={24} md={10}>
                      <Form.Item name={[name, 'descricao']} label="Descrição" rules={[{ required: true, message: 'Descrição' }]} style={{ marginBottom: 0 }}>
                        <Input />
                      </Form.Item>
                    </Col>
                    <Col xs={7} md={3}>
                      <Form.Item name={[name, 'quantidade']} label="Qtd." style={{ marginBottom: 0 }}>
                        <InputNumber min={0.01} style={{ width: '100%' }} decimalSeparator="," />
                      </Form.Item>
                    </Col>
                    <Col xs={7} md={3}>
                      <Form.Item name={[name, 'unidade']} label="Un." style={{ marginBottom: 0 }}>
                        <Select options={UNIDADES.map((u) => ({ value: u, label: u }))} />
                      </Form.Item>
                    </Col>
                    <Col xs={10} md={4}>
                      <Form.Item name={[name, 'valor_unitario']} label="Valor unit." style={{ marginBottom: 0 }}>
                        <InputNumber min={0} precision={2} decimalSeparator="," style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                    <Col xs={18} md={3} style={{ textAlign: 'right', paddingBottom: 6 }}>
                      <b>{dinheiro((Number(itens[name]?.quantidade) || 0) * (Number(itens[name]?.valor_unitario) || 0))}</b>
                    </Col>
                    <Col xs={6} md={1} style={{ textAlign: 'right' }}>
                      <Button type="text" danger icon={<DeleteOutlined />} onClick={() => remove(name)} aria-label="Remover item" />
                    </Col>
                  </Row>
                ))}
                <Flex gap={8} wrap style={{ marginTop: 8 }}>
                  <Select
                    showSearch={{ optionFilterProp: 'label' }}
                    placeholder="+ Adicionar da tabela de preços"
                    style={{ flex: 1, minWidth: 240 }}
                    value={null}
                    options={(precos?.itens ?? []).map((p) => ({
                      value: p.id,
                      label: `${p.servico_nome}${p.descricao ? ` - ${p.descricao}` : ''} · ${dinheiro(p.valor)}/${p.unidade}`,
                    }))}
                    onChange={(v) => v && adicionarPreco(v, add)}
                  />
                  <Button icon={<PlusOutlined />} onClick={() => add({ descricao: '', unidade: 'un', quantidade: 1, valor_unitario: 0 })}>
                    Item avulso
                  </Button>
                </Flex>
              </>
            )}
          </Form.List>
          <Divider />
          <Row gutter={12} align="middle">
            <Col xs={12} md={6}>
              <Form.Item name="desconto" label="Desconto (R$)">
                <InputNumber min={0} precision={2} decimalSeparator="," style={{ width: '100%' }} disabled={!!retorno} />
              </Form.Item>
            </Col>
            <Col xs={12} md={6}>
              <Form.Item name="forma_pagamento" label="Forma de pagamento">
                <Select allowClear options={FORMAS_PAGAMENTO.map((f) => ({ value: f, label: f }))} />
              </Form.Item>
            </Col>
            <Col xs={12} md={4}>
              <Form.Item name="pago" label="Pago" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
            <Col xs={12} md={8} style={{ textAlign: 'right' }}>
              <div className="texto-sec">Subtotal {dinheiro(subtotal)}</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>Total {dinheiro(total)}</div>
              {!!retorno && <Typography.Text type="warning">Retorno em garantia: sem cobrança</Typography.Text>}
            </Col>
          </Row>
        </Card>

        <Card title="Observações internas" style={{ marginBottom: 16 }}>
          <Form.Item name="observacoes_internas" style={{ marginBottom: 0 }}>
            <Input.TextArea rows={2} placeholder="Visível só para a equipe (não sai na impressão)" />
          </Form.Item>
          {editando && (
            <Form.Item name="servico_executado" label="Serviço executado" style={{ marginTop: 12, marginBottom: 0 }}>
              <Input.TextArea rows={3} />
            </Form.Item>
          )}
        </Card>

        <Flex gap={8} justify="end" className="acoes-form">
          <Button size="large" onClick={() => nav(-1)}>
            Cancelar
          </Button>
          <Button size="large" type="primary" icon={<SaveOutlined />} loading={salvando} htmlType="submit">
            {editando ? 'Salvar alterações' : 'Abrir OS'}
          </Button>
        </Flex>
      </Form>

      <NovoClienteRapido
        aberto={novoCliente}
        onFechar={() => setNovoCliente(false)}
        onCriado={(c) => {
          setNovoCliente(false);
          form.setFieldsValue({ logradouro: undefined });
          selecionarCliente(c);
        }}
      />
    </div>
  );
}
