import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import * as fc from 'fast-check'
import { SkillCard } from './SkillCard'
import type { SkillDto } from '@/api/types'

// Valid date arbitrary that generates ISO date strings
const validDateArbitrary = fc.integer({ min: 2020, max: 2030 }).chain((year) =>
  fc.integer({ min: 1, max: 12 }).chain((month) =>
    fc.integer({ min: 1, max: 28 }).map((day) =>
      `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00Z`
    )
  )
)

// Arbitrary for generating valid SkillDto
const skillDtoArbitrary = (status?: string): fc.Arbitrary<SkillDto> =>
  fc.record({
    slug: fc.string({ minLength: 1 }),
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
    status: status ? fc.constant(status) : fc.constantFrom('active', 'deprecated', 'experimental'),
    updatedAt: validDateArbitrary,
  })

/**
 * Property 6: Status Indicator Consistency
 * **Validates: Requirements 6.1, 6.2, 6.3, 6.4**
 * 
 * For any skill with status "active", "deprecated", or "experimental",
 * the skill card SHALL display a distinct visual indicator corresponding to that status.
 */
describe('Property 6: Status Indicator Consistency', () => {
  it('should display distinct visual indicator for each status type', () => {
    fc.assert(
      fc.property(skillDtoArbitrary(), (skill) => {
        const { unmount } = render(<SkillCard skill={skill} />)
        
        // Find the status badge by test id
        const statusBadge = screen.getByTestId(`status-${skill.status}`)
        expect(statusBadge).toBeInTheDocument()
        
        // Verify the badge has appropriate styling based on status
        const className = statusBadge.className
        
        if (skill.status === 'active') {
          expect(className).toContain('green')
        } else if (skill.status === 'deprecated') {
          expect(className).toContain('amber')
        } else if (skill.status === 'experimental') {
          expect(className).toContain('blue')
        }
        
        unmount()
      }),
      { numRuns: 100 }
    )
  })

  it('should display "Active" label with green styling for active status', () => {
    fc.assert(
      fc.property(skillDtoArbitrary('active'), (skill) => {
        const { unmount } = render(<SkillCard skill={skill} />)
        
        const statusBadge = screen.getByTestId('status-active')
        expect(statusBadge).toHaveTextContent('Active')
        expect(statusBadge.className).toContain('green')
        
        unmount()
      }),
      { numRuns: 100 }
    )
  })

  it('should display "Deprecated" label with amber styling for deprecated status', () => {
    fc.assert(
      fc.property(skillDtoArbitrary('deprecated'), (skill) => {
        const { unmount } = render(<SkillCard skill={skill} />)
        
        const statusBadge = screen.getByTestId('status-deprecated')
        expect(statusBadge).toHaveTextContent('Deprecated')
        expect(statusBadge.className).toContain('amber')
        
        unmount()
      }),
      { numRuns: 100 }
    )
  })

  it('should display "Experimental" label with blue styling for experimental status', () => {
    fc.assert(
      fc.property(skillDtoArbitrary('experimental'), (skill) => {
        const { unmount } = render(<SkillCard skill={skill} />)
        
        const statusBadge = screen.getByTestId('status-experimental')
        expect(statusBadge).toHaveTextContent('Experimental')
        expect(statusBadge.className).toContain('blue')
        
        unmount()
      }),
      { numRuns: 100 }
    )
  })
})

/**
 * Property 10: Compatibility Badge Display
 * **Validates: Requirements 4.4**
 * 
 * For any skill object, the skill card SHALL display compatibility badges
 * for both codex and claudecode based on the boolean values.
 */
describe('Property 10: Compatibility Badge Display', () => {
  it('should display Codex badge only when codex is compatible', () => {
    fc.assert(
      fc.property(skillDtoArbitrary(), (skill) => {
        const { unmount } = render(<SkillCard skill={skill} />)
        
        const codexBadge = screen.queryByTestId('codex-compatible')
        
        if (skill.services.codex.compatible) {
          expect(codexBadge).toBeInTheDocument()
          expect(codexBadge).toHaveTextContent('Codex')
        } else {
          expect(codexBadge).not.toBeInTheDocument()
        }
        
        unmount()
      }),
      { numRuns: 100 }
    )
  })

  it('should display Claude Code badge only when claudeCode is compatible', () => {
    fc.assert(
      fc.property(skillDtoArbitrary(), (skill) => {
        const { unmount } = render(<SkillCard skill={skill} />)
        
        const claudeCodeBadge = screen.queryByTestId('claudecode-compatible')
        
        if (skill.services.claudeCode.compatible) {
          expect(claudeCodeBadge).toBeInTheDocument()
          expect(claudeCodeBadge).toHaveTextContent('Claude Code')
        } else {
          expect(claudeCodeBadge).not.toBeInTheDocument()
        }
        
        unmount()
      }),
      { numRuns: 100 }
    )
  })

  it('should correctly display both badges when both services are compatible', () => {
    const bothCompatibleArbitrary = fc.record({
      slug: fc.string({ minLength: 1 }),
      name: fc.string({ minLength: 1 }),
      summary: fc.string(),
      description: fc.string(),
      visibility: fc.constantFrom('public', 'private'),
      tags: fc.array(fc.string({ minLength: 1 }), { maxLength: 5 }),
      services: fc.constant({
        codex: { compatible: true },
        claudeCode: { compatible: true },
      }),
      version: fc.string({ minLength: 1 }),
      buildId: fc.string(),
      status: fc.constantFrom('active', 'deprecated', 'experimental'),
      updatedAt: validDateArbitrary,
    })

    fc.assert(
      fc.property(bothCompatibleArbitrary, (skill) => {
        const { unmount } = render(<SkillCard skill={skill} />)
        
        expect(screen.getByTestId('codex-compatible')).toBeInTheDocument()
        expect(screen.getByTestId('claudecode-compatible')).toBeInTheDocument()
        
        unmount()
      }),
      { numRuns: 100 }
    )
  })

  it('should display no compatibility badges when neither service is compatible', () => {
    const neitherCompatibleArbitrary = fc.record({
      slug: fc.string({ minLength: 1 }),
      name: fc.string({ minLength: 1 }),
      summary: fc.string(),
      description: fc.string(),
      visibility: fc.constantFrom('public', 'private'),
      tags: fc.array(fc.string({ minLength: 1 }), { maxLength: 5 }),
      services: fc.constant({
        codex: { compatible: false },
        claudeCode: { compatible: false },
      }),
      version: fc.string({ minLength: 1 }),
      buildId: fc.string(),
      status: fc.constantFrom('active', 'deprecated', 'experimental'),
      updatedAt: validDateArbitrary,
    })

    fc.assert(
      fc.property(neitherCompatibleArbitrary, (skill) => {
        const { unmount } = render(<SkillCard skill={skill} />)
        
        expect(screen.queryByTestId('codex-compatible')).not.toBeInTheDocument()
        expect(screen.queryByTestId('claudecode-compatible')).not.toBeInTheDocument()
        
        unmount()
      }),
      { numRuns: 100 }
    )
  })
})

