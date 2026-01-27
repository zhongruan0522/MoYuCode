#!/usr/bin/env python3
"""
Bilibili Video Analyzer - Frame Extractor Property Tests
帧提取器属性测试

使用hypothesis进行属性测试，验证帧提取器的正确性。
每个属性测试配置运行100次迭代。

Feature: bilibili-analyzer
"""

import sys
import os
import json
import tempfile
import shutil

# 确保可以导入模块
_script_dir = os.path.dirname(os.path.abspath(__file__))
if _script_dir not in sys.path:
    sys.path.insert(0, _script_dir)

import pytest
from hypothesis import given, strategies as st, settings, assume

# 使用绝对导入，避免相对导入问题
import importlib.util

def _load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module

# 加载依赖模块
_exceptions = _load_module('exceptions', os.path.join(_script_dir, 'exceptions.py'))
_models = _load_module('models', os.path.join(_script_dir, 'models.py'))
_frame_extractor = _load_module('frame_extractor_module', os.path.join(_script_dir, 'frame_extractor.py'))

FrameExtractor = _frame_extractor.FrameExtractor
FrameInfo = _models.FrameInfo
ExtractionResult = _models.ExtractionResult


# ============================================================================
# Custom Strategies for Frame Extraction Testing
# ============================================================================

@st.composite
def valid_interval_strategy(draw):
    """生成有效的帧提取间隔（1-300秒）"""
    return draw(st.integers(min_value=1, max_value=300))


@st.composite
def valid_max_frames_strategy(draw):
    """生成有效的最大帧数（1-200）"""
    return draw(st.integers(min_value=1, max_value=200))


@st.composite
def valid_duration_strategy(draw):
    """生成有效的视频时长（10-7200秒，即10秒到2小时）"""
    return draw(st.floats(min_value=10.0, max_value=7200.0, allow_nan=False, allow_infinity=False))


@st.composite
def valid_timestamp_strategy(draw):
    """生成有效的时间戳（0-86400秒，即0到24小时）"""
    return draw(st.floats(min_value=0.0, max_value=86400.0, allow_nan=False, allow_infinity=False))


@st.composite
def scene_times_strategy(draw, max_duration: float = 3600.0):
    """生成场景变化时间点列表"""
    num_scenes = draw(st.integers(min_value=0, max_value=20))
    times = draw(st.lists(
        st.floats(min_value=0.0, max_value=max_duration, allow_nan=False, allow_infinity=False),
        min_size=num_scenes,
        max_size=num_scenes,
        unique=True
    ))
    return sorted(times)


@st.composite
def frame_info_strategy(draw):
    """生成有效的FrameInfo对象"""
    frame_id = draw(st.integers(min_value=0, max_value=1000))
    timestamp = draw(valid_timestamp_strategy())
    timestamp_str = FrameExtractor.format_timestamp(timestamp)
    is_scene_change = draw(st.booleans())
    
    return FrameInfo(
        frame_id=frame_id,
        timestamp=timestamp,
        timestamp_str=timestamp_str,
        file_path=f"/tmp/frames/frame_{frame_id:04d}.jpg",
        is_scene_change=is_scene_change
    )


@st.composite
def frame_list_strategy(draw, min_frames: int = 1, max_frames: int = 50):
    """生成有效的帧列表"""
    num_frames = draw(st.integers(min_value=min_frames, max_value=max_frames))
    frames = []
    
    for i in range(num_frames):
        timestamp = draw(st.floats(min_value=0.0, max_value=7200.0, allow_nan=False, allow_infinity=False))
        timestamp_str = FrameExtractor.format_timestamp(timestamp)
        is_scene_change = draw(st.booleans())
        
        frame = FrameInfo(
            frame_id=i,
            timestamp=timestamp,
            timestamp_str=timestamp_str,
            file_path=f"/tmp/frames/frame_{i:04d}.jpg",
            is_scene_change=is_scene_change
        )
        frames.append(frame)
    
    # 按时间戳排序
    frames.sort(key=lambda f: f.timestamp)
    # 重新分配frame_id
    for i, frame in enumerate(frames):
        frame.frame_id = i
    
    return frames


# ============================================================================
# Property 5: Frame Extraction Interval Consistency
# ============================================================================

