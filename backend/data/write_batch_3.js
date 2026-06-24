const fs = require('fs');
const path = require('path');

const outDir = 'c:\\Users\\USER\\Documents\\Coda\\backend\\data\\completed_synthesis';

const writeJson = (uuid, data) => {
    fs.writeFileSync(path.join(outDir, uuid + '.json'), JSON.stringify(data, null, 2), 'utf8');
}

writeJson("69e8ca52-f0fd-6c2c-d90c-9be7a1940d25", {
  "metadata_synthesis": "Sword of Desperation (2010), directed by Hideyuki Hirayama, is a somber Japanese jidaigeki that subverts traditional samurai action with slow-burning, melancholic melodrama.",
  "setting_and_subculture": "The rigid, claustrophobic structures of Edo-period Japan. It immerses the viewer in a highly bureaucratic samurai subculture where loyalty is ruthlessly exploited and political scheming reigns supreme.",
  "visual_tone_and_feel": "Solemn, cold, and deliberately understated. The cinematography utilizes gorgeous grays and icy blues, creating a lethargic, documentary-like atmosphere that violently erupts in its final act.",
  "media_era_tone": "A modern, nuanced revival of the classic samurai film, favoring deep psychological realism and institutional critique over romanticized, continuous swordplay.",
  "pacing_and_structure": "An incredibly slow-burn that heavily relies on deliberate flashbacks to layer nuance and backstory, culminating in a sudden, grueling, and brutally realistic climactic bloodbath.",
  "atmosphere_and_mood": "Deeply melancholic and deeply unsettling. A pervasive darkness and quiet institutional cruelty permeate the film, maintaining an emotionally heavy, fatalistic dread.",
  "themes_and_messages": "The destructive absurdity of blind loyalty and the cyclical nature of feudal violence. It suggests that samurai culture is an endless, twisted game engineered by the powerful at the expense of the devoted.",
  "character_relationships": "Defined by exploitation, unspoken trauma, and deeply uncomfortable, taboo domestic dynamics (including an incestuous undertone), all overshadowed by the cold dictates of a feudal hierarchy.",
  "lead_character_type": "Kanemi Sanzaemon is a master swordsman suffering from profound psychological trauma and moral ambiguity. He is a disturbed, quiet anti-hero functioning as an exploited pawn.",
  "story_and_plot_type": "A slow-boiling political melodrama and character study that eventually explodes into an ultra-violent, technical revenge thriller.",
  "who_and_when": "For patient viewers who prefer slow-boiling tension, deep character psychology, and hyper-realistic, savage swordplay over constant action. Best watched when craving a dark, contemplative historical tragedy.",
  "emotional_evocation": "It evokes a deep, simmering frustration at institutional injustice, followed by a shocking, breathless adrenaline rush when the realistic, savage violence is finally unleashed."
});

writeJson("6c3c8914-ffc7-1bf5-4627-bd89a4322f3a", {
  "metadata_synthesis": "Certified Copy (2010), directed by Abbas Kiarostami, is an intellectually dizzying European art-film that blurs the line between reality and performance in the Tuscan countryside.",
  "setting_and_subculture": "A picturesque, sun-drenched village in Tuscany. The environment is saturated with classical European art and antiquities, serving as a symbolic playground for the protagonists' philosophical debates.",
  "visual_tone_and_feel": "Lush, sunlit, and deceptively naturalistic. The camera acts as a warm, inquisitive observer, closely tracking the subtle facial expressions and wandering paths of its two enigmatic leads.",
  "media_era_tone": "The height of 21st-century global arthouse cinema, marked by Kiarostami's signature intellectual playfulness and masterful deconstruction of cinematic truth.",
  "pacing_and_structure": "A conversational, leisurely stroll that structurally shape-shifts. It begins as a straightforward, 'Before Sunrise'-esque walk-and-talk before quietly folding in on itself, becoming a complex, disorienting puzzle.",
  "atmosphere_and_mood": "Romantic, intellectually stimulating, and ultimately bewildering. The mood constantly oscillates between charming familiarity and a haunting, melancholic ambiguity.",
  "themes_and_messages": "An exploration of authenticity in art and relationships. It questions whether a 'certified copy' of a marriage (or a painting) can hold the same emotional weight and truth as the original.",
  "character_relationships": "An emotional labyrinth. The dynamic shifts seamlessly between two intellectual strangers flirting on a day trip to an exhausted, bitterly estranged married couple of fifteen years.",
  "lead_character_type": "An intellectual, emotionally detached British author and a passionate, emotionally complex French antique shop owner, both serving as unreliable narrators of their own shared history.",
  "story_and_plot_type": "A philosophical romance and psychological puzzle box. It is a dialogue-driven narrative where the true nature of the plot remains intentionally unresolved.",
  "who_and_when": "For lovers of intellectual romance and cinematic enigmas. Best viewed when you are eager to untangle a complex, dialogue-heavy puzzle about the nature of human connection.",
  "emotional_evocation": "It leaves the viewer completely emotionally stunned and disoriented, evoking both the warm thrill of new connection and the heartbreaking exhaustion of a dying marriage."
});

