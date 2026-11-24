import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App as AntApp, ConfigProvider } from 'antd';
import ptBR from 'antd/locale/pt_BR';
import { registerSW } from 'virtual:pwa-register';
import { Aplicacao } from './App';
import { ProvedorAuth } from './auth';
import { iniciarSincronizacaoAutomatica } from './offline/fila';
import './estilo.css';

registerSW({ immediate: true });
iniciarSincronizacaoAutomatica();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfigProvider
      locale={ptBR}
      theme={{
        token: {
          colorPrimary: '#0b5cad',
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
  </StrictMode>,
);
