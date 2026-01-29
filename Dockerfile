FROM node:22-bookworm-slim AS web-build
WORKDIR /web

COPY web/package.json web/package-lock.json ./
RUN npm ci

COPY web/ ./
RUN npm run build


FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
ARG BUILD_CONFIGURATION=Release
WORKDIR /src

COPY ["Directory.Build.props", "."]
COPY ["NuGet.Config", "."]
COPY ["src/MoYuCode/MoYuCode.csproj", "src/MoYuCode/"]
RUN dotnet restore "src/MoYuCode/MoYuCode.csproj"

COPY . .
RUN mkdir -p "src/MoYuCode/wwwroot"
COPY --from=web-build /web/dist/ src/MoYuCode/wwwroot/

WORKDIR /src/src/MoYuCode
RUN dotnet publish "MoYuCode.csproj" -c $BUILD_CONFIGURATION -o /app/publish /p:UseAppHost=false


FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
ARG DEBIAN_FRONTEND=noninteractive
USER root
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        locales \
        ca-certificates \
        curl \
        gnupg \
    && sed -i 's/# zh_CN.UTF-8 UTF-8/zh_CN.UTF-8 UTF-8/' /etc/locale.gen \
    && locale-gen \
    && mkdir -p /etc/apt/keyrings \
    && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" > /etc/apt/sources.list.d/nodesource.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
        bash \
        git \
        gosu \
        openssh-client \
        python3 \
        python3-pip \
        python3-venv \
        build-essential \
        tini \
        vim \
        wget \
        nano \
        tmux \
        nodejs \
    && npm install -g npm@latest \
    && npm install -g @openai/codex @anthropic-ai/claude-code \
    && rm -rf /var/lib/apt/lists/*

ENV LANG=zh_CN.UTF-8 \
    LANGUAGE=zh_CN:zh \
    LC_ALL=zh_CN.UTF-8 \
    EDITOR=vim \
    PIP_BREAK_SYSTEM_PACKAGES=1 \
    HOME=/home/app

COPY --from=build /app/publish ./

ENV ASPNETCORE_URLS=http://0.0.0.0:8080
EXPOSE 8080

RUN if ! id -u app >/dev/null 2>&1; then useradd --create-home --shell /bin/bash --uid 10001 app; fi \
    && mkdir -p /workspace /home/app/.myyucode /home/app/.codex /home/app/.claude \
    && chown -R app:app /home/app /workspace

COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

WORKDIR /workspace

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/entrypoint.sh"]
