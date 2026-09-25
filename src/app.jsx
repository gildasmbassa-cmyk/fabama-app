const {useState,useEffect,useRef,useCallback}=React;

// ─── SUPABASE CLIENT ──────────────────────────────────────────────────────────
const SUPA_URL='https://qygjxmgfmfnquxvszzqy.supabase.co';
const SUPA_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF5Z2p4bWdmbWZucXV4dnN6enF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU2NjIwMjIsImV4cCI6MjEwMTIzODAyMn0.BKg5Ty-SfAeNw5LJDsNeXdeB7B_rWXmRl6l7ksH28Ow';

let _token=null,_userId=null,_userEmail=null;
const CACHE_KEY='fabama_cache_2026';

async function supaFetch(path,opts={}){
  const headers={'Content-Type':'application/json','apikey':SUPA_KEY,'Prefer':'return=representation',...(opts.headers||{})};
  if(_token) headers['Authorization']='Bearer '+_token;
  const r=await fetch(SUPA_URL+path,{...opts,headers});
  if(!r.ok){const e=await r.json().catch(()=>({}));throw new Error(e.message||r.statusText)}
  return r.status===204?null:r.json();
}

const supa={
  from:(t)=>({
    select:(cols='*')=>({
      eq:(c,v)=>({
        order:(col,{ascending:asc=true}={})=>supaFetch(`/rest/v1/${t}?select=${cols}&${c}=eq.${encodeURIComponent(v)}&order=${col}.${asc?'asc':'desc'}`),
        single:()=>supaFetch(`/rest/v1/${t}?select=${cols}&${c}=eq.${encodeURIComponent(v)}`).then(d=>({data:d?.[0]||null})),
        then:(r)=>supaFetch(`/rest/v1/${t}?select=${cols}&${c}=eq.${encodeURIComponent(v)}`).then(d=>({data:d||[]})).then(r),
      }),
      order:(col,{ascending:asc=true}={})=>supaFetch(`/rest/v1/${t}?select=${cols}&order=${col}.${asc?'asc':'desc'}`).then(d=>({data:d||[]})),
      then:(r)=>supaFetch(`/rest/v1/${t}?select=${cols}`).then(d=>({data:d||[]})).then(r),
    }),
    insert:(body)=>({
      select:()=>({single:()=>supaFetch(`/rest/v1/${t}`,{method:'POST',body:JSON.stringify(body)})}),
      then:(r)=>supaFetch(`/rest/v1/${t}`,{method:'POST',body:JSON.stringify(body)}).then(d=>({data:d,error:null})).catch(e=>({data:null,error:e})).then(r),
    }),
    update:(body)=>({
      eq:(c,v)=>supaFetch(`/rest/v1/${t}?${c}=eq.${encodeURIComponent(v)}`,{method:'PATCH',body:JSON.stringify(body)}).then(d=>({data:d,error:null})).catch(e=>({data:null,error:e})),
    }),
    delete:()=>({
      eq:(c,v)=>supaFetch(`/rest/v1/${t}?${c}=eq.${encodeURIComponent(v)}`,{method:'DELETE'}).then(()=>({error:null})).catch(e=>({error:e})),
    }),
  }),
  auth:{
    signInWithPassword:async({email,password})=>{
      const d=await supaFetch('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email,password}),headers:{'Content-Type':'application/json','apikey':SUPA_KEY}});
      _token=d.access_token;_userId=d.user?.id;_userEmail=d.user?.email;
      return {data:{user:d.user},error:null};
    },
    signOut:()=>{_token=null;_userId=null;_userEmail=null;return Promise.resolve()},
    getUser:()=>Promise.resolve({data:{user:_userId?{id:_userId,email:_userEmail}:null}}),
  }
};

// ─── DONNÉES STATIQUES FABAMA 2026 ───────────────────────────────────────────
const FABAMA_DATA=`
ASSOCIATION FABAMA 2026 — RÈGLES
- 12 rangs tontine, mise 10 000 FCFA/rang → Pot 120 000 FCFA/mois (rang N = AG du mois N)
- Taux intérêt prêts : 10% janv–sept / 0% oct–déc ; intérêts payés à l'AG où le prêt est accordé
- Sorties d'un mois = capital prêté + aides + tontine versée + kola

FORMAT COMMUNIQUÉ FABAMA :
Quand on demande un communiqué AG, le rédiger selon ce format officiel :
--- ENTÊTE FABAMA ---
COMMUNIQUÉ N°XX — AG MENSUELLE FABAMA
[mois] [année]
Famille hôte : [NOM FAMILLE]
Date : [date complète]
Heure : [heure] précises
Lieu : [adresse avec repères]
ORDRE DU JOUR (9 points) :
1. Ouverture de séance
2. Lecture et adoption du PV précédent
3. Cotisations mensuelles
4. Tontine — bénéficiaire du mois
5. Point sur les prêts et remboursements
6. Questions diverses
7. Annonces et informations
8. Prochaine réception : [famille suivante]
9. Clôture
Signé : MBASSA MBASSA André Gildas Gabin — Secrétaire Général FABAMA
`;

const aiSystem=(data)=>`Tu es l'Assistant SG de l'association FABAMA. Réponds UNIQUEMENT en français, de façon directe et concise.

${FABAMA_DATA}
${contexteIA(data)}

Règles de réponse :
- Bref et précis. Pas de blabla.
- Montants toujours en FCFA avec séparateur milliers (ex: 120 000 FCFA)
- Statuts : ✅ OK / ⚠️ Attention / 🚨 Urgent
- Pour communiqué AG : format officiel FABAMA complet tel que décrit ci-dessus
- Tableaux si pertinent`;

// ─── UTILS ────────────────────────────────────────────────────────────────────
const fmt=(n)=>n!=null?Number(n).toLocaleString('fr-FR'):'—';
const MOIS=['','Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
// Une AG est « tenue » dès que sa date (enregistrée depuis le Communiqué) est passée.
// Même règle côté base : fonction fabama_sync_ag() (trigger + tâche quotidienne).
const todayISO=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const agTenue=(reunions,mois)=>{
  if(!reunions||!reunions.length)return false;
  const r=reunions.find(x=>x.mois===mois);
  return !!(r&&r.date_reunion&&String(r.date_reunion).slice(0,10)<=todayISO());
};
const prochaineAG=(reunions)=>{for(let m=1;m<=12;m++){if(!agTenue(reunions,m))return m;}return 13;};

// ── Calculs à partir des données chargées après connexion (rien de nominatif dans le code) ──
const normNom=(n)=>String(n||'').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/^(MTRE|MME|M\.)\s+/,'').split(/\s+/).slice(0,2).join(' ');
const calcSynthese=(data={})=>{
  const {cotisations=[],tontine=[],reunions=[]}=data;
  const tenues=Array.from({length:12},(_,i)=>i+1).filter(m=>agTenue(reunions,m)).length;
  const par={};
  cotisations.forEach(c=>{
    const k=c.membre_nom||'';if(!k)return;
    const x=par[k]||(par[k]={membre:k,total_cotise:0,epargne:0,tontine:0,emprunts:0,_mois:new Set()});
    x.total_cotise+=c.total||0;x.epargne+=c.epargne||0;x.emprunts+=c.emprunt||0;x._mois.add(c.mois);
  });
  tontine.filter(t=>t.statut==='Reçu').forEach(t=>{
    const x=Object.values(par).find(m=>normNom(m.membre)===normNom(t.beneficiaire_nom));
    if(x)x.tontine+=t.pot||120000;
  });
  return Object.values(par).map(({_mois,...m})=>({...m,reunions:`${_mois.size}/${tenues}`}))
    .sort((a,b)=>a.membre.localeCompare(b.membre));
};
const calcBilans=(data={})=>{
  const {cotisations=[],tontine=[],reunions=[]}=data;
  const out=[];
  for(let m=1;m<=12;m++){
    const cs=cotisations.filter(c=>c.mois===m);if(!cs.length)continue;
    const sum=k=>cs.reduce((s,c)=>s+(c[k]||0),0);
    const t=tontine.find(x=>x.rang===m&&x.statut==='Reçu');
    const e=sum('total'),so=sum('emprunt')+sum('aide')+sum('frais_collation')+(t?(t.pot||120000):0);
    const r=reunions.find(x=>x.mois===m);
    out.push({mois:m,date:r?.date_reunion||'',entrees:e,sorties:so,solde:e-so,beneficiaire:t?.beneficiaire_nom||''});
  }
  return out;
};
const contexteIA=(data={})=>{
  const f=n=>Number(n||0).toLocaleString('fr-FR');
  const {tontine=[],prets=[],reunions=[],reports=[],membres=[]}=data;
  const L=[];
  L.push(`DONNÉES AU ${new Date().toLocaleDateString('fr-FR')} (base FABAMA, lues après connexion)`);
  L.push(`Membres enregistrés : ${membres.length}`);
  L.push('\nBILAN MENSUEL (Entrées / Sorties / Solde) :');
  const B=calcBilans(data);let te=0,ts=0;
  B.forEach(b=>{te+=b.entrees;ts+=b.sorties;L.push(`${MOIS[b.mois]} (AG ${b.date||'?'}) : ${f(b.entrees)} / ${f(b.sorties)} / ${f(b.solde)}${b.beneficiaire?' — tontine : '+b.beneficiaire:''}`);});
  L.push(`TOTAL : entrées ${f(te)} / sorties ${f(ts)} / solde ${f(te-ts)} FCFA`);
  L.push('\nRANGS TONTINE :');
  tontine.forEach(t=>L.push(`Rang ${t.rang} ${MOIS[t.rang]} : ${t.beneficiaire_nom} — ${t.statut}${t.date_paiement?' ('+t.date_paiement+')':''}`));
  L.push('\nCALENDRIER RÉCEPTION :');
  L.push(MOIS.slice(1).map((m,i)=>`${m} ${hoteDe(data,i+1)}${agTenue(reunions,i+1)?' ✅':''}`).join(' | '));
  const nx=prochaineAG(reunions);if(nx<=12)L.push(`Prochaine AG : ${MOIS[nx]}, chez ${hoteDe(data,nx)}`);
  L.push('\nPRÊTS (capital / remboursé / statut) :');
  prets.forEach(p=>L.push(`${p.membre_nom} [${statutPret(p)}] — ${p.type_credit} ${f(p.capital)} (${MOIS[p.mois_emprunt]||''}, limite ${MOIS[p.mois_limite]||''}) / remboursé ${f(p.montant_rembourse)} / ${p.statut}${p.notes?' — '+p.notes:''}`));
  L.push('\nREPORTS IMPAYÉS :');
  reports.forEach(r=>L.push(`${r.membre_nom} (${r.annee_source}, ${r.type_report}) : reste ${f(r.reste_a_payer)} FCFA`));
  L.push('\nSYNTHÈSE MEMBRES (Total cotisé / Épargne / Tontine reçue / Emprunts / Présences) :');
  calcSynthese(data).forEach(m=>L.push(`${m.membre} : ${f(m.total_cotise)} / ${f(m.epargne)} / ${f(m.tontine)} / ${f(m.emprunts)} / ${m.reunions}`));
  return L.join('\n');
};

// ── Source unique : hôtes = table calendrier_reception, bénéficiaires = table tontine ──
const hoteDe=(data,m)=>((data&&data.calendrier)||[]).find(x=>x.mois===m)?.famille_nom||'';
const lieuDe=(data,m)=>((data&&data.calendrier)||[]).find(x=>x.mois===m)?.lieu||'';
const beneficiaireDe=(data,m)=>((data&&data.tontine)||[]).find(x=>x.rang===m)?.beneficiaire_nom||'';
const moisCourant=()=>{const d=new Date();return d.getFullYear()>2026?13:d.getMonth()+1;};
const fmtDateFR=(iso)=>iso?String(iso).slice(0,10).split('-').reverse().join('/'):'';
// Bilans affichés = calcul à partir des cotisations + tontine (même formule que l'assistant)
const bilansAffichage=(data)=>calcBilans(data).map(b=>({mois:b.mois,date_reunion:fmtDateFR(b.date),total_entrees:b.entrees,total_sorties:b.sorties,solde_mois:b.solde,beneficiaire_tontine:b.beneficiaire}));
// Statut d'un prêt déduit des chiffres : soldé si rien à rembourser, retard si la limite est dépassée
const statutPret=(p)=>{
  const reste=(p.capital||0)-(p.montant_rembourse||0),st=String(p.statut||'').toLowerCase();
  if(st.startsWith('sold')||reste<=0)return 'solde';
  return moisCourant()>(p.mois_limite||0)?'retard':'encours';
};


// ─── COMPOSANTS UTILITAIRES ───────────────────────────────────────────────────
function Loading(){return <div className="loading"><div className="spinner"/><p style={{marginTop:12}}>Chargement…</p></div>}
function Alert({type='info',children}){const ic={info:'info',warn:'alert',danger:'alert',success:'check'}[type]||'info';return <div className={`notice ${type}`}><Icon n={ic} size="sm"/><div>{children}</div></div>}

// ─── UI DE BASE (design v2) ───────────────────────────────────────────────────
const ICONS={
  home:'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  users:'M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20 M10 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7 M20 20v-1.5a3.5 3.5 0 0 0-2.5-3.35 M15.5 4.6a3.5 3.5 0 0 1 0 6.8',
  wallet:'M19 8V6a1 1 0 0 0-1-1H5.5A2.5 2.5 0 0 0 3 7.5v10A2.5 2.5 0 0 0 5.5 20H20a1 1 0 0 0 1-1v-3 M3 7.5A2.5 2.5 0 0 0 5.5 10H20a1 1 0 0 1 1 1v2 M21 12h-4a2 2 0 0 0 0 4h4z',
  calendar:'M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z M4 10h16 M8 3v4 M16 3v4',
  more:'M5 12h.01 M12 12h.01 M19 12h.01',
  bell:'M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9 M10.3 21a1.94 1.94 0 0 0 3.4 0',
  cycle:'M20.5 12a8.5 8.5 0 0 1-14.9 5.6L3.5 15.5 M3.5 20v-4.5H8 M3.5 12A8.5 8.5 0 0 1 18.4 6.4l2.1 2.1 M20.5 4v4.5H16',
  loan:'M3 7h18v10H3z M12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5 M6.5 10v.01 M17.5 14v.01',
  clipboard:'M9 3h6a1 1 0 0 1 1 1v1.5H8V4a1 1 0 0 1 1-1 M8 4.5H6.5A1.5 1.5 0 0 0 5 6v13.5A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H16 M8.5 11h7 M8.5 15h4.5',
  chart:'M4 20V11 M10 20V4 M16 20v-7 M21 20H3',
  alert:'M12 9v4 M12 17h.01 M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0',
  house:'M3 10.5 12 3l9 7.5 M5 9.5V20h14V9.5 M10 20v-5h4v5',
  megaphone:'M3 10.5v3a1 1 0 0 0 1 1h2.5l5.5 4v-13l-5.5 4H4a1 1 0 0 0-1 1 M15.5 9a4.5 4.5 0 0 1 0 6 M18.5 6a8.5 8.5 0 0 1 0 12',
  sparkles:'M11 3l1.7 4.3L17 9l-4.3 1.7L11 15l-1.7-4.3L5 9l4.3-1.7z M18.5 14.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z',
  search:'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14 M20 20l-4-4',
  download:'M12 4v11 M7.5 10.5 12 15l4.5-4.5 M5 20h14',
  phone:'M5.5 4h3l1.8 4.6-2.3 1.4a11 11 0 0 0 6 6l1.4-2.3L20 15.5v3a1.5 1.5 0 0 1-1.6 1.5A15.5 15.5 0 0 1 4 5.6 1.5 1.5 0 0 1 5.5 4',
  check:'M5 12.5 9.5 17 19 7.5',
  clock:'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18 M12 7.5V12l3 2',
  pin:'M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z M12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5',
  chevron:'M9 6l6 6-6 6',
  down:'M6 9l6 6 6-6',
  logout:'M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3 M10 16.5 5.5 12 10 7.5 M5.5 12H16',
  edit:'M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17z M13.5 8.5l3 3',
  eye:'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12 M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6',
  eyeoff:'M3 3l18 18 M10.6 5.1A10.9 10.9 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.2 M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7a10 10 0 0 0 5.4-1.6 M9.9 9.9a3 3 0 0 0 4.2 4.2',
  lock:'M6 11h12v9H6z M8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  shield:'M12 3l7 3v5.5c0 4.4-3 8-7 9.5-4-1.5-7-5.1-7-9.5V6z M9 12l2 2 4-4',
  save:'M5 4h11l3 3v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z M8 4v5h7 M8 20v-6h8v6',
  trash:'M4 7h16 M10 11v6 M14 11v6 M6 7l1 13h10l1-13 M9 7V4h6v3',
  up:'M12 19V5 M6.5 10.5 12 5l5.5 5.5',
  dn:'M12 5v14 M6.5 13.5 12 19l5.5-5.5',
  copy:'M9 9h11v11H9z M5 15H4V4h11v1',
  info:'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18 M12 11v5 M12 8h.01',
  x:'M6 6l12 12 M18 6 6 18',
  whatsapp:'M4 20l1.3-3.9A8 8 0 1 1 8 19z M9 9.5c0 3 2.5 5.5 5.5 5.5l1.2-1.4-1.9-1-.8.8a4 4 0 0 1-2.4-2.4l.8-.8-1-1.9z',
};
function Icon({n,size='',className=''}){return <svg className={`ico ico-${n} ${size} ${className}`} viewBox="0 0 24 24" aria-hidden="true"><path d={ICONS[n]||''}/></svg>}
const PALETTE=[['#e7f1e8','#1f5a2e'],['#fbf3d9','#765800'],['#eaf1fb','#1d5bbf'],['#f3e9f6','#6b2c91'],['#fdecea','#9a2a1c'],['#e4f3ef','#0f6b5c']];
const initialesNom=(n)=>String(n||'?').replace(/^(Mtre|Mme|M\.)\s+/i,'').split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0]).join('').toUpperCase();
function Avatar({name,size=40}){let h=0;for(const c of String(name||''))h=(h*31+c.charCodeAt(0))>>>0;const [bg,fg]=PALETTE[h%PALETTE.length];return <div className="avatar" style={{background:bg,color:fg,width:size,height:size,fontSize:Math.round(size*0.34)}}>{initialesNom(name)}</div>}
function Chip({tone='neutral',icon,children}){return <span className={`chip ${tone}`}>{icon&&<Icon n={icon} size="xs"/>}{children}</span>}
function Stat({label,value,unit,tone,hint,icon,wide}){return <div className={`stat${wide?' wide':''}`}><div className="stat-l">{icon&&<Icon n={icon} size="sm"/>}{label}</div><div className={`stat-v ${tone||''}`}>{value}{unit&&<small>{unit}</small>}</div>{hint&&<div className="stat-h">{hint}</div>}</div>}
function Progress({value,max,tone}){const p=max>0?Math.max(0,Math.min(100,Math.round(value/max*100))):0;return <div className={`progress ${tone||''}`} role="progressbar" aria-valuenow={p} aria-valuemin="0" aria-valuemax="100"><span style={{width:p+'%'}}/></div>}
function Sec({title,action,onAction}){return <div className="sec"><h2>{title}</h2>{action&&<button className="section-link" onClick={onAction}>{action}</button>}</div>}
function Empty({icon='info',title,text}){return <div className="empty"><div className="sq"><Icon n={icon} size="lg"/></div><h3>{title}</h3>{text&&<p>{text}</p>}</div>}
function Amt({v,tone,unit=true}){return <span className={`amt ${tone||''}`}>{fmt(v)}{unit&&<small>F</small>}</span>}
const downloadCSV=(name,rows)=>{const csv=rows.map(r=>r.join(';')).join('\n');const a=document.createElement('a');a.href='data:text/csv;charset=utf-8,﻿'+encodeURIComponent(csv);a.download=name;a.click();};
const sansAccent=(s)=>String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
const MOIS_COURT=['','Janv','Févr','Mars','Avr','Mai','Juin','Juil','Août','Sept','Oct','Nov','Déc'];

