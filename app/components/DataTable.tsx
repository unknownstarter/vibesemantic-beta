"use client"

import { useState, useMemo } from 'react'

interface DataTableProps {
  data: Record<string, unknown>[]
  columns: string[]
  onRowClick?: (row: Record<string, unknown>, rowIndex: number) => void
}

export default function DataTable({ data, columns, onRowClick }: DataTableProps) {
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortAsc, setSortAsc] = useState(true)
  const [filterText, setFilterText] = useState('')

  const filtered = useMemo(() => {
    if (!filterText) return data
    const lower = filterText.toLowerCase()
    return data.filter(row =>
      columns.some(col => String(row[col] ?? '').toLowerCase().includes(lower))
    )
  }, [data, columns, filterText])

  const sorted = useMemo(() => {
    if (!sortKey) return filtered
    return [...filtered].sort((a, b) => {
      const va = a[sortKey] ?? ''
      const vb = b[sortKey] ?? ''
      const numA = Number(va)
      const numB = Number(vb)
      if (!isNaN(numA) && !isNaN(numB)) {
        return sortAsc ? numA - numB : numB - numA
      }
      const strA = String(va)
      const strB = String(vb)
      return sortAsc ? strA.localeCompare(strB) : strB.localeCompare(strA)
    })
  }, [filtered, sortKey, sortAsc])

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc)
    } else {
      setSortKey(key)
      setSortAsc(true)
    }
  }

  const displayRows = sorted.slice(0, 100)

  return (
    <div className="overflow-hidden rounded-xl border" style={{ borderColor: 'var(--border-color)' }}>
      {/* Filter */}
      <div className="border-b px-3 py-2" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-card)' }}>
        <input
          type="text"
          value={filterText}
          onChange={e => setFilterText(e.target.value)}
          placeholder="Filter rows..."
          className="w-full bg-transparent text-xs outline-none"
          style={{ color: 'var(--text-primary)' }}
        />
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr style={{ background: 'var(--bg-tertiary)' }}>
              {columns.map(col => (
                <th
                  key={col}
                  className="cursor-pointer select-none border-b px-3 py-2 text-left font-medium"
                  style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}
                  onClick={() => handleSort(col)}
                >
                  {col}
                  {sortKey === col && (
                    <span className="ml-1">{sortAsc ? '↑' : '↓'}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row, i) => (
              <tr
                key={i}
                className="cursor-pointer hover:bg-white/5"
                onClick={() => onRowClick?.(row, i)}
              >
                {columns.map(col => (
                  <td
                    key={col}
                    className="border-b px-3 py-1.5"
                    style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                  >
                    {String(row[col] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div
        className="px-3 py-1.5 text-xs"
        style={{ background: 'var(--bg-card)', color: 'var(--text-tertiary)' }}
      >
        {filtered.length === data.length
          ? `${data.length}행`
          : `${filtered.length}/${data.length}행 (필터링됨)`}
        {sorted.length > 100 && ' — 처음 100행만 표시'}
      </div>
    </div>
  )
}