writeJson("6c867980-4747-0492-1285-514a078f55f5", {
  "metadata_synthesis": "Half Moon (2006), directed by Bahman Ghobadi, is an Iranian-Kurdish road movie that blends dark comedy with a deeply poetic, surreal exploration of Kurdish identity.",
  "setting_and_subculture": "The rugged, politically fraught borderlands between Iran and Iraqi Kurdistan. It captures a marginalized subculture of traditional Kurdish musicians operating under strict, oppressive national laws.",
  "visual_tone_and_feel": "Visually arresting, blending stark realism with dreamlike surrealism. The arid, mountainous landscapes are captured with a dark, poetic grandeur that often tips into the nightmarish.",
  "media_era_tone": "The poignant era of post-Saddam Kurdish cinema, utilizing a mix of raw neo-realism and dark, metaphorical folklore to express the continuous tragedy of the Kurdish people.",
  "pacing_and_structure": "A chaotic, tragicomic road trip that gradually descends into a hypnotic, trance-like nightmare. The pacing alternates between loud, gullible antics and sudden, terrifying moments of stillness.",
  "atmosphere_and_mood": "Melancholic, darkly hilarious, and increasingly ominous. It feels like a Grimm fairy tale stripped of its Disneyfication—simultaneously a celebration of life and a march toward inevitable doom.",
  "themes_and_messages": "The indestructible resilience of cultural identity against oppressive borders. It highlights the eternal, dangerous journey of the Kurdish people and the profound spiritual weight of their music.",
  "character_relationships": "A chaotic, fiercely loyal patriarchal family dynamic, defined by the overwhelming authority of a stubborn father over his ten sons, and a protective, defiant reverence for a silenced female singer.",
  "lead_character_type": "Mamo is a legendary, stubbornly determined patriarch and maestro who is entirely consumed by his artistic mission, refusing to let even the prophecy of his own death stop him.",
  "story_and_plot_type": "A metaphorical, tragicomic road movie and musical odyssey that morphs into a surreal meditation on mortality.",
  "who_and_when": "For those seeking an unpredictable, culturally rich experience that laughs in the face of death. Best watched when you want a deeply moving, darkly poetic journey into a marginalized world.",
  "emotional_evocation": "It elicits genuine, laugh-out-loud amusement before slowly wrapping the viewer in a terrifying, trance-like dread, ultimately leaving a lingering sense of profound, beautiful sorrow."
});

