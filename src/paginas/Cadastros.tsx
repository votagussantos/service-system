import { useState } from 'react';
import { Button, Col, Divider, Form, Input, InputNumber, Row, Segmented, Select, Switch, Tag, Typography } from 'antd';
import { HistoryOutlined } from '@ant-design/icons';
import { PERFIL_LABEL, PERFIS, UNIDADES } from '../../shared/constantes';
import { useAuth } from '../auth';
import { Cadastro } from '../componentes/Cadastro';
import { CamposEndereco } from '../componentes/Endereco';
import { GavetaHistorico } from '../componentes/Historico';
import { SelecaoRemota } from '../componentes/SelecaoRemota';
import { dinheiro, enderecoCurto, mascaraDocumento, mascaraTelefone, relativo } from '../formato';
import type { Cliente, Condominio, Funcionario, Preco, Servico, Veiculo } from '../tipos';

const tel = { normalize: mascaraTelefone };

// ---------------- Clientes ----------------
export function PaginaClientes() {
  const { pode } = useAuth();
  const [historico, setHistorico] = useState<Cliente | null>(null);
  return (
    <>
      <Cadastro<Cliente>
        titulo="Clientes"
        tituloItem="Cliente"
        endpoint="/clientes"
        podeEditar={pode('admin', 'atendente')}
        valoresIniciais={{ tipo: 'PF' }}
        colunas={[
          { title: 'Nome', dataIndex: 'nome', render: (v, c) => (<><b>{v}</b>{c.cpf_cnpj && <div style={{ fontSize: 12, color: '#888' }}>{c.cpf_cnpj}</div>}</>) },
          { title: 'Telefone', dataIndex: 'telefone' },
          { title: 'Endereço', render: (_, c) => (<>{enderecoCurto(c)}{c.condominio_nome && <div style={{ fontSize: 12 }}>🏢 {c.condominio_nome}</div>}</>) },
          { title: 'Serviços', dataIndex: 'total_os', width: 110, render: (n, c) => (n ? <span>{n} · {relativo(c.ultima_os_em)}</span> : <Tag>Novo</Tag>) },
          {
            key: 'hist',
            width: 50,
            render: (_, c) => (
              <Button type="text" icon={<HistoryOutlined />} title="Histórico de serviços" onClick={(e) => { e.stopPropagation(); setHistorico(c); }} />
            ),
          },
        ]}
        cartao={(c) => ({
          titulo: c.nome,
          descricao: (
            <>
              {c.telefone && <div>{c.telefone}</div>}
              <div>{enderecoCurto(c)}</div>
              {c.condominio_nome && <div>🏢 {c.condominio_nome}</div>}
            </>
          ),
          extra: (
            <Button
              size="small"
              icon={<HistoryOutlined />}
              onClick={(e) => {
                e.stopPropagation();
                setHistorico(c);
              }}
            >
              {c.total_os ?? 0}
            </Button>
          ),
        })}
        paraApi={(v) => ({ ...v, condominio_id: v.condominio_id ?? null })}
        formulario={(form, item) => (
          <>
            <Form.Item name="tipo" label="Tipo">
              <Segmented options={[{ value: 'PF', label: 'Pessoa física' }, { value: 'PJ', label: 'Empresa / Condomínio' }]} />
            </Form.Item>
            <Row gutter={12}>
              <Col xs={24} md={14}>
                <Form.Item name="nome" label="Nome / Razão social" rules={[{ required: true, message: 'Informe o nome' }]}>
                  <Input autoFocus />
                </Form.Item>
              </Col>
              <Col xs={24} md={10}>
                <Form.Item name="cpf_cnpj" label="CPF / CNPJ" normalize={mascaraDocumento}>
                  <Input inputMode="numeric" />
                </Form.Item>
              </Col>
              <Col xs={12} md={8}>
                <Form.Item name="telefone" label="Telefone / WhatsApp" {...tel}>
                  <Input inputMode="tel" />
                </Form.Item>
              </Col>
              <Col xs={12} md={8}>
                <Form.Item name="telefone2" label="Outro telefone" {...tel}>
                  <Input inputMode="tel" />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item name="email" label="E-mail" rules={[{ type: 'email', message: 'E-mail inválido' }]}>
                  <Input inputMode="email" />
                </Form.Item>
              </Col>
            </Row>
            <Divider titlePlacement="start">Endereço</Divider>
            <Row gutter={12}>
              <Col xs={24} md={16}>
                <Form.Item name="condominio_id" label="Condomínio (se morar em um)">
                  <SelecaoRemota<Condominio>
                    endpoint="/condominios"
                    allowClear
                    placeholder="Pesquisar condomínio..."
                    rotulo={(c) => c.nome}
                    descricao={(c) => enderecoCurto(c)}
                    rotuloInicial={item?.condominio_nome ?? undefined}
                    onChange={(_, c) => {
                      if (c) form.setFieldsValue({ cep: c.cep, logradouro: c.logradouro, numero: c.numero, bairro: c.bairro, cidade: c.cidade, uf: c.uf });
                    }}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item name="unidade" label="Unidade (apto/bloco)">
                  <Input placeholder="Ex.: Bloco B apto 52" />
                </Form.Item>
              </Col>
            </Row>
            <CamposEndereco form={form} />
            <Form.Item name="observacoes" label="Observações">
              <Input.TextArea rows={3} />
            </Form.Item>
          </>
        )}
      />
      <GavetaHistorico aberto={!!historico} onFechar={() => setHistorico(null)} titulo={`Histórico · ${historico?.nome ?? ''}`} filtro={{ cliente_id: historico?.id }} />
    </>
  );
}

