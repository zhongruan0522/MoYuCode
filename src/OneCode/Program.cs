using OneCode;

try
{
    var app = OneCodeApp.Create(args, out _);
    app.Run();
}
catch (Exception e)
{
    Console.WriteLine(e);
}
finally
{
    Console.WriteLine("Press any key to exit.");
    Console.ResetColor();
}
