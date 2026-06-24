const fs = require('fs');
const path = require('path');

const outDir = 'c:\\Users\\USER\\Documents\\Coda\\backend\\data\\completed_synthesis';

const writeJson = (uuid, data) => {
    fs.writeFileSync(path.join(outDir, uuid + '.json'), JSON.stringify(data, null, 2), 'utf8');
}

writeJson("79f8e037-83d4-20b3-3e53-a4a64b0c0bb7", {
  "metadata_synthesis": "Mamma Roma (1962), directed by Pier Paolo Pasolini, is an Italian Neorealist drama that beautifully blends the gritty reality of the postwar sub-proletariat with sacred, almost Renaissance-like reverence.",
  "setting_and_subculture": "The jagged, unfinished, and dusty edges of the Roman periphery in the postwar era. It is a bleak wasteland of broken dreams, populated by pimps, streetwalkers, and hustlers desperate for a bourgeois existence.",
  "visual_tone_and_feel": "Earthbound but possessing an immense, dusty beauty. Pasolini frames the marginalized bodies of the Roman underclass with a startling, reverent cinematic language, elevating the profane to the sacred.",
  "media_era_tone": "Early 1960s Italian Neorealism transitioning into a more transgressive, politically charged auteur cinema, known for courting scandal and defying both the Left and the Right.",
  "pacing_and_structure": "A desperate, breathless upward climb that ultimately leads to inevitable tragedy. The narrative traces a frantic, protective mother's futile attempts to outrun her past and shield her son.",
  "atmosphere_and_mood": "Deeply tragic, fierce, and grounded in a pure, unforgiving reality. A sense of impending doom hangs over the characters' zealous aspirations for a respectable life.",
  "themes_and_messages": "The impossibility of escaping one's class and past in a capitalist society. It highlights how the forces of power continuously manipulate and destroy the marginalized, punishing those who dare to seek a better life.",
  "character_relationships": "Defined by fierce, protective maternal love and the toxic, inescapable grip of past abusers. The mother-son dynamic is tragically flawed, built on good intentions that are entirely unable to protect against systemic snares.",
  "lead_character_type": "Mamma Roma is a fearless, uninhibited former streetwalker. She is a lone soldier, laughing in the face of death, driven entirely by a fierce, desperate love for her teenage son.",
  "story_and_plot_type": "A tragic, character-driven melodrama and social critique wrapped in a desperate quest for upward mobility and redemption.",
  "who_and_when": "For those seeking an emotionally heavy, deeply moving, and grounded cinematic experience. Best watched when you want to reflect on the fierce resilience of motherhood and the cruelty of societal judgment.",
  "emotional_evocation": "It offers a beautiful, touching, and profound devastation. It leaves the viewer deeply moved, grappling with the heartbreaking reality of a world that violently rejects the marginalized."
});

writeJson("7ba3a667-b8bb-9324-150a-639b2954ae37", {
  "metadata_synthesis": "The Marriage of Maria Braun (1979), directed by Rainer Werner Fassbinder, is a phenomenal West German drama that operates as a savage, cynical allegory for the post-WWII German economic miracle.",
  "setting_and_subculture": "The chaotic, bombed-out ruins of post-WWII Germany transitioning into a sterile, hyper-capitalist economic boom. It captures a society entirely defined by survivalism and moral compromise.",
  "visual_tone_and_feel": "Subtly discordant and deeply ironic. The visual style and sound design—layering radio broadcasts over sweeping orchestral scores—create an atmosphere where the polished surface barely hides an internal rot.",
  "media_era_tone": "The height of New German Cinema, defined by Fassbinder's signature brand of cruel melodrama, biting socio-political critique, and complex female protagonists.",
  "pacing_and_structure": "A relentless, upward trajectory of financial success that masks a slow, agonizing emotional decay. It traces the protagonist's rise from desperate poverty to immense wealth, ending in an abrupt, apocalyptic finale.",
  "atmosphere_and_mood": "Cold, ruthless, and utterly desolate. Despite its narrative of financial triumph, the film is permeated by a profound heartbreak and a chilling emotional emptiness.",
  "themes_and_messages": "The spiritual death caused by absolute capitalism and survivalism. It argues that in the desperate pursuit of financial stability, the human soul and capacity for genuine love are entirely sacrificed.",
  "character_relationships": "Entirely transactional and manipulative. Love is treated as a commodity, an illusion to be pushed aside or leveraged for personal and financial gain.",
  "lead_character_type": "Maria Braun is an indefatigable, fiercely intelligent survivor who transforms from a desperate bride into a hardened, ruthless capitalist, completely severing her own emotional ties to succeed.",
  "story_and_plot_type": "A cynical rags-to-riches melodrama and a dark national allegory, tracing a woman's rise to power at the cost of her humanity.",
  "who_and_when": "For viewers who appreciate dark, uncompromising character studies and political allegories. Best watched when you are in the mood for a brilliant but emotionally ransacking and heartbreaking experience.",
  "emotional_evocation": "It leaves the viewer completely transfixed, desolate, and grieving. The emotional toll is profound, leaving a chilling realization of the true cost of unchecked materialism."
});

