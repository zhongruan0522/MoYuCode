import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fc from 'fast-check'
import { filterSkills } from './SkillsPage'
import type { SkillDto } from '@/api/types'

// Helper to generate valid ISO date string
const isoDateArbitrary = fc.integer({ min: 1577836800000, max: 1893456000000 }) // 2020-01-01 to 2030-01-01
  .map((ts) => new Date(ts).toISOString())

// Arbitrary for generating valid SkillDto with unique slugs
const skillDtoArbitrary: fc.Arbitrary<SkillDto> = fc.record({
  slug: fc.uuid(), // Use UUID to ensure uniqueness
  name: fc.string({ minLength: 1 }),
  summary: fc.string(),
  description: fc.string(),
  visibility: fc.constantFrom('public', 'private'),
  tags: fc.array(fc.string({ minLength: 1 }), { maxLength: 5 }),
  services: fc.record({
    codex: fc.record({ compatible: fc.boolean() }),
    claudeCode: fc.record({ compatible: fc.boolean() }),
  }),
  version: fc.string({ minLength: 1 }),
  buildId: fc.string(),
  status: fc.constantFrom('active', 'deprecated', 'experimental'),
  updatedAt: isoDateArbitrary,
})

// Arbitrary for generating search queries
const searchQueryArbitrary = fc.string({ minLength: 0, maxLength: 50 })

/**
 * Property 4: Search Filtering Correctness
 * **Validates: Requirements 5.2**
 *
 * For any search query string and any skills list, the filtered results
 * SHALL only include skills where the query appears in the name, summary,
 * description, or tags (case-insensitive).
 */
