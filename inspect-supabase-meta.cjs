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

const tables = ['organizations', 'profiles', 'audit_logs', 'word_books', 'rounds', 'words']

async function query(table, select) {
  const { data, error, status } = await supabase.from(table).select(select).limit(100)
  return { data, error, status }
}

async function run() {
  const results = {}

  console.log('=== column info ===')
  const columnsQuery = await query('information_schema.columns', 'table_schema,table_name,column_name,data_type,is_nullable,column_default')
  results.columns = columnsQuery
  console.log(JSON.stringify({ columns: columnsQuery }, null, 2))

  console.log('=== table constraints ===')
  const constraintsQuery = await query('information_schema.table_constraints', 'constraint_catalog,constraint_schema,constraint_name,table_schema,table_name,constraint_type')
  results.constraints = constraintsQuery
  console.log(JSON.stringify({ constraints: constraintsQuery }, null, 2))

  console.log('=== key column usage ===')
  const kcuQuery = await query('information_schema.key_column_usage', 'constraint_catalog,constraint_schema,constraint_name,table_schema,table_name,column_name,ordinal_position')
  results.kcu = kcuQuery
  console.log(JSON.stringify({ kcu: kcuQuery }, null, 2))

  console.log('=== constraint column usage ===')
  const ccuQuery = await query('information_schema.constraint_column_usage', 'constraint_catalog,constraint_schema,constraint_name,table_schema,table_name,column_name')
  results.ccu = ccuQuery
  console.log(JSON.stringify({ ccu: ccuQuery }, null, 2))

  console.log('=== pg_indexes ===')
  const indexesQuery = await query('pg_indexes', 'schemaname,tablename,indexname,indexdef')
  results.indexes = indexesQuery
  console.log(JSON.stringify({ indexes: indexesQuery }, null, 2))

  console.log('=== pg_policies ===')
  const policiesQuery = await query('pg_policies', 'schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check')
  results.policies = policiesQuery
  console.log(JSON.stringify({ policies: policiesQuery }, null, 2))

  return results
}

run().catch((err) => {
  console.error('ERROR', err)
  process.exit(1)
})
