const express = require('express');
const router = express.Router();
const axios = require('axios');
const multer = require('multer');
const { callGemini } = require('../services/llmService');
const mediaService = require('../services/mediaService');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB file limit
});

let visionClient = null;
try {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const vision = require('@google-cloud/vision');
    visionClient = new vision.ImageAnnotatorClient();
    console.log('[Detect Route] Google Cloud Vision client initialized successfully!');
  }
} catch (e) {
  console.warn('[Detect Route] Google Cloud Vision client could not be loaded:', e.message);
}

async function getGoogleVisionHints(file) {
  if (!visionClient) return null;
  try {
    console.log('[Google Vision] Querying Web Detection for matching entities...');
    const [result] = await visionClient.webDetection({
      image: { content: file.buffer.toString('base64') }
    });
    
    const webDetection = result.webDetection;
    if (!webDetection) return null;

    const labels = webDetection.bestGuessLabels?.map(l => l.label) || [];
    const entities = webDetection.webEntities
      ?.filter(e => e.description && e.score >= 0.4)
      ?.map(e => e.description) || [];
    
    console.log('[Google Vision] Web Detection results - Labels:', labels, 'Entities:', entities.slice(0, 10));
    return {
      labels,
      entities: entities.slice(0, 15)
    };
  } catch (err) {
    console.warn('[Google Vision] Web Detection failed:', err.message);
    return null;
  }
}

// Helper to query AniList for title from trace.moe ID
async function getAniListTitle(anilistId) {
  try {
    const gql = `
      query ($id: Int) {
        Media(id: $id, type: ANIME) {
          title { english romaji }
        }
      }
    `;
    const res = await axios.post('https://graphql.anilist.co', {
      query: gql,
      variables: { id: anilistId }
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 5000
    });
    const media = res.data?.data?.Media;
    return media?.title?.english || media?.title?.romaji || null;
  } catch (err) {
    console.error(`[Detect - AniList GQL Error] id ${anilistId}:`, err.message);
    return null;
  }
}

// Helper to ask GPT-4o-mini to describe/blurb a canonical title
async function generateMediaDetails(title, mediaType) {
  const prompt = `You are Coda's media curator. Provide details for the work "${title}" (${mediaType}).
Respond ONLY with a JSON object:
{
  "tags": ["Tag1", "Tag2"],
  "description": "A concise, intriguing 2-sentence synopsis.",
  "coda_blurb": "An 8-12 word casual friend-like recommendation blurb in Coda's subjective voice (first-person, casual, direct, no clichés like 'dive into', no third-party citations)."
}`;
  try {
    const response = await callGemini([
      { role: 'user', content: prompt }
    ], { type: "json_object" });
    return JSON.parse(response);
  } catch (err) {
    console.error(`[Detect - Details Generation Error] for "${title}":`, err.message);
    return {
      tags: [mediaType],
      description: "A work of media in the " + mediaType + " category.",
      coda_blurb: "Check out this " + mediaType + "!"
    };
  }
}

