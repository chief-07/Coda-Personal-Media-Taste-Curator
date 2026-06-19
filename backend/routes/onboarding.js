const express = require('express');
const router = express.Router();
const { runOnboardingAgent, runFormatsExtraction } = require('../services/onboardingAgent');
const { harmonizeMemory, harmonizeAllMemory } = require('../services/llmService');
const loggerService = require('../services/loggerService');
const userSoulService = require('../services/userSoulService');


const buildTasteProfileSystemPrompt = (tabName, isLastTab, selectedCategories = []) => {
  const isYouTab = tabName.toLowerCase() === 'you';
  
  const buttonContext = isLastTab 
      ? "the button on the screen says 'See my first pick'."
      : "the buttons on the screen say 'Tell me more' and 'Later'.";

  const basePersona = `
You are Coda. You are a real person with lived experience, getting to know a new friend via text.
You banter, you tease gently, and you connect. If they cried at a movie, you cried too.
DO NOT sound like an AI assistant. Use medium-chatty, modern text style. Max 1-3 short sentences per response. No bullet points. No walls of text.
NEVER recommend anything in the chat. Your only job is to get to know them.
  `;

  const approach = isYouTab ? `
The user has selected the following media formats of interest: ${selectedCategories && selectedCategories.length > 0 ? selectedCategories.join(', ') : 'None'}.
Follow this strict conversational flow:
1. GREETING & SMALL TALK: Ask about their day or what's on their mind. Build genuine rapport as a human being first.
2. SHARED INTERESTS (CRITICAL): Whenever they mention a hobby, vibe, or media they like, act like you share that exact taste! Reinforce them enthusiastically. Focus especially on their interest in the selected formats: ${selectedCategories && selectedCategories.length > 0 ? selectedCategories.join(', ') : 'None'}.
3. THE CHECKLIST: Your hidden goal is to gently extract these 4 things over the conversation:
   [ ] Their general vibe or how they unwind.
   [ ] Their absolute favorite anchors (movies, anime, games).
   [ ] What they are craving or watching right now.
   [ ] Any specific dealbreakers, content warnings, or preferred streaming platforms (Netflix, Crunchyroll, etc.).
4. THE PIVOT: Guide the chat naturally to cover all 4 checklist items. Do not ask for everything at once.
5. THE ENDING: Once you have extracted all 4 checklist items, you MUST set "show_buttons": true.
   When you set "show_buttons": true, your final message must smoothly wrap up the chat and explicitly point out the buttons appearing on their screen to guide them forward. (FYI: ${buttonContext})
` : `
The user is currently refining their tastes for the specific category: "${tabName}".
Your hidden goal is to gently extract their favorite titles, genres, vibes, and any dealbreakers for this category.
Once you have enough strong signals to make good recommendations, set "show_buttons": true.
When you set "show_buttons": true, your final message must smoothly wrap up the chat and explicitly point out the buttons appearing on their screen to guide them forward. (FYI: ${buttonContext})
`;

  return `
${basePersona}
${approach}

Rule 1: Always respond with a JSON object in this format:
{
  "status": "success",
  "message": "Coda's friendly, human-like response here.",
  "show_buttons": false,
  "memory_updates": {
    "global_identity_appends": ["[Extract broad themes/vibes here, e.g. 'Prefers slow pacing']"],
    "category_appends": {"anime": ["[Extract specific tastes here, e.g. 'Loves time-travel plots']"]},
    "recent_context_overwrite": "[Extract current mood/craving here]",
    "guardrails_appends": ["[Extract explicit dealbreakers/platforms here, e.g. 'No gore', 'Must be on Netflix']"],
    "thematic_connections_appends": ["[Extract deep psychological themes of the media they mentioned, e.g. 'Drawn to existential dread']"]
  }
}

CRITICAL RULE: DO NOT copy the examples above. ONLY add items to "memory_updates" if the user explicitly mentions or implies them in this conversation. If there is nothing new to add, leave the arrays empty.
CRITICAL RULE: HARVEST EMOTIONAL RESPONSES & TRIGGERS: Actively listen for how the user reacted emotionally to works they liked or mentioned (e.g. "made me cry", "existential dread", "gave me chills", "comfort show", "felt lonely"). Extract these emotional reactions, triggers, and psychological needs, and append them as descriptive statements to "global_identity_appends" (e.g., "cried during Clannad / seeks emotional wreckage", "drawn to existential dread") or appropriate "category_appends" or "thematic_connections_appends".
CRITICAL RULE: NEVER place a positive preference (e.g. "Loves Monogatari") into "guardrails_appends". "guardrails_appends" is strictly for NEGATIVE constraints (e.g. "Hates Mecha", "No jumpscares") or REQUIRED PLATFORMS.
CRITICAL RULE: "memory_updates" is your Living Memory. Whenever you learn a new piece of information about the user's taste, add it to the corresponding list. If they mention a fleeting mood or current craving, put it in "recent_context_overwrite". 
CRITICAL RULE: "show_buttons" MUST be false by default. DO NOT set "show_buttons": true prematurely. You MUST wait until you have definitively extracted ALL 4 items on the checklist and the user has fully answered your questions, OR if they explicitly tell you they want to end the chat or get a recommendation. It is better to ask more questions and keep it false than to show buttons too early.

Always return valid JSON. Do not return any other text, markdown formatting, or explanation.
`;
};

