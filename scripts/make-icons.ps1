# Generates the PWA icons (public/icons/*.png) with System.Drawing (Windows PowerShell).
# Re-run only if you want to change the icon: powershell -File scripts/make-icons.ps1
Add-Type -AssemblyName System.Drawing
$out = Join-Path $PSScriptRoot '..\public\icons'
New-Item -ItemType Directory -Force $out | Out-Null

function New-Icon([int]$size, [string]$name, [double]$inset, [bool]$rounded) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.TextRenderingHint = 'AntiAliasGridFit'
  $g.Clear([System.Drawing.Color]::Transparent)
  $red = [System.Drawing.Color]::FromArgb(255, 185, 28, 28)
  $brush = New-Object System.Drawing.SolidBrush $red
  if ($rounded) {
    $r = [int]($size * 0.22)
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddArc(0, 0, $r * 2, $r * 2, 180, 90)
    $path.AddArc($size - $r * 2, 0, $r * 2, $r * 2, 270, 90)
    $path.AddArc($size - $r * 2, $size - $r * 2, $r * 2, $r * 2, 0, 90)
    $path.AddArc(0, $size - $r * 2, $r * 2, $r * 2, 90, 90)
    $path.CloseFigure()
    $g.FillPath($brush, $path)
  } else {
    $g.FillRectangle($brush, 0, 0, $size, $size)
  }
  # 田字格 guide lines
  $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(70, 255, 255, 255)), ([float]($size / 96))
  $pen.DashStyle = 'Dash'
  $pad = $size * $inset
  $g.DrawRectangle($pen, [float]$pad, [float]$pad, [float]($size - 2 * $pad), [float]($size - 2 * $pad))
  $g.DrawLine($pen, [float]($size / 2), [float]$pad, [float]($size / 2), [float]($size - $pad))
  $g.DrawLine($pen, [float]$pad, [float]($size / 2), [float]($size - $pad), [float]($size / 2))
  # 字 in a CJK font
  $fontName = 'Microsoft YaHei'
  $font = New-Object System.Drawing.Font $fontName, ([float](($size - 2 * $pad) * 0.62)), ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
  $fmt = New-Object System.Drawing.StringFormat
  $fmt.Alignment = 'Center'
  $fmt.LineAlignment = 'Center'
  $rect = New-Object System.Drawing.RectangleF 0, ([float]($size * 0.02)), $size, $size
  $g.DrawString([string][char]0x5B57, $font, [System.Drawing.Brushes]::White, $rect, $fmt)
  $bmp.Save((Join-Path $out $name), [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
}

New-Icon 192 'icon-192.png' 0.16 $true
New-Icon 512 'icon-512.png' 0.16 $true
New-Icon 512 'maskable-512.png' 0.24 $false
New-Icon 180 'apple-touch-icon.png' 0.16 $false
New-Icon 64 'favicon-64.png' 0.12 $true
Write-Output "icons written to $out"
