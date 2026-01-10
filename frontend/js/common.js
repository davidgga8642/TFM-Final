export async function api(path, opts={}){
  const res = await fetch(path, { credentials:'include', headers:{ 'Content-Type':'application/json', ...(opts.headers||{}) }, ...opts })
  if(!res.ok){
    let err = await res.json().catch(()=>({error:'Error'}))
    throw new Error(err.error || 'Error')
  }
  return res.json()
}
export async function me(){ const r = await api('api/auth/me'); return r.user }
export function fmtMoney(n){ return new Intl.NumberFormat('es-ES', { style:'currency', currency:'EUR' }).format(n || 0) }
export function isoToHm(iso){ if(!iso) return ''; const d=new Date(iso); return d.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'}) }
export function ymdToDmy(ymd){ if(!ymd) return ''; const [y,m,d]=ymd.split('-'); return `${d}/${m}/${y}` }
export function el(sel){ return document.querySelector(sel) }
