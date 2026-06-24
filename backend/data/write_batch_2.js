const fs = require('fs');
const path = require('path');

const outDir = 'c:\\Users\\USER\\Documents\\Coda\\backend\\data\\completed_synthesis';

const writeJson = (uuid, data) => {
    fs.writeFileSync(path.join(outDir, uuid + '.json'), JSON.stringify(data, null, 2), 'utf8');
}

writeJson("4756f3e9-2a5b-b13a-e48b-d4877b00cf95", {
  "metadata_synthesis": "The Son's Room (2001), directed by Nanni Moretti, is an Italian drama that tenderly explores the sudden devastation of grief within an otherwise comfortable bourgeois family.",
  "setting_and_subculture": "A tranquil, upper-middle-class coastal city in Italy. The setting feels deeply ordinary and comforting, emphasizing the normalcy of the family's life before it is violently disrupted by tragedy.",
  "visual_tone_and_feel": "Naturalistic, warm, and unobtrusive. The visual language captures the authentic rhythm of daily life, avoiding melodramatic flourishes to let the sheer vastness of sudden tragedy speak for itself.",
  "media_era_tone": "Early 2000s European arthouse drama, characterized by a grounded, psychologically astute approach to domestic tragedy without resorting to cheap emotional manipulation.",
  "pacing_and_structure": "The film carefully establishes a stable, rhythmic routine in its first act, only to shatter it entirely. The subsequent pacing is adrift and drowsy, mirroring the paralyzing stasis of mourning.",
  "atmosphere_and_mood": "Deeply melancholic but ultimately compassionate. It transitions from a warm, secure domesticity into a profound, queasy emptiness, slowly thawing into a fragile, tentative hope.",
  "themes_and_messages": "The uncontrollable nature of grief and the agonizing fixation on the 'what-ifs' of tragedy. It suggests that while the passing of time is cruel, it is also the only mechanism that allows for eventual, imperfect healing.",
  "character_relationships": "A loving, highly communicative nuclear family that becomes emotionally fractured and isolated by a shared, unspeakable loss, before finding a strange, unifying solace through a secret from their son's past.",
  "lead_character_type": "Giovanni is a successful psychoanalyst who spends his life calmly unknotting the trivial neuroses of others, only to be left entirely helpless and obsessive when confronted with a crisis he cannot analyze away.",
  "story_and_plot_type": "A domestic tragedy and psychological study of grief. It is a slow, character-driven journey through the aftermath of an unexpected death.",
  "who_and_when": "For the emotionally prepared viewer seeking a profound, cathartic cry. Best watched when you want to reflect on the fragility of life and the painful necessity of moving forward.",
  "emotional_evocation": "It leaves you with a queasy stomach and a heavy heart, evoking a deep, empathetic devastation before offering a gentle, lingering sense of tender, imperfect closure."
});

writeJson("5e10cca1-5a5f-0c81-cf17-460e7c7e77c8", {
  "metadata_synthesis": "Rome, Open City (1945), directed by Roberto Rossellini, is a seminal Italian war drama that essentially birthed the Neorealist movement in the immediate ruins of World War II.",
  "setting_and_subculture": "Nazi-occupied Rome during the final, desperate days of WWII. It is a city defined by rationing, curfews, paranoia, and the clandestine, dangerous operations of the Italian resistance.",
  "visual_tone_and_feel": "Visceral, documentary-like, and stripped of Hollywood artifice. The aesthetic relies on raw, authentic urban locations, capturing the gritty, unembellished reality of a war-torn city.",
  "media_era_tone": "The absolute genesis of Italian Neorealism, marking a revolutionary shift toward socially conscious, hyper-realistic filmmaking using actual locations and non-professional actors.",
  "pacing_and_structure": "Tense, urgent, and episodic. The pacing reflects the constant, life-or-death anxiety of life under occupation, escalating rapidly from daily survival into harrowing tragedy.",
  "atmosphere_and_mood": "Suffocatingly tense, heroic, and tragic. A pervasive atmosphere of dread hangs over the film, illuminated by brief flashes of extraordinary human courage and moral clarity.",
  "themes_and_messages": "The moral imperative of resistance against fascism. It explores the sacrifices required to maintain human dignity and freedom in the face of absolute tyranny, asserting that dying well is easier than living well under oppression.",
  "character_relationships": "Forged in the fires of shared resistance. Characters are bound by a desperate, ideological solidarity that transcends religious and social differences, uniting communist atheists and Catholic priests.",
  "lead_character_type": "An ensemble of ordinary working-class citizens, a fiercely protective widowed mother, and a morally steadfast Catholic priest, all thrust into the role of reluctant but unwavering martyrs.",
  "story_and_plot_type": "A historical thriller and tragic wartime melodrama that chronicles the brutal cat-and-mouse game between Italian partisans and the Gestapo.",
  "who_and_when": "For those seeking a foundational cinematic experience that captures history as it was bleeding. Best viewed when seeking inspiration from the historical resilience of ordinary people against systemic evil.",
  "emotional_evocation": "It evokes a profound, visceral anxiety and heartbreaking sorrow, mixed with an overwhelming awe for the raw courage of those who defied fascism."
});

