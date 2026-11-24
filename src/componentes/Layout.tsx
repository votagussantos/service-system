import { useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { Badge, Button, Drawer, Dropdown, Flex, Layout, Menu, Tag, Tooltip, Typography } from 'antd';
import {
  AppstoreOutlined,
  BankOutlined,
  CarOutlined,
  CloudSyncOutlined,
  DisconnectOutlined,
  DollarOutlined,
  FileDoneOutlined,
  FileTextOutlined,
  HomeOutlined,
  LogoutOutlined,
  MenuOutlined,
  ScheduleOutlined,
  SearchOutlined,
  ShopOutlined,
  TeamOutlined,
  ToolOutlined,
  UserOutlined,
  IdcardOutlined,
} from '@ant-design/icons';
import type { ReactNode } from 'react';
import { PERFIL_LABEL, type Perfil } from '../../shared/constantes';
import { useAuth } from '../auth';
import { useCelular, useOnline } from '../hooks';
import { useFila } from '../offline/fila';

interface ItemMenu {
  key: string;
  label: string;
  icon: ReactNode;
  perfis: Perfil[];
  barra?: boolean;
}

const TODOS: Perfil[] = ['admin', 'atendente', 'tecnico'];
const ESCRITORIO: Perfil[] = ['admin', 'atendente'];

const ITENS: ItemMenu[] = [
  { key: '/', label: 'Início', icon: <HomeOutlined />, perfis: ESCRITORIO, barra: true },
  { key: '/minhas', label: 'Minhas OS', icon: <ScheduleOutlined />, perfis: ['tecnico'], barra: true },
  { key: '/busca', label: 'Busca', icon: <SearchOutlined />, perfis: TODOS, barra: true },
  { key: '/ordens', label: 'Ordens de serviço', icon: <FileTextOutlined />, perfis: ESCRITORIO, barra: true },
  { key: '/clientes', label: 'Clientes', icon: <UserOutlined />, perfis: ESCRITORIO },
  { key: '/condominios', label: 'Condomínios', icon: <BankOutlined />, perfis: ESCRITORIO },
  { key: '/notas', label: 'Notas fiscais', icon: <FileDoneOutlined />, perfis: ESCRITORIO },
  { key: '/servicos', label: 'Serviços', icon: <ToolOutlined />, perfis: ESCRITORIO },
  { key: '/precos', label: 'Tabela de preços', icon: <DollarOutlined />, perfis: TODOS },
  { key: '/funcionarios', label: 'Funcionários', icon: <TeamOutlined />, perfis: ['admin'] },
  { key: '/veiculos', label: 'Veículos', icon: <CarOutlined />, perfis: ESCRITORIO },
  { key: '/empresa', label: 'Empresa', icon: <ShopOutlined />, perfis: ['admin'] },
];

function IndicadorConexao() {
  const online = useOnline();
  const { fila, sincronizando } = useFila();
  if (!online)
    return (
      <Tooltip title={fila.length ? `${fila.length} ação(ões) guardadas no celular` : 'Sem internet'}>
        <Tag color="orange" icon={<DisconnectOutlined />}>
          Offline{fila.length ? ` · ${fila.length}` : ''}
        </Tag>
      </Tooltip>
    );
  if (fila.length || sincronizando)
    return (
      <Tag color="processing" icon={<CloudSyncOutlined spin />}>
        Enviando {fila.length || ''}
      </Tag>
    );
  return null;
}

export function LayoutPrincipal() {
  const { usuario, sair } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const celular = useCelular();
  const [menuAberto, setMenuAberto] = useState(false);
  if (!usuario) return null;

  const itens = ITENS.filter((i) => i.perfis.includes(usuario.perfil));
  const ativo =
    itens
      .map((i) => i.key)
      .filter((k) => (k === '/' ? loc.pathname === '/' : loc.pathname.startsWith(k)))
      .sort((a, b) => b.length - a.length)[0] ?? '';

  const menuUsuario = {
    items: [
      { key: 'conta', icon: <IdcardOutlined />, label: 'Minha conta / senha' },
      { type: 'divider' as const },
      { key: 'sair', icon: <LogoutOutlined />, label: 'Sair', danger: true },
    ],
    onClick: ({ key }: { key: string }) => (key === 'sair' ? void sair() : nav('/conta')),
  };

  const menu = (
    <Menu
      mode="inline"
      selectedKeys={[ativo]}
      items={itens.map((i) => ({ key: i.key, icon: i.icon, label: i.label }))}
      onClick={({ key }) => {
        nav(key);
        setMenuAberto(false);
      }}
      style={{ borderInlineEnd: 0 }}
    />
  );

  const cabecalho = (
    <Flex align="center" justify="space-between" className="cabecalho" gap={8}>
      <Flex align="center" gap={8} style={{ minWidth: 0 }}>
        {celular && <Button type="text" icon={<MenuOutlined />} aria-label="Menu" onClick={() => setMenuAberto(true)} />}
        <img src="/icone.svg" alt="" width={28} height={28} />
        <Typography.Text strong ellipsis style={{ fontSize: 16 }}>
          Controle de Serviços
        </Typography.Text>
      </Flex>
      <Flex align="center" gap={8}>
        <IndicadorConexao />
        <Dropdown menu={menuUsuario} trigger={['click']}>
          <Button type="text" icon={<UserOutlined />}>
            {!celular && <span>{usuario.nome.split(' ')[0]}</span>}
          </Button>
        </Dropdown>
      </Flex>
    </Flex>
  );

  if (celular) {
    const barra = itens.filter((i) => i.barra).slice(0, 4);
    return (
      <Layout className="layout-celular">
        {cabecalho}
        <Layout.Content className="conteudo">
          <Outlet />
        </Layout.Content>
        <nav className="barra-inferior">
          {barra.map((i) => (
            <button key={i.key} className={ativo === i.key ? 'ativo' : ''} onClick={() => nav(i.key)}>
              {i.icon}
              <span>{i.label.replace('Ordens de serviço', 'Ordens')}</span>
            </button>
          ))}
          <button onClick={() => setMenuAberto(true)}>
            <Badge dot={false}>
              <AppstoreOutlined />
            </Badge>
            <span>Mais</span>
          </button>
        </nav>
        <Drawer
          open={menuAberto}
          onClose={() => setMenuAberto(false)}
          placement="left"
          size={280}
          title={
            <div>
              <div>{usuario.nome}</div>
              <Typography.Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}>
                {PERFIL_LABEL[usuario.perfil]}
              </Typography.Text>
            </div>
          }
          styles={{ body: { padding: 0 } }}
        >
          {menu}
          <Menu
            mode="inline"
            selectable={false}
            items={menuUsuario.items}
            onClick={(e) => {
              setMenuAberto(false);
              menuUsuario.onClick(e);
            }}
            style={{ borderInlineEnd: 0, marginTop: 16 }}
          />
        </Drawer>
      </Layout>
    );
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Layout.Sider width={230} theme="light" className="menu-lateral">
        <Flex align="center" gap={8} style={{ padding: '18px 20px' }}>
          <img src="/icone.svg" alt="" width={30} height={30} />
          <Typography.Text strong style={{ fontSize: 15 }}>
            Controle de Serviços
          </Typography.Text>
        </Flex>
        {menu}
      </Layout.Sider>
      <Layout>
        <Flex align="center" justify="flex-end" className="cabecalho" gap={8}>
          <IndicadorConexao />
          <Dropdown menu={menuUsuario} trigger={['click']}>
            <Button type="text" icon={<UserOutlined />}>
              {usuario.nome} <Typography.Text type="secondary">· {PERFIL_LABEL[usuario.perfil]}</Typography.Text>
            </Button>
          </Dropdown>
        </Flex>
        <Layout.Content className="conteudo">
          <Outlet />
        </Layout.Content>
      </Layout>
    </Layout>
  );
}
