"use client"

import ReactMarkdown from 'react-markdown'

interface MarkdownRendererProps {
  content: string
}

export default function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <div className="markdown-content">
      <ReactMarkdown>{content}</ReactMarkdown>
      <style jsx>{`
        .markdown-content :global(h2) {
          font-size: 1rem;
          font-weight: 600;
          margin-top: 1rem;
          margin-bottom: 0.5rem;
          color: var(--text-primary);
        }
        .markdown-content :global(h3) {
          font-size: 0.875rem;
          font-weight: 600;
          margin-top: 0.75rem;
          margin-bottom: 0.375rem;
          color: var(--text-primary);
        }
        .markdown-content :global(p) {
          margin-bottom: 0.5rem;
          line-height: 1.6;
        }
        .markdown-content :global(strong) {
          font-weight: 600;
          color: var(--text-primary);
        }
        .markdown-content :global(ul),
        .markdown-content :global(ol) {
          padding-left: 1.25rem;
          margin-bottom: 0.5rem;
        }
        .markdown-content :global(ul) {
          list-style-type: disc;
        }
        .markdown-content :global(ol) {
          list-style-type: decimal;
        }
        .markdown-content :global(li) {
          margin-bottom: 0.25rem;
          line-height: 1.5;
        }
        .markdown-content :global(code) {
          background: var(--bg-tertiary);
          padding: 0.125rem 0.375rem;
          border-radius: 0.25rem;
          font-size: 0.8em;
        }
        .markdown-content :global(pre) {
          background: var(--bg-primary);
          padding: 0.75rem;
          border-radius: 0.5rem;
          overflow-x: auto;
          margin-bottom: 0.5rem;
        }
        .markdown-content :global(pre code) {
          background: none;
          padding: 0;
        }
        .markdown-content :global(p:last-child) {
          margin-bottom: 0;
        }
      `}</style>
    </div>
  )
}