// Core media detection pipeline
async function processMediaDetection(file) {
  console.log(`[Detect Media Core] Processing image file: ${file.originalname || 'upload'} (${file.size} bytes)`);

  // Define trace.moe background check (runs in parallel with Gemini Vision)
  const traceMoePromise = (async () => {
    try {
      console.log('[Detect Media Core] Querying trace.moe API in background...');
      const traceRes = await axios.post('https://api.trace.moe/search', file.buffer, {
        headers: { 'Content-Type': file.mimetype || 'image/jpeg' },
        timeout: 5000
      });
      const bestResult = traceRes.data?.result?.[0];
      if (bestResult && bestResult.similarity >= 0.88 && bestResult.anilist) {
        console.log(`[Detect Media Core] trace.moe high-similarity match: similarity ${bestResult.similarity}, AniList ID ${bestResult.anilist}`);
        const aniListTitle = await getAniListTitle(bestResult.anilist);
        if (aniListTitle) {
          console.log(`[Detect Media Core] trace.moe resolved to: "${aniListTitle}"`);
          return {
            title: aniListTitle,
            media_type: 'anime',
            confidence: bestResult.similarity,
            tags: ['anime'],
            description: 'Identified via anime frame matching.',
            coda_blurb: `You've got to watch this!`,
            reason: `trace.moe matched anime frame with similarity ${(bestResult.similarity * 100).toFixed(1)}%`
          };
        }
      }
    } catch (err) {
      console.warn('[Detect Media Core - trace.moe promise failed]:', err.message);
    }
    return null;
  })();

  // Define Gemini Vision API check (runs in parallel with trace.moe)
  const visionPromise = (async () => {
    try {
      console.log('[Detect Media Core] Querying Gemini Vision API...');
      const googleHints = await getGoogleVisionHints(file);
      const base64Image = file.buffer.toString('base64');
      let mimeType = file.mimetype;
      if (mimeType === 'image/jpg') {
        mimeType = 'image/jpeg';
      } else if (mimeType === 'application/octet-stream' || !mimeType) {
        const parts = (file.originalname || '').split('.');
        const ext = parts.length > 1 ? '.' + parts.pop().toLowerCase() : '';
        if (ext === '.jpg' || ext === '.jpeg') {
          mimeType = 'image/jpeg';
        } else if (ext === '.png') {
          mimeType = 'image/png';
        } else if (ext === '.webp') {
          mimeType = 'image/webp';
        } else if (ext === '.gif') {
          mimeType = 'image/gif';
        } else {
          mimeType = 'image/jpeg';
        }
      }

      const systemPrompt = `You are Coda's Visual Media Detector.
Your job is to analyze the uploaded image (which could be a single scene, poster, game screenshot, book cover, or a list/collage/grid containing multiple works) and extract ALL visible media works (anime, visual novel, movie, TV show, game, or book).
- Prioritize OCR text extraction to read any visible text (titles, subtitles, menus, credits, logos, headers, dialog box text). Avoid guessing or hallucinating titles. If clear text is visible, capture it accurately.
- Character Scene Matching: If the image represents a scene from a visual novel or anime (even with no clear title text, e.g. just a character sprite and dialog box), analyze the visual art style, character designs, background assets, and dialog text. Use your extensive world knowledge to identify the specific visual novel or anime and return its canonical title (e.g. identify characters like Rin Tohsaka as "Fate/stay night" or Arcueid as "Tsukihime").
- If there are multiple works visible (e.g. in a list, grid, or collage), extract each one as a separate item.
- If it is a single work, extract only that work.
- For each item, determine:
  1. "title": Canonical Title of the Work
  2. "media_type": "anime" | "visual novel" | "movie" | "tv" | "game" | "book"
  3. "confidence": Confidence score (0.0 to 1.0)
  4. "tags": 2 or 3 descriptive genres/tags
  5. "description": A concise 2-sentence synopsis/description.
  6. "coda_blurb": An 8-12 word casual friend-like recommendation blurb in Coda's subjective voice (first-person, casual, direct, no clichés like "dive into", no third-party citations).
  7. "reason": Brief explanation of how you identified it.

Respond ONLY with a JSON object containing a "detected_items" array:
{
  "detected_items": [
    {
      "title": "Canonical Title",
      "media_type": "anime" | "visual novel" | "movie" | "tv" | "game" | "book",
      "confidence": 0.95,
      "tags": ["Tag1", "Tag2"],
      "description": "Concise synopsis.",
      "coda_blurb": "Friend blurb.",
      "reason": "Brief explanation of how you identified it."
    }
  ]
}`;

      const userContent = [
        {
          type: 'image_url',
          image_url: {
            url: `data:${mimeType};base64,${base64Image}`
          }
        }
      ];

      if (googleHints) {
        let hintText = `Hints from Google Web Visual Search:\n`;
        if (googleHints.labels && googleHints.labels.length > 0) {
          hintText += `- Best guess titles/labels: ${googleHints.labels.join(', ')}\n`;
        }
        if (googleHints.entities && googleHints.entities.length > 0) {
          hintText += `- Identified web entities/topics: ${googleHints.entities.join(', ')}\n`;
        }
        hintText += `\nUse these hints to help resolve the correct, canonical titles and media formats for the items visible in the image. Do not blindly copy them if they are irrelevant, but prioritize them to ensure accuracy and prevent hallucination.`;
        
        userContent.unshift({
          type: 'text',
          text: hintText
        });
      }

      const responseText = await callGemini([
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: userContent
        }
      ], { type: "json_object" });

      const parsedVision = JSON.parse(responseText);
      return parsedVision.detected_items || [];
    } catch (err) {
      console.error('[Detect Media Core - Gemini Vision promise failed]:', err.message);
      return [];
    }
  })();

  // Await both searches concurrently
  const [traceMoeResult, visionItems] = await Promise.all([traceMoePromise, visionPromise]);

  // Combine results
  let combinedItems = [];

  // If trace.moe found a high confidence match, push it first
  if (traceMoeResult) {
    combinedItems.push(traceMoeResult);
  }

  // Add vision items that meet confidence threshold and aren't duplicates
  if (visionItems && visionItems.length > 0) {
    for (const vItem of visionItems) {
      if (!vItem.title || vItem.confidence < 0.4 || vItem.media_type === 'unknown') {
        continue;
      }
      const isDuplicate = combinedItems.some(item => 
        item.title.toLowerCase().trim() === vItem.title.toLowerCase().trim()
      );
      if (!isDuplicate) {
        combinedItems.push(vItem);
      }
    }
  }

  if (combinedItems.length === 0) {
    throw new Error('Could not identify any media from the uploaded image');
  }

  console.log(`[Detect Media Core] Resolving details and assets for ${combinedItems.length} items...`);

  // Fetch poster, OST, and optionally details (for trace.moe results) for all items in parallel
  const resolvedItems = await Promise.all(combinedItems.map(async (item) => {
    const title = item.title;
    const mediaType = item.media_type;

    let details = {
      tags: item.tags || [mediaType],
      description: item.description || '',
      coda_blurb: item.coda_blurb || ''
    };

    // If item was found via trace.moe, call generateMediaDetails to get richer descriptions and Coda tone
    if (item.reason && item.reason.includes('trace.moe')) {
      const generated = await generateMediaDetails(title, mediaType);
      details.tags = generated.tags || details.tags;
      details.description = generated.description || details.description;
      details.coda_blurb = generated.coda_blurb || details.coda_blurb;
    }

    // Fetch poster and OST
    const { poster_url, ost_url } = await mediaService.fetchAssets(title, mediaType);

    let finalPosterUrl = poster_url;
    if (poster_url && poster_url.startsWith('http') && !poster_url.includes('localhost') && !poster_url.includes('127.0.0.1')) {
      finalPosterUrl = `/api/recommend/proxy-image?url=${encodeURIComponent(poster_url)}`;
    }

    return {
      title,
      media_type: mediaType,
      tags: details.tags,
      description: details.description,
      coda_blurb: details.coda_blurb,
      poster_url: finalPosterUrl || '',
      ost_url: ost_url || '',
      added_at: new Date().toISOString()
    };
  }));

  // Return structure: support single-item queries at root + "items" array for multi-item queries
  const firstItem = resolvedItems[0];
  return {
    ...firstItem,
    items: resolvedItems
  };
}