writeJson("7f7b509c-9051-1161-93a1-cdb8ab4ace4f", {
  "metadata_synthesis": "Gomorrah (La serie), based on Roberto Saviano's work, is a sprawling, ruthless Italian crime epic that functions as an unflinching dissection of the Neapolitan Camorra.",
  "setting_and_subculture": "The impoverished, concrete housing projects of Naples, Italy. A deeply infected societal ecosystem where extreme, sudden, and meaningless violence dictates every facet of life.",
  "visual_tone_and_feel": "Gritty, oppressive, and utterly devoid of glamor. The aesthetic paints a bleak, realistic picture of urban decay, treating the mafia subculture not as a cinematic thrill, but as a societal cancer.",
  "media_era_tone": "The peak of 21st-century prestige European television, stripping away the romanticism of American gangster media to deliver a stark, sociologically terrifying reality.",
  "pacing_and_structure": "A relentless, picaresque saga of betrayal and survival. The pacing is intense and episodic, tracing the rise, fall, and chaotic zealotry of various crime syndicates over a sprawling five-season arc.",
  "atmosphere_and_mood": "Suffocatingly dark, fatalistic, and deeply cynical. It maintains a constant, heavy atmosphere of dread, where loyalty is an illusion and brutal violence is the only true currency.",
  "themes_and_messages": "The absolute, inescapable devastation caused by organized crime. It exposes the mafia as a parasitical force that poisons society, arguing that power in this world only leads to death or absolute moral rot.",
  "character_relationships": "Built entirely on paranoia, shifting alliances, and ruthless betrayal. Relationships are purely transactional, lacking genuine affection and constantly teetering on the edge of violent, sudden betrayal.",
  "lead_character_type": "A rotating ensemble of ruthless mob bosses, ambitious foot soldiers, and collateral victims, all locked in a completely amoral, fatalistic struggle for power.",
  "story_and_plot_type": "A sprawling, multi-generational crime saga and sociological tragedy that functions as an anti-mafia epic.",
  "who_and_when": "For fans of highly intense, hyper-realistic crime dramas who are willing to endure unrelenting darkness. Best watched when seeking a grounded, anti-romantic look at organized crime.",
  "emotional_evocation": "It evokes a profound sense of anxiety and hopelessness. The sudden, brutal violence and moral vacuum leave the viewer thoroughly disturbed by the real-world consequences of the mafia."
});

writeJson("8007cc81-8ba3-2363-e372-cc072a13e3a7", {
  "metadata_synthesis": "Taxi (1996), directed by Carlos Saura, is a highly stylized Spanish drama that dives into the violent, extremist subculture of neo-Nazi taxi drivers in Madrid.",
  "setting_and_subculture": "The nocturnal, neon-lit streets of 1990s Madrid, plunging into the terrifying, radicalized subculture of fascist skinheads who use their taxi cabs to terrorize the city.",
  "visual_tone_and_feel": "Highly stylized, slick, and deeply unsettling. Lensed by Vittorio Storaro, the film avoids a gritty documentary aesthetic in favor of a polished, Euro-dance infused visual style that feels completely at odds with its dark subject matter.",
  "media_era_tone": "A bizarre, problematic artifact of the mid-90s, blending Euro-trash club culture aesthetics with heavy-handed political commentary on the rise of the far-right.",
  "pacing_and_structure": "A relatively formulaic, narrative-driven thriller that relies on predictable genre beats, moving steadily toward an inevitable, violent confrontation with its extremist antagonists.",
  "atmosphere_and_mood": "Simultaneously terrifying and strangely campy. The atmosphere is a jarring clash of brutal, racist violence set against the upbeat, pounding rhythm of 90s Euro-dance and Manu Chao.",
  "themes_and_messages": "The insidious, creeping threat of fascism in modern society. It attempts to warn against the infectious nature of extremist ideologies, though its execution lacks any real psychological nuance.",
  "character_relationships": "Defined by violent peer pressure and toxic ideological conformity. Relationships are built on hatred and the enforcement of extreme far-right dogma within a tight-knit professional circle.",
  "lead_character_type": "A young, impressionable protagonist caught in the gravitational pull of a violent, extremist group, struggling with the moral implications of the subculture.",
  "story_and_plot_type": "A political thriller and crime drama wrapped in a highly stylized, formulaic narrative structure.",
  "who_and_when": "For viewers interested in strange, politically charged 90s cinema and the bizarre intersections of Euro-pop and fascism. Best viewed with an understanding of its stylistic missteps.",
  "emotional_evocation": "It provokes a slightly shameful entertainment, mixing genuine discomfort at the visceral hatred on display with the bizarre, head-scratching execution of its slick, upbeat stylistic choices."
});

writeJson("806d27d4-61cb-4612-440a-ca05bc16845b", {
  "metadata_synthesis": "And Life Goes On (1992), directed by Abbas Kiarostami, is an Iranian docu-fiction masterpiece that gently explores the resilience of the human spirit in the wake of a catastrophic earthquake.",
  "setting_and_subculture": "The devastated, rubble-strewn landscape of the Guilan province in Iran immediately following the 1990 earthquake. It intimately captures the rural, incredibly resilient communities attempting to rebuild their lives.",
  "visual_tone_and_feel": "Incredibly simple, raw, and deeply humanistic. Shot in a documentary style, the camera acts as a quiet, observant passenger navigating the winding roads and ruined villages with an unblinking, empathetic eye.",
  "media_era_tone": "The defining core of the Iranian New Wave, characterized by Kiarostami's blurring of fiction and reality to achieve a higher, poetic truth about the human condition.",
  "pacing_and_structure": "A slow, contemplative road movie. The pacing is entirely dictated by the meandering, obstacle-filled journey through the disaster zone, stopping frequently for profound, unscripted moments of human connection.",
  "atmosphere_and_mood": "Deeply moving, quiet, and remarkably hopeful. Despite the backdrop of unimaginable destruction, the mood is infused with an overwhelming, stubborn affirmation of life.",
  "themes_and_messages": "The profound, unshakeable instinct to survive and find joy amidst tragedy. It argues that life, in all its mundane and miraculous forms, relentlessly continues even after total devastation.",
  "character_relationships": "Defined by fleeting, profound encounters between strangers. The interactions between the director and the survivors are marked by deep empathy, shared grief, and a quiet, unyielding solidarity.",
  "lead_character_type": "A semi-fictionalized film director who serves as a gentle, observant proxy for Kiarostami himself, driven by a quiet desperation to find the child actors from his previous film.",
  "story_and_plot_type": "A hybrid docu-fiction road movie that completely eschews traditional plot in favor of a poetic, philosophical journey through grief and recovery.",
  "who_and_when": "For viewers seeking a deeply grounding, spiritually uplifting cinematic experience. Best watched when you need a quiet, profound reminder of human resilience in the face of absolute loss.",
  "emotional_evocation": "It evokes a profound, quiet awe. It gently heals the soul, leaving the viewer with a profound sense of hope and a deep, empathetic reverence for the unstoppable continuation of life."
});

console.log("Batch 4 written successfully.");
