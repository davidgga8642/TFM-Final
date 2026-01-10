import { api, me, fmtMoney, el } from './common.js'

const who = el('#who')
const tabs = document.querySelectorAll('.tab')
const sections = {
  dashboard: document.querySelector('#tab-dashboard'),
  employees: document.querySelector('#tab-employees'),
  finance: document.querySelector('#tab-finance'),
  expenses: document.querySelector('#tab-expenses'),
  requests: document.querySelector('#tab-requests'),
  vacations: document.querySelector('#tab-vacations'),
  company: document.querySelector('#tab-company')
}
tabs.forEach(t=> t.addEventListener('click', ()=> activateTab(t.dataset.tab)))
function activateTab(id){ tabs.forEach(t=> t.classList.toggle('active', t.dataset.tab===id)); for(const k in sections){ sections[k].style.display = (k===id)? 'block':'none' } if(id==='expenses') listExpenses(); if(id==='requests') loadRequests(); if(id==='vacations') loadVacationRequests() }

async function init(){
  const user = await me(); if(!user || user.role!=='ADMIN'){ location.href='index.html'; return }
  who.textContent = `${user.email} • ADMIN`
  loadChartsAndKpis()
  listEmployees()
  el('#cSave').addEventListener('click', saveCompany)
  loadCompany()
  loadCountries()
  el('#fSave').addEventListener('click', saveFinanceEntry)
  listFinance()
}
init().catch(e=> alert(e.message))

async function listEmployees(){
  const r = await api('api/employees')
  const tbody = document.querySelector('#empTable tbody')
  tbody.innerHTML = ''
  r.employees.forEach(e=>{
    const tr = document.createElement('tr')
    tr.innerHTML = `<td>${e.email}</td><td>${fmtMoney(e.overtime_rate)}</td><td>${fmtMoney(e.salary)}</td><td>${e.allow_diets?'Dietas':''} ${e.allow_transport?'Transporte':''}</td>`
    tbody.appendChild(tr)
  })
}

async function loadCompany(){
  const r = await api('api/company')
  el('#cLat').value = r.company.lat
  el('#cLng').value = r.company.lng
}
async function saveCompany(){
  const lat = Number(el('#cLat').value), lng = Number(el('#cLng').value)
  if(!Number.isFinite(lat) || !Number.isFinite(lng)) return alert('Coordenadas inválidas')
  await api('api/company/location', { method:'POST', body: JSON.stringify({lat,lng}) })
  alert('Guardado')
}

async function loadCountries(){
  const r = await api('api/finance/countries')
  const s = document.querySelector('#fCountry'); s.innerHTML=''
  r.countries.forEach(c=>{ const op=document.createElement('option'); op.value=c.code; op.textContent=`${c.name} (${c.code})`; s.appendChild(op) })
}
async function saveFinanceEntry(){
  const month = el('#fMonth').value.trim(), country_code = el('#fCountry').value
  const incomes = Number(el('#fInc').value), expenses = Number(el('#fExp').value), salaries = Number(el('#fSal').value)
  if(!month || !country_code || ![incomes,expenses,salaries].every(Number.isFinite)) return alert('Datos inválidos')
  const r = await api('api/finance/entry', { method:'POST', body: JSON.stringify({month,country_code,incomes,expenses,salaries}) })
  document.querySelector('#fResult').textContent = JSON.stringify(r.computed, null, 2) + "\n" + r.legal_notice
  listFinance(); loadChartsAndKpis()
}
async function listFinance(){
  const r = await api('api/finance/entries'); const tbody = document.querySelector('#fTable tbody'); tbody.innerHTML=''
  r.entries.forEach(e=>{ const tr=document.createElement('tr'); tr.innerHTML=`<td>${e.month}</td><td>${e.country_code}</td><td>${fmtMoney(e.incomes)}</td><td>${fmtMoney(e.expenses)}</td><td>${fmtMoney(e.salaries)}</td>`; tbody.appendChild(tr) })
}
async function loadChartsAndKpis(){
  const r = await api('api/finance/summary')
  const { months, series } = r
  const inc = series.incomes.reduce((a,b)=>a+b,0), exp = series.expenses.reduce((a,b)=>a+b,0)+(series.emp_salaries||[]).reduce((a,b)=>a+b,0)
  const net = series.net.reduce((a,b)=>a+b,0)
  el('#kpiInc').textContent = fmtMoney(inc)
  el('#kpiExp').textContent = fmtMoney(exp)
  el('#kpiNet').textContent = fmtMoney(net)

  if(window._ch1) window._ch1.destroy(); if(window._ch2) window._ch2.destroy(); if(window._ch3) window._ch3.destroy();
  const c1 = document.getElementById('ch1').getContext('2d')
  window._ch1 = new Chart(c1, { type:'bar', data:{ labels:months, datasets:[ {label:'Ingresos', data:series.incomes}, {label:'Gastos', data:series.expenses}, {label:'Salarios fijos empleados', data:series.emp_salaries || []} ] }, options:{ responsive:true } })
  const c2 = document.getElementById('ch2').getContext('2d')
  window._ch2 = new Chart(c2, { type:'line', data:{ labels:months, datasets:[ {label:'Beneficio bruto', data:series.gross}, {label:'Impuestos estimados', data:series.taxes}, {label:'Resultado neto', data:series.net} ] }, options:{ responsive:true } })
  const c3 = document.getElementById('ch3').getContext('2d')
  window._ch3 = new Chart(c3, { type:'bar', data:{ labels:months, datasets:[ {label:'Horas extra acumuladas', data:series.overtime} ] }, options:{ responsive:true } })
}

