import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  Alert,
  App,
  Button,
  Card,
  Divider,
  Empty,
  Flex,
  Input,
  InputNumber,
  Result,
  Select,
  Skeleton,
  Space,
  Switch,
  Tag,
  Typography,
} from 'antd';
import {
  CheckCircleOutlined,
  DeleteOutlined,
  EnvironmentOutlined,
  PhoneOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
  WhatsAppOutlined,
} from '@ant-design/icons';
import { FORMAS_PAGAMENTO } from '../../shared/constantes';
import { api, ErroRede, urlArquivo } from '../api';
import { Assinatura, assinaturaParaBlob } from '../componentes/Assinatura';
import { Selos } from '../componentes/Etiquetas';
import { Galeria } from '../componentes/Fotos';
import { dataHora, dataSimples, dinheiro, enderecoCurto, linkMapa, linkWhatsApp, relativo } from '../formato';
import { useOnline } from '../hooks';
import { gravarCache, lerCache } from '../offline/armazenamento';
import {
  aplicarPendencias,
  atualizarMinhasOS,
  CHAVE_MINHAS,
  enfileirar,
  limparErros,
  novoId,
  useFila,
  type CacheMinhas,
  type OrdemLocal,
} from '../offline/fila';
import type { ItemOS, Lista, Ordem, Preco } from '../tipos';

