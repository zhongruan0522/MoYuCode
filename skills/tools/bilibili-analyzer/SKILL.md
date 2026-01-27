---
name: bilibili-analyzer
description: 自动分析B站视频内容，提取关键帧，使用Claude Code AI分析并生成带截图的Markdown总结报告。
metadata:
  short-description: B站视频AI分析工具
source:
  repository: https://github.com/yt-dlp/yt-dlp
  license: Unlicense
---

# Bilibili Video Analyzer

## Description

自动化B站视频内容分析工具。提供视频URL后，系统自动：
1. 下载视频
2. 每秒提取1帧图片
3. 智能合并相似帧，减少冗余
4. 提取音频并转文字（可选）
5. 使用 Claude Code CLI 逐帧分析
6. 生成带截图和时间戳的 `视频分析报告.md`

## Trigger

- `/bilibili` 命令
- 用户请求分析B站视频
- 用户提供B站视频链接

## Usage

```bash
# 基本用法（每秒1帧，自动合并相似帧）
python scripts/main.py "https://www.bilibili.com/video/BV1xx411c7mD"

# 自定义帧间隔（每2秒1帧）
python scripts/main.py "https://www.bilibili.com/video/BV1xx411c7mD" -i 2

# 禁用音频分析（更快）
python scripts/main.py "https://www.bilibili.com/video/BV1xx411c7mD" --no-audio

# 调整相似帧阈值（0.9 = 更激进的合并）
python scripts/main.py "https://www.bilibili.com/video/BV1xx411c7mD" -s 0.9

# 指定输出目录
python scripts/main.py "https://www.bilibili.com/video/BV1xx411c7mD" -o ./output

# 短链接
python scripts/main.py "https://b23.tv/xxxxx"
```

## Parameters

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `url` | B站视频URL（必需） | - |
| `-i, --interval` | 帧提取间隔（秒） | 1 |
| `-m, --max-frames` | 最大帧数（0=不限制） | 0 |
| `-s, --similarity` | 相似帧检测阈值（0-1） | 0.95 |
| `-o, --output` | 输出目录 | ./bilibili |
| `--no-audio` | 禁用音频提取和转录 | false |
| `--whisper-model` | Whisper模型大小 | base |
| `--language` | 音频语言代码 | zh |
| `--scene-detection` | 启用场景变化检测 | false |
| `--resume` | 断点续传 | false |

## Output Structure

```
bilibili/{video_title}/
├── 视频分析报告.md      # 主报告文件
├── images/              # 帧图片目录
│   ├── frame_000001.jpg
│   ├── frame_000002.jpg
│   └── ...
├── audio/               # 音频文件目录
│   └── audio.wav
├── transcript.json      # 音频转录结果
└── manifest.json        # 帧清单
```

## Requirements

- **FFmpeg**: 帧提取和音频提取必需
- **Python**: requests, yt-dlp, Pillow, imagehash
- **Claude Code CLI**: AI分析必需（`claude` 命令）
- **Whisper** (可选): 音频转文字（`pip install openai-whisper` 或 `pip install faster-whisper`）

详细安装说明见 [references/installation.md](references/installation.md)

## References

- [安装指南](references/installation.md) - 系统依赖和Python包安装
- [常见问题](references/faq.md) - FAQ和错误处理
- [改进计划](docs/plans/improvement-plan.md) - 开发计划文档

## Examples

- [基本使用示例](examples/basic-usage.md) - 常用场景和命令示例

## Tags

`bilibili`, `video-analysis`, `ai`, `frame-extraction`, `markdown`, `claude-code`

## Compatibility

- Codex: ✅
- Claude Code: ✅
