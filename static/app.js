const THREAD_KEY = 'runbook_pilot_thread_id';
function newThreadId(){ return 'incident-' + crypto.randomUUID(); }
let threadId = localStorage.getItem(THREAD_KEY) || newThreadId();
localStorage.setItem(THREAD_KEY, threadId);

const q = document.getElementById('question');
const send = document.getElementById('sendBtn');
const messages = document.getElementById('messages');
const upload = document.getElementById('uploadBtn');
const fileInput = document.getElementById('fileInput');
const uploadStatus = document.getElementById('uploadStatus');
const fileLabel = document.getElementById('fileLabel');
const starters = document.getElementById('starterPrompts');
const sessionId = document.getElementById('sessionId');
const newSessionBtn = document.getElementById('newSessionBtn');
function renderSession(){ if(sessionId) sessionId.textContent='MEMORY / '+threadId.slice(-8).toUpperCase(); }
renderSession();

function esc(s=''){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));}

function addMessage(role, html, meta=''){
  const el=document.createElement('div'); el.className=`message ${role}`;
  // Changed avatar letter from 'S' to 'R' for RunbookPilot
  const avatar=role==='assistant'?'<div class="avatar">R</div>':'';
  // Changed assistant label from CLOUDOPS SENTINEL to RUNBOOKPILOT
  const label=role==='assistant'?'RUNBOOKPILOT':'ON-CALL ENGINEER';
  el.innerHTML=`${avatar}<div class="message-body"><div class="message-label">${label}</div><div class="bubble">${html}</div>${meta}</div>`;
  messages.appendChild(el); messages.scrollTop=messages.scrollHeight; return el;
}

function loadingMarkup(){return '<span class="thinking">Running Self-RAG <i></i><i></i><i></i></span>';}
function pretty(v=''){return String(v).replaceAll('_',' ').replace(/\b\w/g,m=>m.toUpperCase());}

async function ask(){
  const question=q.value.trim(); if(!question) return;
  if(starters) starters.style.display='none';
  addMessage('user',esc(question)); q.value=''; send.disabled=true;
  const loading=addMessage('assistant',loadingMarkup());
  try{
    const r=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question, thread_id: threadId})});
    const data=await r.json(); if(!r.ok) throw new Error(data.detail||'Request failed');
    loading.remove();
    let meta=`<div class="meta-card" style="margin-top:8px; background:rgba(0,0,0,0.3); padding:10px; border-radius:6px; border:1px solid rgba(255,234,0,0.15);"><div class="verification" style="display:flex; gap:6px; flex-wrap:wrap;"><span class="tag" style="font-family:var(--font-mono); font-size:0.7rem; color:#ffea00; background:rgba(255,234,0,0.08); padding:3px 6px; border-radius:4px;">ROUTE · ${esc(data.route)}</span>`;
    if(data.support_status) meta+=`<span class="tag ok" style="font-family:var(--font-mono); font-size:0.7rem; color:#34d399; background:rgba(52,211,153,0.08); padding:3px 6px; border-radius:4px;">IsSUP · ${esc(pretty(data.support_status))}</span>`;
    if(data.usefulness) meta+=`<span class="tag ok" style="font-family:var(--font-mono); font-size:0.7rem; color:#34d399; background:rgba(52,211,153,0.08); padding:3px 6px; border-radius:4px;">IsUSE · ${esc(pretty(data.usefulness))}</span>`;
    if(data.used_web_search) meta+=`<span class="tag web" style="font-family:var(--font-mono); font-size:0.7rem; color:#38bdf8; background:rgba(56,189,248,0.08); padding:3px 6px; border-radius:4px;">INTERNET SEARCH USED</span>`;
    meta+=`<span class="tag memory" style="font-family:var(--font-mono); font-size:0.7rem; color:#a78bfa; background:rgba(167,139,250,0.08); padding:3px 6px; border-radius:4px;">SQLITE MEMORY · ${data.memory_turns||0} TURN${(data.memory_turns||0)===1?'':'S'}</span>`;
    meta+='</div>';
    if(data.sources?.length){
      meta+='<div class="sources" style="margin-top:8px; display:grid; gap:4px;">'+data.sources.map(s=>`<div class="source" style="font-size:0.75rem; color:#94a3b8;"><span class="source-icon">${s.type==='web'?'⌁':'▱'}</span> <span>${esc(s.title||s.source||'Evidence')}${s.page?' · p.'+s.page:''}${s.url?` · <a target="_blank" rel="noopener" href="${esc(s.url)}" style="color:#38bdf8;">open source ↗</a>`:''}</span></div>`).join('')+'</div>';
    }
    if(data.trace?.length) meta+=`<div class="trace" style="margin-top:6px; font-size:0.72rem;"><details><summary style="cursor:pointer; color:#94a3b8;">Inspect Self-RAG workflow trace</summary><ol style="padding-left:15px; margin-top:4px; color:#64748b;">${data.trace.map(t=>`<li>${esc(t)}</li>`).join('')}</ol></details></div>`;
    meta+='</div>';
    addMessage('assistant',esc(data.answer),meta);
  }catch(e){loading.remove();addMessage('assistant','Request failed: '+esc(e.message));}
  finally{send.disabled=false;q.focus();}
}

send.addEventListener('click',ask);
q.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();ask();}});
starters?.addEventListener('click',e=>{const b=e.target.closest('button[data-q]');if(!b)return;q.value=b.dataset.q;q.focus();});
fileInput.addEventListener('change',()=>{fileLabel.textContent=fileInput.files[0]?.name||'Choose runbook';uploadStatus.textContent='';});

upload.addEventListener('click',async()=>{
  const file=fileInput.files[0]; if(!file){uploadStatus.textContent='Choose a runbook first.';return;}
  upload.disabled=true; uploadStatus.textContent='Indexing private operational knowledge…';
  try{
    const fd=new FormData();fd.append('file',file);
    const r=await fetch('/api/upload',{method:'POST',body:fd});const d=await r.json();
    if(!r.ok)throw new Error(d.detail||'Upload failed');
    uploadStatus.textContent=`✓ ${d.chunks_indexed} chunks indexed in ${d.namespace}`;
  }catch(e){uploadStatus.textContent='Error: '+e.message;}
  finally{upload.disabled=false;}
});

newSessionBtn?.addEventListener('click',()=>{
  threadId = newThreadId();
  localStorage.setItem(THREAD_KEY, threadId);
  renderSession();
  messages.innerHTML = `<div class="message assistant"><div class="avatar">R</div><div class="message-body"><div class="message-label">RUNBOOKPILOT</div><div class="bubble intro">New incident memory session started. Describe the production issue and I’ll build context across your follow-up questions.</div></div></div>`;
  if(starters) starters.style.display='flex';
  q.value=''; q.focus();
});