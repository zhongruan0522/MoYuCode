# Bilibili Video Analyzer
# 自动分析B站视频内容的工具包

from .exceptions import (
    BilibiliAnalyzerError,
    URLValidationError,
    MetadataFetchError,
    DownloadError,
    FFmpegError,
    FrameExtractionError,
    AnalysisError,
    ReportGenerationError,
    ConfigurationError,
)

from .models import (
    VideoMetadata,
    FrameInfo,
    ExtractionResult,
    FrameAnalysis,
    AnalysisTask,
    DownloadResult,
    AnalyzerConfig,
    ReportConfig,
    VideoReport,
)

from .url_parser import URLParser
from .metadata_fetcher import MetadataFetcher
from .video_downloader import VideoDownloader
from .frame_extractor import FrameExtractor
from .report_generator import ReportGenerator

__all__ = [
    # Exceptions
    'BilibiliAnalyzerError',
    'URLValidationError',
    'MetadataFetchError',
    'DownloadError',
    'FFmpegError',
    'FrameExtractionError',
    'AnalysisError',
    'ReportGenerationError',
    'ConfigurationError',
    # Models
    'VideoMetadata',
    'FrameInfo',
    'ExtractionResult',
    'FrameAnalysis',
    'AnalysisTask',
    'DownloadResult',
    'AnalyzerConfig',
    'ReportConfig',
    'VideoReport',
    # Parsers
    'URLParser',
    # Fetchers
    'MetadataFetcher',
    # Downloaders
    'VideoDownloader',
    # Extractors
    'FrameExtractor',
    # Generators
    'ReportGenerator',
]
