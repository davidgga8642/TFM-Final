import express from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { q } from './db.js'
import { requireAuth, requireRole } from './middleware.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const uploadDir = path.join(__dirname, 'uploads')
fs.mkdirSync(uploadDir, { recursive: true })

const storage = multer.diskStorage({
  destination: (req, file, cb)=> cb(null, uploadDir),
  filename: (req, file, cb)=>{
    const safeName = Date.now() + '_' + file.originalname.replace(/[^a-zA-Z0-9_.-]/g, '_')
    cb(null, safeName)
  }
})
function fileFilter(req, file, cb){
  const allowed = ['image/jpeg','image/png','image/webp','application/pdf']
  if(allowed.includes(file.mimetype)) cb(null, true); else cb(new Error('Tipo de archivo no permitido'))
}
const upload = multer({ storage, fileFilter, limits: { fileSize: 10 * 1024 * 1024 } })

export const tickets = express.Router()

// Worker upload (with permission checks)
tickets.post('/', requireAuth, requireRole('WORKER'), upload.single('file'), async (req,res)=>{
  const { category, amount } = req.body || {}
  const amountN = amount ? Number(amount) : null
  if(amount && !Number.isFinite(amountN)) return res.status(400).json({ error: 'Importe inválido' })
  const emp = await q.get(`SELECT allow_diets, allow_transport FROM employees WHERE user_id=?`, [req.session.user.id])
  if(category==='DIETAS' && !emp?.allow_diets) return res.status(403).json({ error:'No autorizado para DIETAS' })
  if(category==='TRANSPORTE' && !emp?.allow_transport) return res.status(403).json({ error:'No autorizado para TRANSPORTE' })
  const file_path = req.file.path, file_mime = req.file.mimetype
  const created_at = new Date().toISOString()
  await q.run(`INSERT INTO tickets(user_id,created_at,category,amount,status,reason,file_path,file_mime) VALUES(?,?,?,?,?,?,?,?)`,
    [req.session.user.id, created_at, category || null, amountN, 'PENDIENTE', null, file_path, file_mime])
  res.json({ ok:true })
})

// Worker list
tickets.get('/my', requireAuth, requireRole('WORKER'), async (req,res)=>{
  const rows = await q.all(`SELECT id, created_at, category, amount, status, reason, file_mime FROM tickets WHERE user_id=? ORDER BY id DESC`, [req.session.user.id])
  res.json({ tickets: rows })
})

// Admin list + approve/reject
tickets.get('/all', requireAuth, requireRole('ADMIN'), async (req,res)=>{
  const status = req.query.status
  let sql = `SELECT t.*, u.email FROM tickets t JOIN users u ON u.id=t.user_id`
  const params = []
  if(status){ sql += ' WHERE t.status=?'; params.push(status) }
  sql += ' ORDER BY t.id DESC'
  const rows = await q.all(sql, params)
  res.json({ tickets: rows })
})
tickets.patch('/:id/approve', requireAuth, requireRole('ADMIN'), async (req,res)=>{
  const id = Number(req.params.id)
  if(!Number.isFinite(id)) return res.status(400).json({ error:'ID inválido' })
  await q.run(`UPDATE tickets SET status='APROBADO', reason=NULL WHERE id=?`, [id])
  res.json({ ok:true })
})
tickets.patch('/:id/reject', requireAuth, requireRole('ADMIN'), async (req,res)=>{
  const id = Number(req.params.id); const { reason } = req.body || {}
  if(!Number.isFinite(id) || !reason) return res.status(400).json({ error:'Datos inválidos' })
  await q.run(`UPDATE tickets SET status='RECHAZADO', reason=? WHERE id=?`, [reason, id])
  res.json({ ok:true })
})

// Download file (admin only)
tickets.get('/:id/file', requireAuth, requireRole('ADMIN'), async (req,res)=>{
  const id = Number(req.params.id)
  if(!Number.isFinite(id)) return res.status(400).json({ error:'ID inválido' })
  const ticket = await q.get(`SELECT file_path, file_mime FROM tickets WHERE id=?`, [id])
  if(!ticket) return res.status(404).json({ error:'Ticket no encontrado' })
  if(!fs.existsSync(ticket.file_path)) return res.status(404).json({ error:'Archivo no encontrado' })
  res.setHeader('Content-Type', ticket.file_mime)
  res.sendFile(path.resolve(ticket.file_path))
})
