#!/usr/bin/env python3
"""
Bilibili Video Analyzer - Logger Module
日志系统和部分结果保存

Requirements: 7.1, 7.2, 7.3, 7.4
"""

import os
import sys
import json
import logging
from pathlib import Path
from datetime import datetime
from typing import Optional, List, Any, Dict, TYPE_CHECKING
from dataclasses import asdict, is_dataclass

# Handle both relative and absolute imports
try:
    from .models import VideoReport, AnalyzerConfig
except ImportError:
    from models import VideoReport, AnalyzerConfig


class AnalyzerLogger:
    """分析器日志系统
    
    提供统一的日志记录功能，支持：
    - 控制台输出（带颜色）
    - 文件输出（到输出目录）
    - 结构化日志格式（时间戳、级别、上下文）
    
    Requirements:
    - 7.1: 错误日志包含时间戳和上下文
    - 7.2: 用户友好的错误消息
    - 7.3: 日志文件输出到输出目录
    """
    
    # 日志级别颜色映射（ANSI颜色码）
    COLORS = {
        'DEBUG': '\033[36m',     # 青色
        'INFO': '\033[32m',      # 绿色
        'WARNING': '\033[33m',   # 黄色
        'ERROR': '\033[31m',     # 红色
        'CRITICAL': '\033[35m',  # 紫色
        'RESET': '\033[0m',      # 重置
    }
    
    def __init__(
        self,
        name: str = "bilibili-analyzer",
        level: str = "INFO",
        output_dir: Optional[str] = None,
        log_filename: str = "analyzer.log"
    ):
        """初始化日志系统
        
        Args:
            name: 日志器名称
            level: 日志级别 (DEBUG, INFO, WARNING, ERROR, CRITICAL)
            output_dir: 日志文件输出目录，None则不输出到文件
            log_filename: 日志文件名
        """
        self.name = name
        self.output_dir = output_dir
        self.log_filename = log_filename
        self._logger = logging.getLogger(name)
        self._logger.setLevel(getattr(logging, level.upper(), logging.INFO))
        self._logger.handlers.clear()  # 清除已有处理器
        
        # 添加控制台处理器
        self._add_console_handler()
        
        # 如果指定了输出目录，添加文件处理器
        if output_dir:
            self._add_file_handler(output_dir, log_filename)
    
    def _add_console_handler(self) -> None:
        """添加控制台日志处理器"""
        console_handler = logging.StreamHandler(sys.stdout)
        console_handler.setFormatter(self._create_console_formatter())
        self._logger.addHandler(console_handler)
    
    def _add_file_handler(self, output_dir: str, filename: str) -> None:
        """添加文件日志处理器
        
        Requirements: 7.3
        
        Args:
            output_dir: 输出目录
            filename: 日志文件名
        """
        # 确保目录存在
        log_dir = Path(output_dir)
        log_dir.mkdir(parents=True, exist_ok=True)
        
        log_path = log_dir / filename
        file_handler = logging.FileHandler(str(log_path), encoding='utf-8')
        file_handler.setFormatter(self._create_file_formatter())
        self._logger.addHandler(file_handler)
        self._log_file_path = str(log_path)
    
    def _create_console_formatter(self) -> logging.Formatter:
        """创建控制台日志格式器"""
        return ColoredFormatter(
            fmt="%(asctime)s | %(levelname)-8s | %(context)s%(message)s",
            datefmt="%H:%M:%S"
        )
    
    def _create_file_formatter(self) -> logging.Formatter:
        """创建文件日志格式器
        
        Requirements: 7.1 - 包含时间戳、级别、上下文
        """
        return logging.Formatter(
            fmt="%(asctime)s | %(levelname)-8s | %(context)s%(message)s",
            datefmt="%Y-%m-%d %H:%M:%S"
        )

    def _log(
        self,
        level: int,
        message: str,
        context: str = "",
        exc_info: bool = False
    ) -> None:
        """内部日志记录方法
        
        Requirements: 7.1 - 日志包含时间戳和上下文
        
        Args:
            level: 日志级别
            message: 日志消息
            context: 上下文信息
            exc_info: 是否包含异常信息
        """
        extra = {'context': f"[{context}] " if context else ""}
        self._logger.log(level, message, extra=extra, exc_info=exc_info)
    
    def debug(self, message: str, context: str = "") -> None:
        """记录调试日志"""
        self._log(logging.DEBUG, message, context)
    
    def info(self, message: str, context: str = "") -> None:
        """记录信息日志"""
        self._log(logging.INFO, message, context)
    
    def warning(self, message: str, context: str = "") -> None:
        """记录警告日志"""
        self._log(logging.WARNING, message, context)
    
    def error(
        self,
        message: str,
        context: str = "",
        exc_info: bool = False,
        suggestion: str = ""
    ) -> None:
        """记录错误日志
        
        Requirements: 7.1, 7.2
        
        Args:
            message: 错误消息
            context: 上下文信息
            exc_info: 是否包含异常堆栈
            suggestion: 用户友好的建议操作
        """
        full_message = message
        if suggestion:
            full_message = f"{message} | 建议: {suggestion}"
        self._log(logging.ERROR, full_message, context, exc_info)
    
    def critical(self, message: str, context: str = "", exc_info: bool = False) -> None:
        """记录严重错误日志"""
        self._log(logging.CRITICAL, message, context, exc_info)
    
    def log_exception(
        self,
        exception: Exception,
        context: str = "",
        suggestion: str = ""
    ) -> None:
        """记录异常
        
        Requirements: 7.1, 7.2
        
        Args:
            exception: 异常对象
            context: 上下文信息
            suggestion: 用户友好的建议
        """
        # 从异常中提取上下文（如果是BilibiliAnalyzerError）
        exc_context = getattr(exception, 'context', '') or context
        
        self.error(
            str(exception),
            context=exc_context,
            exc_info=True,
            suggestion=suggestion
        )
    
    def set_output_dir(self, output_dir: str) -> None:
        """设置输出目录并添加文件处理器
        
        Args:
            output_dir: 输出目录路径
        """
        self.output_dir = output_dir
        # 移除旧的文件处理器
        self._logger.handlers = [
            h for h in self._logger.handlers 
            if not isinstance(h, logging.FileHandler)
        ]
        # 添加新的文件处理器
        self._add_file_handler(output_dir, self.log_filename)
    
    @property
    def log_file_path(self) -> Optional[str]:
        """获取日志文件路径"""
        return getattr(self, '_log_file_path', None)
    
    def close(self) -> None:
        """关闭日志器，释放文件句柄
        
        在Windows上特别重要，确保文件可以被删除或移动
        """
        for handler in self._logger.handlers[:]:
            handler.close()
            self._logger.removeHandler(handler)
    
    def __enter__(self) -> 'AnalyzerLogger':
        """支持上下文管理器"""
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        """退出上下文时关闭日志器"""
        self.close()


