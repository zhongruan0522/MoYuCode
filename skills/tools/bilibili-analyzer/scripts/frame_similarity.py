#!/usr/bin/env python3
"""
Bilibili Video Analyzer - Frame Similarity
相似帧检测与合并模块 - 使用感知哈希算法检测相似帧
"""

import os
import logging
from typing import List, Optional, Tuple
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

# 尝试导入 imagehash 和 PIL
try:
    import imagehash
    from PIL import Image
    IMAGEHASH_AVAILABLE = True
except ImportError:
    IMAGEHASH_AVAILABLE = False
    logger.warning("imagehash 或 Pillow 未安装，相似帧检测功能不可用")

# 支持相对导入和绝对导入
try:
    from .models import FrameInfo
except ImportError:
    from models import FrameInfo


@dataclass
class FrameGroup:
    """帧分组 - 表示一组相似的连续帧"""
    representative_frame: FrameInfo  # 代表帧
    start_time: float               # 起始时间（秒）
    end_time: float                 # 结束时间（秒）
    frame_count: int                # 包含的帧数
    frame_ids: List[int] = field(default_factory=list)  # 包含的帧ID列表


@dataclass
class SimilarityResult:
    """相似帧检测结果"""
    original_count: int             # 原始帧数
    merged_count: int               # 合并后帧数
    groups: List[FrameGroup]        # 帧分组列表
    reduction_ratio: float          # 缩减比例


