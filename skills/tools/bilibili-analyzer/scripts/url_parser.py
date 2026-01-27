#!/usr/bin/env python3
"""
Bilibili Video Analyzer - URL Parser
URL解析和验证模块

Requirements: 1.1, 1.2, 1.3
"""

import re
from typing import Optional
from urllib.parse import urlparse, parse_qs

try:
    from .exceptions import URLValidationError
except ImportError:
    from exceptions import URLValidationError


class URLParser:
    """B站URL解析和验证
    
    支持的URL格式:
    - https://www.bilibili.com/video/BV1xx411c7mD
    - https://bilibili.com/video/BV1xx411c7mD
    - http://www.bilibili.com/video/BV1xx411c7mD
    - https://b23.tv/BV1xx411c7mD
    - https://b23.tv/xxxxx (短链接，需要解析)
    
    BV号格式: BV + 10个字符 (字母数字混合，区分大小写)
    """
    
    # BV号正则：BV开头 + 10个字母数字字符
    BVID_PATTERN = re.compile(r'^BV[a-zA-Z0-9]{10}$')
    
    # 标准B站视频URL正则
    BILIBILI_URL_PATTERN = re.compile(
        r'^https?://(?:www\.)?bilibili\.com/video/(BV[a-zA-Z0-9]{10})(?:[/?].*)?$'
    )
    
    # B站短链接正则
    B23_URL_PATTERN = re.compile(
        r'^https?://b23\.tv/([a-zA-Z0-9]+)(?:[/?].*)?$'
    )
    
    @classmethod
    def validate(cls, url: str) -> bool:
        """验证URL是否为有效的B站视频链接
        
        Args:
            url: 待验证的URL字符串
            
        Returns:
            bool: True表示有效，False表示无效
            
        Requirements: 1.1
        """
        if not url or not isinstance(url, str):
            return False
        
        url = url.strip()
        
        # 检查标准B站URL格式
        if cls.BILIBILI_URL_PATTERN.match(url):
            return True
        
        # 检查短链接格式
        if cls.B23_URL_PATTERN.match(url):
            return True
        
        return False
    
    @classmethod
    def extract_bvid(cls, url: str) -> str:
        """从URL中提取BV号
        
        Args:
            url: B站视频URL
            
        Returns:
            str: 提取的BV号
            
        Raises:
            URLValidationError: 当URL无效或无法提取BV号时
            
        Requirements: 1.2
        """
        if not url or not isinstance(url, str):
            raise URLValidationError(
                "URL不能为空",
                url=str(url) if url else ""
            )
        
        url = url.strip()
        
        # 尝试从标准B站URL提取
        match = cls.BILIBILI_URL_PATTERN.match(url)
        if match:
            return match.group(1)
        
        # 尝试从短链接提取
        match = cls.B23_URL_PATTERN.match(url)
        if match:
            short_code = match.group(1)
            # 如果短链接代码本身就是BV号
            if cls.BVID_PATTERN.match(short_code):
                return short_code
            # 否则这是一个需要解析的短链接
            # 短链接解析需要网络请求，这里只返回短代码
            # 实际解析在normalize_url中处理
            raise URLValidationError(
                f"短链接 '{short_code}' 需要通过normalize_url()解析获取BV号",
                url=url
            )
        
        raise URLValidationError(
            f"无法从URL中提取BV号。请提供有效的B站视频链接，格式如: "
            f"https://www.bilibili.com/video/BV1xx411c7mD 或 https://b23.tv/BV1xx411c7mD",
            url=url
        )
    
    @classmethod
    def normalize_url(cls, url: str) -> str:
        """将URL标准化为统一格式
        
        将短链接或其他格式转换为标准的B站视频URL格式:
        https://www.bilibili.com/video/BVxxxxxxxxxx
        
        Args:
            url: 原始URL
            
        Returns:
            str: 标准化后的URL
            
        Raises:
            URLValidationError: 当URL无效时
            
        Requirements: 1.3
        """
        if not url or not isinstance(url, str):
            raise URLValidationError(
                "URL不能为空",
                url=str(url) if url else ""
            )
        
        url = url.strip()
        
        # 如果已经是标准格式，直接提取BV号并重构
        match = cls.BILIBILI_URL_PATTERN.match(url)
        if match:
            bvid = match.group(1)
            return f"https://www.bilibili.com/video/{bvid}"
        
        # 处理短链接
        match = cls.B23_URL_PATTERN.match(url)
        if match:
            short_code = match.group(1)
            # 如果短代码本身就是BV号
            if cls.BVID_PATTERN.match(short_code):
                return f"https://www.bilibili.com/video/{short_code}"
            # 否则需要通过HTTP请求解析短链接
            # 这里返回一个标记，表示需要进一步解析
            return cls._resolve_short_url(url)
        
        raise URLValidationError(
            f"无效的B站视频URL格式。支持的格式: "
            f"https://www.bilibili.com/video/BV* 或 https://b23.tv/*",
            url=url
        )
    
    @classmethod
    def _resolve_short_url(cls, short_url: str) -> str:
        """解析B站短链接获取实际URL
        
        Args:
            short_url: b23.tv短链接
            
        Returns:
            str: 解析后的标准URL
            
        Raises:
            URLValidationError: 当解析失败时
        """
        try:
            import requests
            
            # 发送HEAD请求获取重定向URL
            response = requests.head(
                short_url,
                allow_redirects=True,
                timeout=10,
                headers={
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            )
            
            final_url = response.url
            
            # 验证重定向后的URL是否为有效的B站视频链接
            match = cls.BILIBILI_URL_PATTERN.match(final_url)
            if match:
                bvid = match.group(1)
                return f"https://www.bilibili.com/video/{bvid}"
            
            raise URLValidationError(
                f"短链接解析后的URL不是有效的B站视频链接: {final_url}",
                url=short_url
            )
            
        except requests.RequestException as e:
            raise URLValidationError(
                f"解析短链接失败: {str(e)}",
                url=short_url
            )
        except ImportError:
            raise URLValidationError(
                "需要安装requests库来解析短链接: pip install requests",
                url=short_url
            )
    
    @classmethod
    def is_valid_bvid(cls, bvid: str) -> bool:
        """验证BV号格式是否正确
        
        Args:
            bvid: BV号字符串
            
        Returns:
            bool: True表示格式正确
        """
        if not bvid or not isinstance(bvid, str):
            return False
        return bool(cls.BVID_PATTERN.match(bvid))
    
    @classmethod
    def construct_url(cls, bvid: str) -> str:
        """根据BV号构造标准URL
        
        Args:
            bvid: BV号
            
        Returns:
            str: 标准B站视频URL
            
        Raises:
            URLValidationError: 当BV号格式无效时
        """
        if not cls.is_valid_bvid(bvid):
            raise URLValidationError(
                f"无效的BV号格式: {bvid}。BV号应为'BV'开头加10个字母数字字符",
                url=bvid
            )
        return f"https://www.bilibili.com/video/{bvid}"
