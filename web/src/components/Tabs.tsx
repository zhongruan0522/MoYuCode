import { cn } from '@/lib/utils'

export type TabItem = {
  key: string
  label: string
  disabled?: boolean
}

export function Tabs({
  items,
  activeKey,
  onChange,
}: {
  items: TabItem[]
  activeKey: string
  onChange: (key: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => {
        const active = item.key === activeKey
        const disabled = Boolean(item.disabled)

        return (
          <button
            key={item.key}
            type="button"
            disabled={disabled}
            onClick={() => onChange(item.key)}
            className={cn(
              'rounded-md border px-3 py-1.5 text-sm transition-colors',
              active
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background hover:bg-accent hover:text-accent-foreground',
              disabled && 'opacity-50 cursor-not-allowed hover:bg-background',
            )}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}