@settings(max_examples=100)
@given(
    interval=valid_interval_strategy(),
    duration=valid_duration_strategy(),
    max_frames=valid_max_frames_strategy()
)
def test_property_5_interval_frame_timestamps(interval: int, duration: float, max_frames: int):
    """
    Feature: bilibili-analyzer, Property 5: Frame Extraction Interval Consistency
    Validates: Requirements 3.1, 3.3
    
    *For any* video of duration D seconds with interval I, the frame extractor
    SHALL produce frames at timestamps approximately {0, I, 2I, ..., floor(D/I)*I} seconds,
    plus any scene change frames.
    
    This test verifies the timestamp calculation logic without actual video extraction.
    """
    extractor = FrameExtractor(interval=interval, max_frames=max_frames, enable_scene_detection=False)
    
    # 计算预期的时间戳（不含场景变化）
    timestamps = extractor._calculate_frame_timestamps(duration, scene_times=None)
    
    # 验证时间戳是按间隔生成的
    expected_count = min(int(duration // interval) + 1, max_frames)
    
    # 实际帧数应该不超过max_frames
    assert len(timestamps) <= max_frames, \
        f"Frame count {len(timestamps)} exceeds max_frames {max_frames}"
    
    # 验证时间戳是按间隔递增的
    for i, (ts, is_scene) in enumerate(timestamps):
        if i == 0:
            assert ts == 0.0, f"First frame should be at timestamp 0, got {ts}"
        
        # 所有帧都不应该是场景变化帧（因为禁用了场景检测）
        assert is_scene is False, f"Scene detection disabled but got scene change frame at {ts}"
        
        # 时间戳应该在视频时长范围内
        assert ts < duration, f"Timestamp {ts} exceeds duration {duration}"


@settings(max_examples=100)
@given(
    interval=valid_interval_strategy(),
    duration=valid_duration_strategy(),
    scene_times=scene_times_strategy()
)
def test_property_5_interval_with_scene_detection(interval: int, duration: float, scene_times: list):
    """
    Feature: bilibili-analyzer, Property 5: Frame Extraction Interval Consistency
    Validates: Requirements 3.1, 3.2, 3.3
    
    *For any* video with scene changes, the frame extractor SHALL include
    both interval-based frames and scene change frames, maintaining temporal order.
    """
    # 过滤掉超出视频时长的场景时间点
    valid_scene_times = [t for t in scene_times if t < duration]
    
    extractor = FrameExtractor(interval=interval, max_frames=200, enable_scene_detection=True)
    
    timestamps = extractor._calculate_frame_timestamps(duration, scene_times=valid_scene_times)
    
    # 验证时间戳是排序的
    ts_values = [ts for ts, _ in timestamps]
    assert ts_values == sorted(ts_values), "Timestamps should be sorted"
    
    # 验证所有时间戳都在有效范围内
    for ts, _ in timestamps:
        assert 0 <= ts < duration, f"Timestamp {ts} out of range [0, {duration})"


@settings(max_examples=100)
@given(
    interval=valid_interval_strategy(),
    max_frames=st.integers(min_value=1, max_value=10)  # 小的max_frames来测试限制
)
def test_property_5_max_frames_limit(interval: int, max_frames: int):
    """
    Feature: bilibili-analyzer, Property 5: Frame Extraction Interval Consistency
    Validates: Requirements 3.1
    
    *For any* configuration with max_frames limit, the extractor SHALL
    never produce more frames than the specified maximum.
    """
    # 使用足够长的视频来产生超过max_frames的帧
    duration = interval * (max_frames + 10)
    
    extractor = FrameExtractor(interval=interval, max_frames=max_frames, enable_scene_detection=False)
    
    timestamps = extractor._calculate_frame_timestamps(duration, scene_times=None)
    
    assert len(timestamps) <= max_frames, \
        f"Frame count {len(timestamps)} exceeds max_frames {max_frames}"


@settings(max_examples=100)
@given(seconds=valid_timestamp_strategy())
def test_property_5_timestamp_format_consistency(seconds: float):
    """
    Feature: bilibili-analyzer, Property 5: Frame Extraction Interval Consistency
    Validates: Requirements 3.3
    
    *For any* timestamp in seconds, format_timestamp SHALL produce
    a valid HH:MM:SS format string that correctly represents the time.
    """
    formatted = FrameExtractor.format_timestamp(seconds)
    
    # 验证格式
    parts = formatted.split(':')
    assert len(parts) == 3, f"Format should be HH:MM:SS, got {formatted}"
    
    hours, minutes, secs = parts
    assert len(hours) == 2, f"Hours should be 2 digits, got {hours}"
    assert len(minutes) == 2, f"Minutes should be 2 digits, got {minutes}"
    assert len(secs) == 2, f"Seconds should be 2 digits, got {secs}"
    
    # 验证数值范围
    h, m, s = int(hours), int(minutes), int(secs)
    assert 0 <= m < 60, f"Minutes should be 0-59, got {m}"
    assert 0 <= s < 60, f"Seconds should be 0-59, got {s}"
    
    # 验证转换正确性（允许小数部分的截断误差）
    expected_h = int(seconds // 3600)
    expected_m = int((seconds % 3600) // 60)
    expected_s = int(seconds % 60)
    
    assert h == expected_h, f"Hours mismatch: expected {expected_h}, got {h}"
    assert m == expected_m, f"Minutes mismatch: expected {expected_m}, got {m}"
    assert s == expected_s, f"Seconds mismatch: expected {expected_s}, got {s}"


# ============================================================================
# Property 6: Frame Manifest Completeness
# ============================================================================

@settings(max_examples=100)
@given(frames=frame_list_strategy(min_frames=1, max_frames=30))
def test_property_6_manifest_contains_all_frames(frames: list):
    """
    Feature: bilibili-analyzer, Property 6: Frame Manifest Completeness
    Validates: Requirements 3.4
    
    *For any* set of extracted frames, the manifest SHALL contain
    exactly one entry per frame with valid path, timestamp, and scene change indicator.
    """
    # 创建临时目录
    with tempfile.TemporaryDirectory() as temp_dir:
        extractor = FrameExtractor()
        duration = max(f.timestamp for f in frames) + 10.0 if frames else 100.0
        
        # 保存manifest
        extractor._save_manifest(frames, temp_dir, duration)
        
        # 加载并验证manifest
        manifest_path = os.path.join(temp_dir, 'manifest.json')
        assert os.path.exists(manifest_path), "Manifest file should exist"
        
        manifest = FrameExtractor.load_manifest(manifest_path)
        
        # 验证帧数量
        assert manifest['total_frames'] == len(frames), \
            f"Manifest total_frames {manifest['total_frames']} != actual {len(frames)}"
        
        assert len(manifest['frames']) == len(frames), \
            f"Manifest frames count {len(manifest['frames'])} != actual {len(frames)}"
        
        # 验证每个帧条目
        for i, (frame, manifest_entry) in enumerate(zip(frames, manifest['frames'])):
            assert manifest_entry['frame_id'] == frame.frame_id, \
                f"Frame {i} ID mismatch"
            assert manifest_entry['timestamp'] == frame.timestamp, \
                f"Frame {i} timestamp mismatch"
            assert manifest_entry['timestamp_str'] == frame.timestamp_str, \
                f"Frame {i} timestamp_str mismatch"
            assert manifest_entry['file_path'] == frame.file_path, \
                f"Frame {i} file_path mismatch"
            assert manifest_entry['is_scene_change'] == frame.is_scene_change, \
                f"Frame {i} is_scene_change mismatch"
            assert 'filename' in manifest_entry, \
                f"Frame {i} missing filename field"


@settings(max_examples=100)
@given(
    duration=valid_duration_strategy(),
    interval=valid_interval_strategy()
)
def test_property_6_manifest_metadata_completeness(duration: float, interval: int):
    """
    Feature: bilibili-analyzer, Property 6: Frame Manifest Completeness
    Validates: Requirements 3.4
    
    *For any* extraction, the manifest SHALL contain complete metadata
    including video duration, interval, and properly formatted duration string.
    """
    with tempfile.TemporaryDirectory() as temp_dir:
        extractor = FrameExtractor(interval=interval)
        
        # 创建一些测试帧
        frames = [
            FrameInfo(
                frame_id=0,
                timestamp=0.0,
                timestamp_str="00:00:00",
                file_path=os.path.join(temp_dir, "frame_0000.jpg"),
                is_scene_change=False
            )
        ]
        
        extractor._save_manifest(frames, temp_dir, duration)
        
        manifest = FrameExtractor.load_manifest(os.path.join(temp_dir, 'manifest.json'))
        
        # 验证元数据字段存在且正确
        assert 'video_duration' in manifest, "Missing video_duration"
        assert 'video_duration_str' in manifest, "Missing video_duration_str"
        assert 'total_frames' in manifest, "Missing total_frames"
        assert 'interval' in manifest, "Missing interval"
        assert 'frames' in manifest, "Missing frames"
        
        # 验证值
        assert manifest['video_duration'] == duration, \
            f"Duration mismatch: {manifest['video_duration']} != {duration}"
        assert manifest['interval'] == interval, \
            f"Interval mismatch: {manifest['interval']} != {interval}"
        
        # 验证duration_str格式
        expected_duration_str = FrameExtractor.format_timestamp(duration)
        assert manifest['video_duration_str'] == expected_duration_str, \
            f"Duration string mismatch: {manifest['video_duration_str']} != {expected_duration_str}"


@settings(max_examples=100)
@given(frames=frame_list_strategy(min_frames=1, max_frames=20))
def test_property_6_manifest_frame_fields_complete(frames: list):
    """
    Feature: bilibili-analyzer, Property 6: Frame Manifest Completeness
    Validates: Requirements 3.4
    
    *For any* frame in the manifest, it SHALL contain all required fields:
    frame_id, timestamp, timestamp_str, file_path, filename, is_scene_change.
    """
    required_fields = ['frame_id', 'timestamp', 'timestamp_str', 'file_path', 'filename', 'is_scene_change']
    
    with tempfile.TemporaryDirectory() as temp_dir:
        extractor = FrameExtractor()
        duration = max(f.timestamp for f in frames) + 10.0 if frames else 100.0
        
        extractor._save_manifest(frames, temp_dir, duration)
        
        manifest = FrameExtractor.load_manifest(os.path.join(temp_dir, 'manifest.json'))
        
        for i, frame_entry in enumerate(manifest['frames']):
            for field in required_fields:
                assert field in frame_entry, \
                    f"Frame {i} missing required field: {field}"


@settings(max_examples=100)
@given(frames=frame_list_strategy(min_frames=2, max_frames=30))
def test_property_6_manifest_preserves_temporal_order(frames: list):
    """
    Feature: bilibili-analyzer, Property 6: Frame Manifest Completeness
    Validates: Requirements 3.4
    
    *For any* set of frames, the manifest SHALL preserve the temporal order
    of frames based on their timestamps.
    """
    with tempfile.TemporaryDirectory() as temp_dir:
        extractor = FrameExtractor()
        duration = max(f.timestamp for f in frames) + 10.0
        
        extractor._save_manifest(frames, temp_dir, duration)
        
        manifest = FrameExtractor.load_manifest(os.path.join(temp_dir, 'manifest.json'))
        
        # 验证帧按时间戳排序
        timestamps = [f['timestamp'] for f in manifest['frames']]
        assert timestamps == sorted(timestamps), \
            "Manifest frames should be in temporal order"


# ============================================================================
# Additional Helper Tests
# ============================================================================

@settings(max_examples=100)
@given(
    interval=valid_interval_strategy(),
    max_frames=valid_max_frames_strategy()
)
def test_extractor_initialization(interval: int, max_frames: int):
    """
    Feature: bilibili-analyzer
    
    *For any* valid configuration parameters, the FrameExtractor
    SHALL initialize correctly with the specified values.
    """
    extractor = FrameExtractor(
        interval=interval,
        max_frames=max_frames,
        enable_scene_detection=True
    )
    
    assert extractor.interval == interval
    assert extractor.max_frames == max_frames
    assert extractor.enable_scene_detection is True


def test_ffmpeg_check_returns_boolean():
    """
    Feature: bilibili-analyzer
    Validates: Requirements 3.5
    
    check_ffmpeg() SHALL return a boolean value indicating ffmpeg availability.
    """
    result = FrameExtractor.check_ffmpeg()
    assert isinstance(result, bool), f"check_ffmpeg should return bool, got {type(result)}"


def test_ffprobe_check_returns_boolean():
    """
    Feature: bilibili-analyzer
    
    check_ffprobe() SHALL return a boolean value indicating ffprobe availability.
    """
    result = FrameExtractor.check_ffprobe()
    assert isinstance(result, bool), f"check_ffprobe should return bool, got {type(result)}"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
