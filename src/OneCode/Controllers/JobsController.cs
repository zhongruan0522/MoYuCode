using Microsoft.AspNetCore.Mvc;
using OneCode.Contracts.Jobs;
using OneCode.Services.Jobs;

namespace OneCode.Controllers;

[ApiController]
[Route("api/jobs")]
public sealed class JobsController(JobManager jobManager) : ControllerBase
{
    [HttpGet("{id:guid}")]
    public ActionResult<JobDto> Get(Guid id)
    {
        return jobManager.TryGetJob(id, out var job) ? Ok(job) : NotFound();
    }
}

