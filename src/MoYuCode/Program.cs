using MoYuCode;
using Serilog;
using Serilog.Events;

Log.Logger = new LoggerConfiguration()
    .MinimumLevel.Information()
    .MinimumLevel.Override("Microsoft", LogEventLevel.Warning)
    .MinimumLevel.Override("Microsoft.Hosting.Lifetime", LogEventLevel.Information)
    .MinimumLevel.Override("System", LogEventLevel.Warning)
    .Enrich.FromLogContext()
    .WriteTo.Console()
    .CreateLogger();

try
{
    var app = MoYuCodeApp.Create(args, out _);
    app.Run();
}
catch (Exception e)
{
    Log.Fatal(e, "Host terminated unexpectedly.");
    try
    {
        Console.Error.WriteLine(e);
    }
    catch
    {
        // ignore
    }

    Environment.ExitCode = 1;
}
finally
{
    Log.CloseAndFlush();
}
