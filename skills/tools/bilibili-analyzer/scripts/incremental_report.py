#!/usr/bin/env python3
"""
Bilibili Video Analyzer - Incremental Report Generator
增量报告生成器 - 实时写入分析结果到 Markdown 报告
"""

import os
import json
import logging
from typing import List, Optional
from datetime import datetime
from pathlib import Path

logger = logging.getLogger(__name__)

# 支持相对导入和绝对导入
try:
    from .models import VideoMetadata, FrameInfo, FrameAnalysis
    from .frame_similarity import FrameGroup
    from .audio_transcriber import TranscriptionResult, TranscriptSegment
    from .claude_cli_analyzer import ClaudeAnalysisResult
except ImportError:
    from models import VideoMetadata, FrameInfo, FrameAnalysis
    from frame_similarity import FrameGroup
    from audio_transcriber import TranscriptionResult, TranscriptSegment
    from claude_cli_analyzer import ClaudeAnalysisResult


class IncrementalReportGenerator:
    """增量报告生成器 - 实时写入分析结果

    Features:
    - 初始化报告文件并写入元数据
    - 每帧分析完成后立即追加到报告
    - 支持插入图片（相对路径）
    - 支持插入音频转录内容
    - 支持生成最终摘要
    """

    REPORT_FILENAME = "视频分析报告.md"

    def __init__(self, output_dir: str, images_subdir: str = "images"):
        """初始化增量报告生成器

        Args:
            output_dir: 输出目录
            images_subdir: 图片子目录名
        """
        self.output_dir = output_dir
        self.images_subdir = images_subdir
        self.report_path = os.path.join(output_dir, self.REPORT_FILENAME)
        self._initialized = False
        self._frame_count = 0
        self._transcript: Optional[TranscriptionResult] = None

    def initialize(self, metadata: VideoMetadata,
                   transcript: Optional[TranscriptionResult] = None) -> bool:
        """初始化报告文件

        Args:
            metadata: 视频元数据
            transcript: 音频转录结果（可选）

        Returns:
            是否初始化成功
        """
        try:
            # 确保输出目录存在
            os.makedirs(self.output_dir, exist_ok=True)

            self._transcript = transcript

            # 写入报告头部
            with open(self.report_path, 'w', encoding='utf-8') as f:
                f.write(self._generate_header(metadata))

            self._initialized = True
            logger.info(f"报告初始化完成: {self.report_path}")
            return True

        except Exception as e:
            logger.error(f"报告初始化失败: {e}")
            return False

    def _generate_header(self, metadata: VideoMetadata) -> str:
        """生成报告头部"""
        lines = [
            f"# 📺 {metadata.title}",
            "",
            "## 📋 视频信息",
            "",
            "| 属性 | 值 |",
            "|------|-----|",
            f"| **BV号** | {metadata.bvid} |",
            f"| **作者** | {metadata.author} |",
            f"| **时长** | {self._format_duration(metadata.duration)} |",
            f"| **播放量** | {metadata.view_count:,} |",
            f"| **点赞数** | {metadata.like_count:,} |",
            f"| **发布时间** | {metadata.publish_time} |",
            f"| **链接** | https://www.bilibili.com/video/{metadata.bvid} |",
            "",
        ]

        if metadata.description:
            lines.extend([
                "### 视频描述",
                "",
                f"> {metadata.description}",
                "",
            ])

        lines.extend([
            "---",
            "",
            "## 📝 内容摘要",
            "",
            "*（分析完成后生成）*",
            "",
            "---",
            "",
            "## 📹 详细分析",
            "",
        ])

        return "\n".join(lines)

    def append_frame_analysis(self, frame: FrameInfo,
                              analysis_result: ClaudeAnalysisResult,
                              group: Optional[FrameGroup] = None) -> bool:
        """追加帧分析结果到报告

        Args:
            frame: 帧信息
            analysis_result: Claude 分析结果
            group: 帧分组信息（可选，用于显示时间范围）

        Returns:
            是否追加成功
        """
        if not self._initialized:
            logger.error("报告未初始化")
            return False

        try:
            content = self._generate_frame_section(frame, analysis_result, group)

            with open(self.report_path, 'a', encoding='utf-8') as f:
                f.write(content)

            self._frame_count += 1
            logger.debug(f"追加帧 {frame.frame_id} 分析结果")
            return True

        except Exception as e:
            logger.error(f"追加帧分析失败: {e}")
            return False

    def _generate_frame_section(self, frame: FrameInfo,
                                 result: ClaudeAnalysisResult,
                                 group: Optional[FrameGroup] = None) -> str:
        """生成单帧分析内容"""
        lines = []

        # 标题（时间戳或时间范围）
        if group and group.frame_count > 1:
            time_range = f"{self._format_time(group.start_time)} - {self._format_time(group.end_time)}"
            lines.append(f"### {time_range}")
            lines.append("")
            lines.append(f"*（合并 {group.frame_count} 帧）*")
        else:
            lines.append(f"### {frame.timestamp_str}")

        lines.append("")

        # 插入图片
        image_path = self._get_relative_image_path(frame.file_path)
        lines.append(f"![{frame.timestamp_str}]({image_path})")
        lines.append("")

        # 分析内容
        if result.success and result.raw_response:
            # 直接使用 Claude 的原始响应
            lines.append(result.raw_response)
            lines.append("")
        elif result.success and result.parsed_analysis:
            analysis = result.parsed_analysis
            if analysis.description:
                lines.append(f"**场景描述**: {analysis.description}")
                lines.append("")

            if analysis.text_content:
                lines.append("**检测到的文字**:")
                for text in analysis.text_content:
                    lines.append(f"- {text}")
                lines.append("")

            if analysis.key_points:
                lines.append("**关键要点**:")
                for point in analysis.key_points:
                    lines.append(f"- {point}")
                lines.append("")
        else:
            lines.append(f"*分析失败: {result.error_message or '未知错误'}*")
            lines.append("")

        # 插入对应时间段的音频转录
        if self._transcript and self._transcript.success:
            start_time = group.start_time if group else frame.timestamp
            end_time = group.end_time if group else frame.timestamp + 1

            transcript_text = self._get_transcript_for_time(start_time, end_time)
            if transcript_text:
                lines.append(f"> **🎤 音频内容** ({self._format_time(start_time)} - {self._format_time(end_time)}):")
                lines.append(f"> ")
                lines.append(f"> {transcript_text}")
                lines.append("")

        lines.append("---")
        lines.append("")

        return "\n".join(lines)

    def _get_relative_image_path(self, absolute_path: str) -> str:
        """获取相对于报告文件的图片路径"""
        try:
            # 获取文件名
            filename = os.path.basename(absolute_path)
            # 返回相对路径
            return f"{self.images_subdir}/{filename}"
        except Exception:
            return absolute_path

    def _get_transcript_for_time(self, start_time: float, end_time: float) -> str:
        """获取指定时间范围的转录文本"""
        if not self._transcript or not self._transcript.segments:
            return ""

        texts = []
        for seg in self._transcript.segments:
            # 检查时间范围是否重叠
            if seg.end >= start_time and seg.start <= end_time:
                texts.append(seg.text)

        return " ".join(texts)

    def insert_summary(self, summary: str) -> bool:
        """插入内容摘要（替换占位符）

        Args:
            summary: 摘要内容

        Returns:
            是否插入成功
        """
        if not self._initialized:
            return False

        try:
            with open(self.report_path, 'r', encoding='utf-8') as f:
                content = f.read()

            # 替换占位符
            placeholder = "*（分析完成后生成）*"
            if placeholder in content:
                content = content.replace(placeholder, summary)

                with open(self.report_path, 'w', encoding='utf-8') as f:
                    f.write(content)

                logger.info("摘要已插入报告")
                return True
            else:
                logger.warning("未找到摘要占位符")
                return False

        except Exception as e:
            logger.error(f"插入摘要失败: {e}")
            return False

    def finalize(self) -> bool:
        """完成报告（添加页脚）

        Returns:
            是否完成成功
        """
        if not self._initialized:
            return False

        try:
            footer = self._generate_footer()

            with open(self.report_path, 'a', encoding='utf-8') as f:
                f.write(footer)

            logger.info(f"报告完成: {self.report_path}")
            return True

        except Exception as e:
            logger.error(f"完成报告失败: {e}")
            return False

    def _generate_footer(self) -> str:
        """生成报告页脚"""
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        return f"""
---

## 📊 分析统计

- 分析帧数: {self._frame_count}
- 生成时间: {now}

---

*由 Bilibili Video Analyzer 自动生成*

*使用 Claude Code 进行 AI 分析*
"""

    @staticmethod
    def _format_duration(seconds: int) -> str:
        """格式化时长"""
        hours = seconds // 3600
        minutes = (seconds % 3600) // 60
        secs = seconds % 60
        if hours > 0:
            return f"{hours}:{minutes:02d}:{secs:02d}"
        return f"{minutes}:{secs:02d}"

    @staticmethod
    def _format_time(seconds: float) -> str:
        """格式化时间戳"""
        hours = int(seconds // 3600)
        minutes = int((seconds % 3600) // 60)
        secs = int(seconds % 60)
        return f"{hours:02d}:{minutes:02d}:{secs:02d}"


class ReportSummaryGenerator:
    """报告摘要生成器 - 使用 Claude 生成整体摘要"""

    SUMMARY_PROMPT = """请根据以下视频分析内容，生成一个简洁的内容摘要（200-300字）：

视频标题: {title}
视频时长: {duration}

分析内容:
{content}

请总结视频的主要内容、关键信息和整体主题。用中文回答。"""

    @staticmethod
    def generate_summary_from_analyses(analyses: List[FrameAnalysis],
                                       metadata: VideoMetadata) -> str:
        """从分析结果生成摘要（简单版本，不调用 Claude）

        Args:
            analyses: 分析结果列表
            metadata: 视频元数据

        Returns:
            摘要文本
        """
        if not analyses:
            return "无分析结果"

        # 收集所有描述
        descriptions = [a.description for a in analyses if a.description]

        # 收集所有关键要点
        all_key_points = []
        for a in analyses:
            all_key_points.extend(a.key_points)

        # 去重
        unique_points = list(dict.fromkeys(all_key_points))[:10]

        # 生成摘要
        lines = [
            f"本视频共分析了 **{len(analyses)}** 个关键场景。",
            "",
        ]

        if unique_points:
            lines.append("### 主要内容")
            lines.append("")
            for point in unique_points:
                lines.append(f"- {point}")
            lines.append("")

        # 场景类型统计
        scene_types = {}
        for a in analyses:
            if a.scene_type:
                scene_types[a.scene_type] = scene_types.get(a.scene_type, 0) + 1

        if scene_types:
            lines.append("### 场景分布")
            lines.append("")
            for scene_type, count in sorted(scene_types.items(), key=lambda x: -x[1]):
                lines.append(f"- {scene_type}: {count} 个场景")
            lines.append("")

        return "\n".join(lines)
