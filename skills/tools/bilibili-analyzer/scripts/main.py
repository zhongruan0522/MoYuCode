#!/usr/bin/env python3
"""
Bilibili Video Analyzer - Main Entry Point
主程序入口和命令行接口

Requirements: 6.1, 6.2, 6.3, 6.4
"""

import argparse
import sys
import os
from pathlib import Path
from typing import Optional, List

# 支持相对导入和绝对导入
try:
    from .models import AnalyzerConfig, VideoReport, ReportConfig
    from .url_parser import URLParser
    from .metadata_fetcher import MetadataFetcher
    from .video_downloader import VideoDownloader
    from .frame_extractor import FrameExtractor
    from .frame_similarity import FrameSimilarityDetector, merge_similar_frames
    from .audio_extractor import AudioExtractor
    from .audio_transcriber import AudioTranscriber
    from .claude_cli_analyzer import ClaudeCLIAnalyzer
    from .incremental_report import IncrementalReportGenerator, ReportSummaryGenerator
    from .logger import AnalyzerLogger, PartialResultSaver, setup_logging
    from .exceptions import (
        BilibiliAnalyzerError,
        URLValidationError,
        MetadataFetchError,
        DownloadError,
        FFmpegError,
        AnalysisError,
        ReportGenerationError,
    )
except ImportError:
    from models import AnalyzerConfig, VideoReport, ReportConfig
    from url_parser import URLParser
    from metadata_fetcher import MetadataFetcher
    from video_downloader import VideoDownloader
    from frame_extractor import FrameExtractor
    from frame_similarity import FrameSimilarityDetector, merge_similar_frames
    from audio_extractor import AudioExtractor
    from audio_transcriber import AudioTranscriber
    from claude_cli_analyzer import ClaudeCLIAnalyzer
    from incremental_report import IncrementalReportGenerator, ReportSummaryGenerator
    from logger import AnalyzerLogger, PartialResultSaver, setup_logging
    from exceptions import (
        BilibiliAnalyzerError,
        URLValidationError,
        MetadataFetchError,
        DownloadError,
        FFmpegError,
        AnalysisError,
        ReportGenerationError,
    )


