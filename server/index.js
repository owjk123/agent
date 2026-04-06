#!/usr/bin/env node
/**
 * InkOS Mobile Server v2
 * Wraps @actalk/inkos-core PipelineRunner as HTTP API for the mobile app
 */
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { Readable } = require('stream');

const PORT = process.env.PORT || 3000;
const INKOS_CORE = path.join(__dirname, '..', 'inkos-core', 'packages', 'core', 'dist');
const INKOS_CLI = path.join(__dirname, '..', 'inkos-core', 'packages', 'cli', 'dist');
const BOOKS_DIR = path.join(os.homedir(), '.inkos-mobile', 'books');

// Ensure books dir
if (!fs.existsSync(BOOKS_DIR)) fs.mkdirSync(BOOKS_DIR, { recursive: true });

// ─── Load inkos-core modules ─────────────────────────────────────────────
let StateManager, PipelineRunner, ArchitectAgent, WriterAgent,
    ContinuityAuditor, ReviserAgent, createLLMClient,
    readGenreProfile, readBookRules, detectAndRewrite,
    listAvailableGenres, analyzeAITells, detectAIContent;

try {
  const core = require(INKOS_CORE);
  StateManager = core.StateManager;
  PipelineRunner = core.PipelineRunner;
  ArchitectAgent = core.ArchitectAgent;
  WriterAgent = core.WriterAgent;
  ContinuityAuditor = core.ContinuityAuditor;
  ReviserAgent = core.ReviserAgent;
  createLLMClient = core.createLLMClient;
  readGenreProfile = core.readGenreProfile;
  readBookRules = core.readBookRules;
  detectAndRewrite = core.detectAndRewrite;
  listAvailableGenres = core.listAvailableGenres;
  analyzeAITells = core.analyzeAITells;
  detectAIContent = core.detectAIContent;
  console.log('[InkOS] Core modules loaded OK');
} catch(e) {
  console.error('[InkOS] Failed to load core modules:', e.message);
  process.exit(1);
}

// ─── In-memory book registry ──────────────────────────────────────────────
// bookId -> { id, title, genre, apiKey, baseUrl, model, dir, stateManager }
const books = new Map();

function bookDir(bookId) { return path.join(BOOKS_DIR, bookId); }

function loadBooks() {
  if (!fs.existsSync(BOOKS_DIR)) return;
  for (const id of fs.readdirSync(BOOKS_DIR)) {
    const dir = path.join(BOOKS_DIR, id);
    if (!fs.statSync(dir).isDirectory()) continue;
    try {
      const meta = loadBookMeta(id);
      if (meta) books.set(id, meta);
    } catch {}
  }
}

