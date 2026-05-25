# Amazon provider

O Mercado Livre continua habilitado por padrao com `ML_ENABLED=true`. A Amazon fica separada e desabilitada por padrao em `.env.example`.

Config minima:

```bash
AMAZON_ENABLED=true
AMAZON_AFFILIATE_TAG="sua-tag-20"
AMAZON_SEARCH_TERMS="alexa promocao, echo dot oferta, air fryer promocao"
```

Modos de execucao:

```bash
# Somente Mercado Livre
ML_ENABLED=true
AMAZON_ENABLED=false
npm run bot

# Somente Amazon
ML_ENABLED=false
AMAZON_ENABLED=true
npm run bot

# Ambos, alternando entre providers
ML_ENABLED=true
AMAZON_ENABLED=true
npm run bot
```

A API local isolada da Amazon roda em porta propria:

```bash
AMAZON_API_PORT=3001
npm run amazon:api
```

Endpoints:

- `GET http://localhost:3001/health`
- `GET http://localhost:3001/amazon/search?term=echo%20dot`
- `POST http://localhost:3001/amazon/run`

A sessao Playwright da Amazon usa caminhos proprios:

- `AMAZON_PLAYWRIGHT_USER_DATA_DIR=./sessions/amazon-profile`
- `AMAZON_PLAYWRIGHT_STORAGE_STATE_PATH=./sessions/amazon-storage-state.json`

Limitacao de afiliado Amazon: sem credenciais oficiais da Product Advertising API ou ferramenta oficial de link, o bot gera o link final aplicando `tag=` na URL canonica do produto. Se a tag nao puder ser validada, ele posta a URL normal do produto, registra fallback no log e nao derruba o ciclo.