// ---------------- Condomínios ----------------
export function PaginaCondominios() {
  const { pode } = useAuth();
  const [historico, setHistorico] = useState<Condominio | null>(null);
  return (
    <>
      <Cadastro<Condominio>
        titulo="Condomínios"
        tituloItem="Condomínio"
        endpoint="/condominios"
        podeEditar={pode('admin', 'atendente')}
        colunas={[
          { title: 'Nome', dataIndex: 'nome', render: (v) => <b>{v}</b> },
          { title: 'Endereço', render: (_, c) => enderecoCurto(c) },
          { title: 'Síndico / Zelador', render: (_, c) => [c.sindico, c.zelador].filter(Boolean).join(' / ') },
          { title: 'Telefone', dataIndex: 'telefone' },
          { title: 'Serviços', dataIndex: 'total_os', width: 110, render: (n, c) => (n ? `${n} · ${relativo(c.ultima_os_em)}` : <Tag>Nenhum</Tag>) },
          {
            key: 'hist',
            width: 50,
            render: (_, c) => (
              <Button type="text" icon={<HistoryOutlined />} title="Histórico de serviços" onClick={(e) => { e.stopPropagation(); setHistorico(c); }} />
            ),
          },
        ]}
        cartao={(c) => ({
          titulo: c.nome,
          descricao: (
            <>
              <div>{enderecoCurto(c)}</div>
              {c.sindico && <div>Síndico: {c.sindico}</div>}
            </>
          ),
          extra: (
            <Button size="small" icon={<HistoryOutlined />} onClick={(e) => { e.stopPropagation(); setHistorico(c); }}>
              {c.total_os ?? 0}
            </Button>
          ),
        })}
        formulario={(form) => (
          <>
            <Row gutter={12}>
              <Col xs={24} md={16}>
                <Form.Item name="nome" label="Nome do condomínio" rules={[{ required: true, message: 'Informe o nome' }]}>
                  <Input autoFocus />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item name="cnpj" label="CNPJ" normalize={mascaraDocumento}>
                  <Input inputMode="numeric" />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item name="sindico" label="Síndico">
                  <Input />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item name="zelador" label="Zelador / Portaria">
                  <Input />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item name="telefone" label="Telefone" {...tel}>
                  <Input inputMode="tel" />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item name="administradora" label="Administradora">
                  <Input />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item name="email" label="E-mail" rules={[{ type: 'email', message: 'E-mail inválido' }]}>
                  <Input inputMode="email" />
                </Form.Item>
              </Col>
            </Row>
            <Divider titlePlacement="start">Endereço</Divider>
            <CamposEndereco form={form} comComplemento={false} />
            <Form.Item name="observacoes" label="Observações (acesso, horários, regras do condomínio)">
              <Input.TextArea rows={3} />
            </Form.Item>
          </>
        )}
      />
      <GavetaHistorico aberto={!!historico} onFechar={() => setHistorico(null)} titulo={`Histórico · ${historico?.nome ?? ''}`} filtro={{ condominio_id: historico?.id }} />
    </>
  );
}

// ---------------- Serviços ----------------
export function PaginaServicos() {
  const { pode } = useAuth();
  return (
    <Cadastro<Servico>
      titulo="Serviços"
      tituloItem="Serviço"
      endpoint="/servicos"
      podeEditar={pode('admin')}
      valoresIniciais={{ ativo: true }}
      colunas={[
        { title: 'Serviço', dataIndex: 'nome', render: (v, s) => (<><b>{v}</b>{s.descricao && <div style={{ fontSize: 12, color: '#888' }}>{s.descricao}</div>}</>) },
        { title: 'Categoria', dataIndex: 'categoria' },
        { title: 'Garantia', dataIndex: 'garantia_dias', render: (d) => (d === null ? 'Padrão da empresa' : d === 0 ? 'Sem garantia' : `${d} dias`) },
        { title: 'Preços', dataIndex: 'total_precos', width: 80 },
        { title: 'Situação', dataIndex: 'ativo', width: 100, render: (a) => (a ? <Tag color="green">Ativo</Tag> : <Tag>Inativo</Tag>) },
      ]}
      cartao={(s) => ({
        titulo: s.nome,
        descricao: `${s.categoria || 'Sem categoria'} · garantia ${s.garantia_dias === null ? 'padrão' : `${s.garantia_dias} dias`}`,
        extra: !s.ativo && <Tag>Inativo</Tag>,
      })}
      paraFormulario={(s) => ({ ...s, ativo: !!s.ativo })}
      formulario={() => (
        <>
          <Form.Item name="nome" label="Nome do serviço" rules={[{ required: true, message: 'Informe o nome' }]}>
            <Input autoFocus placeholder="Ex.: Desentupimento de pia" />
          </Form.Item>
          <Row gutter={12}>
            <Col xs={24} md={12}>
              <Form.Item name="categoria" label="Categoria">
                <Input placeholder="Ex.: Residencial, Rede de esgoto, Caixa de gordura" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="garantia_dias" label="Garantia (dias)" extra="Deixe vazio para usar o prazo padrão da empresa. 0 = sem garantia.">
                <InputNumber min={0} max={3650} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="descricao" label="Descrição">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="ativo" label="Ativo" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Typography.Paragraph type="secondary">Os valores ficam na Tabela de preços.</Typography.Paragraph>
        </>
      )}
    />
  );
}

// ---------------- Tabela de preços ----------------
export function PaginaPrecos() {
  const { pode } = useAuth();
  const [servico, setServico] = useState<number | undefined>();
  return (
    <Cadastro<Preco>
      titulo="Tabela de preços"
      tituloItem="Preço"
      endpoint="/precos"
      podeEditar={pode('admin')}
      filtrosExtras={{ servico_id: servico }}
      valoresIniciais={{ unidade: 'un', ativo: true, servico_id: servico }}
      cabecalhoExtra={
        <SelecaoRemota<Servico>
          endpoint="/servicos"
          allowClear
          placeholder="Filtrar por serviço"
          style={{ minWidth: 220 }}
          value={servico}
          rotulo={(s) => s.nome}
          onChange={(v) => setServico(v ?? undefined)}
        />
      }
      colunas={[
        { title: 'Serviço', dataIndex: 'servico_nome', render: (v, p) => (<><b>{v}</b><div style={{ fontSize: 12, color: '#888' }}>{p.servico_categoria}</div></>) },
        { title: 'Variação', dataIndex: 'descricao' },
        { title: 'Unidade', dataIndex: 'unidade', width: 100 },
        { title: 'Valor', dataIndex: 'valor', width: 140, align: 'right', render: (v) => <span className="tabela-preco-valor">{dinheiro(v)}</span> },
        { title: 'Situação', dataIndex: 'ativo', width: 100, render: (a) => (a ? <Tag color="green">Ativo</Tag> : <Tag>Inativo</Tag>) },
      ]}
      cartao={(p) => ({
        titulo: p.servico_nome,
        descricao: [p.descricao, `por ${p.unidade}`].filter(Boolean).join(' · '),
        extra: <b className="tabela-preco-valor">{dinheiro(p.valor)}</b>,
      })}
      paraFormulario={(p) => ({ ...p, ativo: !!p.ativo })}
      formulario={(_, item) => (
        <>
          <Form.Item name="servico_id" label="Serviço" rules={[{ required: true, message: 'Selecione o serviço' }]}>
            <SelecaoRemota<Servico> endpoint="/servicos" placeholder="Selecione..." rotulo={(s) => s.nome} rotuloInicial={item?.servico_nome} extra={{ ativos: 1 }} />
          </Form.Item>
          <Form.Item name="descricao" label="Variação / descrição" extra="Ex.: Até 10 metros, Imóvel comercial, Fora do horário">
            <Input />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="unidade" label="Cobrado por">
                <Select options={UNIDADES.map((u) => ({ value: u, label: u }))} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="valor" label="Valor (R$)" rules={[{ required: true, message: 'Informe o valor' }]}>
                <InputNumber min={0} step={10} precision={2} decimalSeparator="," style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="ativo" label="Ativo" valuePropName="checked">
            <Switch />
          </Form.Item>
        </>
      )}
    />
  );
}

