# ==============================================================================
# SunoWave Studio - Servidor Local Cero-Dependencias (.NET HttpListener)
# Sirve la aplicación web estática, actúa como proxy CORS y conversor de audio MP3
# ==============================================================================

param(
    [int]$Port = 8080
)

$HostAddress = "http://localhost:$Port/"
$RootPath = $PSScriptRoot

# Localizar motor de codificación ffmpeg en el sistema
$FFmpegPath = (Get-ChildItem -Path "$env:LOCALAPPDATA\CapCut\Apps" -Filter "ffmpeg.exe" -Recurse -ErrorAction SilentlyContinue | Select-Object -Last 1).FullName
if (-not $FFmpegPath) {
    $FFmpegCmd = Get-Command ffmpeg -ErrorAction SilentlyContinue
    if ($FFmpegCmd) { $FFmpegPath = $FFmpegCmd.Source }
}

$MimeTypes = @{
    ".html" = "text/html; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".js"   = "application/javascript; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".jpeg" = "image/jpeg"
    ".svg"  = "image/svg+xml"
    ".ico"  = "image/x-icon"
}

$Listener = New-Object System.Net.HttpListener
$Listener.Prefixes.Add($HostAddress)

try {
    $Listener.Start()
} catch {
    Write-Host "Puerto $Port ocupado. Probando puerto $($Port + 1)..." -ForegroundColor Yellow
    $Port++
    $HostAddress = "http://localhost:$Port/"
    $Listener = New-Object System.Net.HttpListener
    $Listener.Prefixes.Add($HostAddress)
    $Listener.Start()
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  SunoWave Studio - Servidor Local Iniciado Exitosamente   " -ForegroundColor Green
Write-Host "  URL: $HostAddress" -ForegroundColor White
if ($FFmpegPath) {
    Write-Host "  Motor MP3/AAC activo: $FFmpegPath" -ForegroundColor Magenta
}
Write-Host "  Presiona Ctrl+C para detener el servidor                 " -ForegroundColor Gray
Write-Host "==========================================================" -ForegroundColor Cyan

while ($Listener.IsListening) {
    try {
        $Context = $Listener.GetContext()
        $Request = $Context.Request
        $Response = $Context.Response

        # Encabezados CORS y no-cache
        $Response.AddHeader("Access-Control-Allow-Origin", "*")
        $Response.AddHeader("Access-Control-Allow-Methods", "GET, HEAD, POST, OPTIONS")
        $Response.AddHeader("Access-Control-Allow-Headers", "*")
        $Response.AddHeader("Access-Control-Expose-Headers", "X-Final-Url, Content-Disposition")
        $Response.AddHeader("Cache-Control", "no-cache, no-store, must-revalidate")
        $Response.AddHeader("Pragma", "no-cache")

        if ($Request.HttpMethod -eq "OPTIONS") {
            $Response.StatusCode = 200
            $Response.Close()
            continue
        }

        $RawPath = $Request.Url.AbsolutePath

        # ======================================================================
        # Endpoint de Descarga y Conversión Directa de Audio / Video
        # ======================================================================
        if ($RawPath -eq "/api/download") {
            $TargetUrl = $Request.QueryString["url"]
            $Format = $Request.QueryString["format"]
            $Title = $Request.QueryString["title"]

            if ([string]::IsNullOrWhiteSpace($TargetUrl)) {
                $Response.StatusCode = 400
                $Msg = [System.Text.Encoding]::UTF8.GetBytes('{"error": "Falta parametro url"}')
                $Response.OutputStream.Write($Msg, 0, $Msg.Length)
                $Response.Close()
                continue
            }

            if ([string]::IsNullOrWhiteSpace($Title)) { $Title = "Suno_Track" }
            $SafeTitle = [System.Text.RegularExpressions.Regex]::Replace($Title, '[\\/:*?"<>|]', '_').Trim()
            if ($SafeTitle.Length -gt 70) { $SafeTitle = $SafeTitle.Substring(0, 70) }

            if ($Format -eq "mp3" -and $FFmpegPath -and (Test-Path $FFmpegPath)) {
                $FileName = "$SafeTitle - Suno (320kbps).mp3"
                $Response.ContentType = "audio/mpeg"
                $Response.AddHeader("Content-Disposition", "attachment; filename=`"$FileName`"")
                $Response.StatusCode = 200

                $psi = New-Object System.Diagnostics.ProcessStartInfo
                $psi.FileName = $FFmpegPath
                $psi.Arguments = "-i `"$TargetUrl`" -vn -c:a mp3_mf -b:a 320k -f mp3 pipe:1"
                $psi.UseShellExecute = $false
                $psi.RedirectStandardOutput = $true
                $psi.RedirectStandardError = $true
                $psi.CreateNoWindow = $true

                $proc = [System.Diagnostics.Process]::Start($psi)
                $proc.StandardOutput.BaseStream.CopyTo($Response.OutputStream)
                $proc.WaitForExit(35000)
                $Response.Close()
                continue
            }
            elseif ($Format -eq "m4a" -and $FFmpegPath -and (Test-Path $FFmpegPath)) {
                $FileName = "$SafeTitle - Suno (AAC).m4a"
                $Response.ContentType = "audio/mp4"
                $Response.AddHeader("Content-Disposition", "attachment; filename=`"$FileName`"")
                $Response.StatusCode = 200

                $psi = New-Object System.Diagnostics.ProcessStartInfo
                $psi.FileName = $FFmpegPath
                $psi.Arguments = "-i `"$TargetUrl`" -vn -c:a copy -movflags +frag_keyframe+empty_moov -f mp4 pipe:1"
                $psi.UseShellExecute = $false
                $psi.RedirectStandardOutput = $true
                $psi.RedirectStandardError = $true
                $psi.CreateNoWindow = $true

                $proc = [System.Diagnostics.Process]::Start($psi)
                $proc.StandardOutput.BaseStream.CopyTo($Response.OutputStream)
                $proc.WaitForExit(35000)
                $Response.Close()
                continue
            }
            else {
                # Descarga directa del archivo (MP4 o imagen)
                $Ext = if ($Format -eq "mp4") { "mp4" } else { "bin" }
                $FileName = "$SafeTitle - Suno.$Ext"
                $Response.ContentType = if ($Format -eq "mp4") { "video/mp4" } else { "application/octet-stream" }
                $Response.AddHeader("Content-Disposition", "attachment; filename=`"$FileName`"")
                $Response.StatusCode = 200

                $WebReq = [System.Net.HttpWebRequest]::Create($TargetUrl)
                $WebReq.UserAgent = "Mozilla/5.0"
                $WebResp = $WebReq.GetResponse()
                $Stream = $WebResp.GetResponseStream()
                $Stream.CopyTo($Response.OutputStream)
                $WebResp.Close()
                $Response.Close()
                continue
            }
        }

        # ======================================================================
        # Endpoint de Proxy para metadatos y enlaces cortos
        # ======================================================================
        if ($RawPath -eq "/api/proxy") {
            $TargetUrl = $Request.QueryString["url"]
            if ([string]::IsNullOrWhiteSpace($TargetUrl)) {
                $Response.StatusCode = 400
                $Msg = [System.Text.Encoding]::UTF8.GetBytes('{"error": "Falta parametro url"}')
                $Response.ContentType = "application/json"
                $Response.OutputStream.Write($Msg, 0, $Msg.Length)
                $Response.Close()
                continue
            }

            try {
                $WebReq = [System.Net.HttpWebRequest]::Create($TargetUrl)
                $WebReq.Method = $Request.HttpMethod
                $WebReq.UserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
                $WebReq.Timeout = 12000
                $WebReq.AllowAutoRedirect = $true

                if ($Request.HttpMethod -eq "POST") {
                    if ($Request.ContentType) { $WebReq.ContentType = $Request.ContentType }
                    $Request.InputStream.CopyTo($WebReq.GetRequestStream())
                }

                $WebResp = $WebReq.GetResponse()
                
                $FinalUri = $WebResp.ResponseUri.AbsoluteUri
                $Response.AddHeader("X-Final-Url", $FinalUri)

                $Response.ContentType = $WebResp.ContentType
                $Response.StatusCode = [int]$WebResp.StatusCode
                $Stream = $WebResp.GetResponseStream()
                if ($Request.HttpMethod -ne "HEAD") {
                    $Stream.CopyTo($Response.OutputStream)
                }
                $Stream.Close()
                $WebResp.Close()
            } catch {
                $Response.StatusCode = 502
                $ErrMsg = [System.Text.Encoding]::UTF8.GetBytes('{"error": "Error al consultar Suno: ' + $_.Exception.Message + '"}')
                $Response.ContentType = "application/json"
                if ($Request.HttpMethod -ne "HEAD") {
                    $Response.OutputStream.Write($ErrMsg, 0, $ErrMsg.Length)
                }
            }
            $Response.Close()
            continue
        }

        # ======================================================================
        # Servir archivos estáticos de la aplicación
        # ======================================================================
        $FilePath = $RawPath.TrimStart('/')
        if ([string]::IsNullOrWhiteSpace($FilePath)) {
            $FilePath = "index.html"
        }

        $LocalFile = Join-Path $RootPath $FilePath

        if (Test-Path $LocalFile -PathType Leaf) {
            $Ext = [System.IO.Path]::GetExtension($LocalFile).ToLower()
            $ContentType = $MimeTypes[$Ext]
            if (-not $ContentType) { $ContentType = "application/octet-stream" }

            $FileBytes = [System.IO.File]::ReadAllBytes($LocalFile)
            $Response.ContentType = $ContentType
            $Response.ContentLength64 = $FileBytes.Length
            $Response.StatusCode = 200
            if ($Request.HttpMethod -ne "HEAD") {
                $Response.OutputStream.Write($FileBytes, 0, $FileBytes.Length)
            }
        } else {
            $Response.StatusCode = 404
            $NotFoundMsg = [System.Text.Encoding]::UTF8.GetBytes("Archivo no encontrado: $FilePath")
            $Response.ContentType = "text/plain; charset=utf-8"
            if ($Request.HttpMethod -ne "HEAD") {
                $Response.OutputStream.Write($NotFoundMsg, 0, $NotFoundMsg.Length)
            }
        }

        $Response.Close()
    } catch {
        # Silenciar excepciones normales de conexión
    }
}
