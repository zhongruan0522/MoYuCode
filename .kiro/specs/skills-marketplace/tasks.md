# Implementation Plan: Skills Marketplace

## Overview

This implementation plan breaks down the Skills Marketplace feature into discrete, incremental coding tasks. The approach follows a backend-first strategy, establishing the API endpoint and data models before building the frontend interface. Each task builds upon previous work, ensuring no orphaned code and continuous integration.

## Tasks

- [-] 1. Create backend data models and contracts
  - Create `src/MyYuCode/Contracts/Skills/` directory
  - Define `SkillsIndexDto`, `SkillDto`, `SkillServicesDto`, and `SkillCompatibilityDto` record types
  - Ensure all models match the JSON structure from the GitHub registry
  - _Requirements: 2.1, 2.2, 2.3_

- [-] 1.1 Write property test for data model validation
  - **Property 1: API Returns Valid Skills Data Structure**
  - **Validates: Requirements 1.2, 2.3**
  - Generate random valid skills data and verify all required fields are present and correctly typed
  - Minimum 100 iterations

- [ ] 2. Implement Skills API endpoint
  - [ ] 2.1 Add Skills API endpoint to `ApiEndpoints.cs`
    - Create `MapSkills` method following existing patterns (e.g., `MapGit`, `MapTools`)
    - Implement `GET /api/skills` endpoint
    - Use `HttpClient` to fetch from `https://raw.githubusercontent.com/AIDotNet/MoYuCode/refs/heads/main/skills/index.json`
    - Parse JSON response into `SkillsIndexDto`
    - Return parsed data with 200 status on success
    - _Requirements: 1.1, 1.2_

  - [ ] 2.2 Implement error handling for network failures
    - Catch `HttpRequestException` and return 503 status with error message
    - Catch timeout exceptions and return 503 status
    - Set HTTP client timeout to 10 seconds
    - _Requirements: 1.3, 7.1_

  - [ ] 2.3 Implement error handling for invalid JSON
    - Catch `JsonException` and return 502 status with error message
    - Validate required fields are present before returning
    - Return 502 status if validation fails
    - _Requirements: 1.4, 7.1_

  - [ ] 2.4 Register Skills API in `MapMyYuCodeApis`
    - Call `MapSkills(api)` in the `MapMyYuCodeApis` method
    - Ensure endpoint is included in the API response filter
    - _Requirements: 1.1_

- [ ] 2.5 Write property test for network error handling
  - **Property 2: Network Error Handling**
  - **Validates: Requirements 1.3, 7.1**
  - Simulate various network failure scenarios and verify all return 503 status code
  - Minimum 100 iterations

- [ ] 2.6 Write property test for invalid JSON handling
  - **Property 3: Invalid JSON Handling**
  - **Validates: Requirements 1.4, 7.1**
  - Generate various malformed JSON strings and verify all return 502 status code
  - Minimum 100 iterations

- [ ] 2.7 Write unit tests for Skills API endpoint
  - Test successful data fetch with mocked GitHub response
  - Test empty skills array handling
  - Test missing required fields scenario
  - Test HTTP client timeout scenario
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [ ] 3. Checkpoint - Backend API complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 4. Extend frontend API client
  - [ ] 4.1 Add Skills types to `web/src/api/types.ts`
    - Define `SkillsIndexDto` type
    - Define `SkillDto` type
    - Define `SkillServicesDto` type
    - Define `SkillCompatibilityDto` type
    - Export all types
    - _Requirements: 2.1, 2.2, 2.3_

  - [ ] 4.2 Add Skills API method to `web/src/api/client.ts`
    - Add `skills` object to `api` export
    - Implement `list()` method that calls `GET /api/skills`
    - Return typed `SkillsIndexDto` response
    - _Requirements: 1.1, 4.1_

- [ ] 5. Create Skill Card component
  - [ ] 5.1 Create `web/src/components/SkillCard.tsx`
    - Accept `skill: SkillDto` as prop
    - Display skill name, summary, and description
    - Display tags as badge chips
    - Display version and status
    - Use existing UI components from `web/src/components/ui/`
    - _Requirements: 4.3, 4.4_

  - [ ] 5.2 Add status indicator styling
    - Create visual indicators for "active" status (green)
    - Create visual indicators for "deprecated" status (orange/amber)
    - Create visual indicators for "experimental" status (blue)
    - Use distinct colors or icons for each status
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [ ] 5.3 Add compatibility badges
    - Display Codex compatibility badge based on `services.codex.compatible`
    - Display Claude Code compatibility badge based on `services.claudecode.compatible`
    - Use existing badge/chip components
    - _Requirements: 4.4_

