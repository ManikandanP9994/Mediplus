import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  ArrowRight, CalendarDays, Check, ChevronDown, Clock3, HeartPulse,
  Menu, MessageCircle, RefreshCw, Send, ShieldCheck, Sparkles,
  Stethoscope, X, Mic, MicOff, Volume2, Square, History, Plus
} from 'lucide-react'
import './styles.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const CHAT_API_URL = import.meta.env.VITE_CHAT_API_URL || `${API_URL}/api/chat`

type ChatResponse = {
  answer?: unknown
  response?: unknown
  text?: unknown
  message?: unknown
  data?: ChatResponse
}

type Doctor = {
  id: number
  name: string
  specialization: string
  start_time: string
  end_time: string
  break_start?: string | null
  break_end?: string | null
  slot_minutes: number
}
type Slot = { id: number; start_time: string; end_time: string; status: string }
type Appointment = {
  id: number; booking_reference: string; patient_name: string; patient_phone: string
  patient_email?: string | null; doctor_id: number; doctor_name: string
  specialization: string; appointment_date: string; start_time: string; end_time: string; status: string
}

const nav = ['About', 'Services', 'Insurance', 'Our Story']
const services = [
  { title: 'Primary Care', text: 'Everyday care designed around your health goals.', icon: HeartPulse },
  { title: 'Specialist Care', text: 'Connected access to trusted medical specialists.', icon: Stethoscope },
  { title: 'Wellness Plans', text: 'Preventive support that helps you stay ahead.', icon: Sparkles },
  { title: 'Insurance Support', text: 'Guidance through partnered coverage and benefits.', icon: ShieldCheck },
]

const appointments = [
  ['01', 'General Medicine', 'Everyday health, prevention and routine care'],
  ['02', 'Women’s Health', 'Compassionate, comprehensive care at every stage'],
  ['03', 'Diagnostics', 'Fast access to tests and clinical assessments'],
  ['04', 'Mental Wellness', 'Private support for mind and emotional wellbeing'],
  ['05', 'Specialist Consultation', 'Expert care through our partner network'],
]

const today = () => new Date().toISOString().slice(0, 10)

