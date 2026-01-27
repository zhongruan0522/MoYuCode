---
name: bilibili-analyzer
description: 自动分析B站视频内容，提取关键帧，使用AI分析并生成带截图的Markdown总结报告。
metadata:
  short-description: B站视频AI分析工具
source:
  repository: https://github.com/yt-dlp/yt-dlp
  license: Unlicense
---

# Bilibili Video Analyzer

## Description

Bilibili视频分析器是一个自动化视频内容分析工具。提供B站视频URL后，系统会自动下载视频、提取关键帧、使用AI分析视频内容，并生成包含截图和时间戳的Markdown总结报告。

## Features

- 🔗 **URL解析**: 支持标准B站URL和短链接（b23.tv）
- 📥 **智能下载**: 自动下载视频，支持重试和进度显示
- 🎬 **帧提取**: 智能帧提取，支持场景变化检测
- 🤖 **AI分析**: 多Claude Code实例并行分析
- 📝 **报告生成**: 生成结构化Markdown报告，包含目录和摘要
- 📊 **日志记录**: 完整的执行日志和错误追踪
- 💾 **断点续传**: 支持部分结果保存，失败后可恢复

## Trigger

- `/bilibili` 命令
- 用户请求分析B站视频
- 用户提供B站视频链接

## Usage

### 基本用法

```bash
# 进入脚本目录
cd skills/tools/bilibili-analyzer/scripts

# 分析视频（最简单的用法）
python main.py "https://www.bilibili.com/video/BV1xx411c7mD"

# 使用短链接
python main.py "https://b23.tv/xxxxx"
```

### 自定义参数

```bash
# 自定义帧提取间隔（每60秒提取一帧）
python main.py "https://www.bilibili.com/video/BV1xx411c7mD" -i 60

# 限制最大帧数为30帧
python main.py "https://www.bilibili.com/video/BV1xx411c7mD" -m 30

# 指定输出目录
python main.py "https://www.bilibili.com/video/BV1xx411c7mD" -o ./my-reports

# 指定分析焦点（只分析文字和人脸）
python main.py "https://www.bilibili.com/video/BV1xx411c7mD" -f text,faces

# 调整并行worker数量
python main.py "https://www.bilibili.com/video/BV1xx411c7mD" -w 8

# 禁用场景检测（只按固定间隔提取）
python main.py "https://www.bilibili.com/video/BV1xx411c7mD" --no-scene-detection
```

### 组合使用

```bash
# 完整示例：60秒间隔，最多20帧，只分析文字，输出到指定目录
python main.py "https://www.bilibili.com/video/BV1xx411c7mD" \
    -i 60 \
    -m 20 \
    -f text \
    -o ./video-analysis \
    -w 4

# 详细日志模式
python main.py "https://www.bilibili.com/video/BV1xx411c7mD" -v

# 静默模式（只显示错误）
python main.py "https://www.bilibili.com/video/BV1xx411c7mD" -q
```

## Parameters

| 参数 | 短参数 | 说明 | 默认值 | 示例 |
|------|--------|------|--------|------|
| `url` | - | B站视频URL（必需） | - | `https://www.bilibili.com/video/BV1xx411c7mD` |
| `--interval` | `-i` | 帧提取间隔（秒） | 30 | `-i 60` |
| `--max-frames` | `-m` | 最大帧数 | 50 | `-m 30` |
| `--output` | `-o` | 输出目录 | ./bilibili | `-o ./output` |
| `--focus` | `-f` | 分析焦点（逗号分隔） | text,objects,faces,actions,scene | `-f text,faces` |
| `--workers` | `-w` | 并行分析worker数 | 4 | `-w 8` |
| `--no-scene-detection` | - | 禁用场景变化检测 | false | `--no-scene-detection` |
| `--retries` | - | 下载失败重试次数 | 3 | `--retries 5` |
| `--verbose` | `-v` | 显示详细日志 | false | `-v` |
| `--quiet` | `-q` | 静默模式 | false | `-q` |
| `--version` | - | 显示版本信息 | - | `--version` |

