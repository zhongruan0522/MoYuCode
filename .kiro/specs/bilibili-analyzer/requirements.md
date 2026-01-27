# Requirements Document

## Introduction

本文档定义了Bilibili视频分析器Skill的需求规格。该Skill允许用户提供B站视频地址，自动下载视频、提取关键帧、使用AI分析视频内容，并生成包含截图和时间戳的Markdown总结报告。

## Glossary

- **Bilibili_Analyzer**: 核心分析系统，负责协调视频下载、帧提取、AI分析和报告生成
- **Video_Downloader**: 视频下载模块，负责从B站获取视频文件
- **Frame_Extractor**: 帧提取模块，使用ffmpeg从视频中提取关键帧
- **AI_Analyzer**: AI分析模块，使用Claude Code分析视频帧内容
- **Report_Generator**: 报告生成模块，汇总分析结果生成Markdown报告
- **Key_Frame**: 视频中的关键帧，代表视频内容的重要时刻
- **Analysis_Task**: 单个帧分析任务，分配给Claude Code执行
- **Summary_Report**: 最终生成的Markdown格式视频总结报告

## Requirements

### Requirement 1: 视频地址解析与验证

**User Story:** As a user, I want to provide a Bilibili video URL, so that the system can identify and process the video.

#### Acceptance Criteria

1. WHEN a user provides a Bilibili video URL, THE Bilibili_Analyzer SHALL validate the URL format matches `https://www.bilibili.com/video/BV*` or `https://b23.tv/*` patterns
2. WHEN a valid URL is provided, THE Bilibili_Analyzer SHALL extract the video BV号 (BV ID)
3. IF an invalid URL is provided, THEN THE Bilibili_Analyzer SHALL return a descriptive error message indicating the expected URL format
4. WHEN the URL is validated, THE Bilibili_Analyzer SHALL fetch video metadata including title, duration, author, and description

### Requirement 2: 视频下载

**User Story:** As a user, I want the system to download the video automatically, so that it can be analyzed locally.

#### Acceptance Criteria

1. WHEN a valid video URL is confirmed, THE Video_Downloader SHALL download the video to a temporary directory
2. WHILE downloading, THE Video_Downloader SHALL display progress information including percentage and estimated time
3. IF the video download fails, THEN THE Video_Downloader SHALL retry up to 3 times with exponential backoff
4. IF all download attempts fail, THEN THE Video_Downloader SHALL return an error with the failure reason
5. WHEN download completes, THE Video_Downloader SHALL verify the file integrity

### Requirement 3: 关键帧提取

**User Story:** As a user, I want the system to extract key frames from the video, so that important visual content can be analyzed.

#### Acceptance Criteria

1. WHEN a video file is available, THE Frame_Extractor SHALL use ffmpeg to extract frames at configurable intervals (default: every 30 seconds)
2. THE Frame_Extractor SHALL detect scene changes and extract additional frames at scene boundaries
3. WHEN extracting frames, THE Frame_Extractor SHALL save each frame as a JPEG image with timestamp in filename
4. THE Frame_Extractor SHALL generate a frame manifest containing frame paths, timestamps, and scene change indicators
5. IF ffmpeg is not available, THEN THE Frame_Extractor SHALL return an error with installation instructions

### Requirement 4: AI帧分析

**User Story:** As a user, I want AI to analyze each key frame, so that I can understand the visual content of the video.

#### Acceptance Criteria

1. WHEN frames are extracted, THE AI_Analyzer SHALL create analysis tasks for each frame
2. THE AI_Analyzer SHALL distribute analysis tasks across multiple Claude Code instances for parallel processing
3. WHEN analyzing a frame, THE AI_Analyzer SHALL identify: objects, text, people, actions, and scene context
4. THE AI_Analyzer SHALL return structured analysis results including descriptions and confidence scores
5. IF an analysis task fails, THEN THE AI_Analyzer SHALL retry the task once before marking it as failed
6. WHEN all tasks complete, THE AI_Analyzer SHALL aggregate results maintaining temporal order

### Requirement 5: 报告生成

**User Story:** As a user, I want a comprehensive Markdown report, so that I can review the video content summary.

#### Acceptance Criteria

1. WHEN analysis is complete, THE Report_Generator SHALL create a Markdown report in `./bilibili/{video_title}/` directory
2. THE Report_Generator SHALL include video metadata (title, author, duration, URL) in the report header
3. THE Report_Generator SHALL organize content by timeline with embedded frame images
4. WHEN embedding images, THE Report_Generator SHALL use relative paths to images stored in `./bilibili/{video_title}/frames/`
5. THE Report_Generator SHALL include timestamps in `HH:MM:SS` format for each analyzed frame
6. THE Report_Generator SHALL generate an executive summary at the beginning of the report
7. THE Report_Generator SHALL create a table of contents with links to each section
8. IF the output directory does not exist, THEN THE Report_Generator SHALL create it automatically

### Requirement 6: 配置与自定义

**User Story:** As a user, I want to customize the analysis parameters, so that I can control the depth and focus of the analysis.

#### Acceptance Criteria

1. THE Bilibili_Analyzer SHALL accept optional parameters for frame extraction interval (default: 30 seconds)
2. THE Bilibili_Analyzer SHALL accept optional parameters for maximum frames to analyze (default: 50)
3. THE Bilibili_Analyzer SHALL accept optional parameters for analysis focus areas (e.g., text, faces, objects)
4. WHERE custom output directory is specified, THE Report_Generator SHALL use the specified path instead of default

### Requirement 7: 错误处理与日志

**User Story:** As a user, I want clear error messages and logs, so that I can troubleshoot issues.

#### Acceptance Criteria

1. IF any component fails, THEN THE Bilibili_Analyzer SHALL log the error with timestamp and context
2. WHEN errors occur, THE Bilibili_Analyzer SHALL provide user-friendly error messages with suggested actions
3. THE Bilibili_Analyzer SHALL create a log file in the output directory for debugging purposes
4. IF partial analysis completes before failure, THEN THE Bilibili_Analyzer SHALL save partial results and indicate incomplete status
