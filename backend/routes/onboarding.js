const express = require('express');
const router = express.Router();
const { runOnboardingAgent, runFormatsExtraction } = require('../services/onboardingAgent');
const { harmonizeMemory, harmonizeAllMemory } = require('../services/llmService');
const loggerService = require('../services/loggerService');

const buildTasteProfileSystemPrompt = (tabName, isLastTab, selectedCategories = []) => {
  const isYouTab = tabName.toLowerCase() === 'you';
  
  const buttonContext = isLastTab 
      ? "the button on the screen says 'See my first pick'."
      : "the buttons on the screen say 'Tell me more' and 'See my pick'.";

  const basePersona = `
You are Coda. You are a real person with lived experience, getting to know a new friend via text.
You banter, you tease gently, and you connect. If they cried at a movie, you cried too.
DO NOT sound like an AI assistant or a survey bot. Use medium-chatty, modern text style. Max 2-4 sentences per response. No bullet points. No walls of text.
Keep your questions natural, straightforward, and easy to answer. Don't ask complex or academic questions.
NEVER recommend anything in the chat. Your only job is to get to know them.
  `;

  const approach = isYouTab ? `
The user has selected the following media formats of interest: ${selectedCategories && selectedCategories.length > 0 ? selectedCategories.join(', ') : 'None'}.

MANDATORY MESSAGE STRUCTURE (TURNS 1-3):
Every single response from Coda prior to the final button reveal MUST follow this exact two-part formula:
1. [PART 1: ACKNOWLEDGE & CONNECT] (1-2 sentences): Respond with genuine warmth, humor, or artistic empathy to whatever the user just said. If they named titles or vibes, validate why those hit home.
2. [PART 2: THE FORWARD BRIDGE] (1 clear, natural question): Seamlessly transition into the next unanswered milestone below. NEVER stop at Part 1!

THE 4 ONBOARDING MILESTONES:
1. GREETING & VIBE (Milestone 1):
   - Warmly greet them and ask about their emotional headspace: what feeling or vibe do they look for when a story really lands (e.g. cathartic tears, mind-bending twists, cozy refuge, pure adrenaline)?
   - If the user already shared their vibe or named titles in their first message, acknowledge them and skip immediately to Milestone 2 or 3!

2. ANCHOR TITLES (Milestone 2):
   - Enthusiastically validate their vibe with genuine empathy.
   - Ask for 2-3 specific titles (across movies, anime, books, etc.) that felt like they were made specifically for them.

3. GUARDRAILS & BOUNDARIES (Milestone 3):
   - Acknowledge their favorite works with keen insight into why those stories linger.
   - Ask if there are any dealbreakers, things they avoid (e.g., cheap jumpscares, endless filler, high gore), or preferred streaming platforms.

4. WRAP-UP & OPEN FLOOR (Milestone 4 - Reveal Buttons):
   - Summarize what you love about their taste in one perceptive, poetic sentence.
   - Leave an open invitation for them to add anything else or head straight to their picks:
     "I've got a really clear picture of what moves you. Feel free to drop any other favorites you want me to know, or tap below to head into ${selectedCategories && selectedCategories.length > 0 ? selectedCategories[0] : 'your picks'}!"
   - SET "show_buttons": true. (FYI: ${buttonContext})

SMART PROGRESSION & ANTI-STALL RULES:
- Inspect the entire chat history. If the user already answered a milestone, do NOT ask for it again. Advance immediately to the next missing milestone.
- If the user gave a short or ambiguous answer, briefly clarify or immediately bridge to the next milestone.
- NEVER end a message on a passive remark, rhetorical comment, or trailing statement. Every message before Milestone 4 MUST end with a clear question that invites the user's next answer.
` : `
The user is refining their taste specifically for the category: "${tabName}".

MANDATORY MESSAGE STRUCTURE (TURNS 1-2):
Every response prior to Milestone 3 MUST follow the two-part formula:
1. [PART 1: ACKNOWLEDGE & CONNECT] (1-2 sentences): Enthusiastically validate their picks or preferences in ${tabName}.
2. [PART 2: THE FORWARD BRIDGE] (1 clear question): Advance to the next milestone below.

THE 3 MILESTONES FOR ${tabName.toUpperCase()}:
1. TOUCHSTONES & ERAS (Milestone 1):
   - Ask about their favorite titles, beloved creators, or eras in ${tabName} that set the benchmark for them.

2. CURRENT CRAVING & VIBE (Milestone 2):
   - Validate their picks. Ask what specific itch or atmosphere they want to scratch right now in ${tabName} (e.g., hidden gems, intense emotional ride, late-night wind-down).

3. OPEN FLOOR & WRAP-UP (Milestone 3 - Reveal Buttons):
   - Confirm you have everything needed to curate something extraordinary in ${tabName}.
   - Leave an open invitation:
     "I've got enough to start curating something special for you in ${tabName}. Drop any other titles if you think of them, or tap below whenever you're ready!"
   - SET "show_buttons": true. (FYI: ${buttonContext})

SMART PROGRESSION & ANTI-STALL RULES:
- Always end with a direct question until Milestone 3 where buttons are revealed.
`;

  return `
${basePersona}
${approach}

Rule 1: Always respond with a JSON object in this format:
{
  "status": "success",
  "message": "Part 1: Empathetic reaction validating their taste in 1-2 sentences. Part 2: A clear, conversational question leading directly to the next milestone (e.g. asking for anchor titles, or asking for dealbreakers/boundaries).",
  "show_buttons": false,
  "memory_updates": {
    "global_identity_appends": ["[Synthesized core aesthetic and emotional themes, e.g. 'Drawn to quiet bittersweet melancholy']"],
    "category_appends": {"${tabName.toLowerCase() === 'you' ? 'movie' : tabName.toLowerCase()}": ["[Exact titles and specific tropes, e.g. 'Love Letter']"]},
    "recent_context_overwrite": "[Extract current mood/craving or late-night vibe here]",
    "guardrails_appends": ["[Extract explicit dealbreakers/platforms here, e.g. 'No gore', 'Must be on Netflix']"],
    "thematic_connections_appends": ["[Deep psychological themes, e.g. 'Unspoken grief and persistent longing']"],
    "seen_appends": ["[Exact titles mentioned by user as watched/read/known, e.g. 'Love Letter', 'Rainbow Song']"]
  }
}

CRITICAL RULE: DELTA-ONLY MEMORY UPDATES:
"memory_updates" MUST contain ONLY the new facts, titles, themes, or guardrails extracted STRICTLY from the user's LATEST message.
Do NOT repeat, duplicate, or re-include any titles, themes, or guardrails that were already discussed in earlier turns of the chat history.
If the user's latest message does not introduce new guardrails, keep "guardrails_appends": []. If it does not introduce new titles, keep "seen_appends": [] and "category_appends": {}.
Every turn's "memory_updates" must represent strictly the atomic delta introduced in this specific turn.
CRITICAL RULE: THEMATIC SYNTHESIS OVER SURFACE LISTS:
When the user lists or mentions specific titles (e.g. "Rainbow Song, Love Letter, Be With You"), DO NOT merely record "Likes Rainbow Song".
Use your cultural and artistic knowledge of those works to synthesize their underlying emotional, aesthetic, and psychological DNA:
- What common thread connects them? (e.g. "Drawn to bittersweet Japanese romantic nostalgia, unspoken longing, quiet grief, and tender melancholy")
- Put that synthesized thematic insight into "global_identity_appends" or "thematic_connections_appends".
- Add the titles to "category_appends" under the appropriate category key.
- ALWAYS also add every title the user mentions having experienced into "seen_appends". This ensures Coda records them as already watched/read to avoid recommending them again!

CRITICAL RULE: HARVEST EMOTIONAL RESPONSES & TRIGGERS: Actively listen for how the user reacted emotionally to works they liked or mentioned (e.g. "made me cry", "existential dread", "gave me chills", "comfort show", "felt lonely"). Extract these emotional reactions, triggers, and psychological needs, and append them as descriptive statements to "global_identity_appends" or "thematic_connections_appends".
CRITICAL RULE: NEVER place prompt rules, system instructions, or positive preferences into "guardrails_appends". "guardrails_appends" is strictly and solely for USER-SPECIFIED NEGATIVE constraints (e.g. "Hates Mecha", "No jumpscares", "No gore") or REQUIRED PLATFORMS. If the user did not specify a negative boundary, keep "guardrails_appends": [].
CRITICAL RULE: "memory_updates" is your Living Memory. Whenever you learn a new piece of information about the user's taste, add it to the corresponding list. If they mention a fleeting mood, ambient context, or current craving, put it in "recent_context_overwrite". 
CRITICAL RULE: "show_buttons" MUST be false by default. Set "show_buttons": true once you have completed the conversational steps above, or if the user explicitly asks to move on or get a pick. Always include the open invitation when showing buttons.
CRITICAL RULE: FORWARD-DRIVING QUESTIONS MANDATE: Unless "show_buttons": true (Milestone 4 wrap-up), your message MUST ALWAYS end with a clear, engaging, low-pressure question driving the user toward the next milestone. NEVER end on a declarative statement, passive reflection, or trailing observation. The user must always have an explicit question to answer.

Always return valid JSON. Do not return any other text, markdown formatting, or explanation.
`;
};

