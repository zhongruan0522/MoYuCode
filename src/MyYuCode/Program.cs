using MyYuCode;
using Serilog;

try
{
    var app = MyYuCodeApp.Create(args, out _);
    app.Run();
}
catch (Exception e)
{
    Log.Fatal(e, "Host terminated unexpectedly.");
}
finally
{
    Log.CloseAndFlush();
    Console.WriteLine("Press any key to exit.");
    Console.ResetColor();
}
