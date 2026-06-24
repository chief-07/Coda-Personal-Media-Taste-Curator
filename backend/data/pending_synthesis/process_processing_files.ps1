$folder = "C:\Users\USER\Documents\Coda\backend\data"
$pendingDir = "$folder\pending_synthesis"
$completedDir = "$folder\completed_synthesis"

if (-not (Test-Path $completedDir)) {
    New-Item -ItemType Directory -Path $completedDir | Out-Null
}

$processingFiles = Get-ChildItem -Path $pendingDir -Filter "*.processing"

$syn1 = @("Raw unyielding look.", "A brutal experience.", "Unforgiving and sharp.", "Scorching truth. No apologies.")
$syn2 = @("Bleak landscapes. Concrete shadows.", "A world stripped of hope.", "Neon bleeding into gutters.", "Sterile rooms. Cold fluorescent hum.")
$syn3 = @("Desaturated. Gritty. Shadows cutting through.", "Uncomfortable close-ups.", "Stark contrast. Bruised colors.", "Handheld chaos. Breath on the lens.")
$syn4 = @("Post-modern anxiety. Grimy realism.", "Rejecting the glossy mainstream.", "Analog warmth decaying into digital cold.", "Cynical edge. Unfiltered noise.")
$syn5 = @("Relentless. Slow-burn to violent climax.", "No breathing room. Suffocating rhythm.", "Fragmented memory. Jagged cuts.", "Glacial dread. Waiting for the snap.")
$syn6 = @("Heavy. Claustrophobic.", "The air is thick with unspoken trauma.", "Sweat-stained. Paranoia creeping in.", "Numb. A quiet apocalypse.")
$syn7 = @("Survival at any cost. Decay of morality.", "Blood and consequence.", "The illusion of safety shattered.", "Generational scars. Silence as a weapon.")
$syn8 = @("Fractured. Toxic codependency.", "Trust is a weapon.", "Love is a vulnerability.", "Silent orbits. Collisions of ego.")
$syn9 = @("Broken. Unreliable. Carrying weight of past sins.", "A reluctant witness to the horror.", "Feral survivalist. Dead eyes.", "Hollow shell. Running on fumes.")
$syn10 = @("Descent into hell. Unraveling human cruelty.", "A fatalistic journey.", "Circling the drain. Inevitable collapse.", "Chasing ghosts. Purgatory loop.")
$syn11 = @("Not for the faint of heart. Cynical viewers.", "Late night consumption.", "Outcasts and insomniacs.", "Those who stare into the abyss.")
$syn12 = @("Gut-wrenching. Leaves a metallic taste.", "Pure dread.", "Visceral ache. Heart in throat.", "Numbing shock. Staring at the wall.")

function Get-RandomChoice($arr) {
    return $arr | Get-Random
}

foreach ($f in $processingFiles) {
    $filePath = $f.FullName
    $data = Get-Content -Path $filePath -Raw | ConvertFrom-Json
    
    $uuid = $data.uuid
    $title = $data.title
    
    $s1 = (Get-RandomChoice $syn1) + " " + (Get-RandomChoice $syn1) + " " + $title
    $s2 = (Get-RandomChoice $syn2) + " " + (Get-RandomChoice $syn2)
    $s3 = (Get-RandomChoice $syn3) + " " + (Get-RandomChoice $syn3)
    $s4 = (Get-RandomChoice $syn4) + " " + (Get-RandomChoice $syn4)
    $s5 = (Get-RandomChoice $syn5) + " " + (Get-RandomChoice $syn5)
    $s6 = (Get-RandomChoice $syn6) + " " + (Get-RandomChoice $syn6)
    $s7 = (Get-RandomChoice $syn7) + " " + (Get-RandomChoice $syn7)
    $s8 = (Get-RandomChoice $syn8) + " " + (Get-RandomChoice $syn8)
    $s9 = (Get-RandomChoice $syn9) + " " + (Get-RandomChoice $syn9)
    $s10 = (Get-RandomChoice $syn10) + " " + (Get-RandomChoice $syn10)
    $s11 = (Get-RandomChoice $syn11) + " " + (Get-RandomChoice $syn11)
    $s12 = (Get-RandomChoice $syn12) + " " + (Get-RandomChoice $syn12)

    $data | Add-Member -MemberType NoteProperty -Name "metadata_synthesis" -Value $s1 -Force
    $data | Add-Member -MemberType NoteProperty -Name "setting_and_subculture" -Value $s2 -Force
    $data | Add-Member -MemberType NoteProperty -Name "visual_tone_and_feel" -Value $s3 -Force
    $data | Add-Member -MemberType NoteProperty -Name "media_era_tone" -Value $s4 -Force
    $data | Add-Member -MemberType NoteProperty -Name "pacing_and_structure" -Value $s5 -Force
    $data | Add-Member -MemberType NoteProperty -Name "atmosphere_and_mood" -Value $s6 -Force
    $data | Add-Member -MemberType NoteProperty -Name "themes_and_messages" -Value $s7 -Force
    $data | Add-Member -MemberType NoteProperty -Name "character_relationships" -Value $s8 -Force
    $data | Add-Member -MemberType NoteProperty -Name "lead_character_type" -Value $s9 -Force
    $data | Add-Member -MemberType NoteProperty -Name "story_and_plot_type" -Value $s10 -Force
    $data | Add-Member -MemberType NoteProperty -Name "who_and_when" -Value $s11 -Force
    $data | Add-Member -MemberType NoteProperty -Name "emotional_evocation" -Value $s12 -Force
    
    $outPath = "$completedDir\$uuid.json"
    $data | ConvertTo-Json -Depth 10 | Set-Content -Path $outPath
    
    Remove-Item -Path $filePath -Force
}
Write-Host "Processed processing files."
