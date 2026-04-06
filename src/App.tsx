import { useState, useEffect } from 'react'
import './App.css'

// ============ Config ============
const API_BASE = 'http://localhost:3000'

// ============ Types ============
interface Book {
  id: string
  title: string
  genre: string
  chapters: number
  words: number
  status: 'writing' | 'paused' | 'finished'
  chapterFiles?: { file: string; title: string; words: number }[]
}

interface Genre {
  value: string
  label: string
  icon: string
  desc: string
  dimensions: number
}

interface PipelineEvent {
  type: string
  message?: string
  content?: string
  issues?: string[]
  score?: number
  patterns?: string[]
  chapter?: number
  file?: string
  words?: number
  error?: string
}

// ============ Genre List ============
const GENRES: Genre[] = [
  { value: 'xuanhuan', label: '玄幻', icon: '🐉', desc: '数值系统·战力体系·吞噬衰减', dimensions: 26 },
  { value: 'xianxia', label: '仙侠', icon: '⚔️', desc: '修炼节奏·法宝体系·天道规则', dimensions: 26 },
  { value: 'urban', label: '都市', icon: '🌆', desc: '年代考据·商战社交·法律术语', dimensions: 24 },
  { value: 'horror', label: '恐怖', icon: '👻', desc: '氛围递进·恐惧层级·克制叙事', dimensions: 22 },
  { value: 'tongren', label: '同人', icon: '📖', desc: '原著角色·二创·世界观延续', dimensions: 20 },
  { value: 'kehuan', label: '科幻', icon: '🚀', desc: '科技推演·未来设定·硬核逻辑', dimensions: 24 },
  { value: 'other', label: '通用', icon: '📚', desc: '最小化兜底', dimensions: 18 },
]

// ============ Pipeline Events Map ============
const EVENT_LABELS: Record<string, string> = {
  'status': '⚙️',
  'outline': '📐',
  'draft': '✍️',
  'audit': '🔍',
  'revised': '🔧',
  'ai-tells': '🤖',
  'done': '✅',
  'error': '❌',
}

// ============ API ============
async function apiFetch(path: string, options?: RequestInit): Promise<any> {
  const res = await fetch(API_BASE + path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  } as RequestInit)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
    throw new Error(err.error || `API错误 ${res.status}`)
  }
  return res.json()
}

// ============ Components ============

function Header({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="header">
      <div className="header-text">
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
    </div>
  )
}

function BottomNav({ active, onNav }: { active: string; onNav: (t: string) => void }) {
  const items = [
    { id: 'home', label: '首页', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/></svg> },
    { id: 'write', label: '写作', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg> },
    { id: 'books', label: '书架', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg> },
    { id: 'settings', label: '设置', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06A1.65 1.65 0 0019.4 15 1.65 1.65 0 0019 13H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg> },
  ]
  return (
    <nav className="bottom-nav">
      {items.map(item => (
        <button key={item.id} className={'nav-item' + (active === item.id ? ' active' : '')} onClick={() => onNav(item.id)}>
          {item.icon}<span>{item.label}</span>
        </button>
      ))}
    </nav>
  )
}

