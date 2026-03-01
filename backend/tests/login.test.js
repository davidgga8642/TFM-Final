import test, { before } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import session from 'express-session'
import request from 'supertest'
import bcrypt from 'bcrypt'

import { auth } from '../routes-auth.js'
import { init, q } from '../db.js'

const TEST_USER_EMAIL = 'login-test-user@demo.com'
const TEST_USER_PASSWORD = 'login-test-pass'
const DISABLED_USER_EMAIL = 'login-disabled-user@demo.com'
const DISABLED_USER_PASSWORD = 'login-disabled-pass'

function buildTestApp(){
  const app = express()
  app.use(express.json())
  app.use(session({
    secret: 'test-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true }
  }))
  app.use('/api/auth', auth)
  return app
}

before(async ()=>{
  await init()

  const company = await q.get('SELECT id FROM companies LIMIT 1')

  const existing = await q.get('SELECT id FROM users WHERE email=?', [TEST_USER_EMAIL])
  if(!existing){
    const hash = await bcrypt.hash(TEST_USER_PASSWORD, 10)
    await q.run(
      'INSERT INTO users(email,password_hash,role,company_id,active) VALUES(?,?,?,?,?)',
      [TEST_USER_EMAIL, hash, 'WORKER', company?.id || null, 1]
    )
  }

  const disabled = await q.get('SELECT id FROM users WHERE email=?', [DISABLED_USER_EMAIL])
  if(!disabled){
    const hash = await bcrypt.hash(DISABLED_USER_PASSWORD, 10)
    await q.run(
      'INSERT INTO users(email,password_hash,role,company_id,active) VALUES(?,?,?,?,?)',
      [DISABLED_USER_EMAIL, hash, 'WORKER', company?.id || null, 0]
    )
  }
})

test('POST /api/auth/login devuelve 400 si faltan campos', async ()=>{
  const app = buildTestApp()
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: TEST_USER_EMAIL })

  assert.equal(res.status, 400)
  assert.ok(res.body.error)
})

test('POST /api/auth/login devuelve 401 con credenciales invalidas', async ()=>{
  const app = buildTestApp()
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: TEST_USER_EMAIL, password: 'incorrecta' })

  assert.equal(res.status, 401)
  assert.equal(res.body.error, 'Credenciales inválidas')
})

test('POST /api/auth/login devuelve 403 si la cuenta esta desactivada', async ()=>{
  const app = buildTestApp()
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: DISABLED_USER_EMAIL, password: DISABLED_USER_PASSWORD })

  assert.equal(res.status, 403)
  assert.equal(res.body.error, 'Cuenta desactivada')
})

test('POST /api/auth/login devuelve 200 con credenciales correctas', async ()=>{
  const app = buildTestApp()
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: TEST_USER_EMAIL, password: TEST_USER_PASSWORD })

  assert.equal(res.status, 200)
  assert.ok(res.body.user)
  assert.equal(res.body.user.email, TEST_USER_EMAIL)
})
