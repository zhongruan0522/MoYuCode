#!/usr/bin/env python3
"""
Bilibili Video Analyzer - Logger Module
日志系统模块

Requirements: 7.1, 7.2, 7.3, 7.4
"""

import logging
import json
import os
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Union
from dataclasses import dataclass, field, asdict

from .models import VideoReport, FrameAnalysis, FrameInfo, VideoMetadata, AnalyzerConfig
from .exceptions import BilibiliAnalyzerError


# ============================================================================
# Log Entry Model
# ============================================================================

@dataclass
class LogEntry:
    """日志条目
    
    Requirements: 7.1 - 包含时间戳、级别和上下文
    """
    timestamp: str
    level: str
    message: str
    context: str = ""
    error_type: Optional[str] = None
    error_details: Optional[Dict[str, Any]] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        result = {
            "timestamp": self.timestamp,
            "level": self.level,
            "message": self.message,
        }
        if self.context:
            result["context"] = self.context
        if self.error_type:
            result["error_type"] = self.error_type
        if self.error_details:
            result["error_details"] = self.error_details
        return result


# ============================================================================
# Partial Result Model
# ============================================================================

@dataclass
class PartialResult:
    """部分结果
    
    Requirements: 7.4 - 保存部分完成的结果
    """
    status: str  # "partial", "failed"
    completed_frames: List[int] = field(default_factory=list)
    failed_frames: List[int] = field(default_factory=list)
    analyses: List[FrameAnalysis] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)
    metadata: Optional[VideoMetadata] = None
    frames: List[FrameInfo] = field(default_factory=list)
    saved_at: str = field(default_factory=lambda: datetime.now().isoformat())


# ============================================================================
# Analyzer Logger
# ============================================================================