writeJson("5e703719-b6e0-eeff-e508-0b108982553c", {
  "metadata_synthesis": "Germany Year Zero (1948), directed by Roberto Rossellini, is a devastating Italian Neorealist tragedy that documents the psychological ruins of a post-WWII Berlin.",
  "setting_and_subculture": "A completely annihilated, physically and spiritually bombed-out Berlin directly after the war. The landscape is a labyrinth of rubble, inhabited by desperate, starving civilians scrounging for basic survival.",
  "visual_tone_and_feel": "Unrelentingly bleak and hauntingly empty. The camera lingers on the physical devastation of the city, using the skeletal remains of buildings to mirror the hollow, traumatized inner lives of the survivors.",
  "media_era_tone": "The starkest, most uncompromising edge of Italian Neorealism. It is a film utterly devoid of sentimentality, capturing the immediate, unfiltered nightmare of postwar Europe.",
  "pacing_and_structure": "A grueling, fatalistic slow-burn. The narrative follows a steady, inescapable downward trajectory, wandering aimlessly through the ruins just as its young protagonist does, leading to an unimaginably dark conclusion.",
  "atmosphere_and_mood": "Basement-level bleak, cold, and profoundly hopeless. The mood is a stifling, suffocating despair where innocence is impossible and every adult influence is corrupted.",
  "themes_and_messages": "The total corruption of innocence by war and toxic ideology. It brutally argues that the ideological poison of fascism and the physical reality of war destroy the souls of children, leaving them with no viable future.",
  "character_relationships": "Deeply predatory, parasitic, and void of true affection. The boy is surrounded by adults who either exploit him, burden him with impossible responsibilities, or poison his mind with sociopathic Nazi rhetoric.",
  "lead_character_type": "Edmund is a 12-year-old boy burdened with the survival of his family. He is not a typical innocent child, but a hollowed-out victim forced to navigate a moral vacuum.",
  "story_and_plot_type": "A coming-of-age anti-narrative that is actually a descent into absolute tragedy; a pure, unrelenting survival story that ultimately ends in self-destruction.",
  "who_and_when": "For viewers with strong emotional fortitude who are prepared for one of the bleakest films ever made. Do not watch if seeking hope; watch only to understand the deepest scars of history.",
  "emotional_evocation": "It drains the soul entirely. It evokes a crushing, overwhelming sense of futility and heartbreak, leaving the viewer completely emotionally devastated and physically hollow."
});

