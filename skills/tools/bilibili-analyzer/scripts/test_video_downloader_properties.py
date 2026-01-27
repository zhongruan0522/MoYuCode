#!/usr/bin/env python3
"""
Bilibili Video Analyzer - Video Downloader Property Tests
视频下载器属性测试

使用hypothesis进行属性测试，验证下载器的重试行为和文件完整性验证。
每个属性测试配置运行100次迭代。

Feature: bilibili-analyzer
"""

import sys
import os
import tempfile
import time
from unittest.mock import Mock, patch, MagicMock
from io import BytesIO

# 确保可以导入模块 - 添加父目录到路径
_script_dir = os.path.dirname(os.path.abspath(__file__))
_parent_dir = os.path.dirname(_script_dir)
if _parent_dir not in sys.path:
    sys.path.insert(0, _parent_dir)
if _script_dir not in sys.path:
    sys.path.insert(0, _script_dir)

import pytest
from hypothesis import given, strategies as st, settings, assume

# 尝试相对导入，失败则使用绝对导入
try:
    from scripts.video_downloader import VideoDownloader
    from scripts.exceptions import DownloadError
except ImportError:
    from video_downloader import VideoDownloader
    from exceptions import DownloadError


# ============================================================================
# Custom Strategies
# ============================================================================

@st.composite
def valid_bvid_strategy(draw):
    """生成有效的BV号"""
    import string
    BVID_CHARS = string.ascii_letters + string.digits
    suffix = draw(st.text(alphabet=BVID_CHARS, min_size=10, max_size=10))
    return f"BV{suffix}"


@st.composite
def retry_config_strategy(draw):
    """生成重试配置"""
    max_retries = draw(st.integers(min_value=1, max_value=5))
    base_delay = draw(st.floats(min_value=0.01, max_value=0.1))
    return max_retries, base_delay


@st.composite
def file_size_strategy(draw):
    """生成文件大小"""
    return draw(st.integers(min_value=1024, max_value=10 * 1024 * 1024))


@st.composite
def video_content_strategy(draw):
    """生成模拟的视频内容（带有效的MP4头）"""
    # MP4 ftyp box header
    ftyp_header = b'\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom'
    # 随机内容
    content_size = draw(st.integers(min_value=100, max_value=10000))
    random_content = draw(st.binary(min_size=content_size, max_size=content_size))
    return ftyp_header + random_content


# ============================================================================
# Property 3: Download Retry Behavior
# ============================================================================

class MockFailingResponse:
    """模拟失败的响应"""
    def __init__(self, fail_count: int, success_content: bytes):
        self.fail_count = fail_count
        self.call_count = 0
        self.success_content = success_content
    
    def raise_for_status(self):
        self.call_count += 1
        if self.call_count <= self.fail_count:
            raise Exception("Simulated network error")
    
    @property
    def headers(self):
        return {"content-length": str(len(self.success_content))}
    
    def iter_content(self, chunk_size=8192):
        for i in range(0, len(self.success_content), chunk_size):
            yield self.success_content[i:i+chunk_size]


