#!/usr/bin/env python3
"""
Bilibili Video Analyzer - Audio Extractor
音频提取模块 - 从视频中提取音频文件
"""

import os
import subprocess
import logging
from typing import Optional
from pathlib import Path
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class AudioExtractionResult:
    """音频提取结果"""
    success: bool
    file_path: str
    duration: float = 0.0
    format: str = "wav"
    sample_rate: int = 16000
    error_message: Optional[str] = None


class AudioExtractor:
    """音频提取器 - 使用 ffmpeg 从视频中提取音频

    Features:
    - 从视频提取音频轨道
    - 支持多种输出格式（WAV, MP3）
    - 支持自定义采样率
    - 支持长视频分段提取
    """

    def __init__(self, output_format: str = "wav", sample_rate: int = 16000,
                 output_subdir: str = "audio"):
        """初始化音频提取器

        Args:
            output_format: 输出格式，默认 "wav"（Whisper 推荐格式）
            sample_rate: 采样率，默认 16000（Whisper 推荐）
            output_subdir: 输出子目录名，默认 "audio"
        """
        self.output_format = output_format
        self.sample_rate = sample_rate
        self.output_subdir = output_subdir

    @staticmethod
    def check_ffmpeg() -> bool:
        """检查 ffmpeg 是否可用"""
        try:
            result = subprocess.run(
                ['ffmpeg', '-version'],
                capture_output=True,
                text=True,
                timeout=10
            )
            return result.returncode == 0
        except (subprocess.SubprocessError, FileNotFoundError, OSError):
            return False

    def extract(self, video_path: str, output_dir: str,
                filename: Optional[str] = None) -> AudioExtractionResult:
        """从视频提取音频

        Args:
            video_path: 视频文件路径
            output_dir: 输出目录
            filename: 输出文件名（不含扩展名），默认为 "audio"

        Returns:
            AudioExtractionResult: 提取结果
        """
        # 检查 ffmpeg
        if not self.check_ffmpeg():
            return AudioExtractionResult(
                success=False,
                file_path="",
                error_message="ffmpeg 未安装或不可用"
            )

        # 检查视频文件
        if not os.path.exists(video_path):
            return AudioExtractionResult(
                success=False,
                file_path="",
                error_message=f"视频文件不存在: {video_path}"
            )

        # 创建输出目录
        audio_dir = os.path.join(output_dir, self.output_subdir)
        os.makedirs(audio_dir, exist_ok=True)

        # 生成输出文件路径
        if filename is None:
            filename = "audio"
        output_path = os.path.join(audio_dir, f"{filename}.{self.output_format}")

        logger.info(f"正在提取音频: {video_path} -> {output_path}")

        try:
            # 构建 ffmpeg 命令
            cmd = [
                'ffmpeg', '-y',
                '-i', video_path,
                '-vn',  # 不处理视频
                '-acodec', self._get_codec(),
                '-ar', str(self.sample_rate),
                '-ac', '1',  # 单声道（Whisper 推荐）
            ]

            # WAV 格式特殊处理
            if self.output_format == "wav":
                cmd.extend(['-f', 'wav'])

            cmd.append(output_path)

            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=300  # 5分钟超时
            )

            if result.returncode != 0:
                logger.error(f"音频提取失败: {result.stderr}")
                return AudioExtractionResult(
                    success=False,
                    file_path="",
                    error_message=f"ffmpeg 错误: {result.stderr[:200]}"
                )

            # 获取音频时长
            duration = self._get_audio_duration(output_path)

            logger.info(f"音频提取成功: {output_path}, 时长: {duration:.2f}秒")

            return AudioExtractionResult(
                success=True,
                file_path=output_path,
                duration=duration,
                format=self.output_format,
                sample_rate=self.sample_rate
            )

        except subprocess.TimeoutExpired:
            logger.error("音频提取超时")
            return AudioExtractionResult(
                success=False,
                file_path="",
                error_message="音频提取超时"
            )
        except Exception as e:
            logger.error(f"音频提取异常: {e}")
            return AudioExtractionResult(
                success=False,
                file_path="",
                error_message=str(e)
            )

    def _get_codec(self) -> str:
        """根据输出格式获取编码器"""
        codec_map = {
            "wav": "pcm_s16le",
            "mp3": "libmp3lame",
            "aac": "aac",
            "flac": "flac",
        }
        return codec_map.get(self.output_format, "pcm_s16le")

    def _get_audio_duration(self, audio_path: str) -> float:
        """获取音频时长"""
        try:
            result = subprocess.run(
                [
                    'ffprobe', '-v', 'quiet',
                    '-show_entries', 'format=duration',
                    '-of', 'default=noprint_wrappers=1:nokey=1',
                    audio_path
                ],
                capture_output=True,
                text=True,
                timeout=30
            )
            if result.returncode == 0:
                return float(result.stdout.strip())
        except (subprocess.SubprocessError, ValueError):
            pass
        return 0.0

    def extract_segment(self, video_path: str, output_dir: str,
                        start_time: float, duration: float,
                        segment_index: int = 0) -> AudioExtractionResult:
        """提取视频的音频片段

        Args:
            video_path: 视频文件路径
            output_dir: 输出目录
            start_time: 开始时间（秒）
            duration: 片段时长（秒）
            segment_index: 片段索引

        Returns:
            AudioExtractionResult: 提取结果
        """
        if not self.check_ffmpeg():
            return AudioExtractionResult(
                success=False,
                file_path="",
                error_message="ffmpeg 未安装或不可用"
            )

        # 创建输出目录
        audio_dir = os.path.join(output_dir, self.output_subdir)
        os.makedirs(audio_dir, exist_ok=True)

        # 生成输出文件路径
        output_path = os.path.join(
            audio_dir,
            f"segment_{segment_index:04d}.{self.output_format}"
        )

        try:
            cmd = [
                'ffmpeg', '-y',
                '-ss', str(start_time),
                '-i', video_path,
                '-t', str(duration),
                '-vn',
                '-acodec', self._get_codec(),
                '-ar', str(self.sample_rate),
                '-ac', '1',
            ]

            if self.output_format == "wav":
                cmd.extend(['-f', 'wav'])

            cmd.append(output_path)

            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=60
            )

            if result.returncode != 0:
                return AudioExtractionResult(
                    success=False,
                    file_path="",
                    error_message=f"ffmpeg 错误: {result.stderr[:200]}"
                )

            actual_duration = self._get_audio_duration(output_path)

            return AudioExtractionResult(
                success=True,
                file_path=output_path,
                duration=actual_duration,
                format=self.output_format,
                sample_rate=self.sample_rate
            )

        except Exception as e:
            return AudioExtractionResult(
                success=False,
                file_path="",
                error_message=str(e)
            )

    def extract_segments(self, video_path: str, output_dir: str,
                         segment_duration: float = 300.0) -> list:
        """将视频音频分段提取（用于长视频）

        Args:
            video_path: 视频文件路径
            output_dir: 输出目录
            segment_duration: 每段时长（秒），默认5分钟

        Returns:
            list: AudioExtractionResult 列表
        """
        # 先获取完整音频时长
        full_result = self.extract(video_path, output_dir, "full_audio")
        if not full_result.success:
            return [full_result]

        total_duration = full_result.duration

        # 如果总时长小于分段时长，直接返回完整音频
        if total_duration <= segment_duration:
            return [full_result]

        # 分段提取
        results = []
        segment_index = 0
        current_time = 0.0

        while current_time < total_duration:
            remaining = total_duration - current_time
            duration = min(segment_duration, remaining)

            result = self.extract_segment(
                video_path, output_dir,
                current_time, duration,
                segment_index
            )
            results.append(result)

            current_time += segment_duration
            segment_index += 1

        logger.info(f"音频分段提取完成: {len(results)} 个片段")
        return results
