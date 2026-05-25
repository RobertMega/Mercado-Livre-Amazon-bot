# WhatsApp API — Multi-sessão

API REST para envio de mensagens via WhatsApp com suporte a múltiplas sessões, construída com **Fastify**, **Baileys**, **Prisma ORM** e **SQLite**.

---

## 📁 Estrutura do projeto

```
whatsapp-api/
├── prisma/
│   └── schema.prisma          # Schema do banco de dados
├── sessions/                  # Credenciais das sessões (gerado automaticamente)
├── src/
│   ├── controllers/
│   │   ├── session.controller.js
│   │   └── message.controller.js
│   ├── lib/
│   │   └── prisma.js          # Cliente Prisma singleton
│   ├── routes/
│   │   ├── session.routes.js
│   │   ├── message.routes.js
│   │   └── panel.routes.js
│   ├── services/
│   │   └── whatsapp.service.js  # Lógica Baileys / gerenciamento de sessões
│   ├── views/
│   │   └── panel.js           # HTML do painel administrativo
│   └── server.js              # Entry point Fastify
├── .env
├── .gitignore
├── package.json
└── README.md
```

---

## 🚀 Instalação e execução

### 1. Pré-requisitos

- **Node.js 18+**
- **npm**

### 2. Instalar dependências e configurar banco

```bash
npm run setup
```

Isso executa:
- `npm install`
- `prisma db push` (cria o banco SQLite)
- `prisma generate` (gera o client Prisma)

### 3. Iniciar o servidor

```bash
# Produção
npm start

# Desenvolvimento (com hot-reload)
npm run dev
```

O servidor inicia em `http://localhost:3000`.

---

## 🖥️ Painel administrativo

Acesse **`http://localhost:3000`** no navegador.

Funcionalidades:
- Visualizar todas as sessões e seus status em tempo real
- Criar novas sessões
- Visualizar o QR Code para autenticação
- Remover sessões
- Auto-atualização a cada 15 segundos

### Status das sessões

| Status        | Descrição                                     |
|---------------|-----------------------------------------------|
| `connecting`  | Sessão iniciando                              |
| `qr_pending`  | Aguardando leitura do QR Code                 |
| `connected`   | Conectada e pronta para enviar mensagens      |
| `reconnecting`| Reconectando automaticamente após desconexão  |
| `disconnected`| Desconectada / sessão encerrada               |

---

## 📡 Endpoints da API

### Sessões

#### `GET /api/sessions`
Lista todas as sessões.

```json
[
  {
    "id": "empresa-1",
    "name": "empresa-1",
    "status": "connected",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "hasQR": false
  }
]
```

---

#### `POST /api/sessions`
Cria e inicia uma nova sessão.

**Body:**
```json
{ "name": "empresa-1" }
```

**Resposta:**
```json
{ "message": "Session initialization started", "sessionId": "empresa-1" }
```

---

#### `GET /api/sessions/:id`
Retorna detalhes de uma sessão.

---

#### `GET /api/sessions/:id/qr`
Retorna o QR Code em base64 (disponível quando status é `qr_pending`).

```json
{ "qr": "data:image/png;base64,..." }
```

---

#### `DELETE /api/sessions/:id`
Desconecta e remove a sessão (inclusive credenciais salvas).

---

### Mensagens

#### `POST /api/sessions/:id/send/text`
Envia mensagem de texto.

**Body (JSON):**
```json
{
  "to": "5511999999999",
  "text": "Olá! Esta é uma mensagem de teste."
}
```

> O campo `to` aceita número com ou sem `@s.whatsapp.net`.

---

#### `POST /api/sessions/:id/send/image`
Envia uma imagem. Requisição `multipart/form-data`.

**Campos:**
| Campo     | Tipo   | Obrigatório | Descrição           |
|-----------|--------|-------------|---------------------|
| `to`      | text   | ✅           | Número do destinatário |
| `image`   | file   | ✅           | Arquivo de imagem   |
| `caption` | text   | ❌           | Legenda da imagem   |

**Exemplo com curl:**
```bash
curl -X POST http://localhost:3000/api/sessions/empresa-1/send/image \
  -F "to=5511999999999" \
  -F "caption=Confira nossa oferta!" \
  -F "image=@/caminho/para/imagem.jpg"
```

---

#### `POST /api/sessions/:id/send/file`
Envia um arquivo (PDF, DOCX, XLSX, etc.). Requisição `multipart/form-data`.

**Campos:**
| Campo  | Tipo | Obrigatório | Descrição            |
|--------|------|-------------|----------------------|
| `to`   | text | ✅           | Número do destinatário |
| `file` | file | ✅           | Arquivo a enviar     |

**Exemplo com curl:**
```bash
curl -X POST http://localhost:3000/api/sessions/empresa-1/send/file \
  -F "to=5511999999999" \
  -F "file=@/caminho/para/documento.pdf"
```

---

## ⚙️ Variáveis de ambiente

| Variável       | Padrão    | Descrição               |
|----------------|-----------|-------------------------|
| `DATABASE_URL` | `file:./dev.db` | Caminho do SQLite  |
| `PORT`         | `3000`    | Porta do servidor       |
| `HOST`         | `0.0.0.0` | Host de escuta          |

---

## 🔄 Persistência de sessões

As sessões são automaticamente restauradas ao reiniciar o servidor. As credenciais ficam salvas em `sessions/<sessionId>/` e o estado no banco SQLite.

---

## 📝 Notas

- O número de telefone deve incluir DDI + DDD (ex: `5511999999999` para Brasil).
- Tamanho máximo de arquivo: **50MB**.
- Ao deletar uma sessão, as credenciais locais são removidas e é necessário escanear o QR novamente.
- A biblioteca Baileys usa a API não-oficial do WhatsApp Web. Use com responsabilidade.
