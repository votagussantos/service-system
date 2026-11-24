import { Col, Form, Input, Row, Select, type FormInstance } from 'antd';
import { UFS } from '../../shared/constantes';
import { mascaraCep, soDigitos } from '../formato';

/** Campos de endereço com preenchimento automático pelo CEP (ViaCEP). */
export function CamposEndereco({ form, campoNumero = 'numero', comComplemento = true }: { form: FormInstance; campoNumero?: string; comComplemento?: boolean }) {
  const buscarCep = async (valor: string) => {
    const cep = soDigitos(valor);
    if (cep.length !== 8) return;
    try {
      const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const d = await r.json();
      if (d.erro) return;
      form.setFieldsValue({ logradouro: d.logradouro, bairro: d.bairro, cidade: d.localidade, uf: d.uf });
    } catch {
      // sem internet ou serviço fora do ar — preenche manualmente
    }
  };
  return (
    <Row gutter={12}>
      <Col xs={12} md={6}>
        <Form.Item label="CEP" name="cep" normalize={mascaraCep}>
          <Input inputMode="numeric" placeholder="00000-000" onChange={(e) => buscarCep(e.target.value)} />
        </Form.Item>
      </Col>
      <Col xs={24} md={12}>
        <Form.Item label="Logradouro" name="logradouro">
          <Input placeholder="Rua, avenida..." />
        </Form.Item>
      </Col>
      <Col xs={8} md={6}>
        <Form.Item label="Número" name={campoNumero}>
          <Input />
        </Form.Item>
      </Col>
      {comComplemento && (
        <Col xs={16} md={8}>
          <Form.Item label="Complemento" name="complemento">
            <Input placeholder="Casa 2, fundos..." />
          </Form.Item>
        </Col>
      )}
      <Col xs={24} md={comComplemento ? 6 : 10}>
        <Form.Item label="Bairro" name="bairro">
          <Input />
        </Form.Item>
      </Col>
      <Col xs={16} md={comComplemento ? 6 : 10}>
        <Form.Item label="Cidade" name="cidade">
          <Input />
        </Form.Item>
      </Col>
      <Col xs={8} md={4}>
        <Form.Item label="UF" name="uf">
          <Select showSearch allowClear options={UFS.map((u) => ({ value: u, label: u }))} />
        </Form.Item>
      </Col>
    </Row>
  );
}