// Unit tests for SkillCard component
describe('SkillCard Unit Tests', () => {
  const sampleSkill: SkillDto = {
    slug: 'system/plan',
    name: 'Plan',
    summary: 'A planning skill',
    description: 'Detailed description of the planning skill',
    visibility: 'public',
    tags: ['planning', 'documentation'],
    services: {
      codex: { compatible: true },
      claudeCode: { compatible: true },
    },
    version: '1.0.0',
    buildId: '20260127.1',
    status: 'active',
    updatedAt: '2026-01-27T00:00:00Z',
  }

  it('should render skill name', () => {
    render(<SkillCard skill={sampleSkill} />)
    expect(screen.getByText('Plan')).toBeInTheDocument()
  })

  it('should render skill summary', () => {
    render(<SkillCard skill={sampleSkill} />)
    expect(screen.getByText('A planning skill')).toBeInTheDocument()
  })

  it('should render skill description when different from summary', () => {
    render(<SkillCard skill={sampleSkill} />)
    expect(screen.getByText('Detailed description of the planning skill')).toBeInTheDocument()
  })

  it('should not render description when same as summary', () => {
    const skillWithSameDesc: SkillDto = {
      ...sampleSkill,
      description: 'A planning skill',
    }
    render(<SkillCard skill={skillWithSameDesc} />)
    // Should only appear once (as summary)
    const elements = screen.getAllByText('A planning skill')
    expect(elements).toHaveLength(1)
  })

  it('should render all tags', () => {
    render(<SkillCard skill={sampleSkill} />)
    expect(screen.getByText('planning')).toBeInTheDocument()
    expect(screen.getByText('documentation')).toBeInTheDocument()
  })

  it('should render version', () => {
    render(<SkillCard skill={sampleSkill} />)
    expect(screen.getByText('v1.0.0')).toBeInTheDocument()
  })

  it('should render status badge for active status', () => {
    render(<SkillCard skill={sampleSkill} />)
    expect(screen.getByTestId('status-active')).toHaveTextContent('Active')
  })

  it('should render status badge for deprecated status', () => {
    const deprecatedSkill: SkillDto = { ...sampleSkill, status: 'deprecated' }
    render(<SkillCard skill={deprecatedSkill} />)
    expect(screen.getByTestId('status-deprecated')).toHaveTextContent('Deprecated')
  })

  it('should render status badge for experimental status', () => {
    const experimentalSkill: SkillDto = { ...sampleSkill, status: 'experimental' }
    render(<SkillCard skill={experimentalSkill} />)
    expect(screen.getByTestId('status-experimental')).toHaveTextContent('Experimental')
  })

  it('should render compatibility badges when both services are compatible', () => {
    render(<SkillCard skill={sampleSkill} />)
    expect(screen.getByTestId('codex-compatible')).toBeInTheDocument()
    expect(screen.getByTestId('claudecode-compatible')).toBeInTheDocument()
  })

  it('should not render Codex badge when not compatible', () => {
    const skillWithoutCodex: SkillDto = {
      ...sampleSkill,
      services: {
        codex: { compatible: false },
        claudeCode: { compatible: true },
      },
    }
    render(<SkillCard skill={skillWithoutCodex} />)
    expect(screen.queryByTestId('codex-compatible')).not.toBeInTheDocument()
    expect(screen.getByTestId('claudecode-compatible')).toBeInTheDocument()
  })

  it('should not render Claude Code badge when not compatible', () => {
    const skillWithoutClaudeCode: SkillDto = {
      ...sampleSkill,
      services: {
        codex: { compatible: true },
        claudeCode: { compatible: false },
      },
    }
    render(<SkillCard skill={skillWithoutClaudeCode} />)
    expect(screen.getByTestId('codex-compatible')).toBeInTheDocument()
    expect(screen.queryByTestId('claudecode-compatible')).not.toBeInTheDocument()
  })

  it('should handle empty tags array', () => {
    const skillWithNoTags: SkillDto = { ...sampleSkill, tags: [] }
    render(<SkillCard skill={skillWithNoTags} />)
    expect(screen.getByText('Plan')).toBeInTheDocument()
    expect(screen.queryByText('planning')).not.toBeInTheDocument()
  })
})
