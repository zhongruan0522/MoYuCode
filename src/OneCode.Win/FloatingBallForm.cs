using System.Diagnostics;
using System.Drawing.Drawing2D;
using Microsoft.AspNetCore.Builder;
using OneCode;

namespace OneCode.Win;

internal sealed class FloatingBallForm : Form
{
    private const string LocalUrl = "http://localhost:9110";

    private readonly ContextMenuStrip menu;
    private readonly ToolStripMenuItem statusItem;
    private readonly ToolStripMenuItem startItem;
    private readonly ToolStripMenuItem stopItem;
    private readonly ToolStripMenuItem openItem;
    private readonly ToolStripMenuItem exitItem;

    private WebApplication? app;
    private bool isRunning;
    private bool isStarting;
    private bool isStopping;
    private bool dragging;
    private Point dragOffset;

    public FloatingBallForm()
    {
        FormBorderStyle = FormBorderStyle.None;
        StartPosition = FormStartPosition.Manual;
        ShowInTaskbar = false;
        TopMost = true;
        Size = new Size(56, 56);
        BackColor = Color.FromArgb(0, 122, 204);
        DoubleBuffered = true;

        menu = new ContextMenuStrip();
        statusItem = new ToolStripMenuItem("Status: Stopped") { Enabled = false };
        startItem = new ToolStripMenuItem("Start OneCode", null, async (_, __) => await StartAppAsync());
        stopItem = new ToolStripMenuItem("Stop OneCode", null, async (_, __) => await StopAppAsync());
        openItem = new ToolStripMenuItem("Open OneCode", null, (_, __) => OpenUrl());
        exitItem = new ToolStripMenuItem("Exit", null, (_, __) => Close());

        menu.Items.Add(statusItem);
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(startItem);
        menu.Items.Add(stopItem);
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(openItem);
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(exitItem);

        menu.Opening += (_, __) => RefreshMenu();

        ContextMenuStrip = menu;

        MouseDown += OnMouseDown;
        MouseMove += OnMouseMove;
        MouseUp += OnMouseUp;
    }

    protected override void OnLoad(EventArgs e)
    {
        base.OnLoad(e);
        PositionBottomRight();
        UpdateRegion();
        _ = StartAppAsync();
    }

    protected override void OnResize(EventArgs e)
    {
        base.OnResize(e);
        UpdateRegion();
        Invalidate();
    }

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        if (isRunning)
        {
            try
            {
                StopAppAsync().GetAwaiter().GetResult();
            }
            catch
            {
            }
        }

        base.OnFormClosing(e);
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);
        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
        using var fillBrush = new SolidBrush(Color.FromArgb(0, 122, 204));
        e.Graphics.FillEllipse(fillBrush, 0, 0, Width - 1, Height - 1);

        using var borderPen = new Pen(Color.White, 2);
        e.Graphics.DrawEllipse(borderPen, 1, 1, Width - 3, Height - 3);

        using var font = new Font("Segoe UI", 12, FontStyle.Bold, GraphicsUnit.Point);
        var text = "OC";
        var textSize = e.Graphics.MeasureString(text, font);
        var textPoint = new PointF((Width - textSize.Width) / 2f, (Height - textSize.Height) / 2f);
        using var textBrush = new SolidBrush(Color.White);
        e.Graphics.DrawString(text, font, textBrush, textPoint);
    }

    private void OnMouseDown(object? sender, MouseEventArgs e)
    {
        if (e.Button != MouseButtons.Left)
        {
            return;
        }

        dragging = true;
        dragOffset = new Point(e.X, e.Y);
    }

    private void OnMouseMove(object? sender, MouseEventArgs e)
    {
        if (!dragging)
        {
            return;
        }

        var screenPos = PointToScreen(e.Location);
        Location = new Point(screenPos.X - dragOffset.X, screenPos.Y - dragOffset.Y);
    }

    private void OnMouseUp(object? sender, MouseEventArgs e)
    {
        if (e.Button == MouseButtons.Left)
        {
            dragging = false;
        }
    }

    private void PositionBottomRight()
    {
        var workArea = Screen.FromPoint(Cursor.Position).WorkingArea;
        Location = new Point(workArea.Right - Width - 12, workArea.Bottom - Height - 12);
    }

    private void UpdateRegion()
    {
        using var path = new GraphicsPath();
        path.AddEllipse(0, 0, Width, Height);
        Region = new Region(path);
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

    private static void OpenUrl()
    {
        try
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = LocalUrl,
                UseShellExecute = true,
            });
        }
        catch (Exception ex)
        {
            MessageBox.Show(ex.Message, "Open URL failed", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }
}
