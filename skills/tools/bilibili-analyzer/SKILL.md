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

自动化B站视频内容分析工具。提供视频URL后，系统自动下载视频、提取关键帧、AI分析内容，生成带截图和时间戳的Markdown报告。

## Trigger

- `/bilibili` 命令
- 用户请求分析B站视频
- 用户提供B站视频链接

## Usage

```bash
# 基本用法
python scripts/main.py "https://www.bilibili.com/video/BV1xx411c7mD"

# 自定义帧间隔和最大帧数
python scripts/main.py "https://www.bilibili.com/video/BV1xx411c7mD" -i 60 -m 30

# 指定输出目录和分析焦点
python scripts/main.py "https://www.bilibili.com/video/BV1xx411c7mD" -o ./output -f text,faces

# 短链接
python scripts/main.py "https://b23.tv/xxxxx"
```

## Parameters

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `url` | B站视频URL（必需） | - |
| `-i, --interval` | 帧提取间隔（秒） | 30 |
| `-m, --max-frames` | 最大帧数 | 50 |
| `-o, --output` | 输出目录 | ./bilibili |
| `-f, --focus` | 分析焦点 | text,objects,faces,actions,scene |
| `-w, --workers` | 并行worker数 | 4 |

## Requirements

- **FFmpeg**: 帧提取必需
- **Python**: requests, yt-dlp

详细安装说明见 [references/installation.md](references/installation.md)

## References

- [安装指南](references/installation.md) - 系统依赖和Python包安装
- [常见问题](references/faq.md) - FAQ和错误处理

## Examples

- [基本使用示例](examples/basic-usage.md) - 常用场景和命令示例

## Tags

`bilibili`, `video-analysis`, `ai`, `frame-extraction`, `markdown`

## Compatibility

- Codex: ✅
- Claude Code: ✅
