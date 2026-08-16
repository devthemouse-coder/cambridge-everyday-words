import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Profile } from '../types/auth'
import OcrImportModal from './OcrImportModal'

interface WordBook {
  id: string
  organization_id: string | null
  title: string
  level: string
  created_by: string | null
  updated_by: string | null
  created_at: string | null
  updated_at: string | null
}

interface Round {
  id: string
  word_book_id: string
  round_number: number
  created_by: string | null
  updated_by: string | null
  created_at: string | null
  updated_at: string | null
}

interface Word {
  id: string
  round_id: string
  word_order: number
  english: string
  meaning: string
  created_by: string | null
  updated_by: string | null
  created_at: string | null
  updated_at: string | null
}

interface StudyQuestion {
  id: string
  wordId: string
  kind: 'english_to_meaning' | 'meaning_to_english' | 'multiple_choice' | 'direct_input'
  prompt: string
  answer: string
  targetType: 'english' | 'meaning'
  options: string[]
}

interface StudyWrongAnswer {
  question: StudyQuestion
  userAnswer: string
  correctAnswer: string
}

interface StudyAnswerRecord {
  question: StudyQuestion
  userAnswer: string
  correctAnswer: string
  isCorrect: boolean
}

interface HomeProps {
  profile: Profile
  onLogout: () => void
}

const normalizeEnglish = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase()
  const normalizeMeaning = (value: string) => value.trim().replace(/\s+/g, ' ')

const shuffle = <T,>(items: T[]): T[] => {
  const next = [...items]
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[next[index], next[swapIndex]] = [next[swapIndex], next[index]]
  }
  return next
}

