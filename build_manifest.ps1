$baseDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$stagesDir = Join-Path $baseDir 'stages'
$files = Get-ChildItem -Path $stagesDir -Filter '*.json' | Where-Object { $_.Name -ne 'campaign.json' -and $_.Name -ne 'manifest.json' }
$result = @()
foreach ($f in $files) {
    try {
        $content = Get-Content $f.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
        $result += @{
            filename  = $f.Name
            title     = if ($content.title) { $content.title } else { $f.BaseName }
            createdAt = $f.CreationTime.ToString('yyyy-MM-dd HH:mm:ss')
            sizeBytes = $f.Length
            data      = $content
        }
    } catch {}
}
$stagesJson = @()
foreach ($s in $result) {
    $dataJson = $s.data | ConvertTo-Json -Depth 20 -Compress
    $stagesJson += '{"filename":"' + $s.filename + '","title":"' + ($s.title -replace '"','\"') + '","createdAt":"' + $s.createdAt + '","sizeBytes":' + $s.sizeBytes + ',"data":' + $dataJson + '}'
}
$manifest = '{"ok":true,"count":' + $result.Count + ',"stages":[' + ($stagesJson -join ',') + ']}'
[System.IO.File]::WriteAllText((Join-Path $stagesDir 'manifest.json'), $manifest, [System.Text.Encoding]::UTF8)
Write-Output ("Manifest created with " + $result.Count + " stages in " + (Join-Path $stagesDir 'manifest.json'))
