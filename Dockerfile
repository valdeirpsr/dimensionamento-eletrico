# ==============================================================================
# Estágio 1: Build da Aplicação
# ==============================================================================
FROM node:22-alpine AS builder

WORKDIR /app

# Copia arquivos de definição de pacotes e lockfile
COPY package*.json ./

# Instala todas as dependências (incluindo devDependencies necessárias para o build).
# Executa npm ci se houver lockfile consistente ou faz fallback com --legacy-peer-deps
RUN npm ci || npm install --legacy-peer-deps

# Copia os arquivos do projeto
COPY . .

# Compila o código para produção com o Vite (gera os arquivos estáticos na pasta /dist)
RUN npm run build

# Remove as dependências de desenvolvimento (devDependencies) conforme solicitado
RUN npm prune --omit=dev --legacy-peer-deps || true

# ==============================================================================
# Estágio 2: Servidor Web de Produção (Nginx Alpine)
# ==============================================================================
# Escolha da stack: O Nginx Alpine é a melhor opção para este protótipo:
# 1. Ultraleve: gera uma imagem final de apenas ~25MB (vs centenas de MB com Node.js).
# 2. Performance: entrega de assets estáticos compilados pelo Vite sem sobrecarga de runtime.
# 3. Baixo consumo de memória: consome menos de 10MB de RAM.
# 4. Suporte nativo a Gzip, cache de assets e reescrita de rotas SPA.
# ==============================================================================
FROM nginx:alpine

# Remove configurações padrão do Nginx
RUN rm -rf /etc/nginx/conf.d/*

# Copia a configuração customizada do Nginx para 0.0.0.0:80 com suporte a SPA
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copia os arquivos compilados para produção a partir do estágio builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Expõe a porta 80
EXPOSE 80

# Inicia o servidor Nginx em primeiro plano
CMD ["nginx", "-g", "daemon off;"]
