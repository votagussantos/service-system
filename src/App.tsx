import { Navigate, Route, Routes } from 'react-router';
import { Spin } from 'antd';
import type { ReactNode } from 'react';
import type { Perfil } from '../shared/constantes';
import { useAuth } from './auth';
import { LayoutPrincipal } from './componentes/Layout';
import { PaginaConta, PaginaLogin } from './paginas/Acesso';
import { PaginaBusca } from './paginas/Busca';
import { PaginaClientes, PaginaCondominios, PaginaFuncionarios, PaginaPrecos, PaginaServicos, PaginaVeiculos } from './paginas/Cadastros';
import { PaginaEmpresa } from './paginas/Empresa';
import { PaginaInicio } from './paginas/Inicio';
import { PaginaNotas } from './paginas/Notas';
import { PaginaOrdemDetalhe } from './paginas/OrdemDetalhe';
import { PaginaOrdemForm } from './paginas/OrdemForm';
import { PaginaOrdemImprimir } from './paginas/OrdemImprimir';
import { PaginaOrdens } from './paginas/Ordens';
import { PaginaAtendimento, PaginaMinhasOS } from './paginas/Tecnico';

function Restrito({ perfis, children }: { perfis: Perfil[]; children: ReactNode }) {
  const { pode } = useAuth();
  return pode(...perfis) ? children : <Navigate to="/" replace />;
}

export function Aplicacao() {
  const { carregando, usuario } = useAuth();
  if (carregando)
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <Spin size="large" />
      </div>
    );
  if (!usuario) return <PaginaLogin />;

  const escritorio: Perfil[] = ['admin', 'atendente'];
  const tecnico = usuario.perfil === 'tecnico';

  return (
    <Routes>
      <Route path="/ordens/:id/imprimir" element={<PaginaOrdemImprimir />} />
      <Route element={<LayoutPrincipal />}>
        <Route index element={tecnico ? <Navigate to="/minhas" replace /> : <PaginaInicio />} />
        <Route path="busca" element={<PaginaBusca />} />
        <Route path="minhas" element={<PaginaMinhasOS />} />
        <Route path="minhas/:id" element={<PaginaAtendimento />} />
        <Route path="ordens" element={<Restrito perfis={escritorio}><PaginaOrdens /></Restrito>} />
        <Route path="ordens/nova" element={<Restrito perfis={escritorio}><PaginaOrdemForm /></Restrito>} />
        <Route path="ordens/:id" element={tecnico ? <RedirecionarAtendimento /> : <PaginaOrdemDetalhe />} />
        <Route path="ordens/:id/editar" element={<Restrito perfis={escritorio}><PaginaOrdemForm /></Restrito>} />
        <Route path="clientes" element={<Restrito perfis={escritorio}><PaginaClientes /></Restrito>} />
        <Route path="condominios" element={<Restrito perfis={escritorio}><PaginaCondominios /></Restrito>} />
        <Route path="servicos" element={<Restrito perfis={escritorio}><PaginaServicos /></Restrito>} />
        <Route path="precos" element={<PaginaPrecos />} />
        <Route path="funcionarios" element={<Restrito perfis={['admin']}><PaginaFuncionarios /></Restrito>} />
        <Route path="veiculos" element={<Restrito perfis={escritorio}><PaginaVeiculos /></Restrito>} />
        <Route path="empresa" element={<Restrito perfis={['admin']}><PaginaEmpresa /></Restrito>} />
        <Route path="notas" element={<Restrito perfis={escritorio}><PaginaNotas /></Restrito>} />
        <Route path="conta" element={<PaginaConta />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

function RedirecionarAtendimento() {
  const id = location.pathname.split('/')[2];
  return <Navigate to={`/minhas/${id}`} replace />;
}
