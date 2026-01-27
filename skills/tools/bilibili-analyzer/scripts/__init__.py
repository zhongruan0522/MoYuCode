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
from .ai_analyzer import AIAnalyzer
from .report_generator import ReportGenerator
from .logger import (
    AnalyzerLogger,
    PartialResultSaver,
    get_logger,
    setup_logging,
)
from .main import (
    BilibiliAnalyzer,
    create_argument_parser,
    create_config_from_args,
    parse_focus_areas,
    main,
)

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
    # AI Analyzer
    'AIAnalyzer',
    # Generators
    'ReportGenerator',
    # Logger
    'AnalyzerLogger',
    'PartialResultSaver',
    'get_logger',
    'setup_logging',
    # Main
    'BilibiliAnalyzer',
    'create_argument_parser',
    'create_config_from_args',
    'parse_focus_areas',
    'main',
]