### 分析焦点选项

| 焦点 | 说明 |
|------|------|
| `text` | 识别画面中的文字内容 |
| `objects` | 识别画面中的物体 |
| `faces` | 识别人脸和人物 |
| `actions` | 识别动作和行为 |
| `scene` | 识别场景类型和环境 |

## Output Structure

分析完成后，输出目录结构如下：

```
./bilibili/{video_title}/
├── report.md              # Markdown分析报告
├── frames/                # 提取的关键帧图片
│   ├── frame_001_00-00-00.jpg
│   ├── frame_002_00-00-30.jpg
│   ├── frame_003_00-01-00.jpg
│   └── ...
├── analysis.log           # 执行日志
├── checkpoints/           # 检查点数据（用于断点续传）
│   ├── frames.json
│   └── analyses.json
└── partial_report.json    # 部分结果（如果分析中断）
```

### 报告内容

生成的Markdown报告包含：

1. **视频元数据**: 标题、作者、时长、播放量等
2. **执行摘要**: AI生成的视频内容概述
3. **目录**: 带锚点链接的章节导航
4. **时间线分析**: 按时间顺序的帧分析结果
   - 帧截图（嵌入图片）
   - 时间戳（HH:MM:SS格式）
   - 场景描述
   - 识别的物体、文字、人物等

## Requirements

### System Dependencies

#### FFmpeg（必需）

FFmpeg用于从视频中提取关键帧，必须安装。

**Windows:**
```powershell
# 使用 Chocolatey
choco install ffmpeg

# 或使用 Scoop
scoop install ffmpeg

# 或手动下载
# 访问 https://ffmpeg.org/download.html 下载并添加到PATH
```

**macOS:**
```bash
# 使用 Homebrew
brew install ffmpeg
```

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install ffmpeg
```

**CentOS/RHEL:**
```bash
sudo yum install epel-release
sudo yum install ffmpeg
```

**验证安装:**
```bash
ffmpeg -version
```

### Python Dependencies

```bash
# 创建虚拟环境（推荐）
python -m venv venv
source venv/bin/activate  # Linux/macOS
# 或
.\venv\Scripts\activate   # Windows

# 安装依赖
pip install requests yt-dlp hypothesis pytest
```

**依赖说明:**

| 包 | 版本 | 用途 |
|---|------|------|
| `requests` | >=2.28.0 | HTTP请求，获取视频元数据 |
| `yt-dlp` | >=2023.0.0 | 视频下载 |
| `hypothesis` | >=6.0.0 | 属性测试（开发用） |
| `pytest` | >=7.0.0 | 单元测试（开发用） |

### 完整安装脚本

```bash
# 一键安装（Linux/macOS）
#!/bin/bash
set -e

# 安装FFmpeg
if ! command -v ffmpeg &> /dev/null; then
    echo "Installing FFmpeg..."
    if [[ "$OSTYPE" == "darwin"* ]]; then
        brew install ffmpeg
    else
        sudo apt install -y ffmpeg
    fi
fi

# 安装Python依赖
pip install requests yt-dlp hypothesis pytest

echo "Installation complete!"
```

## Tags

`bilibili`, `video-analysis`, `ai`, `frame-extraction`, `markdown`, `automation`, `yt-dlp`, `ffmpeg`

## Compatibility

- Codex: ✅
- Claude Code: ✅

## FAQ

### 基础问题

#### Q: 为什么需要FFmpeg？
A: FFmpeg是一个强大的多媒体处理工具，本工具使用它从视频中提取关键帧。没有FFmpeg，帧提取功能将无法工作。

#### Q: 分析一个视频需要多长时间？
A: 取决于多个因素：
- 视频长度
- 帧提取间隔和最大帧数
- 网络速度（下载阶段）
- AI分析并行度

一般来说，10分钟视频（默认设置）约需5-10分钟完成分析。

#### Q: 支持哪些视频格式？
A: 支持B站所有可播放的视频格式。系统使用yt-dlp下载，会自动选择最佳质量。

### 错误处理

#### Q: 遇到"URL无效"错误怎么办？
A: 请确保URL格式正确：
- 标准格式: `https://www.bilibili.com/video/BV1xx411c7mD`
- 短链接: `https://b23.tv/xxxxx`
- 不支持番剧、直播等其他类型链接

