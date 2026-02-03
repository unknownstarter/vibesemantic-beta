"use client"

import type { AnalysisPlan } from '@/lib/types'

interface PlanViewProps {
  plan: AnalysisPlan
  elapsedSeconds?: number
}

export default function PlanView({ plan, elapsedSeconds }: PlanViewProps) {
  const completedCount = plan.steps.filter(s => s.status === 'success').length
  const totalCount = plan.steps.length

  return (
    <div
      className="rounded-xl border p-3"
      style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}
    >
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
          분석 계획
        </h4>
        <div className="flex items-center gap-2">
          {plan.status === 'executing' && (
            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              {completedCount}/{totalCount}단계
              {elapsedSeconds != null && elapsedSeconds > 0 && ` · ${elapsedSeconds}초`}
            </span>
          )}
          <span
            className="rounded px-1.5 py-0.5 text-xs"
            style={{
              background: plan.status === 'complete' ? 'var(--success)' :
                          plan.status === 'failed' ? 'var(--error)' :
                          'var(--accent-dim)',
              color: 'var(--bg-primary)',
            }}
          >
            {plan.status === 'complete' ? '완료' :
             plan.status === 'failed' ? '실패' :
             plan.status === 'executing' ? '실행 중' : '계획 중'}
          </span>
        </div>
      </div>

      <p className="mb-2 text-xs" style={{ color: 'var(--text-primary)' }}>
        {plan.goal}
      </p>

      <div className="space-y-1.5">
        {plan.steps.map((step) => (
          <div key={step.id}>
            <div className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0 text-xs">
                {step.status === 'success' ? '✓' :
                 step.status === 'running' ? '→' :
                 step.status === 'failed' ? '✗' : '○'}
              </span>
              <span
                className="text-xs"
                style={{
                  color: step.status === 'success' ? 'var(--success)' :
                         step.status === 'running' ? 'var(--accent)' :
                         step.status === 'failed' ? 'var(--error)' :
                         'var(--text-tertiary)',
                }}
              >
                {step.description}
              </span>
            </div>
            {/* 완료된 스텝의 stdout 미리보기 */}
            {step.status === 'success' && step.result?.stdout && (
              <p
                className="ml-5 mt-0.5 line-clamp-3 text-xs"
                style={{ color: 'var(--text-tertiary)' }}
              >
                {step.result.stdout.slice(0, 200)}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
