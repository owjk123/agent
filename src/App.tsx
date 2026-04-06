import { useState, useEffect } from 'react'
import './App.css'

// ============ Types ============
interface Book {
  id: string
  title: string
  genre: string
  chapters: number
  words: number
  status: 'writing' | 'paused' | 'finished'
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

// ============ API Config ============
const BAISHAN_API_BASE = 'https://ai.baishan.com/v1'

// ============ Genre Options ============
const GENRES = [
  { value: 'xuanhuan', label: '玄幻', icon: '🐉', desc: '数值系统、战力体系、同质吞噬衰减' },
  { value: 'xianxia', label: '仙侠', icon: '⚔️', desc: '修炼/悟道节奏、法宝体系、天道规则' },
  { value: 'dushi', label: '都市', icon: '🌆', desc: '年代考据、商战/社交驱动、法律术语' },
  { value: 'kongbu', label: '恐怖', icon: '👻', desc: '氛围递进、恐惧层级、克制叙事' },
  { value: 'tongren', label: '同人', icon: '📖', desc: '原著角色、二次创作、世界观延续' },
  { value: 'kehuan', label: '科幻', icon: '🚀', desc: '科技推演、未来设定、硬核逻辑' },
]

// ============ LLM Chat Function ============
async function chatWithLLM(
  apiKey: string,
  baseUrl: string,
  model: string,
  messages: ChatMessage[],
  onChunk: (text: string) => void
): Promise<string> {
  const response = await fetch(baseUrl + '/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey,
    },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      temperature: 0.7,
      max_tokens: 4096,
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error('API错误 ' + response.status + ': ' + err)
  }

  const reader = response.body?.getReader()
  if (!reader) throw new Error('无法读取响应流')

  const decoder = new TextDecoder()
  let fullContent = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const chunk = decoder.decode(value)
    const lines = chunk.split('\n')
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6)
        if (data === '[DONE]') continue
        try {
          const parsed = JSON.parse(data)
          const delta = parsed.choices?.[0]?.delta?.content
          if (delta) {
            fullContent += delta
            onChunk(delta)
          }
        } catch { /* skip malformed */ }
      }
    }
  }
  return fullContent
}

// ============ InkOS System Prompt ============
function getInkOSSystemPrompt(genre: string, bookTitle: string): string {
  const genreData = GENRES.find(g => g.value === genre)
  const label = genreData?.label || '通用'
  let style = ''
  if (genre === 'xuanhuan') {
    style = '- 避免: 火元从12缕增加到24缕 -> 改为: 手臂比先前有力了，握拳时指骨发紧\n- 避免: 修为突破到筑基期 -> 改为: 眉心一跳，周身灵气自行涌入'
  } else if (genre === 'dushi') {
    style = '- 避免: 迅速分析了当前的债务状况 -> 改为: 把那叠皱巴巴的白条翻了三遍\n- 避免: 他感到非常愤怒 -> 改为: 他把酒杯重重磕在桌上'
  } else if (genre === 'kongbu') {
    style = '- 避免: 感到一阵恐惧 -> 改为: 后颈的汗毛一根根立起来\n- 避免: 房间里非常安静 -> 改为: 墙上那座老挂钟不知何时停了'
  }
  return [
    '你是 InkOS 核心写手 AI，专为小说创作优化。',
    '',
    '题材：' + label,
    '书名：' + bookTitle,
    '',
    '创作铁律：',
    '1. 叙述者不替读者下结论，只写动作和感官',
    '2. 禁止分析报告式语言（核心动机、信息落差不入正文）',
    '3. AI标记词限频：仿佛/忽然/竟然/不禁/宛如/猛地，每3000字不超过1次',
    '4. 同一意象渲染不超过两轮',
    '5. 方法论术语不入正文',
    '6. 每3000字不少于8个角色动作/反应描写',
    '7. 对话必须带潜台词，不写废话',
    '',
    '语言风格（' + label + '题材）：',
    style,
    '',
    '输出格式：',
    '## 第[N]章 [章节标题]',
    '',
    '[正文...]',
  ].join('\n')
}

// ============ Components ============

function Header({ onBack, title, subtitle }: { onBack?: () => void; title: string; subtitle?: string }) {
  return (
    <div className="header">
      {onBack && (
        <button className="back-btn" onClick={onBack}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6"/>
          </svg>
        </button>
      )}
      <div className="header-text">
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
    </div>
  )
}

