const fs = require('fs');
const path = require('path');

const outDir = 'c:\\Users\\USER\\Documents\\Coda\\backend\\data\\completed_synthesis';

const writeJson = (uuid, data) => {
    fs.writeFileSync(path.join(outDir, uuid + '.json'), JSON.stringify(data, null, 2), 'utf8');
}

writeJson("92b90df1-3fdf-9df2-dd9d-933b65b1cb2b", {
  "metadata_synthesis": "The White Diamond (2004), directed by Werner Herzog, is a mesmerizing German-British documentary exploring the hubris and beauty of human flight over the Guyanese rainforest.",
  "setting_and_subculture": "The pristine, largely unexplored rainforest canopy surrounding the giant Kaieteur Falls in Guyana. It captures a tiny, eccentric subculture of aeronautical engineers and explorers trying to conquer the sky.",
  "visual_tone_and_feel": "Wondrous, sweeping, and deeply eccentric. The cinematography captures the dizzying heights and majestic scale of the waterfalls, contrasting the sheer power of nature with the fragile, teardrop-shaped airship.",
  "media_era_tone": "The peak of 21st-century Herzogian documentary filmmaking, characterized by a seamless blend of natural wonder, deeply eccentric human subjects, and profound philosophical inquiry.",
  "pacing_and_structure": "A slow, contemplative journey that balances a tense, logistical engineering expedition with sprawling, philosophical detours into the history of aviation and the haunted pasts of its subjects.",
  "atmosphere_and_mood": "Awe-inspiring, melancholic, and hypnotic. The mood is steeped in a sense of sublime wonder, tinged with the lingering, ghostly tragedy of a past expedition that ended in death.",
  "themes_and_messages": "The human obsession with transcending physical boundaries and escaping our own heaviness. It explores how the drive to fly is fundamentally an attempt to break free from our own nature and past trauma.",
  "character_relationships": "Defined by eccentric, profound professional admiration and shared trauma. The dynamic between Herzog and his brilliant, haunted engineer subject is one of deep, bizarre mutual understanding.",
  "lead_character_type": "Dr. Graham Dorrington is a brilliant but deeply haunted aeronautical engineer, driven by a quixotic, almost obsessive need to conquer the sky to atone for a past tragedy.",
  "story_and_plot_type": "An expedition documentary and a psychological character study of a man trying to outfly his own guilt.",
  "who_and_when": "For lovers of eccentric, philosophical documentaries and majestic nature photography. Best viewed when you want to reflect on the strange, beautiful obsession of human ambition.",
  "emotional_evocation": "It evokes a profound sense of awe and a quiet, lingering sadness. The viewer is left with a breathtaking feeling of weightlessness and a deep empathy for human fragility."
});

writeJson("95f109a1-3405-7b07-3554-191926af3cd2", {
  "metadata_synthesis": "The Circle (2000), directed by Jafar Panahi, is a devastating Iranian drama that serves as a furious, urgent denunciation of the systemic oppression of women.",
  "setting_and_subculture": "The bleak, restrictive, and heavily policed urban streets of Tehran. It captures a deeply patriarchal society where simple acts of survival require evading constant surveillance and institutional control.",
  "visual_tone_and_feel": "Claustrophobic, urgent, and hyper-realistic. The camera relies on handheld tracking shots that stick intensely close to the women's faces, visually trapping them within the frame.",
  "media_era_tone": "A cornerstone of the Iranian New Wave's golden era, known for utilizing a gritty, neo-realist aesthetic to sneak profound sociopolitical critiques past strict state censorship.",
  "pacing_and_structure": "A relentless, circular relay-race of misery. The narrative seamlessly passes the baton from one desperate woman to another, creating an unbroken loop of struggle with no clear beginning or end.",
  "atmosphere_and_mood": "Suffocatingly tense, frantic, and profoundly sad. An overwhelming sense of lingering, static despair permeates the film as the characters constantly look over their shoulders in fear.",
  "themes_and_messages": "The inescapable, cyclical nature of female oppression under a patriarchal theocracy. It argues that for women in this society, simply existing is an illegal act, and their entire lives are a painful, closed loop.",
  "character_relationships": "An invisible bridge of companionship forged in mutual trauma. The women are largely strangers, but they are deeply connected by the shared, desperate necessity of surviving in a world that hates them.",
  "lead_character_type": "A composite protagonist made up of several desperate, exhausted women—parolees, mothers, and outcasts—who are entirely defined by their shared fight for basic autonomy.",
  "story_and_plot_type": "A multi-character social realist tragedy and urban road movie that functions as an endless loop of survival.",
  "who_and_when": "For viewers seeking socially urgent, emotionally furious cinema. Best watched when you are prepared to confront the brutal, suffocating reality of institutionalized misogyny.",
  "emotional_evocation": "It leaves the viewer feeling utterly trapped, breathless, and heartbroken. The continuous loop of suffering evokes a deep, furious empathy and a lingering, suffocating sadness."
});

