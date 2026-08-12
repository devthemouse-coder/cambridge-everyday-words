const fs = require('fs')
const { createClient } = require('@supabase/supabase-js')

const env = fs.readFileSync('.env.local', 'utf8')
  .split(/\r?\n/)
  .reduce((acc, line) => {
    const m = line.match(/^([^=]+)=(.*)$/)
    if (m) acc[m[1]] = m[2]
    return acc
  }, {})

const url = env.VITE_SUPABASE_URL
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY
if (!url || !key) throw new Error('Missing Supabase env variables')

const supabase = createClient(url, key)

const tests = {
  organizations: ['id,name,created_at,updated_at', 'name'],
  profiles: ['id,username,display_name,role,organization_id,can_manage_rounds,recovery_question,recovery_hint,email,is_active,created_at,updated_at'],
  audit_logs: ['id,organization_id,user_id,entity_type,entity_id,action,old_data,new_data,created_at'],
  word_books: ['id,organization_id,title,level,created_by,updated_by,created_at,updated_at'],
  rounds: ['id,word_book_id,round_number,created_by,updated_by,created_at,updated_at'],
  words: ['id,round_id,word_order,english,meaning,created_by,updated_by,created_at,updated_at'],
}

async function run() {
  for (const [table, selects] of Object.entries(tests)) {
    console.log('===', table, '===')
    for (const sel of selects) {
      const { data, error, status } = await supabase.from(table).select(sel).limit(1)
      console.log('select=', sel, 'status=', status, 'error=', error ? error.message : 'OK')
    }
  }
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
