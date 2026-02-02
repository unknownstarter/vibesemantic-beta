"use client"

interface SuggestionChipsProps {
  questions: string[]
  onSelect: (question: string) => void
}

export default function SuggestionChips({ questions, onSelect }: SuggestionChipsProps) {
  if (questions.length === 0) return null

  return (
    <div className="flex flex-wrap gap-1.5 px-1">
      {questions.map((q, i) => (
        <button
          key={i}
          onClick={() => onSelect(q)}
          className="rounded-lg border px-3 py-1.5 text-xs hover:bg-white/5"
          style={{
            borderColor: 'var(--border-color)',
            color: 'var(--text-secondary)',
          }}
        >
          {q}
        </button>
      ))}
    </div>
  )
}