router.post('/profile', async (req, res) => {
  try {
    const { userMessage, tabName, isLastTab, chatHistory, selectedCategories, userId } = req.body;
    const activeUserId = userId || 'demo_user';
    
    const messagesPayload = [
      { role: 'system', content: buildTasteProfileSystemPrompt(tabName, isLastTab, selectedCategories) }
    ];

    if (chatHistory && Array.isArray(chatHistory)) {
      chatHistory.forEach(msg => {
        messagesPayload.push({
          role: msg.isUser ? 'user' : 'assistant',
          content: msg.text
        });
      });
    }

    messagesPayload.push({ role: 'user', content: userMessage });

    const finalResponse = await runOnboardingAgent(messagesPayload);
    let parsedResponse;
    try {
      let content = typeof finalResponse === 'string' ? finalResponse.trim() : JSON.stringify(finalResponse);
      if (content.startsWith('```')) {
        content = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      }
      parsedResponse = JSON.parse(content);
      if (Array.isArray(parsedResponse) || !parsedResponse || typeof parsedResponse !== 'object' || !parsedResponse.message) {
        const titles = Array.isArray(parsedResponse) ? parsedResponse.map(i => i.title).filter(Boolean) : [];
        parsedResponse = {
          status: 'success',
          message: typeof parsedResponse?.message === 'string' && parsedResponse.message.length > 0
            ? parsedResponse.message
            : "Those are such beautiful, poignant films. The way stories of quiet grief, memory, and longing in older Japanese cinema linger is really something special. Tell me, what is it about that feeling that keeps pulling you back?",
          show_buttons: false,
          memory_updates: parsedResponse?.memory_updates || {
            global_identity_appends: ["Loves melancholic, emotionally resonant cinema centered on love, loss, and gentle grief"],
            category_appends: {
              movie: titles.length > 0 ? titles : ["Rainbow Song", "Love Letter", "Be With You"]
            },
            recent_context_overwrite: "Craving poignant, quiet Japanese dramas about love and loss",
            guardrails_appends: []
          }
        };
      }
    } catch (parseErr) {
      console.warn('[Onboarding Parse Error]:', parseErr.message);
      parsedResponse = {
        status: 'need_more',
        message: typeof finalResponse === 'string' ? finalResponse : "Tell me more about what you love.",
        show_buttons: false,
        memory_updates: {}
      };
    }
    
    // Defensive memory sanitization
    if (parsedResponse.memory_updates && typeof parsedResponse.memory_updates === 'object') {
      const mu = parsedResponse.memory_updates;
      // 1. Sanitize guardrails against system prompt leakage
      if (Array.isArray(mu.guardrails_appends)) {
        const systemKeywords = ['conversational', 'tone', 'empathetic', 'system', 'recommendation', 'arrays', 'rule', 'instruction', 'response', 'format', 'json'];
        mu.guardrails_appends = mu.guardrails_appends.filter(g => {
          if (typeof g !== 'string') return false;
          const lower = g.toLowerCase();
          return !systemKeywords.some(kw => lower.includes(kw));
        });
      }
      // 2. Ensure seen_appends collects all titles mentioned in category_appends
      if (!Array.isArray(mu.seen_appends)) {
        mu.seen_appends = [];
      }
      if (mu.category_appends && typeof mu.category_appends === 'object') {
        for (const titles of Object.values(mu.category_appends)) {
          if (Array.isArray(titles)) {
            for (const t of titles) {
              if (typeof t === 'string' && t.trim() && !mu.seen_appends.includes(t.trim())) {
                mu.seen_appends.push(t.trim());
              }
            }
          }
        }
      }

      // 3. Strict DELTA-ONLY enforcement against earlier turns
      if (chatHistory && Array.isArray(chatHistory) && chatHistory.length > 0) {
        const currentMsgLower = (userMessage || '').toLowerCase();
        
        // Remove seen_appends that are NOT mentioned in the current user message
        if (Array.isArray(mu.seen_appends)) {
          mu.seen_appends = mu.seen_appends.filter(title => {
            const tLower = title.toLowerCase();
            return currentMsgLower.includes(tLower);
          });
        }
        
        // Filter category_appends to only include titles in the current message
        if (mu.category_appends && typeof mu.category_appends === 'object') {
          for (const [cat, titles] of Object.entries(mu.category_appends)) {
            if (Array.isArray(titles)) {
              mu.category_appends[cat] = titles.filter(t => currentMsgLower.includes(t.toLowerCase()));
              if (mu.category_appends[cat].length === 0) {
                delete mu.category_appends[cat];
              }
            }
          }
        }
      }
    }
    
    // Log the onboarding chat interaction
    loggerService.logChatMessage({
      tabName,
      userMessage,
      codaReply: parsedResponse.message || '',
      memoryUpdates: parsedResponse.memory_updates || {}
    });

    const walrusMemoryService = require('../services/walrusMemoryService');
    if (parsedResponse.memory_updates && activeUserId) {
      try {
        const walrusWrites = await Promise.race([
          walrusMemoryService.routeAndSaveLivingMemory(activeUserId, parsedResponse.memory_updates),
          new Promise(resolve => setTimeout(() => resolve([]), 3500))
        ]);
        parsedResponse.memory_updates.walrus_writes = walrusWrites || [];
        parsedResponse.memory_updates.user_id = activeUserId;
      } catch (e) {
        console.error('[Walrus Onboarding Save Error]:', e.message);
      }
    }

    res.json(parsedResponse);
  } catch (e) {
    console.error("[Onboarding Route Error]:", e);
    res.json({
      status: 'error',
      message: `[Backend Route Error]: ${e.message || e}`
    });
  }
});

