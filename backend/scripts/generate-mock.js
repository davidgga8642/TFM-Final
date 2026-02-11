import fs from 'fs'
import path from 'path'
import sqlite3 from 'sqlite3'
import bcrypt from 'bcrypt'
import crypto from 'crypto'
import { execFileSync } from 'child_process'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const baseDir = path.resolve(__dirname, '..')
const mockDir = path.join(baseDir, 'mock')
const dbPath = path.join(mockDir, 'demo.sqlite')
const uploadsDir = path.join(mockDir, 'uploads')
const dumpPath = path.join(mockDir, 'demo.sql')

const baseDate = new Date('2026-02-05T00:00:00.000Z')

function ensureDir(dir){
  fs.mkdirSync(dir, { recursive: true })
}

function clearDir(dir){
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(dir, { recursive: true })
}

function mulberry32(seed){
  let a = seed
  return function(){
    let t = a += 0x6D2B79F5
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const rand = mulberry32(20260205)

function pick(arr){
  return arr[Math.floor(rand() * arr.length)]
}

function formatDate(d){
  const year = d.getUTCFullYear()
  const month = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function addDays(d, days){
  const out = new Date(d)
  out.setUTCDate(out.getUTCDate() + days)
  return out
}

function addMonths(d, months){
  const out = new Date(d)
  out.setUTCMonth(out.getUTCMonth() + months)
  return out
}

function toIsoWithTime(d, hour, minute){
  const out = new Date(d)
  out.setUTCHours(hour, minute, 0, 0)
  return out.toISOString()
}

function createDummyPdf(filePath, label){
  const content = `%PDF-1.4\n%MockPDF\n1 0 obj<<>>endobj\n2 0 obj<< /Length 44 >>stream\n${label}\nendstream\nendobj\ntrailer<<>>\n%%EOF\n`
  fs.writeFileSync(filePath, content)
}

function getTicketsKey(){
  const keyFile = path.join(baseDir, '.tickets-key')
  if(!fs.existsSync(keyFile)){
    const key = crypto.randomBytes(32)
    fs.writeFileSync(keyFile, key.toString('base64'))
  }
  const b64 = fs.readFileSync(keyFile, 'utf8')
  return Buffer.from(b64, 'base64')
}

function encryptFile(plainPath){
  const key = getTicketsKey()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const data = fs.readFileSync(plainPath)
  const enc = Buffer.concat([cipher.update(data), cipher.final()])
  const tag = cipher.getAuthTag()
  const out = Buffer.concat([iv, tag, enc])
  const encPath = plainPath + '.enc'
  fs.writeFileSync(encPath, out)
  return encPath
}

async function runMockSeed(){
  ensureDir(mockDir)
  clearDir(uploadsDir)
  if(fs.existsSync(dbPath)) fs.unlinkSync(dbPath)

  sqlite3.verbose()
  const db = new sqlite3.Database(dbPath)

  const run = (sql, params = []) => new Promise((resolve, reject)=>{
    db.run(sql, params, function(err){
      if(err) reject(err)
      else resolve(this)
    })
  })
  const all = (sql, params = []) => new Promise((resolve, reject)=>{
    db.all(sql, params, function(err, rows){
      if(err) reject(err)
      else resolve(rows)
    })
  })

  await run(`PRAGMA foreign_keys = ON`)

  await run(`CREATE TABLE companies(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    fiscal_address TEXT,
    tax_id TEXT,
    phone TEXT,
    lat REAL DEFAULT 40.4168,
    lng REAL DEFAULT -3.7038
  )`)

  await run(`CREATE TABLE users(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('ADMIN','WORKER')),
    company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
    active INTEGER DEFAULT 1
  )`)

  await run(`CREATE TABLE employees(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    overtime_rate REAL DEFAULT 15,
    allow_diets INTEGER DEFAULT 1,
    allow_transport INTEGER DEFAULT 1,
    allow_lodging INTEGER DEFAULT 1,
    salary REAL DEFAULT 0,
    daily_hours REAL DEFAULT 8,
    weekly_hours REAL DEFAULT 40,
    vacation_days INTEGER DEFAULT 22,
    dni TEXT,
    birthdate TEXT,
    phone TEXT,
    contact_email TEXT,
    position TEXT,
    contract_type TEXT,
    pay_installments INTEGER DEFAULT 12,
    vacation_days_used INTEGER DEFAULT 0,
    vacation_year INTEGER DEFAULT 2026,
    hire_date TEXT,
    termination_date TEXT
  )`)

  await run(`CREATE TABLE timesheets(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    start_time TEXT,
    start_lat REAL,
    start_lng REAL,
    start_within INTEGER DEFAULT 0,
    break_start TEXT,
    break_end TEXT,
    end_time TEXT,
    end_lat REAL,
    end_lng REAL,
    end_within INTEGER DEFAULT 0
  )`)

  await run(`CREATE TABLE tickets(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    category TEXT,
    amount REAL,
    status TEXT DEFAULT 'PENDIENTE',
    reason TEXT,
    file_path TEXT NOT NULL,
    file_mime TEXT NOT NULL
  )`)

  await run(`CREATE TABLE finance_entries(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    month TEXT NOT NULL,
    country_code TEXT NOT NULL,
    incomes REAL NOT NULL,
    expenses REAL NOT NULL,
    salaries REAL NOT NULL
  )`)

  await run(`CREATE TABLE invoices(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_name TEXT NOT NULL,
    amount REAL NOT NULL,
    month TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_mime TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`)

  await run(`CREATE TABLE countries(
    code TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    corporate_tax REAL NOT NULL,
    social_rate REAL NOT NULL
  )`)

  await run(`CREATE TABLE password_resets(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    token TEXT UNIQUE NOT NULL,
    expires_at TEXT NOT NULL,
    used INTEGER DEFAULT 0
  )`)

  await run(`CREATE TABLE timesheet_requests(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    break_start TEXT,
    break_end TEXT,
    status TEXT DEFAULT 'PENDIENTE',
    reason TEXT,
    created_at TEXT NOT NULL,
    approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL
  )`)

  await run(`CREATE TABLE vacation_requests(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    status TEXT DEFAULT 'PENDIENTE',
    reason TEXT,
    created_at TEXT NOT NULL,
    approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL
  )`)

  await run(`INSERT INTO companies(name, fiscal_address, tax_id, phone, lat, lng) VALUES(?,?,?,?,?,?)`,
    ['TFM Demo SL', 'Madrid, Espana', 'B12345678', '+34 600 123 456', 40.4168, -3.7038])

  const countries = [
    ['ES','Espana', 0.25, 0.30],
    ['US','Estados Unidos', 0.21, 0.0765],
    ['DE','Alemania', 0.15, 0.20],
    ['FR','Francia', 0.25, 0.45]
  ]
  for(const c of countries){
    await run(`INSERT INTO countries(code,name,corporate_tax,social_rate) VALUES(?,?,?,?)`, c)
  }

  const company = await new Promise((resolve, reject)=>{
    db.get('SELECT id FROM companies LIMIT 1', [], (err, row)=>{
      if(err) reject(err)
      else resolve(row)
    })
  })

  const adminCredentials = [
    { email: 'ceo@demo.com', password: 'demoAdmin1' },
    { email: 'admin2@demo.com', password: 'demoAdmin2' }
  ]
  const adminIds = []
  for(const admin of adminCredentials){
    const adminHash = await bcrypt.hash(admin.password, 10)
    const adminUser = await run(`INSERT INTO users(email,password_hash,role,company_id,active) VALUES(?,?,?,?,?)`,
      [admin.email, adminHash, 'ADMIN', company.id, 1])
    adminIds.push(adminUser.lastID)
  }
  const adminId = adminIds[0]

  const firstNames = ['ana','luis','maria','carlos','sofia','jorge','laura','sergio','paula','diego','elena','marta','alvaro','lucia','david','noelia','adrian','irene','raul','silvia','pablo','nuria','hugo','clara','sara']
  const lastNames = ['garcia','martinez','lopez','sanchez','perez','gomez','rodriguez','fernandez','jimenez','diaz']
  const positions = ['Analista','Consultor','Desarrollador','Disenador','QA','Project Manager','Soporte','Data Engineer','UX','DevOps']
  const contractTypes = ['Indefinido','Temporal','Practicas']
  const payOptions = [12, 14]
  const workerCount = 25
  const workerIds = []
  const workerCredentials = []

  for(let i=0;i<workerCount;i++){
    const first = firstNames[i % firstNames.length]
    const last = lastNames[Math.floor(i / firstNames.length) % lastNames.length]
    const suffix = i >= firstNames.length ? String(i + 1) : ''
    const email = `${first}.${last}${suffix}@demo.com`
    const password = `demo${String(i + 1).padStart(2, '0')}`
    const hash = await bcrypt.hash(password, 10)
    const active = rand() < 0.85 ? 1 : 0
    const u = await run(`INSERT INTO users(email,password_hash,role,company_id,active) VALUES(?,?,?,?,?)`,
      [email, hash, 'WORKER', company.id, active])
    workerIds.push(u.lastID)
    workerCredentials.push({ email, password })

    const salary = 1100 + Math.floor(rand() * 1500)
    const overtime = 12 + Math.floor(rand() * 12)
    const dailyHours = rand() < 0.2 ? 7 : 8
    const weeklyHours = dailyHours * 5
    const vacationDays = 22 + Math.floor(rand() * 7)
    const usedDays = Math.min(vacationDays, Math.floor(rand() * 10))
    const hireDate = formatDate(addMonths(baseDate, -(6 + Math.floor(rand() * 18))))
    const terminationDate = active ? null : formatDate(addDays(baseDate, -(10 + Math.floor(rand() * 80))))
    const allowDiets = rand() < 0.8 ? 1 : 0
    const allowTransport = rand() < 0.85 ? 1 : 0
    const allowLodging = rand() < 0.6 ? 1 : 0
    const position = pick(positions)
    const contractType = pick(contractTypes)
    const payInstallments = pick(payOptions)

    await run(`INSERT INTO employees(user_id,overtime_rate,allow_diets,allow_transport,allow_lodging,salary,daily_hours,weekly_hours,vacation_days,contact_email,position,contract_type,pay_installments,vacation_days_used,vacation_year,hire_date,termination_date) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [u.lastID, overtime, allowDiets, allowTransport, allowLodging, salary, dailyHours, weeklyHours, vacationDays, email, position, contractType, payInstallments, usedDays, 2026, hireDate, terminationDate])
  }

  const credentialsPath = path.join(mockDir, 'credentials.txt')
  const credentialLines = []
  credentialLines.push('Admins:')
  for(const admin of adminCredentials){
    credentialLines.push(`${admin.email} | ${admin.password}`)
  }
  credentialLines.push('')
  credentialLines.push('Workers:')
  for(const worker of workerCredentials){
    credentialLines.push(`${worker.email} | ${worker.password}`)
  }
  fs.writeFileSync(credentialsPath, credentialLines.join('\n'))

  // Timesheets: last 60 days, weekdays only
  const categories = ['DIETAS','TRANSPORTE']
  for(const userId of workerIds){
    for(let d=1; d<=60; d++){
      const day = addDays(baseDate, -d)
      const weekday = day.getUTCDay()
      if(weekday === 0 || weekday === 6) continue
      if(rand() < 0.15) continue

      const startHour = 8 + Math.floor(rand() * 2)
      const endHour = 16 + Math.floor(rand() * 3)
      const dateStr = formatDate(day)
      const startTime = toIsoWithTime(day, startHour, 0)
      const breakStart = toIsoWithTime(day, 13, 30)
      const breakEnd = toIsoWithTime(day, 14, 0)
      const endTime = toIsoWithTime(day, endHour, 30)

      await run(`INSERT INTO timesheets(user_id,date,start_time,start_lat,start_lng,start_within,break_start,break_end,end_time,end_lat,end_lng,end_within) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
        [userId, dateStr, startTime, 40.4168, -3.7038, 1, breakStart, breakEnd, endTime, 40.4168, -3.7038, 1])
    }
  }

  // Timesheet requests (pending)
  for(let i=0;i<3;i++){
    const userId = workerIds[i]
    const date = formatDate(addDays(baseDate, -2 - i))
    await run(`INSERT INTO timesheet_requests(user_id,date,start_time,end_time,break_start,break_end,status,reason,created_at,approved_by) VALUES(?,?,?,?,?,?,?,?,?,?)`,
      [userId, date, '09:00', '17:00', '13:30', '14:00', 'PENDIENTE', 'Solicitud demo', addDays(baseDate, -1).toISOString(), null])
  }

  // Vacation requests: accepted + pending
  for(let i=0;i<workerIds.length;i++){
    const userId = workerIds[i]
    const start = formatDate(addDays(baseDate, -20 - i * 3))
    const end = formatDate(addDays(baseDate, -18 - i * 3))
    await run(`INSERT INTO vacation_requests(user_id,start_date,end_date,status,reason,created_at,approved_by) VALUES(?,?,?,?,?,?,?)`,
      [userId, start, end, 'ACEPTADO', '', addDays(baseDate, -25).toISOString(), adminId])
  }
  await run(`INSERT INTO vacation_requests(user_id,start_date,end_date,status,reason,created_at,approved_by) VALUES(?,?,?,?,?,?,?)`,
    [workerIds[0], formatDate(addDays(baseDate, 5)), formatDate(addDays(baseDate, 9)), 'PENDIENTE', 'Viaje familiar', baseDate.toISOString(), null])

  // Invoices with PDFs
  for(let i=0;i<6;i++){
    const monthDate = addMonths(baseDate, -i)
    const monthStr = `${monthDate.getUTCFullYear()}-${String(monthDate.getUTCMonth() + 1).padStart(2,'0')}`
    const fileName = `mock-invoice-${i+1}.pdf`
    const fileRel = path.join('uploads', fileName).replace(/\\/g, '/')
    const fileAbs = path.join(uploadsDir, fileName)
    createDummyPdf(fileAbs, `Factura demo ${i+1}`)
    await run(`INSERT INTO invoices(client_name, amount, month, file_path, file_mime, created_at) VALUES(?,?,?,?,?,?)`,
      [`Cliente ${i+1}`, 1800 + i * 220, monthStr, fileRel, 'application/pdf', monthDate.toISOString()])
  }

  // Tickets with encrypted PDFs
  const statusPool = ['APROBADO','RECHAZADO','PENDIENTE']
  for(let i=0;i<workerIds.length;i++){
    const userId = workerIds[i]
    for(let t=0;t<2;t++){
      const createdAt = addDays(baseDate, -(5 + i * 2 + t)).toISOString()
      const status = statusPool[(i + t) % statusPool.length]
      const fileName = `mock-ticket-${userId}-${t+1}.pdf`
      const fileAbs = path.join(uploadsDir, fileName)
      const fileRel = path.join('uploads', fileName).replace(/\\/g, '/')
      createDummyPdf(fileAbs, `Ticket demo ${userId}-${t+1}`)
      const encPathAbs = encryptFile(fileAbs)
      fs.unlinkSync(fileAbs)
      const encRel = fileRel + '.enc'
      await run(`INSERT INTO tickets(user_id,created_at,category,amount,status,reason,file_path,file_mime) VALUES(?,?,?,?,?,?,?,?)`,
        [userId, createdAt, pick(categories), 12.5 + i * 3 + t, status, status === 'RECHAZADO' ? 'Motivo demo' : null, encRel, 'application/pdf'])
    }
  }

  // Create SQL dump (CLI if available, fallback to JS dump)
  try{
    const dump = execFileSync('sqlite3', [dbPath, '.dump'], { encoding: 'utf8' })
    fs.writeFileSync(dumpPath, dump)
    console.log(`SQL dump generado: ${dumpPath}`)
  }catch(e){
    const tables = await all("SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    const lines = []
    lines.push('PRAGMA foreign_keys=OFF;')
    lines.push('BEGIN TRANSACTION;')
    for(const t of tables){
      lines.push(`DROP TABLE IF EXISTS "${t.name}";`)
      lines.push(`${t.sql};`)
      const rows = await all(`SELECT * FROM "${t.name}"`)
      if(rows.length){
        const cols = Object.keys(rows[0])
        for(const row of rows){
          const values = cols.map(col => sqlValue(row[col])).join(', ')
          lines.push(`INSERT INTO "${t.name}" (${cols.map(c=>`"${c}"`).join(', ')}) VALUES (${values});`)
        }
      }
    }
    lines.push('COMMIT;')
    fs.writeFileSync(dumpPath, lines.join('\n'))
    console.log(`SQL dump generado (JS fallback): ${dumpPath}`)
  }

  db.close()

  console.log(`Base de datos mock creada: ${dbPath}`)
  console.log(`Uploads mock creados: ${uploadsDir}`)
}

runMockSeed().catch(err=>{
  console.error(err)
  process.exit(1)
})

function sqlValue(value){
  if(value === null || value === undefined) return 'NULL'
  if(typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL'
  if(typeof value === 'boolean') return value ? '1' : '0'
  const str = String(value).replace(/'/g, "''")
  return `'${str}'`
}