function BottomNav({ active, onNav }: { active: string; onNav: (tab: string) => void }) {
  const items = [
    { id: 'home', label: '首页', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/></svg> },
    { id: 'write', label: '写作', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg> },
    { id: 'books', label: '书架', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg> },
    { id: 'settings', label: '设置', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg> },
  ]
  return (
    <nav className="bottom-nav">
      {items.map(item => (
        <button key={item.id} className={'nav-item' + (active === item.id ? ' active' : '')} onClick={() => onNav(item.id)}>
          {item.icon}
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  )
}

function HomeTab({ books, onStartWrite }: { books: Book[]; onStartWrite: () => void }) {
  const totalWords = books.reduce((sum, b) => sum + b.words, 0)
  const writingBooks = books.filter(b => b.status === 'writing').length
  const recentBooks = books.slice(0, 3)

  return (
    <div className="tab-content">
      <div className="hero-card">
        <div className="hero-logo">📝</div>
        <h2>InkOS 移动版</h2>
        <p>AI 多智能体小说创作系统</p>
        <button className="primary-btn" onClick={onStartWrite}>🚀 开始创作</button>
      </div>
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-num">{books.length}</div>
          <div className="stat-label">作品数</div>
        </div>
        <div className="stat-card">
          <div className="stat-num">{writingBooks}</div>
          <div className="stat-label">创作中</div>
        </div>
        <div className="stat-card">
          <div className="stat-num">{(totalWords / 10000).toFixed(1)}万</div>
          <div className="stat-label">总字数</div>
        </div>
      </div>
      {recentBooks.length > 0 && (
        <div className="section">
          <h3 className="section-title">最近作品</h3>
          {recentBooks.map(book => {
            const genre = GENRES.find(g => g.value === book.genre)
            return (
              <div key={book.id} className="book-card">
                <div className="book-cover" style={{ background: 'hsl(' + ((book.id.charCodeAt(0) * 37) % 360) + ', 60%, 40%)' }}>
                  {genre?.icon || '📖'}
                </div>
                <div className="book-info">
                  <h4>{book.title}</h4>
                  <p>{genre?.label} · {book.chapters}章 · {book.words.toLocaleString()}字</p>
                </div>
                <span className={'status-badge ' + book.status}>
                  {book.status === 'writing' ? '创作中' : book.status === 'paused' ? '已暂停' : '已完成'}
                </span>
              </div>
            )
          })}
        </div>
      )}
      {books.length === 0 && (
        <div className="empty-state">
          <p>还没有作品</p>
          <button className="secondary-btn" onClick={onStartWrite}>创建第一本书</button>
        </div>
      )}
    </div>
  )
}

function WriteTab({ books, apiConfig, onChapterGenerated }: {
  books: Book[]
  apiConfig: { apiKey: string; baseUrl: string; model: string }
  onChapterGenerated: (bookId: string, content: string) => void
}) {
  const [selectedBook, setSelectedBook] = useState<Book | null>(books.length > 0 ? books[0] : null)
  const [context, setContext] = useState('')
  const [generating, setGenerating] = useState(false)
  const [output, setOutput] = useState('')
  const [error, setError] = useState('')
  const [showBookSelect, setShowBookSelect] = useState(false)

  async function handleGenerate() {
    if (!selectedBook) { setShowBookSelect(true); return }
    if (!apiConfig.apiKey) { setError('请先在设置中配置 BaiShan API Key'); return }
    setGenerating(true)
    setOutput('')
    setError('')
    const systemPrompt = getInkOSSystemPrompt(selectedBook.genre, selectedBook.title)
    const chapterNum = (selectedBook.chapters || 0) + 1
    const userPrompt = '请创作《' + selectedBook.title + '》第' + chapterNum + '章。\n\n创作指导：' + (context || '继续故事发展，保持节奏紧凑') + '\n注意应用InkOS创作铁律。\n\n请直接输出章节正文。'
    try {
      const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ]
      await chatWithLLM(apiConfig.apiKey, apiConfig.baseUrl, apiConfig.model, messages, (chunk) => {
        setOutput(prev => prev + chunk)
      })
      onChapterGenerated(selectedBook.id, output)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '生成失败')
    } finally {
      setGenerating(false)
    }
  }

  const genreData = selectedBook ? GENRES.find(g => g.value === selectedBook.genre) : null

  return (
    <div className="tab-content">
      <Header title="AI 写作" subtitle="多智能体协作创作" />
      <div className="write-panel">
        {!selectedBook ? (
          <div className="select-book-card" onClick={() => setShowBookSelect(true)}>
            <span className="select-icon">📚</span>
            <div>
              <h4>选择作品</h4>
              <p>点击选择要写作的书名</p>
            </div>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
          </div>
        ) : (
          <div className="selected-book-chip" onClick={() => setShowBookSelect(true)}>
            <span>{genreData?.icon}</span>
            <span>{selectedBook.title}</span>
            <button onClick={(e) => { e.stopPropagation(); setSelectedBook(null) }}>×</button>
          </div>
        )}
        <div className="form-group">
          <label>创作指导（可选）</label>
          <textarea
            value={context}
            onChange={e => setContext(e.target.value)}
            placeholder={selectedBook ? '例如：重点写师徒矛盾，主角遭遇瓶颈...' : '先选择作品'}
            rows={4}
            disabled={!selectedBook}
          />
        </div>
        {error && <div className="error-msg">⚠️ {error}</div>}
        {output && (
          <div className="output-panel">
            <div className="output-header">
              <span>生成结果</span>
              <button onClick={() => navigator.clipboard.writeText(output)}>复制</button>
            </div>
            <pre className="output-text">{output}</pre>
          </div>
        )}
        <button className={'primary-btn generate-btn' + (generating ? ' loading' : '')} onClick={handleGenerate} disabled={generating}>
          {generating ? <><span className="spinner" />AI 创作中...</> : '✍️ 生成下一章'}
        </button>
      </div>
      {showBookSelect && (
        <div className="modal-overlay" onClick={() => setShowBookSelect(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>选择作品</h3>
              <button onClick={() => setShowBookSelect(false)}>×</button>
            </div>
            <div className="modal-body">
              {books.length === 0 ? (
                <p className="empty-state">还没有作品，请先创建</p>
              ) : (
                books.map(book => {
                  const g = GENRES.find(g => g.value === book.genre)
                  return (
                    <div key={book.id} className="book-option" onClick={() => { setSelectedBook(book); setShowBookSelect(false) }}>
                      <span className="book-option-icon">{g?.icon}</span>
                      <div>
                        <h4>{book.title}</h4>
                        <p>{g?.label}</p>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function BooksTab({ books, onSave }: { books: Book[]; onSave: (books: Book[]) => void }) {
  const [showCreate, setShowCreate] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newGenre, setNewGenre] = useState('xuanhuan')
  const [selectedBook, setSelectedBook] = useState<Book | null>(null)

  function createBook() {
    if (!newTitle.trim()) return
    const id = Date.now().toString()
    const book: Book = { id, title: newTitle, genre: newGenre, chapters: 0, words: 0, status: 'writing' }
    onSave([...books, book])
    setNewTitle('')
    setShowCreate(false)
  }

  return (
    <div className="tab-content">
      <Header title="书架" subtitle={books.length + ' 部作品'} />
      <div className="section">
        {books.map(book => {
          const genre = GENRES.find(g => g.value === book.genre)
          return (
            <div
              key={book.id}
              className={'book-item' + (selectedBook?.id === book.id ? ' selected' : '')}
              onClick={() => setSelectedBook(selectedBook?.id === book.id ? null : book)}
            >
              <div className="book-item-left">
                <div className="book-cover-sm" style={{ background: 'hsl(' + ((book.id.charCodeAt(0) * 37) % 360) + ', 55%, 38%)' }}>
                  {genre?.icon || '📖'}
                </div>
                <div className="book-item-info">
                  <h4>{book.title}</h4>
                  <p>{genre?.label} · {book.chapters}章 · {(book.words / 1000).toFixed(0)}k字</p>
                </div>
              </div>
              <span className="status-badge-sm">
                {book.status === 'writing' ? '🟢' : book.status === 'paused' ? '⏸️' : '✅'}
              </span>
            </div>
          )
        })}
        {books.length === 0 && <div className="empty-state"><p>书架空空如也</p></div>}
      </div>
      <button className="fab" onClick={() => setShowCreate(true)}>+</button>
      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>新建作品</h3>
              <button onClick={() => setShowCreate(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>书名</label>
                <input type="text" value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="输入书名..." autoFocus />
              </div>
              <div className="form-group">
                <label>题材</label>
                <div className="genre-grid">
                  {GENRES.map(g => (
                    <button key={g.value} className={'genre-btn' + (newGenre === g.value ? ' active' : '')} onClick={() => setNewGenre(g.value)}>
                      <span>{g.icon}</span>
                      <span>{g.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <button className="primary-btn" onClick={createBook}>创建作品</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function SettingsTab({ apiConfig, onSave }: {
  apiConfig: { apiKey: string; baseUrl: string; model: string }
  onSave: (config: typeof apiConfig) => void
}) {
  const [apiKey, setApiKey] = useState(apiConfig.apiKey)
  const [baseUrl, setBaseUrl] = useState(apiConfig.baseUrl)
  const [model, setModel] = useState(apiConfig.model)
  const [saved, setSaved] = useState(false)

  function handleSave() {
    onSave({ apiKey, baseUrl, model })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="tab-content">
      <Header title="设置" subtitle="API 配置与偏好" />
      <div className="settings-section">
        <h3 className="section-title">BaiShan API 配置</h3>
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
            <small>可在 ai.baishan.com/market/models 查看可用模型</small>
          </div>
          <button className={'primary-btn' + (saved ? ' saved' : '')} onClick={handleSave}>
            {saved ? '✓ 已保存' : '保存配置'}
          </button>
        </div>
      </div>
      <div className="settings-section">
        <h3 className="section-title">关于</h3>
        <div className="settings-card info-card">
          <p><strong>InkOS 移动版</strong></p>
          <p>基于 InkOS v0.3.5 构建</p>
          <p>AI 多智能体小说创作系统</p>
          <p className="version">内核：@actalk/inkos-core 0.3.5</p>
          <p className="version">API 端点：{baseUrl || '未配置'}</p>
        </div>
      </div>
    </div>
  )
}

// ============ Main App ============
function App() {
  const [activeTab, setActiveTab] = useState('home')
  const [books, setBooks] = useState<Book[]>([])
  const [apiConfig, setApiConfig] = useState({
    apiKey: localStorage.getItem('baishan_api_key') || '',
    baseUrl: localStorage.getItem('baishan_base_url') || BAISHAN_API_BASE,
    model: localStorage.getItem('baishan_model') || 'baishan-llama',
  })

  useEffect(() => {
    const saved = localStorage.getItem('inkos_books')
    if (saved) {
      try { setBooks(JSON.parse(saved)) } catch { /* ignore */ }
    }
  }, [])

  function saveBooks(updated: Book[]) {
    setBooks(updated)
    localStorage.setItem('inkos_books', JSON.stringify(updated))
  }

  function handleSaveConfig(config: typeof apiConfig) {
    setApiConfig(config)
    localStorage.setItem('baishan_api_key', config.apiKey)
    localStorage.setItem('baishan_base_url', config.baseUrl)
    localStorage.setItem('baishan_model', config.model)
  }

  function handleChapterGenerated(bookId: string, content: string) {
    setBooks(prev => prev.map(b => {
      if (b.id === bookId) {
        return { ...b, chapters: b.chapters + 1, words: b.words + Math.ceil(content.length / 2) }
      }
      return b
    }))
    setActiveTab('books')
  }

  function handleStartWrite() {
    if (books.length === 0) {
      setActiveTab('books')
    } else {
      setActiveTab('write')
    }
  }

  return (
    <div className="app">
      <div className="screen">
        {activeTab === 'home' && <HomeTab books={books} onStartWrite={handleStartWrite} />}
        {activeTab === 'write' && <WriteTab books={books} apiConfig={apiConfig} onChapterGenerated={handleChapterGenerated} />}
        {activeTab === 'books' && <BooksTab books={books} onSave={saveBooks} />}
        {activeTab === 'settings' && <SettingsTab apiConfig={apiConfig} onSave={handleSaveConfig} />}
      </div>
      <BottomNav active={activeTab} onNav={setActiveTab} />
    </div>
  )
}

export default App