class BilibiliAnalyzer:
    """Bilibili视频分析器主类

    集成所有模块，提供完整的视频分析工作流。

    新版工作流:
    1. 下载视频
    2. 提取帧（每秒1帧）→ images/
    3. 提取音频 → audio/
    4. 音频转文字 → transcript.json
    5. 相似帧检测与合并
    6. 初始化报告文件
    7. 逐帧调用 Claude CLI 分析
       - 每帧分析后立即写入报告
       - 插入对应时间段的音频转录
    8. 生成最终摘要
    """

    def __init__(self, config: AnalyzerConfig):
        """初始化分析器

        Args:
            config: 分析器配置
        """
        self.config = config
        self.logger = AnalyzerLogger(
            level=config.log_level,
            output_dir=config.output_dir
        )
        self.partial_saver = PartialResultSaver(config.output_dir, self.logger)

        # 初始化各模块
        self.url_parser = URLParser
        self.metadata_fetcher = MetadataFetcher(max_retries=config.download_retries)
        self.video_downloader = VideoDownloader(
            max_retries=config.download_retries
        )
        self.frame_extractor = FrameExtractor(
            interval=config.frame_interval,
            max_frames=config.max_frames,
            enable_scene_detection=config.enable_scene_detection,
            output_subdir="images"
        )
        self.similarity_detector = FrameSimilarityDetector(
            similarity_threshold=config.similarity_threshold
        )
        self.audio_extractor = AudioExtractor(
            output_format="wav",
            sample_rate=16000
        )
        self.audio_transcriber = AudioTranscriber(
            model_size=config.whisper_model,
            language=config.audio_language
        )
        self.claude_analyzer = ClaudeCLIAnalyzer(
            timeout=120,
            max_retries=2
        )

    def _sanitize_title(self, title: str) -> str:
        """清理标题，移除不适合作为目录名的字符
        
        Args:
            title: 原始标题
            
        Returns:
            清理后的标题
        """
        import re
        # 移除或替换不安全字符
        sanitized = re.sub(r'[<>:"/\\|?*]', '_', title)
        # 移除控制字符
        sanitized = re.sub(r'[\x00-\x1f\x7f]', '', sanitized)
        # 限制长度
        return sanitized[:80].strip() or "untitled"
    
    def _create_progress_callback(self, stage: str):
        """创建进度回调函数
        
        Args:
            stage: 当前阶段名称
            
        Returns:
            进度回调函数
        """
        def callback(current, total, extra=None):
            percentage = (current / total * 100) if total > 0 else 0
            if extra:
                self.logger.info(
                    f"进度: {current}/{total} ({percentage:.1f}%) - {extra}",
                    context=stage
                )
            else:
                self.logger.info(
                    f"进度: {current}/{total} ({percentage:.1f}%)",
                    context=stage
                )
        return callback
    
    def analyze(self, url: str) -> VideoReport:
        """执行完整的视频分析流程

        Args:
            url: B站视频URL

        Returns:
            VideoReport: 分析报告

        Raises:
            BilibiliAnalyzerError: 分析过程中的各种错误
        """
        report = VideoReport(
            metadata=None,  # type: ignore
            frames=[],
            analyses=[],
            config=self.config
        )

        try:
            # Step 1: 验证URL并提取BV号
            self.logger.info(f"开始分析视频: {url}", context="初始化")

            if not self.url_parser.validate(url):
                raise URLValidationError(
                    "无效的B站视频URL。支持的格式: "
                    "https://www.bilibili.com/video/BV* 或 https://b23.tv/*",
                    url=url
                )

            bvid = self.url_parser.extract_bvid(url)
            self.logger.info(f"提取到BV号: {bvid}", context="URL解析")

            # Step 2: 获取视频元数据
            self.logger.info("正在获取视频元数据...", context="元数据")
            metadata = self.metadata_fetcher.fetch(bvid)
            report.metadata = metadata
            self.logger.info(f"视频标题: {metadata.title}", context="元数据")
            self.logger.info(f"视频时长: {metadata.duration}秒", context="元数据")

            # 更新输出目录（使用视频标题）
            video_dir = self._sanitize_title(metadata.title)
            output_dir = os.path.join(self.config.output_dir, video_dir)
            self.logger.set_output_dir(output_dir)
            self.partial_saver.output_dir = output_dir

            # Step 3: 下载视频
            self.logger.info("正在下载视频...", context="下载")
            download_result = self.video_downloader.download(
                bvid,
                on_progress=self._create_progress_callback("下载")
            )

            if not download_result.success:
                raise DownloadError(
                    download_result.error_message or "下载失败",
                    bvid=bvid
                )

            video_path = download_result.file_path
            self.logger.info(f"视频已下载: {video_path}", context="下载")

            # Step 4: 提取关键帧（每秒1帧）
            self.logger.info(f"正在提取关键帧（间隔: {self.config.frame_interval}秒）...", context="帧提取")
            extraction_result = self.frame_extractor.extract(
                video_path,
                output_dir,
                on_progress=self._create_progress_callback("帧提取")
            )

            report.frames = extraction_result.frames
            self.logger.info(
                f"提取了 {len(extraction_result.frames)} 帧",
                context="帧提取"
            )

            # Step 5: 提取音频并转文字（可选）
            transcript_result = None
            if self.config.enable_audio:
                self.logger.info("正在提取音频...", context="音频")
                audio_result = self.audio_extractor.extract(video_path, output_dir)

                if audio_result.success:
                    self.logger.info(f"音频已提取: {audio_result.file_path}", context="音频")

                    self.logger.info("正在进行音频转文字...", context="音频转录")
                    transcript_result = self.audio_transcriber.transcribe(audio_result.file_path)

                    if transcript_result.success:
                        # 保存转录结果
                        transcript_path = os.path.join(output_dir, "transcript.json")
                        self.audio_transcriber.save_transcript(transcript_result, transcript_path)
                        self.logger.info(f"音频转录完成: {len(transcript_result.segments)} 个片段", context="音频转录")
                    else:
                        self.logger.warning(f"音频转录失败: {transcript_result.error_message}", context="音频转录")
                else:
                    self.logger.warning(f"音频提取失败: {audio_result.error_message}", context="音频")

            # Step 6: 相似帧检测与合并
            self.logger.info("正在检测相似帧...", context="相似帧")
            representative_frames, similarity_result = merge_similar_frames(
                extraction_result.frames,
                similarity_threshold=self.config.similarity_threshold
            )
            self.logger.info(
                f"相似帧合并: {similarity_result.original_count} -> {similarity_result.merged_count} "
                f"(缩减 {similarity_result.reduction_ratio:.1%})",
                context="相似帧"
            )

            # Step 7: 初始化增量报告
            self.logger.info("正在初始化报告...", context="报告")
            report_generator = IncrementalReportGenerator(output_dir)
            report_generator.initialize(metadata, transcript_result)

            # Step 8: 使用 Claude CLI 逐帧分析
            self.logger.info(f"正在进行 AI 分析（共 {len(similarity_result.groups)} 个场景）...", context="AI分析")

            analyses = []

            def on_group_analyzed(group, result):
                # 每帧分析完成后立即写入报告
                report_generator.append_frame_analysis(
                    group.representative_frame,
                    result,
                    group
                )
                if result.success and result.parsed_analysis:
                    analyses.append(result.parsed_analysis)

            # 检查 Claude CLI 是否可用
            if self.claude_analyzer.check_claude_cli():
                self.claude_analyzer.analyze_frame_groups(
                    similarity_result.groups,
                    on_group_analyzed=on_group_analyzed,
                    on_progress=self._create_progress_callback("AI分析")
                )
            else:
                self.logger.warning("Claude CLI 不可用，跳过 AI 分析", context="AI分析")
                # 仍然写入帧信息到报告（无分析内容）
                for group in similarity_result.groups:
                    from claude_cli_analyzer import ClaudeAnalysisResult
                    empty_result = ClaudeAnalysisResult(
                        success=False,
                        frame_id=group.representative_frame.frame_id,
                        timestamp=group.representative_frame.timestamp,
                        error_message="Claude CLI 不可用"
                    )
                    report_generator.append_frame_analysis(
                        group.representative_frame,
                        empty_result,
                        group
                    )

            report.analyses = analyses

            # Step 9: 生成摘要并完成报告
            self.logger.info("正在生成摘要...", context="报告")
            if analyses:
                summary = ReportSummaryGenerator.generate_summary_from_analyses(analyses, metadata)
                report_generator.insert_summary(summary)

            report_generator.finalize()

            report.status = "complete"
            self.logger.info(f"报告已生成: {report_generator.report_path}", context="报告生成")

            # 清理临时视频文件
            try:
                os.remove(video_path)
                self.logger.debug("已清理临时视频文件", context="清理")
            except OSError:
                pass

            return report

        except BilibiliAnalyzerError as e:
            self.logger.error(str(e), context=e.context)
            report.status = "failed"
            report.errors.append(str(e))

            # 保存部分结果
            if report.metadata or report.frames or report.analyses:
                self.partial_saver.save_partial_report(report, str(e))

            raise

        except Exception as e:
            self.logger.error(f"未预期的错误: {e}", context="系统", exc_info=True)
            report.status = "failed"
            report.errors.append(str(e))

            # 保存错误状态
            self.partial_saver.save_error_state(e, {
                "metadata": report.metadata,
                "frames_count": len(report.frames),
                "analyses_count": len(report.analyses)
            }, stage="unknown")

            raise BilibiliAnalyzerError(f"分析失败: {e}")
    
    def close(self):
        """关闭分析器，释放资源"""
        self.metadata_fetcher.close()
        self.video_downloader.close()
        self.logger.close()
    
    def __enter__(self):
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()