writeJson("95f1c8c9-3643-55ca-ca89-0d9571a31dc3", {
  "metadata_synthesis": "The Spider's Stratagem (1970), directed by Bernardo Bertolucci, is a visually intoxicating Italian mystery adapting Jorge Luis Borges to explore the lingering shadows of fascism.",
  "setting_and_subculture": "The sun-baked, seemingly frozen-in-time fictional town of Tara in the Italian countryside. It is a surreal, hermetic community populated almost entirely by secretive old men and children.",
  "visual_tone_and_feel": "Extravagant, stylized, and deeply hypnotic. The cinematography is an eye-full of lush, cinematic elegance, using fluid tracking shots and surreal, absurdist touches to create a sense of spatial disorientation.",
  "media_era_tone": "The height of 1970s European modernist cinema, where psychological surrealism and political history intersect in visually spectacular, intellectually challenging ways.",
  "pacing_and_structure": "A dizzying, hypnotic unraveling. The narrative sways fluidly between the past and the present, constructing a paranoiac puzzle box where timelines and identities constantly mirror and blur into one another.",
  "atmosphere_and_mood": "Deeply paranoid, dreamlike, and melancholic. The town of Tara feels like a beautiful but suffocating trap, dripping with the heavy, unspoken weight of historical guilt and myth-making.",
  "themes_and_messages": "The dark, necessary utility of political myth-making and the inescapable web of history. It suggests that historical 'truth' is often an elaborate fiction constructed to maintain the collective illusion of heroism.",
  "character_relationships": "Defined by deception, manipulation, and the haunting weight of legacy. The protagonist is constantly manipulated by the town's elders and his father's former mistress, ensnared in a pre-written historical script.",
  "lead_character_type": "Athos Magnani is an inquisitive but deeply disoriented son who serves as a mirror image of his martyred father, entirely consumed by the labyrinthine lies of his own heritage.",
  "story_and_plot_type": "A surrealist political thriller and psychological mystery that functions as a cinematic mind-fuck about the creation of legends.",
  "who_and_when": "For cinephiles who love gorgeous, labyrinthine puzzles and Borges adaptations. Best watched when you want to lose yourself in a hypnotic, visually stunning exploration of political paranoia.",
  "emotional_evocation": "It induces a beautifully entrancing state of confusion. The viewer is left mesmerized by its elegance while feeling a deep, creeping unease at the realization that the truth is entirely manufactured."
});

