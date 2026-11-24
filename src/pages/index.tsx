import { useState, useSyncExternalStore } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDown, ArrowRight, RotateCcw } from 'lucide-react'
import { Masthead, RoomBoard } from '../components/QuietVote'
import { applyCommand, roomView, type Room } from '../decision'
import { Seo } from '../components/Seo'
import { seo } from '../seo'

const you = { id: 'you', name: 'Alex Morgan' }
const subscribeToHydration = () => () => {}
const browserReady = () => true
const serverReady = () => false
const sample: Room = {
  title: 'Where should the team volunteer?',
  context: 'We have one Friday afternoon and a team of eight. Compare the three options before we discuss.',
  options: ['Community garden', 'Food bank shift', 'Park clean-up'],
  criteria: [{ name: 'Community impact', weight: 3 }, { name: 'Easy to organize', weight: 2 }, { name: 'Team interest', weight: 1 }],
  host: you.id, phase: 'voting', revision: 1,
  participants: [you,
    { id: 'mika', name: 'Mika Chen', ballot: { scores: [[5, 2, 5], [4, 5, 3], [3, 4, 3]], note: 'The garden would give us a chance to work as one group.' } },
    { id: 'jules', name: 'Jules Reyes', ballot: { scores: [[4, 5, 4], [5, 4, 4], [2, 5, 3]], note: 'The food bank already has a shift that fits our schedule.' } },
  ],
}

export default function Landing() {
  const [room, setRoom] = useState(sample)
  const [attempt, setAttempt] = useState(0)
  const ready = useSyncExternalStore(subscribeToHydration, browserReady, serverReady)
  return <div className="q-app">
    <Seo {...seo} path="/" />
    <Masthead />
    <main className="q-shell q-landing">
      <section className="q-hero">
        <div className="q-hero-main">
          <h1>Score independently.<br /><em>Decide together.</em></h1>
          <p>Give everyone a chance to form an opinion. Score your options in private, then reveal where the team agrees and where you still need to talk.</p>
          <div className="q-actions"><Link to="/new" className="q-button q-primary">Create a room <ArrowRight size={17} /></Link><a href="#room" className="q-button q-secondary">Try the example <ArrowDown size={16} /></a></div>
        </div>
        <div className="q-hero-art" aria-hidden="true">
          <div className="q-art-card q-art-back"><i /><i /><i /></div>
          <div className="q-art-card q-art-front"><i /><i /><i /><span>✓</span></div>
          <div className="q-art-orbit" /><div className="q-art-dot" />
        </div>
      </section>
      <fieldset className="q-demo-inputs" aria-label="Interactive example" disabled={!ready}>
        <RoomBoard key={attempt} room={roomView(room, you.id)} demo run={async command => setRoom(applyCommand(room, you, command))} online={new Set(['you', 'mika', 'jules'])} />
      </fieldset>
      <footer className="q-footer"><span>Sample rooms reset when you refresh.</span><button className="q-text-button" disabled={!ready} onClick={() => { setRoom(sample); setAttempt(n => n + 1) }}><RotateCcw size={14} /> Restart example</button></footer>
    </main>
  </div>
}
