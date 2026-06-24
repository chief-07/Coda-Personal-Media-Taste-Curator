const fs = require('fs');
const path = require('path');

const outDir = 'c:\\Users\\USER\\Documents\\Coda\\backend\\data\\completed_synthesis';
if (!fs.existsSync(outDir)) { fs.mkdirSync(outDir, {recursive: true}); }

const writeJson = (uuid, data) => {
    fs.writeFileSync(path.join(outDir, uuid + '.json'), JSON.stringify(data, null, 2), 'utf8');
}

writeJson("2b3f4185-5d31-3cf0-b35e-320506652bd8", {
  "metadata_synthesis": "Signs of Life (1968), directed by Werner Herzog, is a West German drama that marks the auteur's feature debut, capturing a decaying World War II setting through a distinctly avant-garde lens.",
  "setting_and_subculture": "A lethargic, sun-baked Greek island of Kos during WWII, centering around an abandoned munitions depot housed in an ancient, decaying fortress.",
  "visual_tone_and_feel": "Hypnotic, rugged, and intensely arid. The cinematography emphasizes the suffocating emptiness of the fortress, rendering the stark Mediterranean sun as a blinding, oppressive force rather than a warm light.",
  "media_era_tone": "The late 1960s birth of New German Cinema, characterized by a raw, unconventional approach that breaks from traditional narrative constraints.",
  "pacing_and_structure": "The film adopts a meandering, nearly stagnant pace that structurally mirrors the protagonists' suffocating boredom, before accelerating into an explosive, unhinged climax as madness takes root.",
  "atmosphere_and_mood": "A deeply lethargic, stifling torpor that slowly ferments into chaotic delirium. The mood is overwhelmingly idle, steeped in a creeping unease that stems from extreme inactivity.",
  "themes_and_messages": "The psychological devastation of idleness and the inherent absurdity of war. It explores how human beings, conditioned for conflict and purpose, inevitably unravel and rebel when subjected to profound stillness.",
  "character_relationships": "A fractured, alienated dynamic between soldiers bound by a lack of purpose. Their interactions are devoid of true camaraderie, defined instead by shared desperation and bizarre, hyper-fixated coping mechanisms.",
  "lead_character_type": "Stroszek is a wounded, hyper-vigilant paratrooper whose fragile psyche shatters under the weight of unrelenting boredom, transforming him from a compliant soldier into a volatile rebel.",
  "story_and_plot_type": "A psychological descent-into-madness narrative wrapped in an anti-war framework, driven not by external conflict but by the internal collapse of the protagonist.",
  "who_and_when": "For those seeking an unconventional, atmospheric exploration of the human mind under duress. Best viewed during a period of existential reflection or when feeling disconnected from the daily grind.",
  "emotional_evocation": "It evokes a profound sense of claustrophobia within wide-open spaces, leaving the viewer with a lingering feeling of existential dread and the dizzying sensation of running in pointless circles."
});

writeJson("2b4f594f-438e-6edd-5e8d-7beb2b891845", {
  "metadata_synthesis": "Berlin Alexanderplatz is a monumental 1980 West German crime-drama miniseries directed by Rainer Werner Fassbinder, adapting Alfred Döblin's seminal novel of Weimar-era despair.",
  "setting_and_subculture": "The bleak, shadowy, and toxic underworld of 1920s Berlin, a purgatorial cityscape defined by the nascent rumblings of fascism, economic depression, and deeply entrenched criminal subcultures.",
  "visual_tone_and_feel": "Suffused with high-contrast shadows, tilted angles, and claustrophobic framing. The aesthetic is grimy yet darkly beautiful, utilizing neon-lit misery and physical obstructions to trap the characters on screen.",
  "media_era_tone": "A pinnacle of the New German Cinema era, acting as a grim, maximalist deconstruction of human misery that defined Fassbinder's provocative legacy.",
  "pacing_and_structure": "An exhausting, 15-hour slow-burn that drags the audience through a grueling marathon of cyclical failures, culminating in a surreal, avant-garde epilogue that shatters the preceding narrative structure.",
  "atmosphere_and_mood": "Suffocatingly fatalistic and deeply cynical. The atmosphere is thick with grime, hopelessness, and the crushing inevitability of societal and personal collapse.",
  "themes_and_messages": "A harrowing exploration of the intersection between masculinity, misogyny, and capitalism. It argues that human beings are fundamentally trapped by their own base instincts and the merciless meat-grinder of a corrupt society.",
  "character_relationships": "Deeply toxic, transactional, and abusive. The dynamics are defined by exploitation, betrayal, and a desperate, pathetic yearning for validation that is constantly violently weaponized.",
  "lead_character_type": "Franz Biberkopf is an ex-convict who is simultaneously brutish, deeply flawed, and pitifully naive. He is a tragic anti-hero engaged in a futile war against his own destructive nature.",
  "story_and_plot_type": "A sprawling, cyclical tragedy and psychological character study that tracks the inescapable downward spiral of a man trying and failing to walk a straight path.",
  "who_and_when": "For the deeply patient, emotionally resilient viewer prepared to endure a punishing, 15-hour descent into human ugliness. Best experienced when seeking a profound, uncompromising artistic challenge.",
  "emotional_evocation": "It drags the viewer through an agonizing gauntlet of despair, eliciting a visceral feeling of entrapment, heartbreak, and utter exhaustion at the cruelty of the human condition."
});

