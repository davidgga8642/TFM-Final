import fs from 'fs'
import path from 'path'
import { execFileSync } from 'child_process'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const restoreScript = path.join(__dirname, 'restore-mock.js')
const generateScript = path.join(__dirname, 'generate-mock.js')
const demoDb = path.join(__dirname, '..', 'mock', 'demo.sqlite')

function runNodeScript(scriptPath){
  execFileSync(process.execPath, [scriptPath], { stdio: 'inherit' })
}

function ensureMockReady(){
  try{
    runNodeScript(restoreScript)
    return
  }catch(e){
    console.warn('⚠️ No se pudo restaurar mock directamente. Intentando generar dataset mock...')
  }

  if(!fs.existsSync(demoDb)){
    runNodeScript(generateScript)
  }

  runNodeScript(restoreScript)
}

try{
  ensureMockReady()
}catch(err){
  console.error('❌ Fallo preparando datos mock:', err.message)
  process.exit(1)
}

await import('../server.js')