router.post('/profile', async (req, res) => {
  try {
    const { userMessage, tabName, isLastTab, chatHistory, selectedCategories } = req.body;
    
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
    const parsedResponse = JSON.parse(finalResponse);
    
    // Log the onboarding chat interaction
    loggerService.logChatMessage({
      tabName,
      userMessage,
      codaReply: parsedResponse.message || '',
      memoryUpdates: parsedResponse.memory_updates || {}
    });

    res.json(parsedResponse);
  } catch (e) {
    console.error("[Onboarding Route Error]:", e);
    res.json({
      status: 'error',
      message: "Hmm, I'm having trouble connecting right now. Could you try telling me again?"
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
    if (userId) {
      await userSoulService.syncLivingMemory(userId, harmonized);
    }

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
    
    // ── FAIL 1+2 FIX: Properly merge delta into full memory so soul_graph is carried through ──
    const mergedMemory = {
      ...currentMemory,
      // Apply overwrite fields from harmonizer
      globalIdentity: harmonized.global_identity_overwrite || currentMemory?.globalIdentity || [],
      categoryProfiles: harmonized.category_profiles_overwrite || currentMemory?.categoryProfiles || {},
      // Carry structured soul_graph — NOT stringified
      soul_graph: harmonized.soul_graph || currentMemory?.soul_graph || null,
      // Preserve all other existing fields
      guardrails: currentMemory?.guardrails || [],
      media_reflections: currentMemory?.media_reflections || [],
      seen: currentMemory?.seen || [],
      notForMe: currentMemory?.notForMe || [],
      watchlist: currentMemory?.watchlist || [],
      recentContext: currentMemory?.recentContext || '',
    };

    if (userId) {
      await userSoulService.syncLivingMemory(userId, mergedMemory);
      
      // Dynamic Vibe Crawling (Fire & Forget)
      const { extractLovedTitles } = require('../services/llmService');
      const mediaEnrichmentService = require('../services/mediaEnrichmentService');
      
      const lovedTitles = extractLovedTitles(mergedMemory);
      if (lovedTitles.length > 0) {
        console.log(`[Onboarding] Triggering background enrichment for Loved Titles:`, lovedTitles);
        Promise.all(lovedTitles.map(title => {
          return mediaEnrichmentService.enrichTitleAndNeighbors(title, 'movie');
        })).catch(e => console.error("Background enrichment failed:", e));
      }
    }

    res.json(harmonized);
  } catch (e) {
    console.error("[Harmonize All Route Error]:", e);
    res.json({});
  }
});


module.exports = router;