def create_argument_parser() -> argparse.ArgumentParser:
    """创建命令行参数解析器

    Returns:
        配置好的ArgumentParser
    """
    parser = argparse.ArgumentParser(
        prog="bilibili-analyzer",
        description="Bilibili视频分析器 - 自动下载、提取关键帧、AI分析并生成报告",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  %(prog)s https://www.bilibili.com/video/BV1xx411c7mD
  %(prog)s https://b23.tv/BV1xx411c7mD -i 1 --no-audio
  %(prog)s <URL> -o ./output --similarity 0.9

更多信息请访问: https://github.com/your-repo/bilibili-analyzer
        """
    )

    # 必需参数
    parser.add_argument(
        "url",
        type=str,
        help="B站视频URL (支持 bilibili.com/video/BV* 或 b23.tv/*)"
    )

    # 帧提取参数
    parser.add_argument(
        "-i", "--interval",
        type=int,
        default=1,
        metavar="SECONDS",
        help="帧提取间隔（秒），默认: 1"
    )

    # 最大帧数参数
    parser.add_argument(
        "-m", "--max-frames",
        type=int,
        default=0,
        metavar="NUM",
        help="最大提取帧数，0表示不限制，默认: 0"
    )

    # 相似度阈值
    parser.add_argument(
        "-s", "--similarity",
        type=float,
        default=0.95,
        metavar="THRESHOLD",
        help="相似帧检测阈值（0-1），默认: 0.95"
    )

    # 输出目录参数
    parser.add_argument(
        "-o", "--output",
        type=str,
        default="./bilibili",
        metavar="DIR",
        help="输出目录，默认: ./bilibili"
    )

    # 音频处理开关
    parser.add_argument(
        "--no-audio",
        action="store_true",
        help="禁用音频提取和转录"
    )

    # Whisper 模型大小
    parser.add_argument(
        "--whisper-model",
        type=str,
        default="base",
        choices=["tiny", "base", "small", "medium", "large"],
        help="Whisper 模型大小，默认: base"
    )

    # 音频语言
    parser.add_argument(
        "--language",
        type=str,
        default="zh",
        metavar="LANG",
        help="音频语言代码，默认: zh（中文）"
    )

    # 场景检测开关
    parser.add_argument(
        "--scene-detection",
        action="store_true",
        help="启用场景变化检测（高频模式下默认关闭）"
    )

    # 断点续传
    parser.add_argument(
        "--resume",
        action="store_true",
        help="从上次中断处继续分析"
    )

    # 下载重试次数
    parser.add_argument(
        "--retries",
        type=int,
        default=3,
        metavar="NUM",
        help="下载失败重试次数，默认: 3"
    )

    # 日志级别
    parser.add_argument(
        "-v", "--verbose",
        action="store_true",
        help="显示详细日志（DEBUG级别）"
    )

    parser.add_argument(
        "-q", "--quiet",
        action="store_true",
        help="静默模式（只显示错误）"
    )

    # 版本信息
    parser.add_argument(
        "--version",
        action="version",
        version="%(prog)s 2.0.0"
    )

    return parser


def create_config_from_args(args: argparse.Namespace) -> AnalyzerConfig:
    """从命令行参数创建配置对象

    Args:
        args: 解析后的命令行参数

    Returns:
        AnalyzerConfig配置对象
    """
    # 确定日志级别
    if args.verbose:
        log_level = "DEBUG"
    elif args.quiet:
        log_level = "ERROR"
    else:
        log_level = "INFO"

    return AnalyzerConfig(
        frame_interval=args.interval,
        max_frames=args.max_frames,
        output_dir=args.output,
        similarity_threshold=args.similarity,
        enable_audio=not args.no_audio,
        whisper_model=args.whisper_model,
        audio_language=args.language,
        enable_scene_detection=args.scene_detection,
        resume=args.resume,
        download_retries=args.retries,
        log_level=log_level
    )


def print_banner():
    """打印程序横幅"""
    banner = """
╔══════════════════════════════════════════════════════════════╗
║           Bilibili Video Analyzer v2.0.0                     ║
║   自动下载、提取关键帧、Claude AI分析并生成Markdown报告      ║
╚══════════════════════════════════════════════════════════════╝
    """
    print(banner)


def print_config_summary(config: AnalyzerConfig):
    """打印配置摘要

    Args:
        config: 分析器配置
    """
    print("\n📋 配置信息:")
    print(f"   帧提取间隔: {config.frame_interval}秒")
    print(f"   最大帧数: {'不限制' if config.max_frames == 0 else config.max_frames}")
    print(f"   相似帧阈值: {config.similarity_threshold}")
    print(f"   输出目录: {config.output_dir}")
    print(f"   音频分析: {'启用' if config.enable_audio else '禁用'}")
    if config.enable_audio:
        print(f"   Whisper模型: {config.whisper_model}")
        print(f"   音频语言: {config.audio_language}")
    print(f"   场景检测: {'启用' if config.enable_scene_detection else '禁用'}")
    print()


def main(args: Optional[List[str]] = None) -> int:
    """主函数
    
    Args:
        args: 命令行参数列表，None则使用sys.argv
        
    Returns:
        退出码 (0=成功, 1=失败)
    """
    # 解析命令行参数
    parser = create_argument_parser()
    parsed_args = parser.parse_args(args)
    
    # 创建配置
    config = create_config_from_args(parsed_args)
    
    # 打印横幅和配置（非静默模式）
    if not parsed_args.quiet:
        print_banner()
        print_config_summary(config)
    
    # 执行分析
    try:
        with BilibiliAnalyzer(config) as analyzer:
            report = analyzer.analyze(parsed_args.url)
            
            if report.status == "complete":
                print("\n✅ 分析完成!")
                print(f"   报告位置: {config.output_dir}")
                return 0
            else:
                print("\n⚠️ 分析部分完成")
                if report.errors:
                    print(f"   错误: {report.errors[0]}")
                return 1
                
    except URLValidationError as e:
        print(f"\n❌ URL错误: {e.message}")
        print("   请提供有效的B站视频链接，例如:")
        print("   https://www.bilibili.com/video/BV1xx411c7mD")
        return 1
        
    except MetadataFetchError as e:
        print(f"\n❌ 获取视频信息失败: {e.message}")
        print("   请检查视频是否存在或是否为私有视频")
        return 1
        
    except DownloadError as e:
        print(f"\n❌ 下载失败: {e.message}")
        print("   请检查网络连接或稍后重试")
        return 1
        
    except FFmpegError as e:
        print(f"\n❌ FFmpeg错误: {e.message}")
        print("   请确保已安装ffmpeg:")
        print("   - Windows: https://ffmpeg.org/download.html")
        print("   - macOS: brew install ffmpeg")
        print("   - Linux: sudo apt install ffmpeg")
        return 1
        
    except AnalysisError as e:
        print(f"\n❌ AI分析错误: {e.message}")
        print("   部分结果可能已保存到输出目录")
        return 1
        
    except ReportGenerationError as e:
        print(f"\n❌ 报告生成失败: {e.message}")
        print("   请检查输出目录权限")
        return 1
        
    except BilibiliAnalyzerError as e:
        print(f"\n❌ 分析错误: {e.message}")
        return 1
        
    except KeyboardInterrupt:
        print("\n\n⚠️ 用户中断操作")
        print("   部分结果可能已保存到输出目录")
        return 1
        
    except Exception as e:
        print(f"\n❌ 未预期的错误: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
