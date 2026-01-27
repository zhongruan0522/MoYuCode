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
- 🔗 支持标准B站URL和短链接（b23.tv）
- 📥 自动下载视频（支持重试和进度显示）
- 🎬 智能帧提取（支持场景检测）
- 🤖 AI并行分析（多Claude Code实例）
- 📝 生成结构化Markdown报告

## Trigger
- `/bilibili` 命令
- 用户请求分析B站视频
- 用户提供B站视频链接

## Usage

```bash
# 基本用法 - 分析视频
python scripts/bilibili_analyzer.py --url "https://www.bilibili.com/video/BV1xx411c7mD"

# 自定义帧提取间隔（默认30秒）
python scripts/bilibili_analyzer.py --url "https://www.bilibili.com/video/BV1xx411c7mD" --interval 60

# 限制最大帧数（默认50帧）
python scripts/bilibili_analyzer.py --url "https://www.bilibili.com/video/BV1xx411c7mD" --max-frames 30

# 指定输出目录
python scripts/bilibili_analyzer.py --url "https://www.bilibili.com/video/BV1xx411c7mD" --output ./my-reports

# 指定分析焦点
python scripts/bilibili_analyzer.py --url "https://www.bilibili.com/video/BV1xx411c7mD" --focus text,faces

# 短链接也支持
python scripts/bilibili_analyzer.py --url "https://b23.tv/xxxxx"
```

## Parameters

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--url` | B站视频URL（必需） | - |
| `--interval` | 帧提取间隔（秒） | 30 |
| `--max-frames` | 最大帧数 | 50 |
| `--output` | 输出目录 | ./bilibili |
| `--focus` | 分析焦点（逗号分隔） | text,objects,faces |
| `--workers` | 并行分析数 | 4 |

## Output Structure

```
./bilibili/{video_title}/
├── report.md          # Markdown分析报告
├── frames/            # 提取的关键帧
│   ├── frame_001_00-00-00.jpg
│   ├── frame_002_00-00-30.jpg
│   └── ...
└── analysis.log       # 执行日志
```

## Requirements

### System Dependencies
- **FFmpeg**: 用于视频帧提取
  ```bash
  # Windows (使用 Chocolatey)
  choco install ffmpeg
  
  # macOS
  brew install ffmpeg
  
  # Ubuntu/Debian
  sudo apt install ffmpeg
  ```

### Python Dependencies
```bash
pip install requests yt-dlp hypothesis pytest
```

## Tags
`bilibili`, `video-analysis`, `ai`, `frame-extraction`, `markdown`, `automation`

## Compatibility
- Codex: ✅
- Claude Code: ✅

## FAQ

### Q: 为什么需要FFmpeg？
A: FFmpeg用于从视频中提取关键帧。没有它，帧提取功能将无法工作。

### Q: 分析一个视频需要多长时间？
A: 取决于视频长度和帧数。一般10分钟视频约需5-10分钟完成分析。

### Q: 支持哪些视频格式？
A: 支持B站所有可播放的视频格式，系统会自动选择最佳质量。

### Q: 如何处理分析失败？
A: 系统会自动重试失败的任务，并保存部分结果。查看日志文件了解详情。