// ---------------- Funcionários ----------------
export function PaginaFuncionarios() {
  const { pode } = useAuth();
  return (
    <Cadastro<Funcionario>
      titulo="Funcionários"
      tituloItem="Funcionário"
      endpoint="/funcionarios"
      podeEditar={pode('admin')}
      valoresIniciais={{ perfil: 'sem_acesso', ativo: true }}
      colunas={[
        { title: 'Nome', dataIndex: 'nome', render: (v) => <b>{v}</b> },
        { title: 'Cargo', dataIndex: 'cargo' },
        { title: 'Telefone', dataIndex: 'telefone' },
        { title: 'Acesso', dataIndex: 'perfil', render: (p, f) => (p === 'sem_acesso' ? <Tag>Sem acesso</Tag> : <Tag color="blue">{PERFIL_LABEL[p as keyof typeof PERFIL_LABEL]} · {f.login}</Tag>) },
        { title: 'Situação', dataIndex: 'ativo', width: 100, render: (a) => (a ? <Tag color="green">Ativo</Tag> : <Tag>Inativo</Tag>) },
      ]}
      cartao={(f) => ({
        titulo: f.nome,
        descricao: [f.cargo, f.perfil !== 'sem_acesso' ? `login: ${f.login}` : null].filter(Boolean).join(' · '),
        extra: !f.ativo ? <Tag>Inativo</Tag> : f.perfil !== 'sem_acesso' && <Tag color="blue">{PERFIL_LABEL[f.perfil]}</Tag>,
      })}
      paraFormulario={(f) => ({ ...f, ativo: !!f.ativo, senha: '' })}
      paraApi={(v) => ({ ...v, senha: v.senha || undefined, login: v.login || null })}
      formulario={(form, item) => (
        <>
          <Row gutter={12}>
            <Col xs={24} md={16}>
              <Form.Item name="nome" label="Nome completo" rules={[{ required: true, message: 'Informe o nome' }]}>
                <Input autoFocus />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="cargo" label="Cargo">
                <Input placeholder="Técnico, ajudante, atendente..." />
              </Form.Item>
            </Col>
            <Col xs={12} md={8}>
              <Form.Item name="cpf" label="CPF" normalize={mascaraDocumento}>
                <Input inputMode="numeric" />
              </Form.Item>
            </Col>
            <Col xs={12} md={8}>
              <Form.Item name="telefone" label="Telefone" {...tel}>
                <Input inputMode="tel" />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="email" label="E-mail">
                <Input inputMode="email" />
              </Form.Item>
            </Col>
            <Col xs={12} md={8}>
              <Form.Item name="cnh" label="CNH">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={12} md={8}>
              <Form.Item name="cnh_validade" label="Validade da CNH">
                <Input type="date" />
              </Form.Item>
            </Col>
          </Row>
          <Divider titlePlacement="start">Acesso ao sistema</Divider>
          <Form.Item name="perfil" label="Perfil">
            <Select options={PERFIS.map((p) => ({ value: p, label: PERFIL_LABEL[p] }))} />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(a, b) => a.perfil !== b.perfil}>
            {() =>
              form.getFieldValue('perfil') !== 'sem_acesso' && (
                <Row gutter={12}>
                  <Col xs={24} md={12}>
                    <Form.Item name="login" label="Login" rules={[{ required: true, message: 'Informe o login' }]} normalize={(v: string) => v?.toLowerCase().replace(/\s/g, '')}>
                      <Input autoComplete="off" autoCapitalize="none" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12}>
                    <Form.Item
                      name="senha"
                      label={item?.tem_senha ? 'Nova senha (deixe vazio para manter)' : 'Senha'}
                      rules={[{ required: !item?.tem_senha, message: 'Defina uma senha' }, { min: 6, message: 'Mínimo de 6 caracteres' }]}
                    >
                      <Input.Password autoComplete="new-password" />
                    </Form.Item>
                  </Col>
                </Row>
              )
            }
          </Form.Item>
          <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
            Administrador: tudo. Atendente: OS, clientes, condomínios e notas. Técnico: apenas as próprias OS e a busca de histórico.
          </Typography.Paragraph>
          <Form.Item name="ativo" label="Ativo" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="observacoes" label="Observações">
            <Input.TextArea rows={2} />
          </Form.Item>
        </>
      )}
    />
  );
}