writeJson("2c431e79-e1dc-dd8b-4b6a-cac5357e63b4", {
  "metadata_synthesis": "The Decameron (1971), directed by Italian auteur Pier Paolo Pasolini, is a transgressive historical comedy adapting Giovanni Boccaccio's 14th-century allegorical tales.",
  "setting_and_subculture": "A vividly realized, unsterilized depiction of medieval Naples. It is a world of dirt-caked peasants, hypocritical clergy, opportunistic merchants, and cloistered nuns driven by base desires.",
  "visual_tone_and_feel": "Earthy, grotesque, and intensely tactile. The visual language favors raw, unglamorous bodies, dilapidated stone architecture, and a chaotic, lived-in filth that strips away romanticized historical polish.",
  "media_era_tone": "The subversive European art-house movement of the early 1970s, defined by its fearless dismantling of religious hypocrisy and bourgeois sensibilities through vulgarity.",
  "pacing_and_structure": "An episodic, fragmented structure that bounds wildly between different vignettes. The pacing is lively and erratic, mirroring the chaotic unpredictability of the medieval folktales it adapts.",
  "atmosphere_and_mood": "Bawdy, cynical, and gleefully profane. The mood is steeped in a snarky, scatological irreverence that celebrates the absurdity and comedy of human bodily functions and sexual urges.",
  "themes_and_messages": "A scathing critique of religious superficiality and moral hypocrisy, arguing that human nature is fundamentally driven by primitive lust and deceit, irrespective of divine or societal laws.",
  "character_relationships": "Driven purely by carnal desire, opportunism, and deception. Interactions are transactional, characterized by elaborate swindles, infidelity, and the pursuit of momentary gratification.",
  "lead_character_type": "There is no single protagonist; instead, it features a sprawling ensemble of scoundrels, naive fools, and horny clergymen who act as avatars for various human vices.",
  "story_and_plot_type": "An anthology of darkly comedic parables and moral farces, constructed as a series of interconnected, bawdy misadventures.",
  "who_and_when": "For lovers of subversive, high-brow smut and anti-clerical satire. Best enjoyed when craving a chaotic, unapologetically vulgar cinematic experience that punches upward.",
  "emotional_evocation": "It elicits uncomfortable laughter and sheer disbelief at its audacity, leaving the viewer oscillating between profound disgust and a liberating sense of comedic catharsis."
});