// 1. JSON response API route (for app manual uploads)
router.post('/detect-media', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file uploaded' });
    }
    const result = await processMediaDetection(req.file);
    res.json(result);
  } catch (error) {
    console.error('[Detect Route Error]:', error);
    res.status(500).json({ error: 'Visual detection failed', details: error.message });
  }
});

// 1.5. Manual lookup route (when user enters a title manually)
router.post('/manual-lookup', async (req, res) => {
  try {
    const { title, media_type } = req.body;
    if (!title || !media_type) {
      return res.status(400).json({ error: 'Missing title or media_type parameter' });
    }

    console.log(`[Detect Manual Lookup] Fetching details for: "${title}" (${media_type})`);

    // Generate details using GPT-4o-mini
    const details = await generateMediaDetails(title, media_type);

    // Fetch assets (poster & OST)
    const { poster_url, ost_url } = await mediaService.fetchAssets(title, media_type);

    let finalPosterUrl = poster_url;
    if (poster_url && poster_url.startsWith('http') && !poster_url.includes('localhost') && !poster_url.includes('127.0.0.1')) {
      finalPosterUrl = `/api/recommend/proxy-image?url=${encodeURIComponent(poster_url)}`;
    }

    res.json({
      title: title,
      media_type: media_type,
      tags: details?.tags || [media_type],
      description: details?.description || '',
      coda_blurb: details?.coda_blurb || '',
      poster_url: finalPosterUrl || '',
      ost_url: ost_url || '',
      added_at: new Date().toISOString()
    });
  } catch (error) {
    console.error('[Manual Lookup Route Error]:', error);
    res.status(500).json({ error: 'Manual lookup failed', details: error.message });
  }
});

// 2. Form/PWA share target route (redirects to the frontend SPA route)
router.post('/share-target', upload.single('media_files'), async (req, res) => {
  try {
    if (!req.file) {
      console.warn('[Share Target] POST called without file. Redirecting to home...');
      return res.redirect('/');
    }
    const result = await processMediaDetection(req.file);
    
    // Redirect browser to client route /#/share-receive with parameters
    const redirectUrl = `/#/share-receive` +
      `?title=${encodeURIComponent(result.title)}` +
      `&media_type=${encodeURIComponent(result.media_type)}` +
      `&tags=${encodeURIComponent(JSON.stringify(result.tags))}` +
      `&description=${encodeURIComponent(result.description)}` +
      `&coda_blurb=${encodeURIComponent(result.coda_blurb)}` +
      `&poster_url=${encodeURIComponent(result.poster_url)}` +
      `&ost_url=${encodeURIComponent(result.ost_url)}` +
      `&items=${encodeURIComponent(JSON.stringify(result.items || []))}`;
      
    console.log(`[Share Target] ✅ Redirecting client to: ${redirectUrl}`);
    res.redirect(303, redirectUrl);
  } catch (error) {
    console.error('[Share Target Route Error]:', error);
    res.redirect(`/#/share-receive?error=${encodeURIComponent(error.message)}`);
  }
});

module.exports = router;
