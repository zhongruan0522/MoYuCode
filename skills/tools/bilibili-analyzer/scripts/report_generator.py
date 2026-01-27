#!/usr/bin/env python3
"""
Bilibili Video Analyzer - Report Generator
Markdown报告生成模块

Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8
"""

import os
import re
import shutil
from pathlib import Path
from typing import List, Optional
from datetime import datetime

# 支持相对导入和绝对导入
try:
    from .models import (
        VideoMetadata,
        FrameInfo,
        FrameAnalysis,
        ReportConfig,
        VideoReport,
    )
    from .exceptions import ReportGenerationError
except ImportError:
    from models import (
        VideoMetadata,
        FrameInfo,
        FrameAnalysis,
        ReportConfig,
        VideoReport,
    )
    from exceptions import ReportGenerationError


class ReportGenerator:
    """Markdown报告生成器
    
    负责生成包含视频分析结果的Markdown报告，包括：
    - 视频元数据头部
    - 执行摘要
    - 目录（带锚点链接）
    - 时间线内容（嵌入帧图片）
    
    Requirements:
    - 5.1: 创建报告到 ./bilibili/{video_title}/ 目录
    - 5.2: 包含视频元数据
    - 5.3: 按时间线组织内容
    - 5.4: 使用相对路径嵌入图片
    - 5.5: 时间戳格式化为 HH:MM:SS
    - 5.6: 生成执行摘要
    - 5.7: 生成目录
    - 5.8: 自动创建输出目录
    """
    
    def __init__(self, config: ReportConfig):
        """初始化报告生成器
        
        Args:
            config: 报告配置
        """
        self.config = config
        self._images_subdir = "images"
    
    # ========================================================================
    # Core Functions (Task 9.1)
    # ========================================================================
    
    def ensure_output_directory(self) -> Path:
        """确保输出目录存在，如不存在则创建
        
        Requirements: 5.8
        
        Returns:
            输出目录的Path对象
            
        Raises:
            ReportGenerationError: 无法创建目录时
        """
        try:
            output_path = Path(self.config.output_dir)
            output_path.mkdir(parents=True, exist_ok=True)
            
            # 创建images子目录
            images_path = output_path / self._images_subdir
            images_path.mkdir(parents=True, exist_ok=True)
            
            return output_path
        except OSError as e:
            raise ReportGenerationError(
                f"无法创建输出目录: {e}",
                output_path=self.config.output_dir
            )

    def copy_frames(self, frames: List[FrameInfo], dest_dir: Optional[str] = None) -> List[str]:
        """复制帧图片到输出目录
        
        Requirements: 5.4
        
        Args:
            frames: 帧信息列表
            dest_dir: 目标目录，默认为 output_dir/images/
            
        Returns:
            复制后的相对路径列表
            
        Raises:
            ReportGenerationError: 复制失败时
        """
        if dest_dir is None:
            dest_dir = str(Path(self.config.output_dir) / self._images_subdir)
        
        # 确保目标目录存在
        dest_path = Path(dest_dir)
        dest_path.mkdir(parents=True, exist_ok=True)
        
        relative_paths = []
        
        for frame in frames:
            src_path = Path(frame.file_path)
            if not src_path.exists():
                # 跳过不存在的文件，记录警告
                relative_paths.append("")
                continue
            
            # 保持原文件名
            dest_file = dest_path / src_path.name
            
            try:
                shutil.copy2(str(src_path), str(dest_file))
                # 返回相对于报告文件的路径
                relative_paths.append(f"{self._images_subdir}/{src_path.name}")
            except OSError as e:
                raise ReportGenerationError(
                    f"无法复制帧图片 {src_path}: {e}",
                    output_path=str(dest_file)
                )
        
        return relative_paths
    
    def _sanitize_title(self, title: str) -> str:
        """清理标题，移除不适合作为文件名的字符
        
        Args:
            title: 原始标题
            
        Returns:
            清理后的标题
        """
        # 移除或替换不安全字符
        sanitized = re.sub(r'[<>:"/\\|?*]', '_', title)
        # 移除控制字符
        sanitized = re.sub(r'[\x00-\x1f\x7f]', '', sanitized)
        # 限制长度
        return sanitized[:100].strip()
    
    def _format_timestamp(self, seconds: float) -> str:
        """将秒数格式化为 HH:MM:SS 格式
        
        Requirements: 5.5
        
        Args:
            seconds: 秒数
            
        Returns:
            格式化的时间字符串
        """
        hours = int(seconds // 3600)
        minutes = int((seconds % 3600) // 60)
        secs = int(seconds % 60)
        return f"{hours:02d}:{minutes:02d}:{secs:02d}"
    
    def _generate_anchor(self, text: str) -> str:
        """生成Markdown锚点ID
        
        Args:
            text: 标题文本
            
        Returns:
            锚点ID
        """
        # 转小写，替换空格为连字符，移除特殊字符
        anchor = text.lower()
        anchor = re.sub(r'\s+', '-', anchor)
        anchor = re.sub(r'[^\w\-]', '', anchor)
        return anchor

    def generate_frame_section(
        self,
        frame: FrameInfo,
        analysis: Optional[FrameAnalysis],
        image_path: str
    ) -> str:
        """生成单个帧的Markdown内容
        
        Requirements: 5.3, 5.4, 5.5
        
        Args:
            frame: 帧信息
            analysis: 帧分析结果（可选）
            image_path: 图片相对路径
            
        Returns:
            Markdown格式的帧内容
        """
        lines = []
        
        # 帧标题（使用时间戳）
        timestamp_str = frame.timestamp_str or self._format_timestamp(frame.timestamp)
        scene_marker = " 🎬" if frame.is_scene_change else ""
        lines.append(f"### {timestamp_str}{scene_marker}")
        lines.append("")
        
        # 嵌入图片（使用相对路径）
        if image_path:
            lines.append(f"![Frame at {timestamp_str}]({image_path})")
            lines.append("")
        
        # 分析结果
        if analysis:
            # 场景描述
            if analysis.description:
                lines.append(f"**描述**: {analysis.description}")
                lines.append("")
            
            # 场景类型
            if analysis.scene_type:
                lines.append(f"**场景类型**: {analysis.scene_type}")
                lines.append("")
            
            # 检测到的物体
            if analysis.objects:
                lines.append(f"**检测到的物体**: {', '.join(analysis.objects)}")
                lines.append("")
            
            # 检测到的文字
            if analysis.text_content:
                lines.append("**检测到的文字**:")
                for text in analysis.text_content:
                    lines.append(f"- {text}")
                lines.append("")
            
            # 人物数量
            if analysis.people_count > 0:
                lines.append(f"**人物数量**: {analysis.people_count}")
                lines.append("")
            
            # 关键要点
            if analysis.key_points:
                lines.append("**关键要点**:")
                for point in analysis.key_points:
                    lines.append(f"- {point}")
                lines.append("")
            
            # 置信度
            if analysis.confidence > 0:
                lines.append(f"*置信度: {analysis.confidence:.1%}*")
                lines.append("")
        else:
            lines.append("*分析结果不可用*")
            lines.append("")
        
        lines.append("---")
        lines.append("")
        
        return "\n".join(lines)
    
    def generate_timeline_content(
        self,
        frames: List[FrameInfo],
        analyses: List[FrameAnalysis],
        image_paths: List[str]
    ) -> str:
        """生成时间线内容
        
        Requirements: 5.3
        
        Args:
            frames: 帧信息列表
            analyses: 分析结果列表
            image_paths: 图片相对路径列表
            
        Returns:
            Markdown格式的时间线内容
        """
        lines = ["## 📹 视频内容分析", ""]
        
        # 创建分析结果的映射（按frame_id）
        analysis_map = {a.frame_id: a for a in analyses}
        
        for i, frame in enumerate(frames):
            analysis = analysis_map.get(frame.frame_id)
            image_path = image_paths[i] if i < len(image_paths) else ""
            
            section = self.generate_frame_section(frame, analysis, image_path)
            lines.append(section)
        
        return "\n".join(lines)

    # ========================================================================
    # Enhanced Functions (Task 9.2)
    # ========================================================================
    
    def generate_metadata_header(self, metadata: VideoMetadata) -> str:
        """生成视频元数据头部
        
        Requirements: 5.2
        
        Args:
            metadata: 视频元数据
            
        Returns:
            Markdown格式的元数据头部
        """
        lines = [
            f"# 📺 {metadata.title}",
            "",
            "## 📋 视频信息",
            "",
            "| 属性 | 值 |",
            "|------|-----|",
            f"| **BV号** | {metadata.bvid} |",
            f"| **作者** | {metadata.author} (UID: {metadata.author_id}) |",
            f"| **时长** | {self._format_timestamp(metadata.duration)} |",
            f"| **播放量** | {metadata.view_count:,} |",
            f"| **点赞数** | {metadata.like_count:,} |",
            f"| **发布时间** | {metadata.publish_time} |",
            f"| **链接** | https://www.bilibili.com/video/{metadata.bvid} |",
            "",
        ]
        
        # 视频描述
        if metadata.description:
            lines.extend([
                "### 视频描述",
                "",
                f"> {metadata.description}",
                "",
            ])
        
        return "\n".join(lines)
    
    def generate_summary(self, analyses: List[FrameAnalysis]) -> str:
        """生成执行摘要
        
        Requirements: 5.6
        
        Args:
            analyses: 分析结果列表
            
        Returns:
            Markdown格式的执行摘要
        """
        if not analyses:
            return "## 📝 执行摘要\n\n*无分析结果可用*\n"
        
        lines = ["## 📝 执行摘要", ""]
        
        # 统计信息
        total_frames = len(analyses)
        scene_types = {}
        all_objects = []
        all_text = []
        total_people = 0
        all_key_points = []
        
        for analysis in analyses:
            # 统计场景类型
            if analysis.scene_type:
                scene_types[analysis.scene_type] = scene_types.get(analysis.scene_type, 0) + 1
            
            # 收集物体
            all_objects.extend(analysis.objects)
            
            # 收集文字
            all_text.extend(analysis.text_content)
            
            # 统计人物
            total_people += analysis.people_count
            
            # 收集关键要点
            all_key_points.extend(analysis.key_points)
        
        # 基本统计
        lines.extend([
            f"本视频共分析了 **{total_frames}** 个关键帧。",
            "",
        ])
        
        # 场景类型分布
        if scene_types:
            lines.append("### 场景类型分布")
            lines.append("")
            for scene_type, count in sorted(scene_types.items(), key=lambda x: -x[1]):
                percentage = count / total_frames * 100
                lines.append(f"- **{scene_type}**: {count} 帧 ({percentage:.1f}%)")
            lines.append("")
        
        # 主要物体
        if all_objects:
            # 统计出现频率最高的物体
            object_counts = {}
            for obj in all_objects:
                object_counts[obj] = object_counts.get(obj, 0) + 1
            
            top_objects = sorted(object_counts.items(), key=lambda x: -x[1])[:10]
            lines.append("### 主要检测物体")
            lines.append("")
            lines.append(", ".join([f"{obj} ({count}次)" for obj, count in top_objects]))
            lines.append("")
        
        # 检测到的文字
        if all_text:
            unique_text = list(set(all_text))[:10]  # 去重并限制数量
            lines.append("### 检测到的文字")
            lines.append("")
            for text in unique_text:
                lines.append(f"- {text}")
            lines.append("")
        
        # 人物统计
        if total_people > 0:
            avg_people = total_people / total_frames
            lines.append(f"### 人物统计")
            lines.append("")
            lines.append(f"视频中共检测到约 **{total_people}** 人次出现，平均每帧 {avg_people:.1f} 人。")
            lines.append("")
        
        # 关键要点汇总
        if all_key_points:
            unique_points = list(set(all_key_points))[:15]  # 去重并限制数量
            lines.append("### 关键要点汇总")
            lines.append("")
            for point in unique_points:
                lines.append(f"- {point}")
            lines.append("")
        
        return "\n".join(lines)

    def generate_toc(self, frames: List[FrameInfo]) -> str:
        """生成目录（带锚点链接）
        
        Requirements: 5.7
        
        Args:
            frames: 帧信息列表
            
        Returns:
            Markdown格式的目录
        """
        lines = ["## 📑 目录", ""]
        
        # 固定章节
        lines.append("- [视频信息](#-视频信息)")
        lines.append("- [执行摘要](#-执行摘要)")
        lines.append("- [视频内容分析](#-视频内容分析)")
        
        # 帧时间戳链接
        if frames:
            lines.append("  - 时间线:")
            for frame in frames:
                timestamp_str = frame.timestamp_str or self._format_timestamp(frame.timestamp)
                anchor = self._generate_anchor(timestamp_str)
                scene_marker = " 🎬" if frame.is_scene_change else ""
                lines.append(f"    - [{timestamp_str}{scene_marker}](#{anchor})")
        
        lines.append("")
        return "\n".join(lines)
    
    # ========================================================================
    # Main Generation Method
    # ========================================================================
    
    def generate(
        self,
        metadata: VideoMetadata,
        analyses: List[FrameAnalysis],
        frames: List[FrameInfo]
    ) -> str:
        """生成完整的Markdown报告
        
        Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8
        
        Args:
            metadata: 视频元数据
            analyses: 分析结果列表
            frames: 帧信息列表
            
        Returns:
            完整的Markdown报告内容
            
        Raises:
            ReportGenerationError: 生成失败时
        """
        # 确保输出目录存在
        self.ensure_output_directory()
        
        # 复制帧图片到输出目录
        image_paths = self.copy_frames(frames)
        
        # 生成报告各部分
        parts = []
        
        # 1. 元数据头部
        parts.append(self.generate_metadata_header(metadata))
        
        # 2. 目录（如果启用）
        if self.config.include_toc:
            parts.append(self.generate_toc(frames))
        
        # 3. 执行摘要（如果启用）
        if self.config.include_summary:
            parts.append(self.generate_summary(analyses))
        
        # 4. 时间线内容
        parts.append(self.generate_timeline_content(frames, analyses, image_paths))
        
        # 5. 页脚
        parts.append(self._generate_footer())
        
        return "\n".join(parts)
    
    def _generate_footer(self) -> str:
        """生成报告页脚
        
        Returns:
            Markdown格式的页脚
        """
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        return f"""
---

*报告生成时间: {now}*

*由 Bilibili Video Analyzer 自动生成*
"""
    
    def save_report(
        self,
        metadata: VideoMetadata,
        analyses: List[FrameAnalysis],
        frames: List[FrameInfo],
        filename: str = "report.md"
    ) -> str:
        """生成并保存报告到文件
        
        Args:
            metadata: 视频元数据
            analyses: 分析结果列表
            frames: 帧信息列表
            filename: 报告文件名
            
        Returns:
            保存的文件路径
            
        Raises:
            ReportGenerationError: 保存失败时
        """
        # 生成报告内容
        content = self.generate(metadata, analyses, frames)
        
        # 保存到文件
        output_path = Path(self.config.output_dir) / filename
        
        try:
            with open(output_path, 'w', encoding='utf-8') as f:
                f.write(content)
            return str(output_path)
        except OSError as e:
            raise ReportGenerationError(
                f"无法保存报告: {e}",
                output_path=str(output_path)
            )
    
    def generate_report(self, report: VideoReport) -> str:
        """从VideoReport对象生成报告
        
        Args:
            report: 视频报告对象
            
        Returns:
            完整的Markdown报告内容
        """
        return self.generate(report.metadata, report.analyses, report.frames)
