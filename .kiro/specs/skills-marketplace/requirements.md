# Requirements Document: Skills Marketplace

## Introduction

The Skills Marketplace feature enables users to discover and browse available skills fetched from a GitHub repository. Users can view skill details, filter by tags, search by keywords, and understand the status and capabilities of each skill. This feature provides a centralized catalog of skills with rich metadata to help users find the right tools for their needs.

## Glossary

- **Skill**: A reusable capability or tool available in the marketplace, defined by metadata including name, description, tags, and version
- **Skills_API**: The backend ASP.NET Core Web API that fetches and serves skill data
- **Skills_UI**: The React+TypeScript frontend that displays the skills marketplace
- **GitHub_Source**: The remote JSON file at https://raw.githubusercontent.com/AIDotNet/MoYuCode/refs/heads/main/skills/index.json
- **Skill_Card**: A UI component displaying a single skill's information
- **Filter**: A mechanism to narrow down displayed skills based on tags or search terms
- **Status**: The current state of a skill (e.g., active, deprecated, beta)
- **Visibility**: Whether a skill is public or private

## Requirements

### Requirement 1: Fetch Skills Data from GitHub

**User Story:** As a system, I want to fetch skills data from the GitHub repository, so that the marketplace displays current and accurate skill information.

#### Acceptance Criteria

1. WHEN the Skills_API receives a request for skills data, THE Skills_API SHALL fetch the JSON file from the GitHub_Source
2. WHEN the GitHub_Source is unavailable, THE Skills_API SHALL return an appropriate error response with status code 503
3. WHEN the fetched JSON is invalid or malformed, THE Skills_API SHALL return an error response with status code 502
4. WHEN the JSON is successfully fetched and parsed, THE Skills_API SHALL return the skills data with status code 200
5. THE Skills_API SHALL include appropriate HTTP headers for caching to reduce unnecessary requests to GitHub_Source

### Requirement 2: Expose Skills API Endpoint

**User Story:** As a frontend developer, I want a REST API endpoint to retrieve skills data, so that the UI can display the marketplace.

#### Acceptance Criteria

1. THE Skills_API SHALL expose a GET endpoint at `/api/skills` that returns the skills data
2. WHEN the endpoint is called, THE Skills_API SHALL return a JSON response containing the version, generatedAt timestamp, and skills array
3. WHEN an error occurs during data fetching, THE Skills_API SHALL return an appropriate HTTP error status code and error message
4. THE Skills_API SHALL set appropriate CORS headers to allow requests from the frontend origin

### Requirement 3: Display Skills in the UI

**User Story:** As a user, I want to view available skills in a card-based layout, so that I can browse and understand what each skill offers.

#### Acceptance Criteria

1. WHEN a user navigates to the Skills page, THE Skills_UI SHALL display all skills as Skill_Cards in a responsive grid layout
2. WHEN displaying a Skill_Card, THE Skills_UI SHALL show the skill's name, summary, description, tags, version, and status
3. WHEN a skill has no description, THE Skills_UI SHALL display only the summary without showing an empty description field
4. WHEN the skills data is loading, THE Skills_UI SHALL display a loading indicator
5. WHEN the skills data fails to load, THE Skills_UI SHALL display an error message with retry option

### Requirement 4: Implement Search Functionality

**User Story:** As a user, I want to search for skills by keywords, so that I can quickly find skills relevant to my needs.

#### Acceptance Criteria

1. THE Skills_UI SHALL provide a search input field at the top of the Skills page
2. WHEN a user types in the search field, THE Skills_UI SHALL filter displayed skills to show only those matching the search term
3. WHEN matching against search terms, THE Skills_UI SHALL search within skill name, summary, description, and tags (case-insensitive)
4. WHEN no skills match the search term, THE Skills_UI SHALL display a "No skills found" message
5. WHEN the search field is cleared, THE Skills_UI SHALL display all skills again

