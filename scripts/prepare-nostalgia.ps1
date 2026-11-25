# Rebuild display copies from the supplied family albums. Originals stay untouched.
# Run from any directory: powershell -File scripts/prepare-nostalgia.ps1
param([string]$PhotoId)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$projectRoot = Split-Path -Parent $PSScriptRoot
$sourceRoot = Join-Path $projectRoot 'Nostalgia'
$outputRoot = Join-Path $projectRoot 'public/images/nostalgia'
[System.IO.Directory]::CreateDirectory($outputRoot) | Out-Null

# Resolve the two non-ASCII source filenames by their unambiguous prefixes.
$homePhoto = @(Get-ChildItem -LiteralPath (Join-Path $sourceRoot 'Anand') -Filter '*.png' | Where-Object { $_.Name -notmatch '^[A-Za-z]' })
$terracePhoto = @(Get-ChildItem -LiteralPath (Join-Path $sourceRoot 'Susmita') -Filter 'Toddler*.png')
if ($homePhoto.Count -ne 1 -or $terracePhoto.Count -ne 1) { throw 'Expected one kitchen scene and one toddler terrace source photo.' }
$photos = @(
  @{ Id = 'anand-little-gentleman'; File = 'Anand/Vintage Boy in Embroidered Suit.png' },
  @{ Id = 'anand-birthday'; File = 'Anand/Restored South Asian Birthday Celebration.png' },
  @{ Id = 'anand-kitchen'; File = 'Anand/Candid Family Moment in the Kitchen.png' },
  @{ Id = 'anand-family'; File = 'Anand/Classic Family Portrait in Teal Studio.png' },
  @{ Id = 'anand-home'; File = 'Anand/' + $homePhoto[0].Name },
  @{ Id = 'anand-school'; File = 'Anand/PXL_20261125_082105671.RAW-01.MP.jpg' },
  @{ Id = 'susmita-flowers'; File = 'Susmita/Nostalgic Girl with Floral Stand.png' },
  @{ Id = 'susmita-terrace'; File = 'Susmita/' + $terracePhoto[0].Name },
  @{ Id = 'susmita-festive'; File = 'Susmita/Children in Festive Studio Portrait.png' },
  @{ Id = 'susmita-balcony'; File = 'Susmita/Restored Vintage Balcony Portrait.png' },
  @{ Id = 'susmita-yellow'; File = 'Susmita/Veiled Girl in Yellow on Blue.png'; Rotate = $true },
  @{ Id = 'susmita-puppy'; File = 'Susmita/Vintage Family Snapshot with Puppy and Toddler.png' },
  @{ Id = 'susmita-singing'; File = 'Susmita/Young Singer at a Cultural Gathering.png'; Rotate = $true }
)
if ($PhotoId) {
  $photos = @($photos | Where-Object { $_.Id -eq $PhotoId })
  if (-not $photos.Count) { throw "Unknown album photo: $PhotoId" }
}
$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$quality = [System.Drawing.Imaging.EncoderParameters]::new(1)
$quality.Param[0] = [System.Drawing.Imaging.EncoderParameter]::new([System.Drawing.Imaging.Encoder]::Quality, [long]86)
$totalOriginalBytes = 0L
$totalOutputBytes = 0L
try {
  foreach ($photo in $photos) {
    $sourcePath = Join-Path $sourceRoot $photo.File
    $totalOriginalBytes += (Get-Item -LiteralPath $sourcePath).Length
    $source = [System.Drawing.Image]::FromFile($sourcePath)
    try {
      if ($photo.Rotate) { $source.RotateFlip([System.Drawing.RotateFlipType]::Rotate270FlipNone) }
      foreach ($size in @(480, 960, 1600)) {
        $scale = [Math]::Min([double]1, [double]($size / [double]$source.Width))
        $width = [Math]::Max(1, [int][Math]::Round($source.Width * $scale))
        $height = [Math]::Max(1, [int][Math]::Round($source.Height * $scale))
        $bitmap = [System.Drawing.Bitmap]::new($width, $height)
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        try {
          $graphics.Clear([System.Drawing.Color]::White)
          $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
          $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
          $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
          $graphics.DrawImage($source, 0, 0, $width, $height)
          $suffix = if ($size -eq 1600) { '' } else { '-' + $size }
          $outputPath = Join-Path $outputRoot ($photo.Id + $suffix + '.jpg')
          $bitmap.Save($outputPath, $codec, $quality)
          $totalOutputBytes += (Get-Item -LiteralPath $outputPath).Length
        } finally { $graphics.Dispose(); $bitmap.Dispose() }
      }
      Write-Output ('Prepared {0} ({1} x {2})' -f $photo.Id, $source.Width, $source.Height)
    } finally { $source.Dispose() }
  }
} finally { $quality.Dispose() }
Write-Output ('Originals: {0:N1} MB; all three display sizes: {1:N1} MB' -f ($totalOriginalBytes / 1MB), ($totalOutputBytes / 1MB))
