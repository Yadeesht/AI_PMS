import { useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import './App.css'

type OccupancyData = {
  date: string
  total_rooms: number
  occupied_count: number
  vacant_count: number
  maintenance_count: number
  occupancy_pct: number
  vacant_rooms: string[]
  out_of_service_rooms: string[]
}

type RevenueData = {
  period: string
  date?: string
  total_revenue?: number
  room_revenue?: number
  rooms_occupied?: number
  occupancy_pct?: number
  revpar?: number
}

type MaintenanceTicket = {
  ticket_id: string
  room_number: string
  reported_by: string
  issue: string
  category: string
  priority: 'low' | 'medium' | 'high' | 'critical'
  status: 'open' | 'in_progress' | 'resolved'
  reported_at: string
  assigned_vendor?: string | null
  estimated_cost?: number | null
  notes?: string | null
}

type MaintenanceData = {
  count: number
  overdue_count: number
  tickets: MaintenanceTicket[]
}

type DashboardData = {
  occupancy: OccupancyData
  revenue: RevenueData
  maintenance: MaintenanceData
}

type ChatMessage = {
  role: 'assistant' | 'user'
  content: string
}

// const rawApiBase =
//   import.meta.env.VITE_API_URL ??
//   import.meta.env.VITE_API_BASE ??
//   'http://localhost:8000'
// const API_BASE = rawApiBase.replace(/\/+$/, '')
const API_BASE = "http://65.1.64.63:4321";

const navItems = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    iconUrl: 'https://unpkg.com/@tabler/icons@2.47.0/icons/home.svg',
  },
  {
    id: 'chat',
    label: 'AI Chat',
    iconUrl: 'https://unpkg.com/@tabler/icons@2.47.0/icons/messages.svg',
  },
  {
    id: 'maintenance',
    label: 'Property Services',
    iconUrl: 'https://unpkg.com/@tabler/icons@2.47.0/icons/tool.svg',
  },
  {
    id: 'pricing',
    label: 'Market Analysis',
    iconUrl: 'https://unpkg.com/@tabler/icons@2.47.0/icons/chart-line.svg',
  },
  {
    id: 'documents',
    label: 'Documents',
    iconUrl: 'https://unpkg.com/@tabler/icons@2.47.0/icons/folder.svg',
  },
] as const

const suggestedPrompts = [
  "What's today's occupancy by unit?",
  'Any overdue service requests?',
  'Generate property briefing',
]

const vendorOptions = [
  'Austin HVAC Pro',
  'Lone Star Plumbing',
  'Capitol Electricians',
  'QuickFix General',
  'Austin Elevators LLC',
]

const competitorRates = [
  { name: 'Cedar Lofts', standard: 189, deluxe: 229, suite: 349 },
  { name: 'Riverwalk Residences', standard: 175, deluxe: 210, suite: 320 },
  { name: 'Crestline Commons', standard: 182, deluxe: 219, suite: 335 },
  { name: 'The Grove Collection', standard: 169, deluxe: 205, suite: 310 },
  { name: 'Market Square Flats', standard: 155, deluxe: 189, suite: 275 },
]

const currentRates = { standard: 149, deluxe: 179, suite: 299 }
const recommendedRates = { standard: 169, deluxe: 199, suite: 299 }

const rateLabels = {
  standard: 'Studio',
  deluxe: '2 Bed',
  suite: 'Penthouse',
} as const

const documentsList = [
  {
    name: 'invoice_austin_hvac_pro_may2026',
    status: 'Unpaid',
    amount: '$974',
  },
  { name: 'invoice_lone_star_plumbing', status: 'Paid', amount: '$389' },
  { name: 'contract_quickfix_general_2026', status: 'Active', amount: 'N/A' },
  { name: 'property_management_license_2026', status: 'Active', amount: 'N/A' },
  { name: 'commercial_property_insurance', status: 'Active', amount: '$28.4K' },
]

const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 }

const formatCurrency = (value?: number) =>
  value !== undefined && value !== null
    ? value.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
    : '$0'

const formatTime = (date: Date) =>
  date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

const formatDate = (date: Date) =>
  date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

