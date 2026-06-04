const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '../logs');
const LOG_FILE = path.join(LOG_DIR, 'coda_session_trace.md');

// Helper to ensure log directory exists
function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

// Detect which poster source was used based on URL pattern
function detectPosterSource(url) {
  if (!url || url.startsWith('holder:')) return '❌ No poster (placeholder)';
  if (url.includes('movieposterdb.com')) return '✅ MoviePosterDB (MPDB)';
  if (url.includes('anilist.co')) return '✅ AniList CDN';
  if (url.includes('jikan.moe') || url.includes('myanimelist.net')) return '✅ MyAnimeList (Jikan)';
  if (url.includes('steamstatic.com') || url.includes('steampowered.com')) return '✅ Steam CDN';
  if (url.includes('image.tmdb.org')) return '✅ TMDb';
  if (url.includes('itunes.apple.com') || url.includes('mzstatic.com')) return '✅ iTunes';
  if (url.includes('wikipedia.org') || url.includes('wikimedia.org')) return '✅ Wikipedia/Wikimedia';
  if (url.includes('openlibrary.org')) return '✅ Open Library';
  if (url.includes('googleapis.com')) return '✅ Google Books';
  return '✅ External URL';
}

/**
 * Flush the log file to start a clean session
 */
function flushLog() {
  try {
    ensureLogDir();
    const timestamp = new Date().toISOString();
    fs.writeFileSync(LOG_FILE, `# Coda Session Trace — Flushed at ${timestamp}\n\n`, 'utf8');
    console.log('[Trace Logger] Log file flushed successfully.');
  } catch (err) {
    console.error('[Trace Logger Error]: Failed to flush log:', err);
  }
}

/**
 * Log onboarding chat interaction
 */
function logChatMessage({ tabName, userMessage, codaReply, memoryUpdates }) {
  try {
    ensureLogDir();
    const timestamp = new Date().toISOString();
    
    const logContent = `
## [${timestamp}] Onboarding Chat (Tab: ${tabName})

**User Message:**
> ${userMessage}

**Coda Reply:**
> ${codaReply}

**Memory Updates Extracted:**
\`\`\`json
${JSON.stringify(memoryUpdates, null, 2)}
\`\`\`

---
`;
    fs.appendFileSync(LOG_FILE, logContent, 'utf8');
  } catch (err) {
    console.error('[Trace Logger Error]: Failed to log chat message:', err);
  }
}

/**
 * Log local (tab-level) or global harmonization pass
 */
function logHarmonization({ type, tabName, inputMemory, researchContext, outputMemory }) {
  try {
    ensureLogDir();
    const timestamp = new Date().toISOString();
    
    const logContent = `
## [${timestamp}] Harmonization Pass (${type}${tabName ? ` - Tab: ${tabName}` : ''})

**Input Memory:**
\`\`\`json
${JSON.stringify(inputMemory, null, 2)}
\`\`\`

${researchContext ? `**Research / Theme Context Gathered:**\n${researchContext}\n` : ''}
**Output Harmonized Memory:**
\`\`\`json
${JSON.stringify(outputMemory, null, 2)}
\`\`\`

---
`;
    fs.appendFileSync(LOG_FILE, logContent, 'utf8');
  } catch (err) {
    console.error('[Trace Logger Error]: Failed to log harmonization:', err);
  }
}

/**
 * Log the entire recommendation pipeline run
 */
function logRecommendation({
  payload,
  mediaType,
  queries,
  malAnimeTitles,
  scrapedSnippets,
  masterDirective,
  selection,
  posterUrl,
  ostUrl
}) {
  try {
    ensureLogDir();
    const timestamp = new Date().toISOString();
    
    let snippetsSection = 'No snippets gathered.';
    if (scrapedSnippets && scrapedSnippets.length > 0) {
      snippetsSection = scrapedSnippets.map((s, idx) => {
        const source = s.source || s.url || 'Unknown Source';
        const title = s.title || 'N/A';
        const snippetText = s.snippet || s.text || JSON.stringify(s);
        return `#### Snippet ${idx + 1} (Source: ${source})
- **Title/Topic:** ${title}
- **Content:** ${snippetText}
`;
      }).join('\n');
    }

    const posterSource = detectPosterSource(posterUrl);

    const logContent = `
## [${timestamp}] Recommendation Pipeline Trace

### Input Taste Profile & Request
\`\`\`json
${JSON.stringify(payload, null, 2)}
\`\`\`

### Step 1: Synthesis & Routing
- **Detected Media Type:** ${mediaType}
- **Queries Generated:** ${JSON.stringify(queries)}
${malAnimeTitles && malAnimeTitles.length > 0 ? `- **MAL Anime Titles Extracted:** ${JSON.stringify(malAnimeTitles)}\n` : ''}
- **Master Directive:**
> ${masterDirective || 'N/A'}

### Step 2: Web Search & Jikan API Snippets
${snippetsSection}

### Step 3: Scoring & Pitching Selection
- **Selected Title:** **${selection.title}**
- **Coda Blurb:** _"${selection.coda_blurb}"_
- **Pitch:**
${selection.pitch_paragraphs ? selection.pitch_paragraphs.map(p => `> ${p}`).join('\n\n') : 'N/A'}

### Step 4: Asset Retrieval
- **Poster Source:** ${posterSource}
- **Poster URL:** ${posterUrl || 'N/A'}
- **OST URL:** ${ostUrl || 'N/A'}

---
`;
    fs.appendFileSync(LOG_FILE, logContent, 'utf8');
  } catch (err) {
    console.error('[Trace Logger Error]: Failed to log recommendation:', err);
  }
}

module.exports = {
  logChatMessage,
  logHarmonization,
  logRecommendation,
  flushLog
};
