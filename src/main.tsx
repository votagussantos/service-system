import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App as AntApp, ConfigProvider, theme } from 'antd';
import ptBR from 'antd/locale/pt_BR';
import { registerSW } from 'virtual:pwa-register';
import { Aplicacao } from './App';
import { ProvedorAuth } from './auth';
import { ProvedorTema, useTema } from './tema';
import { iniciarSincronizacaoAutomatica } from './offline/fila';
import './estilo.css';

registerSW({ immediate: true });
iniciarSincronizacaoAutomatica();

function Raiz() {
  const { escuro } = useTema();
  return (
    <ConfigProvider
      locale={ptBR}
      theme={{
        algorithm: escuro ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          colorPrimary: escuro ? '#3b8ee6' : '#0b5cad',
          borderRadius: 8,
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
        },
        components: {
          Card: { headerFontSize: 15 },
        },
      }}
    >
      <AntApp>
        <BrowserRouter>
          <ProvedorAuth>
            <Aplicacao />
          </ProvedorAuth>
        </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ProvedorTema>
      <Raiz />
    </ProvedorTema>
  </StrictMode>,
);
