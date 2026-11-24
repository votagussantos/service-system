import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  App,
  Button,
  Card,
  Col,
  Descriptions,
  Dropdown,
  Empty,
  Flex,
  Form,
  Image,
  Input,
  Modal,
  Result,
  Row,
  Select,
  Skeleton,
  Space,
  Switch,
  Table,
  Tag,
  Timeline,
  Typography,
} from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  EditOutlined,
  EnvironmentOutlined,
  FileDoneOutlined,
  MoreOutlined,
  PhoneOutlined,
  PlayCircleOutlined,
  PrinterOutlined,
  RollbackOutlined,
  UndoOutlined,
  WhatsAppOutlined,
} from '@ant-design/icons';
import { FORMAS_PAGAMENTO, STATUS_NOTA_LABEL } from '../../shared/constantes';
import { api, urlArquivo } from '../api';
import { useAuth } from '../auth';
import { Selos } from '../componentes/Etiquetas';
import { GaleriaFotos } from '../componentes/Fotos';
import { dataHora, dataSimples, dinheiro, enderecoCompleto, linkMapa, linkWhatsApp } from '../formato';
import { useDados } from '../hooks';
import type { Ordem } from '../tipos';

export function PaginaOrdemDetalhe() {
  const { id } = useParams();
  const nav = useNavigate();
  const { pode } = useAuth();
  const { message, modal } = App.useApp();
  const { dados: o, carregando, erro, recarregar, setDados } = useDados<Ordem>(`/ordens/${id}`);
  const [concluindo, setConcluindo] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [formConcluir] = Form.useForm();
  const [formCancelar] = Form.useForm();
  const escritorio = pode('admin', 'atendente');

  if (erro) return <Result status="warning" title={erro} extra={<Button onClick={() => nav('/ordens')}>Voltar</Button>} />;
  if (!o) return <Skeleton active />;
  if (carregando && o.id !== Number(id)) return <Skeleton active />;

  const acao = async (fn: () => Promise<Ordem>, ok: string) => {
    try {
      setDados(await fn());
      message.success(ok);
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const telefone = o.contato_telefone || o.cliente.telefone;
  const textoWhats = `Olá! Aqui é da equipe de serviços. Sobre a OS nº ${o.numero}${o.data_agendada ? `, agendada para ${dataHora(o.data_agendada)}` : ''}.`;
  const aberta = ['aberta', 'agendada', 'em_andamento'].includes(o.status);
  const nota = o.notas.find((n) => n.status !== 'cancelada');

  const maisAcoes = [
    { key: 'imprimir', icon: <PrinterOutlined />, label: 'Imprimir / PDF' },
    ...(o.status === 'concluida' && o.em_garantia ? [{ key: 'retorno', icon: <RollbackOutlined />, label: 'Abrir retorno em garantia' }] : []),
    ...(o.status === 'concluida' ? [{ key: 'nova', icon: <RollbackOutlined />, label: 'Nova OS no mesmo local' }] : []),
    ...(escritorio && o.status === 'concluida' && !nota ? [{ key: 'nota', icon: <FileDoneOutlined />, label: 'Gerar nota fiscal' }] : []),
    ...(escritorio && aberta ? [{ key: 'cancelar', icon: <CloseCircleOutlined />, label: 'Cancelar OS', danger: true }] : []),
    ...(pode('admin') && !aberta ? [{ key: 'reabrir', icon: <UndoOutlined />, label: 'Reabrir OS' }] : []),
  ];

  const aoMais = ({ key }: { key: string }) => {
    if (key === 'imprimir') window.open(`/ordens/${o.id}/imprimir`, '_blank');
    if (key === 'retorno') nav(`/ordens/nova?origem_id=${o.id}&retorno=1`);
    if (key === 'nova') nav(`/ordens/nova?origem_id=${o.id}`);
    if (key === 'nota') nav(`/notas?nova_os=${o.id}`);
    if (key === 'cancelar') setCancelando(true);
    if (key === 'reabrir')
      modal.confirm({
        title: 'Reabrir esta OS?',
        content: 'A data de conclusão e a garantia serão apagadas até ela ser concluída de novo.',
        okText: 'Reabrir',
        onOk: () => acao(() => api.post<Ordem>(`/ordens/${o.id}/reabrir`), 'OS reaberta.'),
      });
  };

  return (
    <div style={{ maxWidth: 1100 }}>
      <Flex justify="space-between" align="start" gap={12} wrap style={{ marginBottom: 16 }}>
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            OS nº {o.numero}
          </Typography.Title>
          <div style={{ marginTop: 6 }}>
            <Selos o={o} />
          </div>
        </div>
        <Space wrap>
          {aberta && o.status !== 'em_andamento' && (
            <Button icon={<PlayCircleOutlined />} onClick={() => acao(() => api.post<Ordem>(`/ordens/${o.id}/iniciar`), 'Atendimento iniciado.')}>
              Iniciar
            </Button>
          )}
          {aberta && (
            <Button
              type="primary"
              icon={<CheckCircleOutlined />}
              onClick={() => {
                formConcluir.setFieldsValue({ servico_executado: o.servico_executado, forma_pagamento: o.forma_pagamento || undefined, pago: !!o.pago });
                setConcluindo(true);
              }}
            >
              Concluir
            </Button>
          )}
          {escritorio && (
            <Button icon={<EditOutlined />} onClick={() => nav(`/ordens/${o.id}/editar`)}>
              Editar
            </Button>
          )}
          <Dropdown menu={{ items: maisAcoes, onClick: aoMais }} trigger={['click']}>
            <Button icon={<MoreOutlined />}>Mais</Button>
          </Dropdown>
        </Space>
      </Flex>

      {o.status === 'cancelada' && (
        <Card size="small" style={{ marginBottom: 16, borderColor: '#ffccc7', background: '#fff2f0' }}>
          <b>Cancelada:</b> {o.motivo_cancelamento}
        </Card>
      )}

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={15}>
          <Card title="Cliente e local" size="small">
            <Descriptions column={1} size="small">
              <Descriptions.Item label="Cliente">
                <b>{o.cliente.nome}</b> {o.cliente.cpf_cnpj && <Typography.Text type="secondary">· {o.cliente.cpf_cnpj}</Typography.Text>}
              </Descriptions.Item>
              {o.condominio && (
                <Descriptions.Item label="Condomínio">
                  {o.condominio.nome}
                  {o.unidade ? ` · ${o.unidade}` : ''}
                  {o.condominio.zelador ? ` · Zelador: ${o.condominio.zelador}` : ''}
                </Descriptions.Item>
              )}
              <Descriptions.Item label="Endereço">
                <a href={linkMapa(o)} target="_blank" rel="noreferrer">
                  <EnvironmentOutlined /> {enderecoCompleto(o)}
                </a>
              </Descriptions.Item>
              <Descriptions.Item label="Contato">
                <Space wrap>
                  <span>{o.contato_nome || o.cliente.nome}</span>
                  {telefone && (
                    <>
                      <a href={`tel:${telefone.replace(/\D/g, '')}`}>
                        <PhoneOutlined /> {telefone}
                      </a>
                      <a href={linkWhatsApp(telefone, textoWhats)} target="_blank" rel="noreferrer" style={{ color: '#25D366' }}>
                        <WhatsAppOutlined /> WhatsApp
                      </a>
                    </>
                  )}
                </Space>
              </Descriptions.Item>
            </Descriptions>
          </Card>

          <Card title="Serviço" size="small" style={{ marginTop: 16 }}>
            <Descriptions column={1} size="small">
              {o.local_servico && <Descriptions.Item label="Onde">{o.local_servico}</Descriptions.Item>}
              <Descriptions.Item label="Problema relatado">{o.problema || '—'}</Descriptions.Item>
              <Descriptions.Item label="Serviço executado">
                <span style={{ whiteSpace: 'pre-wrap' }}>{o.servico_executado || '—'}</span>
              </Descriptions.Item>
              {o.origem_id && (
                <Descriptions.Item label="Origem">
                  <a onClick={() => nav(`/ordens/${o.origem_id}`)}>OS nº {o.origem_numero}</a>{' '}
                  {o.retorno_garantia ? ' (retorno em garantia)' : ''}
                </Descriptions.Item>
              )}
              {o.retornos.length > 0 && (
                <Descriptions.Item label="Retornos">
                  <Space wrap>
                    {o.retornos.map((r) => (
                      <Tag key={r.id} color={r.retorno_garantia ? 'cyan' : 'default'} style={{ cursor: 'pointer' }} onClick={() => nav(`/ordens/${r.id}`)}>
                        OS {r.numero} · {dataSimples(r.criado_em)}
                      </Tag>
                    ))}
                  </Space>
                </Descriptions.Item>
              )}
              {escritorio && o.observacoes_internas && (
                <Descriptions.Item label="Obs. internas">
                  <span style={{ whiteSpace: 'pre-wrap' }}>{o.observacoes_internas}</span>
                </Descriptions.Item>
              )}
            </Descriptions>
          </Card>

          <Card title="Itens e valores" size="small" style={{ marginTop: 16 }}>
            {o.itens.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nenhum item lançado" />
            ) : (
              <Table
                size="small"
                rowKey={(i) => String(i.id)}
                pagination={false}
                dataSource={o.itens}
                scroll={{ x: true }}
                columns={[
                  { title: 'Descrição', dataIndex: 'descricao' },
                  { title: 'Qtd.', render: (_, i) => `${i.quantidade} ${i.unidade}`, width: 90 },
                  { title: 'Unit.', dataIndex: 'valor_unitario', render: dinheiro, width: 110, align: 'right' },
                  { title: 'Total', render: (_, i) => dinheiro(i.quantidade * i.valor_unitario), width: 110, align: 'right' },
                  { title: 'Garantia', dataIndex: 'garantia_dias', render: (d) => (d === null ? 'padrão' : `${d} d`), width: 90, responsive: ['md'] },
                ]}
              />
            )}
            <Flex justify="end" style={{ marginTop: 12 }}>
              <div style={{ textAlign: 'right' }}>
                <div>Subtotal: {dinheiro(o.valor_servicos)}</div>
                {o.desconto > 0 && <div>Desconto: −{dinheiro(o.desconto)}</div>}
                <div style={{ fontSize: 20, fontWeight: 700 }}>Total: {dinheiro(o.valor_total)}</div>
                <div>
                  {o.forma_pagamento || 'Pagamento não definido'} · {o.pago ? <Tag color="green">Pago</Tag> : <Tag color="orange">A receber</Tag>}
                </div>
              </div>
            </Flex>
          </Card>

          <Card title="Fotos" size="small" style={{ marginTop: 16 }}>
            <GaleriaFotos ordem={o} podeEnviar={o.status !== 'cancelada'} aoMudar={recarregar} />
          </Card>
        </Col>

        <Col xs={24} lg={9}>
          <Card title="Equipe e datas" size="small">
            <Descriptions column={1} size="small">
              <Descriptions.Item label="Técnico">{o.tecnico_nome ?? <Typography.Text type="danger">não definido</Typography.Text>}</Descriptions.Item>
              {o.ajudante_nome && <Descriptions.Item label="Ajudante">{o.ajudante_nome}</Descriptions.Item>}
              {o.veiculo_placa && (
                <Descriptions.Item label="Veículo">
                  {o.veiculo_placa} {o.veiculo_modelo}
                </Descriptions.Item>
              )}
            </Descriptions>
            <Timeline
              style={{ marginTop: 16 }}
              items={[
                { content: `Aberta ${dataHora(o.criado_em)}${o.criado_por_nome ? ` por ${o.criado_por_nome}` : ''}` },
                ...(o.data_agendada ? [{ color: 'purple', content: `Agendada para ${dataHora(o.data_agendada)}` }] : []),
                ...(o.iniciada_em ? [{ color: 'orange', content: `Iniciada ${dataHora(o.iniciada_em)}` }] : []),
                ...(o.concluida_em ? [{ color: 'green', content: `Concluída ${dataHora(o.concluida_em)}` }] : []),
                ...(o.garantia_ate
                  ? [{ color: o.em_garantia ? 'green' : 'gray', content: `Garantia até ${dataSimples(o.garantia_ate)}${o.em_garantia ? '' : ' (vencida)'}` }]
                  : []),
              ]}
            />
          </Card>

          {(o.assinatura_key || o.assinatura_nome) && (
            <Card title="Assinatura do cliente" size="small" style={{ marginTop: 16 }}>
              {o.assinatura_key && <Image src={urlArquivo(o.assinatura_key)} alt="Assinatura" style={{ maxHeight: 120, background: '#fff' }} />}
              <div>{o.assinatura_nome}</div>
            </Card>
          )}

          {escritorio && (
            <Card title="Nota fiscal" size="small" style={{ marginTop: 16 }}>
              {o.notas.length === 0 ? (
                o.status === 'concluida' && o.valor_total > 0 ? (
                  <Button icon={<FileDoneOutlined />} onClick={() => nav(`/notas?nova_os=${o.id}`)}>
                    Gerar nota fiscal
                  </Button>
                ) : (
                  <Typography.Text type="secondary">Disponível após a conclusão.</Typography.Text>
                )
              ) : (
                o.notas.map((n) => (
                  <div key={n.id}>
                    <a onClick={() => nav(`/notas?id=${n.id}`)}>
                      {n.numero ? `NFS-e ${n.numero}` : `Nota #${n.id}`}
                    </a>{' '}
                    <Tag color={n.status === 'emitida' ? 'green' : n.status === 'pendente' ? 'orange' : 'default'}>{STATUS_NOTA_LABEL[n.status]}</Tag>
                  </div>
                ))
              )}
            </Card>
          )}
        </Col>
      </Row>

      <Modal
        open={concluindo}
        title={`Concluir OS nº ${o.numero}`}
        okText="Concluir"
        onCancel={() => setConcluindo(false)}
        forceRender
        onOk={async () => {
          const v = await formConcluir.validateFields();
          await acao(() => api.post<Ordem>(`/ordens/${o.id}/concluir`, v), 'OS concluída.');
          setConcluindo(false);
        }}
      >
        <Form form={formConcluir} layout="vertical">
          <Form.Item name="servico_executado" label="Serviço executado" rules={[{ required: true, message: 'Descreva o serviço executado' }]}>
            <Input.TextArea rows={4} />
          </Form.Item>
          <Row gutter={12}>
            <Col span={16}>
              <Form.Item name="forma_pagamento" label="Forma de pagamento">
                <Select allowClear options={FORMAS_PAGAMENTO.map((f) => ({ value: f, label: f }))} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="pago" label="Pago" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      <Modal
        open={cancelando}
        title={`Cancelar OS nº ${o.numero}`}
        okText="Cancelar OS"
        okButtonProps={{ danger: true }}
        cancelText="Voltar"
        onCancel={() => setCancelando(false)}
        forceRender
        onOk={async () => {
          const v = await formCancelar.validateFields();
          await acao(() => api.post<Ordem>(`/ordens/${o.id}/cancelar`, v), 'OS cancelada.');
          setCancelando(false);
        }}
      >
        <Form form={formCancelar} layout="vertical">
          <Form.Item name="motivo" label="Motivo" rules={[{ required: true, message: 'Informe o motivo' }]}>
            <Input.TextArea rows={3} placeholder="Ex.: cliente desistiu, resolveu sozinho, duplicada" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
