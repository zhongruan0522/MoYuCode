using System.Diagnostics;
using System.Drawing;
using Microsoft.AspNetCore.Builder;
using OneCode;

namespace OneCode.Win;

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
        startItem = new ToolStripMenuItem("启动OneCode", null, async (_, __) => await StartAppAsync());
        stopItem = new ToolStripMenuItem("关闭OneCode", null, async (_, __) => await StopAppAsync());
        openItem = new ToolStripMenuItem("打开OneCode", null, (_, __) => OpenUrl());
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

        var iconStream = typeof(TrayAppContext).Assembly.GetManifestResourceStream("OneCode.Win.favicon.ico");
        trayIcon = new NotifyIcon
        {
            Text = "OneCode",
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
        trayIcon.Text = isRunning ? "OneCode (Running)" : "OneCode (Stopped)";
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
            app ??= OneCodeApp.Create(Array.Empty<string>(), out _);
            await app.StartAsync();
            isRunning = true;
        }
        catch (Exception ex)
        {
            MessageBox.Show(ex.Message, "Start OneCode failed", MessageBoxButtons.OK, MessageBoxIcon.Error);
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

            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(10));
            await app.StopAsync(cts.Token);
            await app.DisposeAsync();
            app = null;
            isRunning = false;
        }
        catch (Exception ex)
        {
            MessageBox.Show(ex.Message, "Stop OneCode failed", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
        finally
        {
            isStopping = false;
            RefreshMenu();
        }
    }

    private async Task ShutdownAsync()
    {
        if (isRunning)
        {
            try
            {
                await StopAppAsync();
            }
            catch
            {
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
