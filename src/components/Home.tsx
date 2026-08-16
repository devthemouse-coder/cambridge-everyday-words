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

interface HomeProps {
  profile: Profile
  onLogout: () => void
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
  const addEnglishRef = useRef<HTMLInputElement | null>(null)
  const editEnglishRef = useRef<HTMLInputElement | null>(null)

  const isSuperAdmin = profile.role === 'SUPER_ADMIN'
  const canManageRounds = isSuperAdmin || profile.can_manage_rounds
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
    } catch (err) {
      setError(err instanceof Error ? err.message : '단어 조회 중 오류가 발생했습니다.')
    } finally {
      setLoadingWords(false)
    }
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
      loadWords(editingWord.round_id)
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
      // get current max word_order for the round
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

      // remember newly inserted id to highlight (force to string to match rendered ids)
      const _insertedId = (inserted as any)?.id ?? null
      setLastAddedWordId(_insertedId ? String(_insertedId) : null)

      closeAdd()
      await loadWords(selectedRoundId)

      // clear highlight after a short delay
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
    // focus edit english when editing
    if (editingWord) {
      setTimeout(() => editEnglishRef.current?.focus(), 50)
    }

    const handler = (e: KeyboardEvent) => {
      // Escape closes modals
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

      // If Enter pressed, only trigger when an input (not textarea) is focused
      const active = document.activeElement
      if (!active) return

      const isInput = active instanceof HTMLInputElement
      const isTextArea = active instanceof HTMLTextAreaElement

      if (isTextArea) {
        // do nothing: allow newline in textarea
        return
      }

      if (!isInput) return

      // prevent double-submit while saving
      if (editingWord && !savingWord && editEnglish.trim() !== '') {
        // trigger save
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

    // Try to find the newly added element and scroll it into view
    const scrollToNew = () => {
      const selector = `[data-word-id="${lastAddedWordId}"]`
      const el = document.querySelector(selector) as HTMLElement | null
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }

    // small delay to ensure DOM rendered
    const t = window.setTimeout(scrollToNew, 50)
    // also try immediately
    scrollToNew()

    return () => window.clearTimeout(t)
  }, [words, lastAddedWordId])

  useEffect(() => {
    loadWordBooks()
  }, [profile.organization_id, isSuperAdmin])

  const handleBookSelect = (bookId: string) => {
    setSelectedBookId(bookId)
    setSelectedRoundId(null)
    setWords([])
    loadRounds(bookId)
  }

  const handleRoundSelect = (roundId: string) => {
    setSelectedRoundId(roundId)
    loadWords(roundId)
  }

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
          </div>
        ) : null}

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

          {selectedRound ? (
            <div className="panel">
              <h2>단어 목록</h2>
              {loadingWords ? (
                <p>단어를 불러오는 중입니다...</p>
              ) : words.length > 0 ? (
                <ul className="word-list">
                  {words.map((word) => (
                    <li key={word.id} data-word-id={word.id} className={"word-item" + (word.id === lastAddedWordId ? ' added' : '')}>
                      <div className="word-item-content">
                        <strong>{word.word_order}. {word.english}</strong>
                        <p>{word.meaning}</p>
                      </div>
                      {canManageRounds ? (
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
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>단어가 없습니다.</p>
              )}
              {canManageRounds ? (
                <div className="home-action-stack">
                  <button type="button" className="secondary-button" onClick={startAddWord}>
                    + 단어 추가
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        {error ? <p className="error">{error}</p> : null}

        <button type="button" className="logout-button" onClick={onLogout}>
          로그아웃
        </button>
      </div>

      {wordToDelete ? (
        <div className="modal-overlay">
          <div className="modal">
            <h3>단어 삭제</h3>
            <p className="modal-message">
              다음 단어를 삭제할까요?
            </p>
            <div className="delete-preview">
              <strong>{wordToDelete.english}</strong>
              <span>{wordToDelete.meaning}</span>
            </div>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={closeDeleteConfirm}>
                취소
              </button>
              <button
                type="button"
                className="danger-button"
                onClick={deleteWord}
                disabled={deletingWord}
              >
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
