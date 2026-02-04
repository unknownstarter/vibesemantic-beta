# 이미지 모달 (확대 + 다운로드) 구현 플랜

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 채팅/대시보드의 분석 이미지를 클릭하면 모달로 확대 표시 + 다운로드 가능하게 한다.

**Architecture:** HTML `<dialog>` 기반 모달 컴포넌트를 새로 만들고, 이미지가 표시되는 3개 컴포넌트(ResearchPanel, ChatPanel, ChartCard)에서 클릭 시 모달을 여는 방식. 외부 라이브러리 없이 구현.

**Tech Stack:** React, HTML dialog, CSS variables (기존 디자인 시스템)

---

## Task 1: ImageModal 컴포넌트 생성

**Files:**
- Create: `app/components/ImageModal.tsx`

**Step 1: ImageModal 컴포넌트 작성**

```tsx
"use client"

import { useEffect, useRef, useCallback } from 'react'

interface ImageModalProps {
  src: string
  alt: string
  open: boolean
  onClose: () => void
}

export default function ImageModal({ src, alt, open, onClose }: ImageModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  const handleBackdropClick = useCallback((e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === dialogRef.current) onClose()
  }, [onClose])

  const handleDownload = useCallback(() => {
    const a = document.createElement('a')
    a.href = src
    a.download = alt || 'chart.png'
    a.click()
  }, [src, alt])

  if (!open) return null

  return (
    <dialog
      ref={dialogRef}
      onClick={handleBackdropClick}
      onClose={onClose}
      className="fixed inset-0 z-50 m-0 h-screen w-screen max-h-none max-w-none bg-transparent p-0"
      style={{ backgroundColor: 'transparent' }}
    >
      <div className="flex h-full w-full items-center justify-center bg-black/80 p-8">
        <div className="relative max-h-[90vh] max-w-[90vw]">
          {/* 닫기 + 다운로드 버튼 */}
          <div className="absolute -top-10 right-0 flex gap-2">
            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs hover:bg-white/10"
              style={{ color: 'var(--text-secondary)' }}
            >
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
              </svg>
              Download
            </button>
            <button
              onClick={onClose}
              className="rounded-md px-2 py-1.5 text-xs hover:bg-white/10"
              style={{ color: 'var(--text-secondary)' }}
            >
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <img
            src={src}
            alt={alt}
            className="max-h-[85vh] max-w-[90vw] rounded-lg object-contain"
          />
        </div>
      </div>
    </dialog>
  )
}
```

**Step 2: 빌드 확인**

Run: `npm run build`
Expected: PASS

**Step 3: 커밋**

```bash
git add app/components/ImageModal.tsx
git commit -m "feat: add ImageModal component for chart image zoom/download"
```

---

## Task 2: ResearchPanel에 모달 연결

**Files:**
- Modify: `app/components/ResearchPanel.tsx`

**변경 내용:**
1. `useState`로 모달 상태 (`modalImage: { src: string; alt: string } | null`) 추가
2. `ImageModal` import
3. 이미지 `<img>` 태그에 `cursor-pointer` + `onClick` 추가 (2곳: msg.charts, streamCharts)
4. 컴포넌트 하단에 `<ImageModal>` 렌더

**수정할 위치들:**

- Line 3: import에 ImageModal 추가
- Line 36 부근: `useState` 추가 — `const [modalImage, setModalImage] = useState<{src: string; alt: string} | null>(null)`
- Line 197: `<img src={chart.imageUrl} alt={chart.title} className="w-full" />` → `cursor-pointer` + `onClick` 추가
- Line 235: streamCharts 이미지도 동일하게
- Line 333 (return 끝): `<ImageModal>` 추가

**Step 1: 수정 적용**

ResearchPanel.tsx 상단 import에 추가:
```tsx
import ImageModal from './ImageModal'
```

state 추가 (line 37 이후):
```tsx
const [modalImage, setModalImage] = useState<{src: string; alt: string} | null>(null)
```

msg.charts 이미지 (line 196-198):
```tsx
// 기존:
<img src={chart.imageUrl} alt={chart.title} className="w-full" />
// 변경:
<img
  src={chart.imageUrl}
  alt={chart.title}
  className="w-full cursor-pointer"
  onClick={() => setModalImage({ src: chart.imageUrl!, alt: chart.title })}
/>
```

streamCharts 이미지 (line 234-235):
```tsx
// 동일하게 cursor-pointer + onClick 추가
```

컴포넌트 return 끝 (`</aside>` 직전):
```tsx
<ImageModal
  src={modalImage?.src ?? ''}
  alt={modalImage?.alt ?? ''}
  open={modalImage !== null}
  onClose={() => setModalImage(null)}
/>
```

**Step 2: 빌드 확인**

Run: `npm run build`
Expected: PASS

**Step 3: 커밋**

```bash
git add app/components/ResearchPanel.tsx
git commit -m "feat: add image modal to ResearchPanel for zoom/download"
```

---

## Task 3: ChatPanel에 모달 연결

**Files:**
- Modify: `app/components/ChatPanel.tsx`

**변경 내용:** Task 2와 동일한 패턴.

1. `ImageModal` import
2. `modalImage` state 추가
3. msg.charts 이미지에 `cursor-pointer` + `onClick`
4. `</aside>` 직전에 `<ImageModal>` 렌더

**수정할 위치들:**

- Line 3: import에 ImageModal 추가
- Line 23 부근: `modalImage` state 추가
- Line 157: 이미지 태그 수정
- Line 230 (`</aside>` 직전): `<ImageModal>` 추가

**Step 1: 수정 적용 (ResearchPanel과 동일 패턴)**

**Step 2: 빌드 확인**

Run: `npm run build`
Expected: PASS

**Step 3: 커밋**

```bash
git add app/components/ChatPanel.tsx
git commit -m "feat: add image modal to ChatPanel for zoom/download"
```

---

## Task 4: ChartCard에 모달 연결

**Files:**
- Modify: `app/components/ChartCard.tsx`

**변경 내용:**

1. `useState` import 추가
2. `ImageModal` import
3. `modalImage` state 추가
4. `renderChart()` 내 imageUrl 이미지에 `cursor-pointer` + `onClick`
5. 컴포넌트 return 끝에 `<ImageModal>` 렌더

**수정할 위치들:**

- Line 2: `import { useState } from 'react'` 추가 (현재 useState import 없음)
- Line 7: `import ImageModal from './ImageModal'` 추가
- Line 37 부근: `modalImage` state 추가
- Line 54-61: imageUrl 이미지 태그 수정
- Line 221 (`</div>` 마지막): `<ImageModal>` 추가

**Step 1: 수정 적용**

renderChart() 내부 (line 54-61):
```tsx
// 기존:
if (chart.imageUrl) {
  return (
    <img src={chart.imageUrl} alt={chart.title} className="h-64 w-full object-contain" />
  )
}
// 변경:
if (chart.imageUrl) {
  return (
    <img
      src={chart.imageUrl}
      alt={chart.title}
      className="h-64 w-full cursor-pointer object-contain"
      onClick={() => setModalImage({ src: chart.imageUrl!, alt: chart.title })}
    />
  )
}
```

**Step 2: 빌드 확인**

Run: `npm run build`
Expected: PASS

**Step 3: 커밋**

```bash
git add app/components/ChartCard.tsx
git commit -m "feat: add image modal to ChartCard for zoom/download"
```

---

## Task 5: globals.css에 dialog 스타일 추가

**Files:**
- Modify: `app/globals.css`

**변경 내용:** dialog의 기본 `::backdrop`을 투명으로 설정 (배경은 컴포넌트 내 div로 제어)

```css
/* Image modal dialog */
dialog::backdrop {
  background: transparent;
}

dialog[open] {
  animation: fade-in 150ms ease;
}

@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
```

**Step 1: 수정 적용**

**Step 2: 빌드 확인**

Run: `npm run build`
Expected: PASS

**Step 3: 커밋**

```bash
git add app/globals.css
git commit -m "style: add dialog animation for image modal"
```

---

## 최종 확인

- `npm run build` 통과
- `npm run lint` 통과
- `npm test` 통과
- 브라우저에서 이미지 클릭 → 모달 열림 확인
- 배경 클릭/ESC → 닫힘 확인
- 다운로드 버튼 → 파일 다운로드 확인
