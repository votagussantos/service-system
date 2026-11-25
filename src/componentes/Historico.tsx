import { Button, Drawer, Empty, List, Space, Typography } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router';
import { qs } from '../api';
import { useAuth } from '../auth';
import { useCelular, useDados } from '../hooks';
import { dataHora, dinheiro, enderecoCurto } from '../formato';
import type { Lista, OrdemResumo } from '../tipos';
import { Selos } from './Etiquetas';

/** Lista de OS (histórico) de um cliente ou condomínio. */
export function ListaOrdens({ ordens, carregando, mostrarValor = true }: { ordens: OrdemResumo[]; carregando?: boolean; mostrarValor?: boolean }) {
  const nav = useNavigate();
  const { usuario } = useAuth();
  const tecnico = usuario?.perfil === 'tecnico';
  // Técnico abre só as próprias OS (na tela de atendimento); as demais servem de consulta.
  const destino = (o: OrdemResumo) => (!tecnico ? `/ordens/${o.id}` : o.tecnico_id === usuario?.id ? `/minhas/${o.id}` : null);
  return (
    <List
      loading={carregando}
      dataSource={ordens}
      locale={{ emptyText: <Empty description="Nenhum serviço encontrado" /> }}
      renderItem={(o) => (
        <List.Item
          onClick={() => {
            const d = destino(o);
            if (d) nav(d);
          }}
          style={{ cursor: destino(o) ? 'pointer' : 'default' }}
        >
          <List.Item.Meta
            title={
              <Space wrap size={6}>
                <span className="numero-os">OS {o.numero}</span>
                <Typography.Text type="secondary" style={{ fontWeight: 400 }}>
                  {dataHora(o.concluida_em ?? o.data_agendada ?? o.criado_em)}
                </Typography.Text>
                <Selos o={o} />
              </Space>
            }
            description={
              <div>
                <div>
                  <b>{o.cliente_nome}</b>
                  {o.condominio_nome ? ` · ${o.condominio_nome}` : ''}
                </div>
                <div>{enderecoCurto(o)}</div>
                {o.problema && <div style={{ color: 'var(--texto)' }}>{o.problema}</div>}
                <Space size={12} style={{ fontSize: 12 }}>
                  {o.tecnico_nome && <span>Técnico: {o.tecnico_nome}</span>}
                  {mostrarValor && o.valor_total !== null && <span>{dinheiro(o.valor_total)}</span>}
                </Space>
              </div>
            }
          />
        </List.Item>
      )}
    />
  );
}

export function GavetaHistorico({
  aberto,
  onFechar,
  titulo,
  filtro,
}: {
  aberto: boolean;
  onFechar: () => void;
  titulo: string;
  filtro: { cliente_id?: number; condominio_id?: number };
}) {
  const celular = useCelular();
  const nav = useNavigate();
  const { usuario } = useAuth();
  const { dados, carregando } = useDados<Lista<OrdemResumo>>(aberto ? `/ordens${qs({ ...filtro, limite: 100 })}` : null);
  return (
    <Drawer
      open={aberto}
      onClose={onFechar}
      title={titulo}
      size={celular ? '100%' : 640}
      extra={
        usuario?.perfil !== 'tecnico' && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => nav(`/ordens/nova${qs(filtro)}`)}>
            Nova OS
          </Button>
        )
      }
    >
      <Typography.Paragraph type="secondary">{dados ? `${dados.total} serviço(s)` : ''}</Typography.Paragraph>
      <ListaOrdens ordens={dados?.itens ?? []} carregando={carregando} />
    </Drawer>
  );
}
