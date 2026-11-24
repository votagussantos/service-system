import { useEffect, useState } from 'react';
import { App, Button, Card, Col, Divider, Form, Input, InputNumber, Row, Select, Skeleton, Typography } from 'antd';
import { SaveOutlined } from '@ant-design/icons';
import { REGIMES_TRIBUTARIOS } from '../../shared/constantes';
import { api } from '../api';
import { CamposEndereco } from '../componentes/Endereco';
import { useDados } from '../hooks';
import { mascaraDocumento, mascaraTelefone } from '../formato';
import type { Empresa } from '../tipos';

export function PaginaEmpresa() {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const { dados, carregando } = useDados<Empresa>('/empresa');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (dados) form.setFieldsValue(dados);
  }, [dados, form]);

  const salvar = async () => {
    const v = await form.validateFields();
    setSalvando(true);
    try {
      await api.put('/empresa', { ...dados, ...v });
      message.success('Dados da empresa salvos.');
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  if (carregando && !dados) return <Skeleton active />;

  return (
    <div style={{ maxWidth: 900 }}>
      <Typography.Title level={3}>Dados da empresa</Typography.Title>
      <Form form={form} layout="vertical" onFinish={salvar}>
        <Card title="Identificação" style={{ marginBottom: 16 }}>
          <Row gutter={12}>
            <Col xs={24} md={12}>
              <Form.Item name="razao_social" label="Razão social">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="nome_fantasia" label="Nome fantasia">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="cnpj" label="CNPJ" normalize={mascaraDocumento}>
                <Input inputMode="numeric" />
              </Form.Item>
            </Col>
            <Col xs={12} md={8}>
              <Form.Item name="inscricao_municipal" label="Inscrição municipal">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={12} md={8}>
              <Form.Item name="inscricao_estadual" label="Inscrição estadual">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={12} md={6}>
              <Form.Item name="telefone" label="Telefone" normalize={mascaraTelefone}>
                <Input inputMode="tel" />
              </Form.Item>
            </Col>
            <Col xs={12} md={6}>
              <Form.Item name="whatsapp" label="WhatsApp" normalize={mascaraTelefone}>
                <Input inputMode="tel" />
              </Form.Item>
            </Col>
            <Col xs={24} md={6}>
              <Form.Item name="email" label="E-mail">
                <Input inputMode="email" />
              </Form.Item>
            </Col>
            <Col xs={24} md={6}>
              <Form.Item name="site" label="Site">
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Divider titlePlacement="start">Endereço</Divider>
          <CamposEndereco form={form} />
        </Card>

        <Card title="Garantia e reincidência" style={{ marginBottom: 16 }}>
          <Row gutter={12}>
            <Col xs={24} md={12}>
              <Form.Item
                name="garantia_padrao_dias"
                label="Garantia padrão (dias)"
                extra="Usada quando o serviço não tem prazo próprio cadastrado."
              >
                <InputNumber min={0} max={3650} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                name="dias_reincidencia"
                label="Janela de reincidência (dias)"
                extra="Novo chamado no mesmo endereço (ou mesmo cliente pessoa física) dentro deste prazo é marcado como reincidência."
              >
                <InputNumber min={1} max={3650} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="texto_os" label="Texto impresso no rodapé da OS" extra="Ex.: termos de garantia, o que não é coberto, formas de pagamento.">
            <Input.TextArea rows={4} />
          </Form.Item>
        </Card>

        <Card title="Dados fiscais (nota de serviço)" style={{ marginBottom: 16 }}>
          <Row gutter={12}>
            <Col xs={24} md={8}>
              <Form.Item name="regime_tributario" label="Regime tributário">
                <Select options={Object.entries(REGIMES_TRIBUTARIOS).map(([value, label]) => ({ value, label }))} />
              </Form.Item>
            </Col>
            <Col xs={12} md={5}>
              <Form.Item name="aliquota_iss" label="Alíquota ISS (%)">
                <InputNumber min={0} max={100} step={0.5} decimalSeparator="," style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={12} md={5}>
              <Form.Item name="codigo_servico_municipal" label="Código do serviço" extra="Ex.: 7.19">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} md={6}>
              <Form.Item name="cnae" label="CNAE">
                <Input />
              </Form.Item>
            </Col>
          </Row>
        </Card>
        <Button type="primary" size="large" icon={<SaveOutlined />} loading={salvando} htmlType="submit">
          Salvar
        </Button>
      </Form>
    </div>
  );
}