function loadBookMeta(id) {
  const dir = bookDir(id);
  const envFile = path.join(dir, '.env');
  const stateFile = path.join(dir, 'current_state.md');
  
  let title = id, genre = 'other', chapters = 0, words = 0;
  let apiKey = '', baseUrl = 'https://ai.baishan.com/v1', model = 'baishan-llama';
  let status = 'writing';

  if (fs.existsSync(envFile)) {
    fs.readFileSync(envFile, 'utf8').split('\n').forEach(line => {
      const eq = line.indexOf('=');
      if (eq < 0) return;
      const k = line.slice(0, eq).trim();
      const v = line.slice(eq+1).trim();
      if (k === 'INKOS_LLM_API_KEY') apiKey = v;
      if (k === 'INKOS_LLM_BASE_URL') baseUrl = v;
      if (k === 'INKOS_LLM_MODEL') model = v;
    });
  }
  if (fs.existsSync(stateFile)) {
    const s = fs.readFileSync(stateFile, 'utf8');
    const m = s.match(/^#\s*(.+)/m); if (m) title = m[1].trim();
    const gm = s.match(/\*\*题材\*\*:\s*(.+)/m); if (gm) genre = gm[1].trim();
    const cm = s.match(/\*\*已完成章节\*\*:\s*(\d+)/m); if (cm) chapters = parseInt(cm[1]);
  }
  const mdFiles = fs.readdirSync(dir).filter(f => /^chapter_\d+\.md$/.test(f)).sort();
  chapters = mdFiles.length;
  totalWords = mdFiles.reduce((sum, f) => sum + fs.readFileSync(path.join(dir, f), 'utf8').replace(/[#*_\[\]`\n]/g, '').length, 0);

  return { id, title, genre, chapters, words: totalWords, status, apiKey, baseUrl, model, dir };
}

// ─── InkOS Pipeline ─────────────────────────────────────────────────────
async function runPipeline(bookId, context, onEvent) {
  const book = books.get(bookId);
  if (!book) throw new Error('Book not found: ' + bookId);

  const { apiKey, baseUrl, model, dir, genre } = book;

  // Create LLM client
  const llm = createLLMClient({
    provider: 'openai',
    apiKey,
    baseUrl,
    model: model || 'baishan-llama',
    maxTokens: 8192,
    temperature: 0.7,
  });

  // Create state manager
  const sm = new StateManager(dir);

  // Load genre + book rules
  let genreProfile, bookRules;
  try {
    genreProfile = readGenreProfile(genre, dir);
  } catch {
    genreProfile = readGenreProfile('other', dir);
  }
  try {
    bookRules = readBookRules(dir);
  } catch {}

  // Determine next chapter number
  const existingChapters = fs.readdirSync(dir).filter(f => /^chapter_\d+\.md$/.test(f)).sort();
  const nextChapter = existingChapters.length + 1;

  onEvent({ type: 'status', message: `[InkOS] 第${nextChapter}章写作开始...` });

  // Run Architect (if chapter 1 or first time)
  let outline = null;
  if (nextChapter === 1) {
    onEvent({ type: 'status', message: '[InkOS] 建筑师规划世界观...' });
    const architect = new ArchitectAgent(llm, { genreProfile, bookRules });
    outline = await architect.run({ bookTitle: book.title, context: context || `创建${book.title}的开篇世界观` });
    onEvent({ type: 'outline', content: outline });
  }

  // Run Writer
  onEvent({ type: 'status', message: '[InkOS] 写手生成正文...' });
  const writer = new WriterAgent(llm, { genreProfile, bookRules });
  let draft = await writer.run({
    bookTitle: book.title,
    chapterNumber: nextChapter,
    context: context || `第${nextChapter}章`,
    stateManager: sm,
    outline,
  });
  onEvent({ type: 'draft', content: draft.slice(0, 200) + '...' });

  // Run Continuity Auditor
  onEvent({ type: 'status', message: '[InkOS] 审计员核查连续性...' });
  const auditor = new ContinuityAuditor(llm, { genreProfile });
  const auditResult = await auditor.run({ draft, stateManager: sm, chapterNumber: nextChapter });

  if (auditResult.issues && auditResult.issues.length > 0) {
    onEvent({ type: 'audit', issues: auditResult.issues });
    // Run Reviser
    onEvent({ type: 'status', message: '[InkOS] 修订者修复问题...' });
    const reviser = new ReviserAgent(llm, { genreProfile });
    draft = await reviser.run({ draft, auditResult, mode: 'polish' });
    onEvent({ type: 'revised', content: draft.slice(0, 200) + '...' });
  }

  // Run AI tells detection
  onEvent({ type: 'status', message: '[InkOS] AI痕迹检测...' });
  const aiTells = analyzeAITells(draft);
  if (aiTells.score > 0.3) {
    onEvent({ type: 'ai-tells', score: aiTells.score, patterns: aiTells.patterns });
    const reviser2 = new ReviserAgent(llm, { genreProfile });
    draft = await reviser2.run({ draft, auditResult: { issues: [] }, mode: 'anti-detect' });
  }

  // Save chapter
  const chapterFile = path.join(dir, `chapter_${nextChapter}.md`);
  fs.writeFileSync(chapterFile, draft);
  onEvent({ type: 'status', message: `[InkOS] 第${nextChapter}章已保存` });

  // Update state
  await sm.saveChapterState(nextChapter, draft, {});
  onEvent({ type: 'done', chapter: nextChapter, file: chapterFile, words: draft.length });

  return { chapter: nextChapter, draft };
}

// ─── HTTP Helpers ────────────────────────────────────────────────────────
function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data));
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let b = ''; req.on('data', c => b += c); req.on('end', () => resolve(b)); req.on('error', reject);
  });
}

function sendSSE(res, data) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