writeJson("602504f1-2661-07ff-48ac-1212ccb39440", {
  "metadata_synthesis": "This Is Not a Film (2011), co-directed by Mojtaba Mirtahmasb and Jafar Panahi, is a defiant Iranian documentary shot entirely on consumer cameras and smuggled out of the country in a cake.",
  "setting_and_subculture": "The claustrophobic confines of Jafar Panahi's Tehran apartment. The setting is intimate but heavy with the invisible presence of the Iranian state, while distant sirens and gunfire constantly bleed through the walls.",
  "visual_tone_and_feel": "Raw, lo-fi, and deeply intimate. The aesthetic is entirely utilitarian, shot on a digital camera and an iPhone, reflecting the urgent, clandestine nature of its creation.",
  "media_era_tone": "A defining piece of 21st-century digital resistance cinema, utilizing accessible technology to bypass state censorship and challenge an authoritarian regime.",
  "pacing_and_structure": "A seemingly casual, real-time observance of a day in the life of a man under house arrest. The pacing is deliberately mundane, building a quiet tension that underscores the absurdity of his imprisonment.",
  "atmosphere_and_mood": "Simultaneously charming, gentle, and deeply anxious. There is a profound warmth to Panahi's love for cinema, sharply juxtaposed against the cold, looming threat of a 20-year prison sentence.",
  "themes_and_messages": "The absolute necessity of artistic expression and the futility of state censorship. It proves that cinema is not defined by massive budgets or state approval, but by the unbreakable compulsion of an artist to tell a story.",
  "character_relationships": "Defined by deep loyalty and quiet rebellion. The dynamic between Panahi and Mirtahmasb is one of silent solidarity, two men risking their freedom simply by pointing a camera at one another.",
  "lead_character_type": "Jafar Panahi himself, acting as both subject and creator. He is a passionate, frustrated, yet incredibly resilient artist who refuses to let go of his craft, even when legally shackled.",
  "story_and_plot_type": "A meta-documentary and an act of civil disobedience. The plot is simply the act of existing and attempting to describe an unmade film while waiting for an unjust legal verdict.",
  "who_and_when": "For cinephiles and advocates of free speech who want to be reminded of the power and importance of art. Best viewed when feeling cynical about the purpose of creative work.",
  "emotional_evocation": "It evokes profound awe and immense respect. It reassures the viewer of the enduring power of human passion, blending heartbreak with an overwhelmingly inspiring sense of artistic defiance."
});

writeJson("60bcdce5-55ce-c28f-e396-c520fbe16769", {
  "metadata_synthesis": "Woman is the Future of Man (2004), directed by Hong Sang-soo, is a South Korean drama that offers a brutally bleak, minimalist deconstruction of male insecurity and toxic nostalgia.",
  "setting_and_subculture": "The freezing, snowy urban landscapes of Seoul and Puchon. The environments are largely confined to claustrophobic Chinese restaurants, hotel bars, and tiny apartments, emphasizing a world of endless, repetitive drinking.",
  "visual_tone_and_feel": "Bressonian in its control, yet mundane and visually unromantic. The cold, snowy exterior reflects the chilling emotional barrenness of the characters, while the framing purposefully corners them into increasingly tight spaces.",
  "media_era_tone": "A quintessential entry in the South Korean New Wave, characterized by Hong Sang-soo's signature use of long, awkward takes, copious alcohol consumption, and excruciatingly honest character studies.",
  "pacing_and_structure": "Meandering, repetitive, and intentionally frustrating. The narrative unfolds through long hours of drinking and flashback recollections, trapping the viewer in the cyclical, dead-end lives of its protagonists.",
  "atmosphere_and_mood": "Excruciatingly awkward, pathetic, and deeply cynical. The mood is a toxic blend of self-pity and performative masculinity, devoid of any genuine warmth or redemption.",
  "themes_and_messages": "A savage indictment of patriarchal cruelty and male sexual insecurity. It explores how emotionally vacant men weaponize their insecurities to mistreat women, using them merely as vessels to fill their own pathetic voids.",
  "character_relationships": "Profoundly toxic and manipulative. The two male friends engage in a pathetic, unspoken gamesmanship, treating the woman between them not as a human being, but as a prize to validate their own fragile egos.",
  "lead_character_type": "Two incredibly selfish, emotionally stunted, and self-pitying men who are utterly lacking in self-awareness. They are anti-heroes whose childishness makes them dangerous to the women around them.",
  "story_and_plot_type": "A character-driven, anti-romantic drama that acts as a painfully realistic slice-of-life. There is no traditional narrative arc, only the slow revelation of deeply ingrained character flaws.",
  "who_and_when": "For viewers who appreciate uncompromising, uncomfortable character studies of terrible people. Best watched when you have the patience for a meditative, deeply cynical exploration of human toxicity.",
  "emotional_evocation": "It elicits intense frustration, disgust, and a profound sense of claustrophobia. The unbearable cruelty of the characters leaves the viewer deeply repulsed by the pathetic realities of fragile masculinity."
});

console.log("Batch 2 written successfully.");
