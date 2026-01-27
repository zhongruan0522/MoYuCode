#!/usr/bin/env python3
"""
Bilibili Video Analyzer - Metadata Fetcher Tests
元数据获取模块单元测试

Requirements: 1.4
"""

import pytest
from unittest.mock import Mock, patch, MagicMock
import requests

from .metadata_fetcher import MetadataFetcher
from .models import VideoMetadata
from .exceptions import MetadataFetchError


class TestMetadataFetcherInit:
    """测试MetadataFetcher初始化"""
    
    def test_default_values(self):
        """测试默认配置值"""
        fetcher = MetadataFetcher()
        assert fetcher.timeout == 10
        assert fetcher.max_retries == 3
        assert fetcher.retry_delay == 1.0
    
    def test_custom_values(self):
        """测试自定义配置值"""
        fetcher = MetadataFetcher(timeout=5, max_retries=5, retry_delay=2.0)
        assert fetcher.timeout == 5
        assert fetcher.max_retries == 5
        assert fetcher.retry_delay == 2.0


class TestParseResponse:
    """测试API响应解析"""
    
    def test_parse_valid_response(self):
        """测试解析有效的API响应"""
        fetcher = MetadataFetcher()
        
        response = {
            "code": 0,
            "data": {
                "bvid": "BV1xx411c7mD",
                "title": "测试视频标题",
                "desc": "这是视频描述",
                "duration": 300,
                "pic": "https://example.com/cover.jpg",
                "pubdate": 1609459200,
                "owner": {
                    "mid": 12345,
                    "name": "测试UP主"
                },
                "stat": {
                    "view": 10000,
                    "like": 500
                }
            }
        }
        
        metadata = fetcher._parse_response(response, "BV1xx411c7mD")
        
        assert isinstance(metadata, VideoMetadata)
        assert metadata.bvid == "BV1xx411c7mD"
        assert metadata.title == "测试视频标题"
        assert metadata.description == "这是视频描述"
        assert metadata.duration == 300
        assert metadata.author == "测试UP主"
        assert metadata.author_id == "12345"
        assert metadata.cover_url == "https://example.com/cover.jpg"
        assert metadata.view_count == 10000
        assert metadata.like_count == 500
        assert metadata.publish_time == "2021-01-01 08:00:00"
    
    def test_parse_response_with_missing_optional_fields(self):
        """测试解析缺少可选字段的响应"""
        fetcher = MetadataFetcher()
        
        response = {
            "code": 0,
            "data": {
                "bvid": "BV1xx411c7mD",
                "title": "测试视频",
                "desc": "",
                "duration": 60,
                "pic": "",
                "pubdate": 0,
                "owner": {
                    "mid": 0,
                    "name": ""
                },
                "stat": {}
            }
        }
        
        metadata = fetcher._parse_response(response, "BV1xx411c7mD")
        
        assert metadata.bvid == "BV1xx411c7mD"
        assert metadata.title == "测试视频"
        assert metadata.description == ""
        assert metadata.view_count == 0
        assert metadata.like_count == 0
        assert metadata.publish_time == ""
    
    def test_parse_empty_data_raises_error(self):
        """测试空数据抛出异常"""
        fetcher = MetadataFetcher()
        
        response = {"code": 0, "data": {}}
        
        with pytest.raises(MetadataFetchError) as exc_info:
            fetcher._parse_response(response, "BV1xx411c7mD")
        
        assert "API返回数据为空" in str(exc_info.value)
    
    def test_parse_response_missing_data_key(self):
        """测试缺少data字段的响应"""
        fetcher = MetadataFetcher()
        
        response = {"code": 0}
        
        with pytest.raises(MetadataFetchError) as exc_info:
            fetcher._parse_response(response, "BV1xx411c7mD")
        
        assert "API返回数据为空" in str(exc_info.value)


class TestHandleApiError:
    """测试API错误处理"""
    
    def test_video_not_found_error(self):
        """测试视频不存在错误"""
        fetcher = MetadataFetcher()
        
        with pytest.raises(MetadataFetchError) as exc_info:
            fetcher._handle_api_error(-404, "啥都木有", "BV1xx411c7mD")
        
        assert "视频不存在" in str(exc_info.value)
        assert exc_info.value.bvid == "BV1xx411c7mD"
    
    def test_video_invisible_error(self):
        """测试视频不可见错误"""
        fetcher = MetadataFetcher()
        
        with pytest.raises(MetadataFetchError) as exc_info:
            fetcher._handle_api_error(62002, "视频不可见", "BV1xx411c7mD")
        
        assert "视频不可见" in str(exc_info.value)
    
    def test_permission_denied_error(self):
        """测试权限不足错误"""
        fetcher = MetadataFetcher()
        
        with pytest.raises(MetadataFetchError) as exc_info:
            fetcher._handle_api_error(-403, "权限不足", "BV1xx411c7mD")
        
        assert "访问权限不足" in str(exc_info.value)
    
    def test_unknown_error_code(self):
        """测试未知错误码"""
        fetcher = MetadataFetcher()
        
        with pytest.raises(MetadataFetchError) as exc_info:
            fetcher._handle_api_error(-999, "未知错误", "BV1xx411c7mD")
        
        assert "API错误 (-999)" in str(exc_info.value)


class TestFormatTimestamp:
    """测试时间戳格式化"""
    
    def test_valid_timestamp(self):
        """测试有效时间戳"""
        result = MetadataFetcher._format_timestamp(1609459200)
        assert result == "2021-01-01 08:00:00"
    
    def test_zero_timestamp(self):
        """测试零时间戳"""
        result = MetadataFetcher._format_timestamp(0)
        assert result == ""
    
    def test_none_timestamp(self):
        """测试None时间戳"""
        result = MetadataFetcher._format_timestamp(None)
        assert result == ""


class TestFetchWithMock:
    """使用Mock测试fetch方法"""
    
    @patch.object(MetadataFetcher, '_make_request')
    def test_fetch_success(self, mock_request):
        """测试成功获取元数据"""
        mock_request.return_value = {
            "code": 0,
            "data": {
                "bvid": "BV1xx411c7mD",
                "title": "测试视频",
                "desc": "描述",
                "duration": 120,
                "pic": "https://example.com/pic.jpg",
                "pubdate": 1609459200,
                "owner": {"mid": 123, "name": "UP主"},
                "stat": {"view": 1000, "like": 100}
            }
        }
        
        fetcher = MetadataFetcher()
        metadata = fetcher.fetch("BV1xx411c7mD")
        
        assert metadata.bvid == "BV1xx411c7mD"
        assert metadata.title == "测试视频"
        mock_request.assert_called_once_with("BV1xx411c7mD")
    
    @patch.object(MetadataFetcher, '_make_request')
    def test_fetch_adds_bv_prefix(self, mock_request):
        """测试自动添加BV前缀"""
        mock_request.return_value = {
            "code": 0,
            "data": {
                "bvid": "BV1xx411c7mD",
                "title": "测试",
                "desc": "",
                "duration": 60,
                "pic": "",
                "pubdate": 0,
                "owner": {"mid": 0, "name": ""},
                "stat": {}
            }
        }
        
        fetcher = MetadataFetcher()
        fetcher.fetch("1xx411c7mD")  # 不带BV前缀
        
        mock_request.assert_called_once_with("BV1xx411c7mD")
    
    def test_fetch_empty_bvid_raises_error(self):
        """测试空BV号抛出异常"""
        fetcher = MetadataFetcher()
        
        with pytest.raises(MetadataFetchError) as exc_info:
            fetcher.fetch("")
        
        assert "BV号不能为空" in str(exc_info.value)
    
    @patch.object(MetadataFetcher, '_make_request')
    def test_fetch_retries_on_network_error(self, mock_request):
        """测试网络错误时重试"""
        mock_request.side_effect = [
            requests.RequestException("网络错误"),
            requests.RequestException("网络错误"),
            {
                "code": 0,
                "data": {
                    "bvid": "BV1xx411c7mD",
                    "title": "测试",
                    "desc": "",
                    "duration": 60,
                    "pic": "",
                    "pubdate": 0,
                    "owner": {"mid": 0, "name": ""},
                    "stat": {}
                }
            }
        ]
        
        fetcher = MetadataFetcher(retry_delay=0.01)  # 快速重试
        metadata = fetcher.fetch("BV1xx411c7mD")
        
        assert metadata.bvid == "BV1xx411c7mD"
        assert mock_request.call_count == 3
    
    @patch.object(MetadataFetcher, '_make_request')
    def test_fetch_fails_after_max_retries(self, mock_request):
        """测试达到最大重试次数后失败"""
        mock_request.side_effect = requests.RequestException("网络错误")
        
        fetcher = MetadataFetcher(max_retries=3, retry_delay=0.01)
        
        with pytest.raises(MetadataFetchError) as exc_info:
            fetcher.fetch("BV1xx411c7mD")
        
        assert "已重试3次" in str(exc_info.value)
        assert mock_request.call_count == 3


class TestContextManager:
    """测试上下文管理器"""
    
    def test_context_manager_closes_session(self):
        """测试上下文管理器关闭会话"""
        with MetadataFetcher() as fetcher:
            # 触发session创建
            _ = fetcher.session
            assert fetcher._session is not None
        
        # 退出后session应该被关闭
        assert fetcher._session is None
    
    def test_close_without_session(self):
        """测试关闭未创建session的fetcher"""
        fetcher = MetadataFetcher()
        fetcher.close()  # 不应该抛出异常
        assert fetcher._session is None