class ColoredFormatter(logging.Formatter):
    """带颜色的日志格式器（用于控制台输出）"""
    
    COLORS = {
        'DEBUG': '\033[36m',
        'INFO': '\033[32m',
        'WARNING': '\033[33m',
        'ERROR': '\033[31m',
        'CRITICAL': '\033[35m',
    }
    RESET = '\033[0m'
    
    def format(self, record: logging.LogRecord) -> str:
        # 确保context属性存在
        if not hasattr(record, 'context'):
            record.context = ""
        
        # 添加颜色
        levelname = record.levelname
        if levelname in self.COLORS:
            record.levelname = f"{self.COLORS[levelname]}{levelname}{self.RESET}"
        
        return super().format(record)


class PartialResultSaver:
    """部分结果保存器
    
    当分析过程中发生错误时，保存已完成的部分结果。
    
    Requirements: 7.4 - 部分结果保存和状态指示
    """
    
    def __init__(self, output_dir: str, logger: Optional[AnalyzerLogger] = None):
        """初始化部分结果保存器
        
        Args:
            output_dir: 输出目录
            logger: 日志器实例
        """
        self.output_dir = output_dir
        self.logger = logger or AnalyzerLogger()
        self._partial_data: Dict[str, Any] = {}
    
    def _ensure_output_dir(self) -> Path:
        """确保输出目录存在"""
        output_path = Path(self.output_dir)
        output_path.mkdir(parents=True, exist_ok=True)
        return output_path
    
    def _to_serializable(self, obj: Any) -> Any:
        """将对象转换为可序列化的格式
        
        Args:
            obj: 任意对象
            
        Returns:
            可JSON序列化的对象
        """
        if is_dataclass(obj) and not isinstance(obj, type):
            return asdict(obj)
        elif isinstance(obj, list):
            return [self._to_serializable(item) for item in obj]
        elif isinstance(obj, dict):
            return {k: self._to_serializable(v) for k, v in obj.items()}
        elif hasattr(obj, '__dict__'):
            return {k: self._to_serializable(v) for k, v in obj.__dict__.items()}
        else:
            return obj
    
    def save_partial_report(
        self,
        report: VideoReport,
        error_message: str = ""
    ) -> str:
        """保存部分完成的报告
        
        Requirements: 7.4
        
        Args:
            report: 视频报告对象（可能不完整）
            error_message: 导致中断的错误信息
            
        Returns:
            保存的文件路径
        """
        output_path = self._ensure_output_dir()
        
        # 更新报告状态
        report.status = "partial"
        if error_message and error_message not in report.errors:
            report.errors.append(error_message)
        
        # 保存JSON格式的原始数据
        json_path = output_path / "partial_results.json"
        try:
            serializable_report = self._to_serializable(report)
            serializable_report['_saved_at'] = datetime.now().isoformat()
            serializable_report['_status'] = 'partial'
            serializable_report['_error'] = error_message
            
            with open(json_path, 'w', encoding='utf-8') as f:
                json.dump(serializable_report, f, ensure_ascii=False, indent=2)
            
            self.logger.info(f"部分结果已保存到: {json_path}", context="结果保存")
            return str(json_path)
            
        except Exception as e:
            self.logger.error(
                f"保存部分结果失败: {e}",
                context="结果保存",
                suggestion="请检查输出目录权限"
            )
            raise
    
    def save_checkpoint(
        self,
        checkpoint_name: str,
        data: Any,
        metadata: Optional[Dict[str, Any]] = None
    ) -> str:
        """保存检查点数据
        
        用于在长时间运行的任务中保存中间状态。
        
        Args:
            checkpoint_name: 检查点名称
            data: 要保存的数据
            metadata: 额外的元数据
            
        Returns:
            保存的文件路径
        """
        output_path = self._ensure_output_dir()
        checkpoint_path = output_path / f"checkpoint_{checkpoint_name}.json"
        
        checkpoint_data = {
            'name': checkpoint_name,
            'timestamp': datetime.now().isoformat(),
            'data': self._to_serializable(data),
            'metadata': metadata or {}
        }
        
        try:
            with open(checkpoint_path, 'w', encoding='utf-8') as f:
                json.dump(checkpoint_data, f, ensure_ascii=False, indent=2)
            
            self.logger.debug(f"检查点已保存: {checkpoint_name}", context="检查点")
            return str(checkpoint_path)
            
        except Exception as e:
            self.logger.warning(f"保存检查点失败: {e}", context="检查点")
            raise
    
    def load_checkpoint(self, checkpoint_name: str) -> Optional[Dict[str, Any]]:
        """加载检查点数据
        
        Args:
            checkpoint_name: 检查点名称
            
        Returns:
            检查点数据，如果不存在则返回None
        """
        checkpoint_path = Path(self.output_dir) / f"checkpoint_{checkpoint_name}.json"
        
        if not checkpoint_path.exists():
            return None
        
        try:
            with open(checkpoint_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            self.logger.warning(f"加载检查点失败: {e}", context="检查点")
            return None
    
    def save_error_state(
        self,
        error: Exception,
        partial_data: Dict[str, Any],
        stage: str = "unknown"
    ) -> str:
        """保存错误状态
        
        Requirements: 7.4
        
        Args:
            error: 发生的异常
            partial_data: 已完成的部分数据
            stage: 发生错误的阶段
            
        Returns:
            保存的文件路径
        """
        output_path = self._ensure_output_dir()
        error_state_path = output_path / "error_state.json"
        
        error_state = {
            'timestamp': datetime.now().isoformat(),
            'stage': stage,
            'error_type': type(error).__name__,
            'error_message': str(error),
            'error_context': getattr(error, 'context', ''),
            'partial_data': self._to_serializable(partial_data),
            'status': 'incomplete'
        }
        
        try:
            with open(error_state_path, 'w', encoding='utf-8') as f:
                json.dump(error_state, f, ensure_ascii=False, indent=2)
            
            self.logger.info(
                f"错误状态已保存到: {error_state_path}",
                context="错误恢复"
            )
            return str(error_state_path)
            
        except Exception as e:
            self.logger.error(f"保存错误状态失败: {e}", context="错误恢复")
            raise


# 全局默认日志器实例
_default_logger: Optional[AnalyzerLogger] = None


def get_logger(
    name: str = "bilibili-analyzer",
    level: str = "INFO",
    output_dir: Optional[str] = None
) -> AnalyzerLogger:
    """获取或创建日志器实例
    
    Args:
        name: 日志器名称
        level: 日志级别
        output_dir: 输出目录
        
    Returns:
        日志器实例
    """
    global _default_logger
    
    if _default_logger is None or output_dir is not None:
        _default_logger = AnalyzerLogger(
            name=name,
            level=level,
            output_dir=output_dir
        )
    
    return _default_logger


def setup_logging(config: AnalyzerConfig) -> AnalyzerLogger:
    """根据配置设置日志系统
    
    Args:
        config: 分析器配置
        
    Returns:
        配置好的日志器实例
    """
    return get_logger(
        level=config.log_level,
        output_dir=config.output_dir
    )
