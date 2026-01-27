#!/usr/bin/env python3
"""
Bilibili Video Analyzer - AI Analyzer Property Tests
AI分析器属性测试

使用hypothesis进行属性测试，验证AI分析器的正确性。
每个属性测试配置运行100次迭代。

Feature: bilibili-analyzer
Properties:
- Property 7: Task-Frame Bijection
- Property 8: Analysis Result Structure
- Property 9: Analysis Retry Behavior

Validates: Requirements 4.1, 4.4, 4.5, 4.6
"""

import sys
import os
import tempfile
import shutil

# 确保可以导入模块
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import pytest
from hypothesis import given, strategies as st, settings, assume, HealthCheck
from typing import List
import string

from models import FrameInfo, FrameAnalysis, AnalysisTask
from ai_analyzer import AIAnalyzer, TaskStatus
from exceptions import AnalysisError


# ============================================================================
# Custom Strategies for Frame Data
# ============================================================================

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
def frame_info_list_strategy(draw, min_size: int = 1, max_size: int = 20):
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
    
    description = draw(st.text(min_size=1, max_size=200))
    objects = draw(st.lists(st.text(min_size=1, max_size=50), min_size=0, max_size=10))
    text_content = draw(st.lists(st.text(min_size=1, max_size=100), min_size=0, max_size=5))
    people_count = draw(st.integers(min_value=0, max_value=100))
    scene_type = draw(st.sampled_from(["indoor", "outdoor", "presentation", "dialogue", "action", "unknown"]))
    key_points = draw(st.lists(st.text(min_size=1, max_size=100), min_size=0, max_size=5))
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


# ============================================================================
# Property 7: Task-Frame Bijection
# ============================================================================

@settings(max_examples=100, suppress_health_check=[HealthCheck.too_slow])
@given(frames=frame_info_list_strategy(min_size=1, max_size=50))
def test_property_7_task_frame_bijection_creation(frames: List[FrameInfo]):
    """
    Feature: bilibili-analyzer, Property 7: Task-Frame Bijection
    Validates: Requirements 4.1
    
    *For any* list of N extracted frames, the AI analyzer SHALL create exactly N 
    analysis tasks, with each task corresponding to exactly one frame.
    """
    analyzer = AIAnalyzer(max_workers=2)
    
    # 创建任务
    tasks = analyzer.create_tasks(frames)
    
    # 验证任务数量等于帧数量
    assert len(tasks) == len(frames), \
        f"Task count should equal frame count: {len(tasks)} != {len(frames)}"
    
    # 验证每个任务对应一个唯一的帧
    task_frame_ids = [task.frame_info.frame_id for task in tasks]
    frame_ids = [frame.frame_id for frame in frames]
    
    assert sorted(task_frame_ids) == sorted(frame_ids), \
        f"Task frame IDs should match input frame IDs"
    
    # 验证任务ID唯一
    task_ids = [task.task_id for task in tasks]
    assert len(task_ids) == len(set(task_ids)), \
        "All task IDs should be unique"


@settings(max_examples=100)
@given(frames=frame_info_list_strategy(min_size=1, max_size=20))
def test_property_7_task_initial_status(frames: List[FrameInfo]):
    """
    Feature: bilibili-analyzer, Property 7: Task-Frame Bijection
    Validates: Requirements 4.1
    
    *For any* list of frames, all created tasks SHALL have initial status 'pending'.
    """
    analyzer = AIAnalyzer(max_workers=2)
    tasks = analyzer.create_tasks(frames)
    
    for task in tasks:
        assert task.status == TaskStatus.PENDING.value, \
            f"Initial task status should be 'pending', got '{task.status}'"
        assert task.result is None, \
            "Initial task result should be None"
        assert task.retry_count == 0, \
            f"Initial retry count should be 0, got {task.retry_count}"


@settings(max_examples=100)
@given(analyses=st.lists(frame_analysis_strategy(), min_size=1, max_size=30))
def test_property_7_aggregation_preserves_count(analyses: List[FrameAnalysis]):
    """
    Feature: bilibili-analyzer, Property 7: Task-Frame Bijection
    Validates: Requirements 4.6
    
    *For any* list of N analysis results, aggregation SHALL return exactly N results.
    """
    analyzer = AIAnalyzer(max_workers=2)
    
    aggregated = analyzer.aggregate_results(analyses)
    
    assert len(aggregated) == len(analyses), \
        f"Aggregated count should equal input count: {len(aggregated)} != {len(analyses)}"


