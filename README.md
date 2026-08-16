# 💚 Loop © — Discord Autonomous Sales & Server Operating System

<div align="center">

```
  ██╗      ██████╗  ██████╗  ██████╗ 
  ██║     ██╔═══██╗██╔═══██╗██╔══██╗
  ██║     ██║   ██║██║   ██║██████╔╝
  ██║     ██║   ██║██║   ██║██╔═══╝ 
  ███████╗╚██████╔╝╚██████╔╝██║     
  ╚══════╝ ╚═════╝  ╚═════╝ ╚═╝     
```

### **A Próxima Geração de Bots de Vendas e Operação Autônoma para Discord**
*Next-Generation Brazilian & Global Discord Sales Bot, Digital Wallet Engine, Escrow Hub, and Autonomous Server OS.*

[![License: MIT](https://img.shields.io/badge/License-MIT-00ff66.svg?style=for-the-badge&logo=opensourceinitiative&logoColor=black)](LICENSE)
[![Discord.js v14](https://img.shields.io/badge/Discord.js-v14.18.0-00ff66.svg?style=for-the-badge&logo=discord&logoColor=black)](https://discord.js.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16%20%2B%20pgvector-00ff66.svg?style=for-the-badge&logo=postgresql&logoColor=black)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-7.2%20BullMQ-00ff66.svg?style=for-the-badge&logo=redis&logoColor=black)](https://redis.io/)
[![Build & Tests](https://img.shields.io/badge/Tests-151%20Passed%20100%25-00ff66.svg?style=for-the-badge&logo=checkmarx&logoColor=black)]()

</div>

---

## ⚡ Visão Geral / Overview

**Loop ©** é a infraestrutura definitiva para automação comercial, governança e inteligência artificial no Discord. Projetado especificamente para o ecossistema brasileiro e internacional, o Loop substitui múltiplos bots fragmentados por um **Sistema Operacional Unificado** de altíssima performance, com interfaces nativas **Discord Components V2**, compensação instantânea via **PIX Copia e Cola**, carteira digital integrada, sistema de custódia (escrow), inteligência artificial autônoma com memória semântica e proteção anti-raid de nível militar.

---

## 🚀 Destaques & Funcionalidades Exclusivas

### 🇧🇷 1. Motor de Pagamentos PIX & Checkout Híbrido
* **Padrão BCB EMVCo TLV:** Geração estrita de payloads PIX Copia e Cola e QR Code dinâmicos com cálculo automático de CRC16 e expiração parametrizável.
* **Gateways Integrados:** Compatibilidade nativa com Mercado Pago, Efi (Gerencianet) e Ingress Webhook de alta velocidade com assinatura HMAC criptográfica.
* **Checkout Multimeios:** Suporte unificado para PIX Instantâneo, Saldo em Carteira Digital, Criptomoedas (LTC, BTC, USDT, Solana, TRX) e Cartão de Crédito/Stripe.
* **Entrega Automática & Split:** Dispensação instantânea de chaves seriais, cargos VIP, arquivos digitais ou produtos físicos com divisão automática de comissões para múltiplos vendedores (`/vendor`).

### 📟 2. Carteira Digital P2P & Sistema de Custódia (Escrow)
* **Carteira Digital Integrada (`/wallet`):** Saldo em Reais (BRL) e Dólares (USD), histórico de extrato detalhado, depósito PIX, saque bancário, resgate de Gift Cards/Seriais e download de extrato digital em tempo real.
* **Sistema de Custódia Intermediada (`/escrow`):** Transações P2P seguras entre membros com retenção de fundos em cofre virtual blindado, confirmação de entrega do vendedor, liberação pelo comprador e mediação de disputas pela moderação.

### 🤖 3. Inteligência Artificial Autônoma & Memória Semântica
* **Loop AI Studio (`/ai`):** Personas dinâmicas customizáveis com alternância em tempo real (Suporte Técnico, Vendedor Agressivo, Concierge VIP, Especialista em Produtos).
* **Base de Conhecimento RAG (Vector Search):** Indexação e ingestão de documentos com busca semântica vetorial alimentada por `pgvector` em PostgreSQL.
* **Failover & Streaming Multi-Provedor:** Roteamento resiliente entre OpenAI GPT-4o, Anthropic Claude 3.5 Sonnet, Google Gemini 1.5 Pro e modelos locais via Ollama/vLLM com suporte a Server-Sent Events (SSE).
* **Governança Segura & Rollback:** Planejamento autônomo com verificação de limites orçamentários, aprovação em dois fatores pelo dono do servidor e reversão de execuções com um clique (`/task`).

### 🛡️ 4. Segurança Avançada, Anti-Raid & Moderação 360°
* **AutoMod Inteligente (`/automod`):** Detecção e punição automática contra anti-spam, flood, convites de servidores não autorizados, links suspeitos, menções massivas e caps lock excessivo.
* **Escudo Anti-Nuke & Quarentena (`/security`):** Monitoramento contínuo com isolamento preventivo e rate-limits para proteção contra perda de canais, cargos e expulsão em massa.
* **Verificação Humanizada (`/verify`):** Desafios matemáticos com hashing `scrypt` salgado em memória (zero armazenamento em texto puro) e integração OAuth2 para backup de membros.
* **Central de Modmail (`/modmail`):** Atendimento privado via DM integrado em tópicos de suporte sigilosos no servidor com transcrição completa.
* **Backups de Servidor (`/backup`):** Criação e restauração de snapshots estruturais completos (canais, categorias, permissões, cargos e webhooks).

### 🎮 5. Ferramentas para Criadores & Roblox Studio
* **Calculadora Roblox 70/30 (`/roblox`):** Cálculo automatizado de taxas da plataforma para Gamepasses e Roupas, com suporte a taxa padrão (30%) e modo DevEx.
* **Vínculo de Contas:** Verificação e associação de perfis do Roblox diretamente com a conta do Discord.

---

## 📋 Catálogo Completo de Comandos Slash (37 Comandos)

| Comando | Categoria | Descrição |
|---|---|---|
| `/panel` | 🎛️ **Controle** | Painel de controle operacional central com 5 categorias aninhadas (Comércio, Segurança, IA, Atendimento, Backups). |
| `/store` | 🛒 **Comércio** | Vitrine comercial interativa com catálogo de produtos, categorias e botão de compra rápida. |
| `/cart` | 🛒 **Comércio** | Gerenciador de carrinho de compras com cálculo de cupom, seleção de quantidade e checkout PIX. |
| `/product` | 🛒 **Comércio** | Gerenciamento administrativo de produtos, SKUs, variantes, estoque e regras de uso. |
| `/orders` | 🛒 **Comércio** | Consulta de histórico de pedidos, comprovantes e status de entrega. |
| `/coupon` | 🛒 **Comércio** | Criação e gerenciamento de cupons de desconto (percentual ou valor fixo) com limite de uso. |
| `/license` | 🛒 **Comércio** | Gestão de estoque de chaves seriais e licenças de software com dispensação automatizada. |
| `/sales` | 📊 **Comércio** | Relatórios analíticos de vendas, faturamento total, ticket médio e produtos mais vendidos. |
| `/storeconfig` | ⚙️ **Comércio** | Configuração do canal de vitrine, canal de log de vendas e notificações automáticas. |
| `/vendor` | 🤝 **Comércio** | Registro de múltiplos vendedores parceiros e divisão automatizada de receitas (split de pagamento). |
| `/pix` | 🇧🇷 **Financeiro** | Central de pagamentos instantâneos PIX (geração de QR Code, chave estática e verificação). |
| `/wallet` | 📟 **Financeiro** | Carteira digital para depósitos, transferências P2P, saques PIX e extrato bancário. |
| `/escrow` | 🛡️ **Financeiro** | Sistema de custódia segura para transações P2P com garantia e mediação de disputas. |
| `/loyalty` | 💎 **Marketing** | Sistema VIP com níveis de fidelidade e cashback automático creditado na carteira a cada compra. |
| `/marketing` | ⚡ **Marketing** | Criação de Flash Drops com contagem regressiva e visualização de avaliações de clientes. |
| `/affiliate` | 🔗 **Marketing** | Sistema de afiliados com links de indicação e comissão automática em saldo de carteira. |
| `/ranking` | 🏆 **Marketing** | Tabela de classificação e ranking dos maiores compradores do servidor. |
| `/ai` | 🤖 **Inteligência** | Central do Loop AI Studio para configuração de personas, ingestão de conhecimento e sandbox. |
| `/task` | 🧠 **Autonomia** | Execução e planejamento autônomo de tarefas complexas no servidor com governança e aprovação. |
| `/security` | 🛡️ **Segurança** | Painel de defesa, níveis de anti-raid, quarentena de incidentes e lista branca de moderadores. |
| `/automod` | 🛡️ **Segurança** | Regras automatizadas contra spam, flood, links não autorizados e menções em massa. |
| `/backup` | 💾 **Segurança** | Criação de snapshots do servidor e estatísticas de backup de membros via OAuth2. |
| `/verify` | 🔒 **Segurança** | Sistema de verificação anti-bot com captcha matemático salgado e regras do servidor. |
| `/ticket` | 🎫 **Atendimento** | Central de suporte via tickets com transcrição, avaliação de satisfação e respostas prévias. |
| `/modmail` | 📬 **Atendimento** | Sistema de atendimento sigiloso via mensagens diretas (DM) sincronizado com canais da equipe. |
| `/channel` | ⏰ **Operacional** | Configuração de horários de funcionamento do servidor e mensagens de ausência fora de expediente. |
| `/roles` | 🏷️ **Operacional** | Painéis de autorole e menus suspensos interativos para seleção de cargos pelos membros. |
| `/sticky` | 📌 **Operacional** | Mensagens fixadas automaticamente no final do chat para regras e avisos importantes. |
| `/roblox` | 🎮 **Integração** | Calculadora de taxas Roblox 70/30 (padrão e DevEx) e vinculação de usuários. |
| `/admin` | 👑 **Gestão** | Console de gerenciamento exclusivo do dono do servidor (auditorias, permissões e diagnósticos). |
| `/server` | ℹ️ **Informativo** | Informações completas sobre infraestrutura, latência, uptime e estatísticas do servidor. |
| `/help` | ℹ️ **Informativo** | Guia de ajuda interativo com lista categorizada de todos os comandos do Loop. |

---

## 🏗️ Arquitetura do Sistema

```
bot-repo/
├── README.md                      # Documentação Global do Projeto
└── discord-bot/
    ├── docker-compose.yml         # Orquestração de Containers (App, Postgres, Redis)
    ├── Dockerfile                 # Imagem de Produção Node.js 20 Alpine
    ├── package.json               # Dependências e Scripts de Build/Test
    ├── migrations/                # Migrações SQL Duráveis (001 a 013)
    │   ├── 001_foundation.sql
    │   ├── 002_agent_core.sql
    │   ├── 003_semantic_memory.sql
    │   ├── 004_safe_autonomy.sql
    │   ├── 005_native_systems.sql
    │   ├── 006_semantic_memory.sql
    │   ├── 007_wallet_roblox.sql
    │   ├── 008_control_panel_ai.sql
    │   ├── 009_enterprise_suite.sql
    │   ├── 010_marketing_schedules_loyalty.sql
    │   ├── 011_escrow_crypto.sql
    │   ├── 012_advanced_moderation_suite.sql
    │   └── 013_brazilian_pix_subscriptions.sql
    ├── src/
    │   ├── index.js               # Ponto de Entrada & Inicialização da Gateway
    │   ├── agent/                 # Roteador IA, Planner, Modelos & Sandbox
    │   ├── autonomy/              # Máquina de Estados de Governança, Aprovações & Rollback
    │   ├── commands/              # 37 Comandos Slash Nativos
    │   ├── discord/               # Gateway Runtime, Event Store & Context Assembler
    │   ├── events/                # interactionCreate, messageCreate, ready, etc.
    │   ├── foundation/            # Configuração, Banco de Dados, Repositórios & Servidor Webhook
    │   ├── memory/                # Memória Semântica com Vetorização Cosine (pgvector)
    │   ├── native/                # 20+ Serviços de Negócio (Commerce, Wallet, PIX, Escrow, etc.)
    │   └── ui/                    # Design System Discord Components V2 & Temas Neon Green
    └── test/                      # 151 Suítes de Testes Automatizados Unitários e de Integração
```

---

## 🛠️ Instalação & Execução Rápida

### Pré-requisitos
* **Node.js**: `v20.0.0` ou superior.
* **PostgreSQL**: `v16+` (com extensão `pgvector`).
* **Redis**: `v7.2+` (para filas BullMQ).
* **Docker & Docker Compose** *(opcional para ambiente conteinerizado)*.

### 1. Clonando o Repositório
```bash
git clone https://github.com/frisancofrango/discord-assistantt.git
cd discord-assistantt/discord-bot
```

### 2. Configurando as Variáveis de Ambiente
Copie o modelo de ambiente e preencha suas chaves:
```bash
cp .env.example .env
```

Parâmetros essenciais no `.env`:
```ini
# Configurações do Discord
DISCORD_TOKEN=seu_bot_token_aqui
DISCORD_APPLICATION_ID=seu_client_id_aqui
DEV_GUILD_ID=seu_guild_id_de_testes

# Banco de Dados & Filas
DATABASE_URL=postgresql://loop:senha_segura@localhost:5432/loop
REDIS_URL=redis://localhost:6379

# Motor de IA (Opcional para recursos avançados)
OPENAI_API_KEY=sua_chave_openai
ANTHROPIC_API_KEY=sua_chave_anthropic
GEMINI_API_KEY=sua_chave_gemini

# Gateways de Pagamento (Opcional para PIX em produção)
MERCADO_PAGO_ACCESS_TOKEN=seu_access_token
EFI_CLIENT_ID=seu_efi_client_id
EFI_CLIENT_SECRET=seu_efi_client_secret
EFI_CERT_PATH=/path/to/cert.p12
```

### 3. Instalando Dependências & Executando Migrações
```bash
npm install
npm run migrate
```

### 4. Executando Verificações e Testes
```bash
# Validação de sintaxe em todos os 80+ módulos
npm run check

# Execução da suíte completa de testes (151 testes)
npm test
```

### 5. Registrando os Comandos Slash & Iniciando o Bot
```bash
# Registra todos os 37 comandos slash no Discord
npm run register-commands

# Inicia o Loop em modo de produção
npm start

# Ou em modo de desenvolvimento (hot-reload)
npm run dev
```

---

## 🐳 Execução via Docker Compose

Para subir o ecossistema completo (Loop Bot + PostgreSQL com pgvector + Redis) em menos de 1 minuto:

```bash
docker compose up -d --build
```

Visualizar logs em tempo real:
```bash
docker compose logs -f loop
```

---

## 🎨 Identidade Visual & Design System

O **Loop ©** utiliza uma linguagem visual minimalista, escura e de alto contraste inspirada em design de ponta:

* **Cor Primária:** Verde Neon (`#00ff66` / `0x00ff66`) com detalhes em verde escuro e preto profundo (`0x000000`).
* **Símbolo de Identidade:** Emoji de coração verde `💚` e logotipo de infinito `Loop ©`.
* **Discord Components V2:** Estruturas sem caixas de texto poluídas, espaçamentos limpos (`type: 14`), divisores elegantes e feedback imediato em todas as ações.

---

## 📄 Licença

Este projeto é distribuído sob a licença **MIT**. Consulte o arquivo [LICENSE](LICENSE) para mais detalhes.

<div align="center">
Desenvolvido com 💚 para transformar a economia e operação da sua comunidade no Discord.
</div>
