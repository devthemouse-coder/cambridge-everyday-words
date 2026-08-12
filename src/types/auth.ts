export type UserRole = 'SUPER_ADMIN' | 'PARENT' | 'TEACHER' | 'STUDENT'

export interface Profile {
  id: string
  username: string
  display_name: string
  role: UserRole
  organization_id: string | null
  can_manage_rounds: boolean
  recovery_question: string
  recovery_hint: string
  email: string | null
  is_active: boolean
}