export default function Home({ profile, onLogout }: HomeProps) {
  const [wordBooks, setWordBooks] = useState<WordBook[]>([])
  const [rounds, setRounds] = useState<Round[]>([])
  const [words, setWords] = useState<Word[]>([])
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null)
  const [selectedRoundId, setSelectedRoundId] = useState<string | null>(null)
  const [loadingBooks, setLoadingBooks] = useState(false)
  const [loadingRounds, setLoadingRounds] = useState(false)
  const [loadingWords, setLoadingWords] = useState(false)
  const [savingWord, setSavingWord] = useState(false)
  const [deletingWord, setDeletingWord] = useState(false)
  const [isOcrOpen, setIsOcrOpen] = useState(false)
  const [editingWord, setEditingWord] = useState<Word | null>(null)
  const [wordToDelete, setWordToDelete] = useState<Word | null>(null)
  const [editEnglish, setEditEnglish] = useState('')
  const [editMeaning, setEditMeaning] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  const [addEnglish, setAddEnglish] = useState('')
  const [addMeaning, setAddMeaning] = useState('')
  const [addingWord, setAddingWord] = useState(false)
  const [lastAddedWordId, setLastAddedWordId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [studyPhase, setStudyPhase] = useState<'idle' | 'playing' | 'result'>('idle')
  const [studyOpen, setStudyOpen] = useState(false)
  const [studyBookId, setStudyBookId] = useState<string | null>(null)
  const [studyTargetRoundIds, setStudyTargetRoundIds] = useState<string[]>([])
  const [studyRounds, setStudyRounds] = useState<Round[]>([])
  const [studyWordCount, setStudyWordCount] = useState(0)
  const [studyQuestions, setStudyQuestions] = useState<StudyQuestion[]>([])
  const [studyCurrentIndex, setStudyCurrentIndex] = useState(0)
  const [studyAnswerInput, setStudyAnswerInput] = useState('')
  const [studySelectedChoice, setStudySelectedChoice] = useState<string | null>(null)
  const [studyRevealState, setStudyRevealState] = useState<'correct' | 'incorrect' | null>(null)
  const [studyStatus, setStudyStatus] = useState<string | null>(null)
  const [studyCorrectCount, setStudyCorrectCount] = useState(0)
  const [studyExitConfirmOpen, setStudyExitConfirmOpen] = useState(false)
  const [studyWrongAnswers, setStudyWrongAnswers] = useState<StudyWrongAnswer[]>([])
  const [studyAnswerLog, setStudyAnswerLog] = useState<StudyAnswerRecord[]>([])
  const [studyResult, setStudyResult] = useState<{
    totalQuestions: number
    correctCount: number
    score: number
    wrongAnswers: StudyWrongAnswer[]
    answers: StudyAnswerRecord[]
    startedAt: string
    completedAt: string
  } | null>(null)
  const [studyStartTime, setStudyStartTime] = useState<string | null>(null)
  const [studySaving, setStudySaving] = useState(false)
  const [studySaveNotice, setStudySaveNotice] = useState<string | null>(null)
  const addEnglishRef = useRef<HTMLInputElement | null>(null)
  const editEnglishRef = useRef<HTMLInputElement | null>(null)

  const isSuperAdmin = profile.role === 'SUPER_ADMIN'
  const isTeacherAdmin = profile.role === 'TEACHER'
  const canManageRounds = (isSuperAdmin || isTeacherAdmin) && profile.can_manage_rounds === true

  const organizationNameMap: Record<string, string> = {
    '1723e057-5aab-4f48-a1fd-fe1fa0a9fa97': '캠브리지 영어학원',
  }
  const organizationDisplayName = isSuperAdmin
    ? '전체 학원 데이터'
    : profile.organization_id
      ? organizationNameMap[profile.organization_id] ?? '학원 미지정'
      : '학원 미지정'

  const selectedBook = useMemo(
    () => wordBooks.find((book) => book.id === selectedBookId) ?? null,
    [wordBooks, selectedBookId],
  )
  const selectedRound = useMemo(
    () => rounds.find((round) => round.id === selectedRoundId) ?? null,
    [rounds, selectedRoundId],
  )

  const currentStudyQuestion = studyQuestions[studyCurrentIndex] ?? null
  const selectedStudyBook = useMemo(
    () => wordBooks.find((book) => book.id === studyBookId) ?? null,
    [wordBooks, studyBookId],
  )

  const buildStudyQuestions = (studyWordsForRound: Word[]): StudyQuestion[] => {
    const questionKinds: Array<StudyQuestion['kind']> = shuffle([
      'english_to_meaning',
      'meaning_to_english',
      'multiple_choice',
      'direct_input',
    ])

    const chosenWords = shuffle([...studyWordsForRound]).slice(0, Math.min(10, studyWordsForRound.length))

    return chosenWords.map((word, index) => {
      const kind = questionKinds[index % questionKinds.length]
      const otherEnglish = shuffle(
        studyWordsForRound.filter((candidate) => candidate.id !== word.id).map((candidate) => candidate.english),
      )

      if (kind === 'english_to_meaning') {
        return {
          id: `${word.id}-english_to_meaning`,
          wordId: word.id,
          kind,
          prompt: `${word.english}의 뜻을 입력하세요.`,
          answer: word.meaning,
          targetType: 'meaning',
          options: [],
        }
      }

      if (kind === 'meaning_to_english') {
        return {
          id: `${word.id}-meaning_to_english`,
          wordId: word.id,
          kind,
          prompt: `${word.meaning}에 해당하는 영어 단어를 입력하세요.`,
          answer: word.english,
          targetType: 'english',
          options: [],
        }
      }

      if (kind === 'multiple_choice') {
        const optionValues = shuffle([
          word.english,
          ...otherEnglish.slice(0, 3),
        ]).slice(0, 4)

        return {
          id: `${word.id}-multiple_choice`,
          wordId: word.id,
          kind,
          prompt: `${word.meaning}에 해당하는 영어 단어는 무엇인가요?`,
          answer: word.english,
          targetType: 'english',
          options: optionValues,
        }
      }

      const directTarget = Math.random() > 0.5 ? 'english' : 'meaning'
      if (directTarget === 'english') {
        return {
          id: `${word.id}-direct_input_english`,
          wordId: word.id,
          kind,
          prompt: `${word.meaning}에 해당하는 영어 단어를 직접 입력하세요.`,
          answer: word.english,
          targetType: 'english',
          options: [],
        }
      }

      return {
        id: `${word.id}-direct_input_meaning`,
        wordId: word.id,
        kind,
        prompt: `${word.english}의 뜻을 직접 입력하세요.`,
        answer: word.meaning,
        targetType: 'meaning',
        options: [],
      }
    })
  }

  const normalizeStudyAnswer = (value: string, targetType: 'english' | 'meaning') => {
    const cleaned = targetType === 'english'
      ? normalizeEnglish(value)
      : normalizeMeaning(value)

    return cleaned
      .replace(/[\u2010-\u2015\u2212]/g, '-')
      .replace(/[^a-zA-Z0-9가-힣\s\-.,()/]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
  }

  const isEquivalentStudyAnswer = (userAnswer: string, correctAnswer: string, targetType: 'english' | 'meaning') => {
    const a = normalizeStudyAnswer(userAnswer, targetType)
    const b = normalizeStudyAnswer(correctAnswer, targetType)

    if (a === b) {
      return true
    }

    if (targetType === 'meaning') {
      const aParts = a
        .split(/[;,/]/)
        .map((part) => part.trim())
        .filter(Boolean)
      const bParts = b
        .split(/[;,/]/)
        .map((part) => part.trim())
        .filter(Boolean)

      if (aParts.length > 0 && bParts.length > 0) {
        return aParts.some((part) => bParts.includes(part))
      }
    }

    return false
  }

  const getStudyRoundIdsForSelection = (selectedIds: string[], activeBookId: string | null, candidateRounds: Round[]) => {
    if (!activeBookId) return []

    const nextIds = selectedIds.length > 0 ? selectedIds : []
    if (nextIds.length === 0) return []

    const selectedNumbers = nextIds
      .map((id) => candidateRounds.find((round) => round.id === id)?.round_number)
      .filter((value): value is number => typeof value === 'number')

    if (selectedNumbers.length === 0) return nextIds

    const minNumber = Math.min(...selectedNumbers)
    const maxNumber = Math.max(...selectedNumbers)

    return candidateRounds
      .filter((round) => round.word_book_id === activeBookId && round.round_number >= minNumber && round.round_number <= maxNumber)
      .sort((left, right) => left.round_number - right.round_number)
      .map((round) => round.id)
  }

  const refreshStudyWordCount = async (roundIds: string[]) => {
    if (roundIds.length === 0) {
      setStudyWordCount(0)
      return
    }

    const { count, error } = await supabase
      .from('words')
      .select('id', { count: 'exact', head: true })
      .in('round_id', roundIds)

    if (error) {
      setStudyWordCount(0)
      return
    }

    setStudyWordCount(count ?? 0)
  }

  const toggleStudyRoundSelection = (roundId: string) => {
    setStudyTargetRoundIds((current) => {
      const next = current.includes(roundId) ? current.filter((id) => id !== roundId) : [...current, roundId]
      if (next.length === 0) {
        void refreshStudyWordCount([])
        return []
      }

      const numbers = next
        .map((id) => studyRounds.find((round) => round.id === id)?.round_number)
        .filter((value): value is number => typeof value === 'number')

      if (numbers.length === 0) {
        void refreshStudyWordCount(next)
        return next
      }

      const minNumber = Math.min(...numbers)
      const maxNumber = Math.max(...numbers)

      const expandedIds = studyRounds
        .filter((round) => round.word_book_id === studyBookId && round.round_number >= minNumber && round.round_number <= maxNumber)
        .sort((left, right) => left.round_number - right.round_number)
        .map((round) => round.id)

      void refreshStudyWordCount(expandedIds)
      return expandedIds
    })
  }

  const loadWordBooks = async () => {
    setLoadingBooks(true)
    setError(null)

    try {
      let query = supabase.from('word_books').select('*')

      if (!isSuperAdmin && profile.organization_id) {
        query = query.eq('organization_id', profile.organization_id)
      }

      const { data, error: fetchError } = await query
        .order('title', { ascending: true })
        .order('level', { ascending: true })

      if (fetchError) {
        throw new Error(fetchError.message || '단어장 조회에 실패했습니다.')
      }

      setWordBooks((data as WordBook[]) ?? [])
      setSelectedBookId(null)
      setSelectedRoundId(null)
      setRounds([])
      setWords([])
      setStudyPhase('idle')
      setStudyQuestions([])
      setStudyCurrentIndex(0)
      setStudyWrongAnswers([])
      setStudyAnswerInput('')
      setStudySelectedChoice(null)
      setStudyStatus(null)
      setStudyCorrectCount(0)
      setStudyResult(null)
      setStudySaveNotice(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : '단어장 조회 중 오류가 발생했습니다.')
    } finally {
      setLoadingBooks(false)
    }
  }

  const loadRounds = async (bookId: string) => {
    setLoadingRounds(true)
    setError(null)

    try {
      const { data, error: fetchError } = await supabase
        .from('rounds')
        .select('*')
        .eq('word_book_id', bookId)
        .order('round_number', { ascending: true })

      if (fetchError) {
        throw new Error(fetchError.message || '회차 조회에 실패했습니다.')
      }

      setRounds((data as Round[]) ?? [])
      setSelectedRoundId(null)
      setWords([])
      setStudyPhase('idle')
      setStudyQuestions([])
      setStudyCurrentIndex(0)
      setStudyWrongAnswers([])
      setStudyAnswerInput('')
      setStudySelectedChoice(null)
      setStudyStatus(null)
      setStudyCorrectCount(0)
      setStudyResult(null)
      setStudySaveNotice(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : '회차 조회 중 오류가 발생했습니다.')
    } finally {
      setLoadingRounds(false)
    }
  }

  const loadWords = async (roundId: string) => {
    setLoadingWords(true)
    setError(null)

    try {
      const { data, error: fetchError } = await supabase
        .from('words')
        .select('*')
        .eq('round_id', roundId)
        .order('word_order', { ascending: true })

      if (fetchError) {
        throw new Error(fetchError.message || '단어 조회에 실패했습니다.')
      }

      setWords((data as Word[]) ?? [])
      setStudyPhase('idle')
      setStudyQuestions([])
      setStudyCurrentIndex(0)
      setStudyWrongAnswers([])
      setStudyAnswerInput('')
      setStudySelectedChoice(null)
      setStudyStatus(null)
      setStudyCorrectCount(0)
      setStudyResult(null)
      setStudySaveNotice(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : '단어 조회 중 오류가 발생했습니다.')
    } finally {
      setLoadingWords(false)
    }
  }

  const startStudySession = async () => {
    if (!studyBookId) {
      setStudyStatus('학습할 단어장을 먼저 선택해 주세요.')
      return
    }

    const chosenRoundIds = getStudyRoundIdsForSelection(studyTargetRoundIds, studyBookId, studyRounds)
    if (chosenRoundIds.length === 0) {
      setStudyStatus('학습할 회차를 선택해 주세요.')
      return
    }

    try {
      const { data: studyData, error: studyError } = await supabase
        .from('words')
        .select('*')
        .in('round_id', chosenRoundIds)
        .order('word_order', { ascending: true })

      if (studyError) {
        throw new Error(studyError.message || '학습용 단어를 불러오지 못했습니다.')
      }

      const nextStudyWords = (studyData as Word[]) ?? []
      if (nextStudyWords.length === 0) {
        setStudyStatus('선택한 회차에 학습할 단어가 없습니다.')
        return
      }

      const nextQuestions = buildStudyQuestions(nextStudyWords)
      setStudyQuestions(nextQuestions)
      setStudyCurrentIndex(0)
      setStudyAnswerInput('')
      setStudySelectedChoice(null)
      setStudyRevealState(null)
      setStudyWrongAnswers([])
      setStudyAnswerLog([])
      setStudyCorrectCount(0)
      setStudyResult(null)
      setStudyStartTime(new Date().toISOString())
      setStudySaveNotice(null)
      setStudyStatus(null)
      setStudyPhase('playing')
      setStudyOpen(false)
    } catch (err) {
      setStudyStatus(err instanceof Error ? err.message : '학습을 시작할 수 없습니다.')
    }
  }

  const finishStudySession = async (correctCount: number, wrongAnswers: StudyWrongAnswer[], answerLog: StudyAnswerRecord[]) => {
    const totalQuestions = studyQuestions.length
    const completedAt = new Date().toISOString()
    const score = totalQuestions > 0 ? Number(((correctCount / totalQuestions) * 100).toFixed(1)) : 0

    const finalResult = {
      totalQuestions,
      correctCount,
      score,
      wrongAnswers,
      answers: answerLog,
      startedAt: studyStartTime ?? completedAt,
      completedAt,
    }

    setStudyResult(finalResult)
    setStudyPhase('result')

    const studyResultRoundId = studyTargetRoundIds[0] ?? selectedRoundId ?? null

    if (!studyBookId || !studyResultRoundId) {
      return
    }

    const studyResultPayload = {
      id: crypto.randomUUID(),
      user_id: profile.id,
      word_book_id: studyBookId,
      round_id: studyResultRoundId,
      total_questions: totalQuestions,
      correct_count: correctCount,
      score,
      started_at: finalResult.startedAt,
      completed_at: finalResult.completedAt,
      created_at: finalResult.completedAt,
    }

    setStudySaving(true)
    try {
      const { error: insertError } = await supabase.from('study_results').insert(studyResultPayload)
      if (insertError) {
        setStudySaveNotice('결과 저장에 실패했지만, 학습 결과는 화면에 표시됩니다.')
      }
    } catch {
      setStudySaveNotice('결과 저장에 실패했지만, 학습 결과는 화면에 표시됩니다.')
    } finally {
      setStudySaving(false)
    }
  }

  const submitCurrentQuestion = async () => {
    if (!currentStudyQuestion) return

    let answerValue = ''
    if (currentStudyQuestion.kind === 'multiple_choice') {
      answerValue = studySelectedChoice ?? ''
    } else {
      answerValue = studyAnswerInput
    }

    if (answerValue.trim() === '') {
      setStudyStatus('답을 입력해 주세요.')
      return
    }

    const isCorrect = isEquivalentStudyAnswer(answerValue, currentStudyQuestion.answer, currentStudyQuestion.targetType)
    setStudyRevealState(isCorrect ? 'correct' : 'incorrect')
    const nextCorrectCount = studyCorrectCount + (isCorrect ? 1 : 0)
    const answerEntry: StudyAnswerRecord = {
      question: currentStudyQuestion,
      userAnswer: answerValue,
      correctAnswer: currentStudyQuestion.answer,
      isCorrect,
    }
    const nextAnswerLog = [...studyAnswerLog, answerEntry]
    const nextWrongAnswers = isCorrect
      ? studyWrongAnswers
      : [
          ...studyWrongAnswers,
          {
            question: currentStudyQuestion,
            userAnswer: answerValue,
            correctAnswer: currentStudyQuestion.answer,
          },
        ]

    setStudyCorrectCount(nextCorrectCount)
    setStudyWrongAnswers(nextWrongAnswers)
    setStudyAnswerLog(nextAnswerLog)

    const isLastQuestion = studyCurrentIndex >= studyQuestions.length - 1
    if (isLastQuestion) {
      await finishStudySession(nextCorrectCount, nextWrongAnswers, nextAnswerLog)
      return
    }

    setStudyCurrentIndex((current) => current + 1)
    setStudyAnswerInput('')
    setStudySelectedChoice(null)
    setStudyRevealState(null)
    setStudyStatus(null)
  }

  const startEditWord = (word: Word) => {
    setEditingWord(word)
    setEditEnglish(word.english)
    setEditMeaning(word.meaning)
  }

  const closeEdit = () => {
    setEditingWord(null)
    setEditEnglish('')
    setEditMeaning('')
  }

  const saveWordEdit = async () => {
    if (!editingWord) return
    if (editEnglish.trim() === '') {
      setError('영어 단어를 입력하세요.')
      return
    }

    setSavingWord(true)
    setError(null)

    try {
      const { error: updateError } = await supabase
        .from('words')
        .update({
          english: editEnglish,
          meaning: editMeaning,
          updated_by: profile.id,
        })
        .eq('id', editingWord.id)

      if (updateError) {
        throw new Error(updateError.message || '단어 저장에 실패했습니다.')
      }

      closeEdit()
      void loadWords(editingWord.round_id)
    } catch (err) {
      setError(err instanceof Error ? err.message : '단어 수정 중 오류가 발생했습니다.')
    } finally {
      setSavingWord(false)
    }
  }

  const startAddWord = () => {
    setIsAdding(true)
    setAddEnglish('')
    setAddMeaning('')
  }

  const closeAdd = () => {
    setIsAdding(false)
    setAddEnglish('')
    setAddMeaning('')
  }

  const openDeleteConfirm = (word: Word) => {
    setWordToDelete(word)
  }

  const closeDeleteConfirm = () => {
    setWordToDelete(null)
  }

  const deleteWord = async () => {
    if (!wordToDelete || !selectedRoundId) return

    setDeletingWord(true)
    setError(null)

    try {
      const { error: deleteError } = await supabase
        .from('words')
        .delete()
        .eq('id', wordToDelete.id)

      if (deleteError) {
        throw new Error(deleteError.message || '단어 삭제에 실패했습니다.')
      }

      closeDeleteConfirm()
      await loadWords(selectedRoundId)
    } catch (err) {
      setError(err instanceof Error ? err.message : '단어 삭제 중 오류가 발생했습니다.')
    } finally {
      setDeletingWord(false)
    }
  }

  const saveAddWord = async () => {
    if (!selectedRoundId) return

    setAddingWord(true)
    setError(null)

    if (addEnglish.trim() === '') {
      setError('영어 단어를 입력하세요.')
      setAddingWord(false)
      return
    }

    try {
      const { data: maxData, error: maxError } = await supabase
        .from('words')
        .select('word_order')
        .eq('round_id', selectedRoundId)
        .order('word_order', { ascending: false })
        .limit(1)

      if (maxError) {
        throw new Error(maxError.message || '최대 단어 순서 조회 실패')
      }

      const maxOrder = (maxData && (maxData as any)[0]?.word_order) ?? 0
      const newOrder = (typeof maxOrder === 'number' ? maxOrder : parseInt(maxOrder || '0', 10)) + 1

      const { data: inserted, error: insertError } = await supabase
        .from('words')
        .insert({
          round_id: selectedRoundId,
          word_order: newOrder,
          english: addEnglish,
          meaning: addMeaning,
          created_by: profile.id,
          updated_by: profile.id,
        })
        .select()
        .single()

      if (insertError) {
        throw new Error(insertError.message || '단어 추가에 실패했습니다.')
      }

      const insertedId = (inserted as any)?.id ?? null
      setLastAddedWordId(insertedId ? String(insertedId) : null)

      closeAdd()
      await loadWords(selectedRoundId)
      setTimeout(() => setLastAddedWordId(null), 5000)
    } catch (err) {
      setError(err instanceof Error ? err.message : '단어 추가 중 오류가 발생했습니다.')
    } finally {
      setAddingWord(false)
    }
  }

  useEffect(() => {
    if (isAdding) {
      setTimeout(() => addEnglishRef.current?.focus(), 50)
    }
  }, [isAdding])

  useEffect(() => {
    if (editingWord) {
      setTimeout(() => editEnglishRef.current?.focus(), 50)
    }

    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (editingWord) {
          closeEdit()
          e.preventDefault()
        } else if (isAdding) {
          closeAdd()
          e.preventDefault()
        } else if (wordToDelete) {
          closeDeleteConfirm()
          e.preventDefault()
        }
        return
      }

      if (e.key !== 'Enter') return

      const active = document.activeElement
      if (!active) return

      const isInput = active instanceof HTMLInputElement
      const isTextArea = active instanceof HTMLTextAreaElement

      if (isTextArea) return
      if (!isInput) return

      if (editingWord && !savingWord && editEnglish.trim() !== '') {
        e.preventDefault()
        void saveWordEdit()
      } else if (isAdding && !addingWord && addEnglish.trim() !== '') {
        e.preventDefault()
        void saveAddWord()
      }
    }

    if (editingWord || isAdding || wordToDelete) {
      window.addEventListener('keydown', handler)
    }

    return () => {
      window.removeEventListener('keydown', handler)
    }
  }, [editingWord, isAdding, wordToDelete, savingWord, addingWord, editEnglish, addEnglish])

  useEffect(() => {
    if (!lastAddedWordId) return

    const scrollToNew = () => {
      const selector = `[data-word-id="${lastAddedWordId}"]`
      const el = document.querySelector(selector) as HTMLElement | null
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }

    const t = window.setTimeout(scrollToNew, 50)
    scrollToNew()

    return () => window.clearTimeout(t)
  }, [words, lastAddedWordId])

  useEffect(() => {
    void loadWordBooks()
  }, [profile.organization_id, isSuperAdmin])

  const handleBookSelect = (bookId: string) => {
    setSelectedBookId(bookId)
    setSelectedRoundId(null)
    setWords([])
    void loadRounds(bookId)
  }

  const handleRoundSelect = (roundId: string) => {
    setSelectedRoundId(roundId)
    void loadWords(roundId)
  }

  const resetStudyFlow = () => {
    setStudyPhase('idle')
    setStudyOpen(false)
    setStudyExitConfirmOpen(false)
    setStudyBookId(null)
    setStudyTargetRoundIds([])
    setStudyRounds([])
    setStudyQuestions([])
    setStudyCurrentIndex(0)
    setStudyAnswerInput('')
    setStudySelectedChoice(null)
    setStudyRevealState(null)
    setStudyWrongAnswers([])
    setStudyAnswerLog([])
    setStudyCorrectCount(0)
    setStudyStatus(null)
    setStudyResult(null)
    setStudySaveNotice(null)
    setStudyStartTime(null)
    setStudyWordCount(0)
  }

  const reopenStudySelection = (keepRoundSelection: boolean) => {
    setStudyPhase('idle')
    setStudyOpen(true)
    setStudyExitConfirmOpen(false)
    setStudyQuestions([])
    setStudyCurrentIndex(0)
    setStudyAnswerInput('')
    setStudySelectedChoice(null)
    setStudyRevealState(null)
    setStudyWrongAnswers([])
    setStudyAnswerLog([])
    setStudyCorrectCount(0)
    setStudyStatus(null)
    setStudyResult(null)
    setStudySaveNotice(null)
    setStudyStartTime(null)

    if (keepRoundSelection) {
      setStudyWordCount(0)
      if (studyBookId) {
        void loadStudyRounds(studyBookId)
      }
      return
    }

    setStudyBookId(null)
    setStudyTargetRoundIds([])
    setStudyRounds([])
    setStudyWordCount(0)
  }

  const exitStudySession = () => {
    resetStudyFlow()
  }

  const openStudyFlow = () => {
    const defaultBookId = selectedBookId ?? wordBooks[0]?.id ?? null
    const defaultSelection = selectedBookId === defaultBookId && selectedRoundId ? [selectedRoundId] : []
    setStudyBookId(defaultBookId)
    setStudyTargetRoundIds(defaultSelection)
    setStudyStatus(null)
    setStudyOpen(true)

    if (defaultBookId) {
      void loadStudyRounds(defaultBookId)
    }
  }

  const loadStudyRounds = async (bookId: string) => {
    try {
      const { data, error } = await supabase
        .from('rounds')
        .select('*')
        .eq('word_book_id', bookId)
        .order('round_number', { ascending: true })

      if (error) {
        throw new Error(error.message || '학습 회차 조회에 실패했습니다.')
      }

      const nextRounds = (data as Round[]) ?? []
      setStudyRounds(nextRounds)
      const nextSelection = nextRounds.filter((round) => studyTargetRoundIds.includes(round.id)).map((round) => round.id)
      setStudyTargetRoundIds(nextSelection)
      void refreshStudyWordCount(nextSelection)
    } catch (err) {
      setStudyStatus(err instanceof Error ? err.message : '학습 회차를 불러오지 못했습니다.')
    }
  }

  const isStudySessionActive = studyPhase === 'playing' || studyPhase === 'result'
  const selectedStudyRoundNumbers = useMemo(
    () => studyTargetRoundIds
      .map((id) => studyRounds.find((round) => round.id === id)?.round_number)
      .filter((value): value is number => typeof value === 'number')
      .sort((left, right) => left - right),
    [studyRounds, studyTargetRoundIds],
  )
  const selectedStudyRangeText = selectedStudyRoundNumbers.length === 0
    ? '선택된 회차가 없습니다.'
    : selectedStudyRoundNumbers.length === 1
      ? `${selectedStudyRoundNumbers[0]}회`
      : `${selectedStudyRoundNumbers[0]}~${selectedStudyRoundNumbers[selectedStudyRoundNumbers.length - 1]}회`

  const isStudentOnly = !canManageRounds

  return (
    <section className="home-page">
      <div className="home-card">
        <div className="home-header">
          <h1>{profile.display_name}님</h1>
          <p className="profile-note">{organizationDisplayName}</p>
        </div>

        {canManageRounds ? (
          <div className="home-action-row">
            <button type="button" className="secondary-button" onClick={() => setIsOcrOpen(true)}>
              📷 사진으로 가져오기
            </button>
            <button type="button" className="secondary-button" onClick={openStudyFlow}>
              📖 학습하기
            </button>
          </div>
        ) : (
          <div className="home-action-row">
            <button type="button" className="secondary-button" onClick={openStudyFlow}>
              📖 학습하기
            </button>
          </div>
        )}

        {!isStudySessionActive ? (
          <div className="learning-layout">
            <div className="panel">
              <h2>단어장 선택</h2>
              {loadingBooks ? (
                <p>단어장을 불러오는 중입니다...</p>
              ) : wordBooks.length > 0 ? (
                <ul className="item-list">
                  {wordBooks.map((book) => (
                    <li key={book.id}>
                      <button
                        type="button"
                        className={book.id === selectedBookId ? 'item-button selected' : 'item-button'}
                        onClick={() => handleBookSelect(book.id)}
                      >
                        <strong>{book.title}</strong>
                        <span>{book.level}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>단어장이 없습니다.</p>
              )}
            </div>

            {selectedBook ? (
              <div className="panel">
                <h2>회차 선택</h2>
                {loadingRounds ? (
                  <p>회차를 불러오는 중입니다...</p>
                ) : rounds.length > 0 ? (
                  <ul className="item-list">
                    {rounds.map((round) => (
                      <li key={round.id}>
                        <button
                          type="button"
                          className={round.id === selectedRoundId ? 'item-button selected' : 'item-button'}
                          onClick={() => handleRoundSelect(round.id)}
                        >
                          <strong>{round.round_number}회</strong>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>회차가 없습니다.</p>
                )}
              </div>
            ) : null}

            {selectedRound && isStudentOnly ? (
              <div className="panel">
                <h2>단어 목록</h2>
                {loadingWords ? (
                  <p>단어를 불러오는 중입니다...</p>
                ) : words.length > 0 ? (
                  <ul className="word-list">
                    {words.map((word) => (
                      <li key={word.id} data-word-id={word.id} className={'word-item' + (word.id === lastAddedWordId ? ' added' : '')}>
                        <div className="word-item-content">
                          <strong>{word.word_order}. {word.english}</strong>
                          <p>{word.meaning}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>단어가 없습니다.</p>
                )}
              </div>
            ) : null}

            {selectedRound && !isStudentOnly ? (
              <div className="panel">
                <h2>단어 목록</h2>
                {loadingWords ? (
                  <p>단어를 불러오는 중입니다...</p>
                ) : words.length > 0 ? (
                  <ul className="word-list">
                    {words.map((word) => (
                      <li key={word.id} data-word-id={word.id} className={'word-item' + (word.id === lastAddedWordId ? ' added' : '')}>
                        <div className="word-item-content">
                          <strong>{word.word_order}. {word.english}</strong>
                          <p>{word.meaning}</p>
                        </div>
                        <div className="word-item-actions">
                          <button
                            type="button"
                            className="edit-icon-button"
                            onClick={() => startEditWord(word)}
                            aria-label="단어 수정"
                          >
                            ✏️
                          </button>
                          <button
                            type="button"
                            className="delete-icon-button"
                            onClick={() => openDeleteConfirm(word)}
                            aria-label="단어 삭제"
                          >
                            🗑️
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>단어가 없습니다.</p>
                )}
                <div className="home-action-stack">
                  <button type="button" className="secondary-button" onClick={startAddWord}>
                    + 단어 추가
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {studyPhase === 'playing' && currentStudyQuestion ? (
          <div className="panel study-panel">
            <div className="study-header-row">
              <h2>문제 {studyCurrentIndex + 1}/{studyQuestions.length}</h2>
              <div className="study-header-actions">
                <span className="study-count">{studyCorrectCount}개 정답</span>
                <button type="button" className="study-exit-button" onClick={() => setStudyExitConfirmOpen(true)}>
                  학습 종료
                </button>
              </div>
            </div>

            <div className="study-question-box">
              <p>{currentStudyQuestion.prompt}</p>
            </div>

            {currentStudyQuestion.kind === 'multiple_choice' ? (
              <div className="study-options">
                {currentStudyQuestion.options.map((option) => {
                  const isSelected = studySelectedChoice === option
                  const isCorrectOption = option === currentStudyQuestion.answer
                  const optionClass = studyRevealState === null
                    ? (isSelected
                        ? 'selection-button selected'
                        : studySelectedChoice !== null
                          ? 'selection-button dimmed'
                          : 'selection-button')
                    : isCorrectOption
                      ? 'study-option correct'
                      : isSelected
                        ? 'study-option incorrect'
                        : 'study-option dimmed'

                  return (
                    <button
                      key={option}
                      type="button"
                      className={optionClass}
                      onClick={() => {
                        setStudySelectedChoice(option)
                        setStudyStatus(null)
                      }}
                    >
                      {option}
                    </button>
                  )
                })}
              </div>
            ) : (
              <label className="study-input-label">
                답안 입력
                <input
                  type="text"
                  value={studyAnswerInput}
                  onChange={(event) => setStudyAnswerInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      void submitCurrentQuestion()
                    }
                  }}
                  placeholder={currentStudyQuestion.targetType === 'english' ? '영어를 입력하세요' : '뜻을 입력하세요'}
                />
              </label>
            )}

            {studyStatus ? <p className="study-status">{studyStatus}</p> : null}

            <div className="study-actions">
              <button
                type="button"
                className="study-next-button"
                onClick={() => void submitCurrentQuestion()}
                disabled={currentStudyQuestion.kind === 'multiple_choice' && !studySelectedChoice}
              >
                {studyCurrentIndex === studyQuestions.length - 1 ? '결과 보기' : '다음 문제 →'}
              </button>
            </div>
          </div>
        ) : null}

        {studyPhase === 'result' && studyResult ? (
          <div className="panel study-panel">
            <div className="study-header-row">
              <h2>학습 완료</h2>
            </div>
            <div className="study-result-box">
              <p>
                {studyResult.totalQuestions}문제 중 {studyResult.correctCount}문제 정답
              </p>
              <p>
                정답률 {studyResult.score}%
              </p>
            </div>

            {studySaving ? <p className="study-status">결과 저장 중...</p> : null}
            {studySaveNotice ? <p className="study-status">{studySaveNotice}</p> : null}

            <div className="study-answer-list">
              <h3>문제별 결과</h3>
              {studyResult.answers.map((entry, index) => (
                <div key={`${entry.question.id}-${index}`} className={entry.isCorrect ? 'study-answer-item correct' : 'study-answer-item wrong'}>
                  <p className="study-answer-title">
                    {entry.isCorrect ? '✅' : '❌'} {index + 1}. {entry.question.prompt}
                  </p>
                  <p><strong>내 답:</strong> {entry.userAnswer}</p>
                  <p><strong>정답:</strong> {entry.correctAnswer}</p>
                </div>
              ))}
            </div>

            <div className="study-actions split-actions">
              <button type="button" className="secondary-button" onClick={() => {
                reopenStudySelection(true)
              }}>
                다시 풀기
              </button>
              <button type="button" className="study-exit-button" onClick={exitStudySession}>
                  학습 종료
                </button>
            </div>
          </div>
        ) : null}

        {error ? <p className="error">{error}</p> : null}

        <button type="button" className="logout-button" onClick={onLogout}>
          로그아웃
        </button>
      </div>

      {studyOpen ? (
        <div className="modal-overlay">
          <div className="modal study-modal">
            <div className="modal-header-row">
              <h3>학습하기</h3>
              <button type="button" className="icon-button-close" onClick={() => setStudyOpen(false)} aria-label="닫기">
                ✕
              </button>
            </div>

            {!selectedBookId ? (
              <label className="study-select-label">
                단어장 선택
                <select
                  value={studyBookId ?? ''}
                  onChange={(event) => {
                    const nextBookId = event.target.value || null
                    setStudyBookId(nextBookId)
                    setStudyTargetRoundIds([])
                    setStudyWordCount(0)
                    if (nextBookId) {
                      void loadStudyRounds(nextBookId)
                    }
                  }}
                >
                  <option value="">단어장을 선택하세요</option>
                  {wordBooks.map((book) => (
                    <option key={book.id} value={book.id}>{book.title} {book.level}</option>
                  ))}
                </select>
              </label>
            ) : (
              <div className="study-book-card">
                <strong>{selectedStudyBook?.title ?? selectedBook?.title ?? '선택한 단어장'}</strong>
                <span>{selectedStudyBook?.level ?? selectedBook?.level ?? 'P2'}</span>
              </div>
            )}

            <div className="study-selection-summary">
              <strong>선택한 회차</strong>
              <span>{selectedStudyRangeText}</span>
              <small>총 단어 수: {studyWordCount}개</small>
            </div>

            <div className="study-round-grid">
              {studyRounds.map((round) => {
                const isSelected = studyTargetRoundIds.includes(round.id)
                return (
                  <button
                    key={round.id}
                    type="button"
                    className={isSelected ? 'study-round-chip selected' : 'study-round-chip'}
                    onClick={() => toggleStudyRoundSelection(round.id)}
                  >
                    {isSelected ? '✓ ' : ''}{round.round_number}회
                  </button>
                )
              })}
            </div>

            <div className="study-actions split-actions">
              <button type="button" className="secondary-button" onClick={() => setStudyOpen(false)}>
                취소
              </button>
              <button type="button" className="primary-button" onClick={() => void startStudySession()} disabled={studyTargetRoundIds.length === 0 || !studyBookId}>
                학습 시작
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {studyExitConfirmOpen ? (
        <div className="modal-overlay">
          <div className="modal">
            <h3>학습 종료</h3>
            <p className="modal-message">학습을 종료할까요? 진행 중인 답안은 저장되지 않습니다.</p>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setStudyExitConfirmOpen(false)}>
                계속 학습
              </button>
              <button type="button" className="danger-button" onClick={exitStudySession}>
                학습 종료
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {wordToDelete ? (
        <div className="modal-overlay">
          <div className="modal">
            <h3>단어 삭제</h3>
            <p className="modal-message">다음 단어를 삭제할까요?</p>
            <div className="delete-preview">
              <strong>{wordToDelete.english}</strong>
              <span>{wordToDelete.meaning}</span>
            </div>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={closeDeleteConfirm}>
                취소
              </button>
              <button type="button" className="danger-button" onClick={deleteWord} disabled={deletingWord}>
                {deletingWord ? '삭제 중…' : '삭제'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {editingWord ? (
        <div className="modal-overlay">
          <div className="modal">
            <h3>단어 수정</h3>
            <label>
              영어
              <input
                ref={editEnglishRef}
                type="text"
                value={editEnglish}
                onChange={(event) => setEditEnglish(event.target.value)}
                className={editEnglish.trim() === '' ? 'invalid' : ''}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !savingWord && editEnglish.trim() !== '') {
                    e.preventDefault()
                    void saveWordEdit()
                  } else if (e.key === 'Escape') {
                    e.preventDefault()
                    closeEdit()
                  }
                }}
              />
              {editEnglish.trim() === '' ? (
                <div className="field-error">영어 단어를 입력하세요.</div>
              ) : null}
            </label>
            <label>
              뜻
              <textarea
                rows={4}
                value={editMeaning}
                onChange={(event) => setEditMeaning(event.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.preventDefault()
                    closeEdit()
                  }
                }}
              />
            </label>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={closeEdit}>
                취소
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={saveWordEdit}
                disabled={savingWord || editEnglish.trim() === ''}
              >
                {savingWord ? '저장 중…' : '저장'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isAdding ? (
        <div className="modal-overlay">
          <div className="modal">
            <h3>단어 추가</h3>
            <label>
              영어
              <input
                ref={addEnglishRef}
                type="text"
                value={addEnglish}
                onChange={(event) => setAddEnglish(event.target.value)}
                className={addEnglish.trim() === '' ? 'invalid' : ''}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !addingWord && addEnglish.trim() !== '') {
                    e.preventDefault()
                    void saveAddWord()
                  } else if (e.key === 'Escape') {
                    e.preventDefault()
                    closeAdd()
                  }
                }}
              />
              {addEnglish.trim() === '' ? (
                <div className="field-error">영어 단어를 입력하세요.</div>
              ) : null}
            </label>
            <label>
              뜻
              <textarea
                rows={4}
                value={addMeaning}
                onChange={(event) => setAddMeaning(event.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.preventDefault()
                    closeAdd()
                  }
                }}
              />
            </label>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={closeAdd}>
                취소
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={saveAddWord}
                disabled={addingWord || addEnglish.trim() === ''}
              >
                {addingWord ? '저장 중…' : '저장'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {canManageRounds ? (
        <OcrImportModal
          isOpen={isOcrOpen}
          profile={profile}
          onClose={() => setIsOcrOpen(false)}
          onImported={async () => {
            if (selectedBookId) {
              await loadRounds(selectedBookId)
            }
          }}
        />
      ) : null}
    </section>
  )
}
