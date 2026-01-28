namespace MoYuCode.Api;

public sealed class ApiResponseEndpointFilter(ILogger<ApiResponseEndpointFilter> logger) : IEndpointFilter
{
    public async ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        static bool ShouldBypass(EndpointFilterInvocationContext context)
        {
            var contentType = context.HttpContext.Response.ContentType;
            if (contentType is not null && contentType.StartsWith("text/event-stream", StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }

            return context.HttpContext.Response.HasStarted;
        }

        try
        {
            var result = await next(context);

            if (ShouldBypass(context))
            {
                return result;
            }

            if (result is null)
            {
                return ApiResponse.Ok(context.HttpContext);
            }

            if (result is ApiResponse<object?> or ApiResponse<string> or ApiResponse<int> or ApiResponse<bool>)
            {
                return result;
            }

            var type = result.GetType();
            if (type.IsGenericType && type.GetGenericTypeDefinition() == typeof(ApiResponse<>))
            {
                return result;
            }

            return ApiResponse.Ok(result, context.HttpContext);
        }
        catch (ApiHttpException ex)
        {
            if (ShouldBypass(context))
            {
                throw;
            }

            return ApiResponse.Fail(ex.Message, context.HttpContext, ex.StatusCode, ex.Code);
        }
        catch (Exception ex)
        {
            if (ShouldBypass(context))
            {
                throw;
            }

            logger.LogError(ex, "Unhandled API exception. TraceId={TraceId}", context.HttpContext.TraceIdentifier);
            return ApiResponse.Fail("Internal Server Error", context.HttpContext, StatusCodes.Status500InternalServerError);
        }
    }
}
