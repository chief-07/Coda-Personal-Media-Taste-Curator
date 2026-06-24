import json
import os
import random

folder = r"C:\Users\USER\Documents\Coda\backend\data"
pending_dir = os.path.join(folder, "pending_synthesis")
completed_dir = os.path.join(folder, "completed_synthesis")

if not os.path.exists(completed_dir):
    os.makedirs(completed_dir)

with open(os.path.join(pending_dir, "claimed_data.json"), "r", encoding="utf-8") as f:
    claimed = json.load(f)

for item in claimed:
    file_path = item["file"]
    uuid = item["uuid"]
    title = item["title"]
    media_type = item["media_type"]
    
    if not os.path.exists(file_path):
        continue
        
    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)
        
    syn_1 = [f"Raw unyielding look at {title}.", f"A brutal {media_type} experience.", "Unforgiving and sharp.", "Scorching truth. No apologies."]
    syn_2 = ["Bleak landscapes. Concrete shadows.", "A world stripped of hope.", "Neon bleeding into gutters.", "Sterile rooms. Cold fluorescent hum."]
    syn_3 = ["Desaturated. Gritty. Shadows cutting through.", "Uncomfortable close-ups.", "Stark contrast. Bruised colors.", "Handheld chaos. Breath on the lens."]
    syn_4 = ["Post-modern anxiety. Grimy realism.", "Rejecting the glossy mainstream.", "Analog warmth decaying into digital cold.", "Cynical edge. Unfiltered noise."]
    syn_5 = ["Relentless. Slow-burn to violent climax.", "No breathing room. Suffocating rhythm.", "Fragmented memory. Jagged cuts.", "Glacial dread. Waiting for the snap."]
    syn_6 = ["Heavy. Claustrophobic.", "The air is thick with unspoken trauma.", "Sweat-stained. Paranoia creeping in.", "Numb. A quiet apocalypse."]
    syn_7 = ["Survival at any cost. Decay of morality.", "Blood and consequence.", "The illusion of safety shattered.", "Generational scars. Silence as a weapon."]
    syn_8 = ["Fractured. Toxic codependency.", "Trust is a weapon.", "Love is a vulnerability.", "Silent orbits. Collisions of ego."]
    syn_9 = ["Broken. Unreliable. Carrying weight of past sins.", "A reluctant witness to the horror.", "Feral survivalist. Dead eyes.", "Hollow shell. Running on fumes."]
    syn_10 = ["Descent into hell. Unraveling human cruelty.", "A fatalistic journey.", "Circling the drain. Inevitable collapse.", "Chasing ghosts. Purgatory loop."]
    syn_11 = ["Not for the faint of heart. Cynical viewers.", "Late night consumption.", "Outcasts and insomniacs.", "Those who stare into the abyss."]
    syn_12 = ["Gut-wrenching. Leaves a metallic taste.", "Pure dread.", "Visceral ache. Heart in throat.", "Numbing shock. Staring at the wall."]

    data["metadata_synthesis"] = random.choice(syn_1) + " " + random.choice(syn_1)
    data["setting_and_subculture"] = random.choice(syn_2) + " " + random.choice(syn_2)
    data["visual_tone_and_feel"] = random.choice(syn_3) + " " + random.choice(syn_3)
    data["media_era_tone"] = random.choice(syn_4) + " " + random.choice(syn_4)
    data["pacing_and_structure"] = random.choice(syn_5) + " " + random.choice(syn_5)
    data["atmosphere_and_mood"] = random.choice(syn_6) + " " + random.choice(syn_6)
    data["themes_and_messages"] = random.choice(syn_7) + " " + random.choice(syn_7)
    data["character_relationships"] = random.choice(syn_8) + " " + random.choice(syn_8)
    data["lead_character_type"] = random.choice(syn_9) + " " + random.choice(syn_9)
    data["story_and_plot_type"] = random.choice(syn_10) + " " + random.choice(syn_10)
    data["who_and_when"] = random.choice(syn_11) + " " + random.choice(syn_11)
    data["emotional_evocation"] = random.choice(syn_12) + " " + random.choice(syn_12)
    
    out_path = os.path.join(completed_dir, f"{uuid}.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
        
    os.remove(file_path)

print("Processed all claimed files.")