// ─── Route Handler ───────────────────────────────────────────────────────
async function handler(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const method = req.method;
  const pathname = url.pathname.replace(/\/+$/, ''); // trim trailing slash

  if (method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
    res.end(); return;
  }

  try {
    // GET /health
    if (pathname === '/health') {
      return json(res, 200, { ok: true, version: '0.3.5', books: books.size, mode: 'InkOS-Pipeline' });
    }

    // GET /genres
    if (pathname === '/genres') {
      const builtinGenres = listAvailableGenres ? listAvailableGenres() : ['xuanhuan', 'xianxia', 'urban', 'horror', 'tongren', 'kehuan', 'other'];
      return json(res, 200, {
        genres: [
          { value: 'xuanhuan', label: '玄幻', icon: '🐉', desc: '数值系统、战力体系、同质吞噬衰减', dimensions: 26 },
          { value: 'xianxia', label: '仙侠', icon: '⚔️', desc: '修炼/悟道节奏、法宝体系、天道规则', dimensions: 26 },
          { value: 'urban', label: '都市', icon: '🌆', desc: '年代考据、商战/社交驱动、法律术语', dimensions: 24 },
          { value: 'horror', label: '恐怖', icon: '👻', desc: '氛围递进、恐惧层级、克制叙事', dimensions: 22 },
          { value: 'tongren', label: '同人', icon: '📖', desc: '原著角色、二次创作、世界观延续', dimensions: 20 },
          { value: 'kehuan', label: '科幻', icon: '🚀', desc: '科技推演、未来设定、硬核逻辑', dimensions: 24 },
          { value: 'other', label: '通用', icon: '📚', desc: '最小化兜底', dimensions: 18 },
        ]
      });
    }

    // GET /books
    if (pathname === '/books' && method === 'GET') {
      loadBooks();
      const list = Array.from(books.values()).map(b => ({
        id: b.id, title: b.title, genre: b.genre,
        chapters: b.chapters, words: b.words, status: b.status
      }));
      return json(res, 200, { books: list });
    }

    // POST /books
    if (pathname === '/books' && method === 'POST') {
      const body = JSON.parse(await readBody(req));
      const { title, genre = 'xuanhuan', apiKey, baseUrl, model } = body;
      if (!title) return json(res, 400, { error: 'title required' });

      const id = Buffer.from(title).toString('base64').replace(/[/+=]/g, '_').slice(0, 20) + '_' + Date.now();
      const dir = path.join(BOOKS_DIR, id);
      fs.mkdirSync(dir, { recursive: true });

      // Write .env
      const envContent = [
        `INKOS_LLM_PROVIDER=openai`,
        `INKOS_LLM_BASE_URL=${baseUrl || 'https://ai.baishan.com/v1'}`,
        `INKOS_LLM_API_KEY=${apiKey || ''}`,
        `INKOS_LLM_MODEL=${model || 'baishan-llama'}`,
      ].join('\n');
      fs.writeFileSync(path.join(dir, '.env'), envContent);

      // Initialize state file
      const stateContent = [
        `# ${title}`,
        `**题材**: ${genre}`,
        `**已完成章节**: 0`,
        `**总字数**: 0`,
        ``,
        `## 世界观`,
        ``,
        `## 角色`,
        ``,
        `## 当前状态`,
      ].join('\n');
      fs.writeFileSync(path.join(dir, 'current_state.md'), stateContent);

      // Save book
      const book = { id, title, genre, chapters: 0, words: 0, status: 'writing', apiKey: apiKey || '', baseUrl: baseUrl || 'https://ai.baishan.com/v1', model: model || 'baishan-llama', dir };
      books.set(id, book);

      return json(res, 201, { id, title, genre, chapters: 0, words: 0, status: 'writing' });
    }

    // GET /books/:id
    if (pathname.match(/^\/books\/[^/]+$/) && method === 'GET') {
      const id = pathname.split('/')[2];
      if (!books.has(id)) { loadBooks(); if (!books.has(id)) return json(res, 404, { error: 'not found' }); }
      const b = books.get(id);
      const dir = bookDir(id);
      const chapters = fs.readdirSync(dir).filter(f => /^chapter_\d+\.md$/.test(f)).sort()
        .map(f => {
          const content = fs.readFileSync(path.join(dir, f), 'utf8');
          const lines = content.split('\n');
          return { file: f, title: lines[0]?.replace(/^#+\s*/, '').trim(), words: content.replace(/[#*_\[\]`\n]/g, '').length };
        });
      return json(res, 200, { id: b.id, title: b.title, genre: b.genre, chapters: b.chapters, words: b.words, status: b.status, chapterFiles: chapters });
    }

    // GET /books/:id/config
    if (pathname.match(/^\/books\/[^/]+\/config$/) && method === 'GET') {
      const id = pathname.split('/')[2];
      const b = books.get(id);
      if (!b) return json(res, 404, { error: 'not found' });
      return json(res, 200, { apiKey: b.apiKey, baseUrl: b.baseUrl, model: b.model });
    }

    // PUT /books/:id/config
    if (pathname.match(/^\/books\/[^/]+\/config$/) && method === 'PUT') {
      const id = pathname.split('/')[2];
      if (!books.has(id)) return json(res, 404, { error: 'not found' });
      const config = JSON.parse(await readBody(req));
      const dir = bookDir(id);
      const envPath = path.join(dir, '.env');
      const lines = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8').split('\n') : [];
      const envObj = {};
      lines.forEach(line => { const eq = line.indexOf('='); if (eq > 0) envObj[line.slice(0, eq)] = line.slice(eq+1); });
      if (config.apiKey !== undefined) envObj['INKOS_LLM_API_KEY'] = config.apiKey;
      if (config.baseUrl !== undefined) envObj['INKOS_LLM_BASE_URL'] = config.baseUrl;
      if (config.model !== undefined) envObj['INKOS_LLM_MODEL'] = config.model;
      fs.writeFileSync(envPath, Object.entries(envObj).map(([k,v]) => `${k}=${v}`).join('\n'));
      Object.assign(books.get(id), config);
      return json(res, 200, { ok: true });
    }

    // GET /books/:id/chapter/:n
    if (pathname.match(/^\/books\/[^/]+\/chapter\/\d+$/) && method === 'GET') {
      const [, , , bookId, , n] = pathname.split('/');
      const chapterFile = path.join(BOOKS_DIR, bookId, `chapter_${n}.md`);
      if (!fs.existsSync(chapterFile)) return json(res, 404, { error: 'Chapter not found' });
      const content = fs.readFileSync(chapterFile, 'utf8');
      return json(res, 200, { chapter: parseInt(n), content, words: content.replace(/[#*_\[\]`\n]/g, '').length });
    }

    // POST /books/:id/write — SSE streaming pipeline
    if (pathname.match(/^\/books\/[^/]+\/write$/) && method === 'POST') {
      const parts = pathname.split('/');
      const bookId = parts[2];
      if (!books.has(bookId)) { loadBooks(); if (!books.has(bookId)) return json(res, 404, { error: 'not found' }); }

      let body = ''; req.on('data', c => body += c); await new Promise(r => req.on('end', r));
      const { context = '' } = JSON.parse(body);

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
      });

      try {
        await runPipeline(bookId, context, (event) => sendSSE(res, event));
        sendSSE(res, { type: 'done' });
      } catch(e) {
        console.error('[Pipeline Error]', e);
        sendSSE(res, { type: 'error', message: e.message });
      }
      res.end();
      return;
    }

    // POST /books/:id/draft — just writer (no audit)
    if (pathname.match(/^\/books\/[^/]+\/draft$/) && method === 'POST') {
      const parts = pathname.split('/');
      const bookId = parts[2];
      if (!books.has(bookId)) { loadBooks(); if (!books.has(bookId)) return json(res, 404, { error: 'not found' }); }

      let body = ''; req.on('data', c => body += c); await new Promise(r => req.on('end', r));
      const { context = '' } = JSON.parse(body);
      const book = books.get(bookId);

      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Access-Control-Allow-Origin': '*', 'X-Accel-Buffering': 'no' });

      try {
        const llm = createLLMClient({ provider: 'openai', apiKey: book.apiKey, baseUrl: book.baseUrl, model: book.model || 'baishan-llama' });
        const sm = new StateManager(book.dir);
        const genreProfile = readGenreProfile(book.genre, book.dir);
        const bookRules = readBookRules(book.dir);
        const existingChapters = fs.readdirSync(book.dir).filter(f => /^chapter_\d+\.md$/.test(f)).sort();
        const nextChapter = existingChapters.length + 1;

        sendSSE(res, { type: 'status', message: `写手中...第${nextChapter}章` });
        const writer = new WriterAgent(llm, { genreProfile, bookRules });
        const draft = await writer.run({ bookTitle: book.title, chapterNumber: nextChapter, context, stateManager: sm });

        sendSSE(res, { type: 'draft', content: draft });
        sendSSE(res, { type: 'done', chapter: nextChapter });
      } catch(e) {
        console.error('[Draft Error]', e);
        sendSSE(res, { type: 'error', message: e.message });
      }
      res.end();
      return;
    }

    // POST /books/:id/audit
    if (pathname.match(/^\/books\/[^/]+\/audit$/) && method === 'POST') {
      const parts = pathname.split('/');
      const bookId = parts[2];
      if (!books.has(bookId)) return json(res, 404, { error: 'not found' });
      let body = ''; req.on('data', c => body += c); await new Promise(r => req.on('end', r));
      const { chapter = 'last' } = JSON.parse(body);
      const book = books.get(bookId);
      const dir = book.dir;
      const chapterNum = chapter === 'last'
        ? Math.max(...fs.readdirSync(dir).filter(f => /^chapter_\d+\.md$/.test(f)).map(f => parseInt(f.match(/\d+/)[0])))
        : parseInt(chapter);
      const draft = fs.readFileSync(path.join(dir, `chapter_${chapterNum}.md`), 'utf8');

      const llm = createLLMClient({ provider: 'openai', apiKey: book.apiKey, baseUrl: book.baseUrl, model: book.model || 'baishan-llama' });
      const sm = new StateManager(dir);
      const genreProfile = readGenreProfile(book.genre, dir);
      const auditor = new ContinuityAuditor(llm, { genreProfile });
      const result = await auditor.run({ draft, stateManager: sm, chapterNumber: chapterNum });

      return json(res, 200, { chapter: chapterNum, audit: result });
    }

    // POST /books/:id/revise
    if (pathname.match(/^\/books\/[^/]+\/revise$/) && method === 'POST') {
      const parts = pathname.split('/');
      const bookId = parts[2];
      if (!books.has(bookId)) return json(res, 404, { error: 'not found' });
      let body = ''; req.on('data', c => body += c); await new Promise(r => req.on('end', r));
      const { chapter = 'last', mode = 'polish' } = JSON.parse(body);
      const book = books.get(bookId);
      const dir = book.dir;
      const chapterNum = chapter === 'last'
        ? Math.max(...fs.readdirSync(dir).filter(f => /^chapter_\d+\.md$/.test(f)).map(f => parseInt(f.match(/\d+/)[0])))
        : parseInt(chapter);
      const draft = fs.readFileSync(path.join(dir, `chapter_${chapterNum}.md`), 'utf8');

      const llm = createLLMClient({ provider: 'openai', apiKey: book.apiKey, baseUrl: book.baseUrl, model: book.model || 'baishan-llama' });
      const genreProfile = readGenreProfile(book.genre, dir);
      const auditor = new ContinuityAuditor(llm, { genreProfile });
      const auditResult = await auditor.run({ draft, stateManager: new StateManager(dir), chapterNumber: chapterNum });
      const reviser = new ReviserAgent(llm, { genreProfile });
      const revised = await reviser.run({ draft, auditResult, mode });

      fs.writeFileSync(path.join(dir, `chapter_${chapterNum}.md`), revised);
      return json(res, 200, { chapter: chapterNum, revised, issuesFixed: auditResult.issues?.length || 0 });
    }

    // POST /books/:id/detect — AIGC detection
    if (pathname.match(/^\/books\/[^/]+\/detect$/) && method === 'POST') {
      const parts = pathname.split('/');
      const bookId = parts[2];
      if (!books.has(bookId)) return json(res, 404, { error: 'not found' });
      let body = ''; req.on('data', c => body += c); await new Promise(r => req.on('end', r));
      const { chapter = 'last' } = JSON.parse(body);
      const book = books.get(bookId);
      const dir = book.dir;
      const chapterNum = chapter === 'last'
        ? Math.max(...fs.readdirSync(dir).filter(f => /^chapter_\d+\.md$/.test(f)).map(f => parseInt(f.match(/\d+/)[0])))
        : parseInt(chapter);
      const content = fs.readFileSync(path.join(dir, `chapter_${chapterNum}.md`), 'utf8');

      const aiTells = analyzeAITells(content);
      const detectResult = detectAIContent ? detectAIContent(content) : { score: aiTells.score };

      return json(res, 200, { chapter: chapterNum, aiTells, detect: detectResult });
    }

    // DELETE /books/:id
    if (pathname.match(/^\/books\/[^/]+$/) && method === 'DELETE') {
      const id = pathname.split('/')[2];
      if (!books.has(id)) return json(res, 404, { error: 'not found' });
      const dir = bookDir(id);
      if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true });
      books.delete(id);
      return json(res, 200, { ok: true });
    }

    // 404
    return json(res, 404, { error: `Not found: ${method} ${pathname}` });

  } catch(err) {
    console.error('[Handler Error]', err);
    return json(res, 500, { error: err.message });
  }
}

// ─── Start Server ───────────────────────────────────────────────────────
loadBooks();
http.createServer(handler).listen(PORT, '0.0.0.0', () => {
  console.log(`InkOS Mobile Server v2 running on http://0.0.0.0:${PORT}`);
  console.log(`Books dir: ${BOOKS_DIR}`);
  console.log(`Books loaded: ${books.size}`);
});
