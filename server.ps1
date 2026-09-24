param([int]$port = 8080)

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$($port)/")
try {
    $listener.Start()
} catch {
    Write-Error "Failed to start listener on port $($port): $($_.Exception.Message)"
    exit 1
}

Write-Host "HTTP Server listening on http://localhost:$($port)/"
Write-Host "  -> stages/ API enabled (GET /api/stages, POST /api/stages/save, DELETE /api/stages/<file>)"
$baseDir = $PSScriptRoot

$mimeTypes = @{
    ".html" = "text/html; charset=utf-8"
    ".htm"  = "text/html; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".js"   = "application/javascript; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".jpeg" = "image/jpeg"
    ".svg"  = "image/svg+xml"
    ".ico"  = "image/x-icon"
    ".wav"  = "audio/wav"
    ".mp3"  = "audio/mpeg"
    ".webp" = "image/webp"
    ".gif"  = "image/gif"
}

function Send-JsonStr($response, [int]$statusCode, [string]$jsonStr) {
    $response.StatusCode = $statusCode
    $response.ContentType = "application/json; charset=utf-8"
    $response.Headers.Add("Access-Control-Allow-Origin", "*")
    $buffer = [System.Text.Encoding]::UTF8.GetBytes($jsonStr)
    $response.ContentLength64 = $buffer.Length
    $response.OutputStream.Write($buffer, 0, $buffer.Length)
    $response.Close()
}

function Send-Text($response, [int]$statusCode, [string]$text) {
    $response.StatusCode = $statusCode
    $response.ContentType = "text/plain; charset=utf-8"
    $response.Headers.Add("Access-Control-Allow-Origin", "*")
    $buffer = [System.Text.Encoding]::UTF8.GetBytes($text)
    $response.ContentLength64 = $buffer.Length
    $response.OutputStream.Write($buffer, 0, $buffer.Length)
    $response.Close()
}

