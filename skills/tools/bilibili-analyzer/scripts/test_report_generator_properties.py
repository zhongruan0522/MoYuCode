#!/usr/bin/env python3
"""
Bilibili Video Analyzer - Report Generator Property Tests
报告生成器属性测试

使用hypothesis进行属性测试，验证报告生成器的正确性。
每个属性测试配置运行100次迭代。

Feature: bilibili-analyzer
Properties:
- Property 10: Report Content Completeness
- Property 11: TOC-Section Consistency
- Property 12: Output Directory Creation

Validates: Requirements 5.2, 5.3, 5.4, 5.5, 5.7, 5.8
"""

import sys
import os
import tempfile
import shutil
import re
from pathlib import Path

# 确保可以导入模块
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import pytest
from hypothesis import given, strategies as st, settings, assume
from typing import List

from models import (
    VideoMetadata,
    FrameInfo,
    FrameAnalysis,
    ReportConfig,
)
from report_generator import ReportGenerator
from exceptions import ReportGenerationError


# ============================================================================
# Custom Strategies
# ============================================================================

# 安全的文本字符集（避免控制字符和特殊字符）
SAFE_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 _-"
SAFE_CHINESE = "视频测试内容分析报告生成器属性"


@st.composite
def video_metadata_strategy(draw):
    """生成有效的VideoMetadata对象"""
    bvid = "BV" + draw(st.text(
        alphabet="0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
        min_size=10, max_size=10
    ))
    title = draw(st.text(alphabet=SAFE_CHARS + SAFE_CHINESE, min_size=1, max_size=50))
    # 确保标题不为空白
    assume(title.strip())
    
    author = draw(st.text(alphabet=SAFE_CHARS + SAFE_CHINESE, min_size=1, max_size=30))
    assume(author.strip())
    
    author_id = draw(st.text(alphabet="0123456789", min_size=1, max_size=15))
    duration = draw(st.integers(min_value=1, max_value=36000))
    description = draw(st.text(alphabet=SAFE_CHARS + SAFE_CHINESE, min_size=0, max_size=200))
    cover_url = f"https://example.com/cover/{bvid}.jpg"
    view_count = draw(st.integers(min_value=0, max_value=100000000))
    like_count = draw(st.integers(min_value=0, max_value=10000000))
    publish_time = "2024-01-15 12:00:00"
    
    return VideoMetadata(
        bvid=bvid,
        title=title,
        author=author,
        author_id=author_id,
        duration=duration,
        description=description,
        cover_url=cover_url,
        view_count=view_count,
        like_count=like_count,
        publish_time=publish_time
    )