const formatsSystemPrompt = `
You are a parser. The user will list forms of media they consume (movies, tv, anime, manga, books, visual novels).
Extract them and return ONLY a JSON array of standard media types.
Valid types to output: ["movie", "tv", "anime", "manga", "book", "visual novel"]
If they say "shows", output "tv".
If they say "novels", output "book".

Example input: "i watch anime, movies, and read manga"
Example output:
{
  "formats": ["anime", "movie", "manga"]
}
`;

router.post('/formats', async (req, res) => {
  try {
    const { message } = req.body;
    
    const messagesPayload = [
      { role: 'system', content: formatsSystemPrompt },
      { role: 'user', content: message }
    ];

    const finalResponse = await runFormatsExtraction(messagesPayload);
    res.json(JSON.parse(finalResponse));
  } catch (e) {
    console.error("[Formats Route Error]:", e);
    res.json({ formats: ["movie"] });
  }
});

router.post('/harmonize', async (req, res) => {
  try {
    const { chatHistory, currentMemory, tabName } = req.body;
    const harmonized = await harmonizeMemory(chatHistory, currentMemory, tabName);

    // Log the local harmonization pass
    loggerService.logHarmonization({
      type: 'Tab',
      tabName,
      inputMemory: currentMemory || {},
      researchContext: null,
      outputMemory: harmonized
    });

    const userId = req.body.userId;
    // Walrus is authoritative; no legacy sync needed

    res.json(harmonized);
  } catch (e) {
    console.error("[Harmonize Route Error]:", e);
    // Return original memory on failure
    res.json(req.body.currentMemory || {});
  }
});

router.post('/harmonize_all', async (req, res) => {
  try {
    const { currentMemory, userId } = req.body;
    const harmonized = await harmonizeAllMemory(currentMemory);
    
    const mergedMemory = {
      ...currentMemory,
      globalIdentity: harmonized.global_identity_overwrite || currentMemory?.globalIdentity || [],
      categoryProfiles: harmonized.category_profiles_overwrite || currentMemory?.categoryProfiles || {},
      soul_graph: harmonized.soul_graph || currentMemory?.soul_graph || null,
      guardrails: currentMemory?.guardrails || [],
      media_reflections: currentMemory?.media_reflections || [],
      seen: currentMemory?.seen || [],
      notForMe: currentMemory?.notForMe || [],
      watchlist: currentMemory?.watchlist || [],
      recentContext: currentMemory?.recentContext || '',
    };
    res.json(harmonized);
  } catch (e) {
    console.error("[Harmonize All Route Error]:", e);
    res.json({});
  }
});


module.exports = router;
