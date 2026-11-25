import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button, Card, Col, Flex, Input, Row, Statistic, Typography } from 'antd';
import { PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { qs } from '../api';
import { useAuth } from '../auth';
import { ListaOrdens } from '../componentes/Historico';
import { dinheiro, hojeISO } from '../formato';
import { useDados } from '../hooks';
import type { Lista, OrdemResumo } from '../tipos';

interface Painel {
  pendentes: number;
  em_andamento: number;
  agendadas_hoje: number;
  sem_tecnico: number;
  concluidas_mes: number;
  faturado_mes?: number;
  a_receber?: number;
  em_garantia: number;
  retornos_30d: number;
  notas_pendentes: number;
}

export function PaginaInicio() {
  const nav = useNavigate();
  const { usuario } = useAuth();
  const [q, setQ] = useState('');
  const { dados: p } = useDados<Painel>('/busca/painel');
  const hoje = hojeISO();
  const { dados: agenda, carregando } = useDados<Lista<OrdemResumo>>(
    `/ordens${qs({ status: 'aberta,agendada,em_andamento', ordem: 'agenda', limite: 30 })}`,
  );

  const cartao = (titulo: string, valor: number | string | undefined, destino?: string, cor?: string) => (
    <Col xs={12} md={6}>
      <Card size="small" hoverable={!!destino} onClick={() => destino && nav(destino)}>
        <Statistic title={titulo} value={valor ?? '—'} styles={{ content: { color: cor, fontSize: 24 } }} />
      </Card>
    </Col>
  );

  return (
    <div>
      <Flex justify="space-between" align="center" wrap gap={8} style={{ marginBottom: 16 }}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          Olá, {usuario?.nome.split(' ')[0]}
        </Typography.Title>
        <Button type="primary" size="large" icon={<PlusOutlined />} onClick={() => nav('/ordens/nova')}>
          Nova OS
        </Button>
      </Flex>

      <Input.Search
        size="large"
        placeholder="Buscar cliente, telefone, endereço ou condomínio..."
        enterButton={<SearchOutlined />}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onSearch={(v) => v.trim() && nav(`/busca${qs({ q: v.trim() })}`)}
        style={{ marginBottom: 16 }}
      />

      <Row gutter={[12, 12]} style={{ marginBottom: 24 }}>
        {cartao('Agendadas para hoje', p?.agendadas_hoje, `/ordens${qs({ de: hoje, ate: hoje })}`, 'var(--cor-primaria)')}
        {cartao('Pendentes', p?.pendentes, `/ordens${qs({ status: 'aberta,agendada,em_andamento' })}`)}
        {cartao('Em andamento', p?.em_andamento, `/ordens${qs({ status: 'em_andamento' })}`, '#d46b08')}
        {cartao('Sem técnico', p?.sem_tecnico, `/ordens${qs({ status: 'aberta' })}`, p?.sem_tecnico ? '#cf1322' : undefined)}
        {cartao('Concluídas no mês', p?.concluidas_mes)}
        {p?.faturado_mes !== undefined && cartao('Faturado no mês', dinheiro(p.faturado_mes))}
        {p?.a_receber !== undefined && cartao('OS a receber', p.a_receber, undefined, p.a_receber ? '#d46b08' : undefined)}
        {cartao('Notas a emitir', p?.notas_pendentes, '/notas?status=pendente', p?.notas_pendentes ? '#d46b08' : undefined)}
        {cartao('Em garantia agora', p?.em_garantia, '/busca?garantia=1')}
        {cartao('Retornos em garantia (30 dias)', p?.retornos_30d)}
      </Row>

      <Card title="Fila de atendimento" extra={<a onClick={() => nav('/ordens')}>Ver todas</a>}>
        <ListaOrdens ordens={agenda?.itens ?? []} carregando={carregando} />
      </Card>
    </div>
  );
}