@settings(max_examples=100, deadline=None)
@given(
    max_retries=st.integers(min_value=1, max_value=5),
    fail_count=st.integers(min_value=0, max_value=6)
)
def test_property_3_retry_count_matches_config(max_retries: int, fail_count: int):
    """
    Feature: bilibili-analyzer, Property 3: Download Retry Behavior
    Validates: Requirements 2.3, 2.4
    
    *For any* download failure scenario, the downloader SHALL retry exactly up to
    the configured maximum (default 3) times with exponential backoff before
    reporting failure.
    """
    with tempfile.TemporaryDirectory() as temp_dir:
        downloader = VideoDownloader(
            temp_dir=temp_dir,
            max_retries=max_retries,
            base_delay=0.001,  # 极短延迟以加速测试
            timeout=1
        )
        
        # 跟踪实际尝试次数
        attempt_count = 0
        
        def mock_do_download(*args, **kwargs):
            nonlocal attempt_count
            attempt_count += 1
            if attempt_count <= fail_count:
                # 使用IOError，这是_download_with_retry捕获的异常类型之一
                raise IOError("Simulated failure")
            # 成功时创建一个有效的视频文件
            output_path = args[1] if len(args) > 1 else kwargs.get('output_path')
            with open(output_path, 'wb') as f:
                # 写入有效的MP4头
                f.write(b'\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom')
                f.write(b'\x00' * 1000)
            return 1024
        
        # Mock _do_download 方法
        downloader._do_download = mock_do_download
        
        # Mock verify_integrity 返回 True
        downloader.verify_integrity = Mock(return_value=True)
        
        if fail_count < max_retries:
            # 应该成功
            result = downloader._download_with_retry(
                bvid="BV1234567890",
                video_url="http://test.com/video.mp4",
                output_path=os.path.join(temp_dir, "test.mp4"),
                expected_size=1024
            )
            assert result.success is True
            # 尝试次数应该是 fail_count + 1（最后一次成功）
            assert attempt_count == fail_count + 1
        else:
            # 应该失败，且尝试次数等于 max_retries
            with pytest.raises(DownloadError) as exc_info:
                downloader._download_with_retry(
                    bvid="BV1234567890",
                    video_url="http://test.com/video.mp4",
                    output_path=os.path.join(temp_dir, "test.mp4"),
                    expected_size=1024
                )
            assert attempt_count == max_retries
            assert exc_info.value.retry_count == max_retries


@settings(max_examples=100, deadline=None)
@given(max_retries=st.integers(min_value=1, max_value=5))
def test_property_3_all_retries_exhausted_reports_failure(max_retries: int):
    """
    Feature: bilibili-analyzer, Property 3: Download Retry Behavior
    Validates: Requirements 2.3, 2.4
    
    *For any* configuration where all retries fail, the downloader SHALL
    report failure with the correct retry count.
    """
    with tempfile.TemporaryDirectory() as temp_dir:
        downloader = VideoDownloader(
            temp_dir=temp_dir,
            max_retries=max_retries,
            base_delay=0.001,
            timeout=1
        )
        
        attempt_count = 0
        
        def always_fail(*args, **kwargs):
            nonlocal attempt_count
            attempt_count += 1
            # 使用IOError，这是_download_with_retry捕获的异常类型之一
            raise IOError("Always fails")
        
        downloader._do_download = always_fail
        
        with pytest.raises(DownloadError) as exc_info:
            downloader._download_with_retry(
                bvid="BV1234567890",
                video_url="http://test.com/video.mp4",
                output_path=os.path.join(temp_dir, "test.mp4"),
                expected_size=1024
            )
        
        # 验证重试次数
        assert attempt_count == max_retries
        assert exc_info.value.retry_count == max_retries


@settings(max_examples=100, deadline=None)
@given(
    max_retries=st.integers(min_value=2, max_value=5),
    success_on_attempt=st.integers(min_value=1, max_value=5)
)
def test_property_3_success_on_nth_attempt(max_retries: int, success_on_attempt: int):
    """
    Feature: bilibili-analyzer, Property 3: Download Retry Behavior
    Validates: Requirements 2.3
    
    *For any* scenario where download succeeds on the Nth attempt (N <= max_retries),
    the downloader SHALL return success and stop retrying.
    """
    # 确保成功尝试在重试范围内
    assume(success_on_attempt <= max_retries)
    
    with tempfile.TemporaryDirectory() as temp_dir:
        downloader = VideoDownloader(
            temp_dir=temp_dir,
            max_retries=max_retries,
            base_delay=0.001,
            timeout=1
        )
        
        attempt_count = 0
        
        def succeed_on_nth(*args, **kwargs):
            nonlocal attempt_count
            attempt_count += 1
            if attempt_count < success_on_attempt:
                # 使用IOError，这是_download_with_retry捕获的异常类型之一
                raise IOError(f"Fail on attempt {attempt_count}")
            # 成功
            output_path = args[1] if len(args) > 1 else kwargs.get('output_path')
            with open(output_path, 'wb') as f:
                f.write(b'\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom')
                f.write(b'\x00' * 1000)
            return 1024
        
        downloader._do_download = succeed_on_nth
        downloader.verify_integrity = Mock(return_value=True)
        
        result = downloader._download_with_retry(
            bvid="BV1234567890",
            video_url="http://test.com/video.mp4",
            output_path=os.path.join(temp_dir, "test.mp4"),
            expected_size=1024
        )
        
        assert result.success is True
        assert attempt_count == success_on_attempt


