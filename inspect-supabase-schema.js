const fs = require('fs')
const { createClient } = require('@supabase/supabase-js')

const envFile = '.env.local'
const env = fs.readFileSync(envFile, 'utf8')
  .split(/\r?\n/)
  .reduce((acc, line) => {
    const m = line.match(/^([^=]+)=(.*)$/)
    if (m) acc[m[1]] = m[2]
    return acc
  }, {})

const url = env.VITE_SUPABASE_URL
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY
if (!url || !key) {
  throw new Error('Missing Supabase env variables')
}

const supabase = createClient(url, key)
const tables = ['organizations', 'profiles', 'audit_logs', 'word_books', 'rounds', 'words']

async function run() {
  for (const table of tables) {
    const { data, error } = await supabase
      .from('information_schema.tables')
      .select('table_schema,table_name')
      .eq('table_name', table)
    console.log('TABLE', table)
    console.log(JSON.stringify({ data, error }, null, 2))
  }
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
