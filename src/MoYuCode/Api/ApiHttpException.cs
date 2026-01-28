namespace MoYuCode.Api;

public sealed class ApiHttpException(int statusCode, string message, string? code = null) : Exception(message)
{
    public int StatusCode { get; } = statusCode;

    public string? Code { get; } = code;
}

