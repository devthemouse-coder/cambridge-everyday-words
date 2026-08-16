export type Point = { x: number; y: number }
export type OrderedQuadrilateral = [Point, Point, Point, Point]

export interface PageRegion {
  pageIndex: number
  canvas: HTMLCanvasElement
}

declare global {
  interface Window {
    cv?: any
  }
}

const OPENCV_URL = 'https://docs.opencv.org/4.12.0/opencv.js'
let cvPromise: Promise<any> | null = null

const orderPoints = (points: Point[]): OrderedQuadrilateral => {
  const sorted = [...points].sort((a, b) => a.y - b.y)
  const top = sorted.slice(0, 2).sort((a, b) => a.x - b.x)
  const bottom = sorted.slice(2).sort((a, b) => a.x - b.x)

  return [top[0], top[1], bottom[1], bottom[0]] as OrderedQuadrilateral
}

const getDistance = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y)

const asPointArray = (approx: any) => {
  const points: Point[] = []
  for (let index = 0; index < approx.rows; index += 1) {
    const x = approx.data32S[index * 2]
    const y = approx.data32S[index * 2 + 1]
    points.push({ x, y })
  }

  return points
}

const loadOpenCv = () => {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('브라우저 환경에서만 사용할 수 있습니다.'))
  }

  if (window.cv) {
    return Promise.resolve(window.cv)
  }

  if (!cvPromise) {
    cvPromise = new Promise((resolve, reject) => {
      const existingScript = document.querySelector('script[data-opencv="true"]') as HTMLScriptElement | null

      if (existingScript) {
        existingScript.addEventListener('load', () => resolve(window.cv), { once: true })
        existingScript.addEventListener('error', () => reject(new Error('OpenCV.js 로드에 실패했습니다.')), { once: true })
        return
      }

      const script = document.createElement('script')
      script.src = OPENCV_URL
      script.async = true
      script.setAttribute('data-opencv', 'true')
      script.onload = () => {
        if (window.cv) {
          resolve(window.cv)
          return
        }
        reject(new Error('OpenCV.js가 정상적으로 초기화되지 않았습니다.'))
      }
      script.onerror = () => reject(new Error('OpenCV.js를 불러오지 못했습니다.'))
      document.head.appendChild(script)
    })
  }

  return cvPromise
}

const buildFromImage = (image: HTMLImageElement) => {
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight

  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('캔버스를 생성할 수 없습니다.')
  }

  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  return canvas
}

// Finds up to 2 page-border quads sorted left-to-right.
// Uses edge dilation + RETR_EXTERNAL so both page borders close into clean contours.
const findPageQuadrilaterals = (cv: any, sourceCanvas: HTMLCanvasElement): OrderedQuadrilateral[] => {
  const minArea = sourceCanvas.width * sourceCanvas.height * 0.05

  const src = cv.imread(sourceCanvas)
  const gray = new cv.Mat()
  const blur = new cv.Mat()
  const edges = new cv.Mat()
  const dilated = new cv.Mat()
  const contours = new cv.MatVector()
  const hierarchy = new cv.Mat()

  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)
    cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0)
    cv.Canny(blur, edges, 50, 150)

    // Close small gaps in printed page border lines
    const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5))
    cv.dilate(edges, dilated, kernel, new cv.Point(-1, -1), 2)
    kernel.delete()

    cv.findContours(dilated, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE)

    const candidates: Array<{ points: Point[]; area: number; cx: number }> = []

    for (let index = 0; index < contours.size(); index += 1) {
      const contour = contours.get(index)
      const area = cv.contourArea(contour, false)

      if (area < minArea) {
        contour.delete()
        continue
      }

      const peri = cv.arcLength(contour, true)
      let matched = false

      for (const epsilon of [0.02, 0.03, 0.04, 0.05]) {
        if (matched) break
        const approx = new cv.Mat()
        cv.approxPolyDP(contour, approx, epsilon * peri, true)

        if (approx.rows === 4) {
          const points = asPointArray(approx)
          const xs = points.map((p) => p.x)
          const ys = points.map((p) => p.y)
          const qw = Math.max(...xs) - Math.min(...xs)
          const qh = Math.max(...ys) - Math.min(...ys)
          const ratio = qw / qh

          if (ratio > 0.4 && ratio < 1.2) {
            const cx = xs.reduce((a, b) => a + b, 0) / 4
            candidates.push({ points, area, cx })
            matched = true
          }
        }

        approx.delete()
      }

      contour.delete()
    }

    // Sort by area descending; deduplicate quads with >50% x-overlap (keep larger)
    candidates.sort((a, b) => b.area - a.area)
    const selected: typeof candidates = []
    for (const candidate of candidates) {
      const cMinX = Math.min(...candidate.points.map((p) => p.x))
      const cMaxX = Math.max(...candidate.points.map((p) => p.x))
      const overlaps = selected.some((s) => {
        const sMinX = Math.min(...s.points.map((p) => p.x))
        const sMaxX = Math.max(...s.points.map((p) => p.x))
        const overlapX = Math.max(0, Math.min(cMaxX, sMaxX) - Math.max(cMinX, sMinX))
        return overlapX > (cMaxX - cMinX) * 0.5
      })
      if (!overlaps) {
        selected.push(candidate)
      }
      if (selected.length >= 2) break
    }

    // Sort left to right
    selected.sort((a, b) => a.cx - b.cx)
    return selected.map((c) => orderPoints(c.points))
  } finally {
    src.delete()
    gray.delete()
    blur.delete()
    edges.delete()
    dilated.delete()
    contours.delete()
    hierarchy.delete()
  }
}

