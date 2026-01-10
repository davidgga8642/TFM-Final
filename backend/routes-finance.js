import express from 'express'
import { q } from './db.js'
import { requireAuth, requireRole } from './middleware.js'

export const finance = express.Router()
finance.get('/countries', requireAuth, async (req,res)=>{
  const rows = await q.all(`SELECT * FROM countries ORDER BY name`)
  res.json({ countries: rows })
})
finance.post('/countries', requireAuth, requireRole('ADMIN'), async (req,res)=>{
  const { code, name, corporate_tax, social_rate } = req.body || {}
  if(!code || !name) return res.status(400).json({ error:'Código y nombre requeridos' })
  const ct = Number(corporate_tax), sr = Number(social_rate)
  if(!Number.isFinite(ct) || !Number.isFinite(sr)) return res.status(400).json({ error:'Tipos inválidos' })
  try{
    await q.run(`INSERT INTO countries(code,name,corporate_tax,social_rate) VALUES(?,?,?,?)`, [code, name, ct, sr])
    res.json({ ok:true })
  }catch(e){ res.status(400).json({ error:'No se pudo insertar (¿código duplicado?)' }) }
})
finance.post('/entry', requireAuth, requireRole('ADMIN'), async (req,res)=>{
  const { month, country_code, incomes, expenses, salaries } = req.body || {}
  if(!month || !country_code) return res.status(400).json({ error:'Mes y país requeridos' })
  const inc = Number(incomes), exp = Number(expenses), sal = Number(salaries)
  if(![inc,exp,sal].every(Number.isFinite)) return res.status(400).json({ error:'Valores numéricos inválidos' })
  const c = await q.get(`SELECT * FROM countries WHERE code=?`, [country_code])
  if(!c) return res.status(400).json({ error:'País no soportado' })
  const gross = inc - exp - sal
  const corporate_tax = gross>0 ? gross*c.corporate_tax : 0
  const social_costs = sal * c.social_rate
  const net = gross - corporate_tax - social_costs
  await q.run(`INSERT INTO finance_entries(month,country_code,incomes,expenses,salaries) VALUES(?,?,?,?,?)`, [month, country_code, inc, exp, sal])
  res.json({
    month, country_code,
    inputs:{ incomes:inc, expenses:exp, salaries:sal },
    computed:{ gross_profit: round2(gross), corporate_tax:round2(corporate_tax), social_costs:round2(social_costs), net_result:round2(net) },
    legal_notice:"Los cálculos mostrados son orientativos y no sustituyen el asesoramiento fiscal profesional."
  })
})
finance.get('/entries', requireAuth, requireRole('ADMIN'), async (req,res)=>{
  const rows = await q.all(`SELECT * FROM finance_entries ORDER BY month`)
  res.json({ entries: rows })
})
finance.get('/summary', requireAuth, requireRole('ADMIN'), async (req,res)=>{
  const rows = await q.all(`SELECT month, SUM(incomes) as incomes, SUM(expenses) as expenses, SUM(salaries) as salaries FROM finance_entries GROUP BY month ORDER BY month`)
  const months = rows.map(r=>r.month)
  const incomes = rows.map(r=>round2(r.incomes)), expenses = rows.map(r=>round2(r.expenses)), salaries = rows.map(r=>round2(r.salaries))
  const gross = months.map((_,i)=> round2(incomes[i]-expenses[i]-salaries[i]))
  let taxRate = 0.25
  const latest = await q.get(`SELECT country_code FROM finance_entries ORDER BY id DESC LIMIT 1`)
  if(latest){ const c = await q.get(`SELECT corporate_tax FROM countries WHERE code=?`, [latest.country_code]); if(c) taxRate = c.corporate_tax }
  const taxes = gross.map(v=> v>0? round2(v*taxRate):0)
  const net = gross.map((v,i)=> round2(v - taxes[i]))
  const empRows = await q.all(`SELECT salary FROM employees`)
  const empSalariesTotal = empRows.reduce((a,r)=> a + (r.salary||0), 0)
  const emp_salaries = months.map(()=> round2(empSalariesTotal))
  const ot = await q.all(`SELECT substr(date,1,7) as month, SUM(CASE WHEN end_time IS NOT NULL THEN (julianday(end_time)-julianday(start_time))*24 ELSE 0 END) as hours FROM timesheets GROUP BY month ORDER BY month`)
  const overtime = months.map(m=>{ const r=ot.find(x=>x.month===m); const h=r? (r.hours||0):0; const days=h>0? Math.ceil(h/8):0; const extra=Math.max(0,h-days*8); return round2(extra) })
  res.json({ months, series:{ incomes, expenses, salaries, emp_salaries, gross, taxes, net, overtime } })
})
function round2(n){ return Math.round(n*100)/100 }
