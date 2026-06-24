import json

new_data = [
    {
        "title": "Fate/stay night",
        "media_type": "visual novel",
        "plot": "Shirou Emiya, an amateur magus, is unwillingly drawn into the Fifth Holy Grail War—a secret tournament where mages summon legendary heroes to fight to the death for a wish-granting chalice. Across three diverging routes, he grapples with his idealistic desire to be a 'hero of justice'.",
        "atmosphere": "An urban fantasy that starts with a slice-of-life tone before plunging into intense, high-stakes magical warfare. It feels deeply rooted in its world-building, blending mundane daily routines with epic, mythical conflicts and dark psychological struggles.",
        "emotional_aftermath": "Profoundly satisfying and thought-provoking. The narrative meticulously deconstructs the protagonist's ideals, leaving the reader with a deep appreciation for the characters' growth and the heavy emotional weight of their sacrifices.",
        "consumption_context": "Requires a significant time investment (often 80+ hours) and patience for its slow-burn world-building. Best experienced by reading all three routes in order to fully appreciate the overarching thematic development.",
        "themes": "The deconstruction of the 'hero' archetype, idealism vs. reality, survivor's guilt, the weight of one's choices, and the clash between duty and personal desire."
    },
    {
        "title": "Umineko When They Cry",
        "media_type": "visual novel",
        "plot": "The wealthy Ushiromiya family gathers on a secluded island for an annual conference, only to be trapped by a typhoon. When brutal murders begin, protagonist Battler is forced into a twisted metaphysical game against the Golden Witch Beatrice, challenging whether the crimes were committed by human tricks or magic.",
        "atmosphere": "A masterful blend of classic locked-room mystery, gothic horror, and surreal fantasy. The tone wildly shifts from tense psychological thriller to flamboyant magical battles, wrapped in a pervasive sense of tragedy and intellectual challenge.",
        "emotional_aftermath": "Emotionally devastating yet ultimately cathartic. It demands active participation from the reader, leaving them with lingering questions about truth, perspective, and the nature of love long after the final chapter.",
        "consumption_context": "A massive, linear 'sound novel' requiring an open mind for its 'anti-mystery' structure. Best read with community patches for improved visuals and voice acting, during a period when you can dedicate time to dense reading and theory-crafting.",
        "themes": "Truth vs. illusion, the subjectivity of reality, the cycle of abuse, the power of belief, and the central motif that 'without love, it cannot be seen'."
    },
    {
        "title": "The House in Fata Morgana",
        "media_type": "visual novel",
        "plot": "You awaken as an amnesiac spirit in a cursed, decrepit mansion. Guided by a mysterious Maid, you traverse different historical eras to witness the tragic fates of the mansion's former residents, slowly unraveling the dark truth behind the house, the Maid, and your own identity.",
        "atmosphere": "A deeply melancholic, hauntingly beautiful gothic tragedy. It eschews typical anime tropes for a more mature, literary feel, supported by an incredible, emotionally resonant vocal soundtrack that amplifies the pervasive sense of sorrow and mystery.",
        "emotional_aftermath": "Heart-wrenching and ultimately beautiful. Players often describe it as a life-changing emotional journey that elicits profound sadness, culminating in a powerful, cathartic message of healing and redemption.",
        "consumption_context": "Perfect for readers seeking a mature, cohesive, and deeply emotional narrative without branching choices. It is a slow, methodical burn that requires patience but rewards it with one of the most acclaimed stories in the medium.",
        "themes": "Tragedy and trauma, the destructive nature of revenge, prejudice, gender identity, the enduring power of love, and the difficult path to forgiveness."
    },
    {
        "title": "Saya no Uta",
        "media_type": "visual novel",
        "plot": "Following a traumatic brain injury, Fuminori Sakisaka's perception of reality is warped into a nightmarish hellscape of gore and decay. The only beautiful thing in his world is Saya, a mysterious girl who is, in reality, an eldritch abomination. Their twisted romance leads Fuminori down a path of madness and atrocity.",
        "atmosphere": "Intensely claustrophobic, repulsive, and psychologically oppressive. It forces the reader into the protagonist's horrific perspective, creating a disturbing juxtaposition between visceral body horror and a genuinely touching, albeit deeply sick, love story.",
        "emotional_aftermath": "Deeply unsettling and polarizing. It leaves readers feeling disturbed, questioning morality and the nature of perception. Its heavy reliance on shock value and taboo subjects makes it a harrowing experience that lingers uncomfortably in the mind.",
        "consumption_context": "Not for the faint of heart. Requires a strong stomach for extreme gore, sexual violence, and moral depravity. Best experienced by fans of Lovecraftian horror and dark psychological thrillers looking for an unconventional narrative.",
        "themes": "The subjectivity of beauty and morality, isolation, misanthropy, Lovecraftian cosmic horror, and the terrifying lengths one will go for a twisted sense of love."
    },
    {
        "title": "Clannad",
        "media_type": "visual novel",
        "plot": "Delinquent high schooler Tomoya Okazaki meets Nagisa Furukawa, a fragile girl repeating her senior year. As he helps her revive the school's drama club, he forms deep bonds with various classmates. The story extends beyond high school into adulthood, exploring the profound joys and devastating tragedies of building a family.",
        "atmosphere": "Heartwarming, comedic, and intensely emotional. It balances charming slice-of-life humor and high school romance with heavy, tear-jerking dramatic moments, gradually shifting into a deeply mature exploration of adult responsibilities.",
        "emotional_aftermath": "Universally recognized as a 'nakige' (crying game) that leaves players emotionally wrecked but ultimately uplifted. It fosters a deep appreciation for family and the resilience of the human spirit amidst overwhelming grief.",
        "consumption_context": "A very long read that requires commitment and the use of a walkthrough due to its complex route system. The early 2000s art style might be jarring initially, but the emotional payoff in the 'After Story' is considered legendary.",
        "themes": "The importance of family and community, coming of age, the inevitability of change, dealing with grief and loss, and finding meaning in ordinary life."
    },
    {
        "title": "Subahibi",
        "media_type": "visual novel",
        "plot": "A mind-bending psychological thriller that explores the events surrounding a mysterious prophecy of the world's end on July 20th, 2012. The narrative shifts across multiple unreliable narrators, unraveling a complex web of bullying, madness, philosophy, and reality-warping delusions.",
        "atmosphere": "Deeply disturbing, highly philosophical, and intentionally confusing. It blends everyday slice-of-life with intense psychological horror, philosophical diatribes, and extreme, often taboo content.",
        "emotional_aftermath": "Exhausting, profound, and deeply challenging. It leaves readers heavily impacted, often requiring them to piece together the fractured narrative and philosophical musings to find the underlying message of finding meaning in a chaotic world.",
        "consumption_context": "Highly esoteric and contains extreme, triggering content (sexual violence, bullying). Only recommended for mature readers who enjoy dense philosophical themes, unreliable narrators, and avant-garde storytelling.",
        "themes": "Solipsism, the philosophy of language, the nature of reality and illusion, the cycle of bullying and abuse, and 'living happily' despite the world's cruelty."
    },
    {
        "title": "Doki Doki Literature Club!",
        "media_type": "visual novel",
        "plot": "What begins as a seemingly generic, upbeat high school dating sim takes a dark, meta-fictional turn when one of the club members begins altering the game's code. The protagonist must navigate glitches, psychological manipulation, and breaking the fourth wall as the game itself becomes a hostile entity.",
        "atmosphere": "Deceptively cute and cheerful, rapidly descending into oppressive, fourth-wall-breaking psychological horror. The juxtaposition of bright anime aesthetics with sudden, glitchy, and terrifying twists creates an atmosphere of constant dread and paranoia.",
        "emotional_aftermath": "Shocking and deeply unsettling. The game's meta-horror elements and direct engagement with the player leave a lasting impression, often causing players to feel a sense of violation and profound unease regarding digital media.",
        "consumption_context": "A relatively short, free experience best played completely blind. It carries heavy trigger warnings for a reason and is ideal for players looking for an innovative subversion of visual novel tropes and meta-narrative horror.",
        "themes": "Meta-fiction, the illusion of choice, mental illness, the relationship between player and game, and the horror of lack of control."
    },
    {
        "title": "Zero Escape: Nine Hours, Nine Persons, Nine Doors",
        "media_type": "visual novel",
        "plot": "Nine people are kidnapped by an enigmatic figure named Zero and trapped on a sinking cruise liner. They are forced to participate in the 'Nonary Game,' a deadly series of escape rooms and moral dilemmas, to find the exit door marked with a '9' before time runs out.",
        "atmosphere": "Tense, claustrophobic, and highly intellectual. The blend of high-stakes life-or-death scenarios with complex puzzles and deep dives into pseudo-science and philosophical thought experiments creates a gripping, thriller-esque environment.",
        "emotional_aftermath": "Thrilling and mind-expanding. The narrative's intricate twists and mind-bending revelations leave players in awe of the tightly woven plot and eager to uncover every branching ending.",
        "consumption_context": "A perfect entry point for newcomers to visual novels, as it breaks up reading with interactive puzzle-solving. Best enjoyed when ready for a gripping mystery that requires multiple playthroughs to uncover the true ending.",
        "themes": "Trust and betrayal, the Prisoner's Dilemma, morphogenetic field theory, the consequences of choices across parallel timelines, and the will to survive."
    },
    {
        "title": "Muv-Luv Alternative",
        "media_type": "visual novel",
        "plot": "Following the events of the previous games, Takeru Shirogane wakes up in an alternate universe where humanity is on the brink of extinction due to an alien invasion by the BETA. Armed with memories of his past failures, he joins the military to pilot mechas and desperately try to alter humanity's grim fate.",
        "atmosphere": "An epic, grueling, and intensely militaristic sci-fi saga. It shifts drastically from the romantic comedy of its predecessors into a dark, desperate, and traumatic war drama, characterized by high stakes, political intrigue, and brutal realism.",
        "emotional_aftermath": "Widely regarded as one of the most emotionally exhausting and epic experiences in the medium. Players are often left traumatized by the brutal twists and immense sacrifices, yet deeply moved by the incredible character growth and sheer scale of the narrative.",
        "consumption_context": "A monumental time investment that absolutely requires reading the significantly lighter prequels (Muv-Luv Extra and Unlimited) first to achieve the full emotional impact. It is the pinnacle of the 'kamige' (god-tier game) for mecha and sci-fi fans.",
        "themes": "PTSD and the trauma of war, the burden of leadership and responsibility, political maneuvering, the harsh realities of survival, and the unwavering determination to protect humanity."
    },
    {
        "title": "Tsukihime",
        "media_type": "visual novel",
        "plot": "Shiki Tohno, a high schooler who can see 'lines of death' that allow him to destroy anything he cuts, becomes entangled in a hidden world of vampires, the supernatural, and his own family's dark secrets after a chance encounter with the vampire princess Arcueid Brunestud.",
        "atmosphere": "A quintessential urban fantasy mystery dripping with early 2000s gothic dread. It blends a grounded, quiet slice-of-life setting with sudden bursts of visceral violence, psychological instability, and melancholic romance.",
        "emotional_aftermath": "Captivating and highly nostalgic. While the original shows its age, its deep lore, compelling heroines, and exploration of the protagonist's fractured psyche leave a lasting impact, cementing it as a foundational work of modern urban fantasy.",
        "consumption_context": "The original requires a tolerance for dated visuals and a lack of voice acting, though it offers a brilliant, moody atmosphere. The recent remake offers a modernized, polished experience.",
        "themes": "The fragility of life, the nature of instinct vs. reason, split personality and repressed trauma, tragic romance, and the dark secrets hidden within seemingly normal society."
    }
]

file_path = r"c:\Users\USER\Documents\Coda\backend\data\mass_enriched_data.json"
with open(file_path, "r", encoding="utf-8") as f:
    data = json.load(f)

data.extend(new_data)

with open(file_path, "w", encoding="utf-8") as f:
    json.dump(data, f, indent=2)

print(f"Successfully added {len(new_data)} VNs.")
