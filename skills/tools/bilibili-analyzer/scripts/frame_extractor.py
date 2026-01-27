#!/usr/bin/env python3
"""
Bilibili Video Analyzer - Frame Extractor
使用ffmpeg从视频中提取关键帧

Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
"""

import os
import subprocess
import shutil
import json
import logging
from typing import List, Optional, Callable
from pathlib import Path

# 支持相对导入和绝对导入
try:
    from .models import FrameInfo, ExtractionResult
    from .exceptions import FFmpegError, FrameExtractionError
except ImportError:
    from models import FrameInfo, ExtractionResult
    from exceptions import FFmpegError, FrameExtractionError

logger = logging.getLogger(__name__)


class FrameExtractor:
    """帧提取器 - 使用ffmpeg从视频中提取关键帧

    Features:
    - 按固定间隔提取帧 (Requirement 3.1)
    - 场景变化检测 (Requirement 3.2)
    - 保存为JPEG格式，文件名包含时间戳 (Requirement 3.3)
    - 生成帧清单manifest (Requirement 3.4)
    - ffmpeg可用性检查 (Requirement 3.5)
    - 支持每秒1帧的高频提取模式
    - 批量帧提取优化（使用 fps filter）
    """

    def __init__(self, interval: int = 1, max_frames: int = 0,
                 enable_scene_detection: bool = False,
                 output_subdir: str = "images"):
        """初始化帧提取器

        Args:
            interval: 帧提取间隔（秒），默认1秒
            max_frames: 最大提取帧数，0表示不限制，默认0
            enable_scene_detection: 是否启用场景检测，默认False（高频模式下不需要）
            output_subdir: 输出子目录名，默认 "images"
        """
        self.interval = interval
        self.max_frames = max_frames
        self.enable_scene_detection = enable_scene_detection
        self.output_subdir = output_subdir

    @staticmethod
    def check_ffmpeg() -> bool:
        """检查ffmpeg是否可用
        
        Returns:
            bool: ffmpeg是否可用
            
        Requirement: 3.5
        """
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
    
    @staticmethod
    def check_ffprobe() -> bool:
        """检查ffprobe是否可用"""
        try:
            result = subprocess.run(
                ['ffprobe', '-version'],
                capture_output=True,
                text=True,
                timeout=10
            )
            return result.returncode == 0
        except (subprocess.SubprocessError, FileNotFoundError, OSError):
            return False
    
    @staticmethod
    def format_timestamp(seconds: float) -> str:
        """将秒数格式化为HH:MM:SS格式
        
        Args:
            seconds: 时间戳（秒）
            
        Returns:
            str: 格式化的时间戳字符串
        """
        hours = int(seconds // 3600)
        minutes = int((seconds % 3600) // 60)
        secs = int(seconds % 60)
        return f"{hours:02d}:{minutes:02d}:{secs:02d}"
    
    def get_video_duration(self, video_path: str) -> float:
        """获取视频时长
        
        Args:
            video_path: 视频文件路径
            
        Returns:
            float: 视频时长（秒）
            
        Raises:
            FFmpegError: 当无法获取视频时长时
        """
        if not self.check_ffprobe():
            raise FFmpegError(
                "ffprobe未安装或不可用。请安装ffmpeg: https://ffmpeg.org/download.html"
            )
        
        try:
            result = subprocess.run(
                [
                    'ffprobe', '-v', 'quiet',
                    '-show_entries', 'format=duration',
                    '-of', 'json',
                    video_path
                ],
                capture_output=True,
                text=True,
                timeout=30
            )
            
            if result.returncode != 0:
                raise FFmpegError(f"无法获取视频时长: {result.stderr}")
            
            data = json.loads(result.stdout)
            duration = float(data['format']['duration'])
            return duration
            
        except json.JSONDecodeError as e:
            raise FFmpegError(f"解析视频信息失败: {e}")
        except KeyError:
            raise FFmpegError("视频文件格式不支持或已损坏")
        except subprocess.TimeoutExpired:
            raise FFmpegError("获取视频信息超时")

    def detect_scenes(self, video_path: str, threshold: float = 0.3) -> List[float]:
        """检测场景变化时间点
        
        Args:
            video_path: 视频文件路径
            threshold: 场景变化阈值 (0-1)，默认0.3
            
        Returns:
            List[float]: 场景变化时间点列表（秒）
            
        Requirement: 3.2
        """
        if not self.check_ffmpeg():
            raise FFmpegError(
                "ffmpeg未安装或不可用。请安装ffmpeg: https://ffmpeg.org/download.html"
            )
        
        try:
            # 使用ffmpeg的scene检测滤镜
            result = subprocess.run(
                [
                    'ffmpeg', '-i', video_path,
                    '-vf', f'select=gt(scene\\,{threshold}),showinfo',
                    '-f', 'null', '-'
                ],
                capture_output=True,
                text=True,
                timeout=300  # 5分钟超时
            )
            
            # 解析输出获取场景变化时间点
            scene_times = []
            for line in result.stderr.split('\n'):
                if 'pts_time:' in line:
                    try:
                        # 提取pts_time值
                        pts_part = line.split('pts_time:')[1]
                        pts_time = float(pts_part.split()[0])
                        scene_times.append(pts_time)
                    except (IndexError, ValueError):
                        continue
            
            logger.info(f"检测到 {len(scene_times)} 个场景变化点")
            return scene_times
            
        except subprocess.TimeoutExpired:
            logger.warning("场景检测超时，跳过场景检测")
            return []
        except Exception as e:
            logger.warning(f"场景检测失败: {e}，跳过场景检测")
            return []
    
    def _calculate_frame_timestamps(self, duration: float,
                                    scene_times: List[float] = None) -> List[tuple]:
        """计算需要提取的帧时间戳

        Args:
            duration: 视频时长（秒）
            scene_times: 场景变化时间点列表

        Returns:
            List[tuple]: (timestamp, is_scene_change) 列表
        """
        timestamps = []

        # 按间隔生成时间戳
        current = 0.0
        while current < duration:
            timestamps.append((current, False))
            current += self.interval

        # 添加场景变化时间点
        if scene_times:
            for scene_time in scene_times:
                # 检查是否与已有时间戳太接近（在高频模式下使用更小的阈值）
                threshold = min(self.interval / 2, 2.0)
                is_duplicate = any(
                    abs(t[0] - scene_time) < threshold for t in timestamps
                )
                if not is_duplicate and scene_time < duration:
                    timestamps.append((scene_time, True))

        # 按时间排序
        timestamps.sort(key=lambda x: x[0])

        # 限制最大帧数（0表示不限制）
        if self.max_frames > 0 and len(timestamps) > self.max_frames:
            # 优先保留间隔帧，然后是场景变化帧
            interval_frames = [t for t in timestamps if not t[1]]
            scene_frames = [t for t in timestamps if t[1]]

            # 保留所有间隔帧（如果不超过限制）
            if len(interval_frames) <= self.max_frames:
                remaining = self.max_frames - len(interval_frames)
                timestamps = interval_frames + scene_frames[:remaining]
            else:
                timestamps = interval_frames[:self.max_frames]

            timestamps.sort(key=lambda x: x[0])

        return timestamps

    def _extract_single_frame(self, video_path: str, timestamp: float, 
                              output_path: str) -> bool:
        """提取单个帧
        
        Args:
            video_path: 视频文件路径
            timestamp: 时间戳（秒）
            output_path: 输出图片路径
            
        Returns:
            bool: 是否成功
        """
        try:
            result = subprocess.run(
                [
                    'ffmpeg', '-y',
                    '-ss', str(timestamp),
                    '-i', video_path,
                    '-vframes', '1',
                    '-q:v', '2',  # JPEG质量
                    output_path
                ],
                capture_output=True,
                text=True,
                timeout=30
            )
            return result.returncode == 0 and os.path.exists(output_path)
        except subprocess.TimeoutExpired:
            logger.warning(f"提取帧超时: timestamp={timestamp}")
            return False
        except Exception as e:
            logger.warning(f"提取帧失败: {e}")
            return False
    
    def extract(self, video_path: str, output_dir: str,
                on_progress: Optional[Callable[[int, int], None]] = None) -> ExtractionResult:
        """提取关键帧

        Args:
            video_path: 视频文件路径
            output_dir: 输出目录
            on_progress: 进度回调函数 (current, total)

        Returns:
            ExtractionResult: 提取结果

        Raises:
            FFmpegError: 当ffmpeg不可用时
            FrameExtractionError: 当帧提取失败时

        Requirements: 3.1, 3.2, 3.3, 3.4
        """
        # 检查ffmpeg
        if not self.check_ffmpeg():
            raise FFmpegError(
                "ffmpeg未安装或不可用。请安装ffmpeg:\n"
                "  - Windows: https://ffmpeg.org/download.html\n"
                "  - macOS: brew install ffmpeg\n"
                "  - Linux: sudo apt install ffmpeg"
            )

        # 检查视频文件
        if not os.path.exists(video_path):
            raise FrameExtractionError(f"视频文件不存在: {video_path}", video_path)

        # 创建输出目录（使用 images 子目录）
        images_dir = os.path.join(output_dir, self.output_subdir)
        os.makedirs(images_dir, exist_ok=True)

        # 获取视频时长
        duration = self.get_video_duration(video_path)
        logger.info(f"视频时长: {self.format_timestamp(duration)}")

        # 检测场景变化
        scene_times = []
        if self.enable_scene_detection:
            logger.info("正在检测场景变化...")
            scene_times = self.detect_scenes(video_path)

        # 计算帧时间戳
        timestamps = self._calculate_frame_timestamps(duration, scene_times)
        total_frames = len(timestamps)
        logger.info(f"计划提取 {total_frames} 帧（间隔: {self.interval}秒）")

        # 对于高频提取（间隔<=2秒），使用批量提取优化
        if self.interval <= 2 and total_frames > 10:
            frames = self._extract_batch(video_path, images_dir, timestamps, on_progress)
        else:
            # 逐帧提取
            frames = self._extract_sequential(video_path, images_dir, timestamps, on_progress)

        if not frames:
            raise FrameExtractionError("未能提取任何帧", video_path)

        # 生成manifest
        self._save_manifest(frames, output_dir, duration)

        logger.info(f"成功提取 {len(frames)} 帧")

        return ExtractionResult(
            frames=frames,
            total_frames=len(frames),
            video_duration=duration
        )

    def _extract_batch(self, video_path: str, output_dir: str,
                       timestamps: List[tuple],
                       on_progress: Optional[Callable[[int, int], None]] = None) -> List[FrameInfo]:
        """批量提取帧（使用 ffmpeg fps filter 优化）

        Args:
            video_path: 视频文件路径
            output_dir: 输出目录
            timestamps: 时间戳列表
            on_progress: 进度回调函数

        Returns:
            List[FrameInfo]: 提取的帧列表
        """
        total_frames = len(timestamps)
        logger.info(f"使用批量提取模式，共 {total_frames} 帧")

        # 使用 ffmpeg 的 fps filter 一次性提取所有帧
        fps_value = 1.0 / self.interval if self.interval > 0 else 1.0

        try:
            result = subprocess.run(
                [
                    'ffmpeg', '-y',
                    '-i', video_path,
                    '-vf', f'fps={fps_value}',
                    '-q:v', '2',  # JPEG质量
                    os.path.join(output_dir, 'frame_%06d.jpg')
                ],
                capture_output=True,
                text=True,
                timeout=600  # 10分钟超时
            )

            if result.returncode != 0:
                logger.warning(f"批量提取失败，回退到逐帧提取: {result.stderr}")
                return self._extract_sequential(video_path, output_dir, timestamps, on_progress)

        except subprocess.TimeoutExpired:
            logger.warning("批量提取超时，回退到逐帧提取")
            return self._extract_sequential(video_path, output_dir, timestamps, on_progress)

        # 读取生成的帧文件并构建 FrameInfo 列表
        frames: List[FrameInfo] = []
        idx = 0
        for timestamp, is_scene_change in timestamps:
            # ffmpeg fps filter 生成的文件从 1 开始编号
            frame_num = idx + 1
            filename = f"frame_{frame_num:06d}.jpg"
            output_path = os.path.join(output_dir, filename)

            if os.path.exists(output_path):
                timestamp_str = self.format_timestamp(timestamp)
                frame_info = FrameInfo(
                    frame_id=idx,
                    timestamp=timestamp,
                    timestamp_str=timestamp_str,
                    file_path=output_path,
                    is_scene_change=is_scene_change
                )
                frames.append(frame_info)
                logger.debug(f"提取帧 {idx}: {timestamp_str}")
            else:
                logger.warning(f"帧文件不存在: {output_path}")

            idx += 1

            # 进度回调
            if on_progress:
                on_progress(idx, total_frames)

        return frames

    def _extract_sequential(self, video_path: str, output_dir: str,
                            timestamps: List[tuple],
                            on_progress: Optional[Callable[[int, int], None]] = None) -> List[FrameInfo]:
        """逐帧提取（原有方式）

        Args:
            video_path: 视频文件路径
            output_dir: 输出目录
            timestamps: 时间戳列表
            on_progress: 进度回调函数

        Returns:
            List[FrameInfo]: 提取的帧列表
        """
        total_frames = len(timestamps)
        frames: List[FrameInfo] = []

        for idx, (timestamp, is_scene_change) in enumerate(timestamps):
            # 生成文件名（使用6位数字编号）
            timestamp_str = self.format_timestamp(timestamp)
            filename = f"frame_{idx:06d}.jpg"
            output_path = os.path.join(output_dir, filename)

            # 提取帧
            success = self._extract_single_frame(video_path, timestamp, output_path)

            if success:
                frame_info = FrameInfo(
                    frame_id=idx,
                    timestamp=timestamp,
                    timestamp_str=timestamp_str,
                    file_path=output_path,
                    is_scene_change=is_scene_change
                )
                frames.append(frame_info)
                logger.debug(f"提取帧 {idx}: {timestamp_str}")
            else:
                logger.warning(f"跳过帧 {idx}: 提取失败")

            # 进度回调
            if on_progress:
                on_progress(idx + 1, total_frames)

        return frames

    def _save_manifest(self, frames: List[FrameInfo], output_dir: str, 
                       duration: float) -> None:
        """保存帧清单manifest
        
        Args:
            frames: 帧信息列表
            output_dir: 输出目录
            duration: 视频时长
            
        Requirement: 3.4
        """
        manifest = {
            'video_duration': duration,
            'video_duration_str': self.format_timestamp(duration),
            'total_frames': len(frames),
            'interval': self.interval,
            'frames': [
                {
                    'frame_id': f.frame_id,
                    'timestamp': f.timestamp,
                    'timestamp_str': f.timestamp_str,
                    'file_path': f.file_path,
                    'filename': os.path.basename(f.file_path),
                    'is_scene_change': f.is_scene_change
                }
                for f in frames
            ]
        }
        
        manifest_path = os.path.join(output_dir, 'manifest.json')
        with open(manifest_path, 'w', encoding='utf-8') as f:
            json.dump(manifest, f, ensure_ascii=False, indent=2)
        
        logger.info(f"帧清单已保存: {manifest_path}")
    
    @staticmethod
    def load_manifest(manifest_path: str) -> dict:
        """加载帧清单
        
        Args:
            manifest_path: manifest文件路径
            
        Returns:
            dict: manifest数据
        """
        with open(manifest_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    
    def extract_at_timestamps(self, video_path: str, output_dir: str,
                              timestamps: List[float]) -> ExtractionResult:
        """在指定时间戳提取帧
        
        Args:
            video_path: 视频文件路径
            output_dir: 输出目录
            timestamps: 时间戳列表（秒）
            
        Returns:
            ExtractionResult: 提取结果
        """
        if not self.check_ffmpeg():
            raise FFmpegError(
                "ffmpeg未安装或不可用。请安装ffmpeg: https://ffmpeg.org/download.html"
            )
        
        if not os.path.exists(video_path):
            raise FrameExtractionError(f"视频文件不存在: {video_path}", video_path)
        
        os.makedirs(output_dir, exist_ok=True)
        
        duration = self.get_video_duration(video_path)
        
        frames: List[FrameInfo] = []
        for idx, timestamp in enumerate(timestamps):
            if timestamp >= duration:
                logger.warning(f"时间戳 {timestamp} 超出视频时长，跳过")
                continue
            
            timestamp_str = self.format_timestamp(timestamp)
            safe_timestamp = timestamp_str.replace(':', '-')
            filename = f"frame_{idx:04d}_{safe_timestamp}.jpg"
            output_path = os.path.join(output_dir, filename)
            
            success = self._extract_single_frame(video_path, timestamp, output_path)
            
            if success:
                frame_info = FrameInfo(
                    frame_id=idx,
                    timestamp=timestamp,
                    timestamp_str=timestamp_str,
                    file_path=output_path,
                    is_scene_change=False
                )
                frames.append(frame_info)
        
        if frames:
            self._save_manifest(frames, output_dir, duration)
        
        return ExtractionResult(
            frames=frames,
            total_frames=len(frames),
            video_duration=duration
        )
