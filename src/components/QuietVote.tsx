import { useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDown, ArrowRight, Check, ChevronRight, Clipboard, Eye, GitPullRequest, Grid2X2, LockKeyhole, Minus, Plus, Users } from 'lucide-react'
import type { Ballot, Command, RoomView, Setup } from '../decision'
import { setupSchema } from '../decision'

export function Masthead({ children }: { children?: ReactNode }) {
  return <header className="q-header"><div className="q-shell q-header-inner">
    <Link to="/" className="q-brand"><span className="q-logo"><GitPullRequest size={19} /></span> quiet<span>vote</span></Link>
    <nav aria-label="Main navigation">{children ?? <Link className="q-button q-primary" to="/new">Create a room <ArrowRight size={16} /></Link>}</nav>
  </div></header>
}

type Run = (command: Exclude<Command, { type: 'create' }>) => Promise<void>

export function RoomBoard({ room, run, demo = false, online, copyInvite }: {
  room: RoomView; run: Run; demo?: boolean; online?: Set<string>; copyInvite?: () => Promise<void>
}) {
  const host = room.host === room.selfId
  const submitted = room.participants.filter(p => p.submitted).length
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  async function send(command: Parameters<Run>[0]) {
    setBusy(true)
    setError('')
    try { await run(command) }
    catch (e) { setError(e instanceof Error ? e.message : 'Please try again.') }
    finally { setBusy(false) }
  }

  async function copy() {
    try { await copyInvite?.(); setCopied(true) }
    catch { setError('Copy the room URL from your browser to share it.') }
  }

  return <section className="q-board" id="room" aria-label="Decision room">
    <div className="q-room-head">
      <div><div className="q-overline"><Grid2X2 size={13} /> {demo ? 'INTERACTIVE EXAMPLE' : 'DECISION ROOM'}</div>
        <h2>{room.title}</h2>{room.context && <p>{room.context}</p>}</div>
      {copyInvite && <button className="q-button q-secondary" onClick={copy}><Clipboard size={15} />{copied ? 'Link copied' : 'Copy invite link'}</button>}
    </div>
    <div className="q-steps" aria-label="Room progress">
      {([['voting', 'Score options', LockKeyhole], ['revealed', 'Review results', Eye], ['decided', 'Record decision', Check]] as const).map(([phase, label, Icon], i, stages) => {
        const current = room.phase === phase
        const complete = i < stages.findIndex(([stage]) => stage === room.phase)
        return <div key={phase} className={current ? 'q-step q-current' : complete ? 'q-step q-complete' : 'q-step'} aria-current={current ? 'step' : undefined}>
          <span><Icon size={15} /></span>{label}{i < stages.length - 1 && <ChevronRight className="q-chevron" size={15} />}
        </div>
      })}
    </div>
    {error && <p className="q-error" role="alert">{error}</p>}
    <div className="q-board-grid">
      <div className="q-main-panel">
        {room.phase === 'voting' ? <BallotForm room={room} busy={busy} save={ballot => send({ type: 'vote', ballot })} /> : <Results room={room} />}
      </div>
      <aside className="q-room-side">
        <div className="q-side-panel">
          <div className="q-side-title"><Users size={17} /><h3>Participants</h3><span>{room.participants.length}</span></div>
          <div className="q-progress"><span style={{ width: `${100 * submitted / room.participants.length}%` }} /></div>
          <p className="q-submitted" role="status">{submitted} of {room.participants.length} submitted</p>
          <ul className="q-roster">{room.participants.map((p, i) => <li key={p.id}>
            <span className={`q-avatar q-avatar-${i % 4}`} title={online?.has(p.id) ? 'In the room' : undefined}>
              {p.name.split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase()}{online?.has(p.id) && <i aria-label="In the room" />}
            </span>
            <span className="q-person" title={p.name}>{p.name}{p.id === room.selfId && <small> (you)</small>}{p.id === room.host && <small> · host</small>}</span>
            <span className={p.submitted ? 'q-status q-saved' : 'q-status'}>{p.submitted ? <Check aria-label="Submitted" size={14} /> : <Minus aria-label="Waiting" size={14} />}</span>
          </li>)}</ul>
          {online && <p className="q-online">{online.size} in the room now</p>}
        </div>
        {room.phase === 'voting' && <div className="q-side-panel q-privacy">
          <LockKeyhole size={17} /><h3>Voting is private</h3>
          <p>Scores and notes stay hidden while voting is open. The host can close voting and reveal the group results.</p>
          {host && <button className="q-button q-secondary" disabled={!submitted || busy || (demo && !room.ownBallot)} onClick={() => {
            if (submitted === room.participants.length || window.confirm(`Reveal now? ${room.participants.length - submitted} participant(s) still have no ballot. Voting will close.`)) void send({ type: 'reveal' })
          }}><Eye size={16} /> Reveal results</button>}
        </div>}
        {room.phase === 'revealed' && host && <DecisionForm options={room.options} busy={busy} save={(option, reason, next) => send({ type: 'decide', option, reason, next })} />}
        {room.decision && <DecisionSummary title={room.title} option={room.options[room.decision.option]} reason={room.decision.reason} next={room.decision.next} />}
      </aside>
    </div>
  </section>
}

