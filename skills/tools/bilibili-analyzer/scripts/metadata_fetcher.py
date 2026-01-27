#!/usr/bin/env python3
"""
Bilibili Video Analyzer - Metadata Fetcher
元数据获取模块 - 通过BV号获取视频信息

Requirements: 1.4
"""

import time
import logging
from typing import Optional
from datetime import datetime

import requests

from .models import VideoMetadata
from .exceptions import MetadataFetchError

logger = logging.getLogger(__name__)


class MetadataFetcher:
    """视频元数据获取器
    
    通过B站API获取视频的元数据信息，包括标题、作者、时长等。
    
    Attributes:
        timeout: API请求超时时间（秒）
        max_retries: 最大重试次数
        retry_delay: 重试间隔（秒）
    """
    
    # B站视频信息API
    API_URL = "https://api.bilibili.com/x/web-interface/view"
    
    # 默认请求头，模拟浏览器访问
    DEFAULT_HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": "https://www.bilibili.com",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    }
    
    def __init__(
        self,
        timeout: int = 10,
        max_retries: int = 3,
        retry_delay: float = 1.0
    ):
        """初始化元数据获取器
        
        Args:
            timeout: API请求超时时间（秒），默认10秒
            max_retries: 最大重试次数，默认3次
            retry_delay: 重试间隔（秒），默认1秒
        """
        self.timeout = timeout
        self.max_retries = max_retries
        self.retry_delay = retry_delay
        self._session: Optional[requests.Session] = None
    
    @property
    def session(self) -> requests.Session:
        """获取或创建HTTP会话"""
        if self._session is None:
            self._session = requests.Session()
            self._session.headers.update(self.DEFAULT_HEADERS)
        return self._session
    
    def fetch(self, bvid: str) -> VideoMetadata:
        """通过BV号获取视频元数据
        
        Args:
            bvid: 视频的BV号（如 BV1xx411c7mD）
        
        Returns:
            VideoMetadata: 包含视频信息的数据对象
        
        Raises:
            MetadataFetchError: 当获取元数据失败时抛出
        """
        if not bvid:
            raise MetadataFetchError("BV号不能为空", bvid=bvid)
        
        # 确保bvid格式正确（以BV开头）
        if not bvid.startswith("BV"):
            bvid = f"BV{bvid}"
        
        logger.info(f"正在获取视频元数据: {bvid}")
        
        last_error: Optional[Exception] = None
        
        for attempt in range(self.max_retries):
            try:
                response = self._make_request(bvid)
                return self._parse_response(response, bvid)
            except requests.RequestException as e:
                last_error = e
                logger.warning(
                    f"获取元数据失败 (尝试 {attempt + 1}/{self.max_retries}): {e}"
                )
                if attempt < self.max_retries - 1:
                    time.sleep(self.retry_delay * (attempt + 1))
            except MetadataFetchError:
                # API返回的业务错误，不需要重试
                raise
        
        raise MetadataFetchError(
            f"获取视频元数据失败，已重试{self.max_retries}次: {last_error}",
            bvid=bvid
        )
    
    def _make_request(self, bvid: str) -> dict:
        """发送API请求
        
        Args:
            bvid: 视频BV号
        
        Returns:
            dict: API响应的JSON数据
        
        Raises:
            requests.RequestException: 网络请求失败
            MetadataFetchError: API返回错误
        """
        response = self.session.get(
            self.API_URL,
            params={"bvid": bvid},
            timeout=self.timeout
        )
        response.raise_for_status()
        
        data = response.json()
        
        # 检查API返回码
        code = data.get("code", -1)
        if code != 0:
            message = data.get("message", "未知错误")
            self._handle_api_error(code, message, bvid)
        
        return data
    
    def _handle_api_error(self, code: int, message: str, bvid: str) -> None:
        """处理API错误码
        
        Args:
            code: API错误码
            message: 错误信息
            bvid: 视频BV号
        
        Raises:
            MetadataFetchError: 根据错误码抛出相应的异常
        """
        error_messages = {
            -400: "请求参数错误",
            -403: "访问权限不足",
            -404: "视频不存在",
            62002: "视频不可见（可能已被删除或设为私有）",
            62004: "视频审核中",
        }
        
        user_message = error_messages.get(code, f"API错误 ({code}): {message}")
        raise MetadataFetchError(user_message, bvid=bvid)
    
    def _parse_response(self, response: dict, bvid: str) -> VideoMetadata:
        """解析API响应数据
        
        Args:
            response: API响应的JSON数据
            bvid: 视频BV号
        
        Returns:
            VideoMetadata: 解析后的视频元数据
        
        Raises:
            MetadataFetchError: 解析失败时抛出
        """
        try:
            data = response.get("data", {})
            
            if not data:
                raise MetadataFetchError("API返回数据为空", bvid=bvid)
            
            # 提取owner信息
            owner = data.get("owner", {})
            
            # 提取统计信息
            stat = data.get("stat", {})
            
            # 格式化发布时间
            pubdate = data.get("pubdate", 0)
            publish_time = self._format_timestamp(pubdate)
            
            return VideoMetadata(
                bvid=data.get("bvid", bvid),
                title=data.get("title", ""),
                author=owner.get("name", ""),
                author_id=str(owner.get("mid", "")),
                duration=data.get("duration", 0),
                description=data.get("desc", ""),
                cover_url=data.get("pic", ""),
                view_count=stat.get("view", 0),
                like_count=stat.get("like", 0),
                publish_time=publish_time,
            )
        except KeyError as e:
            raise MetadataFetchError(f"解析响应数据失败: 缺少字段 {e}", bvid=bvid)
        except Exception as e:
            raise MetadataFetchError(f"解析响应数据失败: {e}", bvid=bvid)
    
    @staticmethod
    def _format_timestamp(timestamp: int) -> str:
        """将Unix时间戳格式化为可读字符串
        
        Args:
            timestamp: Unix时间戳
        
        Returns:
            str: 格式化的时间字符串 (YYYY-MM-DD HH:MM:SS)
        """
        if not timestamp:
            return ""
        try:
            dt = datetime.fromtimestamp(timestamp)
            return dt.strftime("%Y-%m-%d %H:%M:%S")
        except (ValueError, OSError):
            return ""
    
    def close(self) -> None:
        """关闭HTTP会话"""
        if self._session is not None:
            self._session.close()
            self._session = None
    
    def __enter__(self) -> "MetadataFetcher":
        """支持上下文管理器"""
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        """退出时关闭会话"""
        self.close()