while ($listener.IsListening) {
    try {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        $localPath = $request.Url.LocalPath
        $method = $request.HttpMethod

        # --- CORS Preflight ---
        if ($method -eq "OPTIONS") {
            $response.StatusCode = 204
            $response.Headers.Add("Access-Control-Allow-Origin", "*")
            $response.Headers.Add("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
            $response.Headers.Add("Access-Control-Allow-Headers", "Content-Type")
            $response.Close()
            continue
        }

        # ========== API: GET /api/stages ==========
        # Returns list of all .json files in stages/ folder (except campaign.json)
        if ($method -eq "GET" -and $localPath -eq "/api/stages") {
            $stagesDir = [System.IO.Path]::Combine($baseDir, "stages")
            $result = @()
            if ([System.IO.Directory]::Exists($stagesDir)) {
                $files = Get-ChildItem -Path $stagesDir -Filter "*.json" | Where-Object { $_.Name -ne "campaign.json" } | Sort-Object Name
                foreach ($f in $files) {
                    try {
                        $content = [System.IO.File]::ReadAllText($f.FullName, [System.Text.Encoding]::UTF8)
                        $parsed = $content | ConvertFrom-Json
                        $result += @{
                            filename  = $f.Name
                            title     = if ($parsed.title) { $parsed.title } else { $f.BaseName }
                            createdAt = $f.CreationTime.ToString("yyyy-MM-dd HH:mm:ss")
                            sizeBytes = $f.Length
                            data      = $parsed
                        }
                    } catch {
                        $result += @{
                            filename  = $f.Name
                            title     = $f.BaseName
                            createdAt = $f.CreationTime.ToString("yyyy-MM-dd HH:mm:ss")
                            sizeBytes = $f.Length
                            error     = "parse_error"
                        }
                    }
                }
            }
            # Build JSON manually to avoid ConvertTo-Json depth issues
            $stagesJson = @()
            foreach ($s in $result) {
                $dataJson = if ($s.data) { $s.data | ConvertTo-Json -Depth 20 -Compress } else { '{}' }
                $errPart = if ($s.error) { ',"error":"' + $s.error + '"' } else { '' }
                $stagesJson += '{"filename":"' + $s.filename + '","title":"' + ($s.title -replace '"','\"') + '","createdAt":"' + $s.createdAt + '","sizeBytes":' + $s.sizeBytes + ',"data":' + $dataJson + $errPart + '}'
            }
            $responseJson = '{"ok":true,"count":' + $result.Count + ',"stages":[' + ($stagesJson -join ',') + ']}'
            Send-JsonStr $response 200 $responseJson
            continue
        }

        # ========== API: POST /api/stages/save ==========
        # Saves stage JSON to stages/ folder with datetime naming
        if ($method -eq "POST" -and $localPath -eq "/api/stages/save") {
            $stagesDir = [System.IO.Path]::Combine($baseDir, "stages")
            if (-not [System.IO.Directory]::Exists($stagesDir)) {
                [System.IO.Directory]::CreateDirectory($stagesDir) | Out-Null
            }

            # Read POST body using content length
            $contentLen = [int]$request.ContentLength64
            if ($contentLen -le 0) { $contentLen = 0 }
            $bodyBytes = New-Object byte[] $contentLen
            $bytesRead = 0
            while ($bytesRead -lt $contentLen) {
                $n = $request.InputStream.Read($bodyBytes, $bytesRead, $contentLen - $bytesRead)
                if ($n -le 0) { break }
                $bytesRead += $n
            }
            $body = [System.Text.Encoding]::UTF8.GetString($bodyBytes, 0, $bytesRead).Trim([char]0xFEFF).Trim()

            if ([string]::IsNullOrWhiteSpace($body)) {
                Send-JsonStr $response 400 '{"ok":false,"error":"Empty request body"}'
                continue
            }

            try {
                $parsed = $body | ConvertFrom-Json
            } catch {
                Write-Host "[ERROR] JSON parse failed: $($_.Exception.Message)"
                Send-JsonStr $response 400 '{"ok":false,"error":"Invalid JSON"}'
                continue
            }

            # Check if a specific filename was requested
            $requestedFilename = $null
            if ($parsed.PSObject.Properties["_saveFilename"]) {
                $requestedFilename = $parsed._saveFilename
                # Remove _saveFilename from body using regex to avoid ConvertTo-Json re-serialization
                $body = $body -replace ',?\s*"_saveFilename"\s*:\s*"[^"]*"\s*,?', ''
                $body = $body -replace '{\s*,', '{' -replace ',\s*}', '}'
            }

            if ($requestedFilename) {
                $filename = $requestedFilename
            } else {
                # Generate datetime-based filename
                $now = Get-Date -Format "yyyyMMdd_HHmmss"
                $titleSlug = ""
                if ($parsed.title) {
                    $cleanTitle = [System.Text.RegularExpressions.Regex]::Replace($parsed.title, "[^\w]", "_")
                    $cleanTitle = [System.Text.RegularExpressions.Regex]::Replace($cleanTitle, "_+", "_")
                    if ($cleanTitle.Length -gt 30) { $cleanTitle = $cleanTitle.Substring(0, 30) }
                    $titleSlug = "_" + $cleanTitle.Trim('_')
                }
                $filename = "stage_${now}${titleSlug}.json"
            }

            $filePath = [System.IO.Path]::Combine($stagesDir, $filename)

            # Security: ensure path is inside stagesDir
            $fullPath = [System.IO.Path]::GetFullPath($filePath)
            if (-not $fullPath.StartsWith([System.IO.Path]::GetFullPath($stagesDir))) {
                Send-JsonStr $response 403 '{"ok":false,"error":"Path traversal blocked"}'
                continue
            }

            [System.IO.File]::WriteAllText($filePath, $body, [System.Text.Encoding]::UTF8)
            Write-Host "[SAVE] $filename ($(($body).Length) bytes)"

            $safeFilename = $filename -replace '"', '\"'
            Send-JsonStr $response 200 ('{"ok":true,"filename":"' + $safeFilename + '","path":"stages/' + $safeFilename + '"}')
            continue
        }

        # ========== API: DELETE /api/stages/<filename> ==========
        if ($method -eq "DELETE" -and $localPath -match "^/api/stages/(.+)$") {
            $filename = $Matches[1]
            $stagesDir = [System.IO.Path]::Combine($baseDir, "stages")
            $filePath = [System.IO.Path]::Combine($stagesDir, $filename)

            # Security check
            $fullPath = [System.IO.Path]::GetFullPath($filePath)
            if (-not $fullPath.StartsWith([System.IO.Path]::GetFullPath($stagesDir))) {
                Send-JsonStr $response 403 '{"ok":false,"error":"Path traversal blocked"}'
                continue
            }

            # Prevent deleting campaign.json
            if ($filename -eq "campaign.json") {
                Send-JsonStr $response 403 '{"ok":false,"error":"Cannot delete campaign.json"}'
                continue
            }

            if ([System.IO.File]::Exists($filePath)) {
                [System.IO.File]::Delete($filePath)
                Write-Host "[DELETE] $filename"
                $safeDel = $filename -replace '"', '\"'
                Send-JsonStr $response 200 ('{"ok":true,"deleted":"' + $safeDel + '"}')
            } else {
                Send-JsonStr $response 404 '{"ok":false,"error":"File not found"}'
            }
            continue
        }

        # ========== API: POST /api/campaign/save ==========
        # Saves full campaign.json to stages/ folder
        if ($method -eq "POST" -and $localPath -eq "/api/campaign/save") {
            $stagesDir = [System.IO.Path]::Combine($baseDir, "stages")
            if (-not [System.IO.Directory]::Exists($stagesDir)) {
                [System.IO.Directory]::CreateDirectory($stagesDir) | Out-Null
            }

            # Read POST body using content length
            $contentLen = [int]$request.ContentLength64
            if ($contentLen -le 0) { $contentLen = 0 }
            $bodyBytes = New-Object byte[] $contentLen
            $bytesRead = 0
            while ($bytesRead -lt $contentLen) {
                $n = $request.InputStream.Read($bodyBytes, $bytesRead, $contentLen - $bytesRead)
                if ($n -le 0) { break }
                $bytesRead += $n
            }
            $body = [System.Text.Encoding]::UTF8.GetString($bodyBytes, 0, $bytesRead).Trim([char]0xFEFF).Trim()

            if ([string]::IsNullOrWhiteSpace($body)) {
                Send-JsonStr $response 400 '{"ok":false,"error":"Empty request body"}'
                continue
            }

            $filePath = [System.IO.Path]::Combine($stagesDir, "campaign.json")
            [System.IO.File]::WriteAllText($filePath, $body, [System.Text.Encoding]::UTF8)
            Write-Host "[CAMPAIGN SAVE] campaign.json ($(($body).Length) bytes)"

            Send-JsonStr $response 200 '{"ok":true,"filename":"campaign.json"}'
            continue
        }

        # ========== Static File Serving ==========
        $staticPath = $localPath.TrimStart('/')
        if ([string]::IsNullOrEmpty($staticPath)) { $staticPath = "index.html" }
        $filePath = [System.IO.Path]::Combine($baseDir, $staticPath.Replace('/', [System.IO.Path]::DirectorySeparatorChar))

        # Security: ensure file is inside baseDir
        $fullPath = [System.IO.Path]::GetFullPath($filePath)
        if (-not $fullPath.StartsWith([System.IO.Path]::GetFullPath($baseDir))) {
            $response.StatusCode = 403
            $response.Close()
            continue
        }

        if ([System.IO.File]::Exists($filePath)) {
            $bytes = [System.IO.File]::ReadAllBytes($filePath)
            $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
            $contentType = if ($mimeTypes.ContainsKey($ext)) { $mimeTypes[$ext] } else { "application/octet-stream" }
            $response.ContentType = $contentType
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $response.StatusCode = 404
            $buffer = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
            $response.OutputStream.Write($buffer, 0, $buffer.Length)
        }
        $response.Close()
    } catch {
        Write-Host "[EXCEPTION] $($_.Exception.GetType().FullName): $($_.Exception.Message)"
        Write-Host "[EXCEPTION STACK] $($_.ScriptStackTrace)"
        try {
            if ($response) {
                $response.StatusCode = 500
                $response.Close()
            }
        } catch {}
    }
}
