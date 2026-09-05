# ============================================================
# SunoWave Studio - Creador de Acceso Directo en Escritorio
# ============================================================

$AppDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$StartBat = Join-Path $AppDir "start.bat"
$IconSrc  = Join-Path $AppDir "assets\icon.ico"
$Desktop  = [System.Environment]::GetFolderPath("Desktop")
$ShortcutPath = Join-Path $Desktop "SunoWave Studio.lnk"

# -------- Convertir JPG a ICO usando PowerShell + .NET --------
function Convert-JpgToIco {
    param([string]$JpgPath, [string]$IcoPath)
    Add-Type -AssemblyName System.Drawing
    $sizes = @(256, 64, 48, 32, 16)
    $bitmaps = @()
    $original = [System.Drawing.Image]::FromFile($JpgPath)
    foreach ($size in $sizes) {
        $bmp = New-Object System.Drawing.Bitmap($size, $size)
        $g   = [System.Drawing.Graphics]::FromImage($bmp)
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.DrawImage($original, 0, 0, $size, $size)
        $g.Dispose()
        $bitmaps += $bmp
    }
    $original.Dispose()
    $ms = New-Object System.IO.MemoryStream
    $writer = New-Object System.IO.BinaryWriter($ms)
    $writer.Write([uint16]0)
    $writer.Write([uint16]1)
    $writer.Write([uint16]$bitmaps.Count)
    $offset = 6 + ($bitmaps.Count * 16)
    $pngData = @()
    foreach ($bmp in $bitmaps) {
        $pngStream = New-Object System.IO.MemoryStream
        $bmp.Save($pngStream, [System.Drawing.Imaging.ImageFormat]::Png)
        $bytes = $pngStream.ToArray()
        $pngStream.Dispose()
        $pngData += ,$bytes
    }
    for ($i = 0; $i -lt $bitmaps.Count; $i++) {
        $size = $sizes[$i]
        $sz   = if ($size -eq 256) { 0 } else { $size }
        $writer.Write([byte]$sz)
        $writer.Write([byte]$sz)
        $writer.Write([byte]0)
        $writer.Write([byte]0)
        $writer.Write([uint16]1)
        $writer.Write([uint16]32)
        $writer.Write([uint32]$pngData[$i].Length)
        $writer.Write([uint32]$offset)
        $offset += $pngData[$i].Length
    }
    foreach ($data in $pngData) { $writer.Write($data) }
    $writer.Flush()
    [System.IO.File]::WriteAllBytes($IcoPath, $ms.ToArray())
    $ms.Dispose()
    foreach ($bmp in $bitmaps) { $bmp.Dispose() }
    Write-Host "  [OK] Icono creado: $IcoPath" -ForegroundColor Green
}

Write-Host ""
Write-Host "  Buscando icono de la app..." -ForegroundColor Cyan

$ArtifactIcon = "C:\Users\Usuario\.gemini\antigravity-ide\brain\ccd5458e-f8d6-4bee-9f37-9e1effbb4c21\sunowave_icon_1788588957971.jpg"
$destJpg = Join-Path $AppDir "assets\icon.jpg"

if (-not (Test-Path $destJpg)) {
    if (Test-Path $ArtifactIcon) {
        Copy-Item $ArtifactIcon $destJpg -Force
        Write-Host "  [OK] Icono copiado" -ForegroundColor Green
    }
}

if (Test-Path $destJpg) {
    Write-Host "  Convirtiendo a formato ICO..." -ForegroundColor Cyan
    Convert-JpgToIco -JpgPath $destJpg -IcoPath $IconSrc
} else {
    Write-Host "  [!] No se encontro imagen. Usando icono por defecto." -ForegroundColor Yellow
    $IconSrc = $null
}

Write-Host "  Creando acceso directo en el Escritorio..." -ForegroundColor Cyan
$WScriptShell = New-Object -ComObject WScript.Shell
$Shortcut = $WScriptShell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath       = $StartBat
$Shortcut.WorkingDirectory = $AppDir
$Shortcut.Description      = "SunoWave Studio - Descargador de canciones Suno AI"
$Shortcut.WindowStyle      = 1

if ($IconSrc -and (Test-Path $IconSrc)) {
    $Shortcut.IconLocation = "$IconSrc,0"
}
$Shortcut.Save()

Write-Host ""
Write-Host "  ================================================" -ForegroundColor Green
Write-Host "   Acceso directo creado exitosamente!" -ForegroundColor Green
Write-Host "   Busca 'SunoWave Studio' en tu Escritorio" -ForegroundColor Green
Write-Host "  ================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Presiona cualquier tecla para cerrar..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
