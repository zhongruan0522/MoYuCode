# Design Document: Skills Marketplace

## Overview

The Skills Marketplace feature enables users to browse and discover available skills from a remote GitHub registry. The system follows a client-server architecture where the ASP.NET Core backend fetches and validates skills data from the remote registry, while the React frontend provides an intuitive browsing experience with search and filtering capabilities.

The design leverages existing patterns in the codebase:
- Backend: Minimal API endpoints in `ApiEndpoints.cs` following the established pattern
- Frontend: React components with TypeScript, using the existing API client pattern
- Data flow: Backend acts as a proxy to validate and transform external data before serving to frontend

## Architecture

### System Components

```
┌─────────────────┐
│  React Frontend │
│  (Skills Page)  │
└────────┬────────┘
         │ HTTP GET /api/skills
         ▼
┌─────────────────┐
│  ASP.NET Core   │
│  Skills API     │
└────────┬────────┘
         │ HTTP GET
         ▼
┌─────────────────┐
│  GitHub Raw     │
│  skills/index.  │
│  json           │
└─────────────────┘
```

### Data Flow

1. **User Navigation**: User clicks "Skills" in navigation menu
2. **Page Load**: Skills page component mounts and requests data
3. **API Request**: Frontend calls `GET /api/skills`
4. **External Fetch**: Backend fetches from GitHub raw URL
5. **Validation**: Backend validates JSON structure and required fields
6. **Response**: Backend returns validated skills data
7. **Rendering**: Frontend displays skills in card-based layout
8. **Filtering**: Client-side filtering based on user search input

## Components and Interfaces

### Backend Components

#### 1. Skills API Endpoint

**Location**: `src/MyYuCode/Api/ApiEndpoints.cs` (add to `MapMyYuCodeApis`)

**Endpoint**: `GET /api/skills`

**Responsibilities**:
- Fetch skills data from remote GitHub URL
- Parse and validate JSON response
- Handle network errors and invalid data
- Return structured skills data to frontend

**Error Handling**:
- 503 Service Unavailable: When GitHub is unreachable
- 502 Bad Gateway: When JSON is invalid or malformed
- 500 Internal Server Error: For unexpected errors

#### 2. Skills Data Models

**Location**: `src/MyYuCode/Contracts/Skills/` (new directory)

**Models**:

```csharp
namespace MyYuCode.Contracts.Skills;

public record SkillsIndexDto(
    int Version,
    string GeneratedAt,
    IReadOnlyList<SkillDto> Skills
);

public record SkillDto(
    string Slug,
    string Name,
    string Summary,
    string Description,
    string Visibility,
    IReadOnlyList<string> Tags,
    SkillServicesDto Services,
    string Version,
    string BuildId,
    string Status,
    string UpdatedAt
);

public record SkillServicesDto(
    SkillCompatibilityDto Codex,
    SkillCompatibilityDto ClaudeCode
);

public record SkillCompatibilityDto(
    bool Compatible
);
```

### Frontend Components

#### 1. Skills Page Component

**Location**: `web/src/pages/SkillsPage.tsx` (new file)

**Responsibilities**:
- Fetch skills data from backend API
- Display loading state during fetch
- Handle and display errors
- Render skills in card-based grid layout
- Provide search/filter functionality

**State Management**:
- `skills`: Array of skill objects
- `loading`: Boolean for loading state
- `error`: Error message string or null
- `searchQuery`: User's search input

#### 2. Skill Card Component

**Location**: `web/src/components/SkillCard.tsx` (new file)

**Responsibilities**:
- Display individual skill information
- Show visual status indicators
- Display compatibility badges
- Render tags as chips/badges

**Props**:
```typescript
interface SkillCardProps {
  skill: SkillDto
}
```

#### 3. Navigation Integration

**Location**: `web/src/App.tsx` (modify existing)

**Changes**:
- Add "Skills" navigation item to sidebar
- Add route for `/skills` path
- Use existing `NavIconLink` component pattern

### API Client Extension

**Location**: `web/src/api/client.ts` (modify existing)

**New Method**:
```typescript
skills: {
  list: () => http<SkillsIndexDto>(`/api/skills`)
}
```

**New Types** (`web/src/api/types.ts`):
```typescript
export type SkillsIndexDto = {
  version: number
  generatedAt: string
  skills: SkillDto[]
}

export type SkillDto = {
  slug: string
  name: string
  summary: string
  description: string
  visibility: string
  tags: string[]
  services: SkillServicesDto
  version: string
  buildId: string
  status: string
  updatedAt: string
}

export type SkillServicesDto = {
  codex: SkillCompatibilityDto
  claudecode: SkillCompatibilityDto
}

export type SkillCompatibilityDto = {
  compatible: boolean
}
```