// ─── LOGIN ────────────────────────────────────────────────────────────────────
function Login({onLogin}){
  const ID_MAP={'SG':'sg.fabama@gmail.com','PRESIDENT':'president.fabama@gmail.com','TRESORIERE':'tresoriere.fabama@gmail.com'};
  const [login,setLogin]=useState('SG');
  const [pass,setPass]=useState('');
  const [showPass,setShowPass]=useState(false);
  const [remember,setRemember]=useState(false);
  const [err,setErr]=useState('');
  const [loading,setLoading]=useState(false);
  const submit=async()=>{
    setLoading(true);setErr('');
    const email=ID_MAP[login.toUpperCase().trim()]||login;
    try{
      const {error}=await supa.auth.signInWithPassword({email,password:pass});
      if(error)throw error;
      onLogin();
    }catch(e){setErr(e.message||'Identifiants incorrects')}
    setLoading(false);
  };
  return(
    <div className="login-screen">
      <div className="login-above">
        <div className="logo-ring">
          <img src="/assets/logo.webp" alt="FABAMA"/>
        </div>
        <h1>FABAMA</h1>
        <div className="login-tagline"><span>Famille Bafia de Maroua</span></div>
      </div>
      <div className="login-card">
        <div className="login-card-top">
          <div className="user-icon-wrap"><Icon n="users"/></div>
          <h2>Bienvenue ! 👋</h2>
          <p>Connectez-vous à votre <strong>espace communautaire</strong></p>
        </div>
        <div className="form-group">
          <label>Identifiant</label>
          <div className="input-wrap">
            <span className="input-icon"><Icon n="users" size="sm"/></span>
            <input type="text" value={login} onChange={e=>setLogin(e.target.value)} placeholder="SG / PRESIDENT / TRESORIERE" onKeyDown={e=>e.key==='Enter'&&submit()}/>
          </div>
        </div>
        <div className="form-group">
          <label>Mot de passe</label>
          <div className="input-wrap">
            <span className="input-icon"><Icon n="lock" size="sm"/></span>
            <input type={showPass?'text':'password'} value={pass} onChange={e=>setPass(e.target.value)} placeholder="Entrez votre mot de passe" onKeyDown={e=>e.key==='Enter'&&submit()}/>
            <button className="pw-toggle" onClick={()=>setShowPass(!showPass)} type="button"><Icon n={showPass?'eyeoff':'eye'} size="sm"/></button>
          </div>
        </div>
        <div className="login-extras">
          <label className="remember-wrap">
            <input type="checkbox" checked={remember} onChange={e=>setRemember(e.target.checked)}/>
            Se souvenir de moi
          </label>
          <button className="forgot-btn" type="button">Mot de passe oublié ?</button>
        </div>
        <button className="btn-login" onClick={submit} disabled={loading}>
          <Icon n="lock" size="sm"/>
          <span>{loading?'Connexion…':'Se connecter'}</span>
          {!loading&&<span>→</span>}
        </button>
        <div className="login-secure"><Icon n="shield" size="xs"/> Accès sécurisé</div>
        {err&&<div className="login-error">⚠️ {err}</div>}
      </div>
      <div className="login-footer">
        <img className="footer-logo" src="/assets/logo.webp" alt="" width="28" height="28"/>
        <p>FABAMA • Espace communautaire</p>
        <p>© 2026 — Tous droits réservés</p>
      </div>
    </div>
  );
}

// ─── TABLEAU DE BORD ──────────────────────────────────────────────────────────
function TabDashboard({data,setActiveTab}){
  const {reunions=[],membres=[],prets=[]}=data;

  // ── Calculs réels ──
  const liste=bilansAffichage(data);
  const totalEntrees=liste.reduce((s,r)=>s+(r.total_entrees||0),0);
  const totalSorties=liste.reduce((s,r)=>s+(r.total_sorties||0),0);
  const solde=totalEntrees-totalSorties;
  const reunionsTenues=Array.from({length:12},(_,i)=>i+1).filter(m=>agTenue(reunions,m)).length;
  const membresActifs=membres.filter(m=>m.statut==='actif').length||membres.length;
  const reports=data.reports||[];
  const impayes=reports.reduce((s,r)=>s+(r.reste_a_payer||0),0); // reports impayés (table reports_impayes)
  const impayesNoms=[...new Set(reports.filter(r=>(r.reste_a_payer||0)>0).map(r=>r.membre_nom))].join(' · ');
  const pretsEnRetard=prets.filter(p=>statutPret(p)==='retard').length;
  const dernierRang=[...(data.tontine||[])].filter(t=>t.statut==='Reçu').sort((a,b)=>b.rang-a.rang)[0];

  // ── Prochaine réunion (mois suivant le dernier tenu) ──
  const prochainMois=reunions.length?prochaineAG(reunions):0;
  const prochainNom=MOIS[prochainMois]||'—';

  // ── Graphique données réelles ──
  const maxE=Math.max(...liste.map(r=>r.total_entrees||0),1);
  const maxS=Math.max(...liste.map(r=>r.total_sorties||0),1);
  const maxVal=Math.max(maxE,maxS);

  // ── Date ──
  const today=new Date();
  const dateStr=today.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'});

  return(
    <div className="tab-content">

      {/* Salutation */}
      <div className="dash-greeting">
        <h2>Bonjour 👋</h2>
        <p>Voici la situation financière de FABAMA</p>
        <div className="dash-date">{dateStr}</div>
      </div>

      {/* Hero Solde */}
      <div className="hero-card">
        <div className="hero-label">Solde disponible</div>
        <div className="hero-amount">{fmt(solde)}</div>
        <div className="hero-sub">FCFA · Tontine FABAMA 2026</div>
        <div className="hero-row">
          <div className="hero-item">
            <div className="hero-item-label">↑ Entrées</div>
            <div className="hero-item-val green">{fmt(totalEntrees)}</div>
          </div>
          <div className="hero-item">
            <div className="hero-item-label">↓ Sorties</div>
            <div className="hero-item-val red">{fmt(totalSorties)}</div>
          </div>
          <div className="hero-item">
            <div className="hero-item-label">Réunions</div>
            <div className="hero-item-val">{reunionsTenues}/12</div>
          </div>
        </div>
        <button className="hero-cta" onClick={()=>setActiveTab('reunions')}>Voir les mouvements →</button>
      </div>

      {/* KPI */}
      <div className="kpi-grid">
        <button className="kpi-card" onClick={()=>setActiveTab('membres')}>
          <span className="kpi-ico brand"><Icon n="users"/></span>
          <div className="kpi-val green">{membresActifs}</div>
          <div className="kpi-desc">Membres actifs</div>
        </button>
        <button className="kpi-card" onClick={()=>setActiveTab('tontine')}>
          <span className="kpi-ico brand"><Icon n="cycle"/></span>
          <div className="kpi-val green">{(data.tontine||[]).filter(t=>t.statut==='Reçu').length}<span style={{fontSize:14,color:'var(--ink3)',fontWeight:700}}> / {(data.tontine||[]).length||12}</span></div>
          <div className="kpi-desc">Rangs de tontine versés</div>
        </button>
        <button className="kpi-card" onClick={()=>setActiveTab('prets')}>
          <span className="kpi-ico danger"><Icon n="alert"/></span>
          <div className="kpi-val red">{pretsEnRetard}</div>
          <div className="kpi-desc">Prêts en retard</div>
        </button>
        <button className="kpi-card" onClick={()=>setActiveTab('reports')}>
          <span className="kpi-ico gold"><Icon n="wallet"/></span>
          <div className="kpi-val gold">{fmt(impayes)}</div>
          <div className="kpi-desc">FCFA d’impayés à recouvrer</div>
        </button>
      </div>

      {/* À surveiller */}
      <div className="section-header">
        <span className="section-title">À surveiller</span>
        <button className="section-link" onClick={()=>setActiveTab('prets')}>Voir tout →</button>
      </div>
      <div className="alert-card">
        <div className="alert-item">
          <div className="alert-dot red"/>
          <div className="alert-info">
            <div className="alert-info-title">Reports impayés 2025</div>
            <div className="alert-info-sub">{impayesNoms||'—'}</div>
          </div>
          <div className="alert-amount">{fmt(impayes)} F</div>
        </div>
        <div className="alert-item">
          <div className="alert-dot red"/>
          <div className="alert-info">
            <div className="alert-info-title">{pretsEnRetard} prêt{pretsEnRetard>1?'s':''} en retard</div>
            <div className="alert-info-sub">{[...new Set(prets.filter(p=>statutPret(p)==='retard').map(p=>p.membre_nom))].join(' · ')||'—'}</div>
          </div>
          <div className="alert-amount">{fmt(prets.filter(p=>statutPret(p)==='retard').reduce((s,p)=>s+Math.max(0,(p.capital||0)-(p.montant_rembourse||0)),0))} F</div>
        </div>
        <div className="alert-item">
          <div className="alert-dot green"/>
          <div className="alert-info">
            <div className="alert-info-title">{dernierRang?`Rang tontine n°${dernierRang.rang} — ${MOIS[dernierRang.rang]}`:'Tontine'}</div>
            <div className="alert-info-sub">{dernierRang?`Bénéficiaire : ${dernierRang.beneficiaire_nom}`:'Aucun rang versé'}</div>
          </div>
          {dernierRang&&<Chip tone="ok" icon="check">Reçu</Chip>}
        </div>
      </div>

      {/* Prochaine réunion */}
      <div className="section-header">
        <span className="section-title">Prochaine réunion</span>
        <button className="section-link" onClick={()=>setActiveTab('reunions')}>Toutes →</button>
      </div>
      <div className="next-meeting">
        <div className="next-meeting-badge">
          <div className="next-meeting-month">{prochainNom?.slice(0,3)}</div>
          <div className="next-meeting-day">—</div>
        </div>
        <div className="next-meeting-info">
          <div className="next-meeting-title">AG {prochainNom} 2026</div>
          <div className="next-meeting-sub">Famille hôte : {hoteDe(data,prochainMois)||'À confirmer'}</div>
          <div className="next-meeting-tag">{(()=>{const r=reunions.find(x=>x.mois===prochainMois);return r&&r.date_reunion?`AG du ${fmtDateFR(r.date_reunion)}`:'Date à confirmer';})()}</div>
        </div>
      </div>

      {/* Graphique activité */}
      <div className="section-header">
        <span className="section-title">Activité financière 2026</span>
      </div>
      <div className="chart-card">
        <div className="chart-legend">
          <div className="legend-item"><div className="legend-dot" style={{background:'var(--green)'}}/>Entrées</div>
          <div className="legend-item"><div className="legend-dot" style={{background:'rgba(192,57,43,0.5)'}}/>Sorties</div>
        </div>
        <div className="chart-bars">
          {liste.map((r,i)=>{
            const hIn=Math.round((r.total_entrees/maxVal)*65)||2;
            const hOut=Math.round((r.total_sorties/maxVal)*65)||2;
            return(
              <div key={i} className="bar-group">
                <div className="bar-wrap">
                  <div className="bar in" style={{height:hIn+'px'}}/>
                  <div className="bar out" style={{height:hOut+'px'}}/>
                </div>
                <div className="bar-month">{r.mois===6?'Jun':r.mois===7?'Jul':r.mois===8?'Aoû':MOIS[r.mois]?.slice(0,3)}</div>
              </div>
            );
          })}
        </div>
        <div style={{display:'flex',justifyContent:'space-between',marginTop:8,paddingTop:10,borderTop:'1px solid var(--border)'}}>
          <div style={{fontSize:12,color:'var(--muted)'}}>Bilan Jan–Aoû 2026</div>
          <div style={{fontSize:14,fontWeight:800,color:'var(--green)'}}>{fmt(solde)} FCFA</div>
        </div>
      </div>

    </div>
  );
}

