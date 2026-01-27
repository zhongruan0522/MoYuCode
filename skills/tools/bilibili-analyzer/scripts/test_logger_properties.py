#!/usr/bin/env python3
"""
Bilibili Video Analyzer - Logger Property Tests
日志系统属性测试

使用hypothesis进行属性测试，验证日志系统的正确性。
每个属性测试配置运行100次迭代。

Feature: bilibili-analyzer
"""

import sys
import os
import json
import tempfile
import shutil
from pathlib import Path
from datetime import datetime

# 确保可以导入模块
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import pytest
from hypothesis import given, strategies as st, settings, assume

from logger import AnalyzerLogger, PartialResultSaver, get_logger
from models import (
    VideoMetadata,
    VideoReport,
    FrameInfo,
    FrameAnalysis,
    AnalyzerConfig,
)
from exceptions import (
    BilibiliAnalyzerError,
    URLValidationError,
    DownloadError,
    AnalysisError,
)


# ============================================================================
# Custom Strategies - Simplified for performance
# ============================================================================

# Simple ASCII text for faster generation
simple_text = st.text(alphabet='abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ', min_size=1, max_size=30)


@st.composite
def video_metadata_strategy(draw):
    """生成随机的视频元数据"""
    return VideoMetadata(
        bvid=f"BV{draw(st.text(alphabet='abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', min_size=10, max_size=10))}",
        title=draw(simple_text),
        author=draw(simple_text),
        author_id=draw(st.text(alphabet='0123456789', min_size=1, max_size=10)),
        duration=draw(st.integers(min_value=1, max_value=36000)),
        description=draw(st.text(alphabet='abcdefghijklmnopqrstuvwxyz ', min_size=0, max_size=50)),
        cover_url=f"https://example.com/cover.jpg",
        view_count=draw(st.integers(min_value=0, max_value=10000000)),
        like_count=draw(st.integers(min_value=0, max_value=1000000)),
        publish_time=datetime.now().isoformat()
    )


