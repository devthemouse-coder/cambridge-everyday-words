export const STANDARD_PAGE_WIDTH = 1000
export const STANDARD_PAGE_HEIGHT = 1400

export interface TemplateRect {
  x: number
  y: number
  width: number
  height: number
}

export const getStandardPageRowRects = (pageRect: TemplateRect) => {
  const rowYRatios = [0.19, 0.28, 0.40, 0.54, 0.66]
  const rowHeight = pageRect.height * 0.13

  return rowYRatios.map((ratio) => ({
    x: pageRect.x,
    y: pageRect.y + pageRect.height * ratio,
    width: pageRect.width,
    height: rowHeight,
  }))
}

export const getStandardPageCellRects = (rowRect: TemplateRect) => {
  // English: x=120-680 — wide enough for long words like "Wednesday"; cleanEnglishCandidate strips Korean
  const englishArea = {
    x: rowRect.x + rowRect.width * 0.12,
    y: rowRect.y + rowRect.height * 0.05,
    width: rowRect.width * 0.56,
    height: rowRect.height * 0.85,
  }

  // Korean: x=300-970 — starts early so "가을", "잘" etc are not left-clipped; cleanKoreanCandidate strips English
  const koreanArea = {
    x: rowRect.x + rowRect.width * 0.30,
    y: rowRect.y + rowRect.height * 0.05,
    width: rowRect.width * 0.67,
    height: rowRect.height * 0.85,
  }

  return { englishArea, koreanArea }
}

export const getStandardPageRect = () => ({
  x: 0,
  y: 0,
  width: STANDARD_PAGE_WIDTH,
  height: STANDARD_PAGE_HEIGHT,
})
