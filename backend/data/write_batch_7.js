const fs = require('fs');
const path = require('path');

const outDir = 'c:\\Users\\USER\\Documents\\Coda\\backend\\data\\completed_synthesis';

const writeJson = (uuid, data) => {
    fs.writeFileSync(path.join(outDir, uuid + '.json'), JSON.stringify(data, null, 2), 'utf8');
}

writeJson("ad4519b1-e38e-f11c-3d49-acf707c0de1a", {
  "metadata_synthesis": "Metropolis (1927), directed by Fritz Lang, is a foundational German Expressionist sci-fi epic that visually defined cinematic dystopias for a century.",
  "setting_and_subculture": "A highly stratified, hyper-capitalist futuristic megacity. It is divided between a luxurious, carefree Utopian surface world for the elite and a hellish, subterranean industrial complex where faceless workers toil as human cogs in a massive machine.",
  "visual_tone_and_feel": "Monumental, highly stylized, and visually overwhelming. The breathtaking set designs, extreme contrasts of light and shadow, and iconic robotic aesthetics create a world that is both structurally majestic and deeply oppressive.",
  "media_era_tone": "The absolute pinnacle of Weimar-era German Expressionism, utilizing groundbreaking practical effects to deliver an ambitious, highly allegorical social critique.",
  "pacing_and_structure": "A grand, operatic melodrama. The narrative builds methodically from innocent discovery to a massive, chaotic, and apocalyptic proletarian uprising, resolving in a highly theatrical climax.",
  "atmosphere_and_mood": "Awe-inspiring, dark, and politically charged. The mood oscillates between the terrifying, mechanical dehumanization of the lower depths and the frenzied, chaotic zeal of the rebellion.",
  "themes_and_messages": "The urgent necessity of empathy and mediation between the elite and the working class. It famously asserts that 'the mediator between head and hands must be the heart,' warning against the destructive power of unfeeling industrialization.",
  "character_relationships": "Defined by deep class divides and extreme political manipulation. Relationships are heavily allegorical, representing the clashes between unchecked capitalism, naive idealism, and revolutionary fury.",
  "lead_character_type": "Freder is an incredibly naive, privileged son of the elite who undergoes a radical political awakening, transitioning from a carefree youth to a desperate mediator for the working class.",
  "story_and_plot_type": "A sweeping sci-fi dystopian epic and a highly melodramatic political allegory.",
  "who_and_when": "For lovers of cinema history and visually stunning sci-fi. Best watched when you want to experience a foundational masterpiece that permanently altered the visual language of film.",
  "emotional_evocation": "It leaves the viewer in absolute awe of its sheer scale and vision. The intense, highly theatrical rebellion evokes a thrilling, chaotic rush of political adrenaline."
});

writeJson("ae5d54a9-68f9-700d-dfa6-eaed8b5baf88", {
  "metadata_synthesis": "Kill (2008) is a bizarre, highly eclectic Japanese action anthology that stitches together four short films centered entirely around the concept of sword-fighting.",
  "setting_and_subculture": "A chaotic blend of disparate Japanese cinematic landscapes, ranging from nostalgic, children's jidaigeki playgrounds to bleak, hyper-stylized sci-fi battlegrounds tied to the Kerberos Saga.",
  "visual_tone_and_feel": "Wildly inconsistent and aggressively experimental. It bounces from the loving, sepia-toned nostalgia of classic yakuza flicks to jarring, nu-metal music videos and stark, white-on-white sci-fi duels.",
  "media_era_tone": "Late 2000s Japanese cult cinema, functioning as an experimental playground for action choreographers and established auteurs like Mamoru Oshii to test wildly disparate aesthetic concepts.",
  "pacing_and_structure": "An erratic, omnibus structure that functions more as a series of mood pieces and action choreography reels than a cohesive narrative experience.",
  "atmosphere_and_mood": "Playful, highly stylized, and occasionally completely baffling. The mood shifts violently with each short, moving from wholesome, childish imagination to self-indulgent, moody sci-fi abstraction.",
  "themes_and_messages": "The universal, cinematic appeal of the sword. There is no overarching philosophical message beyond a loving, experimental celebration of different eras of Japanese action cinema.",
  "character_relationships": "Brief, heavily stylized, and defined entirely by combat. Relationships exist solely to facilitate duels, whether as a mechanism for a children's anti-bullying parable or a grim, wordless sci-fi confrontation.",
  "lead_character_type": "A rotating cast of warriors, ranging from imaginative children playing samurai to silent, heavily armored sci-fi assassins.",
  "story_and_plot_type": "An experimental action anthology and cinematic showcase of diverse sword-fighting aesthetics.",
  "who_and_when": "For hardcore fans of Japanese action cinema and Mamoru Oshii completionists. Best viewed when you want a quick, visually eclectic sampler of Japanese swordplay without the burden of a deep plot.",
  "emotional_evocation": "It evokes a sense of playful amusement and occasional bewilderment, offering brief bursts of kinetic thrill alongside highly self-indulgent aesthetic experiments."
});