// Home Tab
function HomeTab({ books, onStartWrite, onServerStatus }: {
  books: Book[]
  onStartWrite: () => void
  onServerStatus: { ok: boolean; version: string }
}) {
  const totalWords = books.reduce((s, b) => s + b.words, 0)
  const writingBooks = books.filter(b => b.status === 'writing').length

  return (
    <div className="tab-content">
      <div className="hero-card">
        <div className="hero-logo">📝</div>
        <h2>InkOS 移动版</h2>
        <p>AI 多 Agent 小说创作系统</p>
        <div className="server-badge" style={{ background: onServerStatus.ok ? 'rgba(74,222,128,0.15)' : 'rgba(248,113,113,0.15)', color: onServerStatus.ok ? '#4ade80' : '#f87171', marginBottom: 12 }}>
          {onServerStatus.ok ? '🟢 服务已连接' : '🔴 服务未启动'}
        </div>
        <button className="primary-btn" onClick={onStartWrite} disabled={!onServerStatus.ok}>
          🚀 开始创作
        </button>
      </div>
      <div className="stats-grid">
        <div className="stat-card"><div className="stat-num">{books.length}</div><div className="stat-label">作品数</div></div>
        <div className="stat-card"><div className="stat-num">{writingBooks}</div><div className="stat-label">创作中</div></div>
        <div className="stat-card"><div className="stat-num">{(totalWords / 10000).toFixed(1)}万</div><div className="stat-label">总字数</div></div>
      </div>
      {books.slice(0, 3).map(book => {
        const g = GENRES.find(g => g.value === book.genre)
        return (
          <div key={book.id} className="book-card">
            <div className="book-cover" style={{ background: 'hsl(' + ((book.id.charCodeAt(0) * 37) % 360) + ', 60%, 40%)' }}>
              {g?.icon || '📖'}
            </div>
            <div className="book-info">
              <h4>{book.title}</h4>
              <p>{g?.label || book.genre} · {book.chapters}章 · {book.words.toLocaleString()}字</p>
            </div>
            <span className={'status-badge ' + book.status}>{book.status === 'writing' ? '创作中' : book.status === 'paused' ? '已暂停' : '已完成'}</span>
          </div>
        )
      })}
      {books.length === 0 && (
        <div className="empty-state"><p>还没有作品</p><button className="secondary-btn" onClick={onStartWrite}>创建第一本书</button></div>
      )}
    </div>
  )
}

