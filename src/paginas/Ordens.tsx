import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Button, Card, Empty, Flex, Input, List, Segmented, Space, Table, Typography } from 'antd';
import { PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { qs } from '../api';
import { Selos } from '../componentes/Etiquetas';
import { SelecaoRemota } from '../componentes/SelecaoRemota';
import { dataHora, dinheiro, enderecoCurto, hojeISO } from '../formato';
import { useAtraso, useCelular, useDados } from '../hooks';
import type { Funcionario, Lista, OrdemResumo } from '../tipos';

const FILTROS = [
  { value: 'pendentes', label: 'Pendentes', status: 'aberta,agendada,em_andamento' },
  { value: 'hoje', label: 'Hoje', status: '' },
  { value: 'concluida', label: 'Concluídas', status: 'concluida' },
  { value: 'cancelada', label: 'Canceladas', status: 'cancelada' },
  { value: 'todas', label: 'Todas', status: '' },
];

export function PaginaOrdens() {
  const nav = useNavigate();
  const celular = useCelular();
  const [params, setParams] = useSearchParams();
  const [texto, setTexto] = useState(params.get('q') ?? '');
  const q = useAtraso(texto.trim());
  const [pagina, setPagina] = useState(1);
  const hoje = hojeISO();

  const statusParam = params.get('status');
  const de = params.get('de') ?? '';
  const ate = params.get('ate') ?? '';
  const filtroAtual =
    de === hoje && ate === hoje ? 'hoje' : (FILTROS.find((f) => f.status && f.status === statusParam)?.value ?? (statusParam || de ? '' : 'todas'));
  const tecnico = params.get('tecnico_id') ? Number(params.get('tecnico_id')) : undefined;

  const mudar = (novo: Record<string, string | undefined>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(novo)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    setParams(p, { replace: true });
    setPagina(1);
  };

  const limite = 30;
  const { dados, carregando } = useDados<Lista<OrdemResumo>>(
    `/ordens${qs({ q, status: statusParam, de, ate, tecnico_id: tecnico, pagina, limite, ordem: filtroAtual === 'pendentes' || filtroAtual === 'hoje' ? 'agenda' : undefined })}`,
  );

  return (
    <div>
      <Flex justify="space-between" align="center" gap={8} wrap style={{ marginBottom: 16 }}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          Ordens de serviço
        </Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => nav('/ordens/nova')}>
          Nova OS
        </Button>
      </Flex>
      <Input
        allowClear
        size="large"
        prefix={<SearchOutlined />}
        placeholder="Nº da OS, cliente, endereço, condomínio, problema..."
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          setPagina(1);
        }}
        style={{ marginBottom: 12 }}
      />
      <Flex gap={8} wrap style={{ marginBottom: 16 }}>
        <div style={{ overflowX: 'auto', maxWidth: '100%' }}>
          <Segmented
            value={filtroAtual}
            options={FILTROS.map((f) => ({ value: f.value, label: f.label }))}
            onChange={(v) => {
              const f = FILTROS.find((x) => x.value === v)!;
              if (v === 'hoje') mudar({ status: undefined, de: hoje, ate: hoje });
              else mudar({ status: f.status || undefined, de: undefined, ate: undefined });
            }}
          />
        </div>
        <SelecaoRemota<Funcionario>
          endpoint="/funcionarios"
          extra={{ ativos: 1 }}
          allowClear
          placeholder="Técnico"
          style={{ minWidth: 180 }}
          value={tecnico}
          rotulo={(f) => f.nome}
          onChange={(v) => mudar({ tecnico_id: v ? String(v) : undefined })}
        />
        <Space.Compact>
          <Input type="date" value={de} onChange={(e) => mudar({ de: e.target.value || undefined })} aria-label="De" />
          <Input type="date" value={ate} onChange={(e) => mudar({ ate: e.target.value || undefined })} aria-label="Até" />
        </Space.Compact>
      </Flex>

      {celular ? (
        <List
          loading={carregando}
          dataSource={dados?.itens ?? []}
          locale={{ emptyText: <Empty description="Nenhuma OS" /> }}
          pagination={(dados?.total ?? 0) > limite ? { current: pagina, pageSize: limite, total: dados?.total, onChange: setPagina, simple: true, align: 'center' } : false}
          renderItem={(o) => (
            <Card size="small" className="cartao-lista" hoverable onClick={() => nav(`/ordens/${o.id}`)}>
              <Flex justify="space-between" align="start" gap={8}>
                <div style={{ minWidth: 0 }}>
                  <div className="cartao-titulo">
                    <span className="numero-os">#{o.numero}</span> {o.cliente_nome}
                  </div>
                  <div className="cartao-desc">{enderecoCurto(o)}</div>
                  <div className="cartao-desc">
                    {dataHora(o.data_agendada ?? o.criado_em)}
                    {o.tecnico_nome ? ` · ${o.tecnico_nome}` : ' · sem técnico'}
                  </div>
                </div>
                <b style={{ whiteSpace: 'nowrap' }}>{dinheiro(o.valor_total)}</b>
              </Flex>
              <div style={{ marginTop: 6 }}>
                <Selos o={o} />
              </div>
            </Card>
          )}
        />
      ) : (
        <Table<OrdemResumo>
          rowKey="id"
          loading={carregando}
          dataSource={dados?.itens ?? []}
          onRow={(o) => ({ onClick: () => nav(`/ordens/${o.id}`), style: { cursor: 'pointer' } })}
          pagination={{ current: pagina, pageSize: limite, total: dados?.total, onChange: setPagina, showSizeChanger: false, hideOnSinglePage: true }}
          locale={{ emptyText: <Empty description="Nenhuma OS" /> }}
          columns={[
            { title: 'OS', dataIndex: 'numero', width: 70, render: (n) => <span className="numero-os">#{n}</span> },
            {
              title: 'Cliente / Local',
              render: (_, o) => (
                <>
                  <b>{o.cliente_nome}</b>
                  <div style={{ fontSize: 12, color: '#667085' }}>
                    {o.condominio_nome ? `${o.condominio_nome} · ` : ''}
                    {enderecoCurto(o)}
                  </div>
                </>
              ),
            },
            { title: 'Problema', dataIndex: 'problema', ellipsis: true },
            { title: 'Data', width: 140, render: (_, o) => dataHora(o.concluida_em ?? o.data_agendada ?? o.criado_em) },
            { title: 'Técnico', dataIndex: 'tecnico_nome', width: 140, render: (t) => t ?? <Typography.Text type="danger">—</Typography.Text> },
            { title: 'Situação', width: 220, render: (_, o) => <Selos o={o} /> },
            { title: 'Valor', dataIndex: 'valor_total', width: 110, align: 'right', render: (v) => dinheiro(v) },
          ]}
        />
      )}
    </div>
  );
}