writeJson("969a48cd-4f2b-d0cb-0cb5-11c2ee3c1394", {
  "metadata_synthesis": "Paisa Vasool (2017) is an Indian film that ostensibly presents itself as an action-comedy, but resonates with its audience as a bizarrely depressing reflection on human tragedy and socioeconomic chaos.",
  "setting_and_subculture": "The chaotic, high-stakes underworld of the Indian mafia and intelligence agencies, acting as a bizarrely vibrant backdrop for a deeply cynical, emotionally harrowing commentary on political realities like demonetization.",
  "visual_tone_and_feel": "A surreal mix of bombastic, colorful action-cinema tropes masking a deeply depressing, bleak undertone. The visual excess directly contradicts the harrowing, tragic messages hidden within the subtext.",
  "media_era_tone": "Late 2010s mainstream Indian cinema that inadvertently (or perhaps subversively) channels deep political frustration into commercial entertainment.",
  "pacing_and_structure": "Erratic and structurally jarring. It violently shifts from standard action-comedy beats into deeply saddening, harrowing moments that leave the viewer emotionally exhausted and depressed.",
  "atmosphere_and_mood": "Wildly uneven, transitioning from commercial excess into a shockingly depressing, fatalistic sadness. It operates in a strange space where getting what you want ultimately feels like a tragic defeat.",
  "themes_and_messages": "The devastating tragedy of human existence and the inescapable fallout of massive socioeconomic policies. It suggests that even in victory, the human soul is ultimately crushed by the weight of systemic forces.",
  "character_relationships": "Defined by violent transactional necessity and sudden, tragic vulnerability. A hardened ruffian and a desperate girl are thrown together by a chaotic world that ultimately offers no real comfort.",
  "lead_character_type": "A deeply flawed, boisterous local gangster who serves as a tragic, unwitting pawn in a much larger, darker political and emotional game.",
  "story_and_plot_type": "An action-masala film that secretly functions as a deeply depressing, harrowing human tragedy and political critique.",
  "who_and_when": "For viewers expecting a standard action movie but who are bizarrely prepared to be thrown into a sad, emotionally harrowing existential crisis. Best watched with a deep sense of political cynicism.",
  "emotional_evocation": "It hits in ways you never expect, leaving you profoundly depressed and emotionally drained by the inescapable tragedy of the human condition masquerading as commercial entertainment."
});

writeJson("9c980c52-3546-2870-2b95-6985366d677a", {
  "metadata_synthesis": "Mephisto (1981), directed by István Szabó, is a Hungarian-German historical drama and an absolute masterpiece of allegorical irony about an actor who sells his soul to the Third Reich.",
  "setting_and_subculture": "The opulent theaters and high-society political circles of pre-WWII Germany. It depicts a glamorous, insulated artistic subculture that slowly and willingly allows itself to be swallowed by Nazi terror.",
  "visual_tone_and_feel": "Theatrical, striking, and increasingly claustrophobic. The film uses magnificent art direction and stage lighting to frame the protagonist's life as one endless, terrifying performance within a tightening fascist cage.",
  "media_era_tone": "Early 1980s European historical cinema, delivering a grandiose, unapologetic, and highly ambitious dissection of artistic complicity in totalitarianism.",
  "pacing_and_structure": "A slow, insidious moral decay. The narrative is structured as a grand, escalating theatrical tragedy, steadily tightening the noose as the protagonist trades his morality for ever-increasing prestige.",
  "atmosphere_and_mood": "Electrifying, eerie, and utterly terrifying. A constant, underlying dread hums beneath the glamorous facade, making the viewer intensely aware of the hollow, rotting core of the protagonist's success.",
  "themes_and_messages": "The fatal delusion of artistic neutrality and the horrifying cost of unchecked ambition. It argues that attempting to subvert a fascist regime from within is a lie artists tell themselves while acting as puppets for the empire.",
  "character_relationships": "Deeply parasitic, manipulative, and ultimately completely alienating. The protagonist abandons every genuine human connection, viewing relationships only through the lens of how they can advance his career or protect his status.",
  "lead_character_type": "Hendrik Höfgen is a brilliantly talented, overly ambitious, and fundamentally hollow stage actor. He is the ultimate narcissist, willing to discard every moral conviction to remain the center of attention.",
  "story_and_plot_type": "A Faustian tragedy and semi-biographical character study documenting a horrifying, real-world descent into moral bankruptcy.",
  "who_and_when": "For those seeking a deeply unsettling, electrifying exploration of artistic complicity and the psychology of fascism. Best watched when contemplating the moral responsibilities of artists in dark political times.",
  "emotional_evocation": "It leaves the viewer completely terrified and disgusted by the ease of human compromise. It evokes a hollow, haunting chill that lingers long after the final curtain falls."
});

console.log("Batch 5 written successfully.");