/** Lê as OS do técnico do celular e atualiza pelo servidor quando houver internet. */
function useMinhasOS() {
  const [cache, setCache] = useState<CacheMinhas | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const lerLocal = useCallback(async () => setCache(await lerCache<CacheMinhas>(CHAVE_MINHAS)), []);

  const atualizar = useCallback(async () => {
    setCarregando(true);
    try {
      setCache(await atualizarMinhasOS());
      setErro(null);
      // Tabela de preços para lançar itens sem internet.
      const precos = await api.get<Lista<Preco>>('/precos?ativos=1&limite=500');
      await gravarCache('precos', precos.itens);
    } catch (e) {
      setErro(e instanceof ErroRede ? null : (e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void lerLocal().then(atualizar);
    window.addEventListener('fila-mudou', lerLocal);
    return () => window.removeEventListener('fila-mudou', lerLocal);
  }, [lerLocal, atualizar]);

  return { cache, carregando, erro, atualizar };
}

function AvisoSincronizacao() {
  const online = useOnline();
  const { fila, erros } = useFila();
  return (
    <Space orientation="vertical" style={{ width: '100%', marginBottom: 12 }}>
      {!online && (
        <Alert
          type="warning"
          showIcon
          title="Sem internet"
          description={
            fila.length
              ? `${fila.length} ação(ões) guardadas no celular. Serão enviadas automaticamente quando a conexão voltar.`
              : 'Você pode continuar trabalhando. Tudo fica guardado no celular.'
          }
        />
      )}
      {erros.length > 0 && (
        <Alert
          type="error"
          showIcon
          title="Algumas ações não foram aceitas pelo sistema"
          description={
            <div>
              {erros.map((e, i) => (
                <div key={i}>
                  OS {e.acao.numeroOS}: {e.mensagem}
                </div>
              ))}
              <Typography.Text type="secondary">Avise o escritório.</Typography.Text>
            </div>
          }
          action={
            <Button size="small" onClick={() => void limparErros()}>
              Ok
            </Button>
          }
        />
      )}
    </Space>
  );
}

export function PaginaMinhasOS() {
  const nav = useNavigate();
  const { cache, carregando, erro, atualizar } = useMinhasOS();
  const { fila } = useFila();
  const ordens = (cache?.itens ?? []).map((o) => aplicarPendencias(o, fila));
  const hoje = new Date().toDateString();

  const grupos: { titulo: string; itens: OrdemLocal[] }[] = [
    { titulo: 'Em andamento', itens: ordens.filter((o) => o.status === 'em_andamento') },
    {
      titulo: 'Hoje',
      itens: ordens.filter((o) => ['aberta', 'agendada'].includes(o.status) && o.data_agendada && new Date(o.data_agendada).toDateString() === hoje),
    },
    {
      titulo: 'Próximas / sem data',
      itens: ordens.filter((o) => ['aberta', 'agendada'].includes(o.status) && !(o.data_agendada && new Date(o.data_agendada).toDateString() === hoje)),
    },
    { titulo: 'Concluídas recentemente', itens: ordens.filter((o) => o.status === 'concluida') },
  ];

  return (
    <div>
      <Flex justify="space-between" align="center" style={{ marginBottom: 12 }}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          Minhas OS
        </Typography.Title>
        <Button icon={<ReloadOutlined />} loading={carregando} onClick={() => void atualizar()}>
          Atualizar
        </Button>
      </Flex>
      <AvisoSincronizacao />
      {erro && <Alert type="error" title={erro} style={{ marginBottom: 12 }} />}
      {cache && (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          Atualizado {relativo(cache.sincronizado_em)}
        </Typography.Text>
      )}
      {!cache && carregando && <Skeleton active />}
      {cache && ordens.length === 0 && <Empty description="Nenhuma OS atribuída a você" style={{ marginTop: 40 }} />}
      {grupos
        .filter((g) => g.itens.length)
        .map((g) => (
          <div key={g.titulo}>
            <div className="secao-titulo">
              {g.titulo} ({g.itens.length})
            </div>
            {g.itens.map((o) => (
              <Card key={o.id} size="small" className="cartao-lista" hoverable onClick={() => nav(`/minhas/${o.id}`)}>
                <Flex justify="space-between" gap={8}>
                  <div style={{ minWidth: 0 }}>
                    <div className="cartao-titulo">
                      <span className="numero-os">#{o.numero}</span> {o.cliente.nome}
                    </div>
                    <div className="cartao-desc">
                      {o.condominio ? `${o.condominio.nome} · ` : ''}
                      {enderecoCurto(o)}
                    </div>
                    {o.problema && <div className="cartao-desc">{o.problema}</div>}
                  </div>
                  <div style={{ textAlign: 'right', whiteSpace: 'nowrap', fontSize: 13 }}>
                    {o.data_agendada ? dataHora(o.data_agendada).slice(11) || dataHora(o.data_agendada) : ''}
                    {o.data_agendada && new Date(o.data_agendada).toDateString() !== hoje && (
                      <div style={{ color: '#667085' }}>{dataHora(o.data_agendada).slice(0, 5)}</div>
                    )}
                  </div>
                </Flex>
                <div style={{ marginTop: 6 }}>
                  <Selos o={o} />
                  {o.pendencias > 0 && <Tag color="orange">{o.pendencias} a enviar</Tag>}
                </div>
              </Card>
            ))}
          </div>
        ))}
    </div>
  );
}

/** Tela de atendimento do técnico (funciona sem internet). */
export function PaginaAtendimento() {
  const { id } = useParams();
  const ordemId = Number(id);
  const nav = useNavigate();
  const { message, modal } = App.useApp();
  const { fila } = useFila();
  const [base, setBase] = useState<Ordem | null>(null);
  const [naoEncontrada, setNaoEncontrada] = useState(false);
  const [precos, setPrecos] = useState<Preco[]>([]);
  const [servico, setServico] = useState('');
  const [itens, setItens] = useState<ItemOS[]>([]);
  const [assinaturaVazia, setAssinaturaVazia] = useState(true);
  const [nomeAssinatura, setNomeAssinatura] = useState('');
  const [concluindo, setConcluindo] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const iniciado = useRef(false);

  // Carrega a OS do celular (ou do servidor, se não estiver no celular).
  useEffect(() => {
    const ler = async () => {
      const cache = await lerCache<CacheMinhas>(CHAVE_MINHAS);
      let o = cache?.itens.find((x) => x.id === ordemId) ?? null;
      if (!o) {
        try {
          o = await api.get<Ordem>(`/ordens/${ordemId}`);
        } catch {
          setNaoEncontrada(true);
          return;
        }
      }
      setBase(o);
    };
    void ler();
    void lerCache<Preco[]>('precos').then((p) => setPrecos(p ?? []));
    window.addEventListener('fila-mudou', ler);
    return () => window.removeEventListener('fila-mudou', ler);
  }, [ordemId]);

  const o = base ? aplicarPendencias(base, fila) : null;

  // Inicializa os campos editáveis uma única vez.
  useEffect(() => {
    if (o && !iniciado.current) {
      iniciado.current = true;
      setServico(o.servico_executado);
      setItens(o.itens);
      setNomeAssinatura(o.assinatura_nome || o.contato_nome || o.cliente.nome);
    }
  }, [o]);

  // Salva itens alterados (com pequeno atraso para não enviar a cada tecla).
  const itensAlterados = useRef(false);
  useEffect(() => {
    if (!itensAlterados.current || !o) return;
    const t = setTimeout(() => {
      itensAlterados.current = false;
      void enfileirar({ tipo: 'atualizar', ordemId: o.id, numeroOS: o.numero, dados: { itens: itens.filter((i) => i.descricao) } });
    }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itens]);

  if (naoEncontrada) return <Result status="404" title="OS não encontrada neste celular" extra={<Button onClick={() => nav('/minhas')}>Voltar</Button>} />;
  if (!o) return <Skeleton active />;

  const editavel = ['aberta', 'agendada', 'em_andamento'].includes(o.status);
  const emAndamento = o.status === 'em_andamento';
  const telefone = o.contato_telefone || o.cliente.telefone;
  const mudarItens = (novos: ItemOS[]) => {
    itensAlterados.current = true;
    setItens(novos);
  };
  const subtotal = itens.reduce((s, i) => s + (i.quantidade || 0) * (i.valor_unitario || 0), 0);
  const total = o.retorno_garantia ? 0 : Math.max(0, subtotal - (o.desconto || 0));

  const concluir = async () => {
    if (!servico.trim()) {
      message.warning('Descreva o serviço executado.');
      return;
    }
    if (assinaturaVazia) {
      const seguir = await modal.confirm({
        title: 'Concluir sem assinatura do cliente?',
        okText: 'Concluir sem assinatura',
        cancelText: 'Voltar',
      });
      if (!seguir) return;
    }
    setConcluindo(true);
    try {
      if (!assinaturaVazia) {
        const blob = await assinaturaParaBlob(canvas.current);
        if (blob) await enfileirar({ tipo: 'assinatura', ordemId: o.id, numeroOS: o.numero, blob, nome: nomeAssinatura });
      }
      await enfileirar({
        tipo: 'concluir',
        ordemId: o.id,
        numeroOS: o.numero,
        dados: {
          servico_executado: servico.trim(),
          itens: itens.filter((i) => i.descricao),
          forma_pagamento: o.forma_pagamento,
          pago: !!o.pago,
          assinatura_nome: nomeAssinatura,
        },
      });
      message.success(navigator.onLine ? 'Atendimento concluído!' : 'Concluído no celular. Será enviado quando houver internet.');
      nav('/minhas');
    } finally {
      setConcluindo(false);
    }
  };

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <AvisoSincronizacao />
      <Card size="small">
        <Flex justify="space-between" align="start" gap={8}>
          <div>
            <Typography.Title level={4} style={{ margin: 0 }}>
              OS nº {o.numero}
            </Typography.Title>
            <div style={{ marginTop: 4 }}>
              <Selos o={o} />
              {o.pendencias > 0 && <Tag color="orange">{o.pendencias} a enviar</Tag>}
            </div>
          </div>
          {o.data_agendada && <Typography.Text type="secondary">{dataHora(o.data_agendada)}</Typography.Text>}
        </Flex>
        <Divider style={{ margin: '12px 0' }} />
        <div style={{ fontSize: 16, fontWeight: 600 }}>{o.cliente.nome}</div>
        {o.condominio && (
          <div>
            🏢 {o.condominio.nome}
            {o.unidade ? ` · ${o.unidade}` : ''}
            {o.condominio.zelador ? ` · Zelador: ${o.condominio.zelador}` : ''}
          </div>
        )}
        <div>{enderecoCurto(o)}</div>
        {o.contato_nome && o.contato_nome !== o.cliente.nome && <div>Contato: {o.contato_nome}</div>}
        <Flex gap={8} style={{ marginTop: 12 }} wrap>
          <Button href={linkMapa(o)} target="_blank" icon={<EnvironmentOutlined />} style={{ flex: 1 }}>
            Mapa
          </Button>
          {telefone && (
            <>
              <Button href={`tel:${telefone.replace(/\D/g, '')}`} icon={<PhoneOutlined />} style={{ flex: 1 }}>
                Ligar
              </Button>
              <Button
                href={linkWhatsApp(telefone, `Olá! Sou o técnico da OS nº ${o.numero}, estou a caminho.`)}
                target="_blank"
                icon={<WhatsAppOutlined />}
                style={{ flex: 1, color: '#25D366', borderColor: '#25D366' }}
              >
                WhatsApp
              </Button>
            </>
          )}
        </Flex>
      </Card>

      <Card size="small" style={{ marginTop: 12 }} title="Chamado">
        {o.local_servico && (
          <div>
            <b>Onde:</b> {o.local_servico}
          </div>
        )}
        <div>
          <b>Problema:</b> {o.problema || '—'}
        </div>
        {o.origem_numero && (
          <Alert
            style={{ marginTop: 8 }}
            type={o.retorno_garantia ? 'warning' : 'info'}
            showIcon
            title={o.retorno_garantia ? `Retorno em garantia da OS nº ${o.origem_numero} — não cobrar` : `Relacionada à OS nº ${o.origem_numero}`}
          />
        )}
        {!!o.reincidencia && !o.retorno_garantia && (
          <Alert style={{ marginTop: 8 }} type="error" showIcon title="Reincidência: já houve serviço aqui recentemente. Verifique a causa." />
        )}
      </Card>

      {(o.status === 'aberta' || o.status === 'agendada') && (
        <Button
          type="primary"
          block
          className="botao-grande"
          icon={<PlayCircleOutlined />}
          style={{ marginTop: 12 }}
          onClick={() => void enfileirar({ tipo: 'iniciar', ordemId: o.id, numeroOS: o.numero })}
        >
          Iniciar atendimento
        </Button>
      )}

      {(emAndamento || o.status === 'concluida') && (
        <>
          <Card size="small" style={{ marginTop: 12 }} title="1. Fotos antes">
            <Galeria
              tipos={['antes']}
              fotos={o.fotos}
              podeEditar={editavel}
              onAdicionar={(tipo, blob) => enfileirar({ tipo: 'foto', ordemId: o.id, numeroOS: o.numero, fotoId: novoId(), fotoTipo: tipo, blob })}
              onRemover={(f) => enfileirar({ tipo: 'excluirFoto', ordemId: o.id, numeroOS: o.numero, fotoId: f.id })}
            />
          </Card>

          <Card size="small" style={{ marginTop: 12 }} title="2. Serviço executado">
            <Input.TextArea
              rows={4}
              value={servico}
              disabled={!editavel}
              placeholder="O que foi feito, causa encontrada, recomendações ao cliente..."
              onChange={(e) => setServico(e.target.value)}
              onBlur={() => {
                if (servico !== o.servico_executado) void enfileirar({ tipo: 'atualizar', ordemId: o.id, numeroOS: o.numero, dados: { servico_executado: servico } });
              }}
            />
          </Card>

          <Card size="small" style={{ marginTop: 12 }} title="3. Serviços cobrados">
            {itens.map((i, idx) => (
              <div key={idx} style={{ borderBottom: '1px dashed #eee', paddingBottom: 8, marginBottom: 8 }}>
                <Flex gap={8} align="center">
                  <Input
                    value={i.descricao}
                    disabled={!editavel}
                    placeholder="Descrição"
                    onChange={(e) => mudarItens(itens.map((x, j) => (j === idx ? { ...x, descricao: e.target.value } : x)))}
                  />
                  {editavel && (
                    <Button danger type="text" icon={<DeleteOutlined />} aria-label="Remover" onClick={() => mudarItens(itens.filter((_, j) => j !== idx))} />
                  )}
                </Flex>
                <Flex gap={8} align="center" style={{ marginTop: 6 }}>
                  <InputNumber
                    value={i.quantidade}
                    min={0.01}
                    disabled={!editavel}
                    decimalSeparator=","
                    inputMode="decimal"
                    style={{ width: 90 }}
                    suffix={i.unidade}
                    onChange={(v) => mudarItens(itens.map((x, j) => (j === idx ? { ...x, quantidade: Number(v) || 0 } : x)))}
                  />
                  <span>×</span>
                  <InputNumber
                    value={i.valor_unitario}
                    min={0}
                    precision={2}
                    disabled={!editavel}
                    decimalSeparator=","
                    inputMode="decimal"
                    prefix="R$"
                    style={{ width: 130 }}
                    onChange={(v) => mudarItens(itens.map((x, j) => (j === idx ? { ...x, valor_unitario: Number(v) || 0 } : x)))}
                  />
                  <b style={{ marginLeft: 'auto' }}>{dinheiro(i.quantidade * i.valor_unitario)}</b>
                </Flex>
              </div>
            ))}
            {editavel && (
              <Flex gap={8} wrap>
                <Select
                  showSearch={{ optionFilterProp: 'label' }}
                  placeholder="+ Da tabela de preços"
                  style={{ flex: 1, minWidth: 200 }}
                  value={null}
                  options={precos.map((p) => ({ value: p.id, label: `${p.servico_nome}${p.descricao ? ` - ${p.descricao}` : ''} · ${dinheiro(p.valor)}/${p.unidade}` }))}
                  onChange={(v) => {
                    const p = precos.find((x) => x.id === v);
                    if (p)
                      mudarItens([
                        ...itens,
                        { servico_id: p.servico_id, preco_id: p.id, descricao: [p.servico_nome, p.descricao].filter(Boolean).join(' - '), unidade: p.unidade, quantidade: 1, valor_unitario: p.valor },
                      ]);
                  }}
                />
                <Button icon={<PlusOutlined />} onClick={() => mudarItens([...itens, { descricao: '', unidade: 'un', quantidade: 1, valor_unitario: 0 }])}>
                  Avulso
                </Button>
              </Flex>
            )}
            <Divider style={{ margin: '12px 0' }} />
            <Flex justify="space-between" align="center">
              <span>{o.desconto > 0 && !o.retorno_garantia ? `Desconto ${dinheiro(o.desconto)}` : ''}</span>
              <span style={{ fontSize: 20, fontWeight: 700 }}>Total {dinheiro(total)}</span>
            </Flex>
            {!!o.retorno_garantia && <Typography.Text type="warning">Retorno em garantia: sem cobrança.</Typography.Text>}
          </Card>

          <Card size="small" style={{ marginTop: 12 }} title="4. Fotos depois">
            <Galeria
              tipos={['depois']}
              fotos={o.fotos}
              podeEditar={editavel}
              onAdicionar={(tipo, blob) => enfileirar({ tipo: 'foto', ordemId: o.id, numeroOS: o.numero, fotoId: novoId(), fotoTipo: tipo, blob })}
              onRemover={(f) => enfileirar({ tipo: 'excluirFoto', ordemId: o.id, numeroOS: o.numero, fotoId: f.id })}
            />
          </Card>

          <Card size="small" style={{ marginTop: 12 }} title="5. Pagamento">
            <Flex gap={12} align="center" wrap>
              <Select
                placeholder="Forma de pagamento"
                style={{ flex: 1, minWidth: 180 }}
                value={o.forma_pagamento || undefined}
                disabled={!editavel}
                options={FORMAS_PAGAMENTO.map((f) => ({ value: f, label: f }))}
                onChange={(v) => void enfileirar({ tipo: 'atualizar', ordemId: o.id, numeroOS: o.numero, dados: { forma_pagamento: v } })}
              />
              <Space>
                <Switch
                  checked={!!o.pago}
                  disabled={!editavel}
                  onChange={(v) => void enfileirar({ tipo: 'atualizar', ordemId: o.id, numeroOS: o.numero, dados: { pago: v } })}
                />
                <span>Recebido</span>
              </Space>
            </Flex>
          </Card>

          {editavel ? (
            <Card size="small" style={{ marginTop: 12 }} title="6. Assinatura do cliente">
              <Input value={nomeAssinatura} onChange={(e) => setNomeAssinatura(e.target.value)} placeholder="Nome de quem assina" style={{ marginBottom: 8 }} />
              <Assinatura canvasRef={canvas} onChange={setAssinaturaVazia} />
            </Card>
          ) : (
            (o.assinatura_local || o.assinatura_key) && (
              <Card size="small" style={{ marginTop: 12 }} title="Assinatura do cliente">
                <img src={o.assinatura_local ?? urlArquivo(o.assinatura_key!)} alt="Assinatura" style={{ maxWidth: '100%', maxHeight: 140 }} />
                <div>{o.assinatura_nome}</div>
              </Card>
            )
          )}

          {editavel ? (
            <Button type="primary" block className="botao-grande" icon={<CheckCircleOutlined />} loading={concluindo} style={{ margin: '16px 0' }} onClick={concluir}>
              Concluir atendimento
            </Button>
          ) : (
            <Alert
              style={{ margin: '16px 0' }}
              type="success"
              showIcon
              title={`Concluída ${dataHora(o.concluida_em)}${o.pendencias ? ' — aguardando envio' : ''}`}
              description={o.garantia_ate ? `Garantia até ${dataSimples(o.garantia_ate)}` : undefined}
            />
          )}
        </>
      )}
    </div>
  );
}
