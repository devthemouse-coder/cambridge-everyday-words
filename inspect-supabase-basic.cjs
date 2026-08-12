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
    console.log('===', table, '===')
    try {
      const { data, error, status } = await supabase.from(table).select('*').limit(1)
      console.log('status', status)
      console.log('error', error)
      console.log('data', data)
      if (data && data.length > 0) {
        console.log('columns', Object.keys(data[0]))
      }
    } catch (err) {
      console.error('exception', err)
    }
  }
  console.log('=== pg_catalog.pg_tables ===')
  try {
    const { data, error, status } = await supabase.from('pg_catalog.pg_tables').select('*').limit(10)
    console.log('status', status)
    console.log('error', error)
    console.log('data sample', data)
  } catch (err) {
    console.error('exception', err)
  }
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
