# Controle de Serviços — Desentupidora

Sistema para controlar ordens de serviço, clientes, garantias e notas fiscais de uma empresa de desentupimento.
Funciona no computador (escritório) e no celular (técnicos em campo), inclusive **sem internet**.

## O que o sistema faz

| Área | Funcionalidades |
|---|---|
| **Ordens de serviço** | Abertura com cliente, local, problema, agendamento, técnico, ajudante e veículo. Itens da tabela de preços, desconto, pagamento. Iniciar, concluir, cancelar, reabrir. Impressão / PDF para o cliente. |
| **Busca de histórico** | Por cliente (nome, telefone, CPF/CNPJ), endereço ou condomínio. Ignora acentos e abreviações (“av sao joao 100” acha “Avenida São João, 100”). Mostra se o cliente já foi atendido, se está **em garantia** e se é **reincidência**. |
| **Aviso na abertura da OS** | Ao escolher cliente/endereço, o sistema avisa: primeiro atendimento, serviços anteriores, garantia vigente (com botão “É retorno em garantia”) e reincidência. |
| **Garantia** | Prazo por tipo de serviço (ou padrão da empresa). Ao concluir, calcula “garantia até”. Retorno em garantia fica vinculado à OS original, sem cobrança e sem estender o prazo. |
| **Reincidência** | Novo chamado no mesmo endereço (logradouro + número + unidade) ou mesmo cliente pessoa física dentro da janela configurada (padrão 90 dias). |
| **Celular do técnico** | “Minhas OS” do dia, mapa, ligar, WhatsApp, fotos antes/depois (comprimidas no celular), serviço executado, itens, pagamento, assinatura do cliente na tela. Tudo funciona offline e sincroniza sozinho quando a internet volta. Instalável como app (PWA). |
| **Cadastros** | Empresa, clientes, condomínios, serviços, tabela de preços, funcionários (com login e perfil) e veículos. CEP preenche o endereço automaticamente. |
| **Notas fiscais (NFS-e)** | Por enquanto **apenas registro**: gera os dados da nota a partir da OS concluída (discriminação, valor, ISS), você emite no portal da prefeitura e lança número e código de verificação. |

### Perfis de acesso

- **Administrador**: tudo, inclusive funcionários, empresa, serviços e preços.
- **Atendente**: OS, clientes, condomínios, notas e busca. Consulta serviços, preços e veículos.
- **Técnico**: só as próprias OS (tela de atendimento) e a busca de histórico (sem valores de outras OS).
- **Sem acesso**: funcionário cadastrado só para constar nas OS (ex.: ajudante).

## Tecnologia

- **Front-end**: React + TypeScript + Ant Design, Vite, PWA (vite-plugin-pwa / Workbox), IndexedDB para o modo offline.
- **API**: Cloudflare Workers com Hono e validação com Zod.
- **Banco**: Cloudflare D1 (SQLite). **Fotos e assinaturas**: Cloudflare R2.
- Tudo é publicado como **um único Worker** (site + API) no plano gratuito da Cloudflare.

```
src/        telas (React)
  paginas/  telas do sistema    componentes/  peças reutilizáveis    offline/  fila offline do técnico
worker/     API (Cloudflare Worker)
  rotas/    endpoints           lib/  autenticação, regras de garantia/reincidência, busca
shared/     constantes usadas pelos dois lados
migrations/ estrutura do banco (D1)
test/       testes da API
scripts/    dados de exemplo
```

## Rodar no computador (desenvolvimento)

Requisitos: Node.js 22 ou mais novo.

```bash
npm install
```

```bash
npm run db:migrate:local
```

```bash
npm run dev
```

Abra http://localhost:5173. No primeiro acesso, o sistema pede para criar o usuário administrador.

Para carregar dados de exemplo (com o `npm run dev` rodando, em outro terminal):

```bash
node scripts/dados-exemplo.mjs
```

Logins de exemplo: `admin/admin123`, `fernanda/fernanda123` (atendente), `carlos/carlos123` e `rafael/rafael123` (técnicos).

Testes da API e checagem de tipos:

```bash
npm test
```

```bash
npm run typecheck
```

## Publicar na Cloudflare (gratuito)

1. Crie uma conta em https://dash.cloudflare.com e faça login pelo terminal:

   ```bash
   npx wrangler login
   ```

2. Crie o banco de dados e copie o `database_id` exibido para o arquivo `wrangler.jsonc`:

   ```bash
   npx wrangler d1 create service-system
   ```

3. Crie o armazenamento de fotos (na primeira vez a Cloudflare pede para ativar o R2 no painel, sem custo no plano gratuito):

   ```bash
   npx wrangler r2 bucket create service-system-arquivos
   ```

4. Crie as tabelas no banco da nuvem:

   ```bash
   npm run db:migrate:remote
   ```

5. Publique:

   ```bash
   npm run deploy
   ```

**Publicação automática pelo GitHub (Workers Builds)** — em *Workers & Pages → Create → Import a repository*:

| Campo | Valor |
|---|---|
| Build command | `npm run build` |
| Deploy command | `npx wrangler d1 migrations apply service-system --remote && npx wrangler deploy` |
| Preview builds | desligado (as prévias usariam o banco de produção) |

O banco (D1 `service-system`) e o bucket R2 (`service-system-arquivos`) precisam existir antes do primeiro deploy.

O endereço final aparece no terminal (algo como `https://service-system.<sua-conta>.workers.dev`).
Dá para usar um domínio próprio em *Workers & Pages → service-system → Settings → Domains*.
No primeiro acesso, crie o administrador e cadastre os funcionários.

**No celular do técnico**: abra o endereço no Chrome (Android) ou Safari (iPhone), entre com o login dele e use
“Adicionar à tela inicial”. O sistema abre como um app e funciona sem internet nas OS já baixadas.

### Limites do plano gratuito

100 mil requisições por dia, 5 GB de banco e 10 GB de fotos — muito acima do uso de uma empresa pequena.
O banco pode ser restaurado para qualquer momento dos últimos 7 dias (*D1 Time Travel*):

```bash
npx wrangler d1 time-travel info service-system
```

## Observações importantes

- **NFS-e**: o sistema não emite a nota sozinho. A emissão real exige integração com a prefeitura (ou o
  emissor nacional) e certificado digital A1, que podem ser adicionados depois — os dados necessários já
  ficam registrados.
- **Offline**: vale para o técnico executar as OS que já estão no celular. Abrir OS nova ou cadastrar cliente
  exige internet. Se o escritório mudar algo que conflite (ex.: cancelar a OS), o técnico vê um aviso
  quando o celular sincronizar.
- **Senhas**: guardadas com PBKDF2 (50 mil iterações, para caber no limite de processamento do plano gratuito).
  Com plano pago, dá para aumentar em `worker/lib/auth.ts` sem invalidar senhas existentes.
- **Fuso horário**: datas calculadas no horário de Brasília (America/Sao_Paulo).
