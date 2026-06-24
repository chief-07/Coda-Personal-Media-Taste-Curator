const fs = require('fs');
const path = require('path');

const outDir = 'c:\\Users\\USER\\Documents\\Coda\\backend\\data\\completed_synthesis';

const writeJson = (uuid, data) => {
    fs.writeFileSync(path.join(outDir, uuid + '.json'), JSON.stringify(data, null, 2), 'utf8');
}

writeJson("aa28daf6-0db6-cea7-190b-deecebf44f61", {
  "metadata_synthesis": "KenIchi: The Mightiest Disciple (2006), produced by TMS Entertainment, is a Japanese martial arts anime that blends classic shounen progression with lighthearted comedy.",
  "setting_and_subculture": "A seemingly typical Japanese high school environment sharply contrasted with the secretive, hyper-intense subculture of extreme martial arts at the Ryouzanpaku dojo.",
  "visual_tone_and_feel": "Energetic, heavily stylized, and slightly retro. The animation leans heavily on quick flashes of motion, speed lines, and 90s-esque shounen character designs rather than fluid martial arts choreography.",
  "media_era_tone": "Mid-2000s shounen anime, characterized by a straightforward underdog narrative, slapstick comedy, and highly exaggerated martial arts techniques.",
  "pacing_and_structure": "A highly episodic, battle-of-the-week progression. The pacing is structured around Kenichi's continuous cycle of brutal training followed by escalating confrontations with a criminal martial arts gang.",
  "atmosphere_and_mood": "Lighthearted, intensely motivating, and comedic. Despite the constant threat of physical violence, the mood remains perpetually optimistic, driven by the protagonist's goofy determination.",
  "themes_and_messages": "The transformative power of relentless perseverance and discipline. It argues that even the weakest, most perpetually bullied individual can become a defender of the defenseless through sheer willpower.",
  "character_relationships": "A classic master-and-student dynamic taken to absurd extremes. Kenichi's relationships with his eccentric masters are built on comical, near-fatal physical abuse disguised as tough love.",
  "lead_character_type": "Kenichi Shirahama is the ultimate underdog: a perpetually bullied, cowardly high schooler whose defining trait is his unbreakable, stubborn refusal to give up.",
  "story_and_plot_type": "A zero-to-hero martial arts comedy and coming-of-age shounen battle series.",
  "who_and_when": "For anime fans looking for intense rivalries, classic underdog progression, and plenty of laughs. Best watched when you need a highly entertaining, motivating distraction from everyday stress.",
  "emotional_evocation": "It evokes a satisfying, fist-pumping thrill at seeing an underdog finally stand his ground, mixed with consistent, goofy laughter at the sheer absurdity of his training."
});

writeJson("aa3951cc-2ae9-f8d1-4528-4ea828727840", {
  "metadata_synthesis": "Super Dimension Fortress Macross (1982), produced by Tatsunoko Production, is a foundational Japanese sci-fi anime that revolutionized the mecha genre by intertwining space opera with pop music.",
  "setting_and_subculture": "The claustrophobic, repurposed interior of a massive alien spaceship, the SDF-1 Macross, lost in the far reaches of the Milky Way, housing a terrified but resilient human civilization.",
  "visual_tone_and_feel": "Vibrant, mechanical, and romantic. The aesthetic blends highly detailed, realistic mecha designs (variable fighters) with the colorful, optimistic glow of an 80s pop idol concert.",
  "media_era_tone": "The defining golden age of 1980s real-robot anime. It consciously subverted the grim militarism of Gundam by injecting romance, pop culture, and a carefree, serenading charm.",
  "pacing_and_structure": "An epic, fluid progression divided into two main arcs. The pacing balances the high-stakes, apocalyptic space war with intimate, grounded soap-opera drama and musical interludes.",
  "atmosphere_and_mood": "Simultaneously epic and incredibly intimate. The mood fluctuates between the terrifying, cold cruelty of intergalactic war and the warm, hopeful exuberance of human romance and music.",
  "themes_and_messages": "The profound cultural power of art and love as universal equalizers. It posits that humanity's greatest weapon against a highly militarized alien race is not superior technology, but the emotional resonance of pop culture.",
  "character_relationships": "Driven by complex, evolving romantic triangles and deep mentor-mentee bonds. The relationships feel organic and messy, capturing the awkward reality of growing up amidst chaos.",
  "lead_character_type": "Hikaru Ichijou is a free-spirited, talented acrobatic pilot who reluctantly matures into a hardened soldier, forced to balance his duty with his complicated romantic feelings.",
  "story_and_plot_type": "An intergalactic space opera, a mecha war saga, and a complex coming-of-age romance.",
  "who_and_when": "For lovers of classic 80s anime, mecha, and space operas. Best watched when you want an epic, deeply emotional sci-fi story that doesn't take itself too seriously.",
  "emotional_evocation": "It evokes a deep, nostalgic thrill and a profound sense of romantic wonder, leaving the viewer deeply invested in the survival and emotional triumphs of its unlucky crew."
});