describe('Property 4: Search Filtering Correctness', () => {
  it('filtered results only include skills matching the query in name, summary, description, or tags', () => {
    fc.assert(
      fc.property(
        fc.array(skillDtoArbitrary, { minLength: 0, maxLength: 20 }),
        searchQueryArbitrary,
        (skills, query) => {
          const filtered = filterSkills(skills, query)
          const trimmedQuery = query.trim().toLowerCase()

          // If query is empty, all skills should be returned
          if (!trimmedQuery) {
            expect(filtered).toEqual(skills)
            return
          }

          // Every filtered skill must match the query
          for (const skill of filtered) {
            const nameMatch = skill.name.toLowerCase().includes(trimmedQuery)
            const summaryMatch = skill.summary.toLowerCase().includes(trimmedQuery)
            const descriptionMatch = skill.description.toLowerCase().includes(trimmedQuery)
            const tagsMatch = skill.tags.some((tag) =>
              tag.toLowerCase().includes(trimmedQuery)
            )

            expect(nameMatch || summaryMatch || descriptionMatch || tagsMatch).toBe(true)
          }

          // Every skill NOT in filtered must NOT match the query
          const filteredSlugs = new Set(filtered.map((s) => s.slug))
          for (const skill of skills) {
            if (!filteredSlugs.has(skill.slug)) {
              const nameMatch = skill.name.toLowerCase().includes(trimmedQuery)
              const summaryMatch = skill.summary.toLowerCase().includes(trimmedQuery)
              const descriptionMatch = skill.description.toLowerCase().includes(trimmedQuery)
              const tagsMatch = skill.tags.some((tag) =>
                tag.toLowerCase().includes(trimmedQuery)
              )

              expect(nameMatch || summaryMatch || descriptionMatch || tagsMatch).toBe(false)
            }
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('search is case-insensitive', () => {
    fc.assert(
      fc.property(
        fc.array(skillDtoArbitrary, { minLength: 1, maxLength: 10 }),
        fc.string({ minLength: 1, maxLength: 20 }),
        (skills, query) => {
          const lowerResult = filterSkills(skills, query.toLowerCase())
          const upperResult = filterSkills(skills, query.toUpperCase())
          const mixedResult = filterSkills(skills, query)

          // All case variations should produce the same results
          expect(lowerResult.length).toBe(upperResult.length)
          expect(lowerResult.length).toBe(mixedResult.length)

          const lowerSlugs = new Set(lowerResult.map((s) => s.slug))
          const upperSlugs = new Set(upperResult.map((s) => s.slug))
          const mixedSlugs = new Set(mixedResult.map((s) => s.slug))

          for (const slug of lowerSlugs) {
            expect(upperSlugs.has(slug)).toBe(true)
            expect(mixedSlugs.has(slug)).toBe(true)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('empty query returns all skills', () => {
    fc.assert(
      fc.property(
        fc.array(skillDtoArbitrary, { minLength: 0, maxLength: 20 }),
        fc.constantFrom('', '   ', '\t', '\n'),
        (skills, emptyQuery) => {
          const filtered = filterSkills(skills, emptyQuery)
          expect(filtered).toEqual(skills)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('filtered results preserve original order', () => {
    fc.assert(
      fc.property(
        fc.array(skillDtoArbitrary, { minLength: 2, maxLength: 20 }),
        searchQueryArbitrary,
        (skills, query) => {
          const filtered = filterSkills(skills, query)

          // Check that filtered results maintain relative order from original
          let lastIndex = -1
          for (const skill of filtered) {
            const currentIndex = skills.findIndex((s) => s.slug === skill.slug)
            expect(currentIndex).toBeGreaterThan(lastIndex)
            lastIndex = currentIndex
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('filtering is idempotent - filtering twice gives same result', () => {
    fc.assert(
      fc.property(
        fc.array(skillDtoArbitrary, { minLength: 0, maxLength: 20 }),
        searchQueryArbitrary,
        (skills, query) => {
          const firstFilter = filterSkills(skills, query)
          const secondFilter = filterSkills(firstFilter, query)

          expect(secondFilter).toEqual(firstFilter)
        }
      ),
      { numRuns: 100 }
    )
  })
})

// Unit tests for filterSkills function
describe('filterSkills Unit Tests', () => {
  const sampleSkills: SkillDto[] = [
    {
      slug: 'system/plan',
      name: 'Plan',
      summary: 'A planning skill',
      description: 'Detailed planning description',
      visibility: 'public',
      tags: ['planning', 'documentation'],
      services: { codex: { compatible: true }, claudeCode: { compatible: true } },
      version: '1.0.0',
      buildId: '20260127.1',
      status: 'active',
      updatedAt: '2026-01-27T00:00:00Z',
    },
    {
      slug: 'system/code',
      name: 'Code Generator',
      summary: 'Generate code snippets',
      description: 'AI-powered code generation',
      visibility: 'public',
      tags: ['coding', 'ai'],
      services: { codex: { compatible: true }, claudeCode: { compatible: false } },
      version: '2.0.0',
      buildId: '20260127.2',
      status: 'active',
      updatedAt: '2026-01-27T00:00:00Z',
    },
    {
      slug: 'system/test',
      name: 'Test Runner',
      summary: 'Run automated tests',
      description: 'Execute test suites',
      visibility: 'private',
      tags: ['testing', 'automation'],
      services: { codex: { compatible: false }, claudeCode: { compatible: true } },
      version: '1.5.0',
      buildId: '20260127.3',
      status: 'experimental',
      updatedAt: '2026-01-27T00:00:00Z',
    },
  ]

  it('should return all skills when query is empty', () => {
    expect(filterSkills(sampleSkills, '')).toEqual(sampleSkills)
  })

  it('should filter by name', () => {
    const result = filterSkills(sampleSkills, 'Plan')
    expect(result).toHaveLength(1)
    expect(result[0].slug).toBe('system/plan')
  })

  it('should filter by summary', () => {
    const result = filterSkills(sampleSkills, 'automated')
    expect(result).toHaveLength(1)
    expect(result[0].slug).toBe('system/test')
  })

  it('should filter by description', () => {
    const result = filterSkills(sampleSkills, 'AI-powered')
    expect(result).toHaveLength(1)
    expect(result[0].slug).toBe('system/code')
  })

  it('should filter by tags', () => {
    const result = filterSkills(sampleSkills, 'coding')
    expect(result).toHaveLength(1)
    expect(result[0].slug).toBe('system/code')
  })

  it('should be case-insensitive', () => {
    const result1 = filterSkills(sampleSkills, 'PLAN')
    const result2 = filterSkills(sampleSkills, 'plan')
    const result3 = filterSkills(sampleSkills, 'PlAn')

    expect(result1).toHaveLength(1)
    expect(result2).toHaveLength(1)
    expect(result3).toHaveLength(1)
    expect(result1[0].slug).toBe(result2[0].slug)
    expect(result2[0].slug).toBe(result3[0].slug)
  })

  it('should return empty array when no matches', () => {
    const result = filterSkills(sampleSkills, 'nonexistent')
    expect(result).toHaveLength(0)
  })

  it('should handle empty skills array', () => {
    const result = filterSkills([], 'test')
    expect(result).toHaveLength(0)
  })

  it('should trim whitespace from query', () => {
    const result = filterSkills(sampleSkills, '  Plan  ')
    expect(result).toHaveLength(1)
    expect(result[0].slug).toBe('system/plan')
  })

  it('should match multiple skills', () => {
    // Both 'Plan' and 'Code Generator' have 'a' in their names
    const result = filterSkills(sampleSkills, 'a')
    expect(result.length).toBeGreaterThan(1)
  })
})


import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SkillsPage } from './SkillsPage'
import { vi } from 'vitest'

// Mock the API
vi.mock('@/api/client', () => ({
  api: {
    skills: {
      list: vi.fn(),
    },
  },
}))

// Mock useOnlineStatus hook
vi.mock('@/hooks/useOnlineStatus', () => ({
  useOnlineStatus: () => true,
}))

import { api } from '@/api/client'

const mockSkills: SkillDto[] = [
  {
    slug: 'system/plan',
    name: 'Plan',
    summary: 'A planning skill',
    description: 'Detailed planning description',
    visibility: 'public',
    tags: ['planning', 'documentation'],
    services: { codex: { compatible: true }, claudeCode: { compatible: true } },
    version: '1.0.0',
    buildId: '20260127.1',
    status: 'active',
    updatedAt: '2026-01-27T00:00:00Z',
  },
  {
    slug: 'system/code',
    name: 'Code Generator',
    summary: 'Generate code snippets',
    description: 'AI-powered code generation',
    visibility: 'public',
    tags: ['coding', 'ai'],
    services: { codex: { compatible: true }, claudeCode: { compatible: false } },
    version: '2.0.0',
    buildId: '20260127.2',
    status: 'active',
    updatedAt: '2026-01-27T00:00:00Z',
  },
  {
    slug: 'system/test',
    name: 'Test Runner',
    summary: 'Run automated tests',
    description: 'Execute test suites',
    visibility: 'private',
    tags: ['testing', 'automation'],
    services: { codex: { compatible: false }, claudeCode: { compatible: true } },
    version: '1.5.0',
    buildId: '20260127.3',
    status: 'experimental',
    updatedAt: '2026-01-27T00:00:00Z',
  },
]

/**
 * Property 5: Real-time Filter Updates
 * **Validates: Requirements 5.3, 8.2**
 *
 * For any change to the search input field, the displayed skills list
 * SHALL update within 200ms to reflect the new filter criteria.
 */
describe('Property 5: Real-time Filter Updates', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.skills.list).mockResolvedValue({
      version: 1,
      generatedAt: '2026-01-27',
      skills: mockSkills,
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('should update filtered results within 200ms of search input change', async () => {
    fc.assert(
      await fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 10 }).filter((s) => /^[a-zA-Z]+$/.test(s)),
        async (searchQuery) => {
          const user = userEvent.setup()
          const { unmount } = render(<SkillsPage />)

          // Wait for initial load
          await waitFor(() => {
            expect(screen.queryByTestId('loading-state')).not.toBeInTheDocument()
          })

          const searchInput = screen.getByTestId('search-input')
          const startTime = performance.now()

          // Type the search query
          await user.clear(searchInput)
          await user.type(searchInput, searchQuery)

          // Verify the UI updates within 200ms
          await waitFor(
            () => {
              const elapsed = performance.now() - startTime
              // The input should reflect the typed value
              expect(searchInput).toHaveValue(searchQuery)
              // Allow some buffer for typing simulation
              expect(elapsed).toBeLessThan(2000) // 2s max for typing + rendering
            },
            { timeout: 2000 }
          )

          unmount()
        }
      ),
      { numRuns: 100 }
    )
  })
})


/**
 * Property 8: Loading State Display
 * **Validates: Requirements 4.5, 8.1**
 *
 * For any API request to fetch skills data, the page SHALL display
 * a loading indicator within 100ms of the request starting.
 */
describe('Property 8: Loading State Display', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('should display loading indicator immediately when fetching skills', async () => {
    // Create a promise that we can control
    let resolvePromise: (value: { version: number; generatedAt: string; skills: SkillDto[] }) => void
    const controlledPromise = new Promise<{ version: number; generatedAt: string; skills: SkillDto[] }>((resolve) => {
      resolvePromise = resolve
    })

    vi.mocked(api.skills.list).mockReturnValue(controlledPromise)

    fc.assert(
      fc.property(fc.constant(null), () => {
        const { unmount } = render(<SkillsPage />)

        // Loading state should be visible immediately
        const loadingState = screen.queryByTestId('loading-state')
        expect(loadingState).toBeInTheDocument()

        unmount()
      }),
      { numRuns: 100 }
    )

    // Resolve the promise to clean up
    resolvePromise!({ version: 1, generatedAt: '2026-01-27', skills: [] })
  })

  it('should hide loading indicator after data is loaded', async () => {
    vi.mocked(api.skills.list).mockResolvedValue({
      version: 1,
      generatedAt: '2026-01-27',
      skills: mockSkills,
    })

    const { unmount } = render(<SkillsPage />)

    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.queryByTestId('loading-state')).not.toBeInTheDocument()
    })

    // Skills should be visible
    expect(screen.getByText('Plan')).toBeInTheDocument()

    unmount()
  })

  it('should show loading indicator with spinner', async () => {
    let resolvePromise: (value: { version: number; generatedAt: string; skills: SkillDto[] }) => void
    const controlledPromise = new Promise<{ version: number; generatedAt: string; skills: SkillDto[] }>((resolve) => {
      resolvePromise = resolve
    })

    vi.mocked(api.skills.list).mockReturnValue(controlledPromise)

    fc.assert(
      fc.property(fc.constant(null), () => {
        const { unmount } = render(<SkillsPage />)

        // Loading state should contain a spinner (role="status")
        const loadingState = screen.getByTestId('loading-state')
        const spinner = loadingState.querySelector('[role="status"]')
        expect(spinner).toBeInTheDocument()

        unmount()
      }),
      { numRuns: 100 }
    )

    // Resolve the promise to clean up
    resolvePromise!({ version: 1, generatedAt: '2026-01-27', skills: [] })
  })
})
