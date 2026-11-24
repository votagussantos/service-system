import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Alert, Badge, Card, Col, Empty, Flex, Input, Row, Segmented, Space, Switch, Tag, Typography } from 'antd';
import { BankOutlined, SafetyCertificateOutlined, UserOutlined } from '@ant-design/icons';
import type { CampoBusca } from '../../shared/constantes';
import { qs } from '../api';
import { GavetaHistorico, ListaOrdens } from '../componentes/Historico';
import { enderecoCurto, relativo } from '../formato';
import { useAuth } from '../auth';
import { useAtraso, useDados } from '../hooks';
import type { Cliente, Condominio, OrdemResumo } from '../tipos';

interface Resultado {
  clientes: (Cliente & { total_os: number; ultima_os_em: string | null; em_garantia: number })[];
  condominios: (Condominio & { total_os: number; ultima_os_em: string | null; em_garantia: number })[];
  ordens: OrdemResumo[];
  total_ordens: number;
}

const CAMPOS: { value: CampoBusca; label: string }[] = [
  { value: 'todos', label: 'Tudo' },
  { value: 'cliente', label: 'Cliente' },
  { value: 'endereco', label: 'Endereço' },
  { value: 'condominio', label: 'Condomínio' },
];

export function PaginaBusca() {
  const { pode } = useAuth();
  const [params, setParams] = useSearchParams();
  const [texto, setTexto] = useState(params.get('q') ?? '');
  const campo = (params.get('campo') as CampoBusca) || 'todos';
  const garantia = params.get('garantia') === '1';
  const termo = useAtraso(texto.trim(), 350);
  const [historico, setHistorico] = useState<{ titulo: string; filtro: { cliente_id?: number; condominio_id?: number } } | null>(null);

  useEffect(() => {
    const p = new URLSearchParams(params);
    if (termo) p.set('q', termo);
    else p.delete('q');
    setParams(p, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [termo]);

  const alterar = (k: string, v: string | null) => {
    const p = new URLSearchParams(params);
    if (v) p.set(k, v);
    else p.delete(k);
    setParams(p, { replace: true });
  };

  // "Só em garantia" sem texto: lista as OS em garantia (busca por qualquer termo não se aplica).
  const url = termo.length >= 2 ? `/busca${qs({ q: termo, campo, garantia })}` : garantia ? `/ordens${qs({ garantia: true, limite: 200 })}` : null;
  const { dados, carregando } = useDados<Resultado | { itens: OrdemResumo[]; total: number }>(url);
  const r: Resultado | null = !dados
    ? null
    : 'itens' in dados
      ? { clientes: [], condominios: [], ordens: dados.itens, total_ordens: dados.total }
      : dados;

  const nada = r && !r.clientes.length && !r.condominios.length && !r.ordens.length;

  return (
    <div>
      <Typography.Title level={3}>Busca de serviços</Typography.Title>
      <Input.Search
        size="large"
        autoFocus
        allowClear
        loading={carregando}
        placeholder="Nome, telefone, CPF/CNPJ, endereço, condomínio, nº da OS..."
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
      />
      <Flex wrap gap={12} align="center" style={{ margin: '12px 0 20px' }}>
        <Segmented options={CAMPOS} value={campo} onChange={(v) => alterar('campo', v === 'todos' ? null : v)} />
        <Space>
          <Switch checked={garantia} onChange={(v) => alterar('garantia', v ? '1' : null)} />
          <span>Só em garantia</span>
        </Space>
      </Flex>

      {!url && (
        <Alert
          type="info"
          showIcon
          title="Pesquise serviços antigos"
          description="Digite pelo menos 2 letras. A busca ignora acentos e abreviações (ex.: “av sao joao 100” encontra “Avenida São João, 100”). Mostra se o cliente já foi atendido, se o serviço está em garantia e se é reincidência."
        />
      )}
      {nada && <Empty description="Nenhum resultado. Cliente novo?" />}

      {r && r.clientes.length > 0 && (
        <>
          <div className="secao-titulo">Clientes ({r.clientes.length})</div>
          <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
            {r.clientes.map((c) => (
              <Col xs={24} md={12} lg={8} key={c.id}>
                <Card size="small" hoverable onClick={() => setHistorico({ titulo: c.nome, filtro: { cliente_id: c.id } })}>
                  <Flex justify="space-between" gap={8}>
                    <div style={{ minWidth: 0 }}>
                      <div className="cartao-titulo">
                        <UserOutlined /> {c.nome}
                      </div>
                      <div className="cartao-desc">{c.telefone}</div>
                      <div className="cartao-desc">
                        {enderecoCurto(c)}
                        {c.condominio_nome ? ` · ${c.condominio_nome}` : ''}
                      </div>
                    </div>
                    <Flex vertical align="end" gap={4}>
                      {c.total_os ? <Badge count={`${c.total_os} OS`} color="#0b5cad" /> : <Tag>Sem serviços</Tag>}
                      {!!c.em_garantia && (
                        <Tag color="green" icon={<SafetyCertificateOutlined />}>
                          Garantia
                        </Tag>
                      )}
                      {c.ultima_os_em && <Typography.Text type="secondary" style={{ fontSize: 12 }}>{relativo(c.ultima_os_em)}</Typography.Text>}
                    </Flex>
                  </Flex>
                </Card>
              </Col>
            ))}
          </Row>
        </>
      )}

      {r && r.condominios.length > 0 && (
        <>
          <div className="secao-titulo">Condomínios ({r.condominios.length})</div>
          <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
            {r.condominios.map((c) => (
              <Col xs={24} md={12} lg={8} key={c.id}>
                <Card size="small" hoverable onClick={() => setHistorico({ titulo: c.nome, filtro: { condominio_id: c.id } })}>
                  <Flex justify="space-between" gap={8}>
                    <div style={{ minWidth: 0 }}>
                      <div className="cartao-titulo">
                        <BankOutlined /> {c.nome}
                      </div>
                      <div className="cartao-desc">{enderecoCurto(c)}</div>
                      {c.sindico && <div className="cartao-desc">Síndico: {c.sindico}</div>}
                    </div>
                    <Flex vertical align="end" gap={4}>
                      {c.total_os ? <Badge count={`${c.total_os} OS`} color="#0b5cad" /> : <Tag>Sem serviços</Tag>}
                      {!!c.em_garantia && <Tag color="green">Garantia</Tag>}
                    </Flex>
                  </Flex>
                </Card>
              </Col>
            ))}
          </Row>
        </>
      )}

      {r && r.ordens.length > 0 && (
        <>
          <div className="secao-titulo">
            Ordens de serviço ({r.total_ordens}
            {r.total_ordens > r.ordens.length ? `, mostrando ${r.ordens.length}` : ''})
          </div>
          <Card size="small">
            <ListaOrdens ordens={r.ordens} mostrarValor={pode('admin', 'atendente')} />
          </Card>
        </>
      )}

      <GavetaHistorico aberto={!!historico} onFechar={() => setHistorico(null)} titulo={historico?.titulo ?? ''} filtro={historico?.filtro ?? {}} />
    </div>
  );
}
