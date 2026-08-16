import { useEffect, useMemo, useRef, useState } from 'react'
import Tesseract from 'tesseract.js'
import { supabase } from '../lib/supabase'
import type { Profile } from '../types/auth'

export interface OcrDraftWord {
  id: string
  english: string
  meaning: string
  wordOrder: number
  confidence?: number
}

export interface OcrDraft {
  title: string
  level: string
  roundNumber: number | null
  words: OcrDraftWord[]
  rawText: string
}

interface ExistingWordComparison {
  status: 'same' | 'changed' | 'new' | 'removed'
  english: string
  oldMeaning?: string
  newMeaning?: string
}

interface OcrImportModalProps {
  isOpen: boolean
  profile: Profile
  onClose: () => void
  onImported: () => Promise<void> | void
}

const normalizeWhitespace = (value: string) => value.replace(/\s+/g, ' ').trim()

const buildWordId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }

  return `word-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

const parseTitleLevelRound = (rawText: string) => {
  const lines = rawText
    .split(/\r?\n/)
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean)

  let title = ''
  let level = ''
  let roundNumber: number | null = null

  const levelMatch = rawText.match(/(?:level|lv|레벨)\s*[:\-]?\s*([A-Za-z0-9]+(?:\s*[-/][A-Za-z0-9]+)*)/i)
  if (levelMatch?.[1]) {
    level = normalizeWhitespace(levelMatch[1])
  }

  const roundMatch = rawText.match(/(?:round|회차|R\s*\d+|회)\s*[:\-]?\s*(\d+)/i)
  if (roundMatch?.[1]) {
    roundNumber = Number.parseInt(roundMatch[1], 10)
  }

  const possibleTitle = lines.find((line) => {
    const lower = line.toLowerCase()
    return !lower.includes('level') && !lower.includes('round') && !lower.includes('회차') && !lower.includes('word') && line.length > 2
  })

  if (possibleTitle) {
    title = possibleTitle
  }

  return { title, level, roundNumber }
}

const parseWordPairLine = (line: string) => {
  const trimmed = normalizeWhitespace(line)
  if (!trimmed) return null

  const englishMeaningPatterns = [
    /^([A-Za-z][A-Za-z'\- ]+)\s*(?:\/|:|－|–|—|\s{2,}|\t)\s*([가-힣A-Za-z0-9\s.,!?()\-]+)$/,
    /^([A-Za-z][A-Za-z'\- ]+)\s*[-]\s*([가-힣A-Za-z0-9\s.,!?()\-]+)$/,
  ]

  for (const pattern of englishMeaningPatterns) {
    const match = trimmed.match(pattern)
    if (match) {
      const english = normalizeWhitespace(match[1])
      const meaning = normalizeWhitespace(match[2])
      if (english && meaning) {
        return { english, meaning }
      }
    }
  }

  const tokens = trimmed.split(/\s{2,}|\t/)
  if (tokens.length >= 2) {
    const first = normalizeWhitespace(tokens[0])
    const second = normalizeWhitespace(tokens.slice(1).join(' '))
    if (first && second && /^[A-Za-z]/.test(first) && /[가-힣]/.test(second)) {
      return { english: first, meaning: second }
    }
  }

  return null
}

const parseWordsFromRawText = (rawText: string) => {
  const lines = rawText
    .split(/\r?\n/)
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean)

  const parsedWords: OcrDraftWord[] = []

  for (const line of lines) {
    const pair = parseWordPairLine(line)
    if (!pair) continue

    const alreadyExists = parsedWords.some(
      (item) => item.english.toLowerCase() === pair.english.toLowerCase() && item.meaning === pair.meaning,
    )

    if (!alreadyExists) {
      parsedWords.push({
        id: buildWordId(),
        english: pair.english,
        meaning: pair.meaning,
        wordOrder: parsedWords.length + 1,
      })
    }
  }

  if (parsedWords.length === 0) {
    const candidateWords = lines
      .map((line) => normalizeWhitespace(line))
      .filter((line) => line.length > 0)
      .filter((line) => /[A-Za-z]/.test(line))

    for (let index = 0; index < candidateWords.length; index += 1) {
      const line = candidateWords[index]
      const firstToken = line.split(/\s+/)[0]
      if (firstToken && /^[A-Za-z]/.test(firstToken)) {
        parsedWords.push({
          id: buildWordId(),
          english: firstToken,
          meaning: '',
          wordOrder: parsedWords.length + 1,
        })
      }
    }
  }

  return parsedWords
}

const chunkWords = (words: OcrDraftWord[]) =>
  words.map((word, index) => ({
    ...word,
    wordOrder: index + 1,
  }))

export default function OcrImportModal({ isOpen, profile, onClose, onImported }: OcrImportModalProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const cameraInputRef = useRef<HTMLInputElement | null>(null)
  const galleryInputRef = useRef<HTMLInputElement | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [ocring, setOcring] = useState(false)
  const [progress, setProgress] = useState(0)
  const [draft, setDraft] = useState<OcrDraft | null>(null)
  const [existingComparison, setExistingComparison] = useState<ExistingWordComparison[]>([])
  const [existingRoundInfo, setExistingRoundInfo] = useState<{ bookId: string; roundId: string; roundNumber: number } | null>(null)
  const [confirmOverwrite, setConfirmOverwrite] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (!isOpen) {
      return undefined
    }

    const timer = window.setTimeout(() => fileInputRef.current?.focus(), 60)
    return () => window.clearTimeout(timer)
  }, [isOpen])

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl)
      }
    }
  }, [previewUrl])

  const isAdminReady = useMemo(() => profile.role === 'SUPER_ADMIN' || profile.can_manage_rounds, [profile])

  const resetDraft = () => {
    setDraft(null)
    setExistingComparison([])
    setExistingRoundInfo(null)
    setConfirmOverwrite(false)
    setError(null)
    setProgress(0)
    setOcring(false)
    setSelectedFile(null)
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
    }
    setPreviewUrl(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const triggerImageInput = (mode: 'camera' | 'gallery') => {
    const targetInput = mode === 'camera' ? cameraInputRef.current : galleryInputRef.current
    targetInput?.click()
  }

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
    }

    const nextPreviewUrl = URL.createObjectURL(file)
    setSelectedFile(file)
    setPreviewUrl(nextPreviewUrl)
    setDraft(null)
    setError(null)
    setProgress(0)

    event.target.value = ''
  }

  const handleOcr = async () => {
    if (!selectedFile) {
      setError('이미지 파일을 먼저 선택해 주세요.')
      return
    }

    setError(null)
    setOcring(true)
    setProgress(0)

    try {
      const result = await Tesseract.recognize(selectedFile, 'eng+kor', {
        logger: (message) => {
          if ('progress' in message && typeof message.progress === 'number') {
            setProgress(Math.round(message.progress * 100))
          }
        },
      })

      const rawText = result.data.text ?? ''
      const parsedInfo = parseTitleLevelRound(rawText)
      const parsedWords = chunkWords(parseWordsFromRawText(rawText))

      setDraft({
        title: parsedInfo.title,
        level: parsedInfo.level,
        roundNumber: parsedInfo.roundNumber,
        words: parsedWords,
        rawText,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'OCR 처리 중 오류가 발생했습니다.')
    } finally {
      setOcring(false)
    }
  }

  const updateWord = (wordId: string, field: 'english' | 'meaning', value: string) => {
    setDraft((current) => {
      if (!current) return current

      return {
        ...current,
        words: current.words.map((word) =>
          word.id === wordId ? { ...word, [field]: value } : word,
        ),
      }
    })
  }

  const deleteWord = (wordId: string) => {
    setDraft((current) => {
      if (!current) return current

      const nextWords = current.words.filter((word) => word.id !== wordId)
      return {
        ...current,
        words: chunkWords(nextWords),
      }
    })
  }

  const addWordRow = () => {
    setDraft((current) => {
      if (!current) return current
      return {
        ...current,
        words: chunkWords([
          ...current.words,
          {
            id: buildWordId(),
            english: '',
            meaning: '',
            wordOrder: current.words.length + 1,
          },
        ]),
      }
    })
  }

  const compareWithExistingRound = async (title: string, roundNumber: number | null) => {
    const targetRound = roundNumber ?? 1

    let bookQuery = supabase.from('word_books').select('*')
    if (profile.organization_id) {
      bookQuery = bookQuery.eq('organization_id', profile.organization_id)
    }

    const { data: existingBook, error: bookError } = await bookQuery.eq('title', title).maybeSingle()

    if (bookError) {
      throw new Error(bookError.message || '단어장 조회 중 오류가 발생했습니다.')
    }

    if (!existingBook) {
      setExistingComparison([])
      setExistingRoundInfo(null)
      return
    }

    const { data: existingRound, error: roundError } = await supabase
      .from('rounds')
      .select('*')
      .eq('word_book_id', existingBook.id)
      .eq('round_number', targetRound)
      .maybeSingle()

    if (roundError) {
      throw new Error(roundError.message || '회차 조회 중 오류가 발생했습니다.')
    }

    if (!existingRound) {
      setExistingComparison([])
      setExistingRoundInfo(null)
      return
    }

    const { data: existingWords, error: wordsError } = await supabase
      .from('words')
      .select('*')
      .eq('round_id', existingRound.id)
      .order('word_order', { ascending: true })

    if (wordsError) {
      throw new Error(wordsError.message || '기존 단어 조회 중 오류가 발생했습니다.')
    }

    const existingMap = new Map((existingWords ?? []).map((word) => [String(word.english).trim().toLowerCase(), word]))
    const ocrMap = new Map(
      (draft?.words ?? []).filter((word) => word.english.trim()).map((word) => [String(word.english).trim().toLowerCase(), word]),
    )

    const comparison: ExistingWordComparison[] = []
    const allKeys = new Set([...existingMap.keys(), ...ocrMap.keys()])

    for (const key of allKeys) {
      const oldWord = existingMap.get(key)
      const newWord = ocrMap.get(key)

      if (oldWord && newWord) {
        if (String(oldWord.meaning).trim() === String(newWord.meaning).trim()) {
          comparison.push({ status: 'same', english: newWord.english.trim(), oldMeaning: oldWord.meaning, newMeaning: newWord.meaning })
        } else {
          comparison.push({ status: 'changed', english: newWord.english.trim(), oldMeaning: oldWord.meaning, newMeaning: newWord.meaning })
        }
      } else if (newWord) {
        comparison.push({ status: 'new', english: newWord.english.trim(), newMeaning: newWord.meaning })
      } else if (oldWord) {
        comparison.push({ status: 'removed', english: String(oldWord.english).trim(), oldMeaning: oldWord.meaning })
      }
    }

    setExistingComparison(comparison)
    setExistingRoundInfo({
      bookId: existingBook.id,
      roundId: existingRound.id,
      roundNumber: targetRound,
    })
  }

  const handleDraftChange = (nextDraft: OcrDraft | null) => {
    setDraft(nextDraft)
    if (!nextDraft) {
      setExistingComparison([])
      setExistingRoundInfo(null)
      setConfirmOverwrite(false)
      return
    }

    const title = nextDraft.title.trim()
    const roundNumber = nextDraft.roundNumber ?? 1

    if (!title) {
      setExistingComparison([])
      setExistingRoundInfo(null)
      setConfirmOverwrite(false)
      return
    }

    void compareWithExistingRound(title, roundNumber)
      .catch((err) => {
        setError(err instanceof Error ? err.message : '기존 회차 비교 중 오류가 발생했습니다.')
      })
  }

  const handleRegister = async () => {
    if (!draft) return

    const title = draft.title.trim()
    const validWords = draft.words.filter((word) => word.english.trim())

    if (!title) {
      setError('단어장 제목을 입력해 주세요.')
      return
    }

    if (validWords.length === 0) {
      setError('등록할 영어 단어가 없습니다. 최소 1개 이상의 단어를 입력해 주세요.')
      return
    }

    if (existingRoundInfo && !confirmOverwrite) {
      setError('기존 회차가 발견되었습니다. 덮어쓰기를 승인한 뒤 다시 시도해 주세요.')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      const targetRound = draft.roundNumber ?? 1

      let bookQuery = supabase.from('word_books').select('*')
      if (profile.organization_id) {
        bookQuery = bookQuery.eq('organization_id', profile.organization_id)
      }
      const { data: existingBook, error: bookError } = await bookQuery.eq('title', title).maybeSingle()

      if (bookError) {
        throw new Error(bookError.message || '단어장 조회 중 오류가 발생했습니다.')
      }

      let bookId = existingBook?.id as string | undefined

      if (!bookId) {
        const { data: insertedBook, error: insertBookError } = await supabase
          .from('word_books')
          .insert({
            organization_id: profile.organization_id,
            title,
            level: draft.level || '미지정',
            created_by: profile.id,
            updated_by: profile.id,
          })
          .select()
          .single()

        if (insertBookError) {
          throw new Error(insertBookError.message || '단어장 생성에 실패했습니다.')
        }

        bookId = insertedBook.id
      }

      let roundId: string | undefined
      const { data: existingRound, error: roundError } = await supabase
        .from('rounds')
        .select('*')
        .eq('word_book_id', bookId)
        .eq('round_number', targetRound)
        .maybeSingle()

      if (roundError) {
        throw new Error(roundError.message || '회차 조회 중 오류가 발생했습니다.')
      }

      if (!existingRound) {
        const { data: insertedRound, error: insertRoundError } = await supabase
          .from('rounds')
          .insert({
            word_book_id: bookId,
            round_number: targetRound,
            created_by: profile.id,
            updated_by: profile.id,
          })
          .select()
          .single()

        if (insertRoundError) {
          throw new Error(insertRoundError.message || '회차 생성에 실패했습니다.')
        }

        roundId = insertedRound.id
      } else {
        roundId = existingRound.id

        if (!confirmOverwrite) {
          setError('기존 회차 데이터가 있습니다. 덮어쓰기를 확인해 주세요.')
          setIsSubmitting(false)
          return
        }

        const { error: deleteError } = await supabase.from('words').delete().eq('round_id', roundId)
        if (deleteError) {
          throw new Error(deleteError.message || '기존 단어 삭제 중 오류가 발생했습니다.')
        }
      }

      const preparedWords = validWords.map((word, index) => ({
        round_id: roundId,
        word_order: index + 1,
        english: word.english.trim(),
        meaning: word.meaning.trim() || '',
        created_by: profile.id,
        updated_by: profile.id,
      }))

      const { error: insertWordsError } = await supabase.from('words').insert(preparedWords)

      if (insertWordsError) {
        throw new Error(insertWordsError.message || '단어 저장 중 오류가 발생했습니다.')
      }

      await onImported()
      resetDraft()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : '등록 중 오류가 발생했습니다.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="사진으로 단어 가져오기">
      <div className="modal ocr-modal">
        <div className="modal-header-row">
          <h3>📷 사진으로 가져오기</h3>
          <button type="button" className="icon-button-close" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>

        <div className="ocr-input-methods">
          <button type="button" className="secondary-button" onClick={() => triggerImageInput('camera')}>
            📷 카메라로 촬영
          </button>
          <button type="button" className="secondary-button" onClick={() => triggerImageInput('gallery')}>
            🖼️ 사진 선택
          </button>
        </div>

        <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={handleFileSelect} hidden />
        <input ref={galleryInputRef} type="file" accept="image/*" onChange={handleFileSelect} hidden />

        {previewUrl ? (
          <div className="ocr-image-preview-wrap">
            <img src={previewUrl} alt="업로드 이미지 미리보기" className="ocr-image-preview" />
          </div>
        ) : null}

        {selectedFile ? (
          <button type="button" className="primary-button" onClick={handleOcr} disabled={ocring || !isAdminReady}>
            {ocring ? `이미지 분석 중... ${progress}%` : 'OCR 시작'}
          </button>
        ) : null}

        {error ? <p className="error">{error}</p> : null}

        {draft ? (
          <div className="ocr-result-panel">
            <div className="ocr-meta-grid">
              <label>
                단어장 제목
                <input
                  type="text"
                  value={draft.title}
                  onChange={(event) => {
                    const nextValue = event.target.value
                    setDraft((current) => (current ? { ...current, title: nextValue } : current))
                    handleDraftChange({ ...draft, title: nextValue })
                  }}
                />
              </label>

              <label>
                Level
                <input
                  type="text"
                  value={draft.level}
                  onChange={(event) => {
                    const nextValue = event.target.value
                    setDraft((current) => (current ? { ...current, level: nextValue } : current))
                    handleDraftChange({ ...draft, level: nextValue })
                  }}
                />
              </label>

              <label>
                Round
                <input
                  type="number"
                  min={1}
                  value={draft.roundNumber ?? 1}
                  onChange={(event) => {
                    const nextValue = Number(event.target.value) || 1
                    setDraft((current) => (current ? { ...current, roundNumber: nextValue } : current))
                    handleDraftChange({ ...draft, roundNumber: nextValue })
                  }}
                />
              </label>
            </div>

            {existingRoundInfo ? (
              <div className="ocr-comparison-panel">
                <h4>기존 회차 비교</h4>
                <p>
                  기존 회차 {existingRoundInfo.roundNumber}회가 발견되었습니다. OCR 결과로 덮어쓸지 확인해 주세요.
                </p>
                <div className="comparison-summary">
                  {existingComparison.map((item) => (
                    <div key={`${item.status}-${item.english}`} className="comparison-item">
                      <span className={`comparison-status status-${item.status}`}>{item.status === 'same' ? '동일' : item.status === 'changed' ? '변경' : item.status === 'new' ? '신규' : '삭제'}</span>
                      <strong>{item.english}</strong>
                      <span>{item.oldMeaning ?? '-'}</span>
                      <span>{item.newMeaning ?? '-'}</span>
                    </div>
                  ))}
                </div>
                <div className="ocr-confirm-actions">
                  <button type="button" className="secondary-button" onClick={() => setConfirmOverwrite(false)}>
                    취소
                  </button>
                  <button type="button" className="primary-button" onClick={() => setConfirmOverwrite(true)}>
                    덮어쓰기 승인
                  </button>
                </div>
              </div>
            ) : null}

            <div className="ocr-table-wrap">
              <table className="ocr-draft-table">
                <thead>
                  <tr>
                    <th>순서</th>
                    <th>영어</th>
                    <th>뜻</th>
                    <th>삭제</th>
                  </tr>
                </thead>
                <tbody>
                  {draft.words.map((word, index) => (
                    <tr key={word.id}>
                      <td>{index + 1}</td>
                      <td>
                        <input
                          type="text"
                          value={word.english}
                          onChange={(event) => updateWord(word.id, 'english', event.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          value={word.meaning}
                          onChange={(event) => updateWord(word.id, 'meaning', event.target.value)}
                        />
                      </td>
                      <td>
                        <button type="button" className="delete-row-button" onClick={() => deleteWord(word.id)}>
                          🗑
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="ocr-actions-row">
              <button type="button" className="secondary-button" onClick={addWordRow}>
                + 행 추가
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={handleRegister}
                disabled={isSubmitting || draft.words.filter((word) => word.english.trim()).length === 0}
              >
                {isSubmitting ? '등록 중...' : '단어장에 등록'}
              </button>
            </div>

            <details className="ocr-raw-details">
              <summary>원본 OCR 텍스트</summary>
              <pre>{draft.rawText || 'OCR 결과 텍스트가 없습니다.'}</pre>
            </details>
          </div>
        ) : null}
      </div>
    </div>
  )
}