// ─── MEMBRES ──────────────────────────────────────────────────────────────────
function TabMembres({data,role}){
  const membres=data.membres||[];
  const [search,setSearch]=useState('');
  const filtres=membres.filter(m=>sansAccent(m.nom).includes(sansAccent(search)));
  const exportCSV=()=>downloadCSV('fabama_membres.csv',[['N°','Nom','Téléphone','Rôle','Statut'],...filtres.map((m,i)=>[i+1,m.nom,m.telephone||'',m.role||'Membre',m.statut||''])]);
  const BUREAU=['Président','Trésorière','Trésorier','Secrétaire général'];
  return(
    <div className="tab-content">
      <div className="toolbar">
        <label className="search"><Icon n="search" size="sm"/><input placeholder="Rechercher un membre" value={search} onChange={e=>setSearch(e.target.value)} aria-label="Rechercher un membre"/></label>
        <button className="icon-btn" onClick={exportCSV} title="Exporter en CSV" aria-label="Exporter la liste en CSV"><Icon n="download"/></button>
      </div>
      <div className="list-meta">{filtres.length} membre{filtres.length>1?'s':''}{search?` sur ${membres.length}`:''}</div>
      {filtres.length===0
        ?<Empty icon="users" title="Aucun membre" text={search?'Aucun nom ne correspond à la recherche.':'La liste s’affiche une fois connecté.'}/>
        :<div className="list">
          {filtres.map(m=>(
            <div className="row" key={m.id||m.nom}>
              <Avatar name={m.nom}/>
              <div className="row-main">
                <div className="row-title">{m.nom}</div>
                <div className="row-sub">
                  {BUREAU.includes(m.role)?<Chip tone="warn">{m.role}</Chip>:<span>{m.role||'Membre'}</span>}
                  {m.statut&&m.statut!=='actif'&&<Chip tone={m.statut==='debiteur'?'danger':'neutral'}>{m.statut}</Chip>}
                </div>
              </div>
              {m.telephone&&<a className="icon-btn" href={`tel:${m.telephone}`} aria-label={`Appeler ${m.nom}`}><Icon n="phone" size="sm"/></a>}
            </div>
          ))}
        </div>}
    </div>
  );
}