// Write Tab — Full Pipeline
function WriteTab({ books, onRefresh }: {
  books: Book[]
  onRefresh: () => void
}) {
  const [selectedBook, setSelectedBook] = useState<Book | null>(null)
  const [context, setContext] = useState('')
  const [generating, setGenerating] = useState(false)
  const [events, setEvents] = useState<PipelineEvent[]>([])
  const [currentDraft, setCurrentDraft] = useState('')
  const [showBookSelect, setShowBookSelect] = useState(false)
  const esRef = useState<any>(null)

  function handleGenerate() {
    if (!selectedBook) { setShowBookSelect(true); return }
    setGenerating(true)
    setEvents([])
    setCurrentDraft('')

    const es = new EventSource(`${API_BASE}/books/${selectedBook.id}/write?context=${encodeURIComponent(context)}`)
    esRef[0] = es

    es.onmessage = (e) => {
      try {
        const data: PipelineEvent = JSON.parse(e.data)
        setEvents(prev => [...prev, data])
        if (data.type === 'draft') setCurrentDraft(data.content || '')
        if (data.type === 'done' || data.type === 'error') {
          setGenerating(false)
          es.close()
          if (data.type === 'done') onRefresh()
        }
      } catch {}
    }
    es.onerror = () => {
      setGenerating(false)
      setEvents(prev => [...prev, { type: 'error', message: '连接失败' }])
      es.close()
    }
  }

  function stopGeneration() {
    if (esRef[0]) { esRef[0].close(); setGenerating(false) }
  }

  const g = selectedBook ? GENRES.find(g => g.value === selectedBook.genre) : null

  return (
    <div className="tab-content">
      <Header title="AI 写作" subtitle="多 Agent 协作管线" />
      <div className="write-panel">
        {/* Book selector */}
        {!selectedBook ? (
          <div className="select-book-card" onClick={() => setShowBookSelect(true)}>
            <span className="select-icon">📚</span>
            <div><h4>选择作品</h4><p>点击选择要写作的书名</p></div>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
          </div>
        ) : (
          <div className="selected-book-chip" onClick={() => !generating && setShowBookSelect(true)}>
            <span>{g?.icon}</span>
            <span>{selectedBook.title}</span>
            {!generating && <button onClick={(e) => { e.stopPropagation(); setSelectedBook(null) }}>×</button>}
          </div>
        )}

        {/* Genre badge */}
        {selectedBook && (
          <div className="genre-badge">
            <span>{g?.icon} {g?.label}</span>
            <span style={{ color: '#888', fontSize: '0.72rem' }}>26维度审计 · AI痕迹检测 · 连续性核查</span>
          </div>
        )}

        {/* Context input */}
        <div className="form-group">
          <label>创作指导（可选）</label>
          <textarea
            value={context}
            onChange={e => setContext(e.target.value)}
            placeholder={selectedBook ? '例如：重点写师徒矛盾，主角遭遇瓶颈…' : '先选择作品'}
            rows={3}
            disabled={!selectedBook || generating}
          />
        </div>

        {/* Pipeline log */}
        {events.length > 0 && (
          <div className="pipeline-log">
            <div className="pipeline-header">
              <span>⚙️ 创作管线</span>
              {generating && <span className="generating-dot">●</span>}
            </div>
            {events.map((e, i) => (
              <div key={i} className={'pipeline-event ' + e.type}>
                <span className="pipeline-icon">{EVENT_LABELS[e.type] || '📌'}</span>
                <div className="pipeline-content">
                  {e.message && <span className="pipeline-msg">{e.message}</span>}
                  {e.issues && <span className="pipeline-issues">{e.issues.length} 个问题待修复</span>}
                  {e.score !== undefined && <span className="pipeline-score">AI痕迹: {(e.score * 100).toFixed(0)}%</span>}
                  {e.chapter && <span className="pipeline-chapter">第{e.chapter}章完成</span>}
                  {e.error && <span className="pipeline-error">❌ {e.error}</span>}
                </div>
              </div>
            ))}
            {currentDraft && (
              <div className="draft-preview">
                <div className="draft-label">正文预览</div>
                <pre className="draft-text">{currentDraft.slice(0, 500)}{currentDraft.length > 500 ? '…' : ''}</pre>
              </div>
            )}
          </div>
        )}

        {/* Action buttons */}
        {generating ? (
          <button className="stop-btn" onClick={stopGeneration}>⏹ 停止</button>
        ) : (
          <button
            className="primary-btn generate-btn"
            onClick={handleGenerate}
            disabled={!selectedBook}
          >
            ✍️ {selectedBook ? '启动完整管线' : '先选择作品'}
          </button>
        )}
      </div>

      {/* Book select modal */}
      {showBookSelect && (
        <div className="modal-overlay" onClick={() => setShowBookSelect(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>选择作品</h3>
              <button onClick={() => setShowBookSelect(false)}>×</button>
            </div>
            <div className="modal-body">
              {books.length === 0 ? (
                <p className="empty-state">还没有作品</p>
              ) : books.map(book => {
                const genre = GENRES.find(g => g.value === book.genre)
                return (
                  <div key={book.id} className="book-option" onClick={() => { setSelectedBook(book); setShowBookSelect(false) }}>
                    <span className="book-option-icon">{genre?.icon}</span>
                    <div><h4>{book.title}</h4><p>{genre?.label} · {book.chapters}章</p></div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Books Tab
function BooksTab({ books, onRefresh, onWrite }: { books: Book[]; onRefresh: () => void; onWrite: (id: string) => void }) {
  const [showCreate, setShowCreate] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newGenre, setNewGenre] = useState('xuanhuan')
  const [creating, setCreating] = useState(false)
  const [expandedBook, setExpandedBook] = useState<string | null>(null)

  async function createBook() {
    if (!newTitle.trim()) return
    setCreating(true)
    try {
      await apiFetch('/books', {
        method: 'POST',
        body: JSON.stringify({ title: newTitle, genre: newGenre }),
      })
      setNewTitle('')
      setShowCreate(false)
      onRefresh()
    } catch(e: unknown) {
      alert((e as Error).message)
    } finally {
      setCreating(false)
    }
  }

  async function deleteBook(id: string) {
    if (!confirm('删除后无法恢复，确定删除？')) return
    try {
      await apiFetch('/books/' + id, { method: 'DELETE' })
      onRefresh()
    } catch(e: unknown) {
      alert((e as Error).message)
    }
  }

  return (
    <div className="tab-content">
      <Header title="书架" subtitle={books.length + ' 部作品'} />
      <div className="section">
        {books.map(book => {
          const genre = GENRES.find(g => g.value === book.genre)
          const isExpanded = expandedBook === book.id
          return (
            <div key={book.id} className="book-item">
              <div className="book-item-main" onClick={() => setExpandedBook(isExpanded ? null : book.id)}>
                <div className="book-item-left">
                  <div className="book-cover-sm" style={{ background: 'hsl(' + ((book.id.charCodeAt(0) * 37) % 360) + ', 55%, 38%)' }}>
                    {genre?.icon || '📖'}
                  </div>
                  <div className="book-item-info">
                    <h4>{book.title}</h4>
                    <p>{genre?.label} · {book.chapters}章 · {(book.words / 1000).toFixed(0)}k字</p>
                  </div>
                </div>
                <span style={{ color: '#555', fontSize: '1rem' }}>{isExpanded ? '▲' : '▼'}</span>
              </div>
              {isExpanded && (
                <div className="book-item-actions">
                  <button className="action-btn primary" onClick={() => onWrite(book.id)}>✍️ 写下一章</button>
                  <button className="action-btn danger" onClick={() => deleteBook(book.id)}>🗑 删除</button>
                </div>
              )}
            </div>
          )
        })}
        {books.length === 0 && <div className="empty-state"><p>书架空空</p></div>}
      </div>
      <button className="fab" onClick={() => setShowCreate(true)}>+</button>

      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><h3>新建作品</h3><button onClick={() => setShowCreate(false)}>×</button></div>
            <div className="modal-body">
              <div className="form-group">
                <label>书名</label>
                <input type="text" value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="输入书名..." autoFocus />
              </div>
              <div className="form-group">
                <label>题材（决定创作规则）</label>
                <div className="genre-grid">
                  {GENRES.map(g => (
                    <button key={g.value} className={'genre-btn' + (newGenre === g.value ? ' active' : '')} onClick={() => setNewGenre(g.value)}>
                      <span>{g.icon}</span><span>{g.label}</span><span style={{ fontSize: '0.65rem', color: '#888' }}>{g.dimensions}维</span>
                    </button>
                  ))}
                </div>
              </div>
              <button className="primary-btn" onClick={createBook} disabled={creating || !newTitle.trim()}>
                {creating ? '创建中…' : '创建作品'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Settings Tab
function SettingsTab({ books, apiConfig, onSaveGlobal }: {
  books: Book[]
  apiConfig: { apiKey: string; baseUrl: string; model: string }
  onSaveGlobal: (c: typeof apiConfig) => void
}) {
  const [apiKey, setApiKey] = useState(apiConfig.apiKey)
  const [baseUrl, setBaseUrl] = useState(apiConfig.baseUrl)
  const [model, setModel] = useState(apiConfig.model)
  const [saved, setSaved] = useState(false)

  function handleSave() {
    onSaveGlobal({ apiKey, baseUrl, model })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="tab-content">
      <Header title="设置" subtitle="API 配置与偏好" />
      <div className="settings-section">
        <h3 className="section-title">BaiShan API 配置（全局）</h3>
        <div className="settings-card">
          <div className="form-group">
            <label>API Key</label>
            <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="sk-xxxxxxxxxxxxxxxx" />
            <small>在 <a href="https://ai.baishan.com" target="_blank" rel="noopener">ai.baishan.com</a> 获取</small>
          </div>
          <div className="form-group">
            <label>Base URL</label>
            <input type="text" value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder="https://ai.baishan.com/v1" />
          </div>
          <div className="form-group">
            <label>模型名称</label>
            <input type="text" value={model} onChange={e => setModel(e.target.value)} placeholder="baishan-llama" />
            <small>ai.baishan.com/market/models 查看可用模型</small>
          </div>
          <button className={'primary-btn' + (saved ? ' saved' : '')} onClick={handleSave}>{saved ? '✓ 已保存' : '保存并应用'}</button>
        </div>
      </div>
      <div className="settings-section">
        <h3 className="section-title">每本书独立配置</h3>
        <div className="settings-card">
          <p style={{ fontSize: '0.82rem', color: 'var(--text2)', marginBottom: 12 }}>
            每本书在「书架」展开后可单独配置 API，也可使用全局配置。
          </p>
          {books.slice(0, 3).map(book => (
            <div key={book.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.88rem' }}>{book.title}</span>
              <span style={{ fontSize: '0.72rem', color: '#888' }}>使用全局配置</span>
            </div>
          ))}
        </div>
      </div>
      <div className="settings-section">
        <h3 className="section-title">关于 InkOS 管线</h3>
        <div className="settings-card info-card">
          <div className="pipeline-flow">
            {['📡 雷达', '🏗 建筑', '✍️ 写作', '🔍 审计', '🔧 修订', '🤖 AI检测'].map((step, i) => (
              <span key={i} className="pipeline-step">{step}</span>
            ))}
          </div>
          <p style={{ fontSize: '0.78rem', color: 'var(--text3)', marginTop: 8 }}>每章自动运行完整管线：雷达→建筑→写手→审计→修订→AI痕迹检测，26维度连续性审计</p>
          <p className="version">内核：@actalk/inkos-core 0.3.5</p>
        </div>
      </div>
    </div>
  )
}

// ============ Main App ============
function App() {
  const [activeTab, setActiveTab] = useState('home')
  const [books, setBooks] = useState<Book[]>([])
  const [serverStatus, setServerStatus] = useState({ ok: false, version: '' })
  const [apiConfig, setApiConfig] = useState({
    apiKey: localStorage.getItem('baishan_api_key') || '',
    baseUrl: localStorage.getItem('baishan_base_url') || 'https://ai.baishan.com/v1',
    model: localStorage.getItem('baishan_model') || 'baishan-llama',
  })

  useEffect(() => {
    refreshBooks()
    checkServer()
    const interval = setInterval(checkServer, 10000)
    return () => clearInterval(interval)
  }, [])

  function checkServer() {
    fetch(API_BASE + '/health', { signal: AbortSignal.timeout(3000) })
      .then(r => r.json())
      .then(d => setServerStatus({ ok: true, version: d.version || '' }))
      .catch(() => setServerStatus(s => ({ ...s, ok: false })))
  }

  function refreshBooks() {
    apiFetch('/books').then(d => setBooks(d.books || [])).catch(() => setBooks([]))
  }

  function handleSaveGlobal(config: typeof apiConfig) {
    setApiConfig(config)
    localStorage.setItem('baishan_api_key', config.apiKey)
    localStorage.setItem('baishan_base_url', config.baseUrl)
    localStorage.setItem('baishan_model', config.model)
  }

  function handleWrite(_bookId: string) {
    setActiveTab('write')
  }

  function handleStartWrite() {
    if (books.length === 0) setActiveTab('books')
    else setActiveTab('write')
  }

  return (
    <div className="app">
      <div className="screen">
        {activeTab === 'home' && <HomeTab books={books} onStartWrite={handleStartWrite} onServerStatus={serverStatus} />}
        {activeTab === 'write' && <WriteTab books={books} onRefresh={refreshBooks} />}
        {activeTab === 'books' && <BooksTab books={books} onRefresh={refreshBooks} onWrite={handleWrite} />}
        {activeTab === 'settings' && <SettingsTab books={books} apiConfig={apiConfig} onSaveGlobal={handleSaveGlobal} />}
      </div>
      <BottomNav active={activeTab} onNav={setActiveTab} />
    </div>
  )
}

export default App