class AnalyzerLogger:
    """分析器日志系统
    
    提供统一的日志记录功能，支持：
    - 配置日志格式（时间戳、级别、上下文）
    - 日志文件输出到输出目录
    - 部分结果保存逻辑
    
    Requirements:
    - 7.1: 错误日志包含时间戳和上下文
    - 7.2: 用户友好的错误消息
    - 7.3: 创建日志文件到输出目录
    - 7.4: 保存部分结果
    """
    
    # 日志格式
    LOG_FORMAT = "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s"
    DATE_FORMAT = "%Y-%m-%d %H:%M:%S"
    
    # 用户友好的错误消息映射
    USER_FRIENDLY_MESSAGES = {
        "URLValidationError": "URL格式无效。请使用以下格式：\n  - https://www.bilibili.com/video/BVxxxxxxxxxx\n  - https://b23.tv/xxxxxxx",
        "MetadataFetchError": "无法获取视频信息。请检查：\n  - 视频链接是否正确\n  - 视频是否已被删除或设为私有\n  - 网络连接是否正常",
        "DownloadError": "视频下载失败。建议：\n  - 检查网络连接\n  - 稍后重试\n  - 尝试使用VPN",
        "FFmpegError": "FFmpeg操作失败。请确保：\n  - FFmpeg已正确安装\n  - 可以在命令行运行 'ffmpeg -version'",
        "FrameExtractionError": "帧提取失败。可能原因：\n  - 视频文件损坏\n  - 视频格式不支持",
        "AnalysisError": "AI分析失败。建议：\n  - 检查API配置\n  - 稍后重试",
        "ReportGenerationError": "报告生成失败。请检查：\n  - 输出目录是否有写入权限\n  - 磁盘空间是否充足",
        "ConfigurationError": "配置参数无效。请检查参数值是否在有效范围内。",
    }
    
    def __init__(
        self,
        output_dir: Optional[str] = None,
        log_level: str = "INFO",
        log_filename: str = "analyzer.log"
    ):
        """初始化日志系统
        
        Args:
            output_dir: 日志输出目录，None则只输出到控制台
            log_level: 日志级别 (DEBUG, INFO, WARNING, ERROR, CRITICAL)
            log_filename: 日志文件名
        """
        self.output_dir = output_dir
        self.log_level = getattr(logging, log_level.upper(), logging.INFO)
        self.log_filename = log_filename
        self._log_entries: List[LogEntry] = []
        self._partial_result: Optional[PartialResult] = None
        
        # 创建logger
        self.logger = logging.getLogger("BilibiliAnalyzer")
        self.logger.setLevel(self.log_level)
        self.logger.handlers.clear()  # 清除已有handlers
        
        # 创建格式化器
        formatter = logging.Formatter(self.LOG_FORMAT, self.DATE_FORMAT)
        
        # 添加控制台handler
        console_handler = logging.StreamHandler()
        console_handler.setLevel(self.log_level)
        console_handler.setFormatter(formatter)
        self.logger.addHandler(console_handler)
        
        # 如果指定了输出目录，添加文件handler
        if output_dir:
            self._setup_file_handler(output_dir, formatter)
    
    def _setup_file_handler(self, output_dir: str, formatter: logging.Formatter) -> None:
        """设置文件日志handler
        
        Requirements: 7.3
        
        Args:
            output_dir: 输出目录
            formatter: 日志格式化器
        """
        try:
            # 确保目录存在
            log_dir = Path(output_dir)
            log_dir.mkdir(parents=True, exist_ok=True)
            
            # 创建文件handler
            log_path = log_dir / self.log_filename
            file_handler = logging.FileHandler(
                str(log_path),
                encoding='utf-8',
                mode='a'  # 追加模式
            )
            file_handler.setLevel(self.log_level)
            file_handler.setFormatter(formatter)
            self.logger.addHandler(file_handler)
            
            self._log_file_path = str(log_path)
        except OSError as e:
            # 文件handler创建失败，只使用控制台
            self.logger.warning(f"无法创建日志文件: {e}")
            self._log_file_path = None
    
    def set_output_dir(self, output_dir: str) -> None:
        """设置输出目录（延迟设置）
        
        Args:
            output_dir: 输出目录
        """
        self.output_dir = output_dir
        formatter = logging.Formatter(self.LOG_FORMAT, self.DATE_FORMAT)
        self._setup_file_handler(output_dir, formatter)
    
    # ========================================================================
    # Core Logging Methods
    # ========================================================================
    
    def _create_entry(
        self,
        level: str,
        message: str,
        context: str = "",
        error_type: Optional[str] = None,
        error_details: Optional[Dict[str, Any]] = None
    ) -> LogEntry:
        """创建日志条目
        
        Requirements: 7.1
        
        Args:
            level: 日志级别
            message: 日志消息
            context: 上下文信息
            error_type: 错误类型
            error_details: 错误详情
            
        Returns:
            LogEntry对象
        """
        entry = LogEntry(
            timestamp=datetime.now().isoformat(),
            level=level,
            message=message,
            context=context,
            error_type=error_type,
            error_details=error_details
        )
        self._log_entries.append(entry)
        return entry
    
    def debug(self, message: str, context: str = "") -> None:
        """记录DEBUG级别日志"""
        self._create_entry("DEBUG", message, context)
        log_msg = f"[{context}] {message}" if context else message
        self.logger.debug(log_msg)
    
    def info(self, message: str, context: str = "") -> None:
        """记录INFO级别日志"""
        self._create_entry("INFO", message, context)
        log_msg = f"[{context}] {message}" if context else message
        self.logger.info(log_msg)
    
    def warning(self, message: str, context: str = "") -> None:
        """记录WARNING级别日志"""
        self._create_entry("WARNING", message, context)
        log_msg = f"[{context}] {message}" if context else message
        self.logger.warning(log_msg)
    
    def error(
        self,
        message: str,
        context: str = "",
        error: Optional[Exception] = None,
        details: Optional[Dict[str, Any]] = None
    ) -> None:
        """记录ERROR级别日志
        
        Requirements: 7.1
        
        Args:
            message: 错误消息
            context: 上下文信息
            error: 异常对象
            details: 额外详情
        """
        error_type = type(error).__name__ if error else None
        error_details = details or {}
        
        if error:
            error_details["exception_message"] = str(error)
            if hasattr(error, '__dict__'):
                # 添加异常的自定义属性
                for key, value in error.__dict__.items():
                    if not key.startswith('_') and isinstance(value, (str, int, float, bool)):
                        error_details[key] = value
        
        self._create_entry("ERROR", message, context, error_type, error_details)
        log_msg = f"[{context}] {message}" if context else message
        self.logger.error(log_msg, exc_info=error is not None)
    
    def critical(self, message: str, context: str = "", error: Optional[Exception] = None) -> None:
        """记录CRITICAL级别日志"""
        error_type = type(error).__name__ if error else None
        self._create_entry("CRITICAL", message, context, error_type)
        log_msg = f"[{context}] {message}" if context else message
        self.logger.critical(log_msg, exc_info=error is not None)
    
    # ========================================================================
    # User-Friendly Error Messages
    # ========================================================================
    
    def get_user_friendly_message(self, error: Exception) -> str:
        """获取用户友好的错误消息
        
        Requirements: 7.2
        
        Args:
            error: 异常对象
            
        Returns:
            用户友好的错误消息
        """
        error_type = type(error).__name__
        base_message = self.USER_FRIENDLY_MESSAGES.get(
            error_type,
            "发生未知错误。请查看日志文件获取详细信息。"
        )
        
        # 添加具体错误信息
        if hasattr(error, 'message'):
            return f"{base_message}\n\n详细信息: {error.message}"
        return f"{base_message}\n\n详细信息: {str(error)}"
    
    def log_error_with_suggestion(
        self,
        error: Exception,
        context: str = ""
    ) -> str:
        """记录错误并返回用户友好的消息
        
        Requirements: 7.1, 7.2
        
        Args:
            error: 异常对象
            context: 上下文信息
            
        Returns:
            用户友好的错误消息
        """
        # 记录详细错误
        self.error(str(error), context, error)
        
        # 返回用户友好消息
        return self.get_user_friendly_message(error)
    
    # ========================================================================
    # Partial Result Management
    # ========================================================================
    
    def init_partial_result(
        self,
        metadata: Optional[VideoMetadata] = None,
        frames: Optional[List[FrameInfo]] = None
    ) -> None:
        """初始化部分结果
        
        Requirements: 7.4
        
        Args:
            metadata: 视频元数据
            frames: 帧列表
        """
        self._partial_result = PartialResult(
            status="partial",
            metadata=metadata,
            frames=frames or []
        )
    
    def add_completed_analysis(self, frame_id: int, analysis: FrameAnalysis) -> None:
        """添加已完成的分析结果
        
        Requirements: 7.4
        
        Args:
            frame_id: 帧ID
            analysis: 分析结果
        """
        if self._partial_result is None:
            self.init_partial_result()
        
        self._partial_result.completed_frames.append(frame_id)
        self._partial_result.analyses.append(analysis)
    
    def add_failed_frame(self, frame_id: int, error_message: str) -> None:
        """添加失败的帧
        
        Requirements: 7.4
        
        Args:
            frame_id: 帧ID
            error_message: 错误消息
        """
        if self._partial_result is None:
            self.init_partial_result()
        
        self._partial_result.failed_frames.append(frame_id)
        self._partial_result.errors.append(f"Frame {frame_id}: {error_message}")
    
    def mark_as_failed(self) -> None:
        """标记为失败状态"""
        if self._partial_result:
            self._partial_result.status = "failed"
    
    def get_partial_result(self) -> Optional[PartialResult]:
        """获取部分结果"""
        return self._partial_result
    
    def save_partial_result(self, output_dir: Optional[str] = None) -> Optional[str]:
        """保存部分结果到文件
        
        Requirements: 7.4
        
        Args:
            output_dir: 输出目录，默认使用初始化时的目录
            
        Returns:
            保存的文件路径，失败返回None
        """
        if self._partial_result is None:
            return None
        
        save_dir = output_dir or self.output_dir
        if not save_dir:
            self.warning("未指定输出目录，无法保存部分结果")
            return None
        
        try:
            # 确保目录存在
            save_path = Path(save_dir)
            save_path.mkdir(parents=True, exist_ok=True)
            
            # 更新保存时间
            self._partial_result.saved_at = datetime.now().isoformat()
            
            # 转换为可序列化的字典
            result_dict = self._partial_result_to_dict()
            
            # 保存到JSON文件
            file_path = save_path / "partial_result.json"
            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(result_dict, f, ensure_ascii=False, indent=2)
            
            self.info(f"部分结果已保存到: {file_path}", "PartialResult")
            return str(file_path)
            
        except OSError as e:
            self.error(f"保存部分结果失败: {e}", "PartialResult")
            return None
    
    def _partial_result_to_dict(self) -> Dict[str, Any]:
        """将部分结果转换为可序列化的字典"""
        if self._partial_result is None:
            return {}
        
        result = {
            "status": self._partial_result.status,
            "completed_frames": self._partial_result.completed_frames,
            "failed_frames": self._partial_result.failed_frames,
            "errors": self._partial_result.errors,
            "saved_at": self._partial_result.saved_at,
        }
        
        # 转换分析结果
        result["analyses"] = [
            {
                "frame_id": a.frame_id,
                "timestamp": a.timestamp,
                "description": a.description,
                "objects": a.objects,
                "text_content": a.text_content,
                "people_count": a.people_count,
                "scene_type": a.scene_type,
                "key_points": a.key_points,
                "confidence": a.confidence,
            }
            for a in self._partial_result.analyses
        ]
        
        # 转换元数据
        if self._partial_result.metadata:
            m = self._partial_result.metadata
            result["metadata"] = {
                "bvid": m.bvid,
                "title": m.title,
                "author": m.author,
                "author_id": m.author_id,
                "duration": m.duration,
                "description": m.description,
                "cover_url": m.cover_url,
                "view_count": m.view_count,
                "like_count": m.like_count,
                "publish_time": m.publish_time,
            }
        
        # 转换帧信息
        result["frames"] = [
            {
                "frame_id": f.frame_id,
                "timestamp": f.timestamp,
                "timestamp_str": f.timestamp_str,
                "file_path": f.file_path,
                "is_scene_change": f.is_scene_change,
            }
            for f in self._partial_result.frames
        ]
        
        return result
    
    def load_partial_result(self, file_path: str) -> Optional[PartialResult]:
        """从文件加载部分结果
        
        Args:
            file_path: 文件路径
            
        Returns:
            PartialResult对象，失败返回None
        """
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            # 重建PartialResult
            self._partial_result = PartialResult(
                status=data.get("status", "partial"),
                completed_frames=data.get("completed_frames", []),
                failed_frames=data.get("failed_frames", []),
                errors=data.get("errors", []),
                saved_at=data.get("saved_at", ""),
            )
            
            # 重建分析结果
            for a_data in data.get("analyses", []):
                analysis = FrameAnalysis(
                    frame_id=a_data["frame_id"],
                    timestamp=a_data["timestamp"],
                    description=a_data["description"],
                    objects=a_data.get("objects", []),
                    text_content=a_data.get("text_content", []),
                    people_count=a_data.get("people_count", 0),
                    scene_type=a_data.get("scene_type", ""),
                    key_points=a_data.get("key_points", []),
                    confidence=a_data.get("confidence", 0.0),
                )
                self._partial_result.analyses.append(analysis)
            
            # 重建元数据
            if "metadata" in data:
                m_data = data["metadata"]
                self._partial_result.metadata = VideoMetadata(
                    bvid=m_data["bvid"],
                    title=m_data["title"],
                    author=m_data["author"],
                    author_id=m_data["author_id"],
                    duration=m_data["duration"],
                    description=m_data["description"],
                    cover_url=m_data["cover_url"],
                    view_count=m_data.get("view_count", 0),
                    like_count=m_data.get("like_count", 0),
                    publish_time=m_data.get("publish_time", ""),
                )
            
            # 重建帧信息
            for f_data in data.get("frames", []):
                frame = FrameInfo(
                    frame_id=f_data["frame_id"],
                    timestamp=f_data["timestamp"],
                    timestamp_str=f_data["timestamp_str"],
                    file_path=f_data["file_path"],
                    is_scene_change=f_data.get("is_scene_change", False),
                )
                self._partial_result.frames.append(frame)
            
            self.info(f"已加载部分结果: {file_path}", "PartialResult")
            return self._partial_result
            
        except (OSError, json.JSONDecodeError, KeyError) as e:
            self.error(f"加载部分结果失败: {e}", "PartialResult")
            return None
    
    # ========================================================================
    # Log Export
    # ========================================================================
    
    def get_log_entries(self) -> List[LogEntry]:
        """获取所有日志条目"""
        return self._log_entries.copy()
    
    def get_error_entries(self) -> List[LogEntry]:
        """获取所有错误日志条目"""
        return [e for e in self._log_entries if e.level in ("ERROR", "CRITICAL")]
    
    def export_logs_to_json(self, file_path: Optional[str] = None) -> Optional[str]:
        """导出日志到JSON文件
        
        Args:
            file_path: 文件路径，默认保存到输出目录
            
        Returns:
            保存的文件路径
        """
        if file_path is None:
            if self.output_dir:
                file_path = str(Path(self.output_dir) / "logs.json")
            else:
                return None
        
        try:
            logs_data = [entry.to_dict() for entry in self._log_entries]
            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(logs_data, f, ensure_ascii=False, indent=2)
            return file_path
        except OSError as e:
            self.logger.error(f"导出日志失败: {e}")
            return None
    
    def clear_logs(self) -> None:
        """清除内存中的日志条目"""
        self._log_entries.clear()


# ===================================