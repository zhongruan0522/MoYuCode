using System.Diagnostics;
using System.Drawing;
using Microsoft.AspNetCore.Builder;
using MoYuCode;

namespace MoYuCode.Win;

internal sealed class TrayAppContext : ApplicationContext
{
    private const string LocalUrl = "http://localhost:9110";

    private readonly NotifyIcon trayIcon;
    private readonly ToolStripMenuItem statusItem;
    private readonly ToolStripMenuItem startItem;
    private readonly ToolStripMenuItem stopItem;
    private readonly ToolStripMenuItem openItem;
    private readonly ToolStripMenuItem exitItem;

    private WebApplication? app;
    private bool isRunning;
    private bool isStarting;
    private bool isStopping;

    public TrayAppContext()
    {
        var menu = new ContextMenuStrip();
        statusItem = new ToolStripMenuItem("Status: Stopped") { Enabled = false };
        startItem = new ToolStripMenuItem("启动 MoYuCode（摸鱼Coding）", null, async (_, __) => await StartAppAsync());
        stopItem = new ToolStripMenuItem("关闭 MoYuCode（摸鱼Coding）", null, async (_, __) => await StopAppAsync());
        openItem = new ToolStripMenuItem("打开 MoYuCode（摸鱼Coding）", null, (_, __) => OpenUrl());
        exitItem = new ToolStripMenuItem("退出", null, (_, __) => _ = ShutdownAsync());

        menu.Items.Add(statusItem);
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(startItem);
        menu.Items.Add(stopItem);
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(openItem);
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(exitItem);
        menu.Opening += (_, __) => RefreshMenu();

        var iconStream = typeof(TrayAppContext).Assembly.GetManifestResourceStream("MoYuCode.Win.favicon.ico");
        trayIcon = new NotifyIcon
        {
            Text = "MoYuCode（摸鱼Coding）",
            Icon = iconStream != null ? new Icon(iconStream) : SystemIcons.Application,
            ContextMenuStrip = menu,
            Visible = true
        };
        trayIcon.DoubleClick += (_, __) => OpenUrl();

        _ = StartAppAsync();
    }

    private void RefreshMenu()
    {
        if (isStarting)
        {
            statusItem.Text = "Status: Starting...";
        }
        else if (isStopping)
        {
            statusItem.Text = "Status: Stopping...";
        }
        else
        {
            statusItem.Text = isRunning ? "Status: Running" : "Status: Stopped";
        }

        startItem.Enabled = !isRunning && !isStarting;
        stopItem.Enabled = isRunning && !isStopping;
        trayIcon.Text = isRunning
            ? "MoYuCode（摸鱼Coding） (Running)"
            : "MoYuCode（摸鱼Coding） (Stopped)";
    }

    private async Task StartAppAsync()
    {
        if (isRunning || isStarting)
        {
            return;
        }

        isStarting = true;
        RefreshMenu();

        try
        {
            app ??= MoYuCodeApp.Create(Array.Empty<string>(), out _);
            await app.StartAsync();
            isRunning = true;
        }
        catch (Exception ex)
        {
            MessageBox.Show(ex.Message, "Start MoYuCode（摸鱼Coding） failed", MessageBoxButtons.OK, MessageBoxIcon.Error);
            if (app != null)
            {
                await app.DisposeAsync();
                app = null;
            }
            isRunning = false;
        }
        finally
        {
            isStarting = false;
            RefreshMenu();
        }
    }

    private async Task StopAppAsync()
    {
        if (!isRunning || isStopping)
        {
            return;
        }

        isStopping = true;
        RefreshMenu();

        try
        {
            if (app == null)
            {
                isRunning = false;
                return;
            }

            // 使用 Task.WhenAny 来避免卡死，如果超时就强制结束
            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
            var stopTask = app.StopAsync(cts.Token);
            var timeoutTask = Task.Delay(TimeSpan.FromSeconds(3));

            var completedTask = await Task.WhenAny(stopTask, timeoutTask);

            if (completedTask == timeoutTask)
            {
                // 超时则直接 Dispose 不等待 StopAsync 完成
            }

            await app.DisposeAsync();
            app = null;
            isRunning = false;
        }
        catch (Exception ex)
        {
            MessageBox.Show(ex.Message, "Stop MoYuCode（摸鱼Coding） failed", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
        finally
        {
            isStopping = false;
            RefreshMenu();
        }
    }

    private async Task ShutdownAsync()
    {
        // 先停止应用（如果正在运行）
        if (isRunning)
        {
            try
            {
                // 直接执行停止逻辑，不经过 StopAppAsync 的状态检查
                // 因为此时我们无论如何都要关闭
                if (app != null)
                {
                    // 快速停止，不等待优雅关闭
                    var stopTask = app.StopAsync();
                    var timeoutTask = Task.Delay(TimeSpan.FromSeconds(2));
                    await Task.WhenAny(stopTask, timeoutTask);

                    await app.DisposeAsync();
                    app = null;
                }
                isRunning = false;
            }
            catch
            {
                // 忽略错误，确保退出流程继续
            }
        }

        trayIcon.Visible = false;
        trayIcon.Dispose();
        ExitThread();
    }

    private static void OpenUrl()
    {
        try
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = LocalUrl,
                UseShellExecute = true
            });
        }
        catch (Exception ex)
        {
            MessageBox.Show(ex.Message, "Open URL failed", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            trayIcon.Dispose();
        }
        base.Dispose(disposing);
    }
}
