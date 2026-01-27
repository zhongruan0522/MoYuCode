# Implementation Plan: Bilibili Video Analyzer

## Overview

本实现计划将Bilibili视频分析器设计转化为可执行的编码任务。采用增量开发方式，从核心模块开始，逐步构建完整功能。使用Python作为实现语言，pytest + hypothesis作为测试框架。

## Tasks

- [x] 1. 项目初始化和基础结构
  - [x] 1.1 创建skill目录结构和SKILL.md文件
    - 创建 `skills/tools/bilibili-analyzer/` 目录
    - 创建 `skills/tools/bilibili-analyzer/scripts/` 目录
    - 编写 SKILL.md 文档，包含使用说明和依赖
    - _Requirements: 全部_
  - [x] 1.2 创建核心数据模型和配置类
    - 实现 `VideoMetadata`, `FrameInfo`, `FrameAnalysis` 数据类
    - 实现 `AnalyzerConfig`, `VideoReport` 配置类
    - 实现自定义异常类层次结构
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 7.1_

- [x] 2. URL解析模块
  - [x] 2.1 实现URLParser类
    - 实现 `validate()` 方法验证B站URL格式
    - 实现 `extract_bvid()` 方法提取BV号
    - 实现 `normalize_url()` 方法处理短链接
    - 支持 `bilibili.com/video/BV*` 和 `b23.tv/*` 格式
    - _Requirements: 1.1, 1.2, 1.3_
  - [x] 2.2 编写URL解析属性测试
    - **Property 1: URL Validation Correctness**
    - **Property 2: BV ID Extraction Round-Trip**
    - **Validates: Requirements 1.1, 1.2, 1.3**

- [x] 3. 元数据获取模块
  - [x] 3.1 实现MetadataFetcher类
    - 实现通过BV号获取视频信息的API调用
    - 解析返回的JSON数据填充VideoMetadata
    - 处理API错误和网络异常
    - _Requirements: 1.4_
  - [x] 3.2 编写元数据获取单元测试
    - 测试API响应解析
    - 测试错误处理
    - _Requirements: 1.4_

- [x] 4. 视频下载模块
  - [x] 4.1 实现VideoDownloader类
    - 实现视频流获取和下载逻辑
    - 实现进度回调机制
    - 实现指数退避重试逻辑（最多3次）
    - 实现文件完整性验证
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_
  - [x] 4.2 编写下载模块属性测试
    - **Property 3: Download Retry Behavior**
    - **Property 4: File Integrity Verification**
    - **Validates: Requirements 2.3, 2.4, 2.5**

- [x] 5. Checkpoint - 核心下载功能验证
  - 确保URL解析、元数据获取、视频下载功能正常
  - 运行所有测试确保通过
  - 如有问题请询问用户

- [x] 6. 帧提取模块
  - [x] 6.1 实现FrameExtractor类
    - 实现ffmpeg可用性检查
    - 实现按间隔提取帧功能
    - 实现场景变化检测
    - 生成帧清单（manifest）
    - 时间戳格式化为HH:MM:SS
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_
  - [x] 6.2 编写帧提取属性测试
    - **Property 5: Frame Extraction Interval Consistency**
    - **Property 6: Frame Manifest Completeness**
    - **Validates: Requirements 3.1, 3.3, 3.4**

- [x] 7. AI分析模块
  - [x] 7.1 实现AIAnalyzer类 - 任务管理
    - 实现任务创建逻辑（每帧一个任务）
    - 实现任务状态管理
    - 实现结果按时间顺序聚合
    - _Requirements: 4.1, 4.6_
  - [x] 7.2 实现AIAnalyzer类 - 并行分析
    - 实现Claude Code调用接口
    - 实现多worker并行处理
    - 实现单次重试逻辑
    - 返回结构化分析结果
    - _Requirements: 4.2, 4.3, 4.4, 4.5_
  - [x] 7.3 编写AI分析属性测试
    - **Property 7: Task-Frame Bijection**
    - **Property 8: Analysis Result Structure**
    - **Property 9: Analysis Retry Behavior**
    - **Validates: Requirements 4.1, 4.4, 4.5, 4.6**

- [x] 8. Checkpoint - 分析流程验证
  - 确保帧提取和AI分析功能正常
  - 运行所有测试确保通过
  - 如有问题请询问用户

- [-] 9. 报告生成模块
  - [x] 9.1 实现ReportGenerator类 - 核心功能
    - 实现输出目录创建逻辑
    - 实现帧图片复制到输出目录
    - 实现Markdown报告主体生成
    - 嵌入图片使用相对路径
    - _Requirements: 5.1, 5.3, 5.4, 5.8_
  - [x] 9.2 实现ReportGenerator类 - 增强功能
    - 实现视频元数据头部生成
    - 实现执行摘要生成
    - 实现目录生成（带锚点链接）
    - 时间戳格式化为HH:MM:SS
    - _Requirements: 5.2, 5.5, 5.6, 5.7_
  - [ ] 9.3 编写报告生成属性测试
    - **Property 10: Report Content Completeness**
    - **Property 11: TOC-Section Consistency**
    - **Property 12: Output Directory Creation**
    - **Validates: Requirements 5.2, 5.3, 5.4, 5.5, 5.7, 5.8**

- [x] 10. 日志和错误处理
  - [x] 10.1 实现日志系统
    - 配置日志格式（时间戳、级别、上下文）
    - 实现日志文件输出到输出目录
    - 实现部分结果保存逻辑
    - _Requirements: 7.1, 7.2, 7.3, 7.4_
  - [x] 10.2 编写日志属性测试
    - **Property 14: Error Logging Completeness**
    - **Property 15: Partial Result Preservation**
    - **Validates: Requirements 7.1, 7.3, 7.4**

- [-] 11. 主程序和CLI集成
  - [x] 11.1 实现主入口和命令行接口
    - 实现argparse命令行参数解析
    - 集成所有模块到主工作流
    - 实现配置参数传递
    - 添加进度显示和用户提示
    - _Requirements: 6.1, 6.2, 6.3, 6.4_
  - [ ] 11.2 编写配置参数属性测试
    - **Property 13: Configuration Parameter Application**
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.4**

- [x] 12. Checkpoint - 完整功能验证
  - 运行完整工作流测试
  - 确保所有测试通过
  - 如有问题请询问用户

- [x] 13. 文档和索引更新
  - [x] 13.1 完善SKILL.md文档
    - 添加完整使用示例
    - 添加依赖安装说明
    - 添加常见问题解答
    - _Requirements: 全部_
  - [x] 13.2 更新skills/index.json
    - 添加bilibili-analyzer skill条目
    - 填写元数据和标签
    - _Requirements: 全部_

- [x] 14. Final Checkpoint - 最终验证
  - 运行所有单元测试和属性测试
  - 验证完整工作流
  - 确保文档完整
  - 如有问题请询问用户

## Notes

- 所有任务均为必做任务，包括全部测试
- 每个属性测试配置运行100次迭代
- 属性测试使用hypothesis库
- 需要预先安装ffmpeg才能运行帧提取功能
- Claude Code并行分析需要配置API访问