#### Q: 下载失败怎么办？
A: 可能的原因和解决方案：
1. **网络问题**: 检查网络连接，使用`--retries`增加重试次数
2. **视频不存在**: 确认视频未被删除或设为私有
3. **地区限制**: 某些视频可能有地区限制

#### Q: FFmpeg报错怎么办？
A: 
1. 确认FFmpeg已正确安装: `ffmpeg -version`
2. 确认FFmpeg在系统PATH中
3. 尝试重新安装FFmpeg

#### Q: AI分析失败怎么办？
A: 系统会自动重试失败的分析任务。如果仍然失败：
1. 检查Claude Code配置
2. 查看日志文件了解详细错误
3. 部分结果会保存到`partial_report.json`

### 高级用法

#### Q: 如何只分析视频的特定部分？
A: 目前不支持指定时间范围，但可以通过调整参数间接实现：
- 增大`--interval`跳过更多内容
- 减小`--max-frames`限制分析帧数

#### Q: 如何提高分析速度？
A: 
1. 增加并行worker: `-w 8`
2. 减少帧数: `-m 20`
3. 增大间隔: `-i 60`
4. 禁用场景检测: `--no-scene-detection`

#### Q: 如何获取更详细的分析？
A: 
1. 减小帧间隔: `-i 10`
2. 增加最大帧数: `-m 100`
3. 启用所有分析焦点: `-f text,objects,faces,actions,scene`

#### Q: 分析中断后如何恢复？
A: 系统会自动保存检查点。目前需要重新运行命令，未来版本将支持从检查点恢复。

### 输出相关

#### Q: 报告中的图片路径是什么格式？
A: 使用相对路径，格式为`./frames/frame_XXX_HH-MM-SS.jpg`，确保报告和frames目录在同一位置时图片可正常显示。

#### Q: 如何自定义报告格式？
A: 目前不支持自定义模板，但可以修改`report_generator.py`中的模板。

#### Q: 日志文件在哪里？
A: 日志文件`analysis.log`位于输出目录中，与`report.md`同级。

## Troubleshooting

### 常见错误代码

| 错误　　　　　　　　　　| 原因　　　　　　 | 解决方案　　　　　　　 |
| -------------------------| ------------------| ------------------------|
| `URLValidationError`　　| URL格式不正确　　| 使用正确的B站视频URL　 |
| `MetadataFetchError`　　| 无法获取视频信息 | 检查视频是否存在/私有　|
| `DownloadError`　　　　 | 下载失败　　　　 | 检查网络，增加重试次数 |
| `FFmpegError`　　　　　 | FFmpeg问题　　　 | 安装/重装FFmpeg　　　　|
| `AnalysisError`　　　　 | AI分析失败　　　 | 检查Claude Code配置　　|
| `ReportGenerationError` | 报告生成失败　　 | 检查输出目录权限　　　 |

### 调试模式

使用`-v`参数启用详细日志：

```bash
python main.py "https://www.bilibili.com/video/BV1xx411c7mD" -v
```

日志将显示每个步骤的详细信息，便于定位问题。

## Version History

- **v1.0.0** (2026-01-27)
  - 初始版本
  - 支持URL解析和验证
  - 支持视频下载（带重试）
  - 支持帧提取（带场景检测）
  - 支持AI并行分析
  - 支持Markdown报告生成
  - 完整的日志和错误处理

## License

本工具使用Unlicense许可证，视频下载功能基于yt-dlp。

## Contributing

欢迎提交Issue和Pu