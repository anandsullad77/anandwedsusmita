import { useEffect, useRef, useState } from 'react';
import { celebration } from '../lib/celebration';
import { POLL_CATEGORIES, type Poll, type PollDraft } from '../lib/celebrationTypes';
import type { AdminData } from '../lib/types';
import { pollContentChanged, type PollSaveResult } from '../lib/pollEditing';
import { usePlayground } from '../guest/WeddingPlayground';
import './playground-admin.css';

const istInput = (at: string | null) => at ? new Date(Date.parse(at)+330*60000).toISOString().slice(0,16) : '';
const toInstant = (input: string) => input ? new Date(`${input}:00+05:30`).toISOString() : null;
const blankPoll = (d: AdminData): PollDraft => ({ id:crypto.randomUUID(),category:'duel',kind:'single',question:'',options:[d.event.coupleA,d.event.coupleB],photoIds:[],status:'draft',startsAt:null,closesAt:null,revealAt:null,results:'after_vote',pinned:false,correct:null,coupleAnswers:null,provisional:false });

export default function PlaygroundAdmin({ d }: { d: AdminData }) {
  const { data,error,loading,refresh }=usePlayground(d.event.id,true);
  const [draft,setDraft]=useState<PollDraft | null>(null);
  const [notice,setNotice]=useState<string | null>(null);
  return <div className="playground-admin">
    <header className="playground-admin-heading"><div><h1 className="h1">Wedding Playground</h1><p className="admin-description">Set the questions. Let the guests have their say.</p></div></header>
    {error && <p className="error" role="alert">{error} <button className="abtn" disabled={loading} onClick={() => void refresh()}>Retry</button></p>}
    {notice && <p className="import-success" role="status">{notice}</p>}
    {data && <section className="kpis" aria-label="Playground engagement"><div className="kpi"><span className="l">Saved ballots</span><b className="n">{data.stats.votes}</b></div><div className="kpi"><span className="l">Unique voters</span><b className="n">{data.stats.voters}</b></div><div className="kpi"><span className="l">Polls with responses</span><b className="n">{data.stats.completed}</b></div></section>}
      <div className="playground-admin-actions"><button className="abtn solid" onClick={() => { setDraft(blankPoll(d)); setNotice(null); }}>+ Create a poll</button><button className="abtn" disabled={!data?.polls.length} onClick={() => data && exportResults(data.polls)}>Export results as CSV</button><button className="abtn" disabled={loading} onClick={() => void refresh()}>{loading ? 'Refreshing…' : 'Refresh'}</button></div>
      {draft ? <PollEditor key={draft.id} d={d} initial={draft} hasVotes={!!data?.polls.find(p=>p.id===draft.id)?.total} onRefresh={refresh} onCancel={()=>setDraft(null)} onSaved={async result=>{setDraft(null);setNotice(result.revised ? 'Question updated as a new voting round. Earlier answers are archived.' : 'Poll saved.');await refresh();}} /> : <>
        <p className="analytics-note">For each new quiz question, set the correct answer and clear “Provisional answer key” before opening it. All scheduling uses IST. Guest choices are private; the invitation displays totals.</p>
        <div className="admin-poll-list">{data?.polls.map(p => <article key={p.id} className="panel admin-poll-card"><div><span className="admin-eyebrow">{POLL_CATEGORIES.find(c=>c.id===p.category)?.title} · {p.status}{p.pinned?' · Pinned':''}</span><h2>{p.question}</h2><p>{p.total ?? 0} ballots{p.provisional?' · Provisional answers: confirm before publishing':''}{p.startsAt?` · Opens ${new Date(p.startsAt).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})} IST`:''}</p>{p.counts && <div className="admin-poll-results">{p.options.map((o,i)=><span key={i}>{o}: <b>{p.counts![i]}</b></span>)}</div>}</div><div className="playground-admin-actions"><button className="abtn" onClick={()=>setDraft(p)}>Edit</button><button className="abtn" onClick={()=>setDraft({...p,id:crypto.randomUUID(),status:'draft',pinned:false})}>Duplicate</button></div></article>)}</div>
      </>}
  </div>;
}