writeJson("abec92a9-547c-5da5-59f2-bbdda9709b33", {
  "metadata_synthesis": "Super Heavy God Gravion (2002), produced by Gonzo, is a Japanese sci-fi anime that acts as an unabashed, fanservice-heavy love letter to the classic super robot genre.",
  "setting_and_subculture": "A futuristic Earth in 2041 facing sudden alien annihilation, focusing entirely on the secretive, high-tech, and absurdly wealthy military base of Klein Sandman.",
  "visual_tone_and_feel": "Excessively flashy, highly retro, and blatantly voyeuristic. The visual language embraces every super robot cliché, combining colorful mecha transformations with gratuitous, anatomically impossible character designs.",
  "media_era_tone": "Early 2000s commercial anime that prioritized highly marketable tropes—giant combining robots and massive amounts of ecchi fanservice—over deep narrative complexity.",
  "pacing_and_structure": "A highly formulaic, monster-of-the-week progression. The plot moves rapidly from slice-of-life comedic misunderstandings at the base to bombastic, gravity-defying mecha battles.",
  "atmosphere_and_mood": "Goofy, high-octane, and completely lacking in subtlety. The mood is pure, unfiltered escapism, treating an alien invasion as an excuse for retro super-robot theatrics.",
  "themes_and_messages": "The sheer spectacle of teamwork and giant robots fighting evil. It makes no attempt at deep philosophical messaging, entirely content with celebrating the aesthetic of the genre itself.",
  "character_relationships": "Shallow but entertaining, built largely on comedic misunderstandings, secret identities, and the classic hot-blooded/cool-headed pilot dynamic necessary to pilot the Gravion.",
  "lead_character_type": "Eiji is a hot-blooded, impulsive young man thrust into an absurd situation, acting as the grounded, relatable foil to the mysterious, stoic Toga.",
  "story_and_plot_type": "A formulaic super robot action-comedy that serves primarily as a vehicle for mecha battles and fanservice.",
  "who_and_when": "For viewers who want to turn their brains off and enjoy retro robot cliches and shameless fanservice. Best watched when craving pure, uncomplicated popcorn entertainment.",
  "emotional_evocation": "It elicits a simple, nostalgic sense of fun and amusement, relying entirely on the visceral thrill of watching a giant robot punch an alien invader."
});

