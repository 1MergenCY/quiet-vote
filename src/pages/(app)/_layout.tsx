import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { AuthOverlay, DeepSpaceAuthProvider, authClient, useAuth } from 'deepspace'
import { Masthead } from '../../components/QuietVote'

export default function AppLayout() {
  return <DeepSpaceAuthProvider><RoomShell /></DeepSpaceAuthProvider>
}

function RoomShell() {
  const { isLoaded, isSignedIn } = useAuth()
  const [showAuth, setShowAuth] = useState(false)
  return <div className="q-app">
    <title>Quiet Vote</title>
    <Masthead>{isSignedIn && <button className="q-button q-secondary" onClick={async () => {
      try { await authClient.signOut(); window.location.assign('/') }
      catch { window.location.reload() }
    }}>Sign out</button>}</Masthead>
    <main className="q-shell q-live">
      {!isLoaded ? <p className="q-notice" role="status">Loading your session…</p> : isSignedIn ? <Outlet /> :
        <section className="q-setup q-auth"><h1>Sign in to your room</h1><p>Your account keeps your ballot private and lets you return to this decision.</p>
          <button className="q-button q-primary" onClick={() => setShowAuth(true)}>Sign in</button></section>}
    </main>
    {!isSignedIn && showAuth && <AuthOverlay title="Sign in to Quiet Vote" onClose={() => setShowAuth(false)} />}
  </div>
}