// ─── TONTINE ──────────────────────────────────────────────────────────────────
function TabTontine({data}){
  const {tontine=[],reunions=[]}=data;
  const rangs=tontine.map(t=>({
    rang:t.rang,mois:MOIS[t.rang]||'',beneficiaire:t.beneficiaire_nom||t.beneficiaire||'',
    // Rang N = AG du mois N : reçu dès que la date de cette AG est passée
    recu:(reunions.length>0&&agTenue(reunions,t.rang))||t.statut==='Reçu',
    date:t.date_paiement||null,
  }));
  const nbRecu=rangs.filter(r=>r.recu).length, total=rangs.length||12;
  const prochain=rangs.find(r=>!r.recu);
  const pot=tontine[0]?.pot||120000, mise=tontine[0]?.mise||10000;
  const multi=Object.entries(rangs.reduce((a,r)=>{a[r.beneficiaire]=(a[r.beneficiaire]||0)+1;return a;},{})).filter(([n,c])=>c>1&&!/^FABAMA/.test(n)).map(([n])=>n);
  if(!rangs.length)return <div className="tab-content"><Empty icon="cycle" title="Aucun rang" text="Les rangs de tontine s’affichent une fois connecté."/></div>;
  return(
    <div className="tab-content">
      <div className="band">
        <div className="k">Tontine 2026</div>
        <div className="v">{nbRecu} / {total}<small>rangs versés</small></div>
        <Progress value={nbRecu} max={total}/>
        <div className="band-row">
          <div><div className="l">Pot mensuel</div><div className="n">{fmt(pot)} F</div></div>
          <div><div className="l">Mise / rang</div><div className="n">{fmt(mise)} F</div></div>
          <div><div className="l">Déjà versé</div><div className="n">{fmt(nbRecu*pot)} F</div></div>
        </div>
      </div>
      {prochain&&(
        <div className="next-meeting">
          <div className="next-meeting-badge"><div className="next-meeting-month">Rang</div><div className="next-meeting-day">{prochain.rang}</div></div>
          <div className="next-meeting-info">
            <div className="next-meeting-sub">Prochain bénéficiaire</div>
            <div className="next-meeting-title">{prochain.beneficiaire}</div>
            <div className="next-meeting-tag">AG de {prochain.mois} · {fmt(pot)} F</div>
          </div>
        </div>
      )}
      {multi.length>0&&<Alert type="info">{multi.join(' et ')} {multi.length>1?'détiennent':'détient'} deux rangs.</Alert>}
      <Sec title="Ordre des rangs"/>
      <div className="list">
        {rangs.map(r=>{
          const st=r.recu?'done':(prochain&&r.rang===prochain.rang)?'next':'todo';
          return(
            <div className={`row${st==='todo'?' muted':''}`} key={r.rang}>
              <div className={`rank ${st}`}>{r.rang}</div>
              <div className="row-main">
                <div className="row-title">{r.beneficiaire}</div>
                <div className="row-sub">{r.mois} 2026{r.date?` · versé le ${fmtDateFR(r.date)}`:''}</div>
              </div>
              {st==='done'?<Chip tone="ok" icon="check">Reçu</Chip>:st==='next'?<Chip tone="warn" icon="clock">Prochain</Chip>:<Chip>À venir</Chip>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── PRÊTS ────────────────────────────────────────────────────────────────────
function TabPrets({data}){
  const {prets=[]}=data;
  const moisActuel=moisCourant();
  const [filtre,setFiltre]=useState('actifs');
  const liste=prets.map(p=>{
    const statut=statutPret(p);
    const moisRetard=statut==='retard'?Math.max(0,(moisActuel-(p.mois_limite||0))):0;
    const penalite=statut==='retard'?Math.round((p.capital-(p.montant_rembourse||0))*0.10*moisRetard):0;
    const solde=Math.max(0,(p.capital||0)-(p.montant_rembourse||0));
    return {
      membre:p.membre_nom||p.membre||'',type:p.type_credit||p.type||'',capital:p.capital||0,rembourse:p.montant_rembourse||0,
      mois_emprunt:MOIS[p.mois_emprunt]||p.mois_emprunt||'',limite:MOIS[p.mois_limite]||'',
      statut,mois_retard:moisRetard,penalite,solde,total_du:solde+penalite,
    };
  }).sort((a,b)=>({retard:0,encours:1,solde:2}[a.statut]-{retard:0,encours:1,solde:2}[b.statut])||b.total_du-a.total_du);
  const nb={retard:liste.filter(p=>p.statut==='retard').length,encours:liste.filter(p=>p.statut==='encours').length,solde:liste.filter(p=>p.statut==='solde').length};
  const totalDu=liste.reduce((s,p)=>s+(p.total_du||0),0);
  const vus=liste.filter(p=>filtre==='tous'||(filtre==='actifs'?p.statut!=='solde':p.statut===filtre));
  const reportsTotal=(data.reports||[]).reduce((s,r)=>s+(r.reste_a_payer||0),0);
  return(
    <div className="tab-content">
      <div className="stats c3">
        <Stat wide label="Total dû en cours" value={fmt(totalDu)} unit="F" tone="danger" icon="loan" hint="Capital restant + pénalités de retard"/>
        <Stat label="En retard" value={nb.retard} tone={nb.retard?'danger':''} icon="alert"/>
        <Stat label="Dans les délais" value={nb.encours} tone="brand" icon="clock"/>
      </div>
      {reportsTotal>0&&<Alert type="warn">Impayés 2025 non apurés : <b>{fmt(reportsTotal)} F</b>, suivis dans l’écran Impayés.</Alert>}
      <div className="segmented full" role="tablist" style={{marginBottom:14}}>
        {[['actifs','En cours',nb.retard+nb.encours],['retard','En retard',nb.retard],['solde','Soldés',nb.solde],['tous','Tous',liste.length]].map(([k,l,c])=>(
          <button key={k} className={filtre===k?'on':''} onClick={()=>setFiltre(k)} role="tab" aria-selected={filtre===k}>{l}<span className="cnt">{c}</span></button>
        ))}
      </div>
      {vus.length===0&&<Empty icon="check" title="Rien à afficher" text="Aucun prêt dans cette catégorie."/>}
      <div className="loans">
      {vus.map((p,i)=>(
        <div className="loan" key={i}>
          <div className="loan-top">
            <Avatar name={p.membre}/>
            <div className="row-main">
              <div className="row-title">{p.membre}</div>
              <div className="row-sub">Crédit {p.type} · {p.mois_emprunt}{p.limite?` → ${p.limite}`:''}</div>
            </div>
            {p.statut==='retard'?<Chip tone="danger" icon="alert">Retard</Chip>:p.statut==='solde'?<Chip tone="ok" icon="check">Soldé</Chip>:<Chip tone="warn" icon="clock">En cours</Chip>}
          </div>
          <div className="loan-mid">
            <div className="loan-line" style={{marginBottom:6}}><span>Remboursé <b>{fmt(p.rembourse)} F</b> sur {fmt(p.capital)} F</span><span>{p.capital?Math.min(100,Math.round(p.rembourse/p.capital*100)):0} %</span></div>
            <Progress value={p.rembourse} max={p.capital} tone={p.statut==='retard'?'danger':''}/>
          </div>
          {p.statut!=='solde'&&(
            <div className="loan-foot">
              {p.statut==='retard'
                ?<span className="late"><Icon n="alert" size="sm"/><span>{p.mois_retard} mois de retard{p.penalite?<><br/><span style={{fontWeight:500}}>pénalité {fmt(p.penalite)} F</span></>:''}</span></span>
                :<span className="note">Échéance : {p.limite||'—'}</span>}
              <div style={{textAlign:'right'}}><div className="note">Reste dû</div><Amt v={p.total_du} tone={p.statut==='retard'?'neg':''}/></div>
            </div>
          )}
        </div>
      ))}
      </div>
    </div>
  );
}

// ─── RÉUNIONS ─────────────────────────────────────────────────────────────────
function TabReunions({data}){
  const {reunions=[]}=data;
  const liste=bilansAffichage(data);
  const total_e=liste.reduce((s,r)=>s+(r.total_entrees||0),0);
  const total_s=liste.reduce((s,r)=>s+(r.total_sorties||0),0);
  const next=reunions.length?prochaineAG(reunions):0;
  return(
    <div className="tab-content">
      <div className="band">
        <div className="k">Bilan 2026 · {liste.length} AG</div>
        <div className="v">{fmt(total_e-total_s)}<small>F de solde</small></div>
        <div className="band-row">
          <div><div className="l">Entrées</div><div className="n up">+{fmt(total_e)} F</div></div>
          <div><div className="l">Sorties</div><div className="n down">−{fmt(total_s)} F</div></div>
        </div>
      </div>
      <p className="intro">Sorties = capital prêté + aides + tontine versée + kola.</p>
      <div className="list">
        {MOIS.slice(1).map((m,i)=>{
          const r=liste.find(x=>x.mois===i+1);
          const d=r&&r.date_reunion?r.date_reunion.split('/')[0]:'';
          if(!r)return(
            <div className="row muted" key={i}>
              <div className={`date-block ${i+1===next?'gold':'muted'}`}><div className="m">{MOIS_COURT[i+1]}</div><div className="d">—</div></div>
              <div className="row-main"><div className="row-title">{m}</div><div className="row-sub">{i+1===next?'Prochaine AG':'À venir'}</div></div>
              {i+1===next?<Chip tone="warn" icon="clock">Prochaine</Chip>:<Chip>À venir</Chip>}
            </div>
          );
          return(
            <div className="row" key={i}>
              <div className="date-block"><div className="m">{MOIS_COURT[i+1]}</div><div className="d">{d||'—'}</div></div>
              <div className="row-main">
                <div className="row-title">{m}</div>
                <div className="row-sub">{r.beneficiaire_tontine?<>Tontine : {r.beneficiaire_tontine}</>:'AG tenue'}</div>
              </div>
              <div className="row-right">
                <Amt v={r.solde_mois} tone={r.solde_mois>=0?'pos':'neg'}/>
                <span className="note">+{fmt(r.total_entrees)} · −{fmt(r.total_sorties)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── DÉTAIL AG ────────────────────────────────────────────────────────────────
const CHAMPS_ENTREES=[['epargne','Épargne'],['tontine_versee','Tontine'],['loto','Loto'],['frais_collation','Kola'],['remboursement','Rembours.'],['interets','Intérêts']];
const CHAMPS_SORTIES=[['emprunt','Emprunt'],['aide','Aide']];
function TabDetailAG({data,onSaved}){
  const {cotisations=[]}=data;
  const [moisSel,setMoisSel]=useState(()=>{const r=data.reunions||[];const n=r.length?prochaineAG(r):new Date().getMonth()+1;return Math.max(1,Math.min(12,n>12?12:n))});
  const [mode,setMode]=useState('voir'); // 'voir' | 'saisir'
  const [saving,setSaving]=useState(false);
  const [saveMsg,setSaveMsg]=useState('');
  const [ouvert,setOuvert]=useState(-1);
  const [filtre,setFiltre]=useState('');

  const MEMBRES_LISTE=(data.membres||[]).map(m=>m.nom).filter(Boolean); // liste lue en base
  const emptyRow=(nom)=>({membre_nom:nom,epargne:0,loto:0,tontine_versee:0,remboursement:0,interets:0,emprunt:0,aide:0,frais_collation:0});
  const [rows,setRows]=useState(MEMBRES_LISTE.map(emptyRow));
  const updateRow=(i,field,val)=>{const r=[...rows];r[i]={...r[i],[field]:Number(val)||0};setRows(r);};
  const totalRow=(r)=>(r.epargne||0)+(r.loto||0)+(r.tontine_versee||0)+(r.remboursement||0)+(r.interets||0)+(r.frais_collation||0);
  const sortiesRow=(r)=>(r.emprunt||0)+(r.aide||0);
  const totalEntrees=rows.reduce((s,r)=>s+totalRow(r),0);
  const totalSorties=rows.reduce((s,r)=>s+sortiesRow(r),0);

  const saveToSupabase=async()=>{
    setSaving(true);setSaveMsg('');
    try{
      const annee=2026;
      // Mise à jour ligne par ligne (jamais de suppression) : clé unique année + mois + membre.
      // Le total est recalculé par la base ; les colonnes absentes du formulaire (inscription, secours, timbres…) sont conservées.
      const idParNom=Object.fromEntries((data.membres||[]).map(m=>[m.nom,m.id]));
      const dejaSaisis=new Set((data.cotisations||[]).filter(c=>c.mois===moisSel).map(c=>c.membre_nom));
      const CHAMPS=['epargne','loto','tontine_versee','remboursement','interets','emprunt','aide','frais_collation'];
      const aEnregistrer=rows.filter(r=>totalRow(r)>0||r.emprunt>0||r.aide>0||dejaSaisis.has(r.membre_nom));
      const inconnus=aEnregistrer.filter(r=>!idParNom[r.membre_nom]).map(r=>r.membre_nom);
      if(inconnus.length){setSaveMsg('❌ Membre introuvable en base : '+inconnus.join(', ')+'. Rien n\'a été enregistré.');setSaving(false);return;}
      const payload=aEnregistrer.map(r=>{const o={annee,mois:moisSel,membre_id:idParNom[r.membre_nom]};CHAMPS.forEach(k=>{o[k]=Number(r[k])||0;});return o;});
      if(payload.length===0){setSaveMsg('⚠️ Aucune donnée à enregistrer.');setSaving(false);return;}
      await supaFetch('/rest/v1/cotisations?on_conflict=annee,mois,membre_id',{method:'POST',headers:{'Prefer':'resolution=merge-duplicates,return=representation'},body:JSON.stringify(payload)});
      setSaveMsg(`✅ ${payload.length} ligne(s) enregistrée(s).`);
      onSaved&&onSaved();
      setTimeout(()=>setSaveMsg(''),4000);
    }catch(e){
      const m=String(e.message||'');
      setSaveMsg(/row-level security|permission/i.test(m)?'🔒 Enregistrement réservé à la Trésorière et au Secrétaire général.':'❌ Erreur : '+m+' (aucune donnée supprimée)');
    }
    setSaving(false);
  };

  const cotsMonth=cotisations.filter(c=>c.mois===moisSel);
  const entreesMois=cotsMonth.reduce((s,c)=>s+(c.total||0),0);
  const sortiesMois=cotsMonth.reduce((s,c)=>s+(c.emprunt||0)+(c.aide||0),0);

  const passerEnSaisie=()=>{
    const loaded=MEMBRES_LISTE.map(nom=>{
      const ex=cotsMonth.find(c=>c.membre_nom===nom);
      return ex?{membre_nom:nom,epargne:ex.epargne||0,loto:ex.loto||0,tontine_versee:ex.tontine_versee||0,remboursement:ex.remboursement||0,interets:ex.interets||0,emprunt:ex.emprunt||0,aide:ex.aide||0,frais_collation:ex.frais_collation||0}:emptyRow(nom);
    });
    setRows(loaded);setOuvert(-1);setMode('saisir');
  };
  const exportCSV=()=>downloadCSV(`fabama_ag_${MOIS[moisSel]}.csv`,[['Membre','Épargne','Loto','Tontine','Remb.','Intérêts','Emprunt','Aide','Kola','Total'],
    ...cotsMonth.map(c=>[c.membre_nom,c.epargne||0,c.loto||0,c.tontine_versee||0,c.remboursement||0,c.interets||0,c.emprunt||0,c.aide||0,c.frais_collation||0,c.total||0])]);
  const detail=(c)=>CHAMPS_ENTREES.filter(([k])=>c[k]>0).map(([k,l])=>`${l} ${fmt(c[k])}`).join(' · ');

  return(
    <div className="tab-content">
      <div className="toolbar">
        <select className="select" style={{flex:1}} value={moisSel} onChange={e=>{setMoisSel(Number(e.target.value));setMode('voir');setSaveMsg('');}} aria-label="Mois de l'AG">
          {MOIS.slice(1).map((m,i)=><option key={i} value={i+1}>AG {m} 2026</option>)}
        </select>
        <button className="icon-btn" onClick={exportCSV} title="Exporter en CSV" aria-label="Exporter en CSV" disabled={!cotsMonth.length}><Icon n="download"/></button>
      </div>
      <div className="segmented full" style={{marginBottom:16}}>
        <button className={mode==='voir'?'on':''} onClick={()=>setMode('voir')}><Icon n="eye" size="sm"/>Consulter</button>
        <button className={mode==='saisir'?'on':''} onClick={passerEnSaisie}><Icon n="edit" size="sm"/>{cotsMonth.length?'Modifier':'Saisir'}</button>
      </div>

      {mode==='voir'&&(
        cotsMonth.length===0
          ?<Empty icon="clipboard" title={`Rien pour ${MOIS[moisSel]}`} text="Aucune cotisation enregistrée pour ce mois. Utilise « Saisir » pour entrer les montants de l’AG."/>
          :<>
            <div className="stats">
              <Stat label="Entrées" value={fmt(entreesMois)} unit="F" tone="brand" icon="up"/>
              <Stat label="Emprunts + aides" value={fmt(sortiesMois)} unit="F" tone="danger" icon="dn"/>
            </div>
            <div className="list-meta">{cotsMonth.length} membre{cotsMonth.length>1?'s ont':' a'} cotisé · du plus grand au plus petit montant</div>
            <div className="list">
              {[...cotsMonth].sort((a,b)=>(b.total||0)-(a.total||0)).map((c,i)=>(
                <div className="row" key={i}>
                  <Avatar name={c.membre_nom} size={36}/>
                  <div className="row-main">
                    <div className="row-title">{c.membre_nom}</div>
                    <div className="row-sub">{detail(c)||'—'}{c.emprunt>0&&<Chip tone="danger">Emprunt {fmt(c.emprunt)}</Chip>}{c.aide>0&&<Chip tone="danger">Aide {fmt(c.aide)}</Chip>}</div>
                  </div>
                  <Amt v={c.total}/>
                </div>
              ))}
            </div>
          </>
      )}

      {mode==='saisir'&&(
        <>
          <Alert type="warn">Saisie de l’AG de <b>{MOIS[moisSel]} 2026</b>. Touche un membre pour entrer ses montants, puis enregistre.</Alert>
          <div className="toolbar">
            <label className="search"><Icon n="search" size="sm"/><input placeholder="Trouver un membre" value={filtre} onChange={e=>setFiltre(e.target.value)} aria-label="Trouver un membre"/></label>
          </div>
          {rows.map((r,i)=>{
            if(filtre&&!sansAccent(r.membre_nom).includes(sansAccent(filtre)))return null;
            const open=ouvert===i, te=totalRow(r), ts=sortiesRow(r);
            return(
              <div className={`entry${open?' open':''}`} key={r.membre_nom}>
                <button className="row" onClick={()=>setOuvert(open?-1:i)} aria-expanded={open}>
                  <Avatar name={r.membre_nom} size={36}/>
                  <div className="row-main">
                    <div className="row-title">{r.membre_nom}</div>
                    <div className="row-sub">{te||ts?<>{te>0&&<span>Entrées {fmt(te)} F</span>}{ts>0&&<Chip tone="danger">Sorties {fmt(ts)}</Chip>}</>:<span style={{color:'var(--ink3)'}}>Non saisi</span>}</div>
                  </div>
                  <Icon n={open?'down':'chevron'} size="sm"/>
                </button>
                {open&&(
                  <div className="entry-body">
                    <div className="entry-sep">Entrées</div>
                    {CHAMPS_ENTREES.map(([f,l])=>(
                      <div key={f}><label htmlFor={`${i}-${f}`}>{l}</label><input id={`${i}-${f}`} type="number" inputMode="numeric" min="0" step="500" value={r[f]||''} placeholder="0" onChange={e=>updateRow(i,f,e.target.value)}/></div>
                    ))}
                    <div className="entry-sep">Sorties</div>
                    {CHAMPS_SORTIES.map(([f,l])=>(
                      <div key={f} className="out"><label htmlFor={`${i}-${f}`}>{l}</label><input id={`${i}-${f}`} type="number" inputMode="numeric" min="0" step="500" value={r[f]||''} placeholder="0" onChange={e=>updateRow(i,f,e.target.value)}/></div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {saveMsg&&<div style={{marginTop:12}}><Alert type={saveMsg.startsWith('✅')?'success':saveMsg.startsWith('⚠️')?'warn':'danger'}>{saveMsg.replace(/^(✅|⚠️|❌|🔒)\s*/,'')}</Alert></div>}
          <div className="savebar">
            <div className="tot">Entrées <b>{fmt(totalEntrees)} F</b><br/>Sorties <b style={{color:'var(--danger)'}}>{fmt(totalSorties)} F</b> · {rows.filter(r=>totalRow(r)>0||sortiesRow(r)>0).length}/{rows.length} membres</div>
            <button className="btn btn-ghost btn-sm" onClick={()=>{if(confirm('Vider tous les montants saisis (rien n’est supprimé en base) ?'))setRows(MEMBRES_LISTE.map(emptyRow));}} aria-label="Vider le formulaire"><Icon n="trash" size="sm"/></button>
            <button className="btn btn-primary" onClick={saveToSupabase} disabled={saving}><Icon n="save" size="sm"/>{saving?'Envoi…':'Enregistrer'}</button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── SYNTHÈSE ─────────────────────────────────────────────────────────────────
function TabSynthese({data}){
  const liste=[...calcSynthese(data)].sort((a,b)=>b.total_cotise-a.total_cotise);
  const totalCotise=liste.reduce((s,m)=>s+(m.total_cotise||0),0);
  const totalEpargne=liste.reduce((s,m)=>s+(m.epargne||0),0);
  const exportCSV=()=>downloadCSV('fabama_synthese.csv',[['Membre','Total cotisé','Épargne','Tontine','Emprunts','Réunions'],...liste.map(m=>[m.membre,m.total_cotise,m.epargne,m.tontine,m.emprunts,m.reunions])]);
  const max=Math.max(1,...liste.map(m=>m.total_cotise||0));
  return(
    <div className="tab-content">
      <div className="stats">
        <Stat label="Total cotisé" value={fmt(totalCotise)} unit="F" tone="brand" icon="up"/>
        <Stat label="dont épargne" value={fmt(totalEpargne)} unit="F" icon="wallet"/>
      </div>
      <div className="sec"><h2>{liste.length} membres · par total cotisé</h2><button className="section-link" onClick={exportCSV} style={{display:'flex',alignItems:'center',gap:4}}><Icon n="download" size="sm"/>CSV</button></div>
      {liste.length===0?<Empty icon="chart" title="Pas encore de données" text="La synthèse se calcule à partir des cotisations saisies."/>:
      <div className="list">
        {liste.map((m,i)=>{
          const [pres,tot]=String(m.reunions||'0/0').split('/').map(Number);
          const parts=[m.epargne>0&&`Épargne ${fmt(m.epargne)}`,m.tontine>0&&`Tontine reçue ${fmt(m.tontine)}`,m.emprunts>0&&`Emprunts ${fmt(m.emprunts)}`].filter(Boolean);
          return(
            <div className="row" key={i}>
              <div className="rank todo" style={{borderStyle:'solid',borderColor:'var(--line)',width:28,height:28,fontSize:12}}>{i+1}</div>
              <div className="row-main">
                <div className="row-title">{m.membre}</div>
                <div className="row-sub">{parts.join(' · ')||'—'}</div>
                <div style={{marginTop:6}}><Progress value={m.total_cotise} max={max}/></div>
              </div>
              <div className="row-right">
                <Amt v={m.total_cotise} tone="pos"/>
                <Chip tone={pres>=tot&&tot>0?'ok':'warn'}>{m.reunions} AG</Chip>
              </div>
            </div>
          );
        })}
      </div>}
    </div>
  );
}

// ─── REPORTS (IMPAYÉS) ────────────────────────────────────────────────────────
function TabReports({data={}}){
  const reports=(data.reports||[]).filter(r=>(r.reste_a_payer||0)>0);
  const total=reports.reduce((s,r)=>s+(r.reste_a_payer||0),0);
  const personnes=new Set(reports.map(r=>r.membre_nom)).size;
  if(!reports.length)return <div className="tab-content"><Empty icon="check" title="Aucun impayé" text="Tous les reports des années précédentes sont apurés."/></div>;
  return(
    <div className="tab-content">
      <div className="band danger">
        <div className="k">Impayés à recouvrer</div>
        <div className="v">{fmt(total)}<small>F</small></div>
        <div className="band-row">
          <div><div className="l">Membres concernés</div><div className="n">{personnes}</div></div>
          <div><div className="l">Dossiers</div><div className="n">{reports.length}</div></div>
        </div>
      </div>
      <div className="list">
        {reports.map((r,i)=>(
          <div className="row" key={i}>
            <Avatar name={r.membre_nom}/>
            <div className="row-main">
              <div className="row-title">{r.membre_nom}</div>
              <div className="row-sub"><Chip tone="neutral">{r.type_report} {r.annee_source}</Chip><span>dû {fmt(r.montant_du)}{r.penalite?` + pénalité ${fmt(r.penalite)}`:''}</span></div>
            </div>
            <div className="row-right"><Amt v={r.reste_a_payer} tone="neg"/>{r.montant_rembourse>0&&<span className="note">versé {fmt(r.montant_rembourse)}</span>}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── RÉCEPTION ────────────────────────────────────────────────────────────────
function TabReception({data={}}){
  const {reunions=[]}=data;
  // Statut dérivé de la date de l'AG (enregistrée via le Communiqué) : passée → Tenu
  const next=reunions.length?prochaineAG(reunions):0;
  const cal=MOIS.slice(1).map((mois,i)=>{
    const m=i+1,hote=hoteDe(data,m)||'—',r=reunions.find(x=>x.mois===m);
    const statut=hote==='LIBRE'?'libre':agTenue(reunions,m)?'done':m===next?'next':'';
    return {m,mois,hote,statut,date:r?.date_reunion||'',lieu:lieuDe(data,m)};
  });
  const n=cal.find(c=>c.m===next);
  return(
    <div className="tab-content">
      {n?(
        <div className="next-meeting">
          <div className="next-meeting-badge"><div className="next-meeting-month">{MOIS_COURT[n.m]}</div><div className="next-meeting-day">{n.date?fmtDateFR(n.date).slice(0,2):'—'}</div></div>
          <div className="next-meeting-info">
            <div className="next-meeting-sub">Prochaine réception</div>
            <div className="next-meeting-title">{n.hote}</div>
            <div className="next-meeting-tag">{n.date?`AG du ${fmtDateFR(n.date)}`:'Date à confirmer'}{n.lieu?` · ${n.lieu}`:''}</div>
          </div>
        </div>
      ):reunions.length?<Alert type="success">Toutes les AG 2026 sont tenues.</Alert>:null}
      <Sec title="Calendrier 2026"/>
      <div className="list">
        {cal.map(c=>(
          <div className={`row${c.statut===''||c.statut==='libre'?' muted':''}`} key={c.m}>
            <div className={`date-block ${c.statut==='done'?'':c.statut==='next'?'gold':'muted'}`}><div className="m">{MOIS_COURT[c.m]}</div><div className="d">{c.date&&c.statut==='done'?fmtDateFR(c.date).slice(0,2):'—'}</div></div>
            <div className="row-main">
              <div className="row-title">{c.hote==='LIBRE'?'Mois libre':c.hote}</div>
              <div className="row-sub">{c.lieu||(c.date?`AG du ${fmtDateFR(c.date)}`:`${c.mois} 2026`)}</div>
            </div>
            {c.statut==='done'?<Chip tone="ok" icon="check">Tenue</Chip>:c.statut==='next'?<Chip tone="warn" icon="pin">Prochaine</Chip>:c.statut==='libre'?<Chip>Libre</Chip>:<Chip>À venir</Chip>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── COMMUNIQUÉ ───────────────────────────────────────────────────────────────
function TabCommunique({data={},onSaved}){
  const {reunions=[]}=data;
  const moisInit=Math.min(prochaineAG(reunions),12);
  const dateDB=(m)=>{const r=reunions.find(x=>x.mois===m);return r&&r.date_reunion?String(r.date_reunion).slice(0,10):'';};
  const [mois,setMois]=useState(moisInit);
  const [hote,setHote]=useState(hoteDe(data,moisInit));
  const [date,setDate]=useState(dateDB(moisInit));
  const [heure,setHeure]=useState('16h00');
  const [lieu,setLieu]=useState(lieuDe(data,moisInit));
  const [reperes,setReperes]=useState('');
  const [texte,setTexte]=useState('');
  const [copied,setCopied]=useState(false);
  const [saveMsg,setSaveMsg]=useState('');

  const changeMois=(m)=>{setMois(m);setHote(hoteDe(data,m));setLieu(lieuDe(data,m));setDate(dateDB(m));setSaveMsg('');};

  // Enregistre la date de l'AG : une fois passée, tontine du rang + réception passent automatiquement à « Reçu / Tenu »
  const saveDate=async()=>{
    if(!date){setSaveMsg('');return;}
    if(date===dateDB(mois)){setSaveMsg('📌 Date de l\'AG déjà enregistrée');return;}
    try{
      await supaFetch(`/rest/v1/reunions?annee=eq.2026&mois=eq.${mois}`,{method:'PATCH',body:JSON.stringify({date_reunion:date})});
      if(lieu&&lieu!==lieuDe(data,mois)){await supaFetch(`/rest/v1/calendrier_reception?annee=eq.2026&mois=eq.${mois}`,{method:'PATCH',body:JSON.stringify({lieu})}).catch(()=>{});}
      setSaveMsg(`✅ Date de l'AG ${MOIS[mois]} enregistrée (${formatDate(date)}). Mise à jour automatique après cette date.`);
      onSaved&&onSaved();
    }catch(e){setSaveMsg('⚠️ Date non enregistrée : '+e.message);}
  };


  const formatDate=(d)=>{
    if(!d)return '[Date à confirmer]';
    const dt=new Date(d+'T00:00:00');
    return dt.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  };

  const generate=()=>{
    const m=MOIS[mois];
    const prochainHote=mois<12&&hoteDe(data,mois+1)?`${hoteDe(data,mois+1)} (${MOIS[mois+1]})`:'À confirmer';
    const dateStr=formatDate(date);
    const num=`N°${String(mois).padStart(2,'0')}/2026`;

    const t=
`FAMILLE BAFIA DE MAROUA (FABAMA)
Famille Bafia de l'Extrême-Nord

📢 COMMUNIQUÉ – AG ${m.toUpperCase()} 2026

Chers membres, vous êtes invités à notre Assemblée Générale Ordinaire mensuelle, qui se tiendra ce mois-ci chez notre famille hôte du mois : ${hote}.

📅 DATE : ${dateStr}
⏰ HEURE : ${heure} précises
🏠 FAMILLE HÔTE DU MOIS : ${hote}
📍 LOCALISATION : ${lieu}${reperes ? "\n🗺️ REPÈRES : "+reperes : ""}

📋 ORDRE DU JOUR :
1️⃣ Prière d'ouverture
2️⃣ Nouvelles familiales
3️⃣ Inscriptions
4️⃣ Épargnes (Principale & Scolaire)
5️⃣ Gestion de la Loto
6️⃣ Opérations de tontines
7️⃣ Remboursement des dettes
8️⃣ Questions diverses
9️⃣ Collation

🗓️ RAPPEL : Prochaine famille hôte → ${prochainHote}

⚠️ La présence de tous est vivement souhaitée. Merci de respecter strictement l'heure.

Fait à Maroua, le ${date?formatDate(date):new Date().toLocaleDateString('fr-FR')}

✍️ Pour le Bureau
MBASSA MBASSA André Gildas Gabin
Secrétaire Général`;

    setTexte(t);setCopied(false);
    saveDate();
  };

  const copy=()=>{
    navigator.clipboard.writeText(texte).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),3000)});
  };

  return(
    <div className="tab-content">
      <p className="intro">Prépare l’invitation WhatsApp de l’AG. La date saisie ici est enregistrée : une fois l’AG passée, la tontine et la réception se mettent à jour toutes seules.</p>
      <div className="card">
        <div className="form-row">
          <div className="field"><label htmlFor="cq-mois">Mois de l’AG</label>
            <select id="cq-mois" value={mois} onChange={e=>changeMois(Number(e.target.value))}>{MOIS.slice(1).map((m,i)=><option key={i} value={i+1}>{m} 2026</option>)}</select></div>
          <div className="field"><label htmlFor="cq-date">Date</label><input id="cq-date" type="date" lang="fr" value={date} onChange={e=>setDate(e.target.value)}/></div>
        </div>
        <div className="form-row">
          <div className="field"><label htmlFor="cq-hote">Famille hôte</label><input id="cq-hote" value={hote} onChange={e=>setHote(e.target.value)} placeholder="Nom de la famille"/></div>
          <div className="field"><label htmlFor="cq-heure">Heure</label><input id="cq-heure" value={heure} onChange={e=>setHeure(e.target.value)} placeholder="16h00"/></div>
        </div>
        <div className="field"><label htmlFor="cq-lieu">Lieu</label><input id="cq-lieu" value={lieu} onChange={e=>setLieu(e.target.value)} placeholder="Quartier, adresse"/></div>
        <div className="field" style={{marginBottom:18}}><label htmlFor="cq-rep">Repères / itinéraire</label><input id="cq-rep" value={reperes} onChange={e=>setReperes(e.target.value)} placeholder="Comment trouver le lieu"/></div>
        <button className="btn btn-primary btn-block" onClick={generate}><Icon n="megaphone" size="sm"/>Générer le communiqué</button>
        {saveMsg&&<div style={{marginTop:12,marginBottom:-12}}><Alert type={saveMsg.startsWith('⚠️')?'warn':'success'}>{saveMsg.replace(/^(✅|⚠️|📌)\s*/,'')}</Alert></div>}
      </div>
      {texte&&(
        <>
          <Sec title="Aperçu WhatsApp"/>
          <div className="wa">
            <div className="wa-bubble">{texte}</div>
            <div className="wa-actions">
              <button className="btn btn-primary" style={{flex:1}} onClick={copy}><Icon n={copied?'check':'copy'} size="sm"/>{copied?'Copié !':'Copier le texte'}</button>
              <a className="btn btn-secondary" href={`https://wa.me/?text=${encodeURIComponent(texte)}`} target="_blank" rel="noopener"><Icon n="whatsapp" size="sm"/>WhatsApp</a>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── ASSISTANT IA ─────────────────────────────────────────────────────────────
function TabAssistant({data={}}){
  const [messages,setMessages]=useState([]);
  const [input,setInput]=useState('');
  const [loading,setLoading]=useState(false);
  const chatRef=useRef(null);
  const taRef=useRef(null);

  useEffect(()=>{if(chatRef.current)chatRef.current.scrollTop=chatRef.current.scrollHeight;},[messages]);

  const dernierMois=Math.max(0,...(data.cotisations||[]).map(c=>c.mois||0));
  const QUICKIES=[
    {label:'Solde de la caisse',q:'Quel est le solde actuel de la caisse FABAMA ?'},
    {label:'Prêts en retard',q:'Qui a des prêts en retard de remboursement ?'},
    {label:'Impayés',q:'Détaille les reports impayés'},
    {label:'Rangs de tontine',q:'Donne-moi tous les rangs de tontine 2026'},
    {label:'Bilan de l’année',q:'Quel est le bilan financier 2026 à ce jour, mois par mois ?'},
    {label:'Top épargne',q:'Quels sont les 5 membres qui ont le plus épargné en 2026 ?'},
    {label:'Communiqué',q:`Rédige le communiqué officiel de la prochaine AG (${MOIS[Math.min(prochaineAG(data.reunions),12)]} 2026, chez ${hoteDe(data,Math.min(prochaineAG(data.reunions),12))})`},
    {label:`Absents ${MOIS[dernierMois]||''}`.trim(),q:`Quels membres n'ont pas cotisé à l'AG de ${MOIS[dernierMois]||'ce mois'} 2026 ?`},
  ];

  const renderMarkdown=(t)=>t
    .replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>')
    .replace(/`(.*?)`/g,'<code>$1</code>')
    .replace(/\n\n/g,'</p><p>')
    .replace(/\n/g,'<br>');

  const send=async(text=input)=>{
    const q=text.trim();
    if(!q||loading)return;
    setInput('');
    if(taRef.current)taRef.current.style.height='auto';
    const newMsgs=[...messages,{role:'user',content:q}];
    setMessages(newMsgs);
    setLoading(true);
    try{
      const r=await fetch('https://qygjxmgfmfnquxvszzqy.supabase.co/functions/v1/claude-proxy',{
        method:'POST',
        headers:{'Content-Type':'application/json','apikey':SUPA_KEY,'Authorization':'Bearer '+(_token||'')},
        body:JSON.stringify({system:aiSystem(data),messages:newMsgs})
      });
      const d=await r.json().catch(()=>({}));
      const reply=d.content?.[0]?.text
        ||(d.code==='session'||(r.status===401&&!d.code)?'🔒 Session expirée : déconnecte-toi puis reconnecte-toi.'
        :d.code==='bureau'?'🔒 Assistant réservé au bureau FABAMA.'
        :'⚠️ '+(typeof d.error==='string'?d.error:(d.error?.message||'Réponse vide du service IA.')));
      setMessages([...newMsgs,{role:'assistant',content:reply}]);
    }catch(e){
      setMessages([...newMsgs,{role:'assistant',content:'🚨 Erreur de connexion. Vérifie ta connexion internet.'}]);
    }
    setLoading(false);
  };

  return(
    <div className="tab-content">
      <div className="ai-header">
        <div className="ai-logo"><Icon n="sparkles"/></div>
        <div>
          <h2>Assistant FABAMA</h2>
          <p>Répond à partir des données de l’application</p>
        </div>
        <div className="ai-status"><div className="ai-dot"/>En ligne</div>
      </div>

      <div className="ai-quickbar">
        {QUICKIES.map((q,i)=>(
          <button key={i} className="ai-chip" onClick={()=>send(q.q)}>{q.label}</button>
        ))}
      </div>

      <div className="ai-chat">
        <div className="ai-messages" ref={chatRef}>
          {messages.length===0&&(
            <div className="ai-welcome">
              <div className="sq"><Icon n="sparkles" size="lg"/></div>
              <p>Je connais les cotisations, la tontine, les prêts et les impayés{dernierMois?<> jusqu’à l’AG de <b>{MOIS[dernierMois]}</b></>:''}.<br/>Pose ta question ou touche un raccourci.</p>
            </div>
          )}
          {messages.map((m,i)=>(
            <div key={i} className={`ai-msg ${m.role}`}>
              <div className="ai-avatar">{m.role==='user'?'':<Icon n="sparkles" size="sm"/>}</div>
              <div className="ai-bubble">
                {m.role==='assistant'
                  ?<p dangerouslySetInnerHTML={{__html:renderMarkdown(m.content)}}/>
                  :m.content
                }
              </div>
            </div>
          ))}
          {loading&&(
            <div className="ai-msg assistant">
              <div className="ai-avatar"><Icon n="sparkles" size="sm"/></div>
              <div className="thinking">Analyse… <div className="thinking-dots"><span/><span/><span/></div></div>
            </div>
          )}
        </div>
        <div className="ai-inputbar">
          <div className="ai-inputwrap">
            <textarea
              ref={taRef}
              value={input}
              onChange={e=>{setInput(e.target.value);e.target.style.height='auto';e.target.style.height=Math.min(e.target.scrollHeight,100)+'px'}}
              onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}}}
              placeholder="Posez votre question…"
              rows={1}
            />
          </div>
          <button className="ai-send" onClick={()=>send()} disabled={!input.trim()||loading}>
            <svg viewBox="0 0 24 24"><path d="M2 21l21-9L2 3v7l15 2-15 2z"/></svg>
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── APP PRINCIPALE ───────────────────────────────────────────────────────────
function App(){
  const [auth,setAuth]=useState(null);
  const [role,setRole]=useState(null);
  const [activeTab,setActiveTab]=useState('dashboard');
  const [data,setData]=useState({membres:[],reunions:[],tontine:[],prets:[],cotisations:[],reports:[],calendrier:[],synthese:[]});
  const [loading,setLoading]=useState(true);
  const [offline,setOffline]=useState(!navigator.onLine);

  useEffect(()=>{
    const on=()=>setOffline(false);const off=()=>setOffline(true);
    window.addEventListener('online',on);window.addEventListener('offline',off);
    return()=>{window.removeEventListener('online',on);window.removeEventListener('offline',off)};
  },[]);

  useEffect(()=>{
    supa.auth.getUser().then(({data:d})=>{
      if(d?.user){setAuth(d.user);loadData(d.user);}
      else setLoading(false);
    });
  },[]);

  const loadData=async(user,{silent=false}={})=>{
    if(!silent)setLoading(true); // rafraîchissement discret après un enregistrement : l'écran reste affiché
    try{
      const [m,r,t,p,cots,rep,cal]=await Promise.all([
        supaFetch('/rest/v1/membres?select=*&order=nom.asc').catch(()=>null),
        supaFetch('/rest/v1/reunions?select=*&annee=eq.2026&order=mois.asc').catch(()=>null),
        supaFetch('/rest/v1/tontine?select=*&annee=eq.2026&order=rang.asc').catch(()=>null),
        supaFetch('/rest/v1/prets?select=*&annee=eq.2026').catch(()=>null),
        supaFetch('/rest/v1/cotisations?select=mois,epargne,loto,tontine_versee,remboursement,interets,emprunt,aide,frais_collation,total,membres(nom)&annee=eq.2026&order=mois.asc').catch(()=>null),
        supaFetch('/rest/v1/reports_impayes?select=*').catch(()=>null),
        supaFetch('/rest/v1/calendrier_reception?select=*&annee=eq.2026&order=mois.asc').catch(()=>null),
      ]);
      // Normaliser cotisations : ajouter membre_nom depuis le join
      const cotsNorm=(cots||[]).map(c=>({...c,membre_nom:c.membres?.nom||''}));
      // get role
      const bureau=await supaFetch(`/rest/v1/bureau?select=role&id=eq.${_userId}`).catch(()=>[]);
      setRole(bureau?.[0]?.role||'membre');
      const fresh={membres:m||[],reunions:r||[],tontine:t||[],prets:p||[],cotisations:cotsNorm,reports:rep||[],calendrier:cal||[],synthese:[]};
      // Repli hors ligne : dernier chargement réussi, gardé sur l'appareil du membre connecté (effacé à la déconnexion)
      const ok=[m,r,t,p,cots,cal].every(x=>Array.isArray(x));
      if(ok){try{localStorage.setItem(CACHE_KEY,JSON.stringify(fresh))}catch(e){}setData(fresh);}
      else{let c=null;try{c=JSON.parse(localStorage.getItem(CACHE_KEY)||'null')}catch(e){}setData(c||fresh);}
    }catch(e){console.error(e)}
    setLoading(false);
  };

  const login=()=>{supa.auth.getUser().then(({data:d})=>{if(d?.user){setAuth(d.user);loadData(d.user);}})};
  const logout=()=>{try{localStorage.removeItem(CACHE_KEY)}catch(e){}supa.auth.signOut();setAuth(null);setRole(null)};

  // ── Hooks supplémentaires (avant tout return conditionnel) ──
  const [showUserMenu,setShowUserMenu]=useState(false);
  const [showMore,setShowMore]=useState(false);

  if(!auth)return <Login onLogin={login}/>;

  const impayes167k=(data.reports||[]).some(r=>(r.reste_a_payer||0)>0);

  const TABS=[
    {id:'dashboard',label:'Accueil',icon:'home',titre:'Accueil'},
    {id:'membres',label:'Membres',icon:'users',titre:'Membres'},
    {id:'tontine',label:'Tontine',icon:'cycle',titre:'Tontine'},
    {id:'prets',label:'Prêts',icon:'loan',titre:'Prêts'},
    {id:'reunions',label:'Réunions',icon:'calendar',titre:'Réunions'},
    {id:'detail',label:'Saisie AG',icon:'clipboard',titre:'Saisie AG'},
    {id:'synthese',label:'Synthèse',icon:'chart',titre:'Synthèse'},
    {id:'reports',label:'Impayés',icon:'alert',titre:'Impayés'},
    {id:'reception',label:'Réception',icon:'house',titre:'Réception'},
    {id:'communique',label:'Communiqué',icon:'megaphone',titre:'Communiqué'},
    {id:'assistant',label:'Assistant',icon:'sparkles',titre:'Assistant',ai:true},
  ];
  const courant=TABS.find(t=>t.id===activeTab)||TABS[0];
  const BNAV=['dashboard','membres','prets','reunions'];
  const MORE_TABS=TABS.filter(t=>!BNAV.includes(t.id));
  const pretsRetard=(data.prets||[]).some(p=>statutPret(p)==='retard');
  const aller=(id)=>{setActiveTab(id);setShowMore(false);setShowUserMenu(false);const m=document.querySelector('.app-main');if(m)m.scrollTop=0;};

  const initiales=(_userEmail||'SG').split('@')[0].slice(0,2).toUpperCase();

  return(
    <>
      <div className="app-shell">
      {offline&&<div className="offline-banner">Hors ligne · dernières données enregistrées</div>}

      {/* ── En-tête : identité + titre de l'écran ── */}
      <header className="app-header">
        <div className="hdr-brand">
          <img className="hdr-logo" src="/assets/logo.webp" alt="" width="34" height="34"/>
          <div className="hdr-titles"><div className="hdr-kicker">FABAMA · 2026</div><div className="hdr-title">{courant.titre}</div></div>
        </div>
        <div className="header-right">
          {impayes167k&&<button className="header-icon" title="Impayés à recouvrer" aria-label="Voir les impayés" onClick={()=>aller('reports')}><Icon n="bell"/><span className="dot"/></button>}
          <button className="header-avatar" aria-label="Mon compte" aria-expanded={showUserMenu} onClick={()=>setShowUserMenu(!showUserMenu)}>
            {initiales}
            <div className={`user-dropdown${showUserMenu?' open':''}`} onClick={e=>e.stopPropagation()}>
              <p><b>{role&&role!=='membre'?role:'Membre'}</b>{_userEmail}</p>
              <button onClick={()=>{setShowUserMenu(false);logout()}}><Icon n="logout" size="sm"/>Déconnexion</button>
            </div>
          </button>
        </div>
      </header>

      {/* ── Navigation latérale (ordinateur) ── */}
      <nav className="tabs-nav" aria-label="Navigation principale">
        {TABS.map((t,i)=>(
          <React.Fragment key={t.id}>
            {i===5&&<div className="nav-group">Gestion</div>}
            <button className={`tab-btn${activeTab===t.id?' active':''}`} aria-current={activeTab===t.id?'page':undefined} onClick={()=>aller(t.id)}><Icon n={t.icon}/>{t.label}</button>
          </React.Fragment>
        ))}
      </nav>

      {/* ── Contenu scrollable ── */}
      <main className="app-main">
      {loading?<Loading/>:(
        <>
          {activeTab==='dashboard'&&<TabDashboard data={data} setActiveTab={setActiveTab}/>}
          {activeTab==='membres'&&<TabMembres data={data} role={role}/>}
          {activeTab==='tontine'&&<TabTontine data={data}/>}
          {activeTab==='prets'&&<TabPrets data={data}/>}
          {activeTab==='reunions'&&<TabReunions data={data}/>}
          {activeTab==='detail'&&<TabDetailAG data={data} onSaved={()=>loadData(auth,{silent:true})}/>}
          {activeTab==='synthese'&&<TabSynthese data={data}/>}
          {activeTab==='reports'&&<TabReports data={data}/>}
          {activeTab==='reception'&&<TabReception data={data}/>}
          {activeTab==='communique'&&<TabCommunique data={data} onSaved={()=>loadData(auth,{silent:true})}/>}
          {activeTab==='assistant'&&<TabAssistant data={data}/>}
        </>
      )}
      </main>

      {/* ── Navigation bas (mobile) + panneau « Plus » ── */}
      {showMore&&<div className="sheet-overlay" onClick={()=>setShowMore(false)}/>}
      {showMore&&(
        <div className="sheet" role="dialog" aria-label="Autres écrans">
          <div className="sheet-grab"/>
          <div className="sheet-title">Autres écrans</div>
          <div className="sheet-grid">
            {MORE_TABS.map(t=>(
              <button key={t.id} className={`sheet-item${activeTab===t.id?' active':''}`} onClick={()=>aller(t.id)}>
                <span className="sq"><Icon n={t.icon}/></span>{t.label}
              </button>
            ))}
          </div>
        </div>
      )}
      <nav className="bottom-nav" aria-label="Navigation">
        <div className="bottom-nav-items">
          {BNAV.map(id=>{const t=TABS.find(x=>x.id===id);return(
            <button key={id} className={`bnav-btn${activeTab===id&&!showMore?' active':''}`} aria-current={activeTab===id?'page':undefined} onClick={()=>aller(id)}>
              <span className="bnav-pill"><Icon n={t.icon}/></span>
              <span className="bnav-label">{t.label}</span>
              {id==='prets'&&pretsRetard&&<span className="bnav-badge"/>}
            </button>);})}
          <button className={`bnav-btn${showMore||MORE_TABS.some(t=>t.id===activeTab)?' active':''}`} aria-expanded={showMore} onClick={()=>setShowMore(!showMore)}>
            <span className="bnav-pill"><Icon n="more"/></span>
            <span className="bnav-label">Plus</span>
          </button>
        </div>
      </nav>
      </div>
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