function DecisionSummary({ title, option, reason, next }: { title: string; option: string; reason: string; next: string }) {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'manual'>('idle')
  const summary = `${title}\n\nDecision: ${option}\nRationale: ${reason}\nNext step: ${next}`

  async function copy() {
    try {
      await navigator.clipboard.writeText(summary)
      setCopyStatus('copied')
    } catch {
      setCopyStatus('manual')
    }
  }

  return <section className="q-side-panel q-decision" aria-label="Saved decision">
    <Check size={18} /><h3>{option}</h3><p>{reason}</p><h4>Next step</h4><p>{next}</p>
    <button type="button" className="q-button q-secondary" onClick={() => void copy()}>
      {copyStatus === 'copied' ? <Check size={15} /> : <Clipboard size={15} />} Copy summary
    </button>
    {copyStatus === 'copied' && <div className="q-copy-status" role="status">Summary copied.</div>}
    {copyStatus === 'manual' && <label className="q-field q-copy-status">Select and copy the summary
      <textarea readOnly rows={6} value={summary} onFocus={e => e.currentTarget.select()} />
    </label>}
  </section>
}

function BallotForm({ room, busy, save }: { room: RoomView; busy: boolean; save: (ballot: Ballot) => Promise<void> }) {
  const [scores, setScores] = useState(() => room.ownBallot?.scores ?? room.options.map(() => room.criteria.map(() => 0)))
  const [note, setNote] = useState(room.ownBallot?.note ?? '')
  const complete = scores.every(row => row.every(Boolean))
  const dirty = JSON.stringify(scores) !== JSON.stringify(room.ownBallot?.scores) || note !== (room.ownBallot?.note ?? '')
  function score(option: number, criterion: number, value: number) {
    setScores(previous => previous.map((row, i) => i === option ? row.map((cell, j) => j === criterion ? value : cell) : row))
  }
  return <form onSubmit={e => { e.preventDefault(); if (complete) void save({ scores, note }) }}>
    <div className="q-panel-head"><h3>Your ballot</h3><p>Score each option from 1 (weak) to 5 (strong).</p></div>
    <div className="q-table-scroll"><table className="q-table">
      <thead><tr><th scope="col">Option</th>{room.criteria.map(c => <th key={c.name} scope="col">{c.name}<small>Weight {c.weight}×</small></th>)}</tr></thead>
      <tbody>{room.options.map((name, i) => <tr key={name}><th scope="row"><span className="q-letter">{String.fromCharCode(65 + i)}</span>{name}</th>
        {room.criteria.map((c, j) => <td key={c.name}><select aria-label={`${name} · ${c.name}`} value={scores[i][j]} onChange={e => score(i, j, Number(e.target.value))}>
          <option value="0" disabled>—</option>{[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
        </select></td>)}
      </tr>)}</tbody>
    </table></div>
    <div className="q-ballot-foot"><label className="q-field">What influenced your scores? <small>Optional · shown without names after reveal</small>
      <textarea rows={2} value={note} onChange={e => setNote(e.target.value)} maxLength={240} placeholder="One consideration for the group…" />
    </label>
    <div className="q-actions"><button className="q-button q-primary" disabled={!complete || busy || !dirty}>{busy ? 'Saving…' : room.ownBallot ? 'Update ballot' : 'Submit ballot'} <ArrowRight size={16} /></button>
      {room.ownBallot && !dirty && <span className="q-success" role="status"><Check size={15} /> Ballot saved</span>}</div></div>
  </form>
}

function Results({ room }: { room: RoomView }) {
  const results = room.results
  if (!results) return null
  return <div>
    <div className="q-panel-head"><h3>Group results</h3><p>Average scores, weighted by the criteria the host set.</p></div>
    <ol className="q-ranks">{results.ranked.map(option => <li key={option.name}>
      <div><strong>{option.name}</strong><span><b>{option.score.toFixed(2)}</b> / 5</span></div>
      <div className="q-meter"><span style={{ width: `${option.score * 20}%` }} /></div>
      <div className="q-cells">{option.cells.map(cell => <span key={cell.name} title={`Score range ${cell.low}–${cell.high}`}>{cell.name} <b>{cell.avg.toFixed(1)}</b></span>)}</div>
    </li>)}</ol>
    <div className="q-result-foot">
      {results.gap ? <div className="q-gap"><ArrowDown size={18} /><div><h4>Discuss the widest split</h4><p><strong>{results.gap.option}</strong> scored {results.gap.low}–{results.gap.high} on <strong>{results.gap.name}</strong>.</p></div></div>
        : <p className="q-unanimous">Submitted scores match across all criteria.</p>}
      {results.notes.length > 0 && <><h4>Notes from the group</h4>{results.notes.map((note, i) => <blockquote key={i}>{note}</blockquote>)}</>}
    </div>
  </div>
}

function DecisionForm({ options, busy, save }: { options: string[]; busy: boolean; save: (option: number, reason: string, next: string) => Promise<void> }) {
  const [option, setOption] = useState(0)
  const [reason, setReason] = useState('')
  const [next, setNext] = useState('')
  return <form className="q-side-panel q-decision" onSubmit={e => { e.preventDefault(); void save(option, reason, next) }}>
    <h3>Record the decision</h3><p>Choose the option you’ll act on and explain why.</p>
    <label className="q-field">Chosen option<select value={option} onChange={e => setOption(Number(e.target.value))}>{options.map((name, i) => <option key={name} value={i}>{name}</option>)}</select></label>
    <label className="q-field">Rationale<textarea required rows={2} maxLength={350} value={reason} onChange={e => setReason(e.target.value)} /></label>
    <label className="q-field">Next step<input required maxLength={180} value={next} onChange={e => setNext(e.target.value)} /></label>
    <button className="q-button q-primary" disabled={busy || !reason.trim() || !next.trim()}>Save decision <Check size={16} /></button>
  </form>
}

export function SetupForm({ create }: { create: (setup: Setup) => Promise<void> }) {
  const [title, setTitle] = useState('')
  const [context, setContext] = useState('')
  const [options, setOptions] = useState(['', ''])
  const [criteria, setCriteria] = useState([{ name: 'Impact', weight: 2 }, { name: 'Feasibility', weight: 1 }])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    const parsed = setupSchema.safeParse({ title, context, options, criteria })
    if (!parsed.success) { setError('Enter a question and give every option and criterion a distinct name.'); return }
    setBusy(true)
    try { await create(parsed.data) }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not create the room.'); setBusy(false) }
  }
  return <form className="q-setup" onSubmit={submit}>
    <div className="q-overline"><Grid2X2 size={14} /> NEW ROOM</div><h1>What are you deciding?</h1>
    <p>Set up the ballot, then share the room with your team.</p>
    <label className="q-field">Decision question<input value={title} onChange={e => setTitle(e.target.value)} placeholder="Which project should we take on next?" required maxLength={120} /></label>
    <label className="q-field">Context <small>Optional</small><textarea rows={2} value={context} onChange={e => setContext(e.target.value)} maxLength={350} /></label>
    <fieldset><legend>Options</legend>{options.map((option, i) => <div className="q-form-row" key={i}>
      <input aria-label={`Option ${i + 1}`} placeholder={`Option ${i + 1}`} required maxLength={60} value={option} onChange={e => setOptions(options.map((v, j) => i === j ? e.target.value : v))} />
      {options.length > 2 && <button type="button" className="q-icon" aria-label={`Remove option ${i + 1}`} onClick={() => setOptions(options.filter((_, j) => i !== j))}><Minus size={16} /></button>}
    </div>)}{options.length < 4 && <button type="button" className="q-text-button" onClick={() => setOptions([...options, ''])}><Plus size={15} /> Add option</button>}</fieldset>
    <fieldset><legend>Criteria</legend><p>Weight 3 counts three times as much as weight 1.</p>{criteria.map((criterion, i) => <div className="q-form-row" key={i}>
      <input aria-label={`Criterion ${i + 1}`} required maxLength={40} value={criterion.name} onChange={e => setCriteria(criteria.map((v, j) => i === j ? { ...v, name: e.target.value } : v))} />
      <select aria-label={`Weight for criterion ${i + 1}`} value={criterion.weight} onChange={e => setCriteria(criteria.map((v, j) => i === j ? { ...v, weight: Number(e.target.value) } : v))}>{[1, 2, 3].map(n => <option key={n} value={n}>{n}×</option>)}</select>
      {criteria.length > 2 && <button type="button" className="q-icon" aria-label={`Remove criterion ${i + 1}`} onClick={() => setCriteria(criteria.filter((_, j) => i !== j))}><Minus size={16} /></button>}
    </div>)}{criteria.length < 4 && <button type="button" className="q-text-button" onClick={() => setCriteria([...criteria, { name: '', weight: 1 }])}><Plus size={15} /> Add criterion</button>}</fieldset>
    {error && <p className="q-error" role="alert">{error}</p>}
    <button className="q-button q-primary" disabled={busy}>{busy ? 'Creating…' : 'Create room'} <ArrowRight size={16} /></button>
  </form>
}