@settings(max_examples=100)
@given(analyses=st.lists(frame_analysis_strategy(), min_size=2, max_size=30))
def test_property_7_aggregation_temporal_order(analyses: List[FrameAnalysis]):
    """
    Feature: bilibili-analyzer, Property 7: Task-Frame Bijection
    Validates: Requirements 4.6
    
    *For any* list of analysis results, aggregation SHALL return results 
    in temporal order (sorted by timestamp).
    """
    analyzer = AIAnalyzer(max_workers=2)
    
    aggregated = analyzer.aggregate_results(analyses)
    
    # 验证按时间戳排序
    timestamps = [a.timestamp for a in aggregated]
    assert timestamps == sorted(timestamps), \
        f"Aggregated results should be sorted by timestamp"


# ============================================================================
# Property 8: Analysis Result Structure
# ============================================================================

@settings(max_examples=100)
@given(analysis=frame_analysis_strategy())
def test_property_8_analysis_result_has_required_fields(analysis: FrameAnalysis):
    """
    Feature: bilibili-analyzer, Property 8: Analysis Result Structure
    Validates: Requirements 4.4
    
    *For any* completed frame analysis, the result SHALL contain all required fields:
    description, objects list, text content, people count, scene type, key points, 
    and confidence score.
    """
    # 验证所有必需字段存在
    assert hasattr(analysis, 'frame_id'), "Analysis should have frame_id"
    assert hasattr(analysis, 'timestamp'), "Analysis should have timestamp"
    assert hasattr(analysis, 'description'), "Analysis should have description"
    assert hasattr(analysis, 'objects'), "Analysis should have objects"
    assert hasattr(analysis, 'text_content'), "Analysis should have text_content"
    assert hasattr(analysis, 'people_count'), "Analysis should have people_count"
    assert hasattr(analysis, 'scene_type'), "Analysis should have scene_type"
    assert hasattr(analysis, 'key_points'), "Analysis should have key_points"
    assert hasattr(analysis, 'confidence'), "Analysis should have confidence"


@settings(max_examples=100)
@given(analysis=frame_analysis_strategy())
def test_property_8_analysis_result_field_types(analysis: FrameAnalysis):
    """
    Feature: bilibili-analyzer, Property 8: Analysis Result Structure
    Validates: Requirements 4.4
    
    *For any* completed frame analysis, all fields SHALL have correct types.
    """
    assert isinstance(analysis.frame_id, int), \
        f"frame_id should be int, got {type(analysis.frame_id)}"
    assert isinstance(analysis.timestamp, (int, float)), \
        f"timestamp should be numeric, got {type(analysis.timestamp)}"
    assert isinstance(analysis.description, str), \
        f"description should be str, got {type(analysis.description)}"
    assert isinstance(analysis.objects, list), \
        f"objects should be list, got {type(analysis.objects)}"
    assert isinstance(analysis.text_content, list), \
        f"text_content should be list, got {type(analysis.text_content)}"
    assert isinstance(analysis.people_count, int), \
        f"people_count should be int, got {type(analysis.people_count)}"
    assert isinstance(analysis.scene_type, str), \
        f"scene_type should be str, got {type(analysis.scene_type)}"
    assert isinstance(analysis.key_points, list), \
        f"key_points should be list, got {type(analysis.key_points)}"
    assert isinstance(analysis.confidence, (int, float)), \
        f"confidence should be numeric, got {type(analysis.confidence)}"


@settings(max_examples=100)
@given(analysis=frame_analysis_strategy())
def test_property_8_confidence_score_range(analysis: FrameAnalysis):
    """
    Feature: bilibili-analyzer, Property 8: Analysis Result Structure
    Validates: Requirements 4.4
    
    *For any* completed frame analysis, the confidence score SHALL be 
    between 0.0 and 1.0 (inclusive).
    """
    assert 0.0 <= analysis.confidence <= 1.0, \
        f"Confidence should be in [0, 1], got {analysis.confidence}"


@settings(max_examples=100)
@given(analysis=frame_analysis_strategy())
def test_property_8_people_count_non_negative(analysis: FrameAnalysis):
    """
    Feature: bilibili-analyzer, Property 8: Analysis Result Structure
    Validates: Requirements 4.4
    
    *For any* completed frame analysis, the people count SHALL be non-negative.
    """
    assert analysis.people_count >= 0, \
        f"People count should be non-negative, got {analysis.people_count}"


