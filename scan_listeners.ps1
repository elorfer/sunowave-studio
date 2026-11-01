$app = Get-Content "C:\Users\Usuario\.gemini\antigravity-ide\scratch\suno-downloader\js\app.js"
$html = Get-Content "C:\Users\Usuario\.gemini\antigravity-ide\scratch\suno-downloader\index.html" -Raw

for ($i = 0; $i -lt $app.Count; $i++) {
    $line = $app[$i]
    if ($line -match '([a-zA-Z0-9_]+)\.addEventListener\(') {
        $varName = $matches[1]
        $prev = if ($i -gt 0) { $app[$i-1].Trim() } else { "" }
        $prev2 = if ($i -gt 1) { $app[$i-2].Trim() } else { "" }
        $hasGuard = ($line -match "if\s*\(\s*$varName\s*\)") -or ($prev -match "if\s*\(\s*$varName\s*\)") -or ($prev2 -match "if\s*\(\s*$varName\s*\)")
        if (-not $hasGuard) {
            Write-Host "NO GUARD at line $($i+1): $varName in line: $($line.Trim())"
        }
    }
}
