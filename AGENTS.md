# Repository Guidelines

## Project Structure & Module Organization
- `src/MyYuCode/`: ASP.NET Core Web API (`net10.0`) with EF Core (SQLite).
  - `Api/`: minimal API endpoint mappings (see `ApiEndpoints.cs`).
  - `Controllers/`: REST controllers.
  - `Data/`: `MyYuCodeDbContext` and entity models.
  - `Contracts/` and `Services/`: shared DTOs and business logic.
- `web/`: Vite + React + TypeScript UI.
  - `web/src/`: app code; the `@/` alias maps here.
  - `web/public/`: static assets; build output in `web/dist/`.
- `MyYuCode.slnx`: solution referencing the backend project.

## Build, Test, and Development Commands
Backend:
- `dotnet build src/MyYuCode/MyYuCode.csproj` — compile the API.
- `dotnet run --project src/MyYuCode/MyYuCode.csproj --launch-profile http` — run on `http://localhost:9110` (use `--launch-profile https` for `https://localhost:9111`).

Frontend (from `web/`):
- `npm ci` — install dependencies (uses `package-lock.json`).
- `npm run dev` — start Vite dev server.
- `npm run build` — typecheck and build to `web/dist/`.
- `npm run lint` — run ESLint.

## Coding Style & Naming Conventions
- C#: 4-space indentation; nullable reference types are enabled—avoid introducing new warnings. Use `PascalCase` for types/methods and `camelCase` for locals/parameters.
- Frontend: components in `PascalCase.tsx`, hooks in `useX.ts`. Prefer importing via `@/…` when applicable.
- Formatting: no repo-wide formatter is enforced; keep diffs focused and run lint before opening a PR.

## Testing Guidelines
- Automated tests are not set up yet (no `*.Tests.csproj` or JS test runner). If adding tests, place them under `tests/` and ensure `dotnet test` runs.

## Commit & Pull Request Guidelines
- Git history is empty; use a consistent convention going forward (e.g., Conventional Commits: `feat: …`, `fix: …`, `chore: …`).
- PRs should include a short summary, testing notes (commands run), and screenshots for UI changes. Avoid committing build artifacts (`bin/`, `obj/`, `web/dist/`, `web/node_modules/`).

## Configuration & Data
- The API creates a local SQLite database at `LocalApplicationData/myyucode/myyucode.sqlite`; delete it to reset local state.
- Environment-specific settings live in `src/MyYuCode/appsettings*.json`.
