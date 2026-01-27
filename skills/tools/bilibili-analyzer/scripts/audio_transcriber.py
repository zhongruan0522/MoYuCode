#!/usr/bin/env python3
"""
Bilibili Video Analyzer - Audio Transcriber
音频转文字模块 - 使用 Whisper 生成带时间戳的字幕
"""

import os
import json
import logging
from typing import List, Optional
from dataclasses import dataclass, field, asdict

logger = logging.getLogger(__name__)

# 尝试导入 whisper
try:
    import whisper
    WHISPER_AVAILABLE = True
    WHISPER_TYPE = "openai-whisper"
except ImportError:
    WHISPER_AVAILABLE = False
    WHISPER_TYPE = None

# 尝试导入 faster-whisper（更快的替代方案）
if not WHISPER_AVAILABLE:
    try:
        from faster_whisper import WhisperModel
        WHISPER_AVAILABLE = True
        WHISPER_TYPE = "faster-whisper"
    except ImportError:
        pass

if not WHISPER_AVAILABLE:
    logger.warning("whisper 或 faster-whisper 未安装，音频转文字功能不可用")


@dataclass
class TranscriptSegment:
    """转录片段"""
    start: float           # 开始时间（秒）
    end: float             # 结束时间（秒）
    text: str              # 文本内容
    confidence: float = 0.0  # 置信度（如果可用）


@dataclass
class TranscriptionResult:
    """转录结果"""
    success: bool
    segments: List[TranscriptSegment] = field(default_factory=list)
    full_text: str = ""
    language: str = ""
    duration: float = 0.0
    error_message: Optional[str] = None


class AudioTranscriber:
    """音频转文字器 - 使用 Whisper 模型进行语音识别

    Features:
    - 支持 openai-whisper 和 faster-whisper
    - 生成带时间戳的转录结果
    - 支持中文识别
    - 支持多种模型大小
    """

    # 可用的模型大小
    MODEL_SIZES = ["tiny", "base", "small", "medium", "large"]

    def __init__(self, model_size: str = "base", language: str = "zh",
                 device: str = "auto"):
        """初始化音频转文字器

        Args:
            model_size: 模型大小，可选 tiny/base/small/medium/large
            language: 语言代码，默认 "zh"（中文）
            device: 设备，"auto"/"cpu"/"cuda"
        """
        self.model_size = model_size if model_size in self.MODEL_SIZES else "base"
        self.language = language
        self.device = device
        self._model = None

    def _load_model(self):
        """加载 Whisper 模型"""
        if self._model is not None:
            return

        if not WHISPER_AVAILABLE:
            raise RuntimeError("Whisper 未安装，请运行: pip install openai-whisper 或 pip install faster-whisper")

        logger.info(f"加载 Whisper 模型: {self.model_size} (使用 {WHISPER_TYPE})")

        if WHISPER_TYPE == "openai-whisper":
            self._model = whisper.load_model(self.model_size)
        elif WHISPER_TYPE == "faster-whisper":
            compute_type = "float16" if self.device == "cuda" else "int8"
            device = "cuda" if self.device == "cuda" else "cpu"
            if self.device == "auto":
                device = "cuda" if self._cuda_available() else "cpu"
                compute_type = "float16" if device == "cuda" else "int8"
            self._model = WhisperModel(self.model_size, device=device, compute_type=compute_type)

        logger.info("Whisper 模型加载完成")

    @staticmethod
    def _cuda_available() -> bool:
        """检查 CUDA 是否可用"""
        try:
            import torch
            return torch.cuda.is_available()
        except ImportError:
            return False

    def transcribe(self, audio_path: str) -> TranscriptionResult:
        """转录音频文件

        Args:
            audio_path: 音频文件路径

        Returns:
            TranscriptionResult: 转录结果
        """
        if not WHISPER_AVAILABLE:
            return TranscriptionResult(
                success=False,
                error_message="Whisper 未安装"
            )

        if not os.path.exists(audio_path):
            return TranscriptionResult(
                success=False,
                error_message=f"音频文件不存在: {audio_path}"
            )

        try:
            self._load_model()

            logger.info(f"开始转录: {audio_path}")

            if WHISPER_TYPE == "openai-whisper":
                return self._transcribe_openai_whisper(audio_path)
            elif WHISPER_TYPE == "faster-whisper":
                return self._transcribe_faster_whisper(audio_path)
            else:
                return TranscriptionResult(
                    success=False,
                    error_message="未知的 Whisper 类型"
                )

        except Exception as e:
            logger.error(f"转录失败: {e}")
            return TranscriptionResult(
                success=False,
                error_message=str(e)
            )

    def _transcribe_openai_whisper(self, audio_path: str) -> TranscriptionResult:
        """使用 openai-whisper 转录"""
        result = self._model.transcribe(
            audio_path,
            language=self.language,
            verbose=False
        )

        segments = []
        for seg in result.get("segments", []):
            segments.append(TranscriptSegment(
                start=seg["start"],
                end=seg["end"],
                text=seg["text"].strip(),
                confidence=seg.get("avg_logprob", 0.0)
            ))

        return TranscriptionResult(
            success=True,
            segments=segments,
            full_text=result.get("text", "").strip(),
            language=result.get("language", self.language),
            duration=segments[-1].end if segments else 0.0
        )

    def _transcribe_faster_whisper(self, audio_path: str) -> TranscriptionResult:
        """使用 faster-whisper 转录"""
        segments_gen, info = self._model.transcribe(
            audio_path,
            language=self.language,
            beam_size=5
        )

        segments = []
        full_text_parts = []

        for seg in segments_gen:
            segments.append(TranscriptSegment(
                start=seg.start,
                end=seg.end,
                text=seg.text.strip(),
                confidence=seg.avg_logprob if hasattr(seg, 'avg_logprob') else 0.0
            ))
            full_text_parts.append(seg.text.strip())

        return TranscriptionResult(
            success=True,
            segments=segments,
            full_text=" ".join(full_text_parts),
            language=info.language if hasattr(info, 'language') else self.language,
            duration=segments[-1].end if segments else 0.0
        )

    def save_transcript(self, result: TranscriptionResult, output_path: str) -> bool:
        """保存转录结果到 JSON 文件

        Args:
            result: 转录结果
            output_path: 输出文件路径

        Returns:
            是否保存成功
        """
        try:
            data = {
                "success": result.success,
                "language": result.language,
                "duration": result.duration,
                "full_text": result.full_text,
                "segments": [asdict(seg) for seg in result.segments],
                "error_message": result.error_message
            }

            with open(output_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)

            logger.info(f"转录结果已保存: {output_path}")
            return True

        except Exception as e:
            logger.error(f"保存转录结果失败: {e}")
            return False

    @staticmethod
    def load_transcript(file_path: str) -> Optional[TranscriptionResult]:
        """从 JSON 文件加载转录结果

        Args:
            file_path: JSON 文件路径

        Returns:
            TranscriptionResult 或 None
        """
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)

            segments = [
                TranscriptSegment(**seg)
                for seg in data.get("segments", [])
            ]

            return TranscriptionResult(
                success=data.get("success", False),
                segments=segments,
                full_text=data.get("full_text", ""),
                language=data.get("language", ""),
                duration=data.get("duration", 0.0),
                error_message=data.get("error_message")
            )

        except Exception as e:
            logger.error(f"加载转录结果失败: {e}")
            return None

    def get_text_at_time(self, result: TranscriptionResult,
                         start_time: float, end_time: float) -> str:
        """获取指定时间范围内的文本

        Args:
            result: 转录结果
            start_time: 开始时间（秒）
            end_time: 结束时间（秒）

        Returns:
            该时间范围内的文本
        """
        texts = []
        for seg in result.segments:
            # 检查时间范围是否重叠
            if seg.end >= start_time and seg.start <= end_time:
                texts.append(seg.text)
        return " ".join(texts)


def transcribe_audio(audio_path: str, model_size: str = "base",
                     language: str = "zh") -> TranscriptionResult:
    """便捷函数：转录音频文件

    Args:
        audio_path: 音频文件路径
        model_size: 模型大小
        language: 语言代码

    Returns:
        TranscriptionResult: 转录结果
    """
    transcriber = AudioTranscriber(model_size=model_size, language=language)
    return transcriber.transcribe(audio_path)
