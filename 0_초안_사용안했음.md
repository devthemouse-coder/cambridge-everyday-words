나는 초등학생이 영어 단어를 공부하기 위한
"Cambridge Everyday Words" 웹 서비스를 개발하고 있다.

프로젝트명:
cambridge-everyday-words

기술 스택:
- React
- TypeScript
- Vite
- Supabase
- GitHub Pages
- 반응형 웹
- 향후 PWA 지원

중요:
나는 웹 개발 경력이 오래된 개발자이므로
코드 자체는 깔끔하고 유지보수하기 쉬운 구조로 작성하되,
불필요하게 복잡한 아키텍처나 과도한 라이브러리를 사용하지 않는다.

현재 Supabase DB는 이미 생성되어 있다.
DB 테이블을 임의로 변경하거나 새 테이블을 만들지 말고,
우선 현재 구조를 파악한 후 작업한다.

현재 DB 구조:

organizations
- id
- name
- created_at
- updated_at

profiles
- id
- username
- display_name
- role
- organization_id
- can_manage_rounds
- recovery_question
- recovery_hint
- email
- is_active
- created_at
- updated_at

word_books
- id
- organization_id
- title
- level
- created_by
- updated_by
- created_at
- updated_at

rounds
- id
- word_book_id
- round_number
- created_by
- updated_by
- created_at
- updated_at

words
- id
- round_id
- word_order
- english
- meaning
- created_by
- updated_by
- created_at
- updated_at

audit_logs
- id
- organization_id
- user_id
- entity_type
- entity_id
- action
- old_data
- new_data
- created_at

역할:
- SUPER_ADMIN
- PARENT
- TEACHER
- STUDENT

중요한 권한 구조:
역할과 회차 관리 권한은 별개이다.

can_manage_rounds = true인 사용자는
학생/부모/선생님 여부와 관계없이
회차 및 단어를 등록/수정/삭제할 수 있다.

SUPER_ADMIN은 특정 학원에 소속되지 않는다.
SUPER_ADMIN의 organization_id는 NULL이다.

현재 생성된 학원:
- name: 캠브리지 영어학원
- organization_id:
  1723e057-5aab-4f48-a1fd-fe1fa0a9fa97

현재 생성된 총관리자:
- display_name: 관리자
- role: SUPER_ADMIN
- organization_id: NULL
- can_manage_rounds: true

요구사항:

1. 먼저 현재 프로젝트 구조를 확인한다.

2. package.json을 확인하고 필요한 최소한의 패키지만 사용한다.

3. Supabase 연결을 위한 환경변수 구조를 만든다.
   .env.local을 사용한다.
   Supabase URL과 anon/public key를 소스코드에 직접 작성하지 않는다.

4. 화면은 모바일 우선으로 만든다.
   실제 사용자는 초등학생이며 스마트폰 사용을 전제로 한다.

5. 처음부터 복잡한 관리자 UI를 만들지 않는다.

6. 우선 다음 화면 구조만 만든다.

   - 로그인
   - 회원가입
   - 홈
   - 학원/단어장 선택
   - 회차 목록
   - 회차 상세
   - 회차 등록/수정

7. 아직 OCR 기능은 구현하지 않는다.
   먼저 수동으로 회차와 단어를 등록하고 조회하는 기능부터 완성한다.

8. 아직 학습 문제 출제 기능도 구현하지 않는다.

9. 아직 연속회차 기능도 구현하지 않는다.

10. 아직 관리자 전용 기능도 최소화한다.

11. 로그인 사용자의 학원에 속한 데이터만 표시한다.
    Supabase RLS를 신뢰하며 클라이언트에서 단순히
    organization_id를 숨기는 방식으로 보안을 구현하지 않는다.

12. SUPER_ADMIN은 모든 학원 데이터를 조회/관리할 수 있다.

13. 일반 사용자는 자신의 학원 데이터만 조회할 수 있다.

14. 회차 등록/수정/삭제 UI는
    can_manage_rounds가 true인 사용자에게만 표시한다.

15. 학생도 can_manage_rounds가 true이면
    회차를 등록/수정할 수 있어야 한다.

16. role을 기준으로 회차관리 권한을 판단하지 않는다.

17. 프로필 수정 화면에서 일반 사용자가
    role, organization_id, can_manage_rounds, is_active를
    임의로 변경할 수 있도록 만들지 않는다.

18. 회원가입 UI는 다음 정보를 받는다.

    - 아이디 (필수)
    - 비밀번호 (필수)
    - 표시명칭 (필수)
    - 학원 (필수)
    - 계정 찾기 질문 (필수)
    - 계정 찾기 힌트 (필수)
    - 이메일 (선택)

19. 사용자는 학원을 직접 입력하지 않고
    등록된 학원 목록에서 선택한다.

20. 회원가입은 일반 사용자로만 생성한다.
    사용자가 SUPER_ADMIN 권한을 선택하거나 입력할 수 있어서는 안 된다.

21. UI 문구는 모두 한국어로 한다.

22. 영어 단어 자체는 영어로 표시한다.

23. 오류가 발생했을 때 개발자가 원인을 파악하기 쉽도록
    console.error 등에 적절한 오류 정보를 남긴다.
    단, 비밀번호나 인증 토큰 등의 민감정보는 절대 로그로 남기지 않는다.

24. 모바일 화면에서 버튼과 입력창을 충분히 크게 만든다.

25. 초등학생이 사용할 것을 고려하여
    지나치게 작은 글씨나 복잡한 메뉴를 사용하지 않는다.

작업 방식:

- 먼저 현재 프로젝트를 분석한다.
- 필요한 파일 구조를 제안한다.
- 그 다음 실제 코드를 작성한다.
- 기존 파일을 무작정 삭제하지 않는다.
- 각 단계에서 변경 내용을 설명한다.
- 빌드 오류가 발생하면 직접 수정한다.
- npm run build가 성공하도록 만든다.

중요:
OCR, 문제 출제, 음성 기능, 연속회차 기능은 아직 만들지 않는다.

이번 작업의 목표는
"로그인 → 회원가입 → 학원 선택 → 단어장 → 회차 → 단어 등록/수정/조회"
까지의 기본 골격을 안정적으로 만드는 것이다.