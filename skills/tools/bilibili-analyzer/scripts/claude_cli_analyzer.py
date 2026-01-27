#!/usr/bin/env python3
"""
Bilibili Video Analyzer - Claude CLI Analyzer
Claude Code CLI 分析器 - 使用 claude 命令行工具分析图片
"""

import os
import subprocess
import json
import logging
from typing import List, Optional, Callable, Dict, Any
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

# 支持相对导入和绝对导入
try:
    from .models import FrameInfo, FrameAnalysis
    from .frame_similarity import FrameGroup
except ImportError:
    from models import FrameInfo, FrameAnalysis
    from frame_similarity import FrameGroup


@dataclass
class ClaudeAnalysisResult:
    """Claude 分析结果"""
    success: bool
    frame_id: int
    timestamp: float
    raw_response: str = ""
    parsed_analysis: Optional[FrameAnalysis] = None
    error_message: Optional[str] = None


@dataclass
class AnalysisProgress:
    """分析进度"""
    total_frames: int
    analyzed_frames: List[int] = field(default_factory=list)
    failed_frames: List[int] = field(default_factory=list)
    last_frame_id: int = -1


class ClaudeCLIAnalyzer:
    """Claude CLI 分析器 - 使用 claude -p 命令分析图片

    Features:
    - 使用 claude -p --image 命令进行一次性分析
    - 支持自定义分析提示词
    - 支持断点续传
    - 每帧分析后可立即回调
    """

    DEFAULT_PROMPT = """请分析这张视频截图（时间戳: {timestamp}）。

请识别并描述以下内容：
1. **场景描述**: 简要描述画面中的整体场景（1-2句话）
2. **画面内容**: 列出画面中的主要元素
3. **文字内容**: 识别画面中出现的任何文字（如字幕、标题、标签等）
4. **人物信息**: 描述画面中的人物（如有）
5. **关键信息**: 提取2-3个最重要的信息点

请直接用中文回答，格式清晰简洁。"""

    def __init__(self, timeout: int = 120, max_retries: int = 2):
        """初始化 Claude CLI 分析器

        Args:
            timeout: 命令超时时间（秒），默认 120
            max_retries: 最大重试次数，默认 2
        """
        self.timeout = timeout
        self.max_retries = max_retries
        self._progress: Optional[AnalysisProgress] = None

    @staticmethod
    def check_claude_cli() -> bool:
        """检查 claude 命令行工具是否可用"""
        try:
            result = subprocess.run(
                ['claude', '--version'],
                capture_output=True,
                text=True,
                timeout=10
            )
            return result.returncode == 0
        except (subprocess.SubprocessError, FileNotFoundError, OSError):
            return False

    def analyze_frame(self, frame: FrameInfo,
                      custom_prompt: Optional[str] = None,
                      context: Optional[str] = None) -> ClaudeAnalysisResult:
        """分析单个帧

        Args:
            frame: 帧信息
            custom_prompt: 自定义提示词（可选）
            context: 上下文信息（如前一帧的摘要）

        Returns:
            ClaudeAnalysisResult: 分析结果
        """
        if not os.path.exists(frame.file_path):
            return ClaudeAnalysisResult(
                success=False,
                frame_id=frame.frame_id,
                timestamp=frame.timestamp,
                error_message=f"图片文件不存在: {frame.file_path}"
            )

        # 构建提示词
        prompt = custom_prompt or self.DEFAULT_PROMPT
        prompt = prompt.format(timestamp=frame.timestamp_str)

        # 添加上下文
        if context:
            prompt = f"上一个场景的内容: {context}\n\n{prompt}"

        # 执行分析（带重试）
        last_error = None
        for attempt in range(self.max_retries + 1):
            try:
                response = self._call_claude(frame.file_path, prompt)

                if response:
                    # 解析响应
                    analysis = self._parse_response(response, frame)

                    return ClaudeAnalysisResult(
                        success=True,
                        frame_id=frame.frame_id,
                        timestamp=frame.timestamp,
                        raw_response=response,
                        parsed_analysis=analysis
                    )

            except Exception as e:
                last_error = e
                logger.warning(f"帧 {frame.frame_id} 分析失败 (尝试 {attempt + 1}/{self.max_retries + 1}): {e}")

        return ClaudeAnalysisResult(
            success=False,
            frame_id=frame.frame_id,
            timestamp=frame.timestamp,
            error_message=str(last_error) if last_error else "分析失败"
        )

    def _call_claude(self, image_path: str, prompt: str) -> str:
        """调用 claude 命令行

        Args:
            image_path: 图片路径
            prompt: 提示词

        Returns:
            Claude 的响应文本
        """
        # 使用 claude -p 进行一次性分析
        cmd = [
            'claude',
            '-p', prompt,
            '--image', image_path,
            '--output-format', 'text'
        ]

        logger.debug(f"执行命令: claude -p ... --image {image_path}")

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=self.timeout,
            encoding='utf-8'
        )

        if result.returncode != 0:
            error_msg = result.stderr.strip() if result.stderr else "未知错误"
            raise RuntimeError(f"Claude CLI 错误: {error_msg}")

        return result.stdout.strip()

    def _parse_response(self, response: str, frame: FrameInfo) -> FrameAnalysis:
        """解析 Claude 响应为 FrameAnalysis

        Args:
            response: Claude 的响应文本
            frame: 帧信息

        Returns:
            FrameAnalysis: 解析后的分析结果
        """
        # 尝试提取结构化信息
        description = response[:500] if len(response) > 500 else response

        # 简单的文本解析
        objects = []
        text_content = []
        key_points = []
        scene_type = "video_frame"
        people_count = 0

        lines = response.split('\n')
        current_section = None

        for line in lines:
            line = line.strip()
            if not line:
                continue

            # 检测章节标题
            if '场景描述' in line or '画面描述' in line:
                current_section = 'description'
            elif '画面内容' in line or '主要元素' in line or '物体' in line:
                current_section = 'objects'
            elif '文字内容' in line or '文字' in line:
                current_section = 'text'
            elif '人物' in line:
                current_section = 'people'
            elif '关键' in line or '要点' in line:
                current_section = 'key_points'
            elif line.startswith('-') or line.startswith('•') or line.startswith('*'):
                # 列表项
                item = line.lstrip('-•* ').strip()
                if current_section == 'objects':
                    objects.append(item)
                elif current_section == 'text':
                    text_content.append(item)
                elif current_section == 'key_points':
                    key_points.append(item)

        return FrameAnalysis(
            frame_id=frame.frame_id,
            timestamp=frame.timestamp,
            description=description,
            objects=objects,
            text_content=text_content,
            people_count=people_count,
            scene_type=scene_type,
            key_points=key_points,
            confidence=0.8
        )

    def analyze_frames(self, frames: List[FrameInfo],
                       on_frame_analyzed: Optional[Callable[[ClaudeAnalysisResult], None]] = None,
                       on_progress: Optional[Callable[[int, int], None]] = None,
                       resume_from: Optional[AnalysisProgress] = None) -> List[ClaudeAnalysisResult]:
        """分析多个帧

        Args:
            frames: 帧列表
            on_frame_analyzed: 每帧分析完成后的回调
            on_progress: 进度回调 (current, total)
            resume_from: 从之前的进度恢复

        Returns:
            List[ClaudeAnalysisResult]: 分析结果列表
        """
        if not self.check_claude_cli():
            logger.error("Claude CLI 不可用")
            return []

        results: List[ClaudeAnalysisResult] = []
        total = len(frames)

        # 初始化或恢复进度
        if resume_from:
            self._progress = resume_from
            analyzed_set = set(resume_from.analyzed_frames)
        else:
            self._progress = AnalysisProgress(total_frames=total)
            analyzed_set = set()

        logger.info(f"开始分析 {total} 帧")

        previous_summary = None

        for idx, frame in enumerate(frames):
            # 跳过已分析的帧
            if frame.frame_id in analyzed_set:
                logger.debug(f"跳过已分析的帧 {frame.frame_id}")
                continue

            # 分析帧
            result = self.analyze_frame(frame, context=previous_summary)
            results.append(result)

            # 更新进度
            if result.success:
                self._progress.analyzed_frames.append(frame.frame_id)
                # 更新上下文
                if result.parsed_analysis:
                    previous_summary = result.parsed_analysis.description[:100]
            else:
                self._progress.failed_frames.append(frame.frame_id)

            self._progress.last_frame_id = frame.frame_id

            # 回调
            if on_frame_analyzed:
                on_frame_analyzed(result)

            if on_progress:
                on_progress(idx + 1, total)

            logger.info(f"帧 {frame.frame_id} ({frame.timestamp_str}) 分析{'成功' if result.success else '失败'}")

        return results

    def analyze_frame_groups(self, groups: List[FrameGroup],
                             on_group_analyzed: Optional[Callable[[FrameGroup, ClaudeAnalysisResult], None]] = None,
                             on_progress: Optional[Callable[[int, int], None]] = None) -> List[ClaudeAnalysisResult]:
        """分析帧分组（只分析代表帧）

        Args:
            groups: 帧分组列表
            on_group_analyzed: 每组分析完成后的回调
            on_progress: 进度回调

        Returns:
            List[ClaudeAnalysisResult]: 分析结果列表
        """
        results: List[ClaudeAnalysisResult] = []
        total = len(groups)

        logger.info(f"开始分析 {total} 个帧分组")

        previous_summary = None

        for idx, group in enumerate(groups):
            frame = group.representative_frame

            # 构建包含时间范围的提示
            time_range = f"{self._format_time(group.start_time)} - {self._format_time(group.end_time)}"
            context = f"时间范围: {time_range}，包含 {group.frame_count} 帧"
            if previous_summary:
                context = f"上一场景: {previous_summary}\n{context}"

            result = self.analyze_frame(frame, context=context)
            results.append(result)

            # 更新上下文
            if result.success and result.parsed_analysis:
                previous_summary = result.parsed_analysis.description[:100]

            # 回调
            if on_group_analyzed:
                on_group_analyzed(group, result)

            if on_progress:
                on_progress(idx + 1, total)

        return results

    @staticmethod
    def _format_time(seconds: float) -> str:
        """格式化时间"""
        hours = int(seconds // 3600)
        minutes = int((seconds % 3600) // 60)
        secs = int(seconds % 60)
        return f"{hours:02d}:{minutes:02d}:{secs:02d}"

    def save_progress(self, output_path: str) -> bool:
        """保存分析进度

        Args:
            output_path: 输出文件路径

        Returns:
            是否保存成功
        """
        if not self._progress:
            return False

        try:
            data = {
                "total_frames": self._progress.total_frames,
                "analyzed_frames": self._progress.analyzed_frames,
                "failed_frames": self._progress.failed_frames,
                "last_frame_id": self._progress.last_frame_id
            }

            with open(output_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2)

            return True
        except Exception as e:
            logger.error(f"保存进度失败: {e}")
            return False

    @staticmethod
    def load_progress(file_path: str) -> Optional[AnalysisProgress]:
        """加载分析进度

        Args:
            file_path: 进度文件路径

        Returns:
            AnalysisProgress 或 None
        """
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)

            return AnalysisProgress(
                total_frames=data.get("total_frames", 0),
                analyzed_frames=data.get("analyzed_frames", []),
                failed_frames=data.get("failed_frames", []),
                last_frame_id=data.get("last_frame_id", -1)
            )
        except Exception as e:
            logger.error(f"加载进度失败: {e}")
            return None