// Legacy single-quad finder kept for approximateBookSpread export
const findLargestQuadrilateral = (cv: any, sourceCanvas: HTMLCanvasElement): OrderedQuadrilateral => {
  const quads = findPageQuadrilaterals(cv, sourceCanvas)
  if (quads.length > 0) return quads[0]
  return [
    { x: 0, y: 0 },
    { x: sourceCanvas.width, y: 0 },
    { x: sourceCanvas.width, y: sourceCanvas.height },
    { x: 0, y: sourceCanvas.height },
  ] as OrderedQuadrilateral
}

const warpPageToStandard = (sourceCanvas: HTMLCanvasElement, quad: OrderedQuadrilateral, targetWidth: number, targetHeight: number) => {
  const cv = window.cv
  if (!cv) {
    throw new Error('OpenCV.js가 준비되지 않았습니다.')
  }

  const srcPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [
    quad[0].x, quad[0].y,
    quad[1].x, quad[1].y,
    quad[2].x, quad[2].y,
    quad[3].x, quad[3].y,
  ])

  const dstPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [
    0, 0,
    targetWidth, 0,
    targetWidth, targetHeight,
    0, targetHeight,
  ])

  const sourceMatrix = cv.imread(sourceCanvas)
  const warped = new cv.Mat()
  const matrix = cv.getPerspectiveTransform(srcPoints, dstPoints)

  try {
    cv.warpPerspective(sourceMatrix, warped, matrix, new cv.Size(targetWidth, targetHeight), cv.INTER_LINEAR, cv.BORDER_REPLICATE)
    const output = document.createElement('canvas')
    cv.imshow(output, warped)
    return output
  } finally {
    sourceMatrix.delete()
    srcPoints.delete()
    dstPoints.delete()
    matrix.delete()
    warped.delete()
  }
}


