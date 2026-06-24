/**
 * generate_seeds.js
 * -----------------
 * Uses Groq (llama-3.3-70b-versatile) to compile a comprehensive seed catalog
 * for the Media Brain. Instead of one generic prompt per media type, we target
 * specific aesthetic clusters — ensuring full coverage of the aesthetic space,
 * not just the obvious mainstream picks.
 *
 * Usage: node backend/generate_seeds.js
 * Optional flags:
 *   --category anime       (only run one category)
 *   --dry-run              (print cluster plan without calling Groq)
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
require('./loadEnv');

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const MASSIVE_SEED_FILE = path.join(__dirname, 'data', 'massive_seed.json');
const PROCESSED_TITLES_FILE = path.join(__dirname, 'processed_titles.txt');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// ─────────────────────────────────────────────────────────────────────────────
// CLUSTER DEFINITIONS
// Each cluster gets its own Groq call → 25 targeted titles
// Focus is on cult + deep-cut tier — Tier 1 anchors are mostly already in Brain
// ─────────────────────────────────────────────────────────────────────────────
const CLUSTERS = {
  anime: [
    { name: 'psychological-thriller', hint: 'anime with psychological tension, unreliable narrators, mental breakdown, existential dread. Think Serial Experiments Lain, Paranoia Agent, Boogiepop Phantom territory. Cult and obscure picks preferred.' },
    { name: 'slice-of-life-literary', hint: 'quiet, contemplative slice-of-life anime about everyday life, loneliness, small moments. Think Mushishi, Barakamon, Aria the Animation. No action, just atmosphere and humanity.' },
    { name: 'romance-drama', hint: 'emotionally heavy romance and drama anime. Tragic love stories, unrequited feelings, heartbreak. Think White Album 2, Nana, Rumbling Hearts. Adult relationships preferred over high school.' },
    { name: 'mecha-philosophical', hint: 'mecha anime with real philosophical weight beyond action. Think Evangelion, Gunbuster, Xam\'d, Eureka Seven. Not just robot battles — existential questions about identity and war.' },
    { name: 'cyberpunk-sci-fi', hint: 'cyberpunk and hard sci-fi anime. Dystopian futures, transhumanism, AI, corporate control. Think Ghost in the Shell, Texhnolyze, Ergo Proxy, Planetes. Include obscure picks.' },
    { name: 'historical-samurai', hint: 'historical anime set in feudal Japan, warring states, meiji era, or other historical periods. Serious, grounded storytelling. Think Vinland Saga, Dororo, Shigurui, House of Five Leaves.' },
    { name: 'sports-character', hint: 'sports anime focused on character development and rivalry as much as the sport itself. Think Ping Pong the Animation, Haikyuu, Ashita no Joe, Hajime no Ippo. Emotional weight is key.' },
    { name: 'horror-supernatural', hint: 'horror, dark supernatural, and deeply unsettling anime. Think Higurashi, Shiki, Yamishibai, Another, Corpse Party. Atmosphere of dread over jump scares.' },
    { name: 'music-arts', hint: 'anime centered on music, art, or creative passion. Think Nana, Shigatsu wa Kimi no Uso, Kids on the Slope, Nodame Cantabile, Beck. Emotional and atmospheric.' },
    { name: 'art-house-experimental', hint: 'avant-garde, experimental, and art-house anime that push form. Think Mind Game, Cat Soup, Angel\'s Egg, Belladonna of Sadness, Tekkon Kinkreet. Strange and beautiful.' },
    { name: 'school-social-drama', hint: 'school-set anime dealing with social dynamics, bullying, ostracism, coming-of-age pain. Think A Silent Voice, Welcome to the NHK, Watamote, Oregairu. Raw and honest.' },
    { name: 'military-war', hint: 'serious military and war anime exploring the human cost of conflict. Think Grave of the Fireflies, In This Corner of the World, 08th MS Team, Rainbow: Nisha Rokubou no Shichinin.' },
    { name: 'mystery-detective', hint: 'mystery and detective anime with clever plots and atmosphere. Think Monster, Gosick, Hyouka, Un-Go, Tantei Opera Milky Holmes. Cerebral and plot-driven.' },
    { name: 'dark-fantasy', hint: 'dark fantasy anime with mature themes, grim worlds, and moral complexity. Think Berserk, Claymore, Dororo, The Twelve Kingdoms, Mahou Shoujo Site.' },
    { name: 'comedy-satire', hint: 'genuinely funny anime that also has sharp satirical or subversive qualities. Think Gintama, Gekkan Shoujo Nozaki-kun, Daily Lives of High School Boys, Haven\'t You Heard? I\'m Sakamoto.' },
    { name: 'nostalgia-90s-00s', hint: 'classic anime from the 1990s and early 2000s that defined the era. Think Berserk (1997), Initial D, GTO, Outlaw Star, Trigun, Rurouni Kenshin. Cultural touchstones.' },
    { name: 'josei-adult-drama', hint: 'josei and adult drama anime aimed at adult women. Mature relationships, career struggles, realistic emotions. Think Nana, Chihayafuru, Sakamichi no Apollon, Carole & Tuesday.' },
    { name: 'space-opera', hint: 'grand space opera anime with epic scope and complex politics. Think Legend of the Galactic Heroes, Macross, Crest of the Stars, Planetes, Terra e.' },
    { name: 'supernatural-coming-of-age', hint: 'anime combining supernatural elements with coming-of-age emotional arcs. Think Anohana, Natsume\'s Book of Friends, 3-Gatsu no Lion, March Comes in Like a Lion.' },
    { name: 'short-experimental-film', hint: 'short anime films, anthology works, and experimental formats. Think Cat Soup, Pluto (manga), The Place Promised in Our Early Days, Garden of Words, Colorful.' },
    { name: 'martial-arts-action', hint: 'anime centred on martial arts and physical combat with character depth. Think Hajime no Ippo, Kenichi, Baki, Air Master, Yawara! A Fashionable Judo Girl.' },
  ],

  movie: [
    { name: 'french-new-wave', hint: 'French New Wave cinema and its descendants. Godard, Truffaut, Varda, Rohmer, Rivette. Jump cuts, existentialism, anti-narrative. Include obscure picks beyond the obvious.' },
    { name: 'japanese-golden-age', hint: 'classic Japanese cinema from the 1950s-70s. Ozu, Mizoguchi, Naruse, Imamura, Oshima. Slow, precise, devastating. Beyond just Kurosawa — focus on the lesser-known masters.' },
    { name: 'kurosawa-adjacent', hint: 'samurai, jidaigeki, and period Japanese films. Kurosawa, Kobayashi, Gosha, Misumi. Epic moral stories set in feudal Japan. Include lesser-known gems.' },
    { name: 'korean-cinema', hint: 'Korean cinema from the 1990s to present. Bong Joon-ho, Park Chan-wook, Lee Chang-dong, Hong Sang-soo, Kim Ki-duk. Include deep cuts beyond Parasite and Oldboy.' },
    { name: 'italian-neorealism', hint: 'Italian neorealism and its descendants. De Sica, Rossellini, Visconti, Antonioni, Pasolini, Bertolucci. Gritty, human, political. Include obscure picks.' },
    { name: 'iranian-cinema', hint: 'Iranian cinema — Kiarostami, Farhadi, Panahi, Makhmalbaf, Ghobadi. Quietly devastating, humanist, political. Very underrepresented in most lists.' },
    { name: 'german-expressionism-arthouse', hint: 'German Expressionism, New German Cinema, and contemporary German art-house. Lang, Murnau, Herzog, Fassbinder, Wenders, Haneke (Austrian). Include obscure works.' },
    { name: 'american-indie-drama', hint: 'American independent cinema with character-first storytelling. Cassavetes, Jarmusch, Kelly Reichardt, Sophia Coppola, Andrew Haigh. Small scale, emotionally rich.' },
    { name: 'british-social-realism', hint: 'British kitchen-sink realism and social cinema. Ken Loach, Mike Leigh, Andrea Arnold, Shane Meadows. Working class, unflinching, raw.' },
    { name: 'soviet-eastern-european', hint: 'Soviet and Eastern European art cinema. Tarkovsky, Sokurov, Kieslowski, Zanussi, Forman, Klimov. Philosophical, visually stunning, politically charged.' },
    { name: 'slow-cinema', hint: 'slow cinema and contemplative film. Béla Tarr, Carlos Reygadas, Lisandro Alonso, Pedro Costa, Chantal Akerman, Wang Bing. Long takes, minimal dialogue.' },
    { name: 'surrealism-absurdism', hint: 'surrealist, absurdist, and dream-logic cinema. Buñuel, Lynch, Jodorowsky, Guy Maddin, Jan Švankmajer. Reality breaking down in beautiful ways.' },
    { name: 'documentary-essay', hint: 'landmark documentaries and essay films. Wiseman, Herzog, Marker, Maysles, Riefenstahl (historical), Errol Morris. Films that feel as rich as fiction.' },
    { name: 'nordic-scandinavian', hint: 'Nordic and Scandinavian cinema. Bergman, Dreyer, Von Trier, Östlund, Kieslowski (Polish adjacent). Cold, austere, existential. Beyond the obvious picks.' },
    { name: 'latin-american', hint: 'Latin American cinema. Alfonso Cuarón, Guillermo del Toro, Fernando Meirelles, Walter Salles, Lucrecia Martel, Pablo Larraín. Vibrant and politically charged.' },
    { name: 'hong-kong-asian-cult', hint: 'Hong Kong cinema and Asian cult films. Wong Kar-wai, John Woo, Johnnie To, Fruit Chan, Ann Hui. Stylish, melancholy, kinetic.' },
    { name: 'psychological-thriller', hint: 'psychological thrillers that burrow under the skin. Polanski, De Palma, Fincher, Verhoeven, Ari Aster, Robert Eggers. Dread and paranoia.' },
    { name: 'dark-comedy-satire', hint: 'dark comedy and satirical films. Kubrick, Coen Brothers, Roy Andersson, Yorgos Lanthimos, Ruben Östlund. Funny and deeply unsettling at once.' },
    { name: 'romance-intimate-drama', hint: 'intimate romantic dramas. Rohmer, Richard Linklater, Claire Denis, Xavier Dolan, Sebastian Lelio. The texture of love and longing.' },
    { name: 'horror-art-house', hint: 'horror films with genuine artistic vision beyond genre entertainment. Ari Aster, Robert Eggers, Jennifer Kent, Lucile Hadžihalilović, Pascal Laugier. Terrifying and beautiful.' },
    { name: 'war-anti-war', hint: 'war films that interrogate rather than celebrate. Kubrick, Elem Klimov, Terrence Malick, Francis Ford Coppola, Aleksandr Sokurov. Anti-heroic and devastating.' },
    { name: 'coming-of-age', hint: 'coming-of-age films capturing youth, identity, and adolescent pain. Stand By Me, Moonlight, The 400 Blows, Boyhood, Lady Bird, Mustang. Across cultures and eras.' },
    { name: 'african-middle-east-cinema', hint: 'African and Middle Eastern cinema — Sembène, Chahine, Kiarostami, Nouri Bouzid, Newton Aduaka. Criminally underrepresented and genuinely powerful.' },
    { name: 'post-modern-meta', hint: 'postmodern and meta films that play with form and reality. Kaufman, Godard, Lynch, Haneke, Ruiz. Films about what film is.' },
  ],

  tv: [
    { name: 'prestige-american-drama', hint: 'peak TV American drama beyond the obvious. The Americans, Rectify, Halt and Catch Fire, Justified, Treme. Character-first, morally complex, underrated.' },
    { name: 'british-crime-drama', hint: 'British crime drama beyond Sherlock. Happy Valley, Line of Duty, Broadchurch, Shetland, Hinterland, Marcella. Grim, character-driven, atmospheric.' },
    { name: 'korean-drama', hint: 'Korean drama (K-drama) spanning all genres. Signal, My Mister, Move to Heaven, Reply 1988, Misaeng, Stranger. Beyond the mainstream romantic comedies.' },
    { name: 'nordic-noir', hint: 'Nordic noir and Scandinavian crime TV. The Bridge (Broen), The Killing, Wallander, Midnight Sun, Young Wallander, Trapped (Ófærð). Bleak and atmospheric.' },
    { name: 'french-european-drama', hint: 'French and broader European drama series. Call My Agent, The Bureau, Spiral, Baron Noir, Deutschland 83, Dark (German), Gomorrah (Italian).' },
    { name: 'british-comedy-drama', hint: 'British comedy-drama with genuine emotional depth. Motherland, This Country, Inside No.9, Detectorists, People Just Do Nothing, Catastrophe, Misfits.' },
    { name: 'anthology-limited-series', hint: 'anthology and limited series that tell complete stories. Sharp Objects, The Night Of, The People v. O.J. Simpson, When They See Us, Mare of Easttown.' },
    { name: 'sci-fi-speculative', hint: 'intelligent science fiction and speculative drama TV. Battlestar Galactica, Halt and Catch Fire, The Leftovers, Westworld S1, Counterpart, Years and Years.' },
    { name: 'political-institutional', hint: 'political and institutional drama exploring systems of power. The Wire (if not already in), The Thick of It, Yes Minister, Borgen, Designated Survivor, Madam Secretary.' },
    { name: 'japanese-live-action', hint: 'Japanese live-action drama (J-drama). Hana Yori Dango, Great Teacher Onizuka (live), Nigehaji, Last Friends, Kekkon Dekinai Otoko. Underrepresented in Western lists.' },
    { name: 'animation-adult', hint: 'adult animation with real artistic and narrative ambition beyond comedy. BoJack Horseman (if not already in), Undone, Infinity Train, Over the Garden Wall, Final Space.' },
    { name: 'crime-heist-procedural', hint: 'crime, heist, and procedural TV with style and intelligence. Money Heist, Narcos, Ozark, Animal Kingdom, Sneaky Pete, Banshee. Plot-driven but character-rich.' },
    { name: 'horror-supernatural-tv', hint: 'horror and supernatural TV series with genuine dread. Marianne, The Terror, Midnight Mass, Channel Zero, Archive 81, Brand New Cherry Flavor.' },
    { name: 'spanish-latin-international', hint: 'Spanish, Italian, and broader international drama. Élite, Suburra, Fauda (Israel), Tehran, Baghdad Central, Caliphate. Global crime and political drama.' },
    { name: 'australian-new-zealand', hint: 'Australian and New Zealand TV drama and comedy. Rake, Utopia (AU), The Code, Cleverman, Top of the Lake, Romper Stomper. Distinctive voice and landscape.' },
    { name: 'social-workplace-drama', hint: 'workplace and social environment drama exploring group dynamics. The Bear (if not in), Industry, Succession (if not in), Abbott Elementary, Severance (if not in).' },
  ],

  book: [
    { name: 'japanese-literary', hint: 'serious Japanese literary fiction. Mishima, Kawabata, Tanizaki, Ogawa Yoko, Hiromi Kawakami, Hiroko Oyamada, Sayaka Murata. Translated. Quiet and devastating.' },
    { name: 'russian-soviet-classics', hint: 'Russian and Soviet literary classics and modern works. Tolstoy, Dostoyevsky, Bulgakov, Chekhov, Akhmatova, Platonov, Shalamov. Beyond the obvious picks.' },
    { name: 'latin-american-magic-realism', hint: 'Latin American literary fiction and magical realism. Borges, García Márquez, Cortázar, Vargas Llosa, Bolaño, Lispector, Pitol. Include the lesser-known.' },
    { name: 'french-european-literary', hint: 'French and European literary fiction. Camus, Sartre, Duras, Modiano, Houellebecq, Yourcenar, Bernhard, Sebald, Jelinek.' },
    { name: 'african-postcolonial', hint: 'African and postcolonial literary fiction. Achebe, Ngugi, Adichie, Coetzee, Mahfouz, Mpe, Bulawayo, Oyeyemi. Stories from the Global South.' },
    { name: 'literary-sci-fi', hint: 'literary science fiction prioritising ideas and prose over plot. Le Guin, Stanislaw Lem, Octavia Butler, Ted Chiang, Jeff VanderMeer, China Miéville, Gene Wolfe.' },
    { name: 'dystopian-political', hint: 'dystopian and politically charged fiction. Zamyatin, Huxley, Orwell (beyond 1984), Atwood, McCarthy (The Road if not in), Saramago, Lessing.' },
    { name: 'psychological-horror-literary', hint: 'literary horror and psychological fiction. Shirley Jackson, Thomas Ligotti, Paul Tremblay, Carmen Maria Machado, Jon McGregor, Mariana Enriquez.' },
    { name: 'coming-of-age-literary', hint: 'literary coming-of-age novels beyond the obvious. The Perks of Being a Wallflower, White Teeth, The Remains of the Day, A Pale View of Hills, The Outsiders.' },
    { name: 'modern-british-literary', hint: 'modern and contemporary British literary fiction. Kazuo Ishiguro, Ian McEwan, Zadie Smith, Ali Smith, Sarah Waters, Jon McGregor, Penelope Fitzgerald.' },
    { name: 'hard-sci-fi-speculative', hint: 'hard science fiction and speculative fiction with technical rigour. Kim Stanley Robinson, Greg Egan, Alastair Reynolds, Peter Watts, Kim Stanley Robinson, Greg Bear.' },
    { name: 'fantasy-literary', hint: 'literary fantasy that transcends genre. Ursula Le Guin, Gene Wolfe, Susanna Clarke, Patricia McKillip, Angela Carter, Hilary Mantel.' },
    { name: 'crime-noir-literary', hint: 'literary crime and noir fiction with genuine prose ambition. James Ellroy, Derek Raymond, Jean-Patrick Manchette, Megan Abbott, Patricia Highsmith.' },
    { name: 'asian-literary', hint: 'Asian literary fiction beyond Japan. Han Kang (Korea), Yu Hua (China), Mo Yan, Arundhati Roy (India), Jeet Thayil, Xiaolu Guo. Diverse voices.' },
    { name: 'short-story-collections', hint: 'landmark short story collections. Chekhov, Carver, O\'Connor, Babel, Borges, Alice Munro, George Saunders, Lucia Berlin, Denis Johnson.' },
    { name: 'memoir-autofiction', hint: 'literary memoir and autofiction with artistic ambition. Édouard Louis, Annie Ernaux, Karl Ove Knausgård, Ocean Vuong, Carmen Maria Machado (In the Dream House).' },
    { name: 'postmodern-experimental', hint: 'postmodern and formally experimental fiction. Pynchon, DFW, Nabokov, Perec, Calvino, Bernhard, Beckett (novels), Bolaño.' },
    { name: 'middle-east-literary', hint: 'Middle Eastern literary fiction. Mahfouz (Egypt), Saramago (adjacent), Orhan Pamuk (Turkey), Elif Shafak, Elias Khoury (Lebanon), Sadegh Hedayat (Iran).' },
    { name: 'war-conflict-literary', hint: 'literary fiction about war and its aftermath. Tim O\'Brien, Pat Barker, Sebastian Faulks, Primo Levi, Erich Maria Remarque, Viet Thanh Nguyen.' },
    { name: 'graphic-novel-literary', hint: 'literary graphic novels and illustrated works. Maus, Persepolis, Jimmy Corrigan, Building Stories, Here, Black Hole, Paying the Land.' },
  ],

  manga: [
    { name: 'seinen-psychological', hint: 'psychological and dark seinen manga. Oyasumi Punpun, Homunculus, I Am a Hero, Aku no Hana, MPD Psycho, Berserk. Inner darkness and obsession.' },
    { name: 'slice-of-life-iyashikei', hint: 'healing and slice-of-life manga. Yotsuba&!, Mushishi, Yuru Camp, Non Non Biyori, Barakamon, Silver Spoon. Gentle and restorative.' },
    { name: 'romance-drama-josei', hint: 'romance and drama manga with emotional depth. Nana, NANA, Kimi ni Todoke, Solanin, After the Rain, Chihayafuru, Koe no Katachi.' },
    { name: 'horror-body', hint: 'horror manga from Junji Ito and peers. Uzumaki, Tomie, Gyo, The Enigma of Amigara Fault, Biomega, MPD Psycho, Hideout. Body horror and dread.' },
    { name: 'sports-competitive', hint: 'sports manga driven by rivalry, passion, and growth. Slam Dunk, Hajime no Ippo, Haikyuu!, Ping Pong, Eyeshield 21, Blue Lock, Giant Killing.' },
    { name: 'historical-jidaigeki', hint: 'historical manga set in Japan and globally. Vagabond, Vinland Saga, Blade of the Immortal, Kingdom, Dungeon Meshi (adjacent), Lone Wolf and Cub.' },
    { name: 'sci-fi-speculative', hint: 'science fiction and speculative manga. Pluto, 20th Century Boys, Eden: It\'s an Endless World!, Biomega, Blame!, Knights of Sidonia, Terra Formars.' },
    { name: 'art-experimental', hint: 'experimental and art-forward manga. Shigeru Mizuki, Yoshiharu Tsuge, Kazuichi Hanawa, Hinako Sugiura, Inio Asano\'s more experimental work.' },
    { name: 'comedy-gag', hint: 'pure comedy and gag manga with sharp timing. Gintama (manga), Cromartie High School, Grand Blue, Saiki K., Daily Lives of High School Boys, Kaguya-sama.' },
    { name: 'battle-shonen', hint: 'battle shonen manga with real ambition. Naruto, One Piece, My Hero Academia, Fullmetal Alchemist, Bleach, Hunter x Hunter (if not in). Genre-defining works.' },
    { name: 'social-commentary', hint: 'manga as social commentary. Mushishi (nature), Ajin, Golden Kamuy, Dungeon Meshi, I Am a Hero, Satoshi Kon\'s manga work. Culturally engaged stories.' },
    { name: 'music-creative', hint: 'manga about music, art, and creative passion. Nana, Beck, Kids on the Slope, Nodame Cantabile manga, Solanin, Blue Giant.' },
    { name: 'mystery-detective', hint: 'mystery and detective manga. Detective Conan, Q.E.D., Kindaichi, Monster (manga), Billy Bat, The Kurosagi Corpse Delivery Service.' },
    { name: 'isekai-literary', hint: 'literary isekai and portal fantasy manga. Dungeon Meshi, Made in Abyss, The Twelve Kingdoms (manga), Fushigi Yuugi, Escaflowne (manga).' },
    { name: 'food-lifestyle', hint: 'food and lifestyle manga that go beyond simple cooking. Oishinbo, Solitary Gourmet, What Did You Eat Yesterday?, Toriko, Food Wars, The Way of the Househusband.' },
    { name: 'war-military', hint: 'war and military manga with moral weight. Barefoot Gen, Onward Towards Our Noble Deaths, Golden Kamuy, Area 88, The Silent Service.' },
    { name: 'ecchi-mature-comedy', hint: 'ecchi and mature comedy manga with genuine character work. GTO, Grand Blue, Domestic Girlfriend, Prison School, Prison School (just one), Girls of the Wild\'s.' },
    { name: 'biographical-nonfiction', hint: 'biographical and nonfiction manga. Disappearance Diary, My Brother\'s Husband, Ooku, The Times of Botchan, Sunny (Matsumoto).' },
  ],

  'visual novel': [
    { name: 'nakige-emotional', hint: 'nakige (crying game) visual novels designed for emotional catharsis. Clannad, Little Busters!, Kanon, Air, Planetarian, Angel Beats!. Emotionally devastating routes.' },
    { name: 'utsuge-dark', hint: 'utsuge (depressing game) visual novels with truly bleak outlooks. Saya no Uta, Subahibi, Kara no Shoujo, Phenomeno, Chaos;Head. No happy endings.' },
    { name: 'mystery-detective-vn', hint: 'mystery and detective visual novels with clever plotting. Umineko, Zero Escape series, AI: The Somnium Files, Famicom Detective Club, Raging Loop.' },
    { name: 'sci-fi-vn', hint: 'science fiction visual novels with big ideas. Steins;Gate (if not in), Muv-Luv Alternative (if not in), Chaos;Child, Robotics;Notes, Ever17, Remember11.' },
    { name: 'dark-psychological-vn', hint: 'psychologically disturbing and transgressive visual novels. Saya no Uta, Euphoria, Maggot Baits, Kikokugai, Hanachirasu. Dark and challenging.' },
    { name: 'romance-charage', hint: 'romance-focused charage and moege with quality writing. Grisaia series, If My Heart Had Wings, Hoshizora e Kakaru Hashi, Princess Evangile, Hatsukoi 1/1.' },
    { name: 'fantasy-epic-vn', hint: 'epic fantasy visual novels with sprawling world-building. Dies irae, Eien no Aselia, Kamidori Alchemy Meister, Utawarerumono, Shinigami no Kiss wa Wakare no Aji.' },
    { name: 'horror-vn', hint: 'horror visual novels. Corpse Party, Higurashi (if not in), Sharnoth, Phenomeno, Fault Milestone, Satsuriku no Tenshi, The Silver Case.' },
    { name: 'otome-romance', hint: 'otome visual novels (romance for women). Hakuoki, Collar x Malice, Code: Realize, Amnesia: Memories, Voltage games, Variable Barricade.' },
    { name: 'all-ages-literary', hint: 'all-ages literary visual novels with genuine artistic ambition. Planetarian, Narcissu, The House in Fata Morgana (if not in), eden*, Flowers series.' },
    { name: 'eroge-story', hint: 'story-driven eroge where the writing transcends the content. Yume Miru Kusuri, Boku ga Sadame, Sharin no Kuni, True Love (1995), Edelweiss.' },
    { name: 'western-indie-vn', hint: 'Western indie visual novels with genuine artistic vision. Doki Doki Literature Club (if not in), Disco Elysium (adjacent), Butterfly Soup, Slay the Princess, Heart of the Woods.' },
  ],

  game: [
    { name: 'jrpg-narrative', hint: 'narrative-focused JRPGs where story and characters are paramount. Persona series, Xenogears, Final Fantasy VI, Chrono Trigger, Tales of Berseria, Nier:Automata.' },
    { name: 'action-adventure-story', hint: 'action-adventure games with rich stories. The Last of Us, Red Dead Redemption 2, God of War (2018), Ghost of Tsushima, Spider-Man (Insomniac), Horizon Zero Dawn.' },
    { name: 'indie-narrative', hint: 'indie games with strong narrative and emotional depth. Undertale, Celeste, Disco Elysium, Hades, Hollow Knight, Night in the Woods, Oxenfree, What Remains of Edith Finch.' },
    { name: 'horror-survival', hint: 'horror games that genuinely disturb. Silent Hill series, Resident Evil series, SOMA, Amnesia, Outlast, Alien: Isolation, Little Nightmares, Visage.' },
    { name: 'strategy-tactics', hint: 'strategy and tactics games with depth. Fire Emblem series, XCOM series, Total War, Civilization, Into the Breach, Tactics Ogre, Valkyria Chronicles.' },
    { name: 'souls-challenging', hint: 'FromSoftware and souls-adjacent games. Dark Souls series, Elden Ring, Bloodborne, Sekiro, Nioh, The Surge, Code Vein, Lies of P.' },
    { name: 'simulation-life', hint: 'life simulation and management games with depth. Stardew Valley, Animal Crossing, Harvest Moon, Spiritfarer, Two Point Hospital, Cities: Skylines.' },
    { name: 'puzzle-cerebral', hint: 'cerebral puzzle games that reward thinking. Portal series, The Witness, Braid, Return of the Obra Dinn, Outer Wilds, The Talos Principle, Stephen\'s Sausage Roll.' },
    { name: 'open-world-exploration', hint: 'open world games that reward exploration and discovery. The Legend of Zelda: BotW, Morrowind, Skyrim, Kenshi, Kingdom Come: Deliverance, Death Stranding.' },
    { name: 'platformer-artful', hint: 'artful and emotionally resonant platformers. Celeste (if not in), Ori series, Limbo, Inside, Little Nightmares, A Hat in Time, Shovel Knight.' },
    { name: 'fps-story', hint: 'story-driven FPS games with genuine narrative ambition. BioShock series, Half-Life series, Dishonored, Prey (2017), Titanfall 2 campaign, Wolfenstein: New Order.' },
    { name: 'metroidvania', hint: 'metroidvania games with atmosphere and depth. Hollow Knight, Blasphemous, Ori series, Dead Cells, Axiom Verge, Gato Roboto, Guacamelee.' },
    { name: 'point-click-adventure', hint: 'point-and-click adventure games. Grim Fandango, Monkey Island, Full Throttle, Disco Elysium (if not in), The Walking Dead (Telltale), Kentucky Route Zero.' },
    { name: 'rhythm-music-game', hint: 'rhythm and music games with personality. Hades (soundtrack-driven), Crypt of the NecroDancer, Sayonara Wild Hearts, Thumper, Guitar Hero, Beat Saber.' },
    { name: 'rpg-western', hint: 'Western RPGs with rich worlds and player agency. Baldur\'s Gate series, Planescape: Torment, Dragon Age: Origins, The Witcher series, Fallout: New Vegas.' },
    { name: 'visual-novel-adjacent-game', hint: 'games on the boundary between visual novel and game. Disco Elysium, 80 Days, Orwell, Heaven\'s Vault, Forgotten Anne, Mutazione, Neo Cab.' },
    { name: 'co-op-multiplayer-social', hint: 'multiplayer and social games with genuine design depth. Journey, Phasmophobia, Among Us, Deep Rock Galactic, It Takes Two, Overcooked, Lovers in a Dangerous Spacetime.' },
    { name: 'roguelike-roguelite', hint: 'roguelike and roguelite games with addictive depth. Hades, Slay the Spire, Enter the Gungeon, Dead Cells, FTL, Risk of Rain 2, Returnal.' },
    { name: 'management-builder', hint: 'management and building games that become deeply engrossing. RimWorld, Dwarf Fortress, Factorio, Oxygen Not Included, Prison Architect, Frostpunk.' },
    { name: 'fighting-game-story', hint: 'fighting games with unusual depth in story and character. Mortal Kombat (story modes), Street Fighter (lore), Guilty Gear (Strive), Dragon Ball FighterZ.' },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// GROQ API CALL
// ─────────────────────────────────────────────────────────────────────────────
async function callGroq(mediaType, cluster) {
  const prompt = `You are an expert media curator building a comprehensive taste engine database.

Category: ${mediaType}
Aesthetic Cluster: ${cluster.name}
Context: ${cluster.hint}

Generate a list of exactly 25 real, specific ${mediaType} titles that genuinely fit this aesthetic cluster.

CRITICAL RULES:
1. Every title MUST be a real, existing ${mediaType} — no hallucinations
2. Prioritise cult classics, critically acclaimed works, and deep cuts over mainstream mainstream picks
3. Include works from diverse cultural origins (not just American/Japanese) where relevant
4. Do NOT repeat titles that are extremely obvious mainstream picks unless they are genuinely essential to this cluster
5. Titles should span different eras — not just recent releases
6. Return ONLY a raw JSON array. No markdown, no explanation, no code blocks.

Format exactly like this:
[{"title": "Title One", "media_type": "${mediaType}"}, {"title": "Title Two", "media_type": "${mediaType}"}]`;

  const response = await axios.post(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.6,
    },
    {
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    }
  );

  let content = response.data.choices[0].message.content.trim();
  // Strip any markdown code fences if the model ignores instructions
  content = content.replace(/```json/g, '').replace(/```/g, '').trim();
  const start = content.indexOf('[');
  const end = content.lastIndexOf(']');
  if (start === -1 || end === -1) throw new Error('No JSON array found in response');
  return JSON.parse(content.substring(start, end + 1));
}

// ─────────────────────────────────────────────────────────────────────────────
// LOAD EXISTING STATE (Qdrant + massive_seed) to build dedup set
// ─────────────────────────────────────────────────────────────────────────────
function loadExistingKeys() {
  const keys = new Set();

  // From processed_titles.txt (actual Qdrant contents — ground truth)
  if (fs.existsSync(PROCESSED_TITLES_FILE)) {
    const lines = fs.readFileSync(PROCESSED_TITLES_FILE, 'utf8').split('\n');
    for (const line of lines) {
      const m = line.match(/\*\*(.+?)\*\* \((.+?)\)/);
      if (m) {
        keys.add(`${m[2].toLowerCase()}:${m[1].toLowerCase()}`);
      }
    }
    console.log(`[Dedup] Loaded ${keys.size} keys from Qdrant (processed_titles.txt)`);
  } else {
    console.warn('[Dedup] processed_titles.txt not found — run list_qdrant.js first for best dedup');
  }

  // From massive_seed.json (already queued)
  if (fs.existsSync(MASSIVE_SEED_FILE)) {
    const existing = JSON.parse(fs.readFileSync(MASSIVE_SEED_FILE, 'utf8'));
    for (const item of existing) {
      keys.add(`${item.media_type.toLowerCase()}:${item.title.toLowerCase()}`);
    }
    console.log(`[Dedup] After massive_seed.json: ${keys.size} total known keys`);
  }

  return keys;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────
async function run() {
  if (!GROQ_API_KEY) {
    console.error('[ERROR] GROQ_API_KEY not set. Put it in assets/env.local or backend/.env for local runs.');
    process.exit(1);
  }

  // Parse CLI flags
  const args = process.argv.slice(2);
  const categoryFilter = args.includes('--category') ? args[args.indexOf('--category') + 1] : null;
  const dryRun = args.includes('--dry-run');

  // Load existing state
  const existingKeys = loadExistingKeys();

  // Load current massive_seed to append to
  let masterList = [];
  if (fs.existsSync(MASSIVE_SEED_FILE)) {
    masterList = JSON.parse(fs.readFileSync(MASSIVE_SEED_FILE, 'utf8'));
  }

  const startSize = masterList.length;
  console.log(`\n[Start] Current massive_seed size: ${startSize}`);

  // Filter categories if --category flag given
  const categoriesToRun = categoryFilter
    ? Object.entries(CLUSTERS).filter(([cat]) => cat === categoryFilter)
    : Object.entries(CLUSTERS);

  if (dryRun) {
    console.log('\n[DRY RUN] Cluster plan:');
    let total = 0;
    for (const [cat, clusters] of categoriesToRun) {
      console.log(`\n  ${cat} (${clusters.length} clusters × ~25 = ~${clusters.length * 25} titles)`);
      clusters.forEach(c => console.log(`    - ${c.name}`));
      total += clusters.length * 25;
    }
    console.log(`\n  Estimated new titles (before dedup): ~${total}`);
    return;
  }

  // Stats tracking
  const stats = {};
  let totalAdded = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (const [mediaType, clusters] of categoriesToRun) {
    stats[mediaType] = { added: 0, skipped: 0, errors: 0 };
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`  CATEGORY: ${mediaType.toUpperCase()} (${clusters.length} clusters)`);
    console.log(`${'═'.repeat(60)}`);

    for (let i = 0; i < clusters.length; i++) {
      const cluster = clusters[i];
      console.log(`\n  [${i + 1}/${clusters.length}] Cluster: ${cluster.name}`);

      let generated = [];
      try {
        generated = await callGroq(mediaType, cluster);
      } catch (err) {
        console.error(`    ✗ Groq error: ${err.message}`);
        stats[mediaType].errors++;
        totalErrors++;
        await delay(5000); // back off on error
        continue;
      }

      let clusterAdded = 0;
      let clusterSkipped = 0;

      for (const item of generated) {
        if (!item.title || typeof item.title !== 'string') continue;
        const key = `${mediaType.toLowerCase()}:${item.title.toLowerCase()}`;
        if (existingKeys.has(key)) {
          clusterSkipped++;
          continue;
        }
        // Add to master list and mark as known
        masterList.push({ title: item.title.trim(), media_type: mediaType });
        existingKeys.add(key);
        clusterAdded++;
      }

      stats[mediaType].added += clusterAdded;
      stats[mediaType].skipped += clusterSkipped;
      totalAdded += clusterAdded;
      totalSkipped += clusterSkipped;

      console.log(`    ✓ Added: ${clusterAdded} | Already known: ${clusterSkipped} | Total so far: ${masterList.length}`);

      // Save incrementally after every cluster
      fs.writeFileSync(MASSIVE_SEED_FILE, JSON.stringify(masterList, null, 2));

      // Rate limiting — Groq is fast but be polite
      await delay(1200);
    }
  }

  // ── Final Summary ──
  console.log(`\n${'═'.repeat(60)}`);
  console.log('  GENERATION COMPLETE');
  console.log(`${'═'.repeat(60)}`);
  console.log(`  Started with: ${startSize} titles`);
  console.log(`  Ended with:   ${masterList.length} titles`);
  console.log(`  Net added:    ${totalAdded}`);
  console.log(`  Skipped (already known): ${totalSkipped}`);
  console.log(`  Errors:       ${totalErrors}`);
  console.log('\n  Per category:');

  for (const [cat, s] of Object.entries(stats)) {
    console.log(`    ${cat.padEnd(16)} +${String(s.added).padStart(4)} added  |  ${s.skipped} skipped  |  ${s.errors} errors`);
  }

  // Breakdown of final massive_seed by type
  console.log('\n  Final massive_seed.json breakdown:');
  const finalByType = {};
  for (const item of masterList) {
    finalByType[item.media_type] = (finalByType[item.media_type] || 0) + 1;
  }
  for (const [type, count] of Object.entries(finalByType)) {
    console.log(`    ${type.padEnd(16)} ${count}`);
  }
  console.log(`${'═'.repeat(60)}\n`);
}

run().catch(err => {
  console.error('[FATAL]', err.message);
  process.exit(1);
});