writeJson("ae8f3d76-223c-6866-ab76-b500a044f153", {
  "metadata_synthesis": "Marooned in Iraq (2002), directed by Bahman Ghobadi, is a sprawling, tragicomic Kurdish road movie that serves as both a vibrant celebration of culture and a haunting memorial for its scars.",
  "setting_and_subculture": "The deeply scarred, snow-blind landscapes of the Iran-Iraq borderlands in the immediate aftermath of the Gulf War. It immerses the viewer in the resilient, musically rich subculture of marginalized Kurdish communities.",
  "visual_tone_and_feel": "Gritty, chaotic, and poetic. The camera captures the harsh, freezing realities of a war-torn landscape, contrasting the immense physical devastation with the vibrant warmth of traditional Kurdish music.",
  "media_era_tone": "Post-war Kurdish cinema, marked by Ghobadi's signature ability to blend devastating geopolitical realities with absurd, dark humor and an almost documentary-like authenticity.",
  "pacing_and_structure": "A chaotic, meandering odyssey. The pacing reflects the difficult, nearly impossible nature of the journey, constantly interrupted by absurd encounters, musical performances, and the tragic remnants of chemical warfare.",
  "atmosphere_and_mood": "Deeply melancholic yet surprisingly hilarious. It operates in a register of pure black comedy, using the bickering, fumbling dynamic of the protagonists to disarm the viewer before delivering gut-punch realities.",
  "themes_and_messages": "The indestructible power of music and cultural identity in the face of absolute destruction. It highlights the profound suffering of the Kurdish people under Saddam Hussein while stubbornly affirming their will to survive.",
  "character_relationships": "A fiercely loyal but constantly bickering patriarchal family unit. The relationship between the aging maestro and his two sons is highly dysfunctional, loudly comedic, and deeply loving.",
  "lead_character_type": "An aging, stubbornly determined Kurdish musician who refuses to let borders, war, or physical frailty stop him from finding the legendary female voice he loves.",
  "story_and_plot_type": "A darkly comedic road movie and a deeply profound socio-political tragedy.",
  "who_and_when": "For viewers seeking a deeply humanistic, darkly funny exploration of a marginalized culture. Best watched when you are prepared to laugh through the tears of a profound historical tragedy.",
  "emotional_evocation": "It catches you completely off guard, making you laugh out loud at its absurd family dynamics before utterly devastating you with the silent, haunting realities of war."
});