export const detectAlignedPageRegions = async (image: HTMLImageElement) => {
  const cv = await loadOpenCv()
  const sourceCanvas = buildFromImage(image)
  const STANDARD_W = 1000
  const STANDARD_H = 1400
  const isDualPage = image.naturalWidth > image.naturalHeight * 1.25 || image.naturalWidth > 1200

  const pageQuads = findPageQuadrilaterals(cv, sourceCanvas)
  const regions: PageRegion[] = []

  if (pageQuads.length >= 2) {
    // Both pages detected — warp each independently (already sorted left-to-right)
    const leftCanvas  = warpPageToStandard(sourceCanvas, pageQuads[0], STANDARD_W, STANDARD_H)
    const rightCanvas = warpPageToStandard(sourceCanvas, pageQuads[1], STANDARD_W, STANDARD_H)
    regions.push({ pageIndex: 0, canvas: leftCanvas }, { pageIndex: 1, canvas: rightCanvas })
    return regions
  }

  if (pageQuads.length === 1) {
    if (!isDualPage) {
      const warped = warpPageToStandard(sourceCanvas, pageQuads[0], STANDARD_W, STANDARD_H)
      regions.push({ pageIndex: 0, canvas: warped })
      return regions
    }

    // Dual-page image but only one page border found — estimate the other
    const detected = pageQuads[0]
    const xs = detected.map((p) => p.x)
    const ys = detected.map((p) => p.y)
    const detectedMinX = Math.min(...xs)
    const detectedMaxX = Math.max(...xs)
    const detectedMinY = Math.min(...ys)
    const detectedMaxY = Math.max(...ys)
    const pageWidth    = detectedMaxX - detectedMinX
    const detectedCx   = (detectedMinX + detectedMaxX) / 2
    const isOnRight    = detectedCx > sourceCanvas.width / 2

    const otherQuad: OrderedQuadrilateral = isOnRight
      ? orderPoints([
          { x: Math.max(0, detectedMinX - pageWidth), y: detectedMinY },
          { x: detectedMinX, y: detectedMinY },
          { x: detectedMinX, y: detectedMaxY },
          { x: Math.max(0, detectedMinX - pageWidth), y: detectedMaxY },
        ])
      : orderPoints([
          { x: detectedMaxX, y: detectedMinY },
          { x: Math.min(sourceCanvas.width, detectedMaxX + pageWidth), y: detectedMinY },
          { x: Math.min(sourceCanvas.width, detectedMaxX + pageWidth), y: detectedMaxY },
          { x: detectedMaxX, y: detectedMaxY },
        ])

    const detectedCanvas = warpPageToStandard(sourceCanvas, detected,  STANDARD_W, STANDARD_H)
    const otherCanvas    = warpPageToStandard(sourceCanvas, otherQuad, STANDARD_W, STANDARD_H)

    if (isOnRight) {
      regions.push({ pageIndex: 0, canvas: otherCanvas },   { pageIndex: 1, canvas: detectedCanvas })
    } else {
      regions.push({ pageIndex: 0, canvas: detectedCanvas }, { pageIndex: 1, canvas: otherCanvas })
    }
    return regions
  }

  throw new Error('페이지를 정확히 찾지 못했습니다. 책 전체가 보이도록 조금 더 정면에서 촬영해주세요.')
}

export const getPageWidthForCropping = (sourceCanvas: HTMLCanvasElement) => sourceCanvas.width
export const getPageHeightForCropping = (sourceCanvas: HTMLCanvasElement) => sourceCanvas.height

export const getPageRect = (pageCanvas: HTMLCanvasElement) => ({
  x: 0,
  y: 0,
  width: pageCanvas.width,
  height: pageCanvas.height,
})

export const computePageAndCellRects = (pageCanvas: HTMLCanvasElement) => {
  const pageRect = getPageRect(pageCanvas)
  const rowRects = Array.from({ length: 5 }, (_, rowIndex) => {
    const ratio = [0.12, 0.28, 0.44, 0.60, 0.76][rowIndex]
    const height = pageRect.height * 0.1
    return {
      x: pageRect.x,
      y: pageRect.y + pageRect.height * ratio,
      width: pageRect.width,
      height,
    }
  })

  return rowRects.map((rowRect) => {
    const englishArea = {
      x: rowRect.x + rowRect.width * 0.12,
      y: rowRect.y + rowRect.height * 0.08,
      width: rowRect.width * 0.36,
      height: rowRect.height * 0.72,
    }

    const koreanArea = {
      x: rowRect.x + rowRect.width * 0.53,
      y: rowRect.y + rowRect.height * 0.08,
      width: rowRect.width * 0.38,
      height: rowRect.height * 0.72,
    }

    return { rowRect, englishArea, koreanArea }
  })
}

export const getLargestContourFallback = (sourceCanvas: HTMLCanvasElement) => {
  const points: OrderedQuadrilateral = [
    { x: 0, y: 0 },
    { x: sourceCanvas.width, y: 0 },
    { x: sourceCanvas.width, y: sourceCanvas.height },
    { x: 0, y: sourceCanvas.height },
  ]

  return points
}

export const approximateBookSpread = (sourceCanvas: HTMLCanvasElement) => {
  const cv = window.cv
  if (!cv) {
    return getLargestContourFallback(sourceCanvas)
  }

  return findLargestQuadrilateral(cv, sourceCanvas)
}

export const getImageDimensions = (image: HTMLImageElement) => ({ width: image.naturalWidth, height: image.naturalHeight })

export const getDocumentBoundingBox = (sourceCanvas: HTMLCanvasElement) => ({
  x: 0,
  y: 0,
  width: sourceCanvas.width,
  height: sourceCanvas.height,
})

export const getDistanceBetweenPoints = getDistance