@st.composite
def frame_info_strategy(draw, frame_id: int = None):
    """生成有效的FrameInfo对象"""
    if frame_id is None:
        frame_id = draw(st.integers(min_value=0, max_value=1000))
    
    timestamp = draw(st.floats(min_value=0.0, max_value=36000.0, allow_nan=False, allow_infinity=False))
    
    # 格式化时间戳
    hours = int(timestamp // 3600)
    minutes = int((timestamp % 3600) // 60)
    secs = int(timestamp % 60)
    timestamp_str = f"{hours:02d}:{minutes:02d}:{secs:02d}"
    
    # 生成文件路径
    safe_timestamp = timestamp_str.replace(':', '-')
    file_path = f"/tmp/frames/frame_{frame_id:04d}_{safe_timestamp}.jpg"
    
    is_scene_change = draw(st.booleans())
    
    return FrameInfo(
        frame_id=frame_id,
        timestamp=timestamp,
        timestamp_str=timestamp_str,
        file_path=file_path,
        is_scene_change=is_scene_change
    )


@st.composite
def frame_info_list_strategy(draw, min_size: int = 1, max_size: int = 10):
    """生成FrameInfo列表，确保frame_id唯一且按时间排序"""
    size = draw(st.integers(min_value=min_size, max_value=max_size))
    
    # 生成唯一的时间戳
    timestamps = sorted(draw(st.lists(
        st.floats(min_value=0.0, max_value=36000.0, allow_nan=False, allow_infinity=False),
        min_size=size,
        max_size=size,
        unique=True
    )))
    
    frames = []
    for idx, timestamp in enumerate(timestamps):
        hours = int(timestamp // 3600)
        minutes = int((timestamp % 3600) // 60)
        secs = int(timestamp % 60)
        timestamp_str = f"{hours:02d}:{minutes:02d}:{secs:02d}"
        safe_timestamp = timestamp_str.replace(':', '-')
        
        frame = FrameInfo(
            frame_id=idx,
            timestamp=timestamp,
            timestamp_str=timestamp_str,
            file_path=f"/tmp/frames/frame_{idx:04d}_{safe_timestamp}.jpg",
            is_scene_change=draw(st.booleans())
        )
        frames.append(frame)
    
    return frames


@st.composite
def frame_analysis_strategy(draw, frame_id: int = None, timestamp: float = None):
    """生成有效的FrameAnalysis对象"""
    if frame_id is None:
        frame_id = draw(st.integers(min_value=0, max_value=1000))
    if timestamp is None:
        timestamp = draw(st.floats(min_value=0.0, max_value=36000.0, allow_nan=False, allow_infinity=False))
    
    description = draw(st.text(alphabet=SAFE_CHARS + SAFE_CHINESE, min_size=1, max_size=100))
    objects = draw(st.lists(
        st.text(alphabet=SAFE_CHARS, min_size=1, max_size=20),
        min_size=0, max_size=5
    ))
    text_content = draw(st.lists(
        st.text(alphabet=SAFE_CHARS + SAFE_CHINESE, min_size=1, max_size=50),
        min_size=0, max_size=3
    ))
    people_count = draw(st.integers(min_value=0, max_value=20))
    scene_type = draw(st.sampled_from(["indoor", "outdoor", "presentation", "dialogue", "action", "unknown"]))
    key_points = draw(st.lists(
        st.text(alphabet=SAFE_CHARS + SAFE_CHINESE, min_size=1, max_size=50),
        min_size=0, max_size=3
    ))
    confidence = draw(st.floats(min_value=0.0, max_value=1.0, allow_nan=False, allow_infinity=False))
    
    return FrameAnalysis(
        frame_id=frame_id,
        timestamp=timestamp,
        description=description,
        objects=objects,
        text_content=text_content,
        people_count=people_count,
        scene_type=scene_type,
        key_points=key_points,
        confidence=confidence
    )


@st.composite
def frame_analysis_list_strategy(draw, frames: List[FrameInfo]):
    """根据帧列表生成对应的分析结果列表"""
    analyses = []
    for frame in frames:
        analysis = draw(frame_analysis_strategy(
            frame_id=frame.frame_id,
            timestamp=frame.timestamp
        ))
        analyses.append(analysis)
    return analyses


# ============================================================================
# Test Fixtures
# ============================================================================

@pytest.fixture
def temp_output_dir():
    """创建临时输出目录"""
    temp_dir = tempfile.mkdtemp()
    yield temp_dir
    # 清理
    shutil.rmtree(temp_dir, ignore_errors=True)


@pytest.fixture
def temp_frames_dir():
    """创建临时帧目录并生成测试图片"""
    temp_dir = tempfile.mkdtemp()
    yield temp_dir
    shutil.rmtree(temp_dir, ignore_errors=True)


def create_test_image(path: str):
    """创建测试图片文件"""
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    # 创建一个简单的文件作为测试图片
    with open(path, 'wb') as f:
        # 写入最小的有效JPEG头
        f.write(b'\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00')
        f.write(b'\xff\xd9')  # JPEG结束标记


# ============================================================================
# Property 10: Report Content Completeness
# ============================================================================

@settings(max_examples=100)
@given(metadata=video_metadata_strategy())
def test_property_10_report_contains_metadata(metadata: VideoMetadata):
    """
    Feature: bilibili-analyzer, Property 10: Report Content Completeness
    Validates: Requirements 5.2
    
    *For any* generated report, it SHALL contain video metadata including
    title, author, duration, and URL.
    """
    with tempfile.TemporaryDirectory() as temp_dir:
        config = ReportConfig(
            output_dir=temp_dir,
            video_title=metadata.title,
            include_toc=True,
            include_summary=True
        )
        generator = ReportGenerator(config)
        
        # 生成元数据头部
        header = generator.generate_metadata_header(metadata)
        
        # 验证包含必要的元数据
        assert metadata.title in header, "Report should contain video title"
        assert metadata.bvid in header, "Report should contain BV ID"
        assert metadata.author in header, "Report should contain author name"
        assert f"bilibili.com/video/{metadata.bvid}" in header, "Report should contain video URL"


@settings(max_examples=100)
@given(metadata=video_metadata_strategy())
def test_property_10_report_contains_duration_formatted(metadata: VideoMetadata):
    """
    Feature: bilibili-analyzer, Property 10: Report Content Completeness
    Validates: Requirements 5.2, 5.5
    
    *For any* generated report, the duration SHALL be formatted as HH:MM:SS.
    """
    with tempfile.TemporaryDirectory() as temp_dir:
        config = ReportConfig(
            output_dir=temp_dir,
            video_title=metadata.title,
            include_toc=True,
            include_summary=True
        )
        generator = ReportGenerator(config)
        
        header = generator.generate_metadata_header(metadata)
        
        # 计算预期的时间格式
        hours = metadata.duration // 3600
        minutes = (metadata.duration % 3600) // 60
        secs = metadata.duration % 60
        expected_duration = f"{hours:02d}:{minutes:02d}:{secs:02d}"
        
        assert expected_duration in header, \
            f"Report should contain duration in HH:MM:SS format: {expected_duration}"


@settings(max_examples=100)
@given(frames=frame_info_list_strategy(min_size=1, max_size=5))
def test_property_10_timeline_content_has_timestamps(frames: List[FrameInfo]):
    """
    Feature: bilibili-analyzer, Property 10: Report Content Completeness
    Validates: Requirements 5.3, 5.5
    
    *For any* generated report, timeline content SHALL include timestamps
    in HH:MM:SS format for each frame.
    """
    with tempfile.TemporaryDirectory() as temp_dir:
        config = ReportConfig(
            output_dir=temp_dir,
            video_title="Test Video",
            include_toc=True,
            include_summary=True
        )
        generator = ReportGenerator(config)
        
        # 生成空的分析结果和图片路径
        analyses = []
        image_paths = ["" for _ in frames]
        
        content = generator.generate_timeline_content(frames, analyses, image_paths)
        
        # 验证每个帧的时间戳都在内容中
        for frame in frames:
            timestamp_str = frame.timestamp_str
            assert timestamp_str in content, \
                f"Timeline should contain timestamp {timestamp_str}"


@settings(max_examples=100)
@given(frames=frame_info_list_strategy(min_size=1, max_size=5))
def test_property_10_images_use_relative_paths(frames: List[FrameInfo]):
    """
    Feature: bilibili-analyzer, Property 10: Report Content Completeness
    Validates: Requirements 5.4
    
    *For any* generated report with images, embedded images SHALL use
    relative paths (images/filename.jpg format).
    """
    with tempfile.TemporaryDirectory() as temp_dir:
        # 创建测试图片
        for frame in frames:
            create_test_image(frame.file_path)
        
        config = ReportConfig(
            output_dir=temp_dir,
            video_title="Test Video",
            include_toc=True,
            include_summary=True
        )
        generator = ReportGenerator(config)
        
        # 复制帧并获取相对路径
        relative_paths = generator.copy_frames(frames)
        
        # 验证所有路径都是相对路径（以images/开头）
        for path in relative_paths:
            if path:  # 跳过空路径
                assert path.startswith("images/"), \
                    f"Image path should be relative (images/...): {path}"
                assert not path.startswith("/"), \
                    f"Image path should not be absolute: {path}"


# ============================================================================
# Property 11: TOC-Section Consistency
# ============================================================================

@settings(max_examples=100)
@given(frames=frame_info_list_strategy(min_size=1, max_size=10))
def test_property_11_toc_contains_fixed_sections(frames: List[FrameInfo]):
    """
    Feature: bilibili-analyzer, Property 11: TOC-Section Consistency
    Validates: Requirements 5.7
    
    *For any* generated report with TOC, the TOC SHALL contain entries
    for all fixed sections (视频信息, 执行摘要, 视频内容分析).
    """
    with tempfile.TemporaryDirectory() as temp_dir:
        config = ReportConfig(
            output_dir=temp_dir,
            video_title="Test Video",
            include_toc=True,
            include_summary=True
        )
        generator = ReportGenerator(config)
        
        toc = generator.generate_toc(frames)
        
        # 验证固定章节存在
        assert "视频信息" in toc, "TOC should contain '视频信息' section"
        assert "执行摘要" in toc, "TOC should contain '执行摘要' section"
        assert "视频内容分析" in toc, "TOC should contain '视频内容分析' section"


@settings(max_examples=100)
@given(frames=frame_info_list_strategy(min_size=1, max_size=10))
def test_property_11_toc_contains_frame_timestamps(frames: List[FrameInfo]):
    """
    Feature: bilibili-analyzer, Property 11: TOC-Section Consistency
    Validates: Requirements 5.7
    
    *For any* generated report with TOC, each frame timestamp SHALL have
    a corresponding TOC entry.
    """
    with tempfile.TemporaryDirectory() as temp_dir:
        config = ReportConfig(
            output_dir=temp_dir,
            video_title="Test Video",
            include_toc=True,
            include_summary=True
        )
        generator = ReportGenerator(config)
        
        toc = generator.generate_toc(frames)
        
        # 验证每个帧的时间戳都在TOC中
        for frame in frames:
            timestamp_str = frame.timestamp_str
            assert timestamp_str in toc, \
                f"TOC should contain timestamp {timestamp_str}"


@settings(max_examples=100)
@given(frames=frame_info_list_strategy(min_size=1, max_size=5))
def test_property_11_toc_entries_have_anchors(frames: List[FrameInfo]):
    """
    Feature: bilibili-analyzer, Property 11: TOC-Section Consistency
    Validates: Requirements 5.7
    
    *For any* TOC entry, it SHALL have a valid anchor link format.
    """
    with tempfile.TemporaryDirectory() as temp_dir:
        config = ReportConfig(
            output_dir=temp_dir,
            video_title="Test Video",
            include_toc=True,
            include_summary=True
        )
        generator = ReportGenerator(config)
        
        toc = generator.generate_toc(frames)
        
        # 验证TOC包含锚点链接格式 [text](#anchor)
        anchor_pattern = r'\[.*?\]\(#.*?\)'
        matches = re.findall(anchor_pattern, toc)
        
        # 至少应该有固定章节的锚点 + 帧时间戳的锚点
        min_expected_anchors = 3 + len(frames)  # 3个固定章节 + 帧数
        assert len(matches) >= 3, \
            f"TOC should have at least 3 anchor links for fixed sections, found {len(matches)}"


@settings(max_examples=100)
@given(frames=frame_info_list_strategy(min_size=1, max_size=5))
def test_property_11_section_headers_match_toc(frames: List[FrameInfo]):
    """
    Feature: bilibili-analyzer, Property 11: TOC-Section Consistency
    Validates: Requirements 5.7
    
    *For any* generated report, each section header in the content SHALL
    have a corresponding TOC entry.
    """
    with tempfile.TemporaryDirectory() as temp_dir:
        config = ReportConfig(
            output_dir=temp_dir,
            video_title="Test Video",
            include_toc=True,
            include_summary=True
        )
        generator = ReportGenerator(config)
        
        # 生成TOC和时间线内容
        toc = generator.generate_toc(frames)
        
        analyses = []
        image_paths = ["" for _ in frames]
        timeline = generator.generate_timeline_content(frames, analyses, image_paths)
        
        # 提取时间线中的所有时间戳标题
        header_pattern = r'### (\d{2}:\d{2}:\d{2})'
        timeline_timestamps = re.findall(header_pattern, timeline)
        
        # 验证每个时间线标题都在TOC中
        for ts in timeline_timestamps:
            assert ts in toc, \
                f"Timeline header {ts} should have corresponding TOC entry"


# ============================================================================
# Property 12: Output Directory Creation
# ============================================================================

@settings(max_examples=100)
@given(st.text(alphabet="abcdefghijklmnopqrstuvwxyz0123456789_-", min_size=1, max_size=20))
def test_property_12_creates_output_directory(subdir_name: str):
    """
    Feature: bilibili-analyzer, Property 12: Output Directory Creation
    Validates: Requirements 5.8
    
    *For any* specified output path, if the directory does not exist,
    the report generator SHALL create it.
    """
    assume(subdir_name.strip())  # 确保不是空白
    
    with tempfile.TemporaryDirectory() as temp_base:
        # 创建一个不存在的子目录路径
        output_dir = os.path.join(temp_base, subdir_name, "nested", "path")
        
        # 确认目录不存在
        assert not os.path.exists(output_dir), "Directory should not exist initially"
        
        config = ReportConfig(
            output_dir=output_dir,
            video_title="Test Video",
            include_toc=True,
            include_summary=True
        )
        generator = ReportGenerator(config)
        
        # 调用确保目录存在的方法
        result_path = generator.ensure_output_directory()
        
        # 验证目录已创建
        assert os.path.exists(output_dir), "Output directory should be created"
        assert os.path.isdir(output_dir), "Output path should be a directory"
        
        # 验证images子目录也被创建
        images_dir = os.path.join(output_dir, "images")
        assert os.path.exists(images_dir), "Images subdirectory should be created"
        assert os.path.isdir(images_dir), "Images path should be a directory"


@settings(max_examples=100)
@given(st.text(alphabet="abcdefghijklmnopqrstuvwxyz0123456789_-", min_size=1, max_size=20))
def test_property_12_existing_directory_not_affected(subdir_name: str):
    """
    Feature: bilibili-analyzer, Property 12: Output Directory Creation
    Validates: Requirements 5.8
    
    *For any* existing output directory, calling ensure_output_directory
    SHALL NOT raise an error or modify existing content.
    """
    assume(subdir_name.strip())
    
    with tempfile.TemporaryDirectory() as temp_base:
        output_dir = os.path.join(temp_base, subdir_name)
        
        # 预先创建目录和一个测试文件
        os.makedirs(output_dir, exist_ok=True)
        test_file = os.path.join(output_dir, "existing_file.txt")
        with open(test_file, 'w') as f:
            f.write("test content")
        
        config = ReportConfig(
            output_dir=output_dir,
            video_title="Test Video",
            include_toc=True,
            include_summary=True
        )
        generator = ReportGenerator(config)
        
        # 调用确保目录存在的方法
        generator.ensure_output_directory()
        
        # 验证现有文件未被删除
        assert os.path.exists(test_file), "Existing file should not be deleted"
        with open(test_file, 'r') as f:
            assert f.read() == "test content", "Existing file content should be preserved"


@settings(max_examples=100)
@given(frames=frame_info_list_strategy(min_size=1, max_size=3))
def test_property_12_frames_copied_to_images_dir(frames: List[FrameInfo]):
    """
    Feature: bilibili-analyzer, Property 12: Output Directory Creation
    Validates: Requirements 5.4, 5.8
    
    *For any* set of frames, copy_frames SHALL copy images to the
    images subdirectory of the output directory.
    """
    with tempfile.TemporaryDirectory() as temp_dir:
        # 创建测试图片
        for frame in frames:
            create_test_image(frame.file_path)
        
        config = ReportConfig(
            output_dir=temp_dir,
            video_title="Test Video",
            include_toc=True,
            include_summary=True
        )
        generator = ReportGenerator(config)
        
        # 确保目录存在
        generator.ensure_output_directory()
        
        # 复制帧
        relative_paths = generator.copy_frames(frames)
        
        # 验证图片被复制到images目录
        images_dir = os.path.join(temp_dir, "images")
        for i, frame in enumerate(frames):
            src_name = os.path.basename(frame.file_path)
            dest_path = os.path.join(images_dir, src_name)
            assert os.path.exists(dest_path), \
                f"Frame image should be copied to images directory: {dest_path}"
            
            # 验证返回的相对路径正确
            expected_relative = f"images/{src_name}"
            assert relative_paths[i] == expected_relative, \
                f"Relative path should be {expected_relative}, got {relative_paths[i]}"


@settings(max_examples=50)
@given(
    metadata=video_metadata_strategy(),
    frames=frame_info_list_strategy(min_size=1, max_size=3)
)
def test_property_12_full_report_creates_all_directories(
    metadata: VideoMetadata,
    frames: List[FrameInfo]
):
    """
    Feature: bilibili-analyzer, Property 12: Output Directory Creation
    Validates: Requirements 5.1, 5.8
    
    *For any* full report generation, all necessary directories SHALL be
    created automatically.
    """
    with tempfile.TemporaryDirectory() as temp_base:
        # 创建测试图片
        for frame in frames:
            create_test_image(frame.file_path)
        
        # 使用嵌套的不存在路径
        output_dir = os.path.join(temp_base, "bilibili", metadata.title[:20])
        
        config = ReportConfig(
            output_dir=output_dir,
            video_title=metadata.title,
            include_toc=True,
            include_summary=True
        )
        generator = ReportGenerator(config)
        
        # 生成分析结果
        analyses = [
            FrameAnalysis(
                frame_id=f.frame_id,
                timestamp=f.timestamp,
                description="Test description",
                objects=["object1"],
                text_content=[],
                people_count=1,
                scene_type="test",
                key_points=["point1"],
                confidence=0.8
            )
            for f in frames
        ]
        
        # 生成完整报告
        report_content = generator.generate(metadata, analyses, frames)
        
        # 验证目录结构
        assert os.path.exists(output_dir), "Output directory should exist"
        assert os.path.exists(os.path.join(output_dir, "images")), \
            "Images subdirectory should exist"
        
        # 验证报告内容不为空
        assert len(report_content) > 0, "Report content should not be empty"
        assert metadata.title in report_content, "Report should contain video title"


# ============================================================================
# Additional Integration Tests
# ============================================================================

@settings(max_examples=50)
@given(
    metadata=video_metadata_strategy(),
    frames=frame_info_list_strategy(min_size=1, max_size=3)
)
def test_save_report_creates_file(metadata: VideoMetadata, frames: List[FrameInfo]):
    """
    Feature: bilibili-analyzer, Property 10: Report Content Completeness
    Validates: Requirements 5.1
    
    *For any* report, save_report SHALL create a valid markdown file.
    """
    with tempfile.TemporaryDirectory() as temp_dir:
        # 创建测试图片
        for frame in frames:
            create_test_image(frame.file_path)
        
        config = ReportConfig(
            output_dir=temp_dir,
            video_title=metadata.title,
            include_toc=True,
            include_summary=True
        )
        generator = ReportGenerator(config)
        
        analyses = []
        
        # 保存报告
        report_path = generator.save_report(metadata, analyses, frames, "report.md")
        
        # 验证文件存在
        assert os.path.exists(report_path), "Report file should be created"
        
        # 验证文件内容
        with open(report_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        assert len(content) > 0, "Report file should not be empty"
        assert metadata.title in content, "Report should contain video title"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])