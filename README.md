# Financeiro

App local de controle financeiro. Sincroniza saldos, investimentos e lançamentos dos bancos via Meu Pluggy (Open Finance,
somente leitura) e mostra gastos por cartão e Pix, contas a pagar, o resultado do mês, o histórico por ano e mês e a
previsão dos próximos meses com as compras parceladas, com backup em JSON. A única entrada manual é quanto entrou no mês.

Node 24 · Hono · SQLite (`node:sqlite`) · React + Vite · Docker

## Requisitos

- Docker Desktop
- Conta em [meu.pluggy.ai](https://meu.pluggy.ai) com os bancos conectados
- Conta em [dashboard.pluggy.ai](https://dashboard.pluggy.ai) com uma aplicação criada e o conector **MeuPluggy** habilitado

## Credenciais (.env)

Crie o `.env` na raiz a partir do exemplo:

```bash
cp .env.example .env
```

| Variável | Descrição |
|---|---|
| `PLUGGY_CLIENT_ID` | Client ID da aplicação (dashboard.pluggy.ai → Aplicação) |
| `PLUGGY_CLIENT_SECRET` | Client Secret da mesma aplicação |
| `APP_PORT` | Porta local, padrão `47815` |
| `APP_HTTP_PORT` | Porta do endereço sem número (`financeiro.localhost`), padrão `80` |
| `SYNC_DAYS_BACK` | Dias buscados na primeira sincronização, padrão `90` |
| `SYNC_INTERVAL_HOURS` | Intervalo da sincronização automática, padrão `6` |

O `.env` está no `.gitignore`.

## Rodando

```bash
docker compose up -d --build
```

Acesse **http://financeiro.localhost** (ou http://localhost:47815). Só a sua máquina acessa. Os dados ficam em `./data`.
Depois de alterar o `.env`, rode `docker compose up -d` de novo.

O endereço `financeiro.localhost` não precisa de configuração: Chrome, Edge e Firefox mandam qualquer `*.localhost`
para a própria máquina, e o container atende na porta 80. Se outro projeto precisar da porta 80, troque
`APP_HTTP_PORT` no `.env` (o endereço passa a ser `http://financeiro.localhost:<porta>`).

## Conectando os bancos

Guias completos, com prints:
[docs/configurar-pluggy.md](docs/configurar-pluggy.md) (contas na Pluggy) e
[docs/configurar-app.md](docs/configurar-app.md) (bancos no app e um tour por todas as telas).
Os mockups do visual ficam em [docs/design](docs/design/README.md).

1. Na aplicação do dashboard da Pluggy, autorize cada banco pelo conector **MeuPluggy**. Cada autorização gera um `itemId`.
2. No app, vá em **Configurações → Bancos conectados** e cole o `itemId` com o nome do banco.
3. Em **Configurações**, informe seu nome como aparece nos extratos, para ignorar transferências entre suas contas.

O plano gratuito permite até 5 conexões e a Pluggy atualiza os dados 1x por dia.

## Desenvolvimento

```bash
npm install
npm run dev:server   # API em :47815
npm run dev:web      # interface em :47816
```

## Testes

```bash
npm test
```

Sobe um simulador da Pluggy (`tests/mock-pluggy.mjs`, só dados fictícios) e um servidor de teste com banco temporário,
e roda `tests/e2e.mjs`: validações, sincronização, regras, dashboard, lançamentos, entradas, contas a pagar,
sugestões, histórico, previsão, backup e proteção contra pedidos de outros sites. Não toca em `data/` nem no
container. Os testes fixam a data em 31/10/2026 (`FINANCEIRO_TODAY`) para os dados do simulador não envelhecerem.