## Data Models

### Skills Index Structure

The remote skills index follows this structure:

```json
{
  "version": 1,
  "generatedAt": "2026-01-27",
  "skills": [
    {
      "slug": "system/plan",
      "name": "Plan",
      "summary": "Brief description",
      "description": "Detailed description",
      "visibility": "public",
      "tags": ["planning", "documentation"],
      "services": {
        "codex": { "compatible": true },
        "claudecode": { "compatible": true }
      },
      "skillMd": {
        "path": "skills/system/plan/SKILL.md"
      },
      "package": {
        "basePath": "skills/system/plan",
        "files": [...]
      },
      "version": "1.0.0",
      "buildId": "20260127.1",
      "status": "active",
      "updatedAt": "2026-01-27T00:00:00Z"
    }
  ]
}
```

### Field Validation Rules

**Required Fields**:
- `version` (integer)
- `generatedAt` (string)
- `skills` (array)

**Required Skill Fields**:
- `slug`, `name`, `summary`, `description` (non-empty strings)
- `tags` (array, can be empty)
- `services` (object with `codex` and `claudecode`)
- `version`, `status`, `updatedAt` (strings)

### Status Values

- `active`: Skill is production-ready and recommended
- `deprecated`: Skill is outdated, not recommended for new use
- `experimental`: Skill is in testing, may have issues

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: API Returns Valid Skills Data Structure

*For any* successful API response from `/api/skills`, the response SHALL contain a `version` field (integer), a `generatedAt` field (string), and a `skills` array where each skill object contains all required fields (slug, name, summary, description, tags, services, version, status, updatedAt).

**Validates: Requirements 1.2, 2.3**

### Property 2: Network Error Handling

*For any* request to `/api/skills` when the GitHub registry is unreachable, the API SHALL return a 503 status code with an appropriate error message.

**Validates: Requirements 1.3, 7.1**

### Property 3: Invalid JSON Handling

*For any* response from the GitHub registry that contains invalid or malformed JSON, the API SHALL return a 502 status code with an appropriate error message.

**Validates: Requirements 1.4, 7.1**

### Property 4: Search Filtering Correctness

*For any* search query string and any skills list, the filtered results SHALL only include skills where the query appears in the name, summary, description, or tags (case-insensitive).

**Validates: Requirements 5.2**

### Property 5: Real-time Filter Updates

*For any* change to the search input field, the displayed skills list SHALL update within 200ms to reflect the new filter criteria.

**Validates: Requirements 5.3, 8.2**

### Property 6: Status Indicator Consistency

*For any* skill with status "active", "deprecated", or "experimental", the skill card SHALL display a distinct visual indicator corresponding to that status.

**Validates: Requirements 6.1, 6.2, 6.3, 6.4**

### Property 7: Empty Search Results

*For any* search query that matches no skills, the page SHALL display all available skills (equivalent to clearing the search).

**Validates: Requirements 5.3**

### Property 8: Loading State Display

*For any* API request to fetch skills data, the page SHALL display a loading indicator within 100ms of the request starting.

**Validates: Requirements 4.5, 8.1**

### Property 9: Error Message Display

*For any* API error response, the page SHALL display a user-friendly error message and provide a retry action.

**Validates: Requirements 4.6, 7.3, 7.4**

### Property 10: Compatibility Badge Display

*For any* skill object, the skill card SHALL display compatibility badges for both codex and claudecode based on the `services.codex.compatible` and `services.claudecode.compatible` boolean values.

**Validates: Requirements 4.4**

## Error Handling

### Backend Error Scenarios

1. **Network Timeout**
   - Scenario: GitHub is slow or unresponsive
   - Response: 503 Service Unavailable
   - Message: "Skills registry is temporarily unavailable. Please try again later."

2. **Invalid JSON**
   - Scenario: GitHub returns malformed JSON
   - Response: 502 Bad Gateway
   - Message: "Skills registry returned invalid data. Please try again later."

3. **Missing Required Fields**
   - Scenario: JSON structure is incomplete
   - Response: 502 Bad Gateway
   - Message: "Skills registry data is incomplete. Please try again later."

4. **HTTP Client Exception**
   - Scenario: Network error, DNS failure, etc.
   - Response: 503 Service Unavailable
   - Message: "Unable to connect to skills registry. Please check your connection."

### Frontend Error Scenarios

1. **API Unavailable**
   - Display: Error banner with retry button
   - Message: "Unable to load skills. Please try again."