writeJson("b17b9dd4-4868-d10b-1284-b1596960d26a", {
  "metadata_synthesis": "The Apple (1980), directed by Menahem Golan, is a notoriously bizarre, glittery sci-fi rock musical that plays like a dystopian, campy fever dream.",
  "setting_and_subculture": "A hyper-stylized, totalitarian 1994 where the world is entirely controlled by a sinister, omnipresent music industry. It is a garish, glitter-soaked dystopia fueled by 60s fetishism, drugs, and absolute conformity.",
  "visual_tone_and_feel": "Unapologetically garish, cheap, and completely overboard. The art direction is a glittering, neon-soaked assault on the senses, teetering constantly on the edge of high camp and outright bad taste.",
  "media_era_tone": "The bizarre zenith of late-70s/early-80s cult musical cinema. It attempts to blend the rock-opera excesses of 'Tommy' or 'Phantom of the Paradise' with incredibly heavy-handed biblical allegories.",
  "pacing_and_structure": "A frantic, musical-number-driven frenzy. The film never stops singing or dancing, moving at a brisk, dizzying pace that prevents the viewer from ever fully grasping the sheer absurdity of the plot.",
  "atmosphere_and_mood": "Incredibly silly, sexy, and utterly deranged. The mood is a manic, Euro-vision-esque spectacle that takes itself just seriously enough to be completely hilarious.",
  "themes_and_messages": "A heavy-handed biblical allegory warning against the corrupting, fascist power of the music industry and commercialism, wrapped entirely in skin-tight spandex and glitter.",
  "character_relationships": "Superficial, melodramatic, and entirely driven by Faustian bargains. Characters are constantly tempted, corrupted, or saved through the sheer power of bad rock music.",
  "lead_character_type": "Naive, innocent folk singers who are thrust into the corrupt, demonic world of the music industry and forced to fight for their souls.",
  "story_and_plot_type": "A dystopian sci-fi rock opera and a deeply flawed, wildly entertaining Faustian cult film.",
  "who_and_when": "For lovers of midnight movies, extreme camp, and glorious cinematic disasters. Best watched with a group of friends when you want to experience an unhinged, glittery pop-culture meltdown.",
  "emotional_evocation": "It leaves the viewer completely bewildered, slightly exhausted by the relentless musical numbers, and highly amused by its unapologetic, deeply flawed grandiosity."
});

writeJson("b339e7c0-4548-574b-e3e8-08ce908cb552", {
  "metadata_synthesis": "The Isle (2000), directed by Kim Ki-duk, is a deeply transgressive, shockingly brutal South Korean thriller that explores the grotesque intersections of trauma, isolation, and desire.",
  "setting_and_subculture": "A remote, foggy Korean fishing resort consisting of isolated, floating cabins. It is a lonely, self-contained purgatory inhabited by society's outcasts, criminals on the run, and deeply broken individuals.",
  "visual_tone_and_feel": "Visually serene yet intensely repugnant. The cinematography emphasizes the natural, poetic quiet of the water, creating a hauntingly beautiful backdrop that sharply contrasts with the sudden, stomach-churning acts of physical mutilation.",
  "media_era_tone": "Early 2000s South Korean extreme cinema. It established Kim Ki-duk as a master of provocative, dialogue-free visual poetry that intentionally pushes the boundaries of audience endurance.",
  "pacing_and_structure": "A slow, agonizing drift. The pacing is extremely deliberate and contemplative, allowing the psychological tension and bizarre, toxic romance to ferment before erupting into shocking violence.",
  "atmosphere_and_mood": "Quietly diabolical, deeply melancholy, and incredibly tense. It feels like treading water helplessly, waiting for the inevitable, horrifying plunge into the depths.",
  "themes_and_messages": "The self-destructive, agonizing nature of broken psychology and toxic codependency. It uses intense physical pain (specifically via fishhooks) as a visceral, graphic metaphor for internal trauma and the desperation to feel something.",
  "character_relationships": "Profoundly toxic, animalistic, and built on shared mutilation. The dynamic between the mute clerk and the fugitive is one of mutual self-destruction, completely devoid of healthy emotional connection.",
  "lead_character_type": "Hee-Jin is a completely mute, deeply traumatized, and dangerously unpredictable outcast. Her muteness forces a purely physical, often horrifying form of self-expression.",
  "story_and_plot_type": "An extreme psychological thriller and a deeply twisted, metaphorical romance.",
  "who_and_when": "Only for viewers with incredibly strong stomachs who appreciate extreme, abstract symbolism in cinema. Do not watch if you are sensitive to graphic self-mutilation or animal cruelty.",
  "emotional_evocation": "It evokes an intense, visceral disgust and a deep, lingering unease. The shocking imagery will make you physically squirm, leaving behind a haunting, deeply uncomfortable existential dread."
});

console.log("Batch 7 written successfully.");