class FrameSimilarityDetector:
    """相似帧检测器 - 使用感知哈希算法检测和合并相似帧

    Features:
    - 使用 pHash（感知哈希）计算图像相似度
    - 对连续相似帧进行分组
    - 每组只保留代表帧
    - 支持自定义相似度阈值
    """

    def __init__(self, similarity_threshold: float = 0.95,
                 hash_size: int = 16,
                 use_average_hash: bool = False):
        """初始化相似帧检测器

        Args:
            similarity_threshold: 相似度阈值（0-1），默认 0.95
            hash_size: 哈希大小，默认 16（pHash 使用）
            use_average_hash: 是否使用平均哈希（更快但精度较低）
        """
        self.similarity_threshold = similarity_threshold
        self.hash_size = hash_size
        self.use_average_hash = use_average_hash

        # 计算汉明距离阈值
        # 对于 hash_size=16，总位数为 16*16=256
        # 相似度 0.95 意味着最多 5% 的位不同
        total_bits = hash_size * hash_size
        self.max_hamming_distance = int(total_bits * (1 - similarity_threshold))

    def compute_hash(self, image_path: str) -> Optional[any]:
        """计算图像的感知哈希

        Args:
            image_path: 图像文件路径

        Returns:
            图像哈希值，失败返回 None
        """
        if not IMAGEHASH_AVAILABLE:
            return None

        try:
            with Image.open(image_path) as img:
                if self.use_average_hash:
                    return imagehash.average_hash(img, hash_size=self.hash_size)
                else:
                    return imagehash.phash(img, hash_size=self.hash_size)
        except Exception as e:
            logger.warning(f"计算图像哈希失败 {image_path}: {e}")
            return None

    def compute_similarity(self, hash1, hash2) -> float:
        """计算两个哈希值的相似度

        Args:
            hash1: 第一个哈希值
            hash2: 第二个哈希值

        Returns:
            相似度（0-1）
        """
        if hash1 is None or hash2 is None:
            return 0.0

        # 计算汉明距离
        hamming_distance = hash1 - hash2
        total_bits = self.hash_size * self.hash_size

        # 转换为相似度
        similarity = 1 - (hamming_distance / total_bits)
        return similarity

    def are_similar(self, hash1, hash2) -> bool:
        """判断两个哈希值是否相似

        Args:
            hash1: 第一个哈希值
            hash2: 第二个哈希值

        Returns:
            是否相似
        """
        if hash1 is None or hash2 is None:
            return False

        hamming_distance = hash1 - hash2
        return hamming_distance <= self.max_hamming_distance

    def detect_and_merge(self, frames: List[FrameInfo]) -> SimilarityResult:
        """检测相似帧并合并

        Args:
            frames: 帧信息列表（应按时间顺序排列）

        Returns:
            SimilarityResult: 检测和合并结果
        """
        if not frames:
            return SimilarityResult(
                original_count=0,
                merged_count=0,
                groups=[],
                reduction_ratio=0.0
            )

        if not IMAGEHASH_AVAILABLE:
            logger.warning("imagehash 不可用，跳过相似帧检测")
            # 每帧作为独立组返回
            groups = [
                FrameGroup(
                    representative_frame=frame,
                    start_time=frame.timestamp,
                    end_time=frame.timestamp,
                    frame_count=1,
                    frame_ids=[frame.frame_id]
                )
                for frame in frames
            ]
            return SimilarityResult(
                original_count=len(frames),
                merged_count=len(frames),
                groups=groups,
                reduction_ratio=0.0
            )

        logger.info(f"开始相似帧检测，共 {len(frames)} 帧，阈值: {self.similarity_threshold}")

        # 计算所有帧的哈希值
        hashes = []
        for frame in frames:
            h = self.compute_hash(frame.file_path)
            hashes.append(h)

        # 分组相似帧
        groups: List[FrameGroup] = []
        current_group_frames: List[FrameInfo] = [frames[0]]
        current_group_hashes = [hashes[0]]

        for i in range(1, len(frames)):
            # 与当前组的代表帧（第一帧）比较
            if self.are_similar(hashes[i], current_group_hashes[0]):
                # 相似，加入当前组
                current_group_frames.append(frames[i])
                current_group_hashes.append(hashes[i])
            else:
                # 不相似，保存当前组，开始新组
                group = self._create_group(current_group_frames)
                groups.append(group)

                current_group_frames = [frames[i]]
                current_group_hashes = [hashes[i]]

        # 保存最后一组
        if current_group_frames:
            group = self._create_group(current_group_frames)
            groups.append(group)

        # 计算统计信息
        original_count = len(frames)
        merged_count = len(groups)
        reduction_ratio = 1 - (merged_count / original_count) if original_count > 0 else 0

        logger.info(f"相似帧检测完成: {original_count} -> {merged_count} 帧 (缩减 {reduction_ratio:.1%})")

        return SimilarityResult(
            original_count=original_count,
            merged_count=merged_count,
            groups=groups,
            reduction_ratio=reduction_ratio
        )

    def _create_group(self, frames: List[FrameInfo]) -> FrameGroup:
        """从帧列表创建帧分组

        Args:
            frames: 帧列表

        Returns:
            FrameGroup: 帧分组
        """
        # 使用第一帧作为代表帧
        representative = frames[0]

        # 计算时间范围
        start_time = frames[0].timestamp
        end_time = frames[-1].timestamp

        return FrameGroup(
            representative_frame=representative,
            start_time=start_time,
            end_time=end_time,
            frame_count=len(frames),
            frame_ids=[f.frame_id for f in frames]
        )

    def get_representative_frames(self, frames: List[FrameInfo]) -> Tuple[List[FrameInfo], SimilarityResult]:
        """获取代表帧列表

        Args:
            frames: 原始帧列表

        Returns:
            Tuple[List[FrameInfo], SimilarityResult]: (代表帧列表, 检测结果)
        """
        result = self.detect_and_merge(frames)
        representative_frames = [group.representative_frame for group in result.groups]
        return representative_frames, result


def merge_similar_frames(frames: List[FrameInfo],
                         similarity_threshold: float = 0.95) -> Tuple[List[FrameInfo], SimilarityResult]:
    """便捷函数：合并相似帧

    Args:
        frames: 原始帧列表
        similarity_threshold: 相似度阈值

    Returns:
        Tuple[List[FrameInfo], SimilarityResult]: (去重后的帧列表, 检测结果)
    """
    detector = FrameSimilarityDetector(similarity_threshold=similarity_threshold)
    return detector.get_representative_frames(frames)
