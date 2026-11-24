import { useEffect, useState, type ReactNode } from 'react';
import { App, Button, Card, Drawer, Empty, Flex, Form, Input, List, Pagination, Popconfirm, Space, Table, Typography, type FormInstance } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { api, qs } from '../api';
import { useAtraso, useCelular, useDados } from '../hooks';
import type { Lista } from '../tipos';

export interface PropsCadastro<T extends { id: number }> {
  titulo: string;
  tituloItem: string;
  endpoint: string;
  colunas: ColumnsType<T>;
  /** Cartão resumido para celular. */
  cartao: (item: T) => { titulo: ReactNode; descricao?: ReactNode; extra?: ReactNode };
  formulario: (form: FormInstance, item: T | null) => ReactNode;
  valoresIniciais?: Record<string, unknown>;
  /** Converte o registro para os valores do formulário. */
  paraFormulario?: (item: T) => Record<string, unknown>;
  /** Converte os valores do formulário para o corpo enviado à API. */
  paraApi?: (valores: Record<string, unknown>) => Record<string, unknown>;
  podeEditar: boolean;
  filtrosExtras?: Record<string, string | number | undefined>;
  cabecalhoExtra?: ReactNode;
  larguraFormulario?: number;
  /** Ação ao clicar no item (ex.: abrir histórico). Padrão: editar. */
  aoAbrir?: (item: T) => void;
  aoSalvar?: (item: T) => void;
  recarregarRef?: (fn: () => void) => void;
}

export function Cadastro<T extends { id: number }>(p: PropsCadastro<T>) {
  const { message } = App.useApp();
  const celular = useCelular();
  const [busca, setBusca] = useState('');
  const termo = useAtraso(busca);
  const [pagina, setPagina] = useState(1);
  const [editando, setEditando] = useState<T | null | 'novo'>(null);
  const [salvando, setSalvando] = useState(false);
  const [form] = Form.useForm();
  const limite = 30;
  const { dados, carregando, recarregar } = useDados<Lista<T>>(`${p.endpoint}${qs({ q: termo, pagina, limite, ...p.filtrosExtras })}`);

  useEffect(() => setPagina(1), [termo]);
  useEffect(() => p.recarregarRef?.(recarregar), [recarregar]); // eslint-disable-line react-hooks/exhaustive-deps

  const abrir = (item: T | 'novo') => {
    form.resetFields();
    if (item === 'novo') form.setFieldsValue(p.valoresIniciais ?? {});
    else form.setFieldsValue(p.paraFormulario ? p.paraFormulario(item) : item);
    setEditando(item);
  };

  const salvar = async () => {
    const valores = await form.validateFields();
    const corpo = p.paraApi ? p.paraApi(valores) : valores;
    setSalvando(true);
    try {
      const salvo =
        editando === 'novo' ? await api.post<T>(p.endpoint, corpo) : await api.put<T>(`${p.endpoint}/${(editando as T).id}`, corpo);
      message.success(`${p.tituloItem} salvo.`);
      setEditando(null);
      p.aoSalvar?.(salvo);
      void recarregar();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async (item: T) => {
    try {
      const r = await api.del<{ desativado?: boolean }>(`${p.endpoint}/${item.id}`);
      message.success(r.desativado ? `${p.tituloItem} desativado (possui histórico).` : `${p.tituloItem} excluído.`);
      setEditando(null);
      void recarregar();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const abrirItem = (item: T) => (p.aoAbrir ? p.aoAbrir(item) : p.podeEditar && abrir(item));

  const colunas: ColumnsType<T> = [
    ...p.colunas,
    ...(p.podeEditar
      ? [
          {
            key: 'acoes',
            width: 60,
            render: (_: unknown, item: T) => (
              <Button
                type="text"
                icon={<EditOutlined />}
                aria-label="Editar"
                onClick={(e) => {
                  e.stopPropagation();
                  abrir(item);
                }}
              />
            ),
          },
        ]
      : []),
  ];

  return (
    <div>
      <Flex justify="space-between" align="center" gap={8} wrap style={{ marginBottom: 16 }}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          {p.titulo}
        </Typography.Title>
        <Space wrap>
          {p.cabecalhoExtra}
          {p.podeEditar && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => abrir('novo')}>
              Novo
            </Button>
          )}
        </Space>
      </Flex>
      <Input
        allowClear
        size="large"
        prefix={<SearchOutlined />}
        placeholder="Pesquisar..."
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        style={{ marginBottom: 16 }}
      />
      {celular ? (
        <>
          <List
            loading={carregando}
            dataSource={dados?.itens ?? []}
            locale={{ emptyText: <Empty description="Nada encontrado" /> }}
            renderItem={(item) => {
              const c = p.cartao(item);
              return (
                <Card size="small" className="cartao-lista" onClick={() => abrirItem(item)} hoverable>
                  <Flex justify="space-between" gap={8}>
                    <div style={{ minWidth: 0 }}>
                      <div className="cartao-titulo">{c.titulo}</div>
                      {c.descricao && <div className="cartao-desc">{c.descricao}</div>}
                    </div>
                    {c.extra}
                  </Flex>
                </Card>
              );
            }}
          />
          {(dados?.total ?? 0) > limite && (
            <Pagination simple current={pagina} pageSize={limite} total={dados?.total} onChange={setPagina} style={{ marginTop: 12, textAlign: 'center' }} />
          )}
        </>
      ) : (
        <Table<T>
          rowKey="id"
          size="middle"
          loading={carregando}
          columns={colunas}
          dataSource={dados?.itens ?? []}
          onRow={(item) => ({ onClick: () => abrirItem(item), style: { cursor: 'pointer' } })}
          pagination={{ current: pagina, pageSize: limite, total: dados?.total, onChange: setPagina, showSizeChanger: false, hideOnSinglePage: true }}
          locale={{ emptyText: <Empty description="Nada encontrado" /> }}
        />
      )}

      <Drawer
        open={editando !== null}
        onClose={() => setEditando(null)}
        title={editando === 'novo' ? `Novo: ${p.tituloItem.toLowerCase()}` : `Editar ${p.tituloItem.toLowerCase()}`}
        size={celular ? '100%' : (p.larguraFormulario ?? 720)}
        destroyOnHidden
        footer={
          <Flex justify="space-between">
            {editando && editando !== 'novo' && p.podeEditar ? (
              <Popconfirm title={`Excluir este registro?`} okText="Excluir" cancelText="Voltar" onConfirm={() => excluir(editando as T)}>
                <Button danger icon={<DeleteOutlined />}>
                  Excluir
                </Button>
              </Popconfirm>
            ) : (
              <span />
            )}
            <Space>
              <Button onClick={() => setEditando(null)}>Cancelar</Button>
              <Button type="primary" loading={salvando} onClick={salvar}>
                Salvar
              </Button>
            </Space>
          </Flex>
        }
      >
        <Form form={form} layout="vertical" requiredMark="optional" onFinish={salvar}>
          {editando !== null && p.formulario(form, editando === 'novo' ? null : editando)}
        </Form>
      </Drawer>
    </div>
  );
}