// --- Expenses review (admin) ---
document.getElementById('expLoad').addEventListener('click', listExpenses)
document.getElementById('expFilter').addEventListener('change', listExpenses)
async function listExpenses(){
  const status = document.getElementById('expFilter').value
  const q = status ? ('?status='+encodeURIComponent(status)) : ''
  const r = await api('api/tickets/all'+q)
  const tbody = document.querySelector('#expTable tbody'); tbody.innerHTML = ''
  r.tickets.forEach(t=>{
    const tr = document.createElement('tr')
    tr.innerHTML = `<td>${t.id}</td><td>${new Date(t.created_at).toLocaleString()}</td><td>${t.email}</td><td>${t.category||'-'}</td><td>${fmtMoney(t.amount)}</td><td>${t.status}</td>`
    
    const tdPdf = document.createElement('td')
    const btnPdf = document.createElement('a')
    btnPdf.className = 'btn'
    btnPdf.textContent = 'Ver PDF'
    btnPdf.href = 'api/tickets/'+t.id+'/file'
    btnPdf.target = '_blank'
    tdPdf.appendChild(btnPdf)
    tr.appendChild(tdPdf)
    
    const td = document.createElement('td')
    const btnA = document.createElement('button'); btnA.className='btn'; btnA.textContent='Aprobar'; btnA.onclick = async ()=>{ await api('api/tickets/'+t.id+'/approve', { method:'PATCH', body: JSON.stringify({}) }); listExpenses() }
    const inp = document.createElement('input'); inp.className='input'; inp.placeholder='Motivo rechazo'; inp.style.maxWidth='200px'
    const btnR = document.createElement('button'); btnR.className='btn'; btnR.textContent='Rechazar'; btnR.onclick = async ()=>{ if(!inp.value) return alert('Motivo requerido'); await api('api/tickets/'+t.id+'/reject', { method:'PATCH', body: JSON.stringify({ reason: inp.value }) }); listExpenses() }
    td.append(btnA, inp, btnR); tr.appendChild(td)
    tbody.appendChild(tr)
  })
}

async function loadRequests(){
  try{
    const r = await api('api/timesheets/requests/pending')
    const tbody = document.querySelector('#reqTable tbody')
    tbody.innerHTML = ''
    r.requests.forEach(req=>{
      const tr = document.createElement('tr')
      tr.innerHTML = `<td>${req.email}</td><td>${req.date}</td><td>${req.start_time}</td><td>${req.end_time}</td><td>${new Date(req.created_at).toLocaleString()}</td>`
      const td = document.createElement('td')
      const btnA = document.createElement('button')
      btnA.className = 'btn'
      btnA.textContent = 'Aceptar'
      btnA.onclick = async ()=>{
        await api('api/timesheets/requests/'+req.id+'/approve', { method:'POST', body: JSON.stringify({}) })
        alert('Solicitud aceptada')
        loadRequests()
      }
      const inp = document.createElement('input')
      inp.className = 'input'
      inp.placeholder = 'Motivo rechazo'
      inp.style.maxWidth = '200px'
      const btnR = document.createElement('button')
      btnR.className = 'btn'
      btnR.textContent = 'Rechazar'
      btnR.onclick = async ()=>{
        if(!inp.value) return alert('Motivo requerido')
        await api('api/timesheets/requests/'+req.id+'/reject', { method:'POST', body: JSON.stringify({ reason: inp.value }) })
        alert('Solicitud rechazada')
        loadRequests()
      }
      td.append(btnA, inp, btnR)
      tr.appendChild(td)
      tbody.appendChild(tr)
    })
  }catch(e){
    console.error('Error al cargar solicitudes:', e)
  }
}

async function loadVacationRequests(){
  try{
    const r = await api('api/vacations/pending')
    const tbody = document.querySelector('#vacTable tbody')
    tbody.innerHTML = ''
    r.requests.forEach(req=>{
      const tr = document.createElement('tr')
      const start = new Date(req.start_date)
      const end = new Date(req.end_date)
      const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1
      tr.innerHTML = `<td>${req.email}</td><td>${req.start_date}</td><td>${req.end_date}</td><td>${days}</td><td>${new Date(req.created_at).toLocaleString()}</td>`
      const td = document.createElement('td')
      const btnA = document.createElement('button')
      btnA.className = 'btn'
      btnA.textContent = 'Aceptar'
      btnA.onclick = async ()=>{
        await api('api/vacations/'+req.id+'/approve', { method:'POST', body: JSON.stringify({}) })
        alert('Vacaciones aprobadas')
        loadVacationRequests()
      }
      const inp = document.createElement('input')
      inp.className = 'input'
      inp.placeholder = 'Motivo rechazo'
      inp.style.maxWidth = '200px'
      const btnR = document.createElement('button')
      btnR.className = 'btn'
      btnR.textContent = 'Rechazar'
      btnR.onclick = async ()=>{
        if(!inp.value) return alert('Motivo requerido')
        await api('api/vacations/'+req.id+'/reject', { method:'POST', body: JSON.stringify({ reason: inp.value }) })
        alert('Vacaciones rechazadas')
        loadVacationRequests()
      }
      td.append(btnA, inp, btnR)
      tr.appendChild(td)
      tbody.appendChild(tr)
    })
  }catch(e){
    console.error('Error al cargar solicitudes de vacaciones:', e)
  }
}

