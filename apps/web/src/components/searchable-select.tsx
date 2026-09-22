'use client'

import { useEffect, useRef, useState } from 'react'

export interface SearchableSelectOption {
  value: string
  label: string
  description?: string
}

export function SearchableSelect({
  label,
  value,
  selectedLabel,
  placeholder,
  minChars = 2,
  density = 'compact',
  onSearch,
  onChange,
}: {
  label: string
  value: string
  selectedLabel?: string
  placeholder: string
  minChars?: number
  density?: 'compact' | 'comfortable'
  onSearch: (q: string) => Promise<SearchableSelectOption[]>
  onChange: (option: SearchableSelectOption) => void
}) {
  const [query, setQuery] = useState(selectedLabel ?? '')
  const [options, setOptions] = useState<SearchableSelectOption[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestIdRef = useRef(0)

  useEffect(() => {
    if (selectedLabel && value) setQuery(selectedLabel)
  }, [selectedLabel, value])

  useEffect(() => {
    if (query.trim().length < minChars) {
      setOptions([])
      setError(null)
      setLoading(false)
      return
    }

    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    const timeout = window.setTimeout(() => {
      setLoading(true)
      setError(null)
      onSearch(query.trim())
        .then(result => {
          if (requestIdRef.current !== requestId) return
          setOptions(result)
        })
        .catch(() => {
          if (requestIdRef.current !== requestId) return
          setError('Arama sırasında hata oluştu')
          setOptions([])
        })
        .finally(() => {
          if (requestIdRef.current === requestId) setLoading(false)
        })
    }, 300)

    return () => window.clearTimeout(timeout)
  }, [minChars, onSearch, query])

  const inputClass = density === 'compact' ? 'app-input-dense' : 'app-input'

  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-bold uppercase tracking-widest text-ink-subtle">{label}</label>
      <input
        className={inputClass}
        value={query}
        placeholder={placeholder}
        onChange={event => setQuery(event.target.value)}
      />
      <div className="rounded-md border border-surface-border bg-surface">
        {query.trim().length < minChars ? (
          <div className="px-3 py-2 text-[11px] text-ink-muted">En az {minChars} karakter girin.</div>
        ) : loading ? (
          <div className="px-3 py-2 text-[11px] text-ink-muted">Aranıyor...</div>
        ) : error ? (
          <div className="px-3 py-2 text-[11px] text-status-danger">{error}</div>
        ) : options.length === 0 ? (
          <div className="px-3 py-2 text-[11px] text-ink-muted">Sonuç bulunamadı.</div>
        ) : (
          <div className="max-h-44 overflow-y-auto py-1">
            {options.map(option => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option)
                  setQuery(option.label)
                  setOptions([])
                }}
                className={`block w-full px-3 py-2 text-left text-xs hover:bg-surface-subtle ${
                  option.value === value ? 'bg-brand/5 text-brand' : 'text-ink'
                }`}
              >
                <span className="block font-medium">{option.label}</span>
                {option.description ? (
                  <span className="block text-[10px] text-ink-subtle">{option.description}</span>
                ) : null}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
