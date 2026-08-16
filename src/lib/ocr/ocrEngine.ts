import Tesseract from 'tesseract.js'

// Two long-lived workers (one per language) reused across all 20 cell OCR calls.
// Creating a new worker per call downloaded language models 20 times, freezing the tab.
const workerPool: Partial<Record<'eng' | 'kor', Tesseract.Worker>> = {}

const getOrCreateWorker = async (language: 'eng' | 'kor'): Promise<Tesseract.Worker> => {
  if (!workerPool[language]) {
    const worker = await Tesseract.createWorker(language)
    await worker.setParameters({
      tessedit_pageseg_mode: language === 'eng' ? Tesseract.PSM.SINGLE_WORD : Tesseract.PSM.SINGLE_LINE,
      preserve_interword_spaces: '1',
    })
    workerPool[language] = worker
  }
  return workerPool[language]!
}

export const terminateOcrWorkers = async (): Promise<void> => {
  for (const lang of ['eng', 'kor'] as const) {
    if (workerPool[lang]) {
      try { await workerPool[lang]!.terminate() } catch { /* ignore cleanup errors */ }
      delete workerPool[lang]
    }
  }
}

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export const buildEnhancedCanvas = (source: HTMLCanvasElement, scale = 4) => {
  const target = document.createElement('canvas')
  const context = target.getContext('2d')

  if (!context) {
    throw new Error('이미지 처리에 필요한 캔버스가 지원되지 않습니다.')
  }

  target.width = Math.max(1, Math.round(source.width * scale))
  target.height = Math.max(1, Math.round(source.height * scale))

  context.filter = 'contrast(1.6) saturate(1.2) brightness(1.1)'
  context.drawImage(source, 0, 0, source.width, source.height, 0, 0, target.width, target.height)

  const imageData = context.getImageData(0, 0, target.width, target.height)
  const { data } = imageData

  for (let index = 0; index < data.length; index += 4) {
    const gray = (data[index] * 299 + data[index + 1] * 587 + data[index + 2] * 114) / 1000
    const adjusted = gray > 170 ? 255 : 0
    data[index] = adjusted
    data[index + 1] = adjusted
    data[index + 2] = adjusted
  }

  context.putImageData(imageData, 0, 0)
  return target
}

export const cropRectFromCanvas = (source: HTMLCanvasElement, rect: { x: number; y: number; width: number; height: number }) => {
  const crop = document.createElement('canvas')
  const context = crop.getContext('2d')

  if (!context) {
    throw new Error('영역 크롭에 필요한 캔버스가 지원되지 않습니다.')
  }

  crop.width = Math.max(1, Math.round(rect.width))
  crop.height = Math.max(1, Math.round(rect.height))

  context.drawImage(
    source,
    clamp(Math.round(rect.x), 0, source.width),
    clamp(Math.round(rect.y), 0, source.height),
    clamp(Math.round(rect.width), 1, source.width),
    clamp(Math.round(rect.height), 1, source.height),
    0,
    0,
    crop.width,
    crop.height,
  )

  return crop
}

export const cleanEnglishCandidate = (value: string) => {
  const cleaned = (value ?? '')
    .replace(/[^A-Za-z\-\'\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const tokens = cleaned
    .split(' ')
    .filter((segment) => segment && /^[A-Za-z][A-Za-z\-']*$/.test(segment))

  // Return the longest clean token (best candidate for the single target word)
  if (tokens.length === 0) return ''
  return tokens.reduce((a, b) => (b.length > a.length ? b : a))
}

export const cleanKoreanCandidate = (value: string) => {
  return (value ?? '')
    .replace(/[A-Za-z]/g, ' ')            // strip Latin letters but keep digits
    .replace(/[^가-힣\d\s.,!?()\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export const runSingleLineOcr = async (canvas: HTMLCanvasElement, language: 'eng' | 'kor') => {
  const worker = await getOrCreateWorker(language)
  try {
    const result = await worker.recognize(canvas)
    return result.data.text ?? ''
  } catch {
    return ''
  }
}