function formatTime(value: string) {
  const [h, m] = value.slice(0, 5).split(':').map(Number)
  const suffix = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 || 12
  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`
}

function getChatAnswer(payload: unknown): string {
  if (typeof payload === 'string') return payload
  if (!payload || typeof payload !== 'object') return ''

  const response = payload as ChatResponse
  for (const value of [response.answer, response.response, response.text, response.message]) {
    if (typeof value === 'string' && value.trim()) return value
  }

  return response.data ? getChatAnswer(response.data) : ''
}

function App() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [bookingOpen, setBookingOpen] = useState(false)
  const [adminOpen, setAdminOpen] = useState(false)
  const [chatSending, setChatSending] = useState(false)
  const [chatSpeaking, setChatSpeaking] = useState(false)
  const [chatListening, setChatListening] = useState(false)
  const [chatHistoryOpen, setChatHistoryOpen] = useState(false)
  const [chatSessions, setChatSessions] = useState<{ id: string; title: string; updatedAt: string }[]>([])
  const [sessionId, setSessionId] = useState(() => {
    const saved = localStorage.getItem('medi-plus-chat-session')
    return saved || crypto.randomUUID()
  })
  const [messages, setMessages] = useState<{ from: 'bot' | 'user'; text: string; messageId?: string }[]>([])
  const [input, setInput] = useState('')
  const chatEnd = useRef<HTMLDivElement>(null)

  useEffect(() => {
    localStorage.setItem('medi-plus-chat-session', sessionId)
    chatEnd.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, sessionId])

  useEffect(() => {
    if (!chatOpen || !CHAT_API_URL) return
    fetch(`${CHAT_API_URL}/history?session_id=${encodeURIComponent(sessionId)}`)
      .then(r => r.ok ? r.json() : [])
      .then((rows: any[]) => {
        if (rows.length) {
          setMessages(rows.map(x => ({
            from: x.role === 'user' ? 'user' : 'bot',
            text: x.content,
            messageId: x.message_id
          })))
        } else {
          setMessages([{ from: 'bot', text: 'Hello! I’m the Medi+ AI assistant. Ask me about care, doctors, or the same live appointment schedule used by Book an Appointment.' }])
        }
      })
      .catch(() => setMessages([{ from: 'bot', text: 'Hello! I’m the Medi+ AI assistant. How can I help you today?' }]))
  }, [chatOpen, sessionId])

  const loadChatSessions = () => {
    try {
      const saved = JSON.parse(localStorage.getItem('medi-plus-chat-sessions') || '[]')
      setChatSessions(Array.isArray(saved) ? saved : [])
    } catch { setChatSessions([]) }
  }

  const rememberChatSession = (id: string, firstUserMessage?: string) => {
    try {
      const saved = JSON.parse(localStorage.getItem('medi-plus-chat-sessions') || '[]')
      const list = Array.isArray(saved) ? saved : []
      const existing = list.find((x: any) => x.id === id)
      const item = {
        id,
        title: firstUserMessage?.slice(0, 42) || existing?.title || 'Medi+ chat',
        updatedAt: new Date().toISOString()
      }
      const next = [item, ...list.filter((x: any) => x.id !== id)].slice(0, 20)
      localStorage.setItem('medi-plus-chat-sessions', JSON.stringify(next))
      setChatSessions(next)
    } catch {}
  }

  const newChat = () => {
    const id = crypto.randomUUID()
    setSessionId(id)
    setMessages([{ from: 'bot', text: 'New Medi+ chat started. How can I help you?' }])
    setInput('')
    setChatHistoryOpen(false)
  }

  const sendMessage = async (forcedValue?: string) => {
    const value = (forcedValue ?? input).trim()
    if (!value || chatSending) return
    const messageId = crypto.randomUUID()
    setMessages(m => [...m, { from: 'user', text: value, messageId }])
    setInput('')
    rememberChatSession(sessionId, value)

    if (!CHAT_API_URL) {
      setMessages(m => [...m, { from: 'bot', text: 'The Medi+ AI service is not configured yet.' }])
      return
    }

    setChatSending(true)
    try {
      const response = await fetch(CHAT_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, message_id: messageId, message: value }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.detail || `Chat request failed (${response.status})`)
      const answer = getChatAnswer(payload)
      if (!answer) throw new Error('The chat endpoint returned no answer')
      setMessages(m => [...m, { from: 'bot', text: answer, messageId: payload.message_id }])
      rememberChatSession(sessionId)
    } catch {
      setMessages(m => [...m, { from: 'bot', text: 'I could not reach the Medi+ AI assistant right now. Please try again shortly.' }])
    } finally {
      setChatSending(false)
    }
  }

  const toggleVoice = () => {
    const w = window as any
    const SpeechRecognition = w.SpeechRecognition || w.webkitSpeechRecognition
    if (!SpeechRecognition) {
      window.alert('Voice input is supported in Chrome and Edge.')
      return
    }
    if (chatListening) {
      if (w.__mediRecognition) w.__mediRecognition.stop()
      setChatListening(false)
      return
    }
    const recognition = new SpeechRecognition()
    recognition.lang = 'en-IN'
    recognition.interimResults = false
    recognition.continuous = false
    recognition.onstart = () => setChatListening(true)
    recognition.onresult = (event: any) => {
      const spoken = event.results?.[0]?.[0]?.transcript || ''
      setInput(spoken)
      if (spoken) sendMessage(spoken)
    }
    recognition.onerror = () => setChatListening(false)
    recognition.onend = () => setChatListening(false)
    w.__mediRecognition = recognition
    recognition.start()
  }

  const speakMessage = (text: string) => {
    if (!('speechSynthesis' in window)) return
    if (chatSpeaking) {
      window.speechSynthesis.cancel()
      setChatSpeaking(false)
      return
    }
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'en-IN'
    utterance.onend = () => setChatSpeaking(false)
    setChatSpeaking(true)
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(utterance)
  }

  useEffect(() => {
    if (chatHistoryOpen) loadChatSessions()
  }, [chatHistoryOpen])


  return (
    <div className="min-h-screen bg-cream text-ink selection:bg-sage/40">
      <header className="fixed inset-x-0 top-0 z-40 border-b border-white/30 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 sm:px-8 lg:px-10">
          <a href="#home" className="font-serif text-3xl tracking-[.16em] text-ink">MEDI+</a>
          <nav className="hidden items-center gap-8 md:flex">
            {nav.map((item) => <a key={item} href={`#${item.toLowerCase().replace(' ', '-')}`} className="text-[11px] uppercase tracking-[.22em] text-ink/70 transition hover:text-ink">{item}</a>)}
          </nav>
          <button onClick={() => setBookingOpen(true)} className="hidden rounded-full bg-ink px-5 py-3 text-[10px] font-semibold uppercase tracking-[.18em] text-white transition hover:-translate-y-0.5 hover:shadow-lg sm:inline-flex">Book an appointment</button>
          <button aria-label="Open menu" className="rounded-full p-2 md:hidden" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X /> : <Menu />}</button>
        </div>
        {menuOpen && <div className="border-t border-ink/10 bg-white px-5 py-5 md:hidden">{nav.map((item) => <a onClick={() => setMenuOpen(false)} key={item} href={`#${item.toLowerCase().replace(' ', '-')}`} className="block border-b border-ink/10 py-4 text-xs uppercase tracking-[.2em]">{item}</a>)}<button onClick={() => { setMenuOpen(false); setBookingOpen(true) }} className="mt-4 block w-full rounded-full bg-ink px-5 py-3 text-center text-xs uppercase tracking-[.15em] text-white">Book appointment</button></div>}
      </header>

      <main>
        <section id="home" className="relative flex min-h-[720px] items-center overflow-hidden pt-20">
          <img className="absolute inset-0 h-full w-full object-cover" src="https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?auto=format&fit=crop&w=2200&q=85" alt="Bright modern healthcare interior" />
          <div className="absolute inset-0 bg-gradient-to-r from-white/95 via-white/75 to-white/20" />
          <div className="relative mx-auto w-full max-w-7xl px-5 py-20 sm:px-8 lg:px-10">
            <div className="max-w-2xl">
              <p className="eyebrow mb-6">WELCOME TO MEDI+</p>
              <h1 className="font-serif text-6xl leading-[.9] tracking-[-.035em] sm:text-7xl lg:text-[92px]">Your journey to<br /><span className="italic">wellness</span> begins here.</h1>
              <p className="mt-7 max-w-lg text-sm leading-7 text-ink/65 sm:text-base">Modern healthcare made human. Discover accessible, connected care through a trusted network of clinicians and insurance partners.</p>
              <div className="mt-9 flex flex-wrap gap-3"><button onClick={() => setBookingOpen(true)} className="btn-primary">Find your care <ArrowRight size={15} /></button><a href="#services" className="btn-light">Explore services</a></div>
            </div>
          </div>
        </section>

        <section id="about" className="px-5 py-24 sm:px-8 lg:px-10 lg:py-36">
          <div className="mx-auto max-w-4xl text-center">
            <div className="mx-auto mb-7 grid h-14 w-14 place-items-center rounded-full border border-ink/10"><HeartPulse size={22} strokeWidth={1.3} /></div>
            <p className="eyebrow">A BETTER WAY TO CARE</p>
            <h2 className="mt-4 font-serif text-4xl leading-tight sm:text-5xl lg:text-6xl">With our extensive network of insurance partnerships, we strive to make quality healthcare accessible to everyone.</h2>
            <a href="#insurance" className="mt-9 inline-flex items-center gap-2 border-b border-ink pb-1 text-[10px] uppercase tracking-[.22em]">Learn about coverage <ArrowRight size={13} /></a>
          </div>
        </section>

        <section id="services" className="bg-white px-5 py-20 sm:px-8 lg:px-10 lg:py-28">
          <div className="mx-auto max-w-7xl">
            <div className="grid items-center gap-12 lg:grid-cols-[.85fr_1.15fr]">
              <div className="overflow-hidden rounded-sm bg-mist"><img className="h-[430px] w-full object-cover sm:h-[520px]" src="https://images.unsplash.com/photo-1651008376811-b90baee60c1f?auto=format&fit=crop&w=1300&q=85" alt="Doctor reviewing patient information" /></div>
              <div><p className="eyebrow">OUR SERVICES</p><h2 className="mt-4 max-w-xl font-serif text-5xl leading-[.95] sm:text-6xl">We offer unparalleled healthcare excellence with Medi+.</h2><p className="mt-6 max-w-xl text-sm leading-7 text-ink/60">From your first consultation to ongoing preventive care, our services are designed to be simple, personal and connected.</p><div className="mt-9 grid gap-4 sm:grid-cols-2">{services.map(({ title, text, icon: Icon }) => <div key={title} className="group border-t border-ink/10 pt-5"><div className="mb-4 flex items-center justify-between"><Icon size={22} strokeWidth={1.2} /><span className="text-[9px] tracking-[.2em] text-ink/35">0{services.findIndex(s => s.title === title) + 1}</span></div><h3 className="font-serif text-2xl">{title}</h3><p className="mt-2 text-xs leading-5 text-ink/55">{text}</p></div>)}</div></div>
            </div>
          </div>
        </section>

        <section id="our-story" className="px-5 py-20 sm:px-8 lg:px-10 lg:py-28">
          <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-2">
            <div className="order-2 lg:order-1"><p className="eyebrow">OUR STORY</p><h2 className="mt-4 font-serif text-5xl leading-[.95] sm:text-6xl">Decades of innovation.<br /><span className="italic">Your</span> trusted journey in healthcare excellence.</h2><p className="mt-7 max-w-xl text-sm leading-7 text-ink/60">We believe healthcare should feel less complicated and more caring. Medi+ brings people, providers and partners together around a shared commitment to better outcomes.</p><button onClick={() => setBookingOpen(true)} className="btn-primary mt-8">Meet our approach <ArrowRight size={15} /></button></div>
            <div className="order-1 lg:order-2 overflow-hidden rounded-sm"><img className="h-[430px] w-full object-cover sm:h-[540px]" src="https://images.unsplash.com/photo-1579684385127-1ef15d508118?auto=format&fit=crop&w=1400&q=85" alt="Healthcare professionals consulting together" /></div>
          </div>
        </section>

        <section id="appointment" className="bg-white px-5 py-20 sm:px-8 lg:px-10 lg:py-28">
          <div className="mx-auto max-w-7xl"><div className="max-w-4xl"><p className="eyebrow">BOOK YOUR VISIT</p><h2 className="mt-4 font-serif text-5xl leading-[.95] sm:text-6xl">Choose a doctor, select a 10-minute slot, and confirm your visit.</h2><button onClick={() => setBookingOpen(true)} className="btn-primary mt-8">Open appointment scheduler <CalendarDays size={16} /></button></div>
            <div className="mt-12 border-y border-ink/15">{appointments.map(([num, title, desc]) => <button onClick={() => setBookingOpen(true)} key={num} className="group grid w-full grid-cols-[42px_1fr_auto] items-center gap-4 border-b border-ink/10 py-6 text-left last:border-0 sm:grid-cols-[70px_1fr_1fr_auto]"><span className="font-serif text-2xl text-ink/35">{num}</span><span className="font-serif text-2xl sm:text-3xl">{title}</span><span className="hidden text-xs leading-5 text-ink/50 sm:block">{desc}</span><ArrowRight size={18} className="transition group-hover:translate-x-1" /></button>)}</div>
          </div>
        </section>

        <section id="insurance" className="bg-mist px-5 py-20 sm:px-8 lg:px-10 lg:py-28">
          <div className="mx-auto max-w-5xl text-center"><p className="eyebrow">INSURANCE PARTNERS</p><h2 className="mt-4 font-serif text-5xl leading-[.95] sm:text-6xl">Care that works with your coverage.</h2><p className="mx-auto mt-6 max-w-2xl text-sm leading-7 text-ink/60">Our partner network helps make quality healthcare easier to access. Bring your insurance details and our team will guide you through the next step.</p><div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4">{['Aetna','Cigna','HDFC ERGO','Star Health'].map(x => <div key={x} className="rounded-sm border border-ink/10 bg-white/60 px-4 py-6 font-serif text-xl">{x}</div>)}</div></div>
        </section>

        <section className="bg-white px-5 py-24 sm:px-8 lg:px-10"><div className="mx-auto max-w-5xl"><div className="mb-12 text-center"><p className="eyebrow">MEMBER VOICES</p><h2 className="mt-4 font-serif text-4xl sm:text-5xl">We invite you to listen to what our members have to say about their wellness services.</h2></div><div className="grid gap-5 md:grid-cols-2"><blockquote className="bg-cream p-8 sm:p-10"><div className="mb-5 flex gap-1 text-xs">★★★★★</div><p className="font-serif text-2xl leading-snug">“The whole experience felt calm, clear and genuinely personal. I finally felt heard.”</p><footer className="mt-8 text-[10px] uppercase tracking-[.2em] text-ink/50">— A. Mehta, Member</footer></blockquote><blockquote className="bg-cream p-8 sm:p-10"><div className="mb-5 flex gap-1 text-xs">★★★★★</div><p className="font-serif text-2xl leading-snug">“Booking was effortless and the care team made every step easy to understand.”</p><footer className="mt-8 text-[10px] uppercase tracking-[.2em] text-ink/50">— R. Kumar, Member</footer></blockquote></div></div></section>
      </main>

      <footer id="contact" className="bg-ink px-5 py-14 text-white sm:px-8 lg:px-10 lg:py-20"><div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[1.3fr_.7fr_.7fr]"><div><p className="text-[10px] uppercase tracking-[.22em] text-white/45">Healing starts here.</p><p className="mt-4 max-w-md text-sm leading-6 text-white/65">Thoughtful healthcare, trusted professionals and a connected experience — designed around you.</p><div className="mt-12 font-serif text-7xl tracking-[-.03em] sm:text-8xl">MEDI+</div></div><div><p className="text-[10px] uppercase tracking-[.2em] text-white/45">Explore</p>{nav.concat(['Book appointment']).map(x => x === 'Book appointment' ? <button key={x} onClick={() => setBookingOpen(true)} className="mt-4 block text-left text-xs text-white/70 hover:text-white">{x}</button> : <a key={x} href={`#${x.toLowerCase().replace(' ', '-')}`} className="mt-4 block text-xs text-white/70 hover:text-white">{x}</a>)}</div><div><p className="text-[10px] uppercase tracking-[.2em] text-white/45">Contact</p><p className="mt-4 text-xs leading-6 text-white/65">care@medi-plus.example<br />+91 80000 00000<br />Mon–Sat · 8:00–20:00</p><button onClick={() => setAdminOpen(true)} className="mt-6 text-[9px] uppercase tracking-[.18em] text-white/35 hover:text-white/70">Admin daily schedule</button></div></div><div className="mx-auto mt-12 max-w-7xl border-t border-white/10 pt-5 text-[9px] uppercase tracking-[.2em] text-white/35">© 2026 Medi+. Healthcare, thoughtfully connected.</div></footer>

      <button aria-label="Open Medi+ chatbot" onClick={() => setChatOpen(true)} className="fixed bottom-5 right-5 z-50 grid h-16 w-16 place-items-center rounded-full bg-ink text-white shadow-soft ring-4 ring-white transition hover:scale-105 sm:bottom-7 sm:right-7"><MessageCircle size={25} /></button>
      {chatOpen && <div className="fixed bottom-24 right-4 z-50 flex w-[calc(100vw-32px)] max-w-sm flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-ink/10 sm:right-7">
        <div className="flex items-center justify-between bg-ink px-5 py-4 text-white">
          <div><p className="font-serif text-xl">Medi+ AI Assistant</p><p className="text-[9px] uppercase tracking-[.18em] text-white/55">AI · Live appointments connected</p></div>
          <div className="flex items-center gap-1">
            <button aria-label="New chat" onClick={newChat} className="rounded-full p-2 hover:bg-white/10"><Plus size={15}/></button>
            <button aria-label="Chat history" onClick={() => setChatHistoryOpen(v => !v)} className="rounded-full p-2 hover:bg-white/10"><History size={15}/></button>
            <button aria-label="Close chatbot" onClick={() => setChatOpen(false)} className="rounded-full p-2 hover:bg-white/10"><X size={18} /></button>
          </div>
        </div>
        {chatHistoryOpen && <div className="max-h-52 overflow-y-auto border-b border-ink/10 bg-white p-3">
          <div className="mb-2 flex items-center justify-between"><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-ink/50">Old chats</p><button onClick={newChat} className="text-[10px] underline">New chat</button></div>
          {chatSessions.length === 0 ? <p className="py-4 text-xs text-ink/40">No saved chats yet.</p> : chatSessions.map(x => <button key={x.id} onClick={() => { setSessionId(x.id); setChatHistoryOpen(false) }} className={`mb-1 w-full rounded-xl p-3 text-left text-xs ${x.id === sessionId ? 'bg-mist' : 'hover:bg-cream'}`}><p className="truncate font-medium">{x.title}</p><p className="mt-1 text-[9px] text-ink/40">{new Date(x.updatedAt).toLocaleString()}</p></button>)}
        </div>}
        <div className="h-72 space-y-3 overflow-y-auto bg-cream p-4">
          {messages.map((m, i) => <div key={`${m.messageId || 'm'}-${i}`} className={`group flex ${m.from === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[82%] rounded-2xl px-4 py-3 text-xs leading-5 ${m.from === 'user' ? 'rounded-br-sm bg-ink text-white' : 'rounded-bl-sm bg-white text-ink shadow-sm'}`}>
              <div className="whitespace-pre-wrap">{m.text}</div>
              {m.from === 'bot' && <button onClick={() => speakMessage(m.text)} className="mt-2 flex items-center gap-1 text-[9px] text-ink/45 hover:text-ink">{chatSpeaking ? <Square size={11}/> : <Volume2 size={11}/>} {chatSpeaking ? 'Stop' : 'Listen'}</button>}
            </div>
          </div>)}
          {chatSending && <div className="text-xs text-ink/45">Medi+ AI is thinking...</div>}
          <div ref={chatEnd} />
        </div>
        <div className="flex items-center gap-2 border-t border-ink/10 bg-white p-3">
          <button aria-label="Speak to AI" onClick={toggleVoice} className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${chatListening ? 'bg-red-600 text-white' : 'bg-cream text-ink'}`}>{chatListening ? <MicOff size={16}/> : <Mic size={16}/>}</button>
          <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendMessage()} placeholder="Chat with Medi+ AI..." className="min-w-0 flex-1 bg-cream px-4 py-3 text-xs outline-none" />
          <button aria-label="Send message" disabled={chatSending} onClick={() => sendMessage()} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-ink text-white disabled:cursor-wait disabled:opacity-50"><Send size={16} /></button>
        </div>
      </div>}

      {bookingOpen && <BookingModal onClose={() => setBookingOpen(false)} />}
      {adminOpen && <AdminSchedule onClose={() => setAdminOpen(false)} />}
    </div>
  )
}

function BookingModal({ onClose }: { onClose: () => void }) {
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [doctorId, setDoctorId] = useState<number | ''>('')
  const [date, setDate] = useState(today())
  const [slots, setSlots] = useState<Slot[]>([])
  const [selected, setSelected] = useState<Slot | null>(null)
  const [loading, setLoading] = useState(true)
  const [booking, setBooking] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState<Appointment | null>(null)
  const [patient, setPatient] = useState({ name: '', phone: '', email: '' })
  const [availability, setAvailability] = useState<{ doctor_id: number; doctor_name: string; specialization: string; date: string; available: boolean; status: string; reason?: string | null }[]>([])

  useEffect(() => {
    fetch(`${API_URL}/api/doctors`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error('Could not load doctors')))
      .then((data: Doctor[]) => {
        setDoctors(data)
        if (data[0]) setDoctorId(data[0].id)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!date) return
    setSelected(null); setError('')
    fetch(`${API_URL}/api/doctors/availability?date=${date}`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error('Could not load doctor availability')))
      .then((data) => {
        setAvailability(data)
        const current = data.find((x: any) => x.doctor_id === doctorId)
        if (current && !current.available) {
          setSlots([])
          return
        }
        if (doctorId) {
          return fetch(`${API_URL}/api/doctors/${doctorId}/slots?date=${date}`)
            .then(r => r.ok ? r.json() : Promise.reject(new Error('Could not load slots')))
            .then((slotData: Slot[]) => setSlots(slotData))
        }
      })
      .catch(e => setError(e.message))
  }, [doctorId, date])

  const book = async () => {
    if (!doctorId || !selected || !patient.name.trim() || !patient.phone.trim()) {
      setError('Please select a doctor, time slot, name and phone number.')
      return
    }
    setBooking(true); setError('')
    const idempotencyKey = crypto.randomUUID()
    try {
      const response = await fetch(`${API_URL}/api/appointments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({
          doctor_id: doctorId,
          slot_id: selected.id,
          appointment_date: date,
          patient_name: patient.name,
          patient_phone: patient.phone,
          patient_email: patient.email || null,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.detail || 'Booking failed')
      setSuccess(data)
      setSlots(s => s.map(x => x.id === selected.id ? { ...x, status: 'BOOKED' } : x))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Booking failed')
    } finally {
      setBooking(false)
    }
  }

  return <div className="fixed inset-0 z-[80] flex items-end justify-center bg-ink/50 p-0 backdrop-blur-sm sm:items-center sm:p-5">
    <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-t-[28px] bg-white p-5 shadow-2xl sm:rounded-[28px] sm:p-7">
      <div className="flex items-start justify-between gap-4"><div><p className="eyebrow">APPOINTMENT SCHEDULER</p><h2 className="mt-2 font-serif text-4xl">Choose your 10-minute visit</h2><p className="mt-2 text-xs text-ink/55">Slots are stored per doctor and date. Times use Asia/Kolkata.</p></div><button onClick={onClose} className="rounded-full p-2 hover:bg-cream"><X /></button></div>

      {success ? <div className="mt-8 rounded-3xl bg-mist p-6">
        <div className="grid h-12 w-12 place-items-center rounded-full bg-emerald-600 text-white"><Check /></div>
        <h3 className="mt-5 font-serif text-3xl">Appointment confirmed</h3>
        <p className="mt-2 text-sm text-ink/60">Your booking has been stored successfully.</p>
        <div className="mt-6 grid gap-3 rounded-2xl bg-white p-5 text-sm sm:grid-cols-2">
          <div><span className="text-ink/40">Reference</span><p className="font-semibold">{success.booking_reference}</p></div>
          <div><span className="text-ink/40">Patient</span><p className="font-semibold">{success.patient_name}</p></div>
          <div><span className="text-ink/40">Doctor</span><p className="font-semibold">{success.doctor_name}</p></div>
          <div><span className="text-ink/40">Date</span><p className="font-semibold">{success.appointment_date}</p></div>
          <div><span className="text-ink/40">Time</span><p className="font-semibold">{formatTime(success.start_time)} – {formatTime(success.end_time)}</p></div>
          <div><span className="text-ink/40">Status</span><p className="font-semibold text-emerald-700">{success.status}</p></div>
        </div>
        <button onClick={onClose} className="btn-primary mt-6">Done <Check size={15} /></button>
      </div> : <>
        <div className="mt-7 grid gap-4 sm:grid-cols-2">
          <label className="text-xs font-semibold">Doctor<select value={doctorId} onChange={e => setDoctorId(Number(e.target.value))} className="mt-2 w-full rounded-xl border border-ink/10 bg-cream px-4 py-3 outline-none">{loading ? <option>Loading...</option> : doctors.map(d => {
  const a = availability.find(x => x.doctor_id === d.id)
  return <option disabled={a?.available === false} key={d.id} value={d.id}>{d.name} — {d.specialization}{a?.available === false ? ' — ON LEAVE' : ' — AVAILABLE'}</option>
})}</select></label>
          <label className="text-xs font-semibold">Date<input min={today()} type="date" value={date} onChange={e => setDate(e.target.value)} className="mt-2 w-full rounded-xl border border-ink/10 bg-cream px-4 py-3 outline-none" /></label>
        </div>

        <div className="mt-6 grid gap-2 sm:grid-cols-3">
          {availability.map(a => (
            <button key={a.doctor_id} disabled={!a.available} onClick={() => setDoctorId(a.doctor_id)}
              className={`rounded-2xl border p-4 text-left transition ${a.available ? 'border-emerald-200 bg-emerald-50 hover:border-emerald-400' : 'border-amber-200 bg-amber-50 opacity-80'}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-serif text-lg">{a.doctor_name}</span>
                <span className={`rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-wider ${a.available ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>
                  {a.available ? 'Available' : 'On leave'}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-ink/50">{a.specialization}</p>
              {!a.available && <p className="mt-2 text-[10px] text-amber-800">{a.reason || 'Confirmed leave — appointments unavailable.'}</p>}
            </button>
          ))}
        </div>

        <div className="mt-6">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold">Available 10-minute slots</p>
            <span className="text-[10px] text-ink/40">{slots.filter(s => s.status === 'AVAILABLE').length} available</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-5">
            {slots.length === 0 ? (
              <div className="col-span-full rounded-2xl bg-amber-50 p-5 text-xs text-amber-800">
                No appointment slots are available for this doctor on this date. Check the doctor availability above.
              </div>
            ) : slots.map(slot => (
              <button key={slot.id} disabled={slot.status !== 'AVAILABLE'} onClick={() => setSelected(slot)}
                className={`rounded-xl border px-3 py-3 text-xs transition ${selected?.id === slot.id ? 'border-ink bg-ink text-white' : slot.status === 'AVAILABLE' ? 'border-ink/10 bg-cream hover:border-ink/30' : 'cursor-not-allowed border-ink/5 bg-ink/5 text-ink/25 line-through'}`}>
                {formatTime(slot.start_time)}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-7 grid gap-3 sm:grid-cols-3">
          <input value={patient.name} onChange={e => setPatient({ ...patient, name: e.target.value })} placeholder="Patient name *" className="rounded-xl border border-ink/10 bg-cream px-4 py-3 text-sm outline-none" />
          <input value={patient.phone} onChange={e => setPatient({ ...patient, phone: e.target.value })} placeholder="Phone *" className="rounded-xl border border-ink/10 bg-cream px-4 py-3 text-sm outline-none" />
          <input value={patient.email} onChange={e => setPatient({ ...patient, email: e.target.value })} placeholder="Email" className="rounded-xl border border-ink/10 bg-cream px-4 py-3 text-sm outline-none" />
        </div>
        {selected && <div className="mt-4 flex items-center gap-2 rounded-xl bg-mist px-4 py-3 text-xs"><Clock3 size={16} /> Selected: <strong>{formatTime(selected.start_time)} – {formatTime(selected.end_time)}</strong></div>}
        {error && <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-xs text-red-700">{error}</p>}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button onClick={onClose} className="btn-light">Cancel</button><button disabled={booking} onClick={book} className="btn-primary disabled:opacity-50">{booking ? 'Booking...' : 'Confirm appointment'} <Check size={15} /></button></div>
      </>}
    </div>
  </div>
}

function AdminSchedule({ onClose }: { onClose: () => void }) {
  const [date, setDate] = useState(today())
  const [rows, setRows] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true); setError('')
    try {
      const r = await fetch(`${API_URL}/api/admin/appointments?date=${date}`)
      const data = await r.json()
      if (!r.ok) throw new Error(data.detail || 'Could not load appointments')
      setRows(data)
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load appointments') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [date])

  return <div className="fixed inset-0 z-[85] overflow-y-auto bg-ink/60 p-3 backdrop-blur-sm sm:p-8">
    <div className="mx-auto max-w-6xl rounded-[28px] bg-white p-5 shadow-2xl sm:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="eyebrow">ADMIN SCHEDULE</p><h2 className="mt-2 font-serif text-4xl">Daily appointments</h2><p className="mt-2 text-xs text-ink/50">Demo admin view. Protect this endpoint with authentication before production.</p></div><div className="flex gap-2"><input type="date" value={date} onChange={e => setDate(e.target.value)} className="rounded-xl border border-ink/10 bg-cream px-4 py-3 text-sm" /><button onClick={load} className="grid h-11 w-11 place-items-center rounded-xl bg-ink text-white"><RefreshCw size={16} /></button><button onClick={onClose} className="grid h-11 w-11 place-items-center rounded-xl border border-ink/10"><X size={18} /></button></div></div>
      {error && <p className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-xs text-red-700">{error}</p>}
      <DoctorLeaveManager date={date} onChanged={load} />
      <div className="mt-7 overflow-x-auto rounded-2xl border border-ink/10"><table className="w-full min-w-[760px] text-left text-xs"><thead className="bg-mist text-ink/60"><tr><th className="px-4 py-3">Time</th><th className="px-4 py-3">Patient</th><th className="px-4 py-3">Phone</th><th className="px-4 py-3">Doctor</th><th className="px-4 py-3">Reference</th><th className="px-4 py-3">Status</th></tr></thead><tbody>{loading ? <tr><td colSpan={6} className="px-4 py-10 text-center">Loading...</td></tr> : rows.length === 0 ? <tr><td colSpan={6} className="px-4 py-10 text-center text-ink/45">No appointments for this date.</td></tr> : rows.map(x => <tr key={x.id} className="border-t border-ink/10"><td className="px-4 py-4 font-semibold">{formatTime(x.start_time)} – {formatTime(x.end_time)}</td><td className="px-4 py-4">{x.patient_name}</td><td className="px-4 py-4">{x.patient_phone}</td><td className="px-4 py-4">{x.doctor_name}</td><td className="px-4 py-4">{x.booking_reference}</td><td className="px-4 py-4"><span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">{x.status}</span></td></tr>)}</tbody></table></div>
    </div>
  </div>
}


function DoctorLeaveManager({ date, onChanged }: { date: string; onChanged: () => void }) {
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [doctorId, setDoctorId] = useState('')
  const [reason, setReason] = useState('Confirmed leave')
  const [leaveRows, setLeaveRows] = useState<any[]>([])
  const [busy, setBusy] = useState(false)

  const load = async () => {
    const [d, l] = await Promise.all([
      fetch(`${API_URL}/api/doctors`).then(r => r.json()),
      fetch(`${API_URL}/api/admin/doctors/leave-schedule?date=${date}`).then(r => r.json()),
    ])
    setDoctors(d); setLeaveRows(l)
  }
  useEffect(() => { load() }, [date])

  const addLeave = async () => {
    if (!doctorId) return
    setBusy(true)
    try {
      const response = await fetch(`${API_URL}/api/admin/doctor-leaves`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doctor_id: Number(doctorId), leave_date: date, reason }),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => null)
        throw new Error(data?.detail || 'Could not confirm leave')
      }
      await load(); onChanged()
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Could not confirm leave')
    } finally { setBusy(false) }
  }

  const cancelLeave = async (id: number) => {
    setBusy(true)
    try {
      const response = await fetch(`${API_URL}/api/admin/doctor-leaves/${id}?date=${date}`, { method: 'DELETE' })
      if (!response.ok) {
        const data = await response.json().catch(() => null)
        throw new Error(data?.detail || 'Could not cancel leave')
      }
      await load(); onChanged()
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Could not cancel leave')
    } finally { setBusy(false) }
  }

  return <div className="mt-7 rounded-2xl border border-ink/10 bg-mist p-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="eyebrow">DOCTOR AVAILABILITY</p>
        <h3 className="mt-1 font-serif text-2xl">Tomorrow / selected date leave</h3>
        <p className="mt-1 text-[11px] text-ink/50">Confirm leave here so the website automatically marks the doctor unavailable and prevents new bookings.</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <select value={doctorId} onChange={e => setDoctorId(e.target.value)} className="rounded-xl border border-ink/10 bg-white px-3 py-2 text-xs">
          <option value="">Select doctor</option>
          {doctors.map(d => <option key={d.id} value={d.id}>{d.name} — {d.specialization}</option>)}
        </select>
        <input value={reason} onChange={e => setReason(e.target.value)} className="rounded-xl border border-ink/10 bg-white px-3 py-2 text-xs" placeholder="Leave reason" />
        <button disabled={busy || !doctorId} onClick={addLeave} className="rounded-xl bg-ink px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-white disabled:opacity-40">Confirm leave</button>
      </div>
    </div>
    <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {leaveRows.length === 0 ? <p className="text-xs text-ink/45">No confirmed doctor leave for {date}.</p> : leaveRows.map(x =>
        <div key={x.doctor_id} className="flex items-center justify-between rounded-xl bg-white p-3">
          <div><p className="text-sm font-semibold">{x.doctor_name}</p><p className="text-[10px] text-ink/50">{x.reason || 'Confirmed leave'}</p></div>
          <button disabled={busy} onClick={() => cancelLeave(x.doctor_id)} className="rounded-lg border border-ink/10 px-2 py-1 text-[9px] uppercase tracking-wider">Cancel leave</button>
        </div>
      )}
    </div>
  </div>
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>)
