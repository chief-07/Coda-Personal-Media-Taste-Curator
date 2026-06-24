$folder = "C:\Users\USER\Documents\Coda\backend\data\pending_synthesis"
$files = Get-ChildItem -Path $folder -Filter "*.processing"
foreach ($f in $files) {
    $newName = $f.Name -replace "\.processing$", ""
    Rename-Item -Path $f.FullName -NewName $newName
}
