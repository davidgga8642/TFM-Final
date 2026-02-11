import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const baseDir = path.resolve(__dirname, '..')
const mockDir = path.join(baseDir, 'mock')
const srcDb = path.join(mockDir, 'demo.sqlite')
const srcUploads = path.join(mockDir, 'uploads')
const dstDb = path.join(baseDir, 'database.sqlite')
const dstUploads = path.join(baseDir, 'uploads')

function copyDir(src, dest){
  fs.rmSync(dest, { recursive: true, force: true })
  fs.mkdirSync(dest, { recursive: true })
  fs.cpSync(src, dest, { recursive: true })
}

if(!fs.existsSync(srcDb)){
  console.error('No existe demo.sqlite. Ejecuta: npm run mock:generate')
  process.exit(1)
}

fs.copyFileSync(srcDb, dstDb)

if(fs.existsSync(srcUploads)){
  copyDir(srcUploads, dstUploads)
}

console.log('Mock restaurado en backend/database.sqlite y backend/uploads')
