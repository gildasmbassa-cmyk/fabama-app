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
function Alert({type='info',children}){return <div className={`alert ${type}`}>{children}</div>}

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
          <div className="user-icon-wrap">👥</div>
          <h2>Bienvenue ! 👋</h2>
          <p>Connectez-vous à votre <strong>espace communautaire</strong></p>
        </div>
        <div className="form-group">
          <label>Identifiant</label>
          <div className="input-wrap">
            <span className="input-icon">👤</span>
            <input type="text" value={login} onChange={e=>setLogin(e.target.value)} placeholder="SG / PRESIDENT / TRESORIERE" onKeyDown={e=>e.key==='Enter'&&submit()}/>
          </div>
        </div>
        <div className="form-group">
          <label>Mot de passe</label>
          <div className="input-wrap">
            <span className="input-icon">🔒</span>
            <input type={showPass?'text':'password'} value={pass} onChange={e=>setPass(e.target.value)} placeholder="Entrez votre mot de passe" onKeyDown={e=>e.key==='Enter'&&submit()}/>
            <button className="pw-toggle" onClick={()=>setShowPass(!showPass)} type="button">{showPass?'🙈':'👁'}</button>
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
          <span>🔒</span>
          <span>{loading?'Connexion…':'Se connecter'}</span>
          {!loading&&<span>→</span>}
        </button>
        <div className="login-secure">🛡 Accès sécurisé</div>
        {err&&<div className="login-error">⚠️ {err}</div>}
      </div>
      <div className="login-footer">
        <div className="footer-icon">👥</div>
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
        <h2>Bonjour, Gildas 👋</h2>
        <p>Voici la situation financière de votre tontine</p>
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
        <div className="kpi-card" onClick={()=>setActiveTab('membres')} style={{cursor:'pointer'}}>
          <span className="kpi-icon">👥</span>
          <div className="kpi-val green">{membresActifs}</div>
          <div className="kpi-desc">Membres actifs</div>
        </div>
        <div className="kpi-card" onClick={()=>setActiveTab('tontine')} style={{cursor:'pointer'}}>
          <span className="kpi-icon">🏦</span>
          <div className="kpi-val green">120 000</div>
          <div className="kpi-desc">FCFA pot mensuel</div>
        </div>
        <div className="kpi-card" onClick={()=>setActiveTab('prets')} style={{cursor:'pointer'}}>
          <span className="kpi-icon">⚠️</span>
          <div className="kpi-val red">{pretsEnRetard}</div>
          <div className="kpi-desc">Prêts en retard</div>
        </div>
        <div className="kpi-card" onClick={()=>setActiveTab('reports')} style={{cursor:'pointer'}}>
          <span className="kpi-icon">💸</span>
          <div className="kpi-val gold">{fmt(impayes)}</div>
          <div className="kpi-desc">FCFA impayés 2025</div>
        </div>
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
          <div style={{fontSize:12,color:'var(--green)',fontWeight:700}}>{dernierRang?'✅ Reçu':''}</div>
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
          <div className="next-meeting-tag">⏳ Date à confirmer</div>
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
  const membresStatic=[]; // données nominatives retirées du code public — repli : cache local du dernier chargement
  const raw=data.membres||[];
  const membres=raw.length>0?raw:membresStatic;
  const [search,setSearch]=useState('');
  const filtres=membres.filter(m=>m.nom?.toLowerCase().includes(search.toLowerCase()));
  const exportCSV=()=>{
    const rows=[['N°','Nom','Téléphone','Rôle','Statut'],...filtres.map((m,i)=>[i+1,m.nom,m.telephone||'',m.role||'Membre',m.statut||''])];
    const csv=rows.map(r=>r.join(';')).join('\n');
    const a=document.createElement('a');a.href='data:text/csv;charset=utf-8,\uFEFF'+encodeURIComponent(csv);a.download='fabama_membres.csv';a.click();
  };
  return(
    <div className="tab-content">
      <div className="card">
        <div style={{display:'flex',gap:10,marginBottom:14,flexWrap:'wrap'}}>
          <input style={{flex:1,minWidth:180,padding:'8px 12px',border:'1.5px solid var(--border)',borderRadius:8,fontSize:13}} placeholder="🔍 Rechercher un membre…" value={search} onChange={e=>setSearch(e.target.value)}/>
          <button className="btn btn-secondary btn-sm" onClick={exportCSV}>⬇️ CSV</button>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>#</th><th>Nom complet</th><th>Téléphone</th><th>Rôle</th><th>Statut</th></tr></thead>
            <tbody>
              {filtres.map((m,i)=>(
                <tr key={m.id}>
                  <td>{i+1}</td>
                  <td><b>{m.nom}</b></td>
                  <td>{m.telephone||'—'}</td>
                  <td>{m.role||'Membre'}</td>
                  <td><span className={`badge ${m.statut==='actif'?'ok':m.statut==='debiteur'?'danger':'warn'}`}>{m.statut||'—'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{fontSize:12,color:'var(--muted)',marginTop:10}}>{filtres.length} membre(s) affiché(s)</p>
      </div>
    </div>
  );
}

// ─── TONTINE ──────────────────────────────────────────────────────────────────
function TabTontine({data}){
  const {tontine=[],reunions=[]}=data;
  const rangsNorm=(tontine||[]).map(t=>({
    rang:t.rang,
    mois:MOIS[t.rang]||'',
    beneficiaire:t.beneficiaire_nom||t.beneficiaire||'',
    // Rang N = AG du mois N : reçu dès que la date de cette AG est passée
    statut:(reunions.length>0&&agTenue(reunions,t.rang))?'Reçu':(t.statut||'À venir'),
    date_paiement:t.date_paiement||null,
  }));
  const rangsDB=rangsNorm;
  const multi=Object.entries(rangsDB.reduce((a,r)=>{a[r.beneficiaire]=(a[r.beneficiaire]||0)+1;return a;},{})).filter(([n,c])=>c>1&&!/^FABAMA/.test(n)).map(([n])=>n);
  return(
    <div className="tab-content">
      <Alert type="info">💡 Pot fixe : <b>120 000 FCFA/mois</b> · Mise : <b>10 000 FCFA/rang</b> · 12 rangs{multi.length?` · ${multi.join(' et ')} : 2 rangs chacun`:''}</Alert>
      <div className="card">
        <div className="card-title">🏦 Rangs Tontine 2026</div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Rang</th><th>Mois</th><th>Bénéficiaire</th><th>Mise</th><th>Pot</th><th>Statut</th></tr></thead>
            <tbody>
              {rangsDB.map((r,i)=>(
                <tr key={i}>
                  <td><b>#{r.rang}</b></td>
                  <td>{r.mois}</td>
                  <td><b>{r.beneficiaire}</b></td>
                  <td>10 000 F</td>
                  <td><b>120 000 F</b></td>
                  <td><span className={`badge ${r.statut==='Reçu'||r.statut==='recu'?'ok':'warn'}`}>{r.statut==='Reçu'||r.statut==='recu'?'✅ Reçu':'⏳ À venir'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── PRÊTS ────────────────────────────────────────────────────────────────────
function TabPrets({data}){
  const {prets=[]}=data;
  const pretsStatic=[]; // données nominatives retirées du code public — repli : cache local du dernier chargement
  // Normaliser données Supabase vers format interne
  const moisActuel=moisCourant();
  const pretsNorm=prets.map(p=>{
    const statut=statutPret(p);
    const moisRetard=statut==='retard'?Math.max(0,(moisActuel-(p.mois_limite||0))):0;
    const penalite=statut==='retard'?Math.round((p.capital-(p.montant_rembourse||0))*0.10*moisRetard):0;
    const solde=Math.max(0,(p.capital||0)-(p.montant_rembourse||0));
    return {
      membre:p.membre_nom||p.membre||'',
      type:p.type_credit||p.type||'',
      capital:p.capital||0,
      mois_emprunt:MOIS[p.mois_emprunt]||p.mois_emprunt||'',
      statut:statut==='solde'||statut==='soldé'?'solde':statut,
      mois_retard:moisRetard,
      penalite:penalite,
      total_du:solde+penalite,
    };
  });
  const liste=(pretsNorm.length>0&&pretsNorm.some(p=>p.capital>0))?pretsNorm:pretsStatic;
  const totalDu=liste.reduce((s,p)=>s+(p.total_du||0),0);
  return(
    <div className="tab-content">
      <div className="stats-grid">
        <div className="stat-card red"><div className="stat-val">{fmt(totalDu)}</div><div className="stat-label">FCFA Total dû en cours</div></div>
        <div className="stat-card gold"><div className="stat-val">{liste.filter(p=>p.statut==='retard').length}</div><div className="stat-label">Prêts en retard</div></div>
        <div className="stat-card"><div className="stat-val">{liste.filter(p=>p.statut==='encours').length}</div><div className="stat-label">Prêts dans les délais</div></div>
      </div>
      <div className="card">
        <div className="card-title">💰 Prêts & Remboursements 2026</div>
        {(data.reports||[]).length>0&&<Alert type="warn">⚠️ Reports 2025 non apurés : <b>{fmt((data.reports||[]).reduce((s,r)=>s+(r.reste_a_payer||0),0))} FCFA</b></Alert>}
        <div className="table-wrap">
          <table>
            <thead><tr><th>Membre</th><th>Type</th><th>Capital</th><th>Emprunté</th><th>Statut</th><th>Retard</th><th>Pénalité</th><th>Total dû</th></tr></thead>
            <tbody>
              {liste.map((p,i)=>(
                <tr key={i}>
                  <td><b>{p.membre}</b></td>
                  <td><span className="badge info">{p.type}</span></td>
                  <td>{fmt(p.capital)} F</td>
                  <td>{p.mois_emprunt}</td>
                  <td><span className={`badge ${p.statut==='retard'?'danger':p.statut==='solde'?'ok':'warn'}`}>{p.statut==='retard'?'🚨 Retard':p.statut==='solde'?'✅ Soldé':'⏳ En cours'}</span></td>
                  <td>{p.mois_retard>0?`${p.mois_retard} mois`:'—'}</td>
                  <td>{p.penalite>0?<span style={{color:'var(--red)'}}>{fmt(p.penalite)} F</span>:'—'}</td>
                  <td><b>{fmt(p.total_du)} F</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
  return(
    <div className="tab-content">
      <div className="card">
        <div className="card-title">📅 Bilan des réunions 2026</div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Mois</th><th>Date</th><th>Entrées</th><th>Sorties</th><th>Solde</th><th>Bénéficiaire tontine</th></tr></thead>
            <tbody>
              {MOIS.slice(1).map((m,i)=>{
                const r=liste.find(x=>x.mois===i+1);
                if(!r)return <tr key={i}><td><b>{m}</b></td><td><span className="badge warn">À venir</span></td><td>—</td><td>—</td><td>—</td><td>—</td></tr>;
                return(
                  <tr key={i}>
                    <td><b>{m}</b></td>
                    <td>{r.date_reunion}</td>
                    <td style={{color:'var(--green)'}}><b>{fmt(r.total_entrees)} F</b></td>
                    <td style={{color:'var(--red)'}}>{fmt(r.total_sorties)} F</td>
                    <td><b>{fmt(r.solde_mois)} F</b></td>
                    <td>{r.beneficiaire_tontine}</td>
                  </tr>
                );
              })}
              <tr style={{background:'var(--green-light)'}}>
                <td colSpan={2}><b>TOTAL S1</b></td>
                <td style={{color:'var(--green)'}}><b>{fmt(total_e)} F</b></td>
                <td style={{color:'var(--red)'}}><b>{fmt(total_s)} F</b></td>
                <td><b>{fmt(total_e-total_s)} F</b></td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── DÉTAIL AG ────────────────────────────────────────────────────────────────
function TabDetailAG({data,onSaved}){
  const {cotisations=[]}=data;
  const [moisSel,setMoisSel]=useState(new Date().getMonth()+1||8);
  const [mode,setMode]=useState('voir'); // 'voir' | 'saisir'
  const [saving,setSaving]=useState(false);
  const [saveMsg,setSaveMsg]=useState('');

  // Formulaire de saisie
  const MEMBRES_LISTE=(data.membres||[]).map(m=>m.nom).filter(Boolean); // liste lue en base

  const emptyRow=(nom)=>({
    membre_nom:nom,epargne:0,loto:0,tontine_versee:0,
    remboursement:0,interets:0,emprunt:0,aide:0,frais_collation:0
  });

  const [rows,setRows]=useState(MEMBRES_LISTE.map(emptyRow));

  const updateRow=(i,field,val)=>{
    const r=[...rows];
    r[i]={...r[i],[field]:Number(val)||0};
    setRows(r);
  };

  const totalRow=(r)=>r.epargne+r.loto+r.tontine_versee+r.remboursement+r.interets+r.frais_collation;
  const totalCol=(field)=>rows.reduce((s,r)=>s+(r[field]||0),0);
  const totalEntrees=rows.reduce((s,r)=>s+totalRow(r),0);

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
      const payload=aEnregistrer.map(r=>{
        const o={annee,mois:moisSel,membre_id:idParNom[r.membre_nom]};
        CHAMPS.forEach(k=>{o[k]=Number(r[k])||0;});
        return o;
      });
      if(payload.length===0){setSaveMsg('⚠️ Aucune donnée à enregistrer.');setSaving(false);return;}
      await supaFetch('/rest/v1/cotisations?on_conflict=annee,mois,membre_id',{
        method:'POST',
        headers:{'Prefer':'resolution=merge-duplicates,return=representation'},
        body:JSON.stringify(payload)
      });
      setSaveMsg(`✅ ${payload.length} ligne(s) enregistrée(s).`);
      onSaved&&onSaved();
      setTimeout(()=>setSaveMsg(''),4000);
    }catch(e){
      const m=String(e.message||'');
      setSaveMsg(/row-level security|permission/i.test(m)?'🔒 Enregistrement réservé à la Trésorière et au Secrétaire général.':'❌ Erreur : '+m+' (aucune donnée supprimée)');
    }
    setSaving(false);
  };

  const cotsStatic=[]; // données nominatives retirées du code public — repli : cache local du dernier chargement

  const cotsMonth=(cotisations.length>0?cotisations:cotsStatic).filter(c=>c.mois===moisSel);

  return(
    <div className="tab-content">
      <div className="card">
        {/* Sélecteur mois + boutons */}
        <div style={{display:'flex',gap:8,marginBottom:14,flexWrap:'wrap',alignItems:'center'}}>
          <select value={moisSel} onChange={e=>{setMoisSel(Number(e.target.value));setMode('voir');}}
            style={{flex:1,minWidth:140,padding:'8px 12px',border:'1.5px solid var(--border)',borderRadius:8,fontSize:13}}>
            {MOIS.slice(1).map((m,i)=><option key={i} value={i+1}>{m} 2026</option>)}
          </select>
          <button className={`btn btn-sm ${mode==='voir'?'btn-primary':'btn-secondary'}`} onClick={()=>setMode('voir')}>📋 Voir</button>
          <button className={`btn btn-sm ${mode==='saisir'?'btn-primary':'btn-secondary'}`} onClick={()=>{
            // Charger données existantes si disponibles
            if(cotsMonth.length>0){
              const loaded=MEMBRES_LISTE.map(nom=>{
                const existing=cotsMonth.find(c=>c.membre_nom===nom);
                return existing?{
                  membre_nom:nom,
                  epargne:existing.epargne||0,
                  loto:existing.loto||0,
                  tontine_versee:existing.tontine_versee||0,
                  remboursement:existing.remboursement||0,
                  interets:existing.interets||0,
                  emprunt:existing.emprunt||0,
                  aide:existing.aide||0,
                  frais_collation:existing.frais_collation||0,
                  inscription:existing.inscription||0,
                  secours:existing.secours||0,
                }:emptyRow(nom);
              });
              setRows(loaded);
            }
            setMode('saisir');
          }} style={{background:mode==='saisir'?'var(--gold)':'',color:mode==='saisir'?'#fff':''}}>{cotsMonth.length>0?'✏️ Modifier':'✏️ Saisir'}</button>
        </div>

        {/* ── MODE SAISIE ── */}
        {mode==='saisir'&&(
          <>
            <Alert type="warn">✏️ Mode saisie — <b>{MOIS[moisSel]} 2026</b>. Remplissez les montants puis appuyez sur <b>Enregistrer</b>.</Alert>
            <div style={{overflowX:'auto',marginBottom:12}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                <thead>
                  <tr style={{background:'var(--green)',color:'#fff'}}>
                    <th style={{padding:'8px',textAlign:'left',minWidth:140,position:'sticky',left:0,background:'var(--green)'}}>Membre</th>
                    <th style={{padding:'8px',minWidth:70}}>Épargne</th>
                    <th style={{padding:'8px',minWidth:70}}>Kola</th>
                    <th style={{padding:'8px',minWidth:70}}>Tontine</th>
                    <th style={{padding:'8px',minWidth:70}}>Remb.</th>
                    <th style={{padding:'8px',minWidth:70}}>Intérêts</th>
                    <th style={{padding:'8px',minWidth:70}}>Collation</th>
                    <th style={{padding:'8px',minWidth:70,background:'var(--green2)'}}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r,i)=>(
                    <tr key={i} style={{borderBottom:'1px solid var(--border)',background:i%2===0?'#fff':'#f9fbf9'}}>
                      <td style={{padding:'6px 8px',fontWeight:600,fontSize:11,position:'sticky',left:0,background:i%2===0?'#fff':'#f9fbf9'}}>{r.membre_nom}</td>
                      {['epargne','loto','tontine_versee','remboursement','interets','frais_collation'].map(f=>(
                        <td key={f} style={{padding:'4px'}}>
                          <input type="number" value={r[f]||''} min="0" step="500"
                            onChange={e=>updateRow(i,f,e.target.value)}
                            style={{width:'100%',padding:'5px 4px',border:'1px solid var(--border)',borderRadius:4,fontSize:12,textAlign:'right'}}/>
                        </td>
                      ))}
                      <td style={{padding:'6px 8px',fontWeight:700,color:'var(--green)',textAlign:'right'}}>{fmt(totalRow(r))}</td>
                    </tr>
                  ))}
                  <tr style={{background:'var(--green-light)',fontWeight:700}}>
                    <td style={{padding:'8px',position:'sticky',left:0,background:'var(--green-light)'}}>TOTAL</td>
                    {['epargne','loto','tontine_versee','remboursement','interets','frais_collation'].map(f=>(
                      <td key={f} style={{padding:'8px',textAlign:'right',fontSize:12}}>{fmt(totalCol(f))}</td>
                    ))}
                    <td style={{padding:'8px',textAlign:'right',color:'var(--green)'}}>{fmt(totalEntrees)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            {/* ── Section Sorties : Emprunt + Aide ── */}
            <div style={{marginBottom:14}}>
              <div style={{fontSize:12,fontWeight:700,color:'var(--red)',textTransform:'uppercase',letterSpacing:'.5px',marginBottom:8}}>↓ Sorties — Emprunts & Aides</div>
              <div style={{overflowX:'auto',borderRadius:8,border:'1px solid #fcc'}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                  <thead>
                    <tr style={{background:'var(--red)',color:'#fff'}}>
                      <th style={{padding:'8px',textAlign:'left',minWidth:140,position:'sticky',left:0,background:'var(--red)'}}>Membre</th>
                      <th style={{padding:'8px',minWidth:90}}>Emprunt</th>
                      <th style={{padding:'8px',minWidth:90}}>Aide reçue</th>
                      <th style={{padding:'8px',minWidth:90,background:'#a93226'}}>Total sorties</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r,i)=>(
                      <tr key={i} style={{borderBottom:'1px solid #fdd',background:i%2===0?'#fff':'#fff8f8'}}>
                        <td style={{padding:'6px 8px',fontWeight:600,fontSize:11,position:'sticky',left:0,background:i%2===0?'#fff':'#fff8f8'}}>{r.membre_nom}</td>
                        <td style={{padding:'4px'}}>
                          <input type="number" value={r.emprunt||''} min="0" step="500"
                            onChange={e=>updateRow(i,'emprunt',e.target.value)}
                            style={{width:'100%',padding:'5px 4px',border:'1px solid #fcc',borderRadius:4,fontSize:12,textAlign:'right'}}/>
                        </td>
                        <td style={{padding:'4px'}}>
                          <input type="number" value={r.aide||''} min="0" step="500"
                            onChange={e=>updateRow(i,'aide',e.target.value)}
                            style={{width:'100%',padding:'5px 4px',border:'1px solid #fcc',borderRadius:4,fontSize:12,textAlign:'right'}}/>
                        </td>
                        <td style={{padding:'6px 8px',fontWeight:700,color:'var(--red)',textAlign:'right'}}>{fmt((r.emprunt||0)+(r.aide||0))}</td>
                      </tr>
                    ))}
                    <tr style={{background:'#fde',fontWeight:700}}>
                      <td style={{padding:'8px',position:'sticky',left:0,background:'#fde'}}>TOTAL</td>
                      <td style={{padding:'8px',textAlign:'right'}}>{fmt(totalCol('emprunt'))}</td>
                      <td style={{padding:'8px',textAlign:'right'}}>{fmt(totalCol('aide'))}</td>
                      <td style={{padding:'8px',textAlign:'right',color:'var(--red)'}}>{fmt(totalCol('emprunt')+totalCol('aide'))}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── Récapitulatif Entrées / Sorties ── */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,margin:'14px 0',padding:'14px',background:'var(--green-light)',borderRadius:10,border:'1px solid #b8dbb8'}}>
              <div>
                <div style={{fontSize:11,fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.5px',marginBottom:4}}>↑ Entrées totales</div>
                <div style={{fontSize:20,fontWeight:900,color:'var(--green)'}}>
                  {fmt(rows.reduce((s,r)=>s+r.epargne+r.loto+r.tontine_versee+r.remboursement+r.interets+r.frais_collation+r.inscription+r.secours,0))} F
                </div>
              </div>
              <div>
                <div style={{fontSize:11,fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.5px',marginBottom:4}}>↓ Sorties totales</div>
                <div style={{fontSize:20,fontWeight:900,color:'var(--red)'}}>
                  {fmt(rows.reduce((s,r)=>s+r.emprunt+r.aide,0))} F
                </div>
              </div>
              <div>
                <div style={{fontSize:11,fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.5px',marginBottom:4}}>Membres saisis</div>
                <div style={{fontSize:20,fontWeight:900,color:'var(--text)'}}>
                  {rows.filter(r=>totalRow(r)>0||r.emprunt>0||r.aide>0).length} / {rows.length}
                </div>
              </div>
              <div>
                <div style={{fontSize:11,fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.5px',marginBottom:4}}>Solde net</div>
                <div style={{fontSize:20,fontWeight:900,color:'#2980b9'}}>
                  {fmt(rows.reduce((s,r)=>s+r.epargne+r.loto+r.tontine_versee+r.remboursement+r.interets+r.frais_collation+r.inscription+r.secours-r.emprunt-r.aide,0))} F
                </div>
              </div>
            </div>
            <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}>
              <button className="btn btn-primary" onClick={saveToSupabase} disabled={saving} style={{background:'var(--gold)',minWidth:180}}>
                {saving?'⏳ Enregistrement…':'💾 Enregistrer dans la base'}
              </button>
              <button className="btn btn-secondary btn-sm" onClick={()=>setRows(MEMBRES_LISTE.map(emptyRow))}>🗑️ Effacer tout</button>
            </div>
            {saveMsg&&<div className={`alert ${saveMsg.startsWith('✅')?'success':saveMsg.startsWith('⚠️')?'warn':'danger'}`} style={{marginTop:12}}>{saveMsg}</div>}
          </>
        )}

        {/* ── MODE VISUALISATION ── */}
        {mode==='voir'&&(
          <>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
              <span style={{fontSize:13,color:'var(--muted)'}}>Total entrées : <b>{fmt(cotsMonth.reduce((s,c)=>s+(c.total||0),0))} F</b></span>
              <button className="btn btn-secondary btn-sm" onClick={()=>{
                const rows=[['Membre','Épargne','Kola','Tontine','Remb.','Intérêts','Emprunt','Aide','Collation','Total'],
                  ...cotsMonth.map(c=>[c.membre_nom,c.epargne||0,c.loto||0,c.tontine_versee||0,c.remboursement||0,c.interets||0,c.emprunt||0,c.aide||0,c.frais_collation||0,c.total||0])];
                const csv=rows.map(r=>r.join(';')).join('\n');
                const a=document.createElement('a');a.href='data:text/csv;charset=utf-8,\uFEFF'+encodeURIComponent(csv);
                a.download=`fabama_ag_${MOIS[moisSel]}.csv`;a.click();
              }}>⬇️ CSV</button>
            </div>
            {cotsMonth.length===0?
              <Alert type="info">Aucune cotisation enregistrée pour {MOIS[moisSel]} 2026. Utilisez le bouton <b>✏️ Saisir</b> pour entrer les données.</Alert>:
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Membre</th><th>Épargne</th><th>Kola</th><th>Tontine</th><th>Remb.</th><th>Intérêts</th><th>Emprunt</th><th>Aide</th><th>Collation</th><th>Total</th></tr></thead>
                  <tbody>
                    {cotsMonth.map((c,i)=>(
                      <tr key={i}>
                        <td><b style={{fontSize:12}}>{c.membre_nom}</b></td>
                        <td>{fmt(c.epargne)}</td><td>{fmt(c.loto)}</td><td>{fmt(c.tontine_versee)}</td>
                        <td>{fmt(c.remboursement)}</td><td>{fmt(c.interets)}</td>
                        <td style={{color:'var(--red)'}}>{c.emprunt?fmt(c.emprunt):'—'}</td>
                        <td style={{color:'var(--red)'}}>{c.aide?fmt(c.aide):'—'}</td>
                        <td>{fmt(c.frais_collation)}</td>
                        <td><b>{fmt(c.total)}</b></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            }
          </>
        )}
      </div>
    </div>
  );
}

// ─── SYNTHÈSE ─────────────────────────────────────────────────────────────────
function TabSynthese({data}){
  const synthese=calcSynthese(data);
  const syntheseStatic=[]; // données nominatives retirées du code public — repli : cache local du dernier chargement
  const liste=(synthese&&synthese.length>0)?synthese:syntheseStatic;
  const totalCotise=liste.reduce((s,m)=>s+(m.total_cotise||0),0);
  const exportCSV=()=>{
    const rows=[['Membre','Total cotisé','Épargne','Tontine','Emprunts','Réunions'],...liste.map(m=>[m.membre,m.total_cotise,m.epargne,m.tontine,m.emprunts,m.reunions])];
    const csv=rows.map(r=>r.join(';')).join('\n');
    const a=document.createElement('a');a.href='data:text/csv;charset=utf-8,\uFEFF'+encodeURIComponent(csv);a.download='fabama_synthese.csv';a.click();
  };
  return(
    <div className="tab-content">
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
        <div className="stat-card" style={{display:'inline-flex',flexDirection:'column',padding:'10px 16px'}}><div className="stat-val">{fmt(totalCotise)}</div><div className="stat-label">FCFA total cotisé</div></div>
        <button className="btn btn-secondary btn-sm" onClick={exportCSV}>⬇️ CSV</button>
      </div>
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Membre</th><th>Total cotisé</th><th>Épargne</th><th>Tontine</th><th>Emprunts</th><th>Réunions</th></tr></thead>
            <tbody>
              {liste.map((m,i)=>(
                <tr key={i}>
                  <td><b>{m.membre}</b></td>
                  <td><b>{fmt(m.total_cotise)} F</b></td>
                  <td>{fmt(m.epargne)} F</td>
                  <td>{m.tontine>0?<span style={{color:'var(--green)'}}><b>{fmt(m.tontine)} F</b></span>:'—'}</td>
                  <td>{m.emprunts>0?<span style={{color:'var(--red)'}}>{fmt(m.emprunts)} F</span>:'—'}</td>
                  <td><span className={`badge ${m.reunions==='6/6'?'ok':'warn'}`}>{m.reunions}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── REPORTS 2025 ─────────────────────────────────────────────────────────────
function TabReports({data={}}){
  const reports=(data.reports||[]).filter(r=>(r.reste_a_payer||0)>0);
  const total=reports.reduce((s,r)=>s+(r.reste_a_payer||0),0);
  return(
    <div className="tab-content">
      <Alert type={total>0?'danger':'info'}>{total>0?<>🚨 Total à recouvrer : <b>{fmt(total)} FCFA</b></>:'✅ Aucun report impayé'}</Alert>
      <div className="card">
        <div className="card-title">📋 Reports impayés</div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Membre</th><th>Année</th><th>Type</th><th>Dû</th><th>Pénalité</th><th>Remboursé</th><th>Reste</th></tr></thead>
            <tbody>
              {reports.map((r,i)=>(
                <tr key={i}>
                  <td><b>{r.membre_nom}</b></td><td>{r.annee_source}</td><td>{r.type_report}</td>
                  <td>{fmt(r.montant_du)} F</td><td>{fmt(r.penalite)} F</td><td>{fmt(r.montant_rembourse)} F</td>
                  <td><b style={{color:'var(--red)'}}>{fmt(r.reste_a_payer)} F</b></td>
                </tr>
              ))}
              {reports.length>0&&<tr style={{background:'var(--green-light)'}}><td colSpan={6}><b>TOTAL</b></td><td><b>{fmt(total)} F</b></td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── RÉCEPTION ────────────────────────────────────────────────────────────────
function TabReception({data={}}){
  const {reunions=[]}=data;
  // Statut dérivé de la date de l'AG (enregistrée via le Communiqué) : passée → Tenu
  const next=prochaineAG(reunions);
  const cal=MOIS.slice(1).map((mois,i)=>{
    const m=i+1,hote=hoteDe(data,m)||'—';
    const statut=hote==='LIBRE'?'libre':agTenue(reunions,m)?'done':m===next?'next':'';
    return {mois,hote,statut};
  });
  return(
    <div className="tab-content">
      {next<=12
        ?<Alert type="info">📅 Prochain hôte : <b>{hoteDe(data,next)||'À confirmer'}</b> — {MOIS[next]} 2026</Alert>
        :<Alert type="info">✅ Toutes les AG 2026 sont tenues</Alert>}
      <div className="reception-grid">
        {cal.map((c,i)=>(
          <div key={i} className={`reception-card ${c.statut==='done'?'done':c.statut==='current'||c.statut==='next'?'current':''}`}>
            <div className="month">{c.mois} 2026</div>
            <div className="host">{c.hote}</div>
            <div className="status">
              {c.statut==='done'&&<span className="badge ok">✅ Tenu</span>}
              {c.statut==='current'&&<span className="badge warn">🏠 En cours</span>}
              {c.statut==='next'&&<span className="badge info">📍 Prochain</span>}
              {c.statut==='libre'&&<span className="badge">☀️ Libre</span>}
              {!c.statut&&<span className="badge warn">⏳ À venir</span>}
            </div>
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
      <div className="card">
        <div className="card-title">📢 Générateur de Communiqué WhatsApp</div>
        <div className="form-row">
          <div className="field">
            <label>Mois</label>
            <select value={mois} onChange={e=>changeMois(Number(e.target.value))}>
              {MOIS.slice(1).map((m,i)=><option key={i} value={i+1}>{m} 2026</option>)}
            </select>
          </div>
          <div className="field">
            <label>Heure</label>
            <input value={heure} onChange={e=>setHeure(e.target.value)} placeholder="16h00"/>
          </div>
        </div>
        <div className="field">
          <label>Famille hôte</label>
          <input value={hote} onChange={e=>setHote(e.target.value)} placeholder="Nom de famille"/>
        </div>
        <div className="field">
          <label>Date de la réunion</label>
          <input type="date" value={date} onChange={e=>setDate(e.target.value)}/>
        </div>
        <div className="field">
          <label>Lieu</label>
          <input value={lieu} onChange={e=>setLieu(e.target.value)} placeholder="Quartier, adresse…"/>
        </div>
        <div className="field">
          <label>Repères / Itinéraire</label>
          <input value={reperes} onChange={e=>setReperes(e.target.value)} placeholder="Repères pour trouver le lieu"/>
        </div>
        <div style={{display:'flex',gap:10,marginBottom:16,flexWrap:'wrap'}}>
          <button className="btn btn-primary" onClick={generate}>📄 Générer</button>
          {texte&&<button className="btn" style={{background:copied?'var(--green)':'#1DA1F2',color:'#fff'}} onClick={copy}>{copied?'✅ Copié !':'📋 Copier pour WhatsApp'}</button>}
        </div>
        {saveMsg&&<div style={{fontSize:13,marginBottom:12,color:saveMsg.startsWith('⚠️')?'var(--red)':'var(--green)'}}>{saveMsg}</div>}
        {texte&&(
          <div style={{background:'#e9fbe9',border:'1px solid #b2dfb2',borderRadius:10,padding:'16px',fontFamily:'monospace',fontSize:13,lineHeight:1.7,whiteSpace:'pre-wrap',wordBreak:'break-word',overflowX:'hidden'}}>
            {texte}
          </div>
        )}
      </div>
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

  const QUICKIES=[
    {label:'💰 Solde caisse',q:'Quel est le solde actuel de la caisse FABAMA ?'},
    {label:'🚨 Prêts en retard',q:'Qui a des prêts en retard de remboursement ?'},
    {label:'⚠️ Reports 2025',q:'Détaille les reports impayés de 2025'},
    {label:'🏦 Rangs tontine',q:'Donne-moi tous les rangs de tontine 2026'},
    {label:'📊 Bilan S1',q:'Quel est le bilan financier du premier semestre 2026 ?'},
    {label:'💎 Top épargne',q:'Quels sont les 5 membres qui ont le plus épargné en 2026 ?'},
    {label:'📢 Communiqué',q:`Rédige le communiqué officiel de la prochaine AG (${MOIS[Math.min(prochaineAG(data.reunions),12)]} 2026, chez ${hoteDe(data,Math.min(prochaineAG(data.reunions),12))})`},
    {label:'📋 Absents juin',q:'Quels membres n\'ont pas cotisé en juin 2026 ?'},
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
      const reply=r.status===401?'🔒 Session expirée : reconnecte-toi.'
        :r.status===403?'🔒 Assistant réservé au bureau FABAMA.'
        :(d.content?.[0]?.text||('Erreur : '+(d.error?.message||d.error||'réponse vide.')));
      setMessages([...newMsgs,{role:'assistant',content:reply}]);
    }catch(e){
      setMessages([...newMsgs,{role:'assistant',content:'🚨 Erreur de connexion. Vérifie ta connexion internet.'}]);
    }
    setLoading(false);
  };

  return(
    <div className="tab-content">
      <div className="ai-header">
        <div className="ai-logo">SG</div>
        <div>
          <h2>Assistant Secrétaire Général</h2>
          <p>Pose tes questions sur les finances, membres, prêts et tontine FABAMA 2026</p>
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
            <div style={{textAlign:'center',padding:'30px 20px',color:'var(--muted)'}}>
              <div style={{fontSize:32,marginBottom:8}}>🤖</div>
              <p style={{fontSize:13}}>Bonjour Gildas. Je connais toutes les données FABAMA janv–juin 2026.<br/>Posez votre question ou utilisez les raccourcis ci-dessus.</p>
            </div>
          )}
          {messages.map((m,i)=>(
            <div key={i} className={`ai-msg ${m.role}`}>
              <div className="ai-avatar">{m.role==='user'?'SG':'AI'}</div>
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
              <div className="ai-avatar">AI</div>
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

  const loadData=async(user)=>{
    setLoading(true);
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
    {id:'dashboard',label:'📊 Tableau de bord'},
    {id:'membres',label:'👥 Membres'},
    {id:'tontine',label:'🏦 Tontine'},
    {id:'prets',label:'💰 Prêts'},
    {id:'reunions',label:'📅 Réunions'},
    {id:'detail',label:'📋 Détail AG'},
    {id:'synthese',label:'📈 Synthèse'},
    {id:'reports',label:'⚠️ Reports 2025'},
    {id:'reception',label:'🏠 Réception'},
    {id:'communique',label:'📢 Communiqué'},
    {id:'assistant',label:'🤖 Assistant IA',ai:true},
  ];

  const BNAV=[
    {id:'dashboard',icon:'🏠',label:'Accueil'},
    {id:'membres',icon:'👥',label:'Membres'},
    {id:'prets',icon:'💰',label:'Finances'},
    {id:'reunions',icon:'📅',label:'Réunions'},
    {id:'more',icon:'⋯',label:'Plus'},
  ];
  const MORE_TABS=TABS.filter(t=>!['dashboard','membres','prets','reunions'].includes(t.id));

  const initiales=(_userEmail||'SG').split('@')[0].slice(0,2).toUpperCase();

  return(
    <>
      <div className="app-shell">
      {offline&&<div className="offline-banner">📡 Mode hors ligne — données non synchronisées</div>}

      {/* ── Header compact ── */}
      <header className="app-header">
        <div>
          <div className="logo-text">FABAMA</div>
          <span className="subtitle">Gestion Financière 2026</span>
        </div>
        <div className="header-right">
          {impayes167k&&<div className="header-icon" title="Alertes" onClick={()=>setActiveTab('reports')}>🔔</div>}
          <div className="header-avatar" onClick={()=>setShowUserMenu(!showUserMenu)}>
            {initiales}
            <div className={`user-dropdown${showUserMenu?' open':''}`}>
              <p>{_userEmail}</p>
              <button onClick={()=>{setShowUserMenu(false);logout()}}>🚪 Déconnexion</button>
            </div>
          </div>
        </div>
      </header>

      {/* ── Tabs desktop ── */}
      <nav className="tabs-nav">
        {TABS.map(t=>(
          <button key={t.id} className={`tab-btn${activeTab===t.id?' active':''}${t.ai?' ai-tab':''}`} onClick={()=>setActiveTab(t.id)}>{t.label}</button>
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
          {activeTab==='detail'&&<TabDetailAG data={data} onSaved={()=>loadData(auth)}/>}
          {activeTab==='synthese'&&<TabSynthese data={data}/>}
          {activeTab==='reports'&&<TabReports data={data}/>}
          {activeTab==='reception'&&<TabReception data={data}/>}
          {activeTab==='communique'&&<TabCommunique data={data} onSaved={()=>loadData(auth)}/>}
          {activeTab==='assistant'&&<TabAssistant data={data}/>}
        </>
      )}
      </main>

      {/* ── Bottom nav mobile ── */}
      <nav className="bottom-nav">
        <div className="bottom-nav-items">
          {BNAV.map(b=>(
            b.id==='more'
              ?<button key="more" className={`bnav-btn${showMore?' active':''}`} onClick={()=>setShowMore(!showMore)}>
                  <span className="bnav-icon">{b.icon}</span>
                  <span className="bnav-label">{b.label}</span>
                </button>
              :<button key={b.id} className={`bnav-btn${activeTab===b.id?' active':''}`} onClick={()=>{setActiveTab(b.id);setShowMore(false)}}>
                  <span className="bnav-icon">{b.icon}</span>
                  <span className="bnav-label">{b.label}</span>
                  {b.id==='prets'&&<span className="bnav-indicator"/>}
                </button>
          ))}
        </div>
        {showMore&&(
          <div style={{background:'#fff',borderTop:'1px solid var(--border)',padding:'8px 12px',display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:6}}>
            {MORE_TABS.map(t=>(
              <button key={t.id} onClick={()=>{setActiveTab(t.id);setShowMore(false)}} style={{background:activeTab===t.id?'var(--green-light)':'#f5f5f5',border:'none',borderRadius:8,padding:'8px 4px',fontSize:10,fontWeight:600,color:activeTab===t.id?'var(--green)':'var(--muted)',cursor:'pointer',textAlign:'center',lineHeight:1.4}}>
                {t.label}
              </button>
            ))}
          </div>
        )}
      </nav>
      </div>
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
