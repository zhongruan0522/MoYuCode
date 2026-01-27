#!/usr/bin/env python3
"""
Bilibili Video Analyzer - Data Models
核心数据模型和配置类

Requirements: 6.1, 6.2, 6.3, 6.4, 7.1
"""

from dataclasses import dataclass, field
from typing import List, Optional
from datetime import datetime


# ============================================================================
# Video Metadata Models
# ============================================================================

@dataclass
class VideoMetadata:
    """视频元数据"""
    bvid: str                          # BV号
    title: str                         # 视频标题
    author: str                        # UP主名称
    author_id: str                     # UP主ID
    duration: int                      # 视频时长（秒）
    description: str                   # 视频描述
    cover_url: str                     # 封面URL
    view_count: int = 0                # 播放量
    like_count: int = 0                # 点赞数
    publish_time: str = ""             # 发布时间


# ============================================================================
# Frame Extraction Models
# ============================================================================

@dataclass
class FrameInfo:
    """帧信息"""
    frame_id: int                      # 帧序号
    timestamp: float                   # 时间戳（秒）
    timestamp_str: str                 # 时间戳字符串 (HH:MM:SS)
    file_path: str                     # 帧图片路径
    is_scene_change: bool = False      # 是否为场景变化帧


@dataclass
class ExtractionResult:
    """帧提取结果"""
    frames: List[FrameInfo]            # 提取的帧列表
    total_frames: int                  # 总帧数
    video_duration: float              # 视频时长（秒）


# ============================================================================
# AI Analysis Models
# ============================================================================

@dataclass
class FrameAnalysis:
    """帧分析结果"""
    frame_id: int                      # 帧序号
    timestamp: float                   # 时间戳（秒）
    description: str                   # 场景描述
    objects: List[str] = field(default_factory=list)      # 检测到的物体
    text_content: List[str] = field(default_factory=list) # 检测到的文字
    people_count: int = 0              # 人物数量
    scene_type: str = ""               # 场景类型
    key_points: List[str] = field(default_factory=list)   # 关键要点
    confidence: float = 0.0            # 置信度 (0-1)


@dataclass
class AnalysisTask:
    """分析任务"""
    task_id: str                       # 任务ID
    frame_info: FrameInfo              # 帧信息
    status: str = "pending"            # 状态: pending, running, completed, failed
    result: Optional[FrameAnalysis] = None  # 分析结果
    retry_count: int = 0               # 重试次数
    error_message: str = ""            # 错误信息


# ============================================================================
# Download Models
# ============================================================================

@dataclass
class DownloadResult:
    """下载结果"""
    success: bool                      # 是否成功
    file_path: str                     # 文件路径
    file_size: int = 0                 # 文件大小（字节）
    error_message: Optional[str] = None  # 错误信息


# ============================================================================
# Configuration Models
# ============================================================================

@dataclass
class AnalyzerConfig:
    """分析器配置
    
    Requirements:
    - 6.1: frame_interval 帧提取间隔
    - 6.2: max_frames 最大帧数
    - 6.3: focus_areas 分析焦点
    - 6.4: output_dir 输出目录
    """
    frame_interval: int = 30           # 帧提取间隔（秒）
    max_frames: int = 50               # 最大帧数
    max_workers: int = 4               # 并行分析数
    output_dir: str = "./bilibili"     # 输出目录
    focus_areas: List[str] = field(default_factory=lambda: ["text", "objects", "faces"])
    enable_scene_detection: bool = True  # 启用场景检测
    download_retries: int = 3          # 下载重试次数
    log_level: str = "INFO"            # 日志级别


@dataclass
class ReportConfig:
    """报告配置"""
    output_dir: str                    # 输出目录
    video_title: str                   # 视频标题
    include_toc: bool = True           # 包含目录
    include_summary: bool = True       # 包含摘要
    image_width: int = 800             # 图片宽度


# ============================================================================
# Report Models
# ============================================================================

@dataclass
class VideoReport:
    """视频分析报告"""
    metadata: VideoMetadata            # 视频元数据
    frames: List[FrameInfo]            # 帧列表
    analyses: List[FrameAnalysis]      # 分析结果列表
    summary: str = ""                  # 执行摘要
    generated_at: str = field(default_factory=lambda: datetime.now().isoformat())
    config: Optional[AnalyzerConfig] = None  # 使用的配置
    status: str = "complete"           # 状态: complete, partial, failed
    errors: List[str] = field(default_factory=list)  # 错误列表
