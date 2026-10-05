
# E2E Recommendation Pipeline Test

**Test Duration:** 35575ms
**Simulated User Input:**
> "hi im fortune im 18 i love stories of love and loss stories that touch on the cruelty and beauty in human life i like media that speaks to me i like media that leaves an impact that i can feel even long after i have forgotten the plot i love media with a great cast and different characters with dynamics and their own stories, i like mystery i like emotional romance sometimes, i like psychological, i like some surreal movies, across media my favorites are interstellar, katawa shoujo, welcome to the nhk, steins gate, the colorless tsukuru tazaki, norwegian wood, heavenly forest, tsukihime. i like my mcs not to be like the best or the flashiest i like some flaw and brokenness to my mc but the people are still around him i like my loser mc and the perfect girl that comes to save him"

## 1. Soul Graph Construction (20663ms)
```json
{
  "psychological_profile": {
    "temperament": "You possess a deeply introspective and sensitive temperament, often navigating the complexities of human emotion with a keen awareness of the subtleties that define relationships and experiences. This sensitivity allows you to engage profoundly with narratives that explore the human condition, yet it also leaves you vulnerable to the weight of emotional intensity.",
    "core_struggles": [
      "loneliness",
      "anxiety",
      "processing grief",
      "seeking connection"
    ],
    "worldview_lens": "You find beauty in quiet tragedy and believe in the power of human connection to heal wounds, often gravitating towards stories that reflect the fragility of life and the importance of empathy.",
    "relational_dynamics": [
      "broken characters finding slow comfort together",
      "intimate explorations of emotional landscapes"
    ],
    "implicit_deductions": {
      "likely_likes": [
        "slow-burn narratives",
        "psychological depth",
        "character-driven stories",
        "themes of isolation and connection"
      ],
      "likely_dislikes": [
        "loud spectacle",
        "mindless action",
        "cliché melodramas",
        "tragedies that lack resolution"
      ]
    }
  },
  "media_profiles": {
    "movie": {
      "loved_titles_in_category": [
        "Interstellar",
        "Heavenly Forest"
      ],
      "themes": {
        "emotional exploration": 1,
        "love and loss": 0.9,
        "human connection": 0.8
      },
      "emotional_resonances": {
        "melancholy": 1,
        "nostalgia": 0.9,
        "hope": 0.8
      },
      "aesthetic_affinities": {
        "visually ambitious": 1,
        "intimate and quiet": 0.9
      },
      "creative_anchors": {
        "directors": {
          "Christopher Nolan": 1,
          "Takehiko Shinjo": 0.9
        },
        "studios": {
          "Gonzo": 0.8
        },
        "authors": {},
        "composers": {},
        "character_archetypes": {
          "introspective protagonist": 1
        }
      },
      "pacing": "slow-burn"
    },
    "anime": {
      "loved_titles_in_category": [
        "Welcome to the NHK",
        "Steins;Gate"
      ],
      "themes": {
        "psychological introspection": 1,
        "social isolation": 0.9,
        "time and consequence": 0.8
      },
      "emotional_resonances": {
        "existential dread": 1,
        "hope in despair": 0.9,
        "friendship": 0.8
      },
      "aesthetic_affinities": {
        "urban settings": 1,
        "quirky character designs": 0.8
      },
      "creative_anchors": {
        "directors": {
          "Yusuke Yamamoto": 1,
          "Shinichiro Watanabe": 0.8
        },
        "studios": {
          "White Fox": 0.9
        },
        "authors": {},
        "composers": {},
        "character_archetypes": {
          "ensemble cast": 1
        }
      },
      "pacing": "slow-burn"
    },
    "visualNovel": {
      "loved_titles_in_category": [
        "Katawa Shoujo",
        "Tsukihime"
      ],
      "themes": {
        "emotional weight": 1,
        "branching narratives": 0.9,
        "identity and acceptance": 0.8
      },
      "emotional_resonances": {
        "intimacy": 1,
        "melancholy": 0.9,
        "self-discovery": 0.8
      },
      "aesthetic_affinities": {
        "slice of life": 1,
        "character-driven storytelling": 0.9
      },
      "creative_anchors": {
        "directors": {},
        "studios": {},
        "authors": {
          "Kinoko Nasu": 1
        },
        "composers": {},
        "character_archetypes": {
          "complex protagonists": 1
        }
      },
      "pacing": "slow-burn"
    },
    "book": {
      "loved_titles_in_category": [
        "The Colorless Tsukuru Tazaki",
        "Norwegian Wood"
      ],
      "themes": {
        "alienation": 1,
        "nostalgia": 0.9,
        "search for identity": 0.8
      },
      "emotional_resonances": {
        "wistfulness": 1,
        "introspection": 0.9,
        "heartbreak": 0.8
      },
      "aesthetic_affinities": {
        "literary fiction": 1,
        "surrealism": 0.9
      },
      "creative_anchors": {
        "directors": {},
        "studios": {},
        "authors": {
          "Haruki Murakami": 1
        },
        "composers": {},
        "character_archetypes": {
          "introspective protagonists": 1
        }
      },
      "pacing": "slow-burn"
    }
  },
  "guardrails": [
    "heavy horror",
    "tragedies that lack resolution"
  ],
  "coda_summary": "You are a seeker of emotional truths, drawn to narratives that explore the delicate interplay of love, loss, and the human experience. Your taste reflects a profound appreciation for stories that linger in the quiet moments, where characters grapple with their inner worlds and find solace in connection. As you navigate the complexities of life, you find beauty in the melancholic, believing that even in despair, there is hope for understanding and healing."
}
```
**Guardrails Extracted:** []

