namespace MoYuCode.Api;

public sealed record ApiError(string Message, string? Code = null);

public sealed record ApiResponse<T>(bool Success, T? Data, ApiError? Error, string TraceId)
{
    public static ApiResponse<T> Ok(T? data, HttpContext httpContext)
    {
        return new ApiResponse<T>(Success: true, Data: data, Error: null, TraceId: httpContext.TraceIdentifier);
    }

    public static ApiResponse<T> Fail(string message, HttpContext httpContext, int statusCode, string? code = null)
    {
        httpContext.Response.StatusCode = statusCode;
        return new ApiResponse<T>(Success: false, Data: default, Error: new ApiError(message, code), TraceId: httpContext.TraceIdentifier);
    }
}

public static class ApiResponse
{
    public static ApiResponse<T> Ok<T>(T? data, HttpContext httpContext) => ApiResponse<T>.Ok(data, httpContext);

    public static ApiResponse<object?> Ok(HttpContext httpContext) => ApiResponse<object?>.Ok(null, httpContext);

    public static ApiResponse<object?> Fail(string message, HttpContext httpContext, int statusCode, string? code = null)
        => ApiResponse<object?>.Fail(message, httpContext, statusCode, code);
}