- [ ] 5.4 Write property test for status indicator consistency
  - **Property 6: Status Indicator Consistency**
  - **Validates: Requirements 6.1, 6.2, 6.3, 6.4**
  - Generate skills with various status values and verify each has distinct visual indicator
  - Minimum 100 iterations

- [ ] 5.5 Write property test for compatibility badge display
  - **Property 10: Compatibility Badge Display**
  - **Validates: Requirements 4.4**
  - Generate skills with various compatibility combinations and verify badges match boolean values
  - Minimum 100 iterations

- [ ] 5.6 Write unit tests for Skill Card component
  - Test rendering with sample skill data
  - Test status indicator for each status type
  - Test compatibility badges for different combinations
  - Test tag rendering
  - _Requirements: 4.3, 4.4, 6.1, 6.2, 6.3, 6.4_

- [ ] 6. Create Skills Page component
  - [ ] 6.1 Create `web/src/pages/SkillsPage.tsx`
    - Implement component with state for skills, loading, error, and searchQuery
    - Fetch skills data from API on component mount using `api.skills.list()`
    - Display loading indicator while fetching (use existing Spinner component)
    - Display error message if API call fails
    - Render skills in a grid layout using SkillCard components
    - _Requirements: 4.1, 4.2, 4.3, 4.5, 4.6_

  - [ ] 6.2 Implement search/filter functionality
    - Add search input field at top of page
    - Filter skills based on search query (name, summary, description, tags)
    - Implement case-insensitive search
    - Update displayed skills in real-time as user types
    - Display all skills when search is empty
    - _Requirements: 5.1, 5.2, 5.3_

  - [ ] 6.3 Implement error handling and retry
    - Display user-friendly error message when API fails
    - Provide "Retry" button to reload skills
    - Handle network offline state using existing OfflineIndicator
    - Display empty state message when no skills are available
    - _Requirements: 4.6, 7.1, 7.2, 7.3, 7.4_

- [ ] 6.4 Write property test for search filtering correctness
  - **Property 4: Search Filtering Correctness**
  - **Validates: Requirements 5.2**
  - Generate random skills data and search queries, verify filtered results only include matching skills
  - Minimum 100 iterations

- [ ] 6.5 Write property test for real-time filter updates
  - **Property 5: Real-time Filter Updates**
  - **Validates: Requirements 5.3, 8.2**
  - Generate random search inputs and verify UI updates within 200ms
  - Minimum 100 iterations

- [ ] 6.6 Write property test for loading state display
  - **Property 8: Loading State Display**
  - **Validates: Requirements 4.5, 8.1**
  - Verify loading indicator appears within 100ms of request starting
  - Minimum 100 iterations

- [ ]* 6.7 Write property test for error message display
  - **Property 9: Error Message Display**
  - **Validates: Requirements 4.6, 7.3, 7.4**
  - Generate various API error responses and verify user-friendly error message and retry action appear
  - Minimum 100 iterations

- [ ]* 6.8 Write unit tests for Skills Page component
  - Test skills rendering with mocked API response
  - Test loading state display
  - Test error state display and retry button
  - Test empty state display
  - Test search filtering with various queries
  - Test search clearing behavior
  - _Requirements: 4.1, 4.2, 4.5, 4.6, 5.1, 5.2, 5.3_

- [ ] 7. Integrate Skills navigation
  - [ ] 7.1 Add Skills route to `web/src/App.tsx`
    - Import SkillsPage component
    - Add `<Route path="/skills" element={<SkillsPage />} />` to Routes
    - _Requirements: 3.2_

  - [ ] 7.2 Add Skills navigation item to sidebar
    - Add NavIconLink for Skills in the navigation section
    - Use appropriate icon (e.g., Book, Library, or Package icon from lucide-react)
    - Place between existing navigation items
    - Ensure visual consistency with other nav items
    - _Requirements: 3.1, 3.3_

- [ ]* 7.3 Write unit test for navigation integration
  - Test that Skills menu item exists in navigation
  - Test that clicking Skills navigates to `/skills` route
  - Test that Skills page renders when route is accessed
  - _Requirements: 3.1, 3.2, 3.3_

- [ ] 8. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties with minimum 100 iterations
- Unit tests validate specific examples and edge cases
- The implementation follows existing patterns in the codebase for consistency
- Backend is completed first to ensure API is available for frontend development
- Frontend components are built incrementally: API client → Card component → Page component → Navigation
