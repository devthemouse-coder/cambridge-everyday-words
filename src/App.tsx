import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import type { Profile } from './types/auth'
import AuthForm from './components/AuthForm'
import Home from './components/Home'
import './App.css'

function App() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const loadProfileFromSession = async () => {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
    if (sessionError) {
      setLoadError('세션 정보를 불러오는 중 오류가 발생했습니다.')
      setProfile(null)
      return
    }

    const userId = sessionData.session?.user?.id
    if (!userId) {
      setProfile(null)
      return
    }

    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()

    if (profileError) {
      setLoadError('프로필을 불러오는 중 오류가 발생했습니다.')
      setProfile(null)
      return
    }

    setProfile(profileData ?? null)
  }

  useEffect(() => {
    setIsLoading(true)
    loadProfileFromSession()
      .catch(() => setLoadError('초기 인증 정보를 불러오는 중 오류가 발생했습니다.'))
      .finally(() => setIsLoading(false))

    const { data: authListener } = supabase.auth.onAuthStateChange((_, session) => {
      if (session?.user?.id) {
        loadProfileFromSession()
      } else {
        setProfile(null)
      }
    })

    return () => {
      authListener.subscription.unsubscribe()
    }
  }, [])

  const handleLoginSuccess = (newProfile: Profile) => {
    setProfile(newProfile)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setProfile(null)
  }

  if (isLoading) {
    return (
      <main className="app-shell">
        <div className="loader">로딩 중...</div>
      </main>
    )
  }

  return (
    <main className="app-shell">
      {profile ? (
        <Home profile={profile} onLogout={handleLogout} />
      ) : (
        <AuthForm onLoginSuccess={handleLoginSuccess} />
      )}
      {loadError ? <p className="error notice">{loadError}</p> : null}
    </main>
  )
}

export default App