@st.composite
def frame_info_strategy(draw):
    """生成随机的帧信息"""
    timestamp = draw(st.floats(min_value=0, max_value=36000, allow_nan=False, allow_infinity=False))
    hours = int(timestamp // 3600)
    minutes = int((timestamp % 3600) // 60)
    secs = int(timestamp % 60)
    return FrameInfo(
        frame_id=draw(st.integers(min_value=0, max_value=1000)),
        timestamp=timestamp,
        timestamp_str=f"{hours:02d}:{minutes:02d}:{secs:02d}",
        file_path=f"/tmp/frame_{draw(st.integers(min_value=0, max_value=1000))}.jpg",
        is_scene_change=draw(st.booleans())
    )


@st.composite
def frame_analysis_strategy(draw):
    """生成随机的帧分析结果"""
    timestamp = draw(st.floats(min_value=0, max_value=36000, allow_nan=False, allow_infinity=False))
    return FrameAnalysis(
        frame_id=draw(st.integers(min_value=0, max_value=1000)),
        timestamp=timestamp,
        description=draw(simple_text),
        objects=draw(st.lists(simple_text, min_size=0, max_size=3)),
        text_content=draw(st.lists(simple_text, min_size=0, max_size=2)),
        people_count=draw(st.integers(min_value=0, max_value=20)),
        scene_type=draw(st.sampled_from(["indoor", "outdoor", "presentation", "animation", "text"])),
        key_points=draw(st.lists(simple_text, min_size=0, max_size=3)),
        confidence=draw(st.floats(min_value=0.0, max_value=1.0, allow_nan=False, allow_infinity=False))
    )


@st.composite
def video_report_strategy(draw):
    """生成随机的视频报告"""
    metadata = draw(video_metadata_strategy())
    num_frames = draw(st.integers(min_value=0, max_value=5))
    frames = [draw(frame_info_strategy()) for _ in range(num_frames)]
    analyses = [draw(frame_analysis_strategy()) for _ in range(num_frames)]
    
    return VideoReport(
        metadata=metadata,
        frames=frames,
        analyses=analyses,
        summary=draw(st.text(alphabet='abcdefghijklmnopqrstuvwxyz ', min_size=0, max_size=50)),
        status=draw(st.sampled_from(["complete", "partial", "failed"])),
        errors=draw(st.lists(simple_text, min_size=0, max_size=2))
    )


@st.composite
def error_message_strategy(draw):
    """生成随机的错误消息"""
    return draw(simple_text)


@st.composite
def context_strategy(draw):
    """生成随机的上下文字符串"""
    return draw(st.sampled_from([
        "URL验证", "元数据获取", "视频下载", "帧提取", 
        "AI分析", "报告生成", "配置", "Test"
    ]))


@st.composite
def log_level_strategy(draw):
    """生成随机的日志级别"""
    return draw(st.sampled_from(["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]))


@st.composite
def exception_strategy(draw):
    """生成随机的异常对象"""
    exc_type = draw(st.sampled_from([
        URLValidationError,
        DownloadError,
        AnalysisError,
        BilibiliAnalyzerError,
    ]))
    message = draw(simple_text)
    
    if exc_type == URLValidationError:
        return exc_type(message, url="https://example.com/test")
    elif exc_type == DownloadError:
        return exc_type(message, bvid="BV1234567890", retry_count=3)
    elif exc_type == AnalysisError:
        return exc_type(message, frame_id=1, task_id="task_001")
    else:
        return exc_type(message, context="Test")


# ============================================================================
# Property 14: Error Logging Completeness
# ============================================================================

@settings(max_examples=100, deadline=None)
@given(
    message=error_message_strategy(),
    context=context_strategy(),
    level=log_level_strategy()
)
def test_property_14_log_contains_timestamp_and_context(message: str, context: str, level: str):
    """
    Feature: bilibili-analyzer, Property 14: Error Logging Completeness
    Validates: Requirements 7.1, 7.3
    
    *For any* error that occurs during execution, the log SHALL contain
    a timestamp, error context, and the error message.
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        # Create logger with file output
        logger = AnalyzerLogger(
            name=f"test-{os.getpid()}-{id(message)}",
            level="DEBUG",  # Capture all levels
            output_dir=tmpdir
        )
        
        try:
            # Log the message at the specified level
            log_method = getattr(logger, level.lower())
            log_method(message, context=context)
            
            # Force flush
            for handler in logger._logger.handlers:
                handler.flush()
            
            # Read log file
            log_path = Path(tmpdir) / "analyzer.log"
            assert log_path.exists(), "Log file should be created"
            
            with open(log_path, 'r', encoding='utf-8') as f:
                log_content = f.read()
            
            # Verify log contains required elements
            # 1. Timestamp (format: YYYY-MM-DD HH:MM:SS)
            assert any(c.isdigit() for c in log_content), "Log should contain timestamp"
            
            # 2. Context
            assert context in log_content, f"Log should contain context: {context}"
            
            # 3. Message
            assert message in log_content, f"Log should contain message: {message}"
            
            # 4. Log level
            assert level in log_content, f"Log should contain level: {level}"
            
        finally:
            logger.close()


@settings(max_examples=100, deadline=None)
@given(
    exception=exception_strategy(),
    suggestion=simple_text
)
def test_property_14_exception_logging_completeness(exception: Exception, suggestion: str):
    """
    Feature: bilibili-analyzer, Property 14: Error Logging Completeness
    Validates: Requirements 7.1, 7.2
    
    *For any* exception logged, the log SHALL contain the exception message,
    context (if available), and user-friendly suggestion.
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        logger = AnalyzerLogger(
            name=f"test-exc-{os.getpid()}-{id(exception)}",
            level="DEBUG",
            output_dir=tmpdir
        )
        
        try:
            # Log the exception
            logger.log_exception(exception, suggestion=suggestion)
            
            # Force flush
            for handler in logger._logger.handlers:
                handler.flush()
            
            # Read log file
            log_path = Path(tmpdir) / "analyzer.log"
            with open(log_path, 'r', encoding='utf-8') as f:
                log_content = f.read()
            
            # Verify completeness
            # 1. Exception message should be present
            assert str(exception.message) in log_content or str(exception) in log_content, \
                f"Log should contain exception message"
            
            # 2. Suggestion should be present
            assert suggestion in log_content, f"Log should contain suggestion: {suggestion}"
            
            # 3. ERROR level should be present
            assert "ERROR" in log_content, "Exception should be logged at ERROR level"
            
        finally:
            logger.close()


@settings(max_examples=100, deadline=None)
@given(
    messages=st.lists(simple_text, min_size=1, max_size=5),
    contexts=st.lists(context_strategy(), min_size=1, max_size=5)
)
def test_property_14_multiple_errors_all_logged(messages: list, contexts: list):
    """
    Feature: bilibili-analyzer, Property 14: Error Logging Completeness
    Validates: Requirements 7.1, 7.3
    
    *For any* sequence of errors, ALL errors SHALL be logged with their
    respective timestamps and contexts.
    """
    # Ensure we have matching pairs
    min_len = min(len(messages), len(contexts))
    messages = messages[:min_len]
    contexts = contexts[:min_len]
    
    with tempfile.TemporaryDirectory() as tmpdir:
        logger = AnalyzerLogger(
            name=f"test-multi-{os.getpid()}",
            level="DEBUG",
            output_dir=tmpdir
        )
        
        try:
            # Log all messages
            for msg, ctx in zip(messages, contexts):
                logger.error(msg, context=ctx)
            
            # Force flush
            for handler in logger._logger.handlers:
                handler.flush()
            
            # Read log file
            log_path = Path(tmpdir) / "analyzer.log"
            with open(log_path, 'r', encoding='utf-8') as f:
                log_content = f.read()
            
            # Verify all messages are present
            for msg in messages:
                assert msg in log_content, f"All messages should be logged: {msg}"
            
            # Verify all used contexts are present
            for ctx in contexts:
                assert ctx in log_content, f"All contexts should be logged: {ctx}"
            
        finally:
            logger.close()


# ============================================================================
# Property 15: Partial Result Preservation
# ============================================================================

@settings(max_examples=100, deadline=None)
@given(report=video_report_strategy(), error_message=error_message_strategy())
def test_property_15_partial_report_saved_correctly(report: VideoReport, error_message: str):
    """
    Feature: bilibili-analyzer, Property 15: Partial Result Preservation
    Validates: Requirements 7.4
    
    *For any* execution that fails after partial completion, the analyzer
    SHALL save all completed results and indicate incomplete status.
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        logger = AnalyzerLogger(
            name=f"test-partial-{os.getpid()}-{id(report)}",
            output_dir=tmpdir
        )
        
        try:
            saver = PartialResultSaver(tmpdir, logger)
            
            # Save partial report
            saved_path = saver.save_partial_report(report, error_message)
            
            # Verify file exists
            assert os.path.exists(saved_path), "Partial results file should exist"
            
            # Load and verify content
            with open(saved_path, 'r', encoding='utf-8') as f:
                saved_data = json.load(f)
            
            # 1. Status should be 'partial'
            assert saved_data.get('status') == 'partial' or saved_data.get('_status') == 'partial', \
                "Status should indicate partial completion"
            
            # 2. Error message should be preserved (in errors list or _error field)
            error_preserved = (
                error_message in str(saved_data.get('errors', [])) or
                error_message == saved_data.get('_error', '')
            )
            assert error_preserved, f"Error message should be preserved: {error_message}"
            
            # 3. Metadata should be preserved
            assert 'metadata' in saved_data, "Metadata should be preserved"
            assert saved_data['metadata']['bvid'] == report.metadata.bvid, \
                "BV ID should be preserved"
            
            # 4. Frames should be preserved
            assert 'frames' in saved_data, "Frames should be preserved"
            assert len(saved_data['frames']) == len(report.frames), \
                "All frames should be preserved"
            
            # 5. Analyses should be preserved
            assert 'analyses' in saved_data, "Analyses should be preserved"
            assert len(saved_data['analyses']) == len(report.analyses), \
                "All analyses should be preserved"
            
            # 6. Timestamp should be present
            assert '_saved_at' in saved_data, "Save timestamp should be present"
            
        finally:
            logger.close()


@settings(max_examples=100, deadline=None)
@given(
    exception=exception_strategy(),
    partial_data=st.dictionaries(
        keys=st.text(alphabet='abcdefghijklmnopqrstuvwxyz', min_size=1, max_size=10),
        values=st.one_of(
            st.integers(),
            st.text(alphabet='abcdefghijklmnopqrstuvwxyz', min_size=0, max_size=20),
            st.booleans()
        ),
        min_size=1,
        max_size=5
    ),
    stage=st.sampled_from(["url_parsing", "metadata_fetch", "download", "frame_extraction", "analysis", "report_generation"])
)
def test_property_15_error_state_preserved(exception: Exception, partial_data: dict, stage: str):
    """
    Feature: bilibili-analyzer, Property 15: Partial Result Preservation
    Validates: Requirements 7.4
    
    *For any* error that occurs, the error state SHALL be saved with
    all partial data and stage information.
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        logger = AnalyzerLogger(
            name=f"test-error-state-{os.getpid()}-{id(exception)}",
            output_dir=tmpdir
        )
        
        try:
            saver = PartialResultSaver(tmpdir, logger)
            
            # Save error state
            saved_path = saver.save_error_state(exception, partial_data, stage)
            
            # Verify file exists
            assert os.path.exists(saved_path), "Error state file should exist"
            
            # Load and verify content
            with open(saved_path, 'r', encoding='utf-8') as f:
                error_state = json.load(f)
            
            # 1. Stage should be preserved
            assert error_state.get('stage') == stage, f"Stage should be preserved: {stage}"
            
            # 2. Error type should be preserved
            assert error_state.get('error_type') == type(exception).__name__, \
                "Error type should be preserved"
            
            # 3. Error message should be preserved
            assert str(exception.message) in error_state.get('error_message', '') or \
                   str(exception) in str(error_state), \
                "Error message should be preserved"
            
            # 4. Partial data should be preserved
            assert 'partial_data' in error_state, "Partial data should be preserved"
            for key in partial_data:
                assert key in error_state['partial_data'], \
                    f"Partial data key should be preserved: {key}"
            
            # 5. Status should indicate incomplete
            assert error_state.get('status') == 'incomplete', \
                "Status should indicate incomplete"
            
            # 6. Timestamp should be present
            assert 'timestamp' in error_state, "Timestamp should be present"
            
        finally:
            logger.close()


@settings(max_examples=100, deadline=None)
@given(
    checkpoint_name=st.text(alphabet='abcdefghijklmnopqrstuvwxyz0123456789_', min_size=1, max_size=20),
    data=st.dictionaries(
        keys=st.text(alphabet='abcdefghijklmnopqrstuvwxyz', min_size=1, max_size=10),
        values=st.one_of(
            st.integers(),
            st.text(alphabet='abcdefghijklmnopqrstuvwxyz', min_size=0, max_size=20),
            st.lists(st.integers(), min_size=0, max_size=5)
        ),
        min_size=1,
        max_size=5
    )
)
def test_property_15_checkpoint_roundtrip(checkpoint_name: str, data: dict):
    """
    Feature: bilibili-analyzer, Property 15: Partial Result Preservation
    Validates: Requirements 7.4
    
    *For any* checkpoint data, saving and loading SHALL preserve all data.
    Round-trip: data -> save_checkpoint -> load_checkpoint -> data
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        logger = AnalyzerLogger(
            name=f"test-checkpoint-{os.getpid()}-{id(data)}",
            output_dir=tmpdir
        )
        
        try:
            saver = PartialResultSaver(tmpdir, logger)
            
            # Save checkpoint
            saved_path = saver.save_checkpoint(checkpoint_name, data)
            assert os.path.exists(saved_path), "Checkpoint file should exist"
            
            # Load checkpoint
            loaded = saver.load_checkpoint(checkpoint_name)
            assert loaded is not None, "Checkpoint should be loadable"
            
            # Verify data is preserved
            assert loaded.get('name') == checkpoint_name, "Checkpoint name should be preserved"
            assert 'data' in loaded, "Data should be present"
            
            # Verify all data keys and values
            for key, value in data.items():
                assert key in loaded['data'], f"Data key should be preserved: {key}"
                assert loaded['data'][key] == value, f"Data value should be preserved: {key}={value}"
            
        finally:
            logger.close()


@settings(max_examples=100, deadline=None)
@given(report=video_report_strategy())
def test_property_15_partial_report_json_valid(report: VideoReport):
    """
    Feature: bilibili-analyzer, Property 15: Partial Result Preservation
    Validates: Requirements 7.4
    
    *For any* partial report saved, the output SHALL be valid JSON
    that can be parsed and contains all required fields.
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        logger = AnalyzerLogger(
            name=f"test-json-{os.getpid()}-{id(report)}",
            output_dir=tmpdir
        )
        
        try:
            saver = PartialResultSaver(tmpdir, logger)
            
            # Save partial report
            saved_path = saver.save_partial_report(report, "Test error")
            
            # Verify JSON is valid
            with open(saved_path, 'r', encoding='utf-8') as f:
                try:
                    saved_data = json.load(f)
                except json.JSONDecodeError as e:
                    pytest.fail(f"Saved data should be valid JSON: {e}")
            
            # Verify required fields exist
            required_fields = ['metadata', 'frames', 'analyses', 'status']
            for field in required_fields:
                assert field in saved_data, f"Required field should exist: {field}"
            
        finally:
            logger.close()


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
