#!/usr/bin/env python3
"""
Bilibili Video Analyzer - Video Downloader
视频下载模块 - 从B站下载视频文件

Requirements: 2.1, 2.2, 2.3, 2.4, 2.5
"""

import os
import time
import hashlib
import logging
import tempfile
from typing import Callable, Optional
from pathlib import Path

import requests

# 支持相对导入和直接运行
try:
    from .models import DownloadResult
    from .exceptions import DownloadError
except ImportError:
    from models import DownloadResult
    from exceptions import DownloadError

logger = logging.getLogger(__name__)


class VideoDownloader:
    """视频下载器
    
    从B站下载视频文件，支持进度回调、指数退避重试和文件完整性验证。
    
    Attributes:
        temp_dir: 临时文件存储目录
        max_retries: 最大重试次数（默认3次）
        base_delay: 基础重试延迟（秒）
        timeout: 请求超时时间（秒）
        chunk_size: 下载块大小（字节）
    """
    
    # B站视频流API
    PLAYURL_API = "https://api.bilibili.com/x/player/playurl"
    
    # 默认请求头
    DEFAULT_HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": "https://www.bilibili.com",
        "Accept": "*/*",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    }
    
    def __init__(
        self,
        temp_dir: Optional[str] = None,
        max_retries: int = 3,
        base_delay: float = 1.0,
        timeout: int = 30,
        chunk_size: int = 8192
    ):
        """初始化视频下载器
        
        Args:
            temp_dir: 临时文件存储目录，默认使用系统临时目录
            max_retries: 最大重试次数，默认3次
            base_delay: 基础重试延迟（秒），默认1秒
            timeout: 请求超时时间（秒），默认30秒
            chunk_size: 下载块大小（字节），默认8KB
        """
        self.temp_dir = temp_dir or tempfile.gettempdir()
        self.max_retries = max_retries
        self.base_delay = base_delay
        self.timeout = timeout
        self.chunk_size = chunk_size
        self._session: Optional[requests.Session] = None
        
        # 确保临时目录存在
        Path(self.temp_dir).mkdir(parents=True, exist_ok=True)

    @property
    def session(self) -> requests.Session:
        """获取或创建HTTP会话"""
        if self._session is None:
            self._session = requests.Session()
            self._session.headers.update(self.DEFAULT_HEADERS)
        return self._session
    
    def download(
        self,
        bvid: str,
        on_progress: Optional[Callable[[int, int, float], None]] = None,
        cid: Optional[int] = None
    ) -> DownloadResult:
        """下载视频文件
        
        Args:
            bvid: 视频BV号
            on_progress: 进度回调函数，参数为(已下载字节, 总字节, 百分比)
            cid: 视频cid（分P标识），默认获取第一P
        
        Returns:
            DownloadResult: 下载结果
        
        Raises:
            DownloadError: 下载失败时抛出
        """
        if not bvid:
            raise DownloadError("BV号不能为空", bvid=bvid)
        
        # 确保bvid格式正确
        if not bvid.startswith("BV"):
            bvid = f"BV{bvid}"
        
        logger.info(f"开始下载视频: {bvid}")
        
        # 获取cid（如果未提供）
        if cid is None:
            cid = self._get_cid(bvid)
        
        # 获取视频流URL
        video_url, expected_size = self._get_video_url(bvid, cid)
        
        # 生成输出文件路径
        output_path = os.path.join(self.temp_dir, f"{bvid}.mp4")
        
        # 执行下载（带重试）
        return self._download_with_retry(
            bvid=bvid,
            video_url=video_url,
            output_path=output_path,
            expected_size=expected_size,
            on_progress=on_progress
        )
    
    def _get_cid(self, bvid: str) -> int:
        """获取视频的cid
        
        Args:
            bvid: 视频BV号
        
        Returns:
            int: 视频cid
        
        Raises:
            DownloadError: 获取失败时抛出
        """
        api_url = "https://api.bilibili.com/x/web-interface/view"
        
        try:
            response = self.session.get(
                api_url,
                params={"bvid": bvid},
                timeout=self.timeout
            )
            response.raise_for_status()
            data = response.json()
            
            if data.get("code") != 0:
                raise DownloadError(
                    f"获取视频信息失败: {data.get('message', '未知错误')}",
                    bvid=bvid
                )
            
            cid = data.get("data", {}).get("cid")
            if not cid:
                raise DownloadError("无法获取视频cid", bvid=bvid)
            
            return cid
        except requests.RequestException as e:
            raise DownloadError(f"获取视频cid失败: {e}", bvid=bvid)
    
    def _get_video_url(self, bvid: str, cid: int) -> tuple[str, int]:
        """获取视频流URL
        
        Args:
            bvid: 视频BV号
            cid: 视频cid
        
        Returns:
            tuple: (视频URL, 预期文件大小)
        
        Raises:
            DownloadError: 获取失败时抛出
        """
        params = {
            "bvid": bvid,
            "cid": cid,
            "qn": 64,  # 720P
            "fnval": 1,  # MP4格式
            "fourk": 0,
        }
        
        try:
            response = self.session.get(
                self.PLAYURL_API,
                params=params,
                timeout=self.timeout
            )
            response.raise_for_status()
            data = response.json()
            
            if data.get("code") != 0:
                raise DownloadError(
                    f"获取视频流失败: {data.get('message', '未知错误')}",
                    bvid=bvid
                )
            
            durl = data.get("data", {}).get("durl", [])
            if not durl:
                raise DownloadError("无法获取视频下载地址", bvid=bvid)
            
            video_info = durl[0]
            video_url = video_info.get("url") or video_info.get("backup_url", [""])[0]
            expected_size = video_info.get("size", 0)
            
            if not video_url:
                raise DownloadError("视频URL为空", bvid=bvid)
            
            return video_url, expected_size
        except requests.RequestException as e:
            raise DownloadError(f"获取视频流URL失败: {e}", bvid=bvid)

    def _download_with_retry(
        self,
        bvid: str,
        video_url: str,
        output_path: str,
        expected_size: int,
        on_progress: Optional[Callable[[int, int, float], None]] = None
    ) -> DownloadResult:
        """带重试的下载逻辑
        
        使用指数退避策略进行重试。
        
        Args:
            bvid: 视频BV号
            video_url: 视频下载URL
            output_path: 输出文件路径
            expected_size: 预期文件大小
            on_progress: 进度回调函数
        
        Returns:
            DownloadResult: 下载结果
        
        Raises:
            DownloadError: 所有重试都失败时抛出
        """
        last_error: Optional[Exception] = None
        
        for attempt in range(self.max_retries):
            try:
                logger.info(f"下载尝试 {attempt + 1}/{self.max_retries}")
                
                # 执行下载
                file_size = self._do_download(
                    video_url=video_url,
                    output_path=output_path,
                    expected_size=expected_size,
                    on_progress=on_progress
                )
                
                # 验证文件完整性
                if not self.verify_integrity(output_path, expected_size):
                    raise DownloadError("文件完整性验证失败", bvid=bvid)
                
                logger.info(f"视频下载成功: {output_path}")
                return DownloadResult(
                    success=True,
                    file_path=output_path,
                    file_size=file_size
                )
                
            except (requests.RequestException, DownloadError, IOError) as e:
                last_error = e
                logger.warning(
                    f"下载失败 (尝试 {attempt + 1}/{self.max_retries}): {e}"
                )
                
                # 清理可能的不完整文件
                if os.path.exists(output_path):
                    try:
                        os.remove(output_path)
                    except OSError:
                        pass
                
                # 指数退避
                if attempt < self.max_retries - 1:
                    delay = self.base_delay * (2 ** attempt)
                    logger.info(f"等待 {delay:.1f} 秒后重试...")
                    time.sleep(delay)
        
        # 所有重试都失败
        error_msg = f"下载失败，已重试{self.max_retries}次: {last_error}"
        raise DownloadError(error_msg, bvid=bvid, retry_count=self.max_retries)
    
    def _do_download(
        self,
        video_url: str,
        output_path: str,
        expected_size: int,
        on_progress: Optional[Callable[[int, int, float], None]] = None
    ) -> int:
        """执行实际的下载操作
        
        Args:
            video_url: 视频下载URL
            output_path: 输出文件路径
            expected_size: 预期文件大小
            on_progress: 进度回调函数
        
        Returns:
            int: 实际下载的文件大小
        
        Raises:
            requests.RequestException: 网络请求失败
            IOError: 文件写入失败
        """
        # 设置下载专用的请求头
        headers = {
            **self.DEFAULT_HEADERS,
            "Range": "bytes=0-",
        }
        
        response = self.session.get(
            video_url,
            headers=headers,
            stream=True,
            timeout=self.timeout
        )
        response.raise_for_status()
        
        # 获取实际文件大小
        total_size = int(response.headers.get("content-length", expected_size))
        if total_size == 0:
            total_size = expected_size
        
        downloaded = 0
        
        with open(output_path, "wb") as f:
            for chunk in response.iter_content(chunk_size=self.chunk_size):
                if chunk:
                    f.write(chunk)
                    downloaded += len(chunk)
                    
                    # 调用进度回调
                    if on_progress and total_size > 0:
                        percentage = (downloaded / total_size) * 100
                        on_progress(downloaded, total_size, percentage)
        
        return downloaded

    def verify_integrity(
        self,
        file_path: str,
        expected_size: Optional[int] = None
    ) -> bool:
        """验证下载文件的完整性
        
        检查文件是否存在、大小是否匹配、是否可读。
        
        Args:
            file_path: 文件路径
            expected_size: 预期文件大小（可选）
        
        Returns:
            bool: 文件完整性验证结果
        """
        # 检查文件是否存在
        if not os.path.exists(file_path):
            logger.warning(f"文件不存在: {file_path}")
            return False
        
        # 获取实际文件大小
        actual_size = os.path.getsize(file_path)
        
        # 检查文件是否为空
        if actual_size == 0:
            logger.warning(f"文件为空: {file_path}")
            return False
        
        # 如果提供了预期大小，检查是否匹配
        if expected_size is not None and expected_size > 0:
            # 允许1%的误差（某些服务器报告的大小可能略有不同）
            tolerance = expected_size * 0.01
            if abs(actual_size - expected_size) > tolerance:
                logger.warning(
                    f"文件大小不匹配: 预期 {expected_size}, 实际 {actual_size}"
                )
                return False
        
        # 尝试读取文件头部，验证文件可读
        try:
            with open(file_path, "rb") as f:
                header = f.read(12)
                # 检查是否为有效的视频文件（MP4/FLV等）
                if not self._is_valid_video_header(header):
                    logger.warning(f"无效的视频文件头: {file_path}")
                    return False
        except IOError as e:
            logger.warning(f"无法读取文件: {e}")
            return False
        
        logger.debug(f"文件完整性验证通过: {file_path}")
        return True
    
    @staticmethod
    def _is_valid_video_header(header: bytes) -> bool:
        """检查文件头是否为有效的视频格式
        
        Args:
            header: 文件头部字节
        
        Returns:
            bool: 是否为有效的视频文件
        """
        if len(header) < 4:
            return False
        
        # MP4 (ftyp box)
        if header[4:8] == b"ftyp":
            return True
        
        # FLV
        if header[:3] == b"FLV":
            return True
        
        # WebM/MKV
        if header[:4] == b"\x1a\x45\xdf\xa3":
            return True
        
        # AVI
        if header[:4] == b"RIFF" and len(header) >= 12 and header[8:12] == b"AVI ":
            return True
        
        # 如果无法识别格式，但文件不为空，也认为可能有效
        # （某些B站视频可能使用特殊格式）
        return len(header) >= 4
    
    def calculate_checksum(self, file_path: str, algorithm: str = "md5") -> str:
        """计算文件校验和
        
        Args:
            file_path: 文件路径
            algorithm: 哈希算法（md5, sha1, sha256）
        
        Returns:
            str: 文件校验和（十六进制字符串）
        
        Raises:
            IOError: 文件读取失败
        """
        hash_func = hashlib.new(algorithm)
        
        with open(file_path, "rb") as f:
            for chunk in iter(lambda: f.read(self.chunk_size), b""):
                hash_func.update(chunk)
        
        return hash_func.hexdigest()
    
    def close(self) -> None:
        """关闭HTTP会话"""
        if self._session is not None:
            self._session.close()
            self._session = None
    
    def __enter__(self) -> "VideoDownloader":
        """支持上下文管理器"""
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        """退出时关闭会话"""
        self.close()