writeJson("ac65104c-bb2a-b385-b551-2badce25079f", {
  "metadata_synthesis": "The Castle of Sand (1974), directed by Yoshitarô Nomura, is a Japanese mystery drama that uses a sweeping police procedural to unearth the deeply buried tragedies of postwar identity.",
  "setting_and_subculture": "A sprawling, sociological cross-section of 1970s Japan. It traverses the bustling, anonymous Tokyo rail yards and stretches deep into the luscious, melancholic rural landscapes of the countryside.",
  "visual_tone_and_feel": "Gorgeous, warm, and deeply textured. The massive widescreen photography captures the sweeping geographical landscapes and cozy, earthen hues, grounding the mystery in a rich, cinematic reality.",
  "media_era_tone": "The height of 1970s Japanese epic cinema, blending the meticulous detail of a police procedural with sweeping, melodramatic historical tragedy.",
  "pacing_and_structure": "A diptych structure that begins as an exhaustively detailed, multi-disciplinary police investigation before radically shifting into a sweeping, emotionally devastating historical flashback.",
  "atmosphere_and_mood": "Deeply melancholic, inquisitive, and haunting. A profound, invisible presence of tragedy hangs over the film, contrasting the bureaucratic police work with the raw pain of forgotten histories.",
  "themes_and_messages": "The inescapable weight of the past and the tragedy of lost identity. It explores how societal upheaval forces people to sever their own histories, and how deeply that suppression rots the soul.",
  "character_relationships": "Defined by the relentless pursuit of the truth and the desperate, violent lengths to which a person will go to protect a fabricated, newly structured identity.",
  "lead_character_type": "The detectives serve as exhaustive, inquisitive historians rather than typical action heroes, methodically peeling back the layers of a deeply hidden, tragic life.",
  "story_and_plot_type": "A sociological police procedural that blossoms into a sweeping, multi-generational historical tragedy.",
  "who_and_when": "For lovers of meticulous, slow-burn mysteries and sweeping historical melodramas. Best watched when you are prepared for a deeply moving, beautifully scored exploration of human tragedy.",
  "emotional_evocation": "It evokes an overwhelming, profound sadness for the forgotten outcasts of society, leaving the viewer completely moved by the tragic, impossible burden of carrying a hidden past."
});

writeJson("ac903327-c00c-b0ae-0dc8-012c0d7b2693", {
  "metadata_synthesis": "Trigun (1998), produced by Madhouse, is a revolutionary Japanese sci-fi anime that masterfully conceals a profound exploration of pacifism beneath a goofy, sci-fi western exterior.",
  "setting_and_subculture": "The desolate, dusty wasteland of the planet Gunsmoke. It is a harsh, Wild West-inspired frontier populated by ruthless outlaws, desperate civilians, and corrupt syndicates.",
  "visual_tone_and_feel": "Gritty, chaotic, yet highly expressive. The aesthetic perfectly captures the barren, sun-scorched desert frontier, juxtaposing explosive, stylized gunfights with moments of stark, haunting stillness.",
  "media_era_tone": "A defining pillar of late-90s anime that found massive popularity in the West, famous for seamlessly transitioning from slapstick comedy into dark, existential morality tales.",
  "pacing_and_structure": "A deceptive, brilliant bait-and-switch. The first half is a highly episodic, silly western comedy, which slowly unravels into a brutally serious, high-stakes philosophical tragedy in its final act.",
  "atmosphere_and_mood": "Wildly dynamic, shifting from buffoonish and hilarious to an absolute, crushing existential dread. The tone darkens masterfully as the protagonist's traumatic past is exposed.",
  "themes_and_messages": "The agonizing burden of absolute pacifism in a violent world. It rigorously tests the moral philosophy of preserving all human life, pushing its protagonist's ideals to their absolute breaking point.",
  "character_relationships": "Built on exasperation, deep moral conflict, and profound compassion. The dynamic between the insurance girls and Vash evolves from annoyance to deep, heartbreaking reverence for his suffering.",
  "lead_character_type": "Vash the Stampede is a legendary, seemingly invincible gunslinger who is actually a deeply traumatized, goofy pacifist desperately trying to hide his immense pain behind a buffoonish smile.",
  "story_and_plot_type": "A sci-fi action-comedy that devolves into a dark, psychological morality tale and character study.",
  "who_and_when": "For those seeking an anime that will make them laugh before completely destroying them emotionally. Best watched when you want a deep, meaningful narrative hidden behind spectacular action.",
  "emotional_evocation": "It leaves the viewer in absolute awe. It provokes genuine, tear-inducing heartbreak as you watch a deeply compassionate man be relentlessly punished for his own morality."
});

console.log("Batch 6 written successfully.");
