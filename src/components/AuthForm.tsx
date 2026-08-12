import { useMemo, useState } from 'react'
import { supabase, makeAuthEmail } from '../lib/supabase'
import type { Profile } from '../types/auth'

const USERNAME_PATTERN = /^[a-z0-9_-]{4,20}$/

interface AuthFormProps {
  onLoginSuccess: (profile: Profile) => void
}

interface SignupFormState {
  username: string
  password: string
  passwordConfirm: string
  displayName: string
  organizationId: string
  recoveryQuestion: string
  recoveryHint: string
  email: string
}

const initialSignup: SignupFormState = {
  username: '',
  password: '',
  passwordConfirm: '',
  displayName: '',
  organizationId: '',
  recoveryQuestion: '',
  recoveryHint: '',
  email: '',
}

const orgOptions = [
  { id: '1723e057-5aab-4f48-a1fd-fe1fa0a9fa97', name: '캠브리지 영어학원' },
]

export default function AuthForm({ onLoginSuccess }: AuthFormProps) {
  const [isSignup, setIsSignup] = useState(false)
  const [signupState, setSignupState] = useState<SignupFormState>(initialSignup)
  const [loginUsername, setLoginUsername] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const usernameError = useMemo(() => {
    if (!signupState.username) {
      return '아이디는 필수입니다.'
    }
    if (!USERNAME_PATTERN.test(signupState.username)) {
      return '4~20자, 영문 소문자/숫자/_/- 만 허용합니다.'
    }
    return null
  }, [signupState.username])

  const validateSignupValues = async () => {
    setError(null)

    if (usernameError) {
      throw new Error(usernameError)
    }
    if (!signupState.password) {
      throw new Error('비밀번호를 입력해주세요.')
    }
    if (signupState.password.length < 6) {
      throw new Error('비밀번호는 최소 6자 이상이어야 합니다.')
    }
    if (signupState.password !== signupState.passwordConfirm) {
      throw new Error('비밀번호가 일치하지 않습니다.')
    }
    if (!signupState.displayName.trim()) {
      throw new Error('표시명칭을 입력해주세요.')
    }
    if (!signupState.organizationId) {
      throw new Error('학원을 선택해주세요.')
    }
    if (!signupState.recoveryQuestion.trim()) {
      throw new Error('계정 찾기 질문을 입력해주세요.')
    }
    if (!signupState.recoveryHint.trim()) {
      throw new Error('계정 찾기 힌트를 입력해주세요.')
    }

    const { data: existingProfile, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', signupState.username)
      .maybeSingle()

    if (profileError) {
      throw new Error('아이디 중복 확인 중 오류가 발생했습니다.')
    }
    if (existingProfile) {
      throw new Error('이미 사용 중인 아이디입니다.')
    }
  }

  const handleSignup = async () => {
    setIsSubmitting(true)
    setError(null)

    try {
      await validateSignupValues()

      const email = makeAuthEmail(signupState.username)
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password: signupState.password,
      })

      if (signUpError) {
        throw new Error(signUpError.message || '회원가입에 실패했습니다.')
      }

      const authUserId = signUpData?.user?.id
      if (!authUserId) {
        throw new Error('회원가입 후 사용자 정보를 가져오지 못했습니다.')
      }

      const profilePayload = {
        id: authUserId,
        username: signupState.username,
        display_name: signupState.displayName.trim(),
        role: 'STUDENT' as const,
        organization_id: signupState.organizationId,
        can_manage_rounds: false,
        recovery_question: signupState.recoveryQuestion.trim(),
        recovery_hint: signupState.recoveryHint.trim(),
        email: signupState.email.trim() || null,
        is_active: true,
      }

      const { error: insertError } = await supabase
        .from('profiles')
        .insert(profilePayload)

      if (insertError) {
        throw new Error(insertError.message || '프로필 생성에 실패했습니다.')
      }

      onLoginSuccess(profilePayload)
    } catch (e) {
      const message = e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다.'
      setError(message)
      await cleanupFailedSignup()
    } finally {
      setIsSubmitting(false)
    }
  }

  const cleanupFailedSignup = async () => {
    await supabase.auth.signOut()
  }

  const handleLogin = async () => {
    setIsSubmitting(true)
    setError(null)

    try {
      if (!loginUsername.trim() || !loginPassword) {
        throw new Error('아이디와 비밀번호를 모두 입력해주세요.')
      }

      const loginId = loginUsername.trim()
      const loginEmails = [makeAuthEmail(loginId)]
      if (loginId === 'dev.themouse') {
        loginEmails.push('dev.themouse@gmail.com')
      }

      let signInResult: Awaited<ReturnType<typeof supabase.auth.signInWithPassword>> | null = null
      let signInError: Error | null = null

      for (const email of loginEmails) {
        const result = await supabase.auth.signInWithPassword({
          email,
          password: loginPassword,
        })

        if (!result.error) {
          signInResult = result
          signInError = null
          break
        }

        signInError = new Error(result.error.message || '로그인에 실패했습니다.')
      }

      if (signInError || !signInResult) {
        throw new Error('로그인에 실패했습니다.')
      }

      const session = signInResult.data.session
      if (!session || !session.user) {
        throw new Error('로그인 후 세션 정보를 가져오지 못했습니다.')
      }

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .maybeSingle()

      if (profileError) {
        throw new Error('프로필을 불러오는 중 오류가 발생했습니다.')
      }
      if (!profileData) {
        throw new Error('사용자 프로필을 찾을 수 없습니다.')
      }

      onLoginSuccess(profileData)
    } catch (e) {
      setError(e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="auth-page">
      <section className="card">
        <h1>{isSignup ? '회원가입' : '로그인'}</h1>

        {isSignup ? (
          <>
            <label>
              아이디
              <input
                value={signupState.username}
                onChange={(event) =>
                  setSignupState((prev) => ({ ...prev, username: event.target.value }))
                }
                autoCapitalize="none"
                autoComplete="username"
                placeholder="영문 소문자, 숫자, _, -"
              />
            </label>
            <label>
              비밀번호
              <input
                type="password"
                value={signupState.password}
                onChange={(event) =>
                  setSignupState((prev) => ({ ...prev, password: event.target.value }))
                }
                autoComplete="new-password"
              />
            </label>
            <label>
              비밀번호 확인
              <input
                type="password"
                value={signupState.passwordConfirm}
                onChange={(event) =>
                  setSignupState((prev) => ({ ...prev, passwordConfirm: event.target.value }))
                }
                autoComplete="new-password"
              />
            </label>
            <label>
              표시명칭
              <input
                value={signupState.displayName}
                onChange={(event) =>
                  setSignupState((prev) => ({ ...prev, displayName: event.target.value }))
                }
              />
            </label>
            <label>
              학원
              <select
                value={signupState.organizationId}
                onChange={(event) =>
                  setSignupState((prev) => ({ ...prev, organizationId: event.target.value }))
                }
              >
                <option value="">학원을 선택하세요</option>
                {orgOptions.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              계정 찾기 질문
              <input
                value={signupState.recoveryQuestion}
                onChange={(event) =>
                  setSignupState((prev) => ({ ...prev, recoveryQuestion: event.target.value }))
                }
              />
            </label>
            <label>
              계정 찾기 힌트
              <input
                value={signupState.recoveryHint}
                onChange={(event) =>
                  setSignupState((prev) => ({ ...prev, recoveryHint: event.target.value }))
                }
              />
            </label>
            <label>
              이메일 (선택)
              <input
                type="email"
                value={signupState.email}
                onChange={(event) =>
                  setSignupState((prev) => ({ ...prev, email: event.target.value }))
                }
              />
            </label>
            <button type="button" disabled={isSubmitting} onClick={handleSignup}>
              가입하기
            </button>
          </>
        ) : (
          <>
            <label>
              아이디
              <input
                value={loginUsername}
                onChange={(event) => setLoginUsername(event.target.value)}
                autoCapitalize="none"
                autoComplete="username"
              />
            </label>
            <label>
              비밀번호
              <input
                type="password"
                value={loginPassword}
                onChange={(event) => setLoginPassword(event.target.value)}
                autoComplete="current-password"
              />
            </label>
            <button type="button" disabled={isSubmitting} onClick={handleLogin}>
              로그인
            </button>
          </>
        )}

        {error ? <p className="error">{error}</p> : null}

        <div className="switch-row">
          <span>{isSignup ? '이미 계정이 있나요?' : '계정이 없으신가요?'}</span>
        </div>
        <div className="switch-row-1">
          <button type="button" className="text-button" onClick={() => setIsSignup((prev) => !prev)}>
            {isSignup ? '로그인' : '회원가입'}
          </button>
        </div>
      </section>
    </main>
  )
}