### Requirement 5: Implement Tag Filtering

**User Story:** As a user, I want to filter skills by tags, so that I can find skills in specific categories.

#### Acceptance Criteria

1. THE Skills_UI SHALL display all unique tags from the skills dataset as filter options
2. WHEN a user selects one or more tags, THE Skills_UI SHALL display only skills that have at least one of the selected tags
3. WHEN no tags are selected, THE Skills_UI SHALL display all skills
4. WHEN both search and tag filters are active, THE Skills_UI SHALL display skills that match both the search term AND have at least one selected tag
5. THE Skills_UI SHALL display the count of currently displayed skills versus total skills

### Requirement 6: Add Skills Navigation Menu

**User Story:** As a user, I want to access the Skills marketplace from the main navigation, so that I can easily discover available skills.

#### Acceptance Criteria

1. THE Skills_UI SHALL add a "Skills" menu item to the main navigation
2. WHEN a user clicks the Skills menu item, THE Skills_UI SHALL navigate to the Skills page at route `/skills`
3. WHEN the user is on the Skills page, THE Skills_UI SHALL highlight the Skills menu item as active

### Requirement 7: Display Skill Metadata

**User Story:** As a user, I want to see detailed metadata for each skill, so that I can understand its capabilities and status.

#### Acceptance Criteria

1. WHEN displaying a Skill_Card, THE Skills_UI SHALL show the skill version in a visible badge or label
2. WHEN displaying a Skill_Card, THE Skills_UI SHALL show the skill status with appropriate visual styling (e.g., color coding)
3. WHEN a skill has tags, THE Skills_UI SHALL display them as clickable badges that activate the tag filter
4. WHEN a skill has services information (codex, claudecode), THE Skills_UI SHALL display which services support the skill
5. THE Skills_UI SHALL format the updatedAt timestamp in a human-readable format (e.g., "Updated 2 days ago")

### Requirement 8: Handle Empty and Error States

**User Story:** As a user, I want clear feedback when no skills are available or when errors occur, so that I understand the system state.

#### Acceptance Criteria

1. WHEN the skills array is empty, THE Skills_UI SHALL display a message indicating no skills are available
2. WHEN a network error occurs, THE Skills_UI SHALL display an error message with a retry button
3. WHEN the user clicks retry, THE Skills_UI SHALL attempt to fetch the skills data again
4. WHEN the API returns an error status, THE Skills_UI SHALL display the error message from the API response
5. THE Skills_UI SHALL log errors to the browser console for debugging purposes

### Requirement 9: Ensure Responsive Design

**User Story:** As a user on any device, I want the Skills marketplace to work well on my screen size, so that I can browse skills comfortably.

#### Acceptance Criteria

1. THE Skills_UI SHALL display Skill_Cards in a responsive grid that adapts to screen width
2. WHEN viewed on mobile devices, THE Skills_UI SHALL display one Skill_Card per row
3. WHEN viewed on tablet devices, THE Skills_UI SHALL display two Skill_Cards per row
4. WHEN viewed on desktop devices, THE Skills_UI SHALL display three or more Skill_Cards per row
5. THE Skills_UI SHALL ensure all interactive elements (search, filters, cards) are touch-friendly on mobile devices

### Requirement 10: Optimize Performance

**User Story:** As a user, I want the Skills marketplace to load quickly and respond smoothly, so that I have a pleasant browsing experience.

#### Acceptance Criteria

1. THE Skills_API SHALL cache the GitHub_Source response for at least 5 minutes to reduce external API calls
2. WHEN filtering or searching, THE Skills_UI SHALL update the display within 100ms for datasets up to 1000 skills
3. THE Skills_UI SHALL implement virtual scrolling or pagination if the skills array exceeds 100 items
4. THE Skills_API SHALL compress responses using gzip when the client supports it
5. THE Skills_UI SHALL lazy-load images or icons if skills include visual assets
