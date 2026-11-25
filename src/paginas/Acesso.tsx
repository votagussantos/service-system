import { useState } from 'react';
import { App, Button, Card, Form, Input, Segmented, Typography } from 'antd';
import { LockOutlined, UserOutlined } from '@ant-design/icons';
import { api } from '../api';
import { useAuth } from '../auth';
import { OPCOES_TEMA, useTema } from '../tema';

export function PaginaLogin() {
  const { entrar, precisaConfigurar, configurar } = useAuth();
  const { message } = App.useApp();
  const [enviando, setEnviando] = useState(false);

  const enviar = async (v: { nome?: string; login: string; senha: string }) => {
    setEnviando(true);
    try {
      if (precisaConfigurar) await configurar(v.nome!, v.login, v.senha);
      else await entrar(v.login, v.senha);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="tela-login">
      <Card>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <img src="/icone.svg" alt="" width={56} height={56} />
          <Typography.Title level={3} style={{ margin: '12px 0 4px' }}>
            Controle de Serviços
          </Typography.Title>
          <Typography.Text type="secondary">
            {precisaConfigurar ? 'Primeiro acesso: crie o usuário administrador' : 'Entre com seu login'}
          </Typography.Text>
        </div>
        <Form layout="vertical" size="large" onFinish={enviar} requiredMark={false}>
          {precisaConfigurar && (
            <Form.Item name="nome" label="Seu nome" rules={[{ required: true, message: 'Informe seu nome' }]}>
              <Input autoFocus />
            </Form.Item>
          )}
          <Form.Item name="login" label="Login" rules={[{ required: true, message: 'Informe o login' }]}>
            <Input prefix={<UserOutlined />} autoCapitalize="none" autoComplete="username" autoFocus={!precisaConfigurar} />
          </Form.Item>
          <Form.Item
            name="senha"
            label="Senha"
            rules={[{ required: true, message: 'Informe a senha' }, ...(precisaConfigurar ? [{ min: 6, message: 'Mínimo de 6 caracteres' }] : [])]}
          >
            <Input.Password prefix={<LockOutlined />} autoComplete={precisaConfigurar ? 'new-password' : 'current-password'} />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={enviando}>
            {precisaConfigurar ? 'Criar administrador e entrar' : 'Entrar'}
          </Button>
        </Form>
      </Card>
    </div>
  );
}

export function PaginaConta() {
  const { usuario, sair } = useAuth();
  const { modo, setModo } = useTema();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [enviando, setEnviando] = useState(false);
  return (
    <div style={{ maxWidth: 480 }}>
      <Typography.Title level={3}>Minha conta</Typography.Title>
      <Card style={{ marginBottom: 16 }}>
        <Typography.Paragraph style={{ margin: 0 }}>
          <b>{usuario?.nome}</b>
          <br />
          Login: {usuario?.login}
        </Typography.Paragraph>
      </Card>
      <Card title="Aparência" style={{ marginBottom: 16 }}>
        <Segmented block value={modo} options={OPCOES_TEMA} onChange={(v) => setModo(v)} />
        <Typography.Paragraph type="secondary" style={{ margin: '8px 0 0', fontSize: 12 }}>
          Automático segue o modo claro/escuro do celular ou computador. Vale só para este aparelho.
        </Typography.Paragraph>
      </Card>
      <Card title="Trocar senha">
        <Form
          form={form}
          layout="vertical"
          onFinish={async (v) => {
            setEnviando(true);
            try {
              await api.post('/auth/senha', { senha_atual: v.senha_atual, nova_senha: v.nova_senha });
              message.success('Senha alterada.');
              form.resetFields();
            } catch (e) {
              message.error((e as Error).message);
            } finally {
              setEnviando(false);
            }
          }}
        >
          <Form.Item name="senha_atual" label="Senha atual" rules={[{ required: true, message: 'Informe a senha atual' }]}>
            <Input.Password autoComplete="current-password" />
          </Form.Item>
          <Form.Item name="nova_senha" label="Nova senha" rules={[{ required: true, message: 'Informe a nova senha' }, { min: 6, message: 'Mínimo de 6 caracteres' }]}>
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Form.Item
            name="confirmar"
            label="Confirme a nova senha"
            dependencies={['nova_senha']}
            rules={[
              { required: true, message: 'Confirme a senha' },
              ({ getFieldValue }) => ({
                validator: (_, v) => (v === getFieldValue('nova_senha') ? Promise.resolve() : Promise.reject(new Error('As senhas não conferem'))),
              }),
            ]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={enviando}>
            Salvar nova senha
          </Button>
        </Form>
      </Card>
      <Button danger block style={{ marginTop: 24 }} onClick={() => void sair()}>
        Sair do sistema
      </Button>
    </div>
  );
}