function App() {
  const [activePage, setActivePage] = useState<(typeof navItems)[number]['id']>(
    'dashboard',
  )
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [dashboardLoading, setDashboardLoading] = useState(true)
  const [briefing, setBriefing] = useState('')
  const [briefingLoading, setBriefingLoading] = useState(false)
  const [timeNow, setTimeNow] = useState(new Date())

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content:
        "Good morning! I'm your property AI. Ask me anything about today's portfolio operations.",
    },
  ])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const chatEndRef = useRef<HTMLDivElement | null>(null)

  const [maintenanceFilter, setMaintenanceFilter] = useState('all')
  const [pricingNote, setPricingNote] = useState('')
  const [pricingLoading, setPricingLoading] = useState(false)

  const [uploadState, setUploadState] = useState('')
  const [docQuestion, setDocQuestion] = useState('')
  const [docAnswer, setDocAnswer] = useState('')

  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  const navOrder = navItems.map((item) => item.id)
  const activeIndex = navOrder.indexOf(activePage)

  useEffect(() => {
    const timer = setInterval(() => setTimeNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        setDashboardLoading(true)
        const response = await fetch(`${API_BASE}/dashboard`)
        if (!response.ok) throw new Error('Dashboard fetch failed')
        const data = (await response.json()) as DashboardData
        setDashboard(data)
      } catch (error) {
        console.error(error)
      } finally {
        setDashboardLoading(false)
      }
    }

    fetchDashboard()
  }, [])

  useEffect(() => {
    if (!dashboard || briefing) return
    const fetchBriefing = async () => {
      try {
        setBriefingLoading(true)
        const response = await fetch(`${API_BASE}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: 'Generate property briefing for the portfolio' }),
        })
        if (!response.ok) throw new Error('Briefing fetch failed')
        const data = await response.json()
        setBriefing(data.reply ?? '')
      } catch (error) {
        console.error(error)
      } finally {
        setBriefingLoading(false)
      }
    }

    fetchBriefing()
  }, [dashboard, briefing])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages, chatLoading])

  useEffect(() => {
    setIsSidebarOpen(false)
  }, [activePage])

  const handleTouchStart = (event: React.TouchEvent) => {
    const touch = event.touches[0]
    if (!touch) return
    touchStartRef.current = { x: touch.clientX, y: touch.clientY }
  }

  const handleTouchEnd = (event: React.TouchEvent) => {
    if (isSidebarOpen || !touchStartRef.current) return
    const touch = event.changedTouches[0]
    if (!touch) return
    const deltaX = touch.clientX - touchStartRef.current.x
    const deltaY = touch.clientY - touchStartRef.current.y
    touchStartRef.current = null

    if (Math.abs(deltaX) < 60 || Math.abs(deltaX) < Math.abs(deltaY) * 1.5) {
      return
    }

    if (deltaX < 0 && activeIndex < navOrder.length - 1) {
      setActivePage(navOrder[activeIndex + 1])
    }

    if (deltaX > 0 && activeIndex > 0) {
      setActivePage(navOrder[activeIndex - 1])
    }
  }

  useEffect(() => {
    if (activePage !== 'pricing' || pricingNote) return
    const fetchPricing = async () => {
      try {
        setPricingLoading(true)
        const response = await fetch(`${API_BASE}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: 'suggest pricing for residential units this week' }),
        })
        if (!response.ok) throw new Error('Pricing fetch failed')
        const data = await response.json()
        setPricingNote(data.reply ?? '')
      } catch (error) {
        console.error(error)
      } finally {
        setPricingLoading(false)
      }
    }

    fetchPricing()
  }, [activePage, pricingNote])

  const sendChat = async (message: string) => {
    if (!message.trim() || chatLoading) return
    setChatMessages((prev) => [...prev, { role: 'user', content: message }])
    setChatInput('')
    try {
      setChatLoading(true)
      const response = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      })
      if (!response.ok) throw new Error('Chat request failed')
      const data = await response.json()
      setChatMessages((prev) => [...prev, { role: 'assistant', content: data.reply }])
    } catch (error) {
      console.error(error)
      setChatMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Something went wrong. Please try again in a moment.',
        },
      ])
    } finally {
      setChatLoading(false)
    }
  }

  const handleUpload = async (file?: File) => {
    if (!file) return
    try {
      setUploadState('Uploading...')
      const payload = new FormData()
      payload.append('file', file)
      const response = await fetch(`${API_BASE}/documents/upload`, {
        method: 'POST',
        body: payload,
      })
      if (!response.ok) throw new Error('Upload failed')
      const data = await response.json()
      setUploadState(`Uploaded ${data.filename}`)
    } catch (error) {
      console.error(error)
      setUploadState('Upload failed. Try again.')
    }
  }

  const handleDocQuestion = async () => {
    if (!docQuestion.trim()) return
    try {
      setDocAnswer('Thinking...')
      const response = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: docQuestion }),
      })
      if (!response.ok) throw new Error('Doc question failed')
      const data = await response.json()
      setDocAnswer(data.reply ?? '')
    } catch (error) {
      console.error(error)
      setDocAnswer('Unable to answer right now.')
    }
  }

  const maintenanceTickets = dashboard?.maintenance?.tickets ?? []

  const filteredTickets = useMemo(() => {
    if (maintenanceFilter === 'all') return maintenanceTickets
    if (maintenanceFilter === 'open') {
      return maintenanceTickets.filter((ticket) => ticket.status === 'open')
    }
    return maintenanceTickets.filter((ticket) => ticket.status === 'in_progress')
  }, [maintenanceFilter, maintenanceTickets])

  const alertTickets = [...maintenanceTickets]
    .filter((ticket) => ticket.status !== 'resolved')
    .sort(
      (a, b) =>
        priorityOrder[b.priority] - priorityOrder[a.priority] ||
        new Date(b.reported_at).getTime() - new Date(a.reported_at).getTime(),
    )
    .slice(0, 3)

  const occupancy = dashboard?.occupancy
  const revenue = dashboard?.revenue

  return (
    <div className={`app-shell ${isSidebarOpen ? 'sidebar-open' : ''}`}>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">
            <img
              src="https://unpkg.com/@tabler/icons@2.47.0/icons/building-community.svg"
              alt="Skyline Estates"
            />
          </div>
          <div>
            <p className="brand-title">Skyline Estates AI</p>
            <p className="brand-subtitle">Property Operations</p>
          </div>
        </div>
        <nav className="nav">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${activePage === item.id ? 'active' : ''}`}
              onClick={() => setActivePage(item.id)}
              type="button"
            >
              <img className="nav-icon" src={item.iconUrl} alt={item.label} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-card">
          <p className="sidebar-card-title">Live Ops Pulse</p>
          <p className="sidebar-card-value">
            {occupancy ? `${occupancy.occupancy_pct}%` : '--'}
          </p>
          <p className="sidebar-card-subtext">Units occupied this morning</p>
        </div>
      </aside>
      <button
        type="button"
        className="sidebar-overlay"
        aria-label="Close menu"
        onClick={() => setIsSidebarOpen(false)}
      />

      <main
        className="main"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <header className="topbar">
          <div>
            <p className="eyebrow">Skyline Estates Portfolio</p>
            <h1>Portfolio Command Center</h1>
            <p className="muted">Austin, TX</p>
          </div>
          <button
            type="button"
            className="menu-toggle"
            onClick={() => setIsSidebarOpen((prev) => !prev)}
            aria-label="Toggle menu"
          >
            <img
              src="https://unpkg.com/@tabler/icons@2.47.0/icons/menu-2.svg"
              alt="Menu"
            />
          </button>
          <div className="time-card">
            <p className="time-label">{formatDate(timeNow)}</p>
            <p className="time-value">{formatTime(timeNow)}</p>
          </div>
        </header>

        {activePage === 'dashboard' && (
          <section className="page">
            <div className="stats-grid">
              <div className="stat-card">
                <p className="stat-value">
                  {dashboardLoading ? '--' : `${occupancy?.occupancy_pct ?? 0}%`}
                </p>
                <p className="stat-label">Occupancy</p>
                <p className="stat-meta">
                  {occupancy?.occupied_count ?? 0} units occupied
                </p>
              </div>
              <div className="stat-card">
                <p className="stat-value">
                  {dashboardLoading ? '--' : formatCurrency(revenue?.total_revenue)}
                </p>
                <p className="stat-label">Rental Revenue Today</p>
                <p className="stat-meta">
                  RevPAU {revenue?.revpar ? `$${revenue.revpar}` : '--'}
                </p>
              </div>
              <div className="stat-card">
                <p className="stat-value">
                  {dashboardLoading ? '--' : dashboard?.maintenance?.count ?? 0}
                </p>
                <p className="stat-label">Service Requests</p>
                <p className="stat-meta">
                  {dashboard?.maintenance?.overdue_count ?? 0} overdue
                </p>
              </div>
              <div className="stat-card">
                <p className="stat-value">
                  {dashboardLoading ? '--' : occupancy?.occupied_count ?? 0}
                </p>
                <p className="stat-label">Units Filled</p>
                <p className="stat-meta">Out of {occupancy?.total_rooms ?? 0}</p>
              </div>
            </div>

            <div className="grid-2">
              <div className="panel">
                <div className="panel-header">
                  <h2>AI Property Briefing</h2>
                  <span className="chip">Auto-generated</span>
                </div>
                <div className="briefing">
                  {briefingLoading && <p className="muted">Building briefing...</p>}
                  {!briefingLoading && briefing && (
                    <ReactMarkdown>{briefing}</ReactMarkdown>
                  )}
                  {!briefingLoading && !briefing && (
                    <p className="muted">Ask the AI to generate a briefing.</p>
                  )}
                </div>
              </div>
              <div className="panel">
                <div className="panel-header">
                  <h2>Active Service Alerts</h2>
                  <span className="chip">Priority</span>
                </div>
                <div className="alerts">
                  {alertTickets.length === 0 && (
                    <p className="muted">No active alerts right now.</p>
                  )}
                  {alertTickets.map((ticket) => (
                    <div className={`alert ${ticket.priority}`} key={ticket.ticket_id}>
                      <div>
                        <p className="alert-title">
                          {ticket.issue} - Unit {ticket.room_number}
                        </p>
                        <p className="alert-meta">
                          {ticket.assigned_vendor ? ticket.assigned_vendor : 'Unassigned'}
                        </p>
                      </div>
                      <span className="badge">{ticket.priority}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {activePage === 'chat' && (
          <section className="page">
            <div className="chat-panel">
              <div className="chat-header">
                <h2>Property AI Assistant</h2>
                <p className="muted">Portfolio questions, answered instantly.</p>
              </div>
              <div className="chat-window">
                {chatMessages.map((message, index) => (
                  <div
                    key={`${message.role}-${index}`}
                    className={`chat-bubble ${message.role}`}
                  >
                    {message.role === 'assistant' ? (
                      <ReactMarkdown>{message.content}</ReactMarkdown>
                    ) : (
                      <p>{message.content}</p>
                    )}
                  </div>
                ))}
                {chatLoading && (
                  <div className="chat-bubble assistant typing">
                    <span className="dot"></span>
                    <span className="dot"></span>
                    <span className="dot"></span>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
              <div className="chat-suggestions">
                {suggestedPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    className="chip"
                    type="button"
                    onClick={() => sendChat(prompt)}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
              <div className="chat-input">
                <input
                  value={chatInput}
                  onChange={(event) => setChatInput(event.target.value)}
                  placeholder="Ask anything..."
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      sendChat(chatInput)
                    }
                  }}
                />
                <button type="button" onClick={() => sendChat(chatInput)}>
                  Send
                </button>
              </div>
            </div>
          </section>
        )}

        {activePage === 'maintenance' && (
          <section className="page">
            <div className="panel">
              <div className="panel-header maintenance-header">
                <h2>Property Services</h2>
                <div className="filters">
                  {['all', 'open', 'in_progress'].map((filter) => (
                    <button
                      key={filter}
                      className={`filter ${maintenanceFilter === filter ? 'active' : ''}`}
                      type="button"
                      onClick={() => setMaintenanceFilter(filter)}
                    >
                      {filter === 'in_progress' ? 'In Progress' : filter}
                    </button>
                  ))}
                </div>
              </div>
              <div className="ticket-list">
                {filteredTickets.map((ticket) => (
                  <div className="ticket" key={ticket.ticket_id}>
                    <div className="ticket-main">
                      <div className={`badge ${ticket.priority}`}>{ticket.priority}</div>
                      <div>
                        <p className="ticket-title">
                          {ticket.issue} - Unit {ticket.room_number}
                        </p>
                        <p className="ticket-meta">
                          {ticket.assigned_vendor ?? 'Unassigned'} - Est. $
                          {ticket.estimated_cost ?? 0}
                        </p>
                        <p className="ticket-meta muted">
                          Reported {new Date(ticket.reported_at).toLocaleTimeString('en-US', {
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                    </div>
                    <div className="ticket-actions">
                      <select defaultValue="">
                        <option value="" disabled>
                          Assign Vendor
                        </option>
                        {vendorOptions.map((vendor) => (
                          <option key={vendor} value={vendor}>
                            {vendor}
                          </option>
                        ))}
                      </select>
                      <button type="button">Resolve</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {activePage === 'pricing' && (
          <section className="page">
            <div className="panel pricing-panel">
              <div className="panel-header">
                <h2>Market Intelligence</h2>
                <span className="chip">Portfolio Snapshot - May 6</span>
              </div>
              <div className="pricing-rec">
                <div>
                  <p className="eyebrow">AI Recommendation</p>
                  {pricingLoading && <p className="muted">Calculating insights...</p>}
                  {!pricingLoading && (
                    <ReactMarkdown>
                      {pricingNote ||
                        "You're priced $20-$25 below market average. Nearby comps sit near 84% occupancy. Raise Studio pricing to $169 for better upside this week."}
                    </ReactMarkdown>
                  )}
                </div>
                <button type="button">Accept Recommendation</button>
              </div>
              <div className="pricing-table">
                <div className="pricing-row header">
                  <span>Property</span>
                  <span>{rateLabels.standard}</span>
                  <span>{rateLabels.deluxe}</span>
                  <span>{rateLabels.suite}</span>
                </div>
                {competitorRates.map((property) => (
                  <div className="pricing-row" key={property.name}>
                    <span>{property.name}</span>
                    <span>${property.standard}</span>
                    <span>${property.deluxe}</span>
                    <span>${property.suite}</span>
                  </div>
                ))}
                <div className="pricing-row highlight">
                  <span>Us (current)</span>
                  <span>${currentRates.standard}</span>
                  <span>${currentRates.deluxe}</span>
                  <span>${currentRates.suite}</span>
                </div>
                <div className="pricing-row target">
                  <span>Recommended</span>
                  <span>${recommendedRates.standard}</span>
                  <span>${recommendedRates.deluxe}</span>
                  <span>${recommendedRates.suite}</span>
                </div>
              </div>
            </div>
          </section>
        )}

        {activePage === 'documents' && (
          <section className="page">
            <div className="panel documents-panel">
              <div className="panel-header">
                <h2>Document Intelligence</h2>
                <span className="chip">Leases and Contracts</span>
              </div>
              <div className="upload-box">
                <div>
                  <p className="upload-title">Drop a PDF here or click to upload</p>
                  <p className="muted">Leases - Contracts - Compliance</p>
                  {uploadState && <p className="upload-state">{uploadState}</p>}
                </div>
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={(event) => handleUpload(event.target.files?.[0])}
                />
              </div>
              <div className="documents-grid">
                <div className="document-table">
                  <div className="document-row header">
                    <span>Document</span>
                    <span>Status</span>
                      <span>Amount</span>
                  </div>
                  {documentsList.map((doc) => (
                    <div className="document-row" key={doc.name}>
                      <span>{doc.name}</span>
                      <span>{doc.status}</span>
                      <span>{doc.amount}</span>
                    </div>
                  ))}
                </div>
                <div className="doc-ask">
                  <p className="doc-ask-title">Ask about your portfolio documents</p>
                  <div className="doc-ask-input">
                    <input
                      value={docQuestion}
                      onChange={(event) => setDocQuestion(event.target.value)}
                      placeholder='e.g. "Which leases are unpaid?"'
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          handleDocQuestion()
                        }
                      }}
                    />
                    <button type="button" onClick={handleDocQuestion}>
                      Ask
                    </button>
                  </div>
                  {docAnswer && <p className="doc-answer">{docAnswer}</p>}
                </div>
              </div>
            </div>
          </section>
        )}
        <nav className="mobile-nav" aria-label="Primary">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`mobile-nav-item ${activePage === item.id ? 'active' : ''}`}
              onClick={() => setActivePage(item.id)}
            >
              <img
                className="mobile-nav-icon"
                src={item.iconUrl}
                alt={item.label}
              />
              <span className="mobile-nav-label">{item.label}</span>
            </button>
          ))}
        </nav>
      </main>
    </div>
  )
}

export default App
