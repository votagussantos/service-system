import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Descriptions,
  Divider,
  Drawer,
  Empty,
  Flex,
  Form,
  Input,
  InputNumber,
  List,
  Row,
  Segmented,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
} from 'antd';
import { CopyOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { STATUS_NOTA_LABEL, type StatusNota } from '../../shared/constantes';
import { api, qs } from '../api';
import { SelecaoRemota } from '../componentes/SelecaoRemota';
import { dataHora, dataSimples, dinheiro, hojeISO } from '../formato';
import { useAtraso, useCelular, useDados } from '../hooks';
import type { Cliente, Lista, NotaFiscal } from '../tipos';

const COR: Record<StatusNota, string> = { pendente: 'orange', emitida: 'green', cancelada: 'default' };

function Copiar({ texto }: { texto: string }) {
  const { message } = App.useApp();
  return (
    <Button
      size="small"
      type="text"
      icon={<CopyOutlined />}
      aria-label="Copiar"
      onClick={() => {
        void navigator.clipboard.writeText(texto);
        message.success('Copiado');
      }}
    />
  );
}

type Edicao = { modo: 'nova'; dados: Partial<NotaFiscal> } | { modo: 'ver'; nota: NotaFiscal };

export function PaginaNotas() {
  const nav = useNavigate();
  const celular = useCelular();
  const { message } = App.useApp();
  const [params, setParams] = useSearchParams();
  const [texto, setTexto] = useState('');
  const q = useAtraso(texto);
  const status = (params.get('status') as StatusNota | null) ?? '';
  const [edicao, setEdicao] = useState<Edicao | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [form] = Form.useForm();
  const [formEmissao] = Form.useForm();
  const [formCancelar] = Form.useForm();
  const { dados, carregando, recarregar } = useDados<Lista<NotaFiscal>>(`/notas${qs({ status, q, limite: 100 })}`);

  // Abertura a partir da OS (?nova_os=ID) ou de um link para a nota (?id=ID).
  useEffect(() => {
    const novaOs = params.get('nova_os');
    const idNota = params.get('id');
    if (novaOs) {
      api
        .get<Partial<NotaFiscal>>(`/notas/sugestao/${novaOs}`)
        .then((s) => abrirNova(s))
        .catch((e) => message.error(e.message));
    } else if (idNota) {
      api
        .get<NotaFiscal>(`/notas/${idNota}`)
        .then((n) => abrirVer(n))
        .catch((e) => message.error(e.message));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function abrirNova(d: Partial<NotaFiscal>) {
    form.resetFields();
    form.setFieldsValue({ competencia: hojeISO().slice(0, 7), deducoes: 0, ...d, iss_retido: !!d.iss_retido });
    setEdicao({ modo: 'nova', dados: d });
  }
  function abrirVer(n: NotaFiscal) {
    form.resetFields();
    form.setFieldsValue({ ...n, iss_retido: !!n.iss_retido });
    formEmissao.resetFields();
    formEmissao.setFieldsValue({ data_emissao: hojeISO(), serie: n.serie, numero: n.numero, codigo_verificacao: n.codigo_verificacao });
    setEdicao({ modo: 'ver', nota: n });
  }
  function fechar() {
    setEdicao(null);
    if (params.get('nova_os') || params.get('id')) {
      const p = new URLSearchParams(params);
      p.delete('nova_os');
      p.delete('id');
      setParams(p, { replace: true });
    }
  }

  const executar = async (fn: () => Promise<NotaFiscal>, ok: string, fecharDepois = false) => {
    setSalvando(true);
    try {
      const n = await fn();
      message.success(ok);
      void recarregar();
      if (fecharDepois) fechar();
      else abrirVer(n);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  const salvarDados = async () => {
    const v = await form.validateFields();
    const corpo = { ...v, ordem_id: edicao?.modo === 'nova' ? (edicao.dados.ordem_id ?? null) : edicao?.nota.ordem_id };
    if (edicao?.modo === 'nova') await executar(() => api.post<NotaFiscal>('/notas', corpo), 'Nota registrada como pendente de emissão.');
    else if (edicao?.modo === 'ver') await executar(() => api.put<NotaFiscal>(`/notas/${edicao.nota.id}`, corpo), 'Nota atualizada.');
  };

  const nota = edicao?.modo === 'ver' ? edicao.nota : null;
  const editavel = !nota || nota.status === 'pendente';
  const valorServ = Form.useWatch('valor_servicos', form) ?? 0;
  const deducoes = Form.useWatch('deducoes', form) ?? 0;
  const aliquota = Form.useWatch('aliquota_iss', form) ?? 0;
  const iss = Math.round(Math.max(0, valorServ - deducoes) * aliquota) / 100;

  return (
    <div>
      <Flex justify="space-between" align="center" wrap gap={8} style={{ marginBottom: 16 }}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          Notas fiscais de serviço
        </Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => abrirNova({})}>
          Nota avulsa
        </Button>
      </Flex>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        title="Emissão pelo portal da prefeitura"
        description="Gere a nota a partir da OS concluída, copie os dados para o portal da NFS-e, emita lá e depois registre aqui o número e o código de verificação."
      />
      <Flex gap={8} wrap style={{ marginBottom: 16 }}>
        <Segmented
          value={status}
          options={[
            { value: '', label: 'Todas' },
            { value: 'pendente', label: 'Pendentes' },
            { value: 'emitida', label: 'Emitidas' },
            { value: 'cancelada', label: 'Canceladas' },
          ]}
          onChange={(v) => {
            const p = new URLSearchParams(params);
            if (v) p.set('status', String(v));
            else p.delete('status');
            setParams(p, { replace: true });
          }}
        />
        <Input allowClear prefix={<SearchOutlined />} placeholder="Cliente, nº da nota ou da OS" value={texto} onChange={(e) => setTexto(e.target.value)} style={{ maxWidth: 320 }} />
      </Flex>

      {celular ? (
        <List
          loading={carregando}
          dataSource={dados?.itens ?? []}
          locale={{ emptyText: <Empty description="Nenhuma nota" /> }}
          renderItem={(n) => (
            <Card size="small" className="cartao-lista" hoverable onClick={() => abrirVer(n)}>
              <Flex justify="space-between">
                <div>
                  <div className="cartao-titulo">{n.cliente_nome}</div>
                  <div className="cartao-desc">
                    {n.numero ? `NFS-e ${n.numero}` : 'Sem número'} {n.ordem_numero ? `· OS ${n.ordem_numero}` : ''}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <b>{dinheiro(n.valor_servicos)}</b>
                  <div>
                    <Tag color={COR[n.status]}>{STATUS_NOTA_LABEL[n.status]}</Tag>
                  </div>
                </div>
              </Flex>
            </Card>
          )}
        />
      ) : (
        <Table<NotaFiscal>
          rowKey="id"
          loading={carregando}
          dataSource={dados?.itens ?? []}
          onRow={(n) => ({ onClick: () => abrirVer(n), style: { cursor: 'pointer' } })}
          pagination={{ pageSize: 50, hideOnSinglePage: true }}
          locale={{ emptyText: <Empty description="Nenhuma nota" /> }}
          columns={[
            { title: 'Nº NFS-e', dataIndex: 'numero', width: 110, render: (v) => v || '—' },
            { title: 'Cliente', dataIndex: 'cliente_nome', render: (v, n) => (<><b>{v}</b><div className="texto-fraco">{n.cliente_documento}</div></>) },
            { title: 'OS', dataIndex: 'ordem_numero', width: 80, render: (v, n) => (v ? <a onClick={(e) => { e.stopPropagation(); nav(`/ordens/${n.ordem_id}`); }}>#{v}</a> : '—') },
            { title: 'Competência', dataIndex: 'competencia', width: 110 },
            { title: 'Emissão', dataIndex: 'data_emissao', width: 110, render: dataSimples },
            { title: 'Valor', dataIndex: 'valor_servicos', width: 120, align: 'right', render: dinheiro },
            { title: 'ISS', dataIndex: 'valor_iss', width: 100, align: 'right', render: dinheiro },
            { title: 'Situação', dataIndex: 'status', width: 170, render: (s: StatusNota) => <Tag color={COR[s]}>{STATUS_NOTA_LABEL[s]}</Tag> },
          ]}
        />
      )}

      <Drawer
        open={!!edicao}
        onClose={fechar}
        size={celular ? '100%' : 720}
        destroyOnHidden
        title={nota ? `Nota ${nota.numero ? `nº ${nota.numero}` : `#${nota.id}`}` : 'Nova nota fiscal de serviço'}
        extra={nota && <Tag color={COR[nota.status]}>{STATUS_NOTA_LABEL[nota.status]}</Tag>}
      >
        <Form form={form} layout="vertical" disabled={!editavel}>
          <Form.Item name="cliente_id" label="Tomador (cliente)" rules={[{ required: true, message: 'Selecione o cliente' }]}>
            <SelecaoRemota<Cliente>
              endpoint="/clientes"
              rotulo={(c) => `${c.nome}${c.cpf_cnpj ? ` · ${c.cpf_cnpj}` : ''}`}
              rotuloInicial={nota ? `${nota.cliente_nome}${nota.cliente_documento ? ` · ${nota.cliente_documento}` : ''}` : undefined}
            />
          </Form.Item>
          <Row gutter={12}>
            <Col xs={12} md={8}>
              <Form.Item name="competencia" label="Competência" rules={[{ required: true, message: 'Informe' }]}>
                <Input type="month" />
              </Form.Item>
            </Col>
            <Col xs={12} md={8}>
              <Form.Item name="codigo_servico" label="Código do serviço">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="iss_retido" label="ISS retido pelo tomador" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item
            name="discriminacao"
            label={
              <Space>
                Discriminação dos serviços
                {nota && <Copiar texto={nota.discriminacao} />}
              </Space>
            }
            rules={[{ required: true, message: 'Informe a discriminação' }]}
          >
            <Input.TextArea rows={5} />
          </Form.Item>
          <Row gutter={12}>
            <Col xs={12} md={6}>
              <Form.Item name="valor_servicos" label="Valor dos serviços" rules={[{ required: true, message: 'Informe o valor' }]}>
                <InputNumber min={0} precision={2} decimalSeparator="," style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={12} md={6}>
              <Form.Item name="deducoes" label="Deduções">
                <InputNumber min={0} precision={2} decimalSeparator="," style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={12} md={6}>
              <Form.Item name="aliquota_iss" label="Alíquota ISS (%)">
                <InputNumber min={0} max={100} step={0.5} decimalSeparator="," style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={12} md={6}>
              <Form.Item label="Valor do ISS">
                <Input value={dinheiro(iss)} disabled />
              </Form.Item>
            </Col>
          </Row>
          {editavel && (
            <Button type="primary" loading={salvando} onClick={salvarDados} disabled={false}>
              {nota ? 'Salvar alterações' : 'Registrar nota (pendente)'}
            </Button>
          )}
        </Form>

        {nota?.status === 'pendente' && (
          <>
            <Divider />
            <Typography.Title level={5}>Registrar emissão</Typography.Title>
            <Typography.Paragraph type="secondary">Depois de emitir no portal da prefeitura, informe os dados da NFS-e gerada.</Typography.Paragraph>
            <Form
              form={formEmissao}
              layout="vertical"
              onFinish={(v) => executar(() => api.post<NotaFiscal>(`/notas/${nota.id}/emitida`, v), 'Emissão registrada.')}
            >
              <Row gutter={12}>
                <Col xs={12} md={6}>
                  <Form.Item name="numero" label="Número" rules={[{ required: true, message: 'Informe o número' }]}>
                    <Input />
                  </Form.Item>
                </Col>
                <Col xs={12} md={4}>
                  <Form.Item name="serie" label="Série">
                    <Input />
                  </Form.Item>
                </Col>
                <Col xs={12} md={8}>
                  <Form.Item name="codigo_verificacao" label="Código de verificação">
                    <Input />
                  </Form.Item>
                </Col>
                <Col xs={12} md={6}>
                  <Form.Item name="data_emissao" label="Data de emissão" rules={[{ required: true, message: 'Informe a data' }]}>
                    <Input type="date" />
                  </Form.Item>
                </Col>
              </Row>
              <Button type="primary" htmlType="submit" loading={salvando}>
                Marcar como emitida
              </Button>
            </Form>
          </>
        )}

        {nota?.status === 'emitida' && (
          <>
            <Divider />
            <Descriptions column={1} size="small">
              <Descriptions.Item label="Número">{nota.numero}{nota.serie ? ` / série ${nota.serie}` : ''}</Descriptions.Item>
              <Descriptions.Item label="Código de verificação">{nota.codigo_verificacao || '—'}</Descriptions.Item>
              <Descriptions.Item label="Emissão">{dataSimples(nota.data_emissao)}</Descriptions.Item>
              <Descriptions.Item label="Registrada em">{dataHora(nota.criado_em)}</Descriptions.Item>
            </Descriptions>
          </>
        )}

        {nota?.status === 'cancelada' && <Alert type="warning" title={`Cancelada: ${nota.motivo_cancelamento}`} style={{ marginTop: 16 }} />}

        {nota && nota.status !== 'cancelada' && (
          <>
            <Divider />
            <Form
              form={formCancelar}
              layout="inline"
              onFinish={(v) => executar(() => api.post<NotaFiscal>(`/notas/${nota.id}/cancelar`, v), 'Nota cancelada.', true)}
            >
              <Form.Item name="motivo" rules={[{ required: true, message: 'Informe o motivo' }]} style={{ flex: 1 }}>
                <Input placeholder={nota.status === 'emitida' ? 'Motivo (cancele também no portal da prefeitura)' : 'Motivo do cancelamento'} />
              </Form.Item>
              <Button danger htmlType="submit" loading={salvando}>
                Cancelar nota
              </Button>
            </Form>
          </>
        )}
        {nota?.ordem_id && (
          <Button type="link" style={{ marginTop: 16, padding: 0 }} onClick={() => nav(`/ordens/${nota.ordem_id}`)}>
            Ver OS nº {nota.ordem_numero}
          </Button>
        )}
      </Drawer>
    </div>
  );
}
