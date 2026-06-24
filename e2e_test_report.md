
# E2E Recommendation Pipeline Test

**Test Duration:** 42188ms
**Simulated User Input:**
> "hi im fortune im 18 i love stories of love and loss stories that touch on the cruelty and beauty in human life i like media that speaks to me i like media that leaves an impact that i can feel even long after i have forgotten the plot i love media with a great cast and different characters with dynamics and their own stories, i like mystery i like emotional romance sometimes, i like psychological, i like some surreal movies, across media my favorites are interstellar, katawa shoujo, welcome to the nhk, steins gate, the colorless tsukuru tazaki, norwegian wood, heavenly forest, tsukihime. i like my mcs not to be like the best or the flashiest i like some flaw and brokenness to my mc but the people are still around him i like my loser mc and the perfect girl that comes to save him"

## 1. Soul Graph Construction (12761ms)
```json
{
  "demographics": {
    "stage_in_life": "young professional",
    "struggles": [
      "navigating anxiety and existential dread",
      "coping with feelings of isolation and alienation"
    ]
  },
  "emotional_resonances": {
    "existential-dread": 0.85,
    "quiet-melancholy": 0.95,
    "isolation": 0.9,
    "hopeful-connection": 0.8,
    "emotional-epicness": 0.75
  },
  "aesthetic_affinities": {
    "surreal-melancholy": 0.9,
    "dreamlike-atmosphere": 0.85,
    "psychological-depth": 0.88,
    "visually-ambitious": 0.8
  },
  "creative_anchors": {
    "directors": {
      "Makoto Shinkai": 0.85,
      "Satoshi Kon": 0.8
    },
    "studios": {
      "Kyoto Animation": 0.75
    },
    "authors": {
      "Haruki Murakami": 0.95
    },
    "composers": {
      "Yoko Kanno": 0.7
    },
    "character_archetypes": {
      "psychologically-fractured-protagonist": 0.9,
      "emotionally-complex-ensemble": 0.85
    }
  },
  "themes": {
    "search-for-identity": 0.9,
    "the-pain-of-isolation": 0.85,
    "the-redemptive-power-of-connection": 0.8,
    "the-quiet-tragedy-of-ordinary-life": 0.75
  },
  "tropes": {
    "found-family": 0.8,
    "quietly-saved-by-someone-who-sees-you": 0.85,
    "slow-burn-relationships": 0.9
  },
  "relational_dynamics": {
    "broken-person-reached-by-genuine-connection": 0.85,
    "complex-love-that-costs-something": 0.75
  },
  "worldview": {
    "sees-beauty-in-brokenness": 0.9,
    "believes-in-quiet-redemption": 0.85,
    "drawn-to-the-tragic-yet-beautiful": 0.8
  },
  "pacing_preference": {
    "slow-burn": 0.95,
    "moderate": 0.7,
    "fast-paced": 0.2
  },
  "guardrails": [
    "dislikes heavy horror or tragedy",
    "avoids mindless action and battle shonen"
  ]
}
```
**Guardrails Extracted:** []

## 2. Facet Targeting & Brief Generation (6374ms)
**Declared Vibe Focus:** "A slow-burn, dreamlike exploration of connection and healing amidst existential anxiety, featuring a psychologically fractured protagonist who finds solace in unexpected companionship."
**Search Brief Generated:**
> A quietly introspective young woman, burdened by her own existential dread and feelings of isolation, navigates the complexities of life in a bustling city. She stumbles upon a kindred spirit, a boy who carries his own emotional scars, and their bond blossoms through shared moments of vulnerability and understanding. As they explore the beauty of their surroundings, the narrative unfolds in a soft, dreamlike haze, capturing the fleeting nature of connection and the profound impact of being truly seen. The climax arrives not in grand gestures, but in a gentle realization that they have both found a place to belong in each other’s lives, leaving the viewer with a bittersweet sense of hope that lingers long after the credits roll.

## 3. Vector Search Results (3559ms)
1. **Your Name** (Score: 0.525)\n2. **Clannad: After Story** (Score: 0.493)\n3. **Neon Genesis Evangelion** (Score: 0.492)\n4. **Steins;Gate** (Score: 0.471)\n5. **A Silent Voice** (Score: 0.466)\n6. **Cowboy Bebop** (Score: 0.462)\n7. **Violet Evergarden** (Score: 0.456)\n8. **Spirited Away** (Score: 0.453)

## 4. Editorial Decision (13083ms)
**Top Pick:** Your Name
**Coda Blurb:** "I promise you'll be staring at the ceiling after this one."
**The Pitch:**
You have to experience *Your Name.* It's a breathtaking journey that captures the essence of connection and longing in the most dreamlike way. The story of Mitsuha and Taki, two teenagers who find themselves inexplicably swapping bodies, is a slow-burn exploration of their lives and the emotional voids they navigate. The film’s ability to evoke feelings of youthful yearning and bittersweet fate is unparalleled, and it leaves you with a lingering sense of hope amidst the chaos of existence. Watching it feels like floating through a beautiful dream, where every scene is infused with stunning visuals and a hauntingly beautiful score that will stick with you long after the credits roll.\n\nWhat truly makes *Your Name.* special is how it mirrors our own struggles with isolation and the search for connection. It speaks to anyone who has ever felt lost, yearning for something—or someone—just out of reach. The emotional rhythm of the film captures the quiet melancholy of life, reminding us that even in our most fractured moments, there is beauty in the connections we forge. If you love the emotional depth and surreal atmosphere of Haruki Murakami's works, this film will resonate deeply with you.

**Runner Ups:**
- Clannad: After Story\n- A Silent Voice
