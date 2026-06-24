$folder = "C:\Users\USER\Documents\Coda\backend\data\pending_synthesis"
$files = Get-ChildItem -Path $folder -Filter "*.json" | Where-Object { $_.Name -notmatch "\.processing$" -and $_.Name -notmatch "claimed_data" }
$data = @()
foreach ($f in $files) {
    $newName = $f.FullName + ".processing"
    Rename-Item -Path $f.FullName -NewName $newName -ErrorAction SilentlyContinue
    if (Test-Path $newName) {
        $content = Get-Content -Path $newName -Raw | ConvertFrom-Json
        $data += @{
            file = $newName
            title = $content.title
            media_type = $content.media_type
            uuid = $content.uuid
        }
    }
}
$data | ConvertTo-Json | Set-Content -Path "$folder\claimed_data.json"
