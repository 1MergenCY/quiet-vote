import { useNavigate } from 'react-router-dom'
import { SetupForm } from '../../components/QuietVote'
import { roomRequest } from '../../room-client'

export default function CreateRoom() {
  const navigate = useNavigate()
  return <SetupForm create={async setup => {
    const { id } = await roomRequest<{ id: string }>(undefined, { type: 'create', setup })
    navigate(`/room/${id}`)
  }} />
}
