const path = require('path');

// Load environment variables
require('./loadEnv');

const llmService = require('./services/llmService');

const testProfile = {
  globalIdentity: "Fortune is an introspective 18-year-old who seeks profound narratives that explore love, loss, and the complexities of human experience. They are drawn to character-driven stories, particularly in romance and slice of life settings, valuing emotional depth and diverse characters with rich backstories.",
  categories: {
    anime: ["Loves Steins;Gate for its romance and psychological depth", "Loves Monster and Shinsekai Yori", "Avoids generic, mass appeal content with no substance"]
  }
};

const directive = "User core identity: " + testProfile.globalIdentity + ". Current craving/recent context: psychological drama anime with deep character development.";
const guardrails = ["Avoid generic, mass appeal content with no substance."];

const elfenLiedMetadata = [
  {
    title: "Elfen Lied",
    genres: ["Action", "Drama", "Horror", "Psychological", "Romance", "Supernatural"],
    tags: ["Gore", "Fugitive", "Monster Girl", "Super Power", "Amnesia", "Tragedy"],
    description: "Two college students provide shelter to a mutant girl with telekinetic powers, unaware of her murderous alter-ego and her dark past.",
    snippets: [
      "The main anime I've liked in the genre are Deathnote, Parasyte, Tokyo Ghoul, and Elfen Lied. Any suggestions are appreciated.",
      "Elfen Lied is a classic dark psychological romance. The tragedy and amnesia elements make the characters incredibly vulnerable."
    ]
  },
  {
    title: "Tokyo Ghoul",
    genres: ["Action", "Drama", "Horror", "Mystery", "Psychological", "Supernatural"],
    tags: ["Gore", "Urban Fantasy", "Tragedy", "Survival"],
    description: "A college student is barely survives a deadly encounter with a ghoul and becomes a half-ghoul himself.",
    snippets: ["Tokyo Ghoul has great character transformation but gets rushed in later seasons."]
  }
];

const elfenLiedSnippets = [
  {
    title: "Is Elfen Lied worth watching?",
    snippet: "Honestly, the romance and tragedy between Lucy and Kouta is beautiful despite the extreme gore. The music box theme Lilium is unforgettable.",
    link: "https://reddit.com"
  },
  {
    title: "Anime with tragic character development",
    snippet: "Elfen Lied completely broke me. The ending is open but Lucy's story is one of the saddest things I've seen in anime.",
    link: "https://reddit.com"
  }
];

async function runVerification() {
  console.log("=== STARTING TONE VERIFICATION ===");
  
  // 1. Test scoreAndSelect (coda_blurb generation)
  console.log("\n--- Testing scoreAndSelect (Single Card Blurb) ---");
  try {
    const selection = await llmService.scoreAndSelect(
      directive,
      elfenLiedMetadata,
      guardrails,
      [],
      []
    );
    console.log("Selected Title:", selection.title);
    console.log("Generated Blurb:", `"${selection.coda_blurb}"`);
    console.log("Length:", selection.coda_blurb.split(' ').length, "words");
  } catch (err) {
    console.error("scoreAndSelect failed:", err);
  }

  // 2. Test generatePitch (pitch_paragraphs generation)
  console.log("\n--- Testing generatePitch (Personal Friend Pitch) ---");
  try {
    const pitch = await llmService.generatePitch(
      directive,
      "Elfen Lied",
      elfenLiedSnippets,
      guardrails
    );
    console.log("Generated Pitch Paragraphs:");
    pitch.pitch_paragraphs.forEach((p, idx) => {
      console.log(`\nParagraph ${idx + 1}:`);
      console.log(p);
    });
  } catch (err) {
    console.error("generatePitch failed:", err);
  }
  
  console.log("\n=== TONE VERIFICATION COMPLETE ===");
}

runVerification();