writeJson("2e6964a8-07ee-976d-99cc-4a39f9f356d2", {
  "metadata_synthesis": "The Day I Became a Woman (2000), directed by Marzieh Makhmalbaf, is a profound Iranian drama that poetically dissects the female experience across three distinct stages of life.",
  "setting_and_subculture": "The sun-drenched, visually stark landscapes of rural and coastal Iran, capturing a highly patriarchal society where rigid traditions and religious mandates dictate the minutiae of daily existence.",
  "visual_tone_and_feel": "Lyrical, minimalist, and deeply symbolic. The stark contrast of black chadors against the bright, expansive physical environment visually emphasizes the suffocating confinement of the women within an open world.",
  "media_era_tone": "The celebrated Iranian New Wave of the late 90s and 2000s, known for employing simple, allegorical storytelling to quietly challenge oppressive sociopolitical structures.",
  "pacing_and_structure": "A triptych structure, moving gracefully from childhood to young adulthood to old age. The pacing is deliberate and contemplative, allowing the thematic weight of each vignette to fully resonate before transitioning.",
  "atmosphere_and_mood": "Melancholic, deeply empathetic, and quietly defiant. A pervasive sense of mourning for stolen autonomy hangs over the film, interspersed with fleeting moments of joyous, tragic rebellion.",
  "themes_and_messages": "The inescapable, lifelong nature of patriarchal oppression. It argues that the socialization of women is a relentless process of limitation, where true freedom remains perpetually out of reach, regardless of age.",
  "character_relationships": "Defined by institutionalized control and agonizing partings. The relationships depict men as enforcers of tradition (husbands, fathers) and women as isolated figures whose bonds are forcibly severed by societal rules.",
  "lead_character_type": "A composite protagonist representing the universal Iranian woman: first as an innocent stripped of her childhood, then as a desperate rebel, and finally as an elder attempting to purchase the freedom she was denied.",
  "story_and_plot_type": "An allegorical coming-of-age/coming-of-age anthology. The narrative is driven by internal emotional shifts and symbolic actions rather than traditional plot mechanics.",
  "who_and_when": "For those seeking deeply moving, feminist cinema that operates through quiet devastation rather than loud exposition. Best watched when ready to reflect on the intersectional struggles of womanhood.",
  "emotional_evocation": "It shatters the heart with its quiet cruelty, evoking a profound, lingering sadness for lost innocence and a fierce, empathetic anger at the systemic cages built around women."
});

writeJson("3091099f-018d-32af-a21b-e15be9ee635e", {
  "metadata_synthesis": "Umberto D. (1952), directed by Vittorio De Sica, is a quintessential Italian Neorealist drama that lays bare the devastating indignities of aging and poverty in post-WWII Italy.",
  "setting_and_subculture": "The unforgiving, bustling streets of a reconstructed Rome, contrasting the cold indifference of an emerging capitalist society with the desperate, cramped squalor of cheap boarding houses.",
  "visual_tone_and_feel": "Stark, unvarnished, and deeply empathetic. Shot in black-and-white, the visual style prioritizes raw, documentary-like realism, framing the characters as small, insignificant specks against the indifferent architecture of the city.",
  "media_era_tone": "The defining peak of Italian Neorealism, capturing a socio-economic reality with an unflinching, humanist lens that rejects melodrama in favor of raw, lived-in truth.",
  "pacing_and_structure": "A methodical, agonizingly slow descent. The narrative structure is painfully linear, meticulously detailing the mundane, everyday degradations that lead a man toward ultimate despair.",
  "atmosphere_and_mood": "Suffocatingly bleak, profoundly lonely, and quietly heartbreaking. The mood is an unrelenting ache of indignity, broken only by fleeting, fragile moments of connection.",
  "themes_and_messages": "The inherent cruelty of a society that discards its vulnerable elders. It posits that life under relentless poverty strips away all human dignity, leaving only the pure, primal bond between a man and his dog as a reason to exist.",
  "character_relationships": "Defined by deep social alienation and transactional coldness, juxtaposed against the pure, unconditional love between Umberto and his dog, Flike. The human connections are fleeting and ultimately helpless.",
  "lead_character_type": "Umberto Ferrari is a proud, dignified elderly pensioner who is systematically broken down by poverty, transforming from an active protestor into a man entirely bereft of hope.",
  "story_and_plot_type": "A pure, unadulterated tragedy of circumstance. It is a grueling survival narrative where the antagonist is not a person, but the structural violence of poverty itself.",
  "who_and_when": "For the emotionally prepared viewer willing to confront the starkest realities of the human condition. It is a grueling, tear-inducing experience not meant for a casual viewing.",
  "emotional_evocation": "It totally destroys the viewer, wringing out intense, inconsolable tears. It leaves an indelible, haunting ache in the soul, evoking both a profound fear of abandonment and a deep empathy for the suffering of others."
});

console.log("5 JSONs written successfully.");