writeJson("6dc7a1b8-bb3b-97f5-197b-ca3fe7c7f0f2", {
  "metadata_synthesis": "Time (2006), directed by Kim Ki-duk, is a deeply unsettling South Korean psychological drama that explores the grotesque extremes of romantic insecurity and obsession.",
  "setting_and_subculture": "A sterile, modern South Korea, moving between ordinary cafes and the clinical, transformative environment of plastic surgery clinics. It captures a culture deeply concerned with aesthetics and reinvention.",
  "visual_tone_and_feel": "Clinical, unnerving, and slightly surreal. The visual language is stark and intimate, turning the pursuit of beauty into something distinctly grotesque and psychologically horrifying.",
  "media_era_tone": "Mid-2000s South Korean auteur cinema, characterized by Kim Ki-duk's signature blend of extreme psychological cruelty, surrealism, and deeply flawed human protagonists.",
  "pacing_and_structure": "A circular, disorienting descent into madness. The structure is built like a paranoid labyrinth where the viewer and the characters lose all sense of direction, eventually looping back to a devastating starting point.",
  "atmosphere_and_mood": "Suffocatingly paranoid and deeply uncomfortable. The mood is steeped in irrational jealousy, toxic game-playing, and an overwhelming, destructive fragility.",
  "themes_and_messages": "A harrowing critique of how extreme insecurity and the fear of losing love can completely destroy identity. It posits that attempting to physically cheat the passage of time only results in the destruction of the soul.",
  "character_relationships": "Profoundly toxic, manipulative, and built on a foundation of severe insecurity. The relationship is a destructive cycle of irrational goading, jealousy, and a desperate, impossible yearning for validation.",
  "lead_character_type": "Seh-hee is a woman completely paralyzed by her own fragile ego and paranoia, who goes to the extreme of erasing her physical identity to maintain an illusion of love.",
  "story_and_plot_type": "A psychological thriller and tragic character study wrapped around a highly absurd, allegorical premise.",
  "who_and_when": "For viewers who appreciate dark, uncompromising explorations of the ugliest parts of the human psyche. Best watched when you are prepared for a deeply uncomfortable, haunting look at toxic relationships.",
  "emotional_evocation": "It leaves the viewer feeling deeply unsettled and haunted. It provokes a squirming discomfort at the characters' irrational cruelty and a profound sadness for their shattered sense of self."
});

writeJson("6f494a95-25ed-8f00-ce82-cbca476942ec", {
  "metadata_synthesis": "The Leopard (1963), directed by Luchino Visconti, is a monumental Italian historical epic that serves as a lavish, melancholic requiem for the dying Sicilian aristocracy.",
  "setting_and_subculture": "The opulent, gilded palaces and sun-scorched, arid landscapes of 1860s Sicily. It captures a world of extreme wealth, rigid aristocratic hierarchy, and political revolution during the Risorgimento.",
  "visual_tone_and_feel": "Sumptuous, operatic, and overwhelmingly majestic. The cinematography is an intricate tapestry of light and shadow, capturing the physical decay of an era with unparalleled, bank-breaking grandiosity.",
  "media_era_tone": "The pinnacle of European cinematic maximalism. It stands as a flawless marriage between sweeping historical epics and intimate, mournful auteur cinema.",
  "pacing_and_structure": "A slow, deliberate, and extraordinarily majestic rhythm that mirrors the unhurried life of the aristocracy, culminating in a legendary, 40-minute ballroom sequence that acts as a prolonged, dying breath.",
  "atmosphere_and_mood": "Deeply melancholic, nostalgic, and resigned. The atmosphere is one of fading splendor, where a sense of inevitable, inescapable finality hangs over every opulent dance and conversation.",
  "themes_and_messages": "The brutal inevitability of historical change and the illusions of revolution. It posits that everything must change so that everything can stay the same, replacing one corrupt hierarchy with a slightly more vulgar one.",
  "character_relationships": "Defined by political pragmatism and the quiet acceptance of obsolescence. The Prince views his ambitious, opportunistic nephew with a mix of fatherly love and cynical resignation.",
  "lead_character_type": "The Prince of Salina is an aging, deeply perceptive patriarch. He is a proud 'leopard' who clearly sees his own extinction approaching and chooses to face it with dignified, melancholic passivity.",
  "story_and_plot_type": "A sweeping historical melodrama and a highly intimate, slow-motion eulogy for a way of life.",
  "who_and_when": "For lovers of grand, sweeping cinema and historical philosophy. Best viewed when you have the patience to fully submerge yourself in an incredibly lush, three-hour symphony of fading grandeur.",
  "emotional_evocation": "It evokes an overwhelming, tear-inducing awe. It leaves the viewer with a profound, poetic sorrow for the unstoppable march of time and the beautiful, barren dawn that follows."
});

console.log("Batch 3 written successfully.");
