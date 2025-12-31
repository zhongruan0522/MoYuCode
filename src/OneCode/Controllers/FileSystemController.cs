using Microsoft.AspNetCore.Mvc;
using OneCode.Contracts.FileSystem;

namespace OneCode.Controllers;

[ApiController]
[Route("api/fs")]
public sealed class FileSystemController : ControllerBase
{
    [HttpGet("drives")]
    public ActionResult<IReadOnlyList<DriveDto>> GetDrives()
    {
        var drives = DriveInfo.GetDrives()
            .Where(d => d.IsReady)
            .Select(d => new DriveDto(d.Name, d.RootDirectory.FullName, d.DriveType.ToString()))
            .ToList();

        return Ok(drives);
    }

    [HttpGet("list")]
    public ActionResult<ListDirectoriesResponse> ListDirectories([FromQuery] string path)
    {
        if (string.IsNullOrWhiteSpace(path))
        {
            return BadRequest("Missing query parameter: path");
        }

        if (!Directory.Exists(path))
        {
            return BadRequest("Directory does not exist.");
        }

        var directoryInfo = new DirectoryInfo(path);

        List<DirectoryEntryDto> directories;
        try
        {
            directories = directoryInfo.EnumerateDirectories()
                .Where(d => (d.Attributes & FileAttributes.Hidden) == 0)
                .OrderBy(d => d.Name, StringComparer.OrdinalIgnoreCase)
                .Select(d => new DirectoryEntryDto(d.Name, d.FullName))
                .ToList();
        }
        catch (UnauthorizedAccessException)
        {
            return Forbid();
        }

        string? parent = null;
        try
        {
            parent = directoryInfo.Parent?.FullName;
        }
        catch
        {
            // ignore
        }

        return Ok(new ListDirectoriesResponse(directoryInfo.FullName, parent, directories));
    }
}

