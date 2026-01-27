#!/usr/bin/env python3
"""
Bilibili Video Analyzer - URL Parser Property Tests
URL解析器属性测试

使用hypothesis进行属性测试，验证URL解析器的正确性。
每个属性测试配置运行100次迭代。

Feature: bilibili-analyzer
"""

import sys
import os

# 确保可以导入模块
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import pytest
from hypothesis import given, strategies as st, settings, assume
import string

from url_parser import URLParser
from exceptions import URLValidationError


# ============================================================================
# Custom Strategies for Bilibili URLs
# ============================================================================

# BV号字符集：字母和数字
BVID_CHARS = string.ascii_letters + string.digits

@st.composite
def valid_bvid_strategy(draw):
    """生成有效的BV号: BV + 10个字母数字字符"""
    suffix = draw(st.text(alphabet=BVID_CHARS, min_size=10, max_size=10))
    return f"BV{suffix}"


@st.composite
def valid_bilibili_url_strategy(draw):
    """生成有效的B站标准URL"""
    bvid = draw(valid_bvid_strategy())
    # 随机选择URL变体
    prefix = draw(st.sampled_from([
        "https://www.bilibili.com/video/",
        "https://bilibili.com/video/",
        "http://www.bilibili.com/video/",
        "http://bilibili.com/video/",
    ]))
    # 可选的查询参数
    suffix = draw(st.sampled_from(["", "?p=1", "?t=30", "?p=2&t=60"]))
    return prefix + bvid + suffix


@st.composite
def valid_b23_url_with_bvid_strategy(draw):
    """生成有效的b23.tv短链接（包含BV号）"""
    bvid = draw(valid_bvid_strategy())
    prefix = draw(st.sampled_from([
        "https://b23.tv/",
        "http://b23.tv/",
    ]))
    return prefix + bvid


@st.composite
def valid_b23_short_code_strategy(draw):
    """生成有效的b23.tv短链接（短代码）"""
    # 短代码通常是6-8个字符
    short_code = draw(st.text(alphabet=BVID_CHARS, min_size=6, max_size=8))
    # 确保不是BV号格式
    assume(not short_code.startswith("BV") or len(short_code) != 12)
    prefix = draw(st.sampled_from([
        "https://b23.tv/",
        "http://b23.tv/",
    ]))
    return prefix + short_code


@st.composite
def invalid_url_strategy(draw):
    """生成无效的URL"""
    invalid_patterns = [
        # 其他网站
        "https://youtube.com/watch?v=",
        "https://youtu.be/",
        "https://twitter.com/",
        "https://example.com/",
        # 错误的B站格式
        "https://www.bilibili.com/",
        "https://www.bilibili.com/video/",
        "https://www.bilibili.com/bangumi/",
        "bilibili.com/video/BV",
        # 无效的BV号
        "https://www.bilibili.com/video/BV123",  # 太短
        "https://www.bilibili.com/video/AV12345",  # AV号
    ]
    base = draw(st.sampled_from(invalid_patterns))
    suffix = draw(st.text(alphabet=BVID_CHARS, min_size=0, max_size=5))
    return base + suffix


# ============================================================================
# Property 1: URL Validation Correctness
# ============================================================================

@settings(max_examples=100)
@given(url=valid_bilibili_url_strategy())
def test_property_1_valid_bilibili_urls_are_accepted(url: str):
    """
    Feature: bilibili-analyzer, Property 1: URL Validation Correctness
    Validates: Requirements 1.1, 1.2, 1.3
    
    *For any* valid Bilibili URL (matching https://[www.]bilibili.com/video/BV* pattern),
    the validator SHALL return True.
    """
    assert URLParser.validate(url) is True, f"Valid URL should be accepted: {url}"


@settings(max_examples=100)
@given(url=valid_b23_url_with_bvid_strategy())
def test_property_1_valid_b23_urls_with_bvid_are_accepted(url: str):
    """
    Feature: bilibili-analyzer, Property 1: URL Validation Correctness
    Validates: Requirements 1.1, 1.3
    
    *For any* valid b23.tv URL containing a BV ID,
    the validator SHALL return True.
    """
    assert URLParser.validate(url) is True, f"Valid b23.tv URL should be accepted: {url}"


@settings(max_examples=100)
@given(url=valid_b23_short_code_strategy())
def test_property_1_valid_b23_short_codes_are_accepted(url: str):
    """
    Feature: bilibili-analyzer, Property 1: URL Validation Correctness
    Validates: Requirements 1.1, 1.3
    
    *For any* valid b23.tv short code URL,
    the validator SHALL return True (format is valid, resolution happens later).
    """
    assert URLParser.validate(url) is True, f"Valid b23.tv short URL should be accepted: {url}"


@settings(max_examples=100)
@given(url=invalid_url_strategy())
def test_property_1_invalid_urls_are_rejected(url: str):
    """
    Feature: bilibili-analyzer, Property 1: URL Validation Correctness
    Validates: Requirements 1.1, 1.3
    
    *For any* invalid URL (not matching Bilibili patterns),
    the validator SHALL return False.
    """
    assert URLParser.validate(url) is False, f"Invalid URL should be rejected: {url}"


@settings(max_examples=100)
@given(text=st.text(min_size=0, max_size=100))
def test_property_1_random_text_handling(text: str):
    """
    Feature: bilibili-analyzer, Property 1: URL Validation Correctness
    Validates: Requirements 1.1
    
    *For any* random text input, the validator SHALL not crash
    and SHALL return a boolean value.
    """
    result = URLParser.validate(text)
    assert isinstance(result, bool), f"validate() should return bool, got {type(result)}"


# ============================================================================
# Property 2: BV ID Extraction Round-Trip
# ============================================================================

@settings(max_examples=100)
@given(bvid=valid_bvid_strategy())
def test_property_2_bvid_roundtrip_via_construct_and_extract(bvid: str):
    """
    Feature: bilibili-analyzer, Property 2: BV ID Extraction Round-Trip
    Validates: Requirements 1.2
    
    *For any* valid BV ID, constructing a URL and then extracting the BV ID
    SHALL produce the original BV ID.
    
    Round-trip: bvid -> construct_url -> extract_bvid -> bvid
    """
    # Construct URL from BV ID
    url = URLParser.construct_url(bvid)
    
    # Extract BV ID from URL
    extracted_bvid = URLParser.extract_bvid(url)
    
    # Should match original
    assert extracted_bvid == bvid, f"Round-trip failed: {bvid} -> {url} -> {extracted_bvid}"


@settings(max_examples=100)
@given(url=valid_bilibili_url_strategy())
def test_property_2_extract_and_normalize_consistency(url: str):
    """
    Feature: bilibili-analyzer, Property 2: BV ID Extraction Round-Trip
    Validates: Requirements 1.2, 1.3
    
    *For any* valid Bilibili URL, extracting the BV ID and normalizing the URL
    SHALL produce consistent results - the normalized URL should contain the extracted BV ID.
    """
    # Extract BV ID
    bvid = URLParser.extract_bvid(url)
    
    # Normalize URL
    normalized = URLParser.normalize_url(url)
    
    # Normalized URL should contain the BV ID
    assert bvid in normalized, f"Normalized URL should contain BV ID: {bvid} not in {normalized}"
    
    # Extracting from normalized should give same BV ID
    extracted_from_normalized = URLParser.extract_bvid(normalized)
    assert extracted_from_normalized == bvid, \
        f"BV ID extraction should be consistent: {bvid} != {extracted_from_normalized}"


@settings(max_examples=100)
@given(url=valid_b23_url_with_bvid_strategy())
def test_property_2_b23_url_extraction_roundtrip(url: str):
    """
    Feature: bilibili-analyzer, Property 2: BV ID Extraction Round-Trip
    Validates: Requirements 1.2, 1.3
    
    *For any* valid b23.tv URL containing a BV ID,
    extracting the BV ID and constructing a standard URL SHALL produce
    a URL that resolves to the same video.
    """
    # Extract BV ID from b23.tv URL
    bvid = URLParser.extract_bvid(url)
    
    # Construct standard URL
    standard_url = URLParser.construct_url(bvid)
    
    # Extract BV ID from standard URL
    extracted_bvid = URLParser.extract_bvid(standard_url)
    
    # Should match
    assert extracted_bvid == bvid, \
        f"b23.tv round-trip failed: {url} -> {bvid} -> {standard_url} -> {extracted_bvid}"


@settings(max_examples=100)
@given(bvid=valid_bvid_strategy())
def test_property_2_normalize_idempotence(bvid: str):
    """
    Feature: bilibili-analyzer, Property 2: BV ID Extraction Round-Trip
    Validates: Requirements 1.3
    
    *For any* valid BV ID, normalizing a URL twice SHALL produce the same result.
    Normalization is idempotent: normalize(normalize(url)) == normalize(url)
    """
    url = URLParser.construct_url(bvid)
    
    # First normalization
    normalized_once = URLParser.normalize_url(url)
    
    # Second normalization
    normalized_twice = URLParser.normalize_url(normalized_once)
    
    # Should be identical
    assert normalized_once == normalized_twice, \
        f"Normalization should be idempotent: {normalized_once} != {normalized_twice}"


# ============================================================================
# Additional Edge Case Properties
# ============================================================================

@settings(max_examples=100)
@given(bvid=valid_bvid_strategy())
def test_bvid_validation_consistency(bvid: str):
    """
    Feature: bilibili-analyzer, Property 1: URL Validation Correctness
    Validates: Requirements 1.1, 1.2
    
    *For any* valid BV ID, is_valid_bvid() SHALL return True,
    and the BV ID SHALL be extractable from a constructed URL.
    """
    # BV ID should be valid
    assert URLParser.is_valid_bvid(bvid) is True, f"Valid BV ID should pass validation: {bvid}"
    
    # Should be extractable from constructed URL
    url = URLParser.construct_url(bvid)
    extracted = URLParser.extract_bvid(url)
    assert extracted == bvid, f"Extracted BV ID should match: {bvid} != {extracted}"


@settings(max_examples=100)
@given(invalid_bvid=st.text(min_size=0, max_size=20).filter(
    lambda x: not (x.startswith("BV") and len(x) == 12 and all(c in BVID_CHARS for c in x[2:]))
))
def test_invalid_bvid_rejection(invalid_bvid: str):
    """
    Feature: bilibili-analyzer, Property 1: URL Validation Correctness
    Validates: Requirements 1.2
    
    *For any* string that is not a valid BV ID format,
    is_valid_bvid() SHALL return False.
    """
    assert URLParser.is_valid_bvid(invalid_bvid) is False, \
        f"Invalid BV ID should be rejected: {invalid_bvid}"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