## 2. Facet Targeting & Brief Generation (4480ms)
**Declared Vibe Focus:** "A warm found-family slice-of-life with a bittersweet ending that quietly guts you"
**Search Brief Generated:**
> [Era: early 2000s] [Origin: Japanese] [Style: soft, dreamlike, film-grain] [Genre: slice-of-life drama] 
[Setting & Subculture]: A cozy, cluttered apartment in a bustling Tokyo neighborhood, where the struggles of youth and adulthood intertwine with the warmth of shared meals and late-night conversations.
[Visual Tone & Feel]: The aesthetic is soft and inviting, with muted colors that evoke a sense of nostalgia, capturing the fleeting moments of joy and sorrow in a world that feels both intimate and vast.
[Pacing & Structure]: The narrative unfolds slowly, allowing for deep character development and emotional resonance, punctuated by moments of levity that contrast with the underlying themes of loneliness and connection.
[Atmosphere & Mood]: A bittersweet atmosphere permeates the story, where laughter is often tinged with sadness, and the characters find solace in each other's company amidst their struggles.
[Themes & Messages]: The media explores themes of friendship, the search for belonging, and the quiet battles of mental health, ultimately conveying that even in the darkest times, connection can bring light.
[Character Relationships]: The dynamics are characterized by a found-family vibe, where broken individuals support one another, creating a safe space for vulnerability and healing.
[Lead Character Type]: An introspective protagonist grappling with social anxiety and existential dread, who learns to navigate relationships and find hope through the bonds they form.
[Story & Plot Type]: A character-driven narrative that weaves together the lives of several individuals, each facing their own challenges, culminating in a poignant exploration of human connection.
[Emotional Evocation (Consensus)]: Leaves you feeling a mix of warmth and melancholy, as you reflect on your own relationships and the beauty found in shared struggles, making you appreciate the little moments of joy amidst the chaos.

## 3. Vector Search Results (1699ms)
1. **Tooi Sekai** (Score: 0.750)\n2. **Kotonoha no Niwa** (Score: 0.749)\n3. **Egao** (Score: 0.742)\n4. **Fukumenkei Noise** (Score: 0.737)\n5. **Kumo no Mukou, Yakusoku no Basho** (Score: 0.737)\n6. **Welcome to the NHK** (Score: 0.735)\n7. **Hige wo Soru. Soshite Joshikousei wo Hirou.** (Score: 0.735)\n8. **Kono Danshi, Sekka ni Nayandemasu.** (Score: 0.735)

## 4. Editorial Decision (5715ms)
**Top Pick:** Kotonoha no Niwa
**Coda Blurb:** "Trust me, this one will linger with you."
**The Pitch:**
Imagine stepping into a world where every raindrop feels like a whisper of emotions, where the beauty of connection is painted against the backdrop of solitude. 'Kotonoha no Niwa' (The Garden of Words) is a breathtaking exploration of love and loneliness, set in a serene garden during Japan's rainy season. The slow pacing allows you to soak in every moment, every glance shared between Takao and Yukari, as they navigate their own struggles while finding solace in each other's presence. This film captures the bittersweet nature of relationships, making you reflect on your own connections and the fleeting moments that define them.\n\nAs you watch, you'll find yourself enveloped in a warm yet melancholic atmosphere that resonates deeply with your introspective nature. The lush visuals and soft rain create a dreamlike quality, inviting you to reflect on your own experiences of love and longing. This isn't just a story; it's an emotional journey that mirrors your own search for connection in a world that often feels isolating. With its profound sense of nostalgia and the delicate interplay of human emotions, 'Kotonoha no Niwa' will leave you with a bittersweet ache, reminding you of the beauty found in both love and loss.

**Runner Ups:**

