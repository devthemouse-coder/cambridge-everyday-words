import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Profile } from '../types/auth'

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
  const [editingWord, setEditingWord] = useState<Word | null>(null)
  const [editEnglish, setEditEnglish] = useState('')
  const [editMeaning, setEditMeaning] = useState('')
  const [error, setError] = useState<string | null>(null)

  const isSuperAdmin = profile.role === 'SUPER_ADMIN'
  const canManageRounds = isSuperAdmin || profile.can_manage_rounds

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
      let query: any = supabase.from('word_books')
      if (!isSuperAdmin) {
        query = query.eq('organization_id', profile.organization_id)
      }
      const { data, error: fetchError } = await query.select('*').order('title', { ascending: true }).order('level', { ascending: true })

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
          <p className="profile-note">
            {isSuperAdmin ? 'SUPER_ADMIN 전체 데이터' : `학원 ID: ${profile.organization_id ?? '미정'}`}
          </p>
        </div>

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
                    <li key={word.id} className="word-item">
                      <div className="word-item-content">
                        <strong>{word.word_order}. {word.english}</strong>
                        <p>{word.meaning}</p>
                      </div>
                      {canManageRounds ? (
                        <button
                          type="button"
                          className="edit-icon-button"
                          onClick={() => startEditWord(word)}
                          aria-label="단어 수정"
                        >
                          ✏️
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>단어가 없습니다.</p>
              )}
              {canManageRounds ? (
                <button type="button" className="secondary-button" disabled>
                  + 단어 추가
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        {error ? <p className="error">{error}</p> : null}

        <button type="button" className="logout-button" onClick={onLogout}>
          로그아웃
        </button>
      </div>

      {editingWord ? (
        <div className="modal-overlay">
          <div className="modal">
            <h3>단어 수정</h3>
            <label>
              영어
              <input
                type="text"
                value={editEnglish}
                onChange={(event) => setEditEnglish(event.target.value)}
              />
            </label>
            <label>
              뜻
              <textarea
                rows={4}
                value={editMeaning}
                onChange={(event) => setEditMeaning(event.target.value)}
              />
            </label>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={closeEdit}>
                취소
              </button>
              <button type="button" className="primary-button" onClick={saveWordEdit} disabled={savingWord}>
                {savingWord ? '저장 중…' : '저장'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