2. **Network Offline**
   - Display: Offline indicator (existing component)
   - Message: "You are offline. Skills cannot be loaded."

3. **Empty Skills List**
   - Display: Empty state message
   - Message: "No skills available at this time."

4. **Search No Results**
   - Display: All skills (no filtering applied)
   - Behavior: Treat as if search is cleared

### Error Recovery

- **Retry Logic**: Frontend provides manual retry button
- **Timeout**: Backend HTTP client should timeout after 10 seconds
- **Graceful Degradation**: Show cached data if available (future enhancement)

## Testing Strategy

### Dual Testing Approach

The testing strategy combines unit tests for specific scenarios and property-based tests for comprehensive coverage:

- **Unit Tests**: Focus on specific examples, edge cases, and error conditions
- **Property Tests**: Verify universal properties across randomized inputs
- Both approaches are complementary and necessary for comprehensive validation

### Backend Testing

#### Unit Tests

1. **Successful Data Fetch**
   - Mock GitHub response with valid JSON
   - Verify API returns 200 with correct structure

2. **Network Error Handling**
   - Mock network timeout
   - Verify API returns 503 with error message

3. **Invalid JSON Handling**
   - Mock malformed JSON response
   - Verify API returns 502 with error message

4. **Missing Required Fields**
   - Mock JSON with missing `slug` field
   - Verify API returns 502 with validation error

5. **Empty Skills Array**
   - Mock valid JSON with empty skills array
   - Verify API returns 200 with empty array

#### Property-Based Tests

**Test Configuration**: Minimum 100 iterations per property test

1. **Property 1: Valid Data Structure**
   - **Tag**: Feature: skills-marketplace, Property 1: API Returns Valid Skills Data Structure
   - Generate random valid skills data
   - Verify all required fields are present and correctly typed

2. **Property 2: Network Error Handling**
   - **Tag**: Feature: skills-marketplace, Property 2: Network Error Handling
   - Simulate various network failure scenarios
   - Verify all return 503 status code

3. **Property 3: Invalid JSON Handling**
   - **Tag**: Feature: skills-marketplace, Property 3: Invalid JSON Handling
   - Generate various malformed JSON strings
   - Verify all return 502 status code

### Frontend Testing

#### Unit Tests

1. **Skills Page Rendering**
   - Mock API response with sample skills
   - Verify skills cards are rendered

2. **Loading State**
   - Mock delayed API response
   - Verify loading indicator appears

3. **Error State**
   - Mock API error
   - Verify error message and retry button appear

4. **Empty State**
   - Mock API response with empty skills array
   - Verify empty state message appears

5. **Navigation Integration**
   - Verify "Skills" menu item exists
   - Verify clicking navigates to `/skills`

#### Property-Based Tests

**Test Configuration**: Minimum 100 iterations per property test

1. **Property 4: Search Filtering Correctness**
   - **Tag**: Feature: skills-marketplace, Property 4: Search Filtering Correctness
   - Generate random skills data and search queries
   - Verify filtered results only include matching skills

2. **Property 5: Real-time Filter Updates**
   - **Tag**: Feature: skills-marketplace, Property 5: Real-time Filter Updates
   - Generate random search inputs
   - Verify UI updates within 200ms

3. **Property 6: Status Indicator Consistency**
   - **Tag**: Feature: skills-marketplace, Property 6: Status Indicator Consistency
   - Generate skills with various status values
   - Verify each status has distinct visual indicator

4. **Property 10: Compatibility Badge Display**
   - **Tag**: Feature: skills-marketplace, Property 10: Compatibility Badge Display
   - Generate skills with various compatibility combinations
   - Verify badges match the compatibility boolean values

### Integration Testing

1. **End-to-End Flow**
   - Start backend server
   - Navigate to Skills page
   - Verify skills load and display correctly

2. **Error Recovery**
   - Simulate network failure
   - Verify error message appears
   - Click retry button
   - Verify skills load after retry

3. **Search Functionality**
   - Load skills page
   - Enter search query
   - Verify filtered results
   - Clear search
   - Verify all skills reappear

### Testing Tools

- **Backend**: xUnit or NUnit for C# testing
- **Frontend**: Vitest for unit tests, React Testing Library for component tests
- **Property-Based Testing**: 
  - Backend: FsCheck or CsCheck for C#
  - Frontend: fast-check for TypeScript
- **Integration**: Playwright or Cypress for E2E tests

### Test Coverage Goals

- Backend API endpoint: 100% code coverage
- Frontend components: 90%+ code coverage
- Property tests: Minimum 100 iterations per property
- All error paths must have explicit test cases
