# 需求文档

## 简介

本功能旨在创建一个包含 AI 编程工具的 Docker 镜像。该镜像基于 .NET 10.0 ASP.NET 运行时，并集成 Node.js 20 环境，预装 OpenAI Codex CLI 和 Anthropic Claude Code 两款 AI 编程辅助工具，为开发者提供一个开箱即用的 AI 辅助开发环境。

## 术语表

- **AI_Tools_Image**: 包含 AI 编程工具的 Docker 镜像
- **Base_Image**: 基础镜像，即 mcr.microsoft.com/dotnet/aspnet:10.0
- **Node_Runtime**: Node.js 20 运行时环境
- **Codex_CLI**: OpenAI 提供的 Codex 命令行工具 (@openai/codex)
- **Claude_Code**: Anthropic 提供的 Claude Code 命令行工具 (@anthropic-ai/claude-code)
- **Dockerfile**: Docker 镜像构建配置文件

## 需求

### 需求 1：基础镜像配置

**用户故事：** 作为开发者，我希望镜像基于官方 .NET 10.0 ASP.NET 运行时，以便能够运行 .NET 应用程序并保持与现有项目的兼容性。

#### 验收标准

1. THE AI_Tools_Image SHALL 使用 mcr.microsoft.com/dotnet/aspnet:10.0 作为基础镜像
2. THE AI_Tools_Image SHALL 保留基础镜像的默认工作目录配置
3. THE AI_Tools_Image SHALL 保留基础镜像的默认端口暴露配置（8080 和 8081）

### 需求 2：Node.js 运行时安装

**用户故事：** 作为开发者，我希望镜像中包含 Node.js 20 运行时，以便能够运行基于 npm 的 AI 编程工具。

#### 验收标准

1. THE AI_Tools_Image SHALL 安装 Node.js 20 LTS 版本
2. THE AI_Tools_Image SHALL 包含 npm 包管理器
3. WHEN 执行 `node --version` 命令时，THE AI_Tools_Image SHALL 返回 v20.x.x 版本号
4. WHEN 执行 `npm --version` 命令时，THE AI_Tools_Image SHALL 返回有效的 npm 版本号

### 需求 3：Codex CLI 安装

**用户故事：** 作为开发者，我希望镜像中预装 OpenAI Codex CLI 工具，以便能够使用 AI 辅助编程功能。

#### 验收标准

1. THE AI_Tools_Image SHALL 通过 npm 全局安装 @openai/codex 包
2. WHEN 执行 `codex --version` 命令时，THE AI_Tools_Image SHALL 返回有效的版本号
3. WHEN 执行 `codex --help` 命令时，THE AI_Tools_Image SHALL 显示帮助信息

### 需求 4：Claude Code 安装

**用户故事：** 作为开发者，我希望镜像中预装 Anthropic Claude Code 工具，以便能够使用 Claude AI 辅助编程功能。

#### 验收标准

1. THE AI_Tools_Image SHALL 通过 npm 全局安装 @anthropic-ai/claude-code 包
2. WHEN 执行 `claude --version` 命令时，THE AI_Tools_Image SHALL 返回有效的版本号
3. WHEN 执行 `claude --help` 命令时，THE AI_Tools_Image SHALL 显示帮助信息

### 需求 5：镜像构建与验证

**用户故事：** 作为开发者，我希望 Dockerfile 能够成功构建，并且构建后的镜像能够正常运行所有已安装的工具。

#### 验收标准

1. WHEN 执行 `docker build` 命令时，THE Dockerfile SHALL 成功构建镜像
2. WHEN 镜像构建完成后，THE AI_Tools_Image SHALL 能够正常启动容器
3. THE AI_Tools_Image SHALL 保持合理的镜像大小（不超过 2GB）
4. IF 任何工具安装失败，THEN THE Dockerfile SHALL 终止构建并返回错误信息
