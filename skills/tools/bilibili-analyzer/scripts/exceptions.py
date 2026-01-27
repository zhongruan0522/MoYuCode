#!/usr/bin/env python3
"""
Bilibili Video Analyzer - Exception Classes
自定义异常类层次结构

Requirements: 7.1
"""


class BilibiliAnalyzerError(Exception):
    """基础异常类 - 所有分析器异常的父类"""
    
    def __init__(self, message: str, context: str = ""):
        self.message = message
        self.context = context
        super().__init__(self._format_message())
    
    def _format_message(self) -> str:
        if self.context:
            return f"[{self.context}] {self.message}"
        return self.message


class URLValidationError(BilibiliAnalyzerError):
    """URL验证错误 - 当提供的URL格式无效时抛出
    
    Examples:
        - URL不是B站链接
        - URL格式不正确
        - 无法提取BV号
    """
    
    def __init__(self, message: str, url: str = ""):
        self.url = url
        super().__init__(message, context="URL验证")


class MetadataFetchError(BilibiliAnalyzerError):
    """元数据获取错误 - 当无法获取视频元数据时抛出
    
    Examples:
        - 视频不存在
        - API请求失败
        - 视频被删除或私有
    """
    
    def __init__(self, message: str, bvid: str = ""):
        self.bvid = bvid
        super().__init__(message, context="元数据获取")


class DownloadError(BilibiliAnalyzerError):
    """下载错误 - 当视频下载失败时抛出
    
    Examples:
        - 网络连接失败
        - 下载超时
        - 所有重试都失败
    """
    
    def __init__(self, message: str, bvid: str = "", retry_count: int = 0):
        self.bvid = bvid
        self.retry_count = retry_count
        super().__init__(message, context="视频下载")


class FFmpegError(BilibiliAnalyzerError):
    """FFmpeg相关错误 - 当FFmpeg操作失败时抛出
    
    Examples:
        - FFmpeg未安装
        - 帧提取失败
        - 视频格式不支持
    """
    
    def __init__(self, message: str, command: str = ""):
        self.command = command
        super().__init__(message, context="FFmpeg")


class FrameExtractionError(FFmpegError):
    """帧提取错误 - 当帧提取失败时抛出"""
    
    def __init__(self, message: str, video_path: str = "", timestamp: float = 0):
        self.video_path = video_path
        self.timestamp = timestamp
        super().__init__(message)


class AnalysisError(BilibiliAnalyzerError):
    """AI分析错误 - 当AI分析失败时抛出
    
    Examples:
        - Claude Code调用失败
        - 分析超时
        - 结果解析失败
    """
    
    def __init__(self, message: str, frame_id: int = 0, task_id: str = ""):
        self.frame_id = frame_id
        self.task_id = task_id
        super().__init__(message, context="AI分析")


class ReportGenerationError(BilibiliAnalyzerError):
    """报告生成错误 - 当报告生成失败时抛出
    
    Examples:
        - 无法创建输出目录
        - 文件写入失败
        - 图片复制失败
    """
    
    def __init__(self, message: str, output_path: str = ""):
        self.output_path = output_path
        super().__init__(message, context="报告生成")


class ConfigurationError(BilibiliAnalyzerError):
    """配置错误 - 当配置参数无效时抛出
    
    Examples:
        - 参数值超出范围
        - 必需参数缺失
        - 参数类型错误
    """
    
    def __init__(self, message: str, param_name: str = ""):
        self.param_name = param_name
        super().__init__(message, context="配置")