function PollEditor({ d,initial,hasVotes,onCancel,onSaved,onRefresh }: { d:AdminData; initial:PollDraft; hasVotes:boolean; onCancel:()=>void; onSaved:(result:PollSaveResult)=>Promise<void>; onRefresh:()=>Promise<void> }) {
  const [draft,setDraft]=useState(initial);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const lock=useRef(false);
  const heading=useRef<HTMLHeadingElement>(null);
  const change=(patch:Partial<PollDraft>)=>setDraft(v=>({...v,...patch}));
  const needsRevision = hasVotes && pollContentChanged(initial, draft);
  useEffect(()=>{heading.current?.focus({preventScroll:true});heading.current?.scrollIntoView({block:'nearest'});},[]);
  return <form className="panel poll-editor" onSubmit={async e=>{
    e.preventDefault();if(lock.current)return;lock.current=true;setBusy(true);setError(null);
    try { const result = await celebration.savePoll(d.event.id,draft,needsRevision);await onSaved(result); }
    catch(e){setError((e as Error).message);await onRefresh();}finally{lock.current=false;setBusy(false);}
  }}>
    <h2 ref={heading} tabIndex={-1}>Edit your question</h2>{hasVotes&&<p className="poll-edit-notice">Guests have already voted. Editing the question, choices or answer key starts a new voting round and keeps earlier answers archived. Status, schedule and display changes keep the current votes.</p>}
    <fieldset disabled={busy} className="poll-editor-fields">
      <div className="field"><label htmlFor="poll-category">Category</label><select id="poll-category" className="input" value={draft.category} onChange={e=>{
        const category=e.target.value as PollDraft['category'];change({category,kind:'single',options:[d.event.coupleA,d.event.coupleB],correct:category==='quiz'?0:null,coupleAnswers:null,provisional:category==='quiz',photoIds:[]});
      }}>{POLL_CATEGORIES.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select></div>
      <div className="field"><label htmlFor="poll-kind">Response format</label><select id="poll-kind" className="input" disabled={draft.category!=='prediction'} value={draft.kind} onChange={e=>{const kind=e.target.value as PollDraft['kind'];change({kind,options:kind==='rating'?['1','2','3','4','5']:draft.options});}}><option value="single">Single choice</option><option value="multiple">Multiple choice</option><option value="rating">Rating (1–5)</option></select></div>
      <div className="field memory-wide"><label htmlFor="poll-question">Question</label><input id="poll-question" className="input" required maxLength={240} value={draft.question} onChange={e=>change({question:e.target.value})}/></div>
      {draft.kind!=='text'&&<div className="field memory-wide"><label htmlFor="poll-options">Options, one per line (2–6)</label><textarea id="poll-options" className="input" rows={4} required value={draft.options.join('\n')} onChange={e=>change({options:e.target.value.split('\n')})}/></div>}
      {draft.category==='photo'&&draft.options.map((option,i)=><div className="field" key={i}><label htmlFor={`poll-photo-${i}`}>Photograph for {option||`option ${i+1}`}</label><select id={`poll-photo-${i}`} className="input" required value={draft.photoIds[i]??''} onChange={e=>{const photoIds=[...draft.photoIds];photoIds[i]=e.target.value;change({photoIds});}}><option value="">Choose a feed photograph</option>{d.photos.filter(p=>!p.hidden).map((p,index)=><option value={p.id} key={p.id}>Photo {index+1}: {p.caption||p.uploaderName}</option>)}</select>{d.photos.find(p=>p.id===draft.photoIds[i])&&<img className="admin-poll-photo" src={d.photos.find(p=>p.id===draft.photoIds[i])!.url} alt={option}/>}</div>)}
      {draft.category==='quiz'&&<><div className="field"><label htmlFor="poll-correct">Correct answer</label><select id="poll-correct" className="input" required value={draft.correct??''} onChange={e=>change({correct:e.target.value===''?null:Number(e.target.value)})}><option value="">Choose the correct answer</option>{draft.options.map((o,i)=><option key={i} value={i}>{o}</option>)}</select></div><label className="poll-editor-check"><input type="checkbox" checked={draft.provisional} onChange={e=>change({provisional:e.target.checked})}/>Provisional answer key (keep as draft)</label></>}
      <div className="field"><label htmlFor="poll-status">Status</label><select id="poll-status" className="input" value={draft.status} onChange={e=>change({status:e.target.value as PollDraft['status']})}><option value="draft">Draft (hidden)</option><option value="open">Open for voting</option><option value="closed">Closed</option></select></div>
      <div className="field"><label htmlFor="poll-results">Show voting results</label><select id="poll-results" className="input" value={draft.results} onChange={e=>change({results:e.target.value as PollDraft['results']})}><option value="after_vote">After the guest votes</option><option value="always">Immediately</option><option value="closed">After voting closes and reveal time</option></select></div>
      {([['startsAt','Opens at (IST)'],['closesAt','Closes at (IST)'],['revealAt','Answer reveal at (IST)']] as const).map(([field,label])=><div className="field" key={field}><label htmlFor={`poll-${field}`}>{label}</label><input id={`poll-${field}`} className="input" type="datetime-local" value={istInput(draft[field])} onChange={e=>change({[field]:toInstant(e.target.value)})}/></div>)}
      <label className="poll-editor-check"><input type="checkbox" checked={draft.pinned} onChange={e=>change({pinned:e.target.checked})}/>Feature in The Wedding Verdict</label>
    </fieldset>
    <p className="analytics-note">Quiz answer keys stay hidden until the poll closes and the reveal time arrives. Leave reveal time blank to reveal when voting closes. Predictions remain in the memory vault for your anniversary.</p>
    <div className="playground-admin-actions"><button className="abtn solid" disabled={busy}>{busy?'Saving…':needsRevision?'Save new voting round':'Save poll'}</button><button type="button" className="abtn" disabled={busy} onClick={onCancel}>Cancel</button></div>
    {error&&<p className="error" role="alert">{error}</p>}
  </form>;
}

function exportResults(polls:Poll[]) {
  const cell=(value:unknown)=>`"${String(value??'').replace(/^[=+@-]/,"'$&").replace(/"/g,'""')}"`;
  const rows=[['Category','Question','Status','Option / word','Votes','Total ballots'],...polls.flatMap(p=>p.kind==='text'?p.words.map(w=>[p.category,p.question,p.status,w.word,w.count,p.total]):p.options.map((o,i)=>[p.category,p.question,p.status,o,p.counts?.[i]??0,p.total]))];
  const url=URL.createObjectURL(new Blob(['\uFEFF'+rows.map(row=>row.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download='wedding-playground-results.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