# ============================================================================
# Property 4: File Integrity Verification
# ============================================================================

@settings(max_examples=100)
@given(content=video_content_strategy())
def test_property_4_valid_video_file_passes_verification(content: bytes):
    """
    Feature: bilibili-analyzer, Property 4: File Integrity Verification
    Validates: Requirements 2.5
    
    *For any* successfully downloaded video file with valid content,
    the integrity verification SHALL return True.
    """
    with tempfile.TemporaryDirectory() as temp_dir:
        downloader = VideoDownloader(temp_dir=temp_dir)
        
        # 创建测试文件
        file_path = os.path.join(temp_dir, "test_video.mp4")
        with open(file_path, 'wb') as f:
            f.write(content)
        
        # 验证完整性
        result = downloader.verify_integrity(file_path, expected_size=len(content))
        assert result is True, f"Valid video file should pass verification"


@settings(max_examples=100)
@given(expected_size=st.integers(min_value=1000, max_value=100000))
def test_property_4_empty_file_fails_verification(expected_size: int):
    """
    Feature: bilibili-analyzer, Property 4: File Integrity Verification
    Validates: Requirements 2.5
    
    *For any* empty file, the integrity verification SHALL return False.
    """
    with tempfile.TemporaryDirectory() as temp_dir:
        downloader = VideoDownloader(temp_dir=temp_dir)
        
        # 创建空文件
        file_path = os.path.join(temp_dir, "empty.mp4")
        with open(file_path, 'wb') as f:
            pass  # 空文件
        
        result = downloader.verify_integrity(file_path, expected_size=expected_size)
        assert result is False, "Empty file should fail verification"


@settings(max_examples=100)
@given(file_name=st.text(min_size=1, max_size=20).filter(lambda x: x.isalnum()))
def test_property_4_nonexistent_file_fails_verification(file_name: str):
    """
    Feature: bilibili-analyzer, Property 4: File Integrity Verification
    Validates: Requirements 2.5
    
    *For any* non-existent file path, the integrity verification SHALL return False.
    """
    with tempfile.TemporaryDirectory() as temp_dir:
        downloader = VideoDownloader(temp_dir=temp_dir)
        
        # 不存在的文件路径
        file_path = os.path.join(temp_dir, f"{file_name}.mp4")
        
        result = downloader.verify_integrity(file_path)
        assert result is False, "Non-existent file should fail verification"


@settings(max_examples=100)
@given(
    actual_size=st.integers(min_value=1000, max_value=10000),
    size_diff_percent=st.floats(min_value=0.02, max_value=0.5)
)
def test_property_4_size_mismatch_fails_verification(actual_size: int, size_diff_percent: float):
    """
    Feature: bilibili-analyzer, Property 4: File Integrity Verification
    Validates: Requirements 2.5
    
    *For any* file where actual size differs from expected by more than 1%,
    the integrity verification SHALL return False.
    """
    with tempfile.TemporaryDirectory() as temp_dir:
        downloader = VideoDownloader(temp_dir=temp_dir)
        
        # 创建有效视频文件
        file_path = os.path.join(temp_dir, "test.mp4")
        content = b'\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom'
        content += b'\x00' * (actual_size - len(content))
        
        with open(file_path, 'wb') as f:
            f.write(content)
        
        # 计算一个明显不同的预期大小（超过1%误差）
        expected_size = int(actual_size * (1 + size_diff_percent))
        
        result = downloader.verify_integrity(file_path, expected_size=expected_size)
        assert result is False, f"Size mismatch should fail: actual={actual_size}, expected={expected_size}"


@settings(max_examples=100)
@given(
    actual_size=st.integers(min_value=1000, max_value=10000),
    size_diff_percent=st.floats(min_value=0.0, max_value=0.009)
)
def test_property_4_size_within_tolerance_passes(actual_size: int, size_diff_percent: float):
    """
    Feature: bilibili-analyzer, Property 4: File Integrity Verification
    Validates: Requirements 2.5
    
    *For any* file where actual size is within 1% of expected,
    the integrity verification SHALL return True (assuming valid content).
    """
    with tempfile.TemporaryDirectory() as temp_dir:
        downloader = VideoDownloader(temp_dir=temp_dir)
        
        # 创建有效视频文件
        file_path = os.path.join(temp_dir, "test.mp4")
        content = b'\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom'
        content += b'\x00' * (actual_size - len(content))
        
        with open(file_path, 'wb') as f:
            f.write(content)
        
        # 计算一个在容差范围内的预期大小
        expected_size = int(actual_size * (1 + size_diff_percent))
        
        result = downloader.verify_integrity(file_path, expected_size=expected_size)
        assert result is True, f"Size within tolerance should pass: actual={actual_size}, expected={expected_size}"


@settings(max_examples=100)
@given(invalid_content=st.binary(min_size=100, max_size=1000))
def test_property_4_invalid_header_handling(invalid_content: bytes):
    """
    Feature: bilibili-analyzer, Property 4: File Integrity Verification
    Validates: Requirements 2.5
    
    *For any* file with invalid video header, the verification behavior
    depends on content - it may pass if content is non-empty (lenient mode).
    """
    # 确保内容不是有效的视频头
    assume(not invalid_content[4:8] == b"ftyp")  # 不是MP4
    assume(not invalid_content[:3] == b"FLV")     # 不是FLV
    assume(not invalid_content[:4] == b"\x1a\x45\xdf\xa3")  # 不是WebM
    
    with tempfile.TemporaryDirectory() as temp_dir:
        downloader = VideoDownloader(temp_dir=temp_dir)
        
        file_path = os.path.join(temp_dir, "test.mp4")
        with open(file_path, 'wb') as f:
            f.write(invalid_content)
        
        # 验证不会崩溃，返回布尔值
        result = downloader.verify_integrity(file_path)
        assert isinstance(result, bool), "verify_integrity should return bool"


# ============================================================================
# Additional Tests for Video Header Detection
# ============================================================================

@settings(max_examples=100)
@given(content_size=st.integers(min_value=100, max_value=5000))
def test_property_4_mp4_header_detection(content_size: int):
    """
    Feature: bilibili-analyzer, Property 4: File Integrity Verification
    Validates: Requirements 2.5
    
    *For any* file with valid MP4 ftyp header, verification SHALL pass.
    """
    with tempfile.TemporaryDirectory() as temp_dir:
        downloader = VideoDownloader(temp_dir=temp_dir)
        
        # MP4 ftyp header
        content = b'\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom'
        content += b'\x00' * content_size
        
        file_path = os.path.join(temp_dir, "test.mp4")
        with open(file_path, 'wb') as f:
            f.write(content)
        
        result = downloader.verify_integrity(file_path)
        assert result is True, "Valid MP4 file should pass verification"


@settings(max_examples=100)
@given(content_size=st.integers(min_value=100, max_value=5000))
def test_property_4_flv_header_detection(content_size: int):
    """
    Feature: bilibili-analyzer, Property 4: File Integrity Verification
    Validates: Requirements 2.5
    
    *For any* file with valid FLV header, verification SHALL pass.
    """
    with tempfile.TemporaryDirectory() as temp_dir:
        downloader = VideoDownloader(temp_dir=temp_dir)
        
        # FLV header
        content = b'FLV\x01\x05\x00\x00\x00\x09'
        content += b'\x00' * content_size
        
        file_path = os.path.join(temp_dir, "test.flv")
        with open(file_path, 'wb') as f:
            f.write(content)
        
        result = downloader.verify_integrity(file_path)
        assert result is True, "Valid FLV file should pass verification"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
