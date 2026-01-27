#!/usr/bin/env python3
"""
X (Twitter) Report Generator Tool
使用Playwright爬取X平台真实数据，生成精美的HTML报告面板并导出为图片。

Usage:
    python x_report_generator.py search "AI" --limit 50 --output report.png
    python x_report_generator.py user "elonmusk" --output user_report.png

Requirements:
    pip install playwright
    playwright install chromium
"""

import argparse
import json
import os
import re
import sys
import time
from collections import Counter
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional, List
from dataclasses import dataclass, asdict


@dataclass
class TweetData:
    """推文数据结构"""
    id: str
    text: str
    author: str
    author_name: str
    author_avatar: str
    likes: int
    retweets: int
    replies: int
    views: int
    created_at: str
    hashtags: list
    mentions: list


@dataclass
class ReportData:
    """报告数据结构"""
    query: str
    report_type: str
    generated_at: str
    total_tweets: int
    total_likes: int
    total_retweets: int
    total_replies: int
    total_views: int
    avg_engagement: float
    top_hashtags: list
    top_authors: list
    hourly_distribution: dict
    sentiment_positive: int
    sentiment_neutral: int
    sentiment_negative: int
    top_tweets: list


class XBrowserScraper:
    """X网站浏览器爬虫"""
    
    def __init__(self, headless: bool = True, cookies_file: str = None):
        self.headless = headless
        self.cookies_file = cookies_file
        self.browser = None
        self.context = None
        self.page = None
    
    def _init_browser(self):
        """初始化浏览器"""
        from playwright.sync_api import sync_playwright
        
        self.playwright = sync_playwright().start()
        self.browser = self.playwright.chromium.launch(
            headless=self.headless,
            args=['--disable-blink-features=AutomationControlled']
        )
        
        # 创建上下文，模拟真实浏览器
        self.context = self.browser.new_context(
            viewport={"width": 1920, "height": 1080},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            locale="zh-CN"
        )
        
        # 加载cookies（如果有）
        if self.cookies_file and Path(self.cookies_file).exists():
            with open(self.cookies_file, 'r') as f:
                cookies = json.load(f)
                self.context.add_cookies(cookies)
        
        self.page = self.context.new_page()
        
        # 注入脚本绕过检测
        self.page.add_init_script("""
            Object.defineProperty(navigator, 'webdriver', {get: () => undefined});
        """)
    
    def _close_browser(self):
        """关闭浏览器"""
        if self.page:
            self.page.close()
        if self.context:
            self.context.close()
        if self.browser:
            self.browser.close()
        if hasattr(self, 'playwright'):
            self.playwright.stop()
    
    def _parse_count(self, text: str) -> int:
        """解析数字（支持K、M、B后缀）"""
        if not text:
            return 0
        text = text.strip().upper().replace(',', '')
        try:
            if 'K' in text:
                return int(float(text.replace('K', '')) * 1000)
            elif 'M' in text:
                return int(float(text.replace('M', '')) * 1000000)
            elif 'B' in text:
                return int(float(text.replace('B', '')) * 1000000000)
            elif '万' in text:
                return int(float(text.replace('万', '')) * 10000)
            elif '亿' in text:
                return int(float(text.replace('亿', '')) * 100000000)
            else:
                return int(float(text)) if text else 0
        except:
            return 0
    
    def _extract_hashtags(self, text: str) -> list:
        """提取标签"""
        return re.findall(r'#(\w+)', text)
    
    def _extract_mentions(self, text: str) -> list:
        """提取@用户"""
        return re.findall(r'@(\w+)', text)
    
    def _scroll_and_collect(self, limit: int) -> List[dict]:
        """滚动页面并收集推文数据"""
        tweets_data = []
        seen_ids = set()
        scroll_count = 0
        max_scrolls = limit // 5 + 10  # 估算需要滚动的次数
        
        while len(tweets_data) < limit and scroll_count < max_scrolls:
            # 等待推文加载
            self.page.wait_for_timeout(1500)
            
            # 获取所有推文元素
            tweet_articles = self.page.query_selector_all('article[data-testid="tweet"]')
            
            for article in tweet_articles:
                try:
                    # 获取推文唯一标识
                    tweet_link = article.query_selector('a[href*="/status/"]')
                    if not tweet_link:
                        continue
                    
                    href = tweet_link.get_attribute('href') or ''
                    tweet_id_match = re.search(r'/status/(\d+)', href)
                    if not tweet_id_match:
                        continue
                    
                    tweet_id = tweet_id_match.group(1)
                    if tweet_id in seen_ids:
                        continue
                    seen_ids.add(tweet_id)
                    
                    # 提取作者信息
                    author_elem = article.query_selector('div[data-testid="User-Name"]')
                    author = ""
                    author_name = ""
                    if author_elem:
                        # 用户名 @xxx
                        username_span = author_elem.query_selector('a[href^="/"] span')
                        if username_span:
                            author_name = username_span.inner_text().strip()
                        # handle
                        handle_links = author_elem.query_selector_all('a[href^="/"]')
                        for link in handle_links:
                            href = link.get_attribute('href') or ''
                            if href.startswith('/') and '/status/' not in href:
                                author = href.strip('/')
                                break
                    
                    # 提取头像
                    avatar_elem = article.query_selector('img[src*="profile_images"]')
                    author_avatar = avatar_elem.get_attribute('src') if avatar_elem else ""
                    
                    # 提取推文内容
                    text_elem = article.query_selector('div[data-testid="tweetText"]')
                    text = text_elem.inner_text() if text_elem else ""
                    
                    # 提取互动数据
                    reply_elem = article.query_selector('button[data-testid="reply"] span span')
                    retweet_elem = article.query_selector('button[data-testid="retweet"] span span')
                    like_elem = article.query_selector('button[data-testid="like"] span span')
                    view_elem = article.query_selector('a[href*="/analytics"] span span')
                    
                    replies = self._parse_count(reply_elem.inner_text() if reply_elem else "0")
                    retweets = self._parse_count(retweet_elem.inner_text() if retweet_elem else "0")
                    likes = self._parse_count(like_elem.inner_text() if like_elem else "0")
                    views = self._parse_count(view_elem.inner_text() if view_elem else "0")
                    
                    # 提取时间
                    time_elem = article.query_selector('time')
                    created_at = time_elem.get_attribute('datetime') if time_elem else datetime.now().isoformat()
                    
                    tweets_data.append({
                        'id': tweet_id,
                        'text': text,
                        'author': author,
                        'author_name': author_name,
                        'author_avatar': author_avatar,
                        'likes': likes,
                        'retweets': retweets,
                        'replies': replies,
                        'views': views,
                        'created_at': created_at,
                        'hashtags': self._extract_hashtags(text),
                        'mentions': self._extract_mentions(text)
                    })
                    
                    if len(tweets_data) >= limit:
                        break
                        
                except Exception as e:
                    continue
            
            # 滚动页面
            self.page.evaluate("window.scrollBy(0, 800)")
            scroll_count += 1
            
            print(f"\r📊 已收集 {len(tweets_data)}/{limit} 条推文...", end="", flush=True)
        
        print()  # 换行
        return tweets_data

    def search_tweets(self, query: str, limit: int = 50) -> List[TweetData]:
        """搜索推文"""
        try:
            self._init_browser()
            
            # 构建搜索URL
            encoded_query = query.replace(' ', '%20')
            search_url = f"https://x.com/search?q={encoded_query}&src=typed_query&f=live"
            
            print(f"🌐 正在访问: {search_url}")
            self.page.goto(search_url, wait_until="networkidle", timeout=60000)
            
            # 等待页面加载
            print("⏳ 等待页面加载...")
            self.page.wait_for_timeout(3000)
            
            # 检查是否需要登录
            if "login" in self.page.url.lower():
                print("⚠️ 需要登录才能搜索，请提供cookies文件或手动登录")
                print("提示: 使用 --save-cookies 参数保存登录状态")
                return []
            
            # 收集推文
            print(f"🔍 开始收集推文 (目标: {limit} 条)...")
            tweets_raw = self._scroll_and_collect(limit)
            
            # 转换为TweetData对象
            tweets = [TweetData(**t) for t in tweets_raw]
            
            return tweets
            
        except Exception as e:
            print(f"❌ 爬取失败: {e}")
            return []
        finally:
            self._close_browser()
    
    def get_user_tweets(self, username: str, limit: int = 50) -> List[TweetData]:
        """获取用户推文"""
        try:
            self._init_browser()
            
            # 访问用户主页
            user_url = f"https://x.com/{username}"
            
            print(f"🌐 正在访问: {user_url}")
            self.page.goto(user_url, wait_until="networkidle", timeout=60000)
            
            # 等待页面加载
            print("⏳ 等待页面加载...")
            self.page.wait_for_timeout(3000)
            
            # 检查用户是否存在
            if "这个账号不存在" in self.page.content() or "This account doesn't exist" in self.page.content():
                print(f"❌ 用户 @{username} 不存在")
                return []
            
            # 收集推文
            print(f"🔍 开始收集 @{username} 的推文 (目标: {limit} 条)...")
            tweets_raw = self._scroll_and_collect(limit)
            
            # 转换为TweetData对象
            tweets = [TweetData(**t) for t in tweets_raw]
            
            return tweets
            
        except Exception as e:
            print(f"❌ 爬取失败: {e}")
            return []
        finally:
            self._close_browser()
    
    def save_cookies(self, filepath: str):
        """保存cookies用于后续登录"""
        try:
            self._init_browser()
            
            print("🌐 正在打开X登录页面...")
            self.page.goto("https://x.com/login", wait_until="networkidle")
            
            print("👆 请在浏览器中手动登录...")
            print("   登录完成后，按回车键继续...")
            input()
            
            # 等待登录完成
            self.page.wait_for_timeout(2000)
            
            # 保存cookies
            cookies = self.context.cookies()
            with open(filepath, 'w') as f:
                json.dump(cookies, f, indent=2)
            
            print(f"✓ Cookies已保存到: {filepath}")
            
        except Exception as e:
            print(f"❌ 保存失败: {e}")
        finally:
            self._close_browser()


class DataAnalyzer:
    """数据分析器"""
    
    def analyze(self, tweets: List[TweetData], query: str, report_type: str = "search") -> ReportData:
        """分析推文数据并生成报告数据"""
        if not tweets:
            return self._empty_report(query, report_type)
        
        # 基础统计
        total_likes = sum(t.likes for t in tweets)
        total_retweets = sum(t.retweets for t in tweets)
        total_replies = sum(t.replies for t in tweets)
        total_views = sum(t.views for t in tweets)
        
        # 平均互动率
        avg_engagement = (total_likes + total_retweets + total_replies) / len(tweets)
        
        # 热门标签
        all_hashtags = []
        for t in tweets:
            all_hashtags.extend(t.hashtags)
        top_hashtags = [{"tag": tag, "count": count} 
                       for tag, count in Counter(all_hashtags).most_common(10)]
        
        # 热门作者
        author_stats = {}
        for t in tweets:
            if t.author not in author_stats:
                author_stats[t.author] = {
                    "name": t.author_name,
                    "avatar": t.author_avatar,
                    "tweets": 0,
                    "engagement": 0
                }
            author_stats[t.author]["tweets"] += 1
            author_stats[t.author]["engagement"] += t.likes + t.retweets
        
        top_authors = sorted(
            [{"author": k, **v} for k, v in author_stats.items()],
            key=lambda x: x["engagement"],
            reverse=True
        )[:5]
        
        # 时间分布
        hourly = Counter()
        for t in tweets:
            try:
                dt = datetime.fromisoformat(t.created_at.replace('Z', '+00:00'))
                hourly[dt.hour] += 1
            except:
                pass
        hourly_distribution = {str(h): hourly.get(h, 0) for h in range(24)}
        
        # 简单情感分析（基于关键词）
        positive_words = ['好', '棒', '赞', '喜欢', 'love', 'great', 'awesome', 'amazing', 'excellent', '🚀', '💪', '🎉', '❤️', '👍', '✨']
        negative_words = ['差', '烂', '讨厌', 'hate', 'bad', 'terrible', 'awful', 'worst', '😢', '😡', '👎', '💔', '😤']
        
        sentiment_positive = 0
        sentiment_negative = 0
        sentiment_neutral = 0
        
        for t in tweets:
            text_lower = t.text.lower()
            pos_count = sum(1 for w in positive_words if w in text_lower)
            neg_count = sum(1 for w in negative_words if w in text_lower)
            
            if pos_count > neg_count:
                sentiment_positive += 1
            elif neg_count > pos_count:
                sentiment_negative += 1
            else:
                sentiment_neutral += 1
        
        # 热门推文
        top_tweets = sorted(tweets, key=lambda t: t.likes + t.retweets, reverse=True)[:5]
        
        return ReportData(
            query=query,
            report_type=report_type,
            generated_at=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            total_tweets=len(tweets),
            total_likes=total_likes,
            total_retweets=total_retweets,
            total_replies=total_replies,
            total_views=total_views,
            avg_engagement=round(avg_engagement, 1),
            top_hashtags=top_hashtags,
            top_authors=top_authors,
            hourly_distribution=hourly_distribution,
            sentiment_positive=sentiment_positive,
            sentiment_neutral=sentiment_neutral,
            sentiment_negative=sentiment_negative,
            top_tweets=[asdict(t) for t in top_tweets]
        )
    
    def _empty_report(self, query: str, report_type: str) -> ReportData:
        """生成空报告"""
        return ReportData(
            query=query,
            report_type=report_type,
            generated_at=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            total_tweets=0,
            total_likes=0,
            total_retweets=0,
            total_replies=0,
            total_views=0,
            avg_engagement=0,
            top_hashtags=[],
            top_authors=[],
            hourly_distribution={str(h): 0 for h in range(24)},
            sentiment_positive=0,
            sentiment_neutral=0,
            sentiment_negative=0,
            top_tweets=[]
        )


class HTMLReportGenerator:
    """HTML报告生成器"""
    
    def __init__(self, theme: str = "dark"):
        self.theme = theme
    
    def generate(self, data: ReportData) -> str:
        """生成HTML报告"""
        # 主题颜色
        if self.theme == "dark":
            bg_color = "#0f172a"
            card_bg = "#1e293b"
            text_color = "#f1f5f9"
            text_muted = "#94a3b8"
            accent = "#3b82f6"
            accent2 = "#8b5cf6"
            success = "#22c55e"
            warning = "#f59e0b"
            danger = "#ef4444"
        else:
            bg_color = "#f8fafc"
            card_bg = "#ffffff"
            text_color = "#1e293b"
            text_muted = "#64748b"
            accent = "#2563eb"
            accent2 = "#7c3aed"
            success = "#16a34a"
            warning = "#d97706"
            danger = "#dc2626"
        
        # 生成时间分布图表数据
        hours = list(range(24))
        hour_values = [data.hourly_distribution.get(str(h), 0) for h in hours]
        max_hour_val = max(hour_values) if hour_values else 1
        hour_bars = ""
        for h, v in zip(hours, hour_values):
            height = int((v / max_hour_val) * 60) if max_hour_val > 0 else 0
            hour_bars += f'''
                <div style="display:flex;flex-direction:column;align-items:center;gap:4px;">
                    <div style="width:12px;height:{height}px;background:linear-gradient(to top,{accent},{accent2});border-radius:4px;min-height:2px;"></div>
                    <span style="font-size:10px;color:{text_muted};">{h}</span>
                </div>
            '''
        
        # 生成情感分析
        total_sentiment = data.sentiment_positive + data.sentiment_neutral + data.sentiment_negative
        if total_sentiment > 0:
            pos_pct = int((data.sentiment_positive / total_sentiment) * 100)
            neu_pct = int((data.sentiment_neutral / total_sentiment) * 100)
            neg_pct = 100 - pos_pct - neu_pct
        else:
            pos_pct, neu_pct, neg_pct = 0, 0, 0
        
        # 生成热门标签HTML
        hashtags_html = ""
        for tag in data.top_hashtags[:8]:
            hashtags_html += f'''
                <span style="background:{accent}22;color:{accent};padding:6px 12px;border-radius:20px;font-size:13px;">
                    #{tag['tag']} <span style="color:{text_muted};">({tag['count']})</span>
                </span>
            '''
        
        # 生成热门作者HTML
        authors_html = ""
        for i, author in enumerate(data.top_authors[:5], 1):
            avatar = author.get('avatar', '')
            avatar_html = f'<img src="{avatar}" style="width:32px;height:32px;border-radius:50%;">' if avatar and avatar.startswith('http') else f'<span style="font-size:20px;width:32px;text-align:center;">👤</span>'
            authors_html += f'''
                <div style="display:flex;align-items:center;gap:12px;padding:12px;background:{bg_color};border-radius:8px;">
                    {avatar_html}
                    <div style="flex:1;min-width:0;">
                        <div style="font-weight:600;color:{text_color};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">@{author['author']}</div>
                        <div style="font-size:12px;color:{text_muted};">{author['tweets']} 推文 · {author['engagement']:,} 互动</div>
                    </div>
                    <span style="background:{accent};color:white;padding:4px 8px;border-radius:4px;font-size:12px;">#{i}</span>
                </div>
            '''
        
        # 生成热门推文HTML
        tweets_html = ""
        for tweet in data.top_tweets[:3]:
            avatar = tweet.get('author_avatar', '')
            avatar_html = f'<img src="{avatar}" style="width:24px;height:24px;border-radius:50%;">' if avatar and avatar.startswith('http') else '<span style="font-size:18px;">👤</span>'
            text_preview = tweet['text'][:150] + ('...' if len(tweet['text']) > 150 else '')
            tweets_html += f'''
                <div style="padding:16px;background:{bg_color};border-radius:12px;border-left:4px solid {accent};">
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                        {avatar_html}
                        <span style="font-weight:600;color:{text_color};">@{tweet['author']}</span>
                    </div>
                    <p style="color:{text_color};margin:0 0 12px 0;line-height:1.5;font-size:14px;">{text_preview}</p>
                    <div style="display:flex;gap:16px;font-size:13px;color:{text_muted};">
                        <span>❤️ {tweet['likes']:,}</span>
                        <span>🔄 {tweet['retweets']:,}</span>
                        <span>💬 {tweet['replies']:,}</span>
                        <span>👁️ {tweet['views']:,}</span>
                    </div>
                </div>
            '''
        
        # 格式化大数字
        def format_num(n):
            if n >= 1000000:
                return f"{n/1000000:.1f}M"
            elif n >= 1000:
                return f"{n/1000:.1f}K"
            return str(n)

        html = f'''<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{ 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'PingFang SC', 'Microsoft YaHei', sans-serif;
            background: {bg_color};
            color: {text_color};
            padding: 32px;
            min-width: 900px;
        }}
    </style>
</head>
<body>
    <div style="max-width: 900px; margin: 0 auto;">
        <!-- Header -->
        <div style="text-align:center;margin-bottom:32px;">
            <div style="display:inline-flex;align-items:center;gap:12px;margin-bottom:8px;">
                <span style="font-size:40px;">𝕏</span>
                <h1 style="font-size:28px;font-weight:700;">数据分析报告</h1>
            </div>
            <p style="color:{text_muted};font-size:14px;">
                搜索关键词: <span style="color:{accent};font-weight:600;">"{data.query}"</span> · 
                生成时间: {data.generated_at}
            </p>
        </div>
        
        <!-- Stats Cards -->
        <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:16px;margin-bottom:24px;">
            <div style="background:{card_bg};padding:20px;border-radius:16px;text-align:center;">
                <div style="font-size:28px;font-weight:700;color:{accent};">{data.total_tweets:,}</div>
                <div style="color:{text_muted};font-size:13px;margin-top:4px;">推文总数</div>
            </div>
            <div style="background:{card_bg};padding:20px;border-radius:16px;text-align:center;">
                <div style="font-size:28px;font-weight:700;color:{danger};">{format_num(data.total_likes)}</div>
                <div style="color:{text_muted};font-size:13px;margin-top:4px;">❤️ 总点赞</div>
            </div>
            <div style="background:{card_bg};padding:20px;border-radius:16px;text-align:center;">
                <div style="font-size:28px;font-weight:700;color:{success};">{format_num(data.total_retweets)}</div>
                <div style="color:{text_muted};font-size:13px;margin-top:4px;">🔄 总转发</div>
            </div>
            <div style="background:{card_bg};padding:20px;border-radius:16px;text-align:center;">
                <div style="font-size:28px;font-weight:700;color:{warning};">{format_num(data.total_replies)}</div>
                <div style="color:{text_muted};font-size:13px;margin-top:4px;">💬 总评论</div>
            </div>
            <div style="background:{card_bg};padding:20px;border-radius:16px;text-align:center;">
                <div style="font-size:28px;font-weight:700;color:{accent2};">{format_num(data.total_views)}</div>
                <div style="color:{text_muted};font-size:13px;margin-top:4px;">👁️ 总浏览</div>
            </div>
        </div>
        
        <!-- Charts Row -->
        <div style="display:grid;grid-template-columns:2fr 1fr;gap:24px;margin-bottom:24px;">
            <!-- Time Distribution -->
            <div style="background:{card_bg};padding:24px;border-radius:16px;">
                <h3 style="font-size:16px;margin-bottom:16px;color:{text_color};">📊 发布时间分布 (24小时)</h3>
                <div style="display:flex;align-items:flex-end;justify-content:space-between;height:80px;padding-top:10px;">
                    {hour_bars}
                </div>
            </div>
            
            <!-- Sentiment Analysis -->
            <div style="background:{card_bg};padding:24px;border-radius:16px;">
                <h3 style="font-size:16px;margin-bottom:16px;color:{text_color};">😊 情感分析</h3>
                <div style="display:flex;flex-direction:column;gap:12px;">
                    <div style="display:flex;align-items:center;gap:12px;">
                        <div style="width:100px;height:12px;background:{bg_color};border-radius:6px;overflow:hidden;">
                            <div style="width:{pos_pct}%;height:100%;background:{success};"></div>
                        </div>
                        <span style="font-size:13px;">😊 正面 {pos_pct}%</span>
                    </div>
                    <div style="display:flex;align-items:center;gap:12px;">
                        <div style="width:100px;height:12px;background:{bg_color};border-radius:6px;overflow:hidden;">
                            <div style="width:{neu_pct}%;height:100%;background:{text_muted};"></div>
                        </div>
                        <span style="font-size:13px;">😐 中性 {neu_pct}%</span>
                    </div>
                    <div style="display:flex;align-items:center;gap:12px;">
                        <div style="width:100px;height:12px;background:{bg_color};border-radius:6px;overflow:hidden;">
                            <div style="width:{neg_pct}%;height:100%;background:{danger};"></div>
                        </div>
                        <span style="font-size:13px;">😢 负面 {neg_pct}%</span>
                    </div>
                </div>
            </div>
        </div>
        
        <!-- Hashtags -->
        <div style="background:{card_bg};padding:24px;border-radius:16px;margin-bottom:24px;">
            <h3 style="font-size:16px;margin-bottom:16px;color:{text_color};">🏷️ 热门标签</h3>
            <div style="display:flex;flex-wrap:wrap;gap:8px;">
                {hashtags_html if hashtags_html else f'<span style="color:{text_muted};">暂无标签数据</span>'}
            </div>
        </div>
        
        <!-- Two Column: Authors & Top Tweets -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;">
            <!-- Top Authors -->
            <div style="background:{card_bg};padding:24px;border-radius:16px;">
                <h3 style="font-size:16px;margin-bottom:16px;color:{text_color};">👥 活跃用户 TOP 5</h3>
                <div style="display:flex;flex-direction:column;gap:8px;">
                    {authors_html if authors_html else f'<span style="color:{text_muted};">暂无用户数据</span>'}
                </div>
            </div>
            
            <!-- Top Tweets -->
            <div style="background:{card_bg};padding:24px;border-radius:16px;">
                <h3 style="font-size:16px;margin-bottom:16px;color:{text_color};">🔥 热门推文</h3>
                <div style="display:flex;flex-direction:column;gap:12px;">
                    {tweets_html if tweets_html else f'<span style="color:{text_muted};">暂无推文数据</span>'}
                </div>
            </div>
        </div>
        
        <!-- Footer -->
        <div style="text-align:center;margin-top:32px;padding-top:24px;border-top:1px solid {card_bg};">
            <p style="color:{text_muted};font-size:12px;">
                📊 由 X Report Generator 生成 · 平均互动率: {data.avg_engagement:.1f} · 数据来源: x.com
            </p>
        </div>
    </div>
</body>
</html>'''
        
        return html


class HTMLToImageConverter:
    """HTML转图片转换器"""
    
    def convert(self, html_content: str, output_path: str, width: int = 920, scale: float = 2.0) -> bool:
        """将HTML转换为图片"""
        try:
            from playwright.sync_api import sync_playwright
            
            with sync_playwright() as p:
                browser = p.chromium.launch()
                page = browser.new_page(
                    viewport={"width": width, "height": 800},
                    device_scale_factor=scale
                )
                
                # 设置HTML内容
                page.set_content(html_content)
                
                # 等待渲染完成
                page.wait_for_load_state("networkidle")
                page.wait_for_timeout(500)
                
                # 获取实际内容高度
                body_height = page.evaluate("document.body.scrollHeight")
                page.set_viewport_size({"width": width, "height": body_height + 64})
                
                # 截图
                page.screenshot(path=output_path, full_page=True)
                
                browser.close()
                
            print(f"✓ 报告图片已保存: {output_path}")
            return True
            
        except ImportError:
            print("❌ 需要安装 playwright: pip install playwright && playwright install chromium")
            return False
        except Exception as e:
            print(f"❌ 转换失败: {e}")
            return False


def main():
    parser = argparse.ArgumentParser(
        description="X (Twitter) 数据分析报告生成器 - 使用浏览器爬取真实数据",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  # 搜索关键词并生成报告
  %(prog)s search "AI" --limit 50 --output report.png
  
  # 分析用户推文
  %(prog)s user "elonmusk" --limit 30 --output user_report.png
  
  # 使用浅色主题
  %(prog)s search "Python" --theme light --output report.png
  
  # 仅生成HTML
  %(prog)s search "coding" --html-only --output report.html
  
  # 显示浏览器窗口（调试用）
  %(prog)s search "test" --no-headless --output report.png
  
  # 保存登录cookies（首次使用需要登录）
  %(prog)s login --cookies cookies.json
  
  # 使用已保存的cookies
  %(prog)s search "AI" --cookies cookies.json --output report.png
        """
    )
    
    subparsers = parser.add_subparsers(dest='command', required=True)
    
    # Search command
    p_search = subparsers.add_parser('search', help='搜索关键词并生成报告')
    p_search.add_argument('query', help='搜索关键词')
    p_search.add_argument('--limit', '-l', type=int, default=50, help='获取推文数量 (默认50)')
    p_search.add_argument('--output', '-o', required=True, help='输出文件路径 (.png 或 .html)')
    p_search.add_argument('--theme', '-t', default='dark', choices=['dark', 'light'], help='报告主题')
    p_search.add_argument('--html-only', action='store_true', help='仅生成HTML，不转图片')
    p_search.add_argument('--width', '-w', type=int, default=920, help='图片宽度')
    p_search.add_argument('--cookies', '-c', help='Cookies文件路径')
    p_search.add_argument('--no-headless', action='store_true', help='显示浏览器窗口')
    
    # User command
    p_user = subparsers.add_parser('user', help='分析用户推文')
    p_user.add_argument('username', help='用户名 (不含@)')
    p_user.add_argument('--limit', '-l', type=int, default=50, help='获取推文数量')
    p_user.add_argument('--output', '-o', required=True, help='输出文件路径')
    p_user.add_argument('--theme', '-t', default='dark', choices=['dark', 'light'])
    p_user.add_argument('--html-only', action='store_true')
    p_user.add_argument('--width', '-w', type=int, default=920)
    p_user.add_argument('--cookies', '-c', help='Cookies文件路径')
    p_user.add_argument('--no-headless', action='store_true')
    
    # Login command - 保存cookies
    p_login = subparsers.add_parser('login', help='登录并保存cookies')
    p_login.add_argument('--cookies', '-c', default='x_cookies.json', help='Cookies保存路径')
    
    args = parser.parse_args()
    
    # 检查playwright
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("❌ 需要安装 playwright:")
        print("   pip install playwright")
        print("   playwright install chromium")
        sys.exit(1)
    
    # 登录模式
    if args.command == 'login':
        scraper = XBrowserScraper(headless=False)
        scraper.save_cookies(args.cookies)
        return
    
    # 初始化爬虫
    headless = not getattr(args, 'no_headless', False)
    cookies_file = getattr(args, 'cookies', None)
    scraper = XBrowserScraper(headless=headless, cookies_file=cookies_file)
    analyzer = DataAnalyzer()
    
    print("=" * 50)
    print("🐦 X (Twitter) 数据分析报告生成器")
    print("=" * 50)
    
    # 获取数据
    if args.command == 'search':
        tweets = scraper.search_tweets(args.query, args.limit)
        report_data = analyzer.analyze(tweets, args.query, "search")
    elif args.command == 'user':
        tweets = scraper.get_user_tweets(args.username, args.limit)
        report_data = analyzer.analyze(tweets, f"@{args.username}", "user")
    
    if not tweets:
        print("\n❌ 未能获取到数据，请检查:")
        print("   1. 网络连接是否正常")
        print("   2. 是否需要登录 (使用 login 命令保存cookies)")
        print("   3. 搜索关键词是否有效")
        sys.exit(1)
    
    print(f"\n📊 数据分析完成: {report_data.total_tweets} 条推文")
    print(f"   总点赞: {report_data.total_likes:,}")
    print(f"   总转发: {report_data.total_retweets:,}")
    print(f"   总评论: {report_data.total_replies:,}")
    
    # 生成HTML
    html_generator = HTMLReportGenerator(theme=args.theme)
    html_content = html_generator.generate(report_data)
    
    # 输出
    output_path = args.output
    
    if args.html_only or output_path.endswith('.html'):
        # 仅保存HTML
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(html_content)
        print(f"\n✓ HTML报告已保存: {output_path}")
    else:
        # 转换为图片
        converter = HTMLToImageConverter()
        success = converter.convert(html_content, output_path, width=args.width)
        
        if not success:
            # 如果转换失败，保存HTML
            html_path = output_path.rsplit('.', 1)[0] + '.html'
            with open(html_path, 'w', encoding='utf-8') as f:
                f.write(html_content)
            print(f"⚠️ 图片生成失败，已保存HTML: {html_path}")
    
    print("\n✅ 报告生成完成!")


if __name__ == "__main__":
    main()