// ---------------- Veículos ----------------
export function PaginaVeiculos() {
  const { pode } = useAuth();
  return (
    <Cadastro<Veiculo>
      titulo="Veículos"
      tituloItem="Veículo"
      endpoint="/veiculos"
      podeEditar={pode('admin')}
      valoresIniciais={{ ativo: true }}
      colunas={[
        { title: 'Placa', dataIndex: 'placa', render: (v) => <b>{v}</b> },
        { title: 'Veículo', render: (_, v) => [v.marca, v.modelo, v.ano].filter(Boolean).join(' ') },
        { title: 'Tipo / equipamento', render: (_, v) => [v.tipo, v.equipamento].filter(Boolean).join(' · ') },
        { title: 'Responsável', dataIndex: 'responsavel_nome' },
        { title: 'Km', dataIndex: 'km_atual', render: (k) => (k ? k.toLocaleString('pt-BR') : '') },
        { title: 'Situação', dataIndex: 'ativo', width: 100, render: (a) => (a ? <Tag color="green">Ativo</Tag> : <Tag>Inativo</Tag>) },
      ]}
      cartao={(v) => ({
        titulo: `${v.placa} · ${[v.marca, v.modelo].filter(Boolean).join(' ')}`,
        descricao: [v.tipo, v.responsavel_nome].filter(Boolean).join(' · '),
        extra: !v.ativo && <Tag>Inativo</Tag>,
      })}
      paraFormulario={(v) => ({ ...v, ativo: !!v.ativo })}
      paraApi={(v) => ({ ...v, responsavel_id: v.responsavel_id ?? null })}
      formulario={(_, item) => (
        <>
          <Row gutter={12}>
            <Col xs={12} md={6}>
              <Form.Item name="placa" label="Placa" rules={[{ required: true, message: 'Informe a placa' }]} normalize={(v: string) => v?.toUpperCase()}>
                <Input autoFocus />
              </Form.Item>
            </Col>
            <Col xs={12} md={6}>
              <Form.Item name="marca" label="Marca">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={16} md={8}>
              <Form.Item name="modelo" label="Modelo">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={8} md={4}>
              <Form.Item name="ano" label="Ano">
                <InputNumber min={1950} max={2100} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="tipo" label="Tipo">
                <Select
                  allowClear
                  options={['Utilitário', 'Caminhão hidrojato', 'Caminhão vácuo (sugador)', 'Carro de apoio', 'Moto'].map((t) => ({ value: t, label: t }))}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="km_atual" label="Km atual">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="equipamento" label="Equipamentos no veículo">
            <Input.TextArea rows={2} placeholder="Ex.: máquina rotativa, hidrojato 3000 psi, câmera de inspeção" />
          </Form.Item>
          <Form.Item name="responsavel_id" label="Responsável">
            <SelecaoRemota<Funcionario> endpoint="/funcionarios" allowClear extra={{ ativos: 1 }} rotulo={(f) => f.nome} rotuloInicial={item?.responsavel_nome ?? undefined} />
          </Form.Item>
          <Form.Item name="ativo" label="Ativo" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="observacoes" label="Observações (manutenção, documentos...)">
            <Input.TextArea rows={2} />
          </Form.Item>
        </>
      )}
    />
  );
}