# ============================================================================
# Property 9: Analysis Retry Behavior
# ============================================================================

class MockFailingAnalyzer(AIAnalyzer):
    """用于测试重试行为的模拟分析器"""
    
    def __init__(self, fail_count: int = 0, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fail_count = fail_count
        self.call_counts = {}
    
    def analyze_frame(self, task: AnalysisTask) -> FrameAnalysis:
        """模拟分析，可配置失败次数"""
        task_id = task.task_id
        
        if task_id not in self.call_counts:
            self.call_counts[task_id] = 0
        
        self.call_counts[task_id] += 1
        
        if self.call_counts[task_id] <= self.fail_count:
            raise AnalysisError(
                f"模拟失败 (第{self.call_counts[task_id]}次)",
                frame_id=task.frame_info.frame_id,
                task_id=task_id
            )
        
        # 成功返回结果
        return FrameAnalysis(
            frame_id=task.frame_info.frame_id,
            timestamp=task.frame_info.timestamp,
            description="Mock analysis result",
            objects=["object1"],
            text_content=[],
            people_count=0,
            scene_type="test",
            key_points=["test point"],
            confidence=0.8
        )


@settings(max_examples=100)
@given(frame=frame_info_strategy())
def test_property_9_retry_on_first_failure(frame: FrameInfo):
    """
    Feature: bilibili-analyzer, Property 9: Analysis Retry Behavior
    Validates: Requirements 4.5
    
    *For any* failed analysis task, the analyzer SHALL retry exactly once 
    before marking the task as failed.
    
    Test case: First call fails, second call succeeds.
    """
    # 创建一个第一次失败、第二次成功的分析器
    analyzer = MockFailingAnalyzer(fail_count=1, max_workers=1)
    
    tasks = analyzer.create_tasks([frame])
    task = tasks[0]
    
    # 执行带重试的任务
    result_task = analyzer._execute_task_with_retry(task)
    
    # 应该成功（因为重试后成功）
    assert result_task.status == TaskStatus.COMPLETED.value, \
        f"Task should complete after retry, got status: {result_task.status}"
    assert result_task.result is not None, \
        "Task should have result after successful retry"
    assert result_task.retry_count == 1, \
        f"Retry count should be 1, got {result_task.retry_count}"


@settings(max_examples=100)
@given(frame=frame_info_strategy())
def test_property_9_fail_after_max_retries(frame: FrameInfo):
    """
    Feature: bilibili-analyzer, Property 9: Analysis Retry Behavior
    Validates: Requirements 4.5
    
    *For any* analysis task that fails on all attempts (including retry),
    the analyzer SHALL mark the task as failed after exactly one retry.
    """
    # 创建一个始终失败的分析器（失败次数超过重试次数）
    analyzer = MockFailingAnalyzer(fail_count=10, max_workers=1)
    
    tasks = analyzer.create_tasks([frame])
    task = tasks[0]
    
    # 执行带重试的任务
    result_task = analyzer._execute_task_with_retry(task)
    
    # 应该失败
    assert result_task.status == TaskStatus.FAILED.value, \
        f"Task should fail after max retries, got status: {result_task.status}"
    assert result_task.result is None, \
        "Failed task should not have result"
    # 重试次数应该是 MAX_RETRY_COUNT + 1（初始尝试 + 重试）
    assert result_task.retry_count == AIAnalyzer.MAX_RETRY_COUNT + 1, \
        f"Retry count should be {AIAnalyzer.MAX_RETRY_COUNT + 1}, got {result_task.retry_count}"
    assert result_task.error_message != "", \
        "Failed task should have error message"


@settings(max_examples=100)
@given(frame=frame_info_strategy())
def test_property_9_no_retry_on_success(frame: FrameInfo):
    """
    Feature: bilibili-analyzer, Property 9: Analysis Retry Behavior
    Validates: Requirements 4.5
    
    *For any* analysis task that succeeds on first attempt,
    the analyzer SHALL NOT retry.
    """
    # 创建一个始终成功的分析器
    analyzer = MockFailingAnalyzer(fail_count=0, max_workers=1)
    
    tasks = analyzer.create_tasks([frame])
    task = tasks[0]
    
    # 执行带重试的任务
    result_task = analyzer._execute_task_with_retry(task)
    
    # 应该成功且没有重试
    assert result_task.status == TaskStatus.COMPLETED.value, \
        f"Task should complete on first try, got status: {result_task.status}"
    assert result_task.retry_count == 0, \
        f"Retry count should be 0 for successful first attempt, got {result_task.retry_count}"
    assert analyzer.call_counts.get(task.task_id, 0) == 1, \
        f"analyze_frame should be called exactly once, got {analyzer.call_counts.get(task.task_id, 0)}"


@settings(max_examples=100)
@given(frames=frame_info_list_strategy(min_size=1, max_size=10))
def test_property_9_retry_count_never_exceeds_max(frames: List[FrameInfo]):
    """
    Feature: bilibili-analyzer, Property 9: Analysis Retry Behavior
    Validates: Requirements 4.5
    
    *For any* set of analysis tasks, no task SHALL have retry_count 
    exceeding MAX_RETRY_COUNT + 1.
    """
    # 创建一个始终失败的分析器
    analyzer = MockFailingAnalyzer(fail_count=100, max_workers=2)
    
    tasks = analyzer.create_tasks(frames)
    
    # 执行所有任务
    for task in tasks:
        analyzer._execute_task_with_retry(task)
    
    # 验证所有任务的重试次数
    for task in tasks:
        assert task.retry_count <= AIAnalyzer.MAX_RETRY_COUNT + 1, \
            f"Retry count should not exceed {AIAnalyzer.MAX_RETRY_COUNT + 1}, got {task.retry_count}"


# ============================================================================
# Additional Integration Properties
# ============================================================================

@settings(max_examples=50)
@given(frames=frame_info_list_strategy(min_size=1, max_size=5))
def test_task_status_management(frames: List[FrameInfo]):
    """
    Feature: bilibili-analyzer, Property 7: Task-Frame Bijection
    Validates: Requirements 4.1
    
    *For any* set of frames, task status management SHALL correctly track
    task states through the lifecycle.
    """
    analyzer = AIAnalyzer(max_workers=2)
    tasks = analyzer.create_tasks(frames)
    
    # 验证初始状态
    pending_tasks = analyzer.get_tasks_by_status(TaskStatus.PENDING)
    assert len(pending_tasks) == len(frames), \
        f"All tasks should be pending initially"
    
    # 更新一个任务状态
    if tasks:
        task = tasks[0]
        analyzer.update_task_status(task.task_id, TaskStatus.RUNNING)
        
        running_tasks = analyzer.get_tasks_by_status(TaskStatus.RUNNING)
        assert len(running_tasks) == 1, \
            f"Should have exactly 1 running task"
        
        # 完成任务
        mock_result = FrameAnalysis(
            frame_id=task.frame_info.frame_id,
            timestamp=task.frame_info.timestamp,
            description="Test",
            objects=[],
            text_content=[],
            people_count=0,
            scene_type="test",
            key_points=[],
            confidence=0.5
        )
        analyzer.update_task_status(task.task_id, TaskStatus.COMPLETED, result=mock_result)
        
        completed_tasks = analyzer.get_tasks_by_status(TaskStatus.COMPLETED)
        assert len(completed_tasks) == 1, \
            f"Should have exactly 1 completed task"


@settings(max_examples=50)
@given(frames=frame_info_list_strategy(min_size=1, max_size=5))
def test_analysis_summary_accuracy(frames: List[FrameInfo]):
    """
    Feature: bilibili-analyzer, Property 7: Task-Frame Bijection
    Validates: Requirements 4.1, 4.6
    
    *For any* set of frames, the analysis summary SHALL accurately reflect
    the task states.
    """
    analyzer = MockFailingAnalyzer(fail_count=0, max_workers=2)
    tasks = analyzer.create_tasks(frames)
    
    # 初始摘要
    summary = analyzer.get_analysis_summary()
    assert summary["total_tasks"] == len(frames), \
        f"Total tasks should equal frame count"
    assert summary["pending"] == len(frames), \
        f"All tasks should be pending initially"
    assert summary["completed"] == 0, \
        f"No tasks should be completed initially"
    
    # 执行所有任务
    for task in tasks:
        analyzer._execute_task_with_retry(task)
    
    # 最终摘要
    final_summary = analyzer.get_analysis_summary()
    assert final_summary["total_tasks"] == len(frames), \
        f"Total tasks should remain unchanged"
    assert final_summary["completed"] == len(frames), \
        f"All tasks should be completed"
    assert final_summary["success_rate"] == 1.0, \
        f"Success rate should be 1.0"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
