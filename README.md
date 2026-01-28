# MoYuCode（摸鱼Coding）

<div align="center">

**Manage Codex and Claude Code with one click - The open-source version of ZCode**

[![CI](https://github.com/AIDotNet/MoYuCode/workflows/CI/badge.svg)](https://github.com/AIDotNet/MoYuCode/actions)
[![Release](https://img.shields.io/github/v/release/AIDotNet/MoYuCode)](https://github.com/AIDotNet/MoYuCode/releases)
[![License](https://img.shields.io/github/license/AIDotNet/MoYuCode)](LICENSE)

[English](README.md) | [简体中文](README.zh-CN.md)

</div>

## Introduction

MoYuCode（摸鱼Coding） is an open-source tool designed to help users conveniently operate [Codex](https://github.com/openai/codex) and [Claude Code](https://claude.ai/code) through a web interface. It supports local deployment and can be accessed externally through intranet mapping, making it convenient for users to use remotely via mobile devices and other platforms. Part of the design experience is inspired by [ZCode](https://zcode.dev/).

## Features

- **Web Interface**: Modern and responsive web UI built with React + TypeScript + Tailwind CSS
- **AI Integration**: Seamless integration with OpenAI Codex and Claude Code
- **Session Management**: Visualize and manage AI coding sessions with detailed history
- **Project Workspace**: File explorer and code editor integration for seamless development workflow
- **Token Usage Tracking**: Monitor and visualize token consumption across sessions
- **Real-time Updates**: Server-Sent Events (SSE) for live AI response streaming
- **Cross-platform**: Support for Windows, Linux, and macOS
- **System Tray**: Windows desktop application with tray icon support

## Screenshots

### System Tray
After launching MoYuCode.Win.exe, a system tray icon appears with the background service running automatically.

### Project Selection
Automatically scans and loads local projects that have used Codex, allowing you to select and enter a workspace.

### Session Management
- Start new conversations or select from session history
- Load previous sessions to restore full context
- View session details including token usage and timeline

### File Browser
Integrated file browser to view and edit code files directly while interacting with AI.

## Download & Installation

### Windows Desktop Application

1. Visit the [GitHub Releases](https://github.com/AIDotNet/MoYuCode/releases) page
2. Download the latest Windows archive (`MoYuCode-*-win-x64.zip`)
3. Extract and run `MoYuCode.Win.exe`
4. The program will display an icon in the system tray
5. Open your browser and visit `http://localhost:9110/`

### Linux

1. Download the latest Linux package (`MoYuCode-*-linux-x64.tar.gz`) from [Releases](https://github.com/AIDotNet/MoYuCode/releases)
2. Extract the archive:
   ```bash
   tar -xzf MoYuCode-*-linux-x64.tar.gz
   cd MoYuCode-*-linux-x64
   ```
3. Run directly:
   ```bash
   ./run.sh
   ```
4. Or install as a systemd service:
   ```bash
   sudo ./install-service.sh
   ```

### macOS

1. Download the latest macOS package (`MoYuCode-*-osx-x64.tar.gz`) from [Releases](https://github.com/AIDotNet/MoYuCode/releases)
2. Extract the archive:
   ```bash
   tar -xzf MoYuCode-*-osx-x64.tar.gz
   cd MoYuCode-*-osx-x64
   ```
3. Run directly:
   ```bash
   ./run.sh
   ```
4. Or install as a launch daemon:
   ```bash
   sudo ./install-service.sh
   ```

## Prerequisites

- **.NET 10.0 Runtime** (for standalone executables, it's self-contained)
- **Codex CLI** (required for Codex integration):
  ```bash
  npm install -g @openai/codex
  ```

## Usage

### Accessing MoYuCode（摸鱼Coding）

After starting the application, open your browser and navigate to:

- HTTP: `http://localhost:9110/`
- HTTPS: `https://localhost:9111/` (if configured)

### Project Workflow

1. **Select Project**: MoYuCode（摸鱼Coding） automatically scans for projects with Codex usage history
2. **Enter Workspace**: Click on a project to enter its workspace
3. **Start Conversation**: Begin a new chat or load a previous session
4. **View Code**: Use the integrated file browser to view and edit files
5. **Monitor Usage**: Track token usage and session statistics

### Session Management

- Click the session list button in the top-right corner
- Select a historical session
- Click "Load Session" to restore the complete context
- View session details including token usage, timeline, and metadata

## Development

### Backend (C# / ASP.NET Core)

```bash
# Build
dotnet build src/MoYuCode/MoYuCode.csproj

# Run (HTTP)
dotnet run --project src/MoYuCode/MoYuCode.csproj --launch-profile http

# Run (HTTPS)
dotnet run --project src/MoYuCode/MoYuCode.csproj --launch-profile https
```

### Frontend (React / Vite)

```bash
cd web

# Install dependencies
npm ci

# Development server
npm run dev

# Build for production
npm run build

# Lint code
npm run lint
```

### Build Full Application

The CI pipeline automatically builds both frontend and backend:

```bash
# Install frontend dependencies
npm ci

# Build frontend
npm run build

# Sync frontend to backend wwwroot
rsync -a --delete web/dist/ src/MoYuCode/wwwroot/

# Build backend
dotnet build src/MoYuCode/MoYuCode.csproj -c Release
```

## Architecture

MoYuCode（摸鱼Coding） follows a dual-stack architecture:

### Backend
- **Framework**: ASP.NET Core 10.0 Web API
- **Communication**: JSON-RPC over stdio with Codex app-server
- **Database**: SQLite with Entity Framework Core
- **Protocols**: Agent-to-Agent (A2A) protocol for streaming AI interactions

### Frontend
- **Framework**: React 19 with TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS v4
- **State**: React Router + local component state
- **UI Components**: Radix UI with custom animations

See [CLAUDE.md](CLAUDE.md) for detailed architecture documentation.

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Community

- GitHub: [https://github.com/AIDotNet/MoYuCode](https://github.com/AIDotNet/MoYuCode)
- Issues: [https://github.com/AIDotNet/MoYuCode/issues](https://github.com/AIDotNet/MoYuCode/issues)
- Discussions: [https://github.com/AIDotNet/MoYuCode/discussions](https://github.com/AIDotNet/MoYuCode/discussions)

## Acknowledgments

- Inspired by [ZCode](https://zcode.dev/)
- Built with [OpenAI Codex](https://github.com/openai/codex) and [Anthropic Claude Code](https://claude.ai/code)

Community WeChat：wk28u9123456789
