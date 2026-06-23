# ═══════════════════════════════════════════════════════════════════
#  Smusic — Full Proxy Health Check Script
#  HOW TO RUN (from project root):
#
#    powershell -ExecutionPolicy Bypass -File test-proxies.ps1
#
#  WHAT IT TESTS:
#    [1] TIDAL Auth token (auth.tidal.com)
#    [2] TIDAL Relay URLs (td.if-it-runs-ship-it, tidal-proxy.monochrome.tf)
#    [3] Uptime Worker endpoints (tells the app which mirrors are live)
#    [4] TIDAL Community Mirrors — search path (metadata only)
#    [5] TIDAL Mirror stream path (the one that actually serves audio)
#    [6] Qobuz proxy — PRIMARY full-song source
#    [7] Deezer proxy — SECONDARY full-song source
#    [8] Amazon Music proxies (t2a + amz.geeked.wtf)
#    [9] Lyrics + Last.fm recommendation services
#
#  HOW TO READ RESULTS:
#    [OK]        = ✅ Working — this source is available
#    [HTTP 403]  = Server alive but rejected — account banned / auth issue
#    [HTTP 404]  = Server alive but path not found
#    [HTTP 502]  = Server alive but upstream is down (e.g. Qobuz backend)
#    [DOWN]      = Server unreachable / DNS dead / timeout
#
#  IF YOU GET 30-SECOND PREVIEWS:
#    Run this script. If [6] Qobuz and [7] Deezer are both DOWN/502,
#    AND [8] Amazon shows DOWN — that's why. Wait for them to recover
#    or complete the Amazon Turnstile challenge in the app.
#
#  WHEN TO RUN:
#    - Whenever songs are playing as 30-second previews
#    - After updating the mirror list in the code
#    - Periodically (weekly) to track which mirrors are still alive
# ═══════════════════════════════════════════════════════════════════

$global:token = $null

function Test-Url {
    param([string]$Label, [string]$Url, [hashtable]$Headers = @{}, [string]$Method = 'GET', [int]$Timeout = 10)
    try {
        $params = @{
            Uri             = $Url
            Method          = $Method
            UseBasicParsing = $true
            TimeoutSec      = $Timeout
            ErrorAction     = 'Stop'
        }
        if ($Headers.Count -gt 0) { $params.Headers = $Headers }
        $r = Invoke-WebRequest @params
        return @{ Ok = $true; Code = $r.StatusCode; Content = $r.Content }
    } catch {
        $code = $_.Exception.Response.StatusCode.value__
        return @{ Ok = $false; Code = $code; Error = $_.Exception.Message }
    }
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  SMUSIC PROXY HEALTH CHECK" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan

# ─── 1. TIDAL Auth ───────────────────────────────────────────────────────────
Write-Host "`n[1] TIDAL Auth Token (auth.tidal.com)" -ForegroundColor Yellow
$body = "grant_type=client_credentials&client_id=txNoH4kkV41MfH25&client_secret=dQjy0MinCEvxi1O4UmxvxWnDjt4cgHBPw8ll6nYBk98="
try {
    $tokenResp = Invoke-WebRequest -Uri "https://auth.tidal.com/v1/oauth2/token" `
        -Method POST -ContentType "application/x-www-form-urlencoded" `
        -Body $body -UseBasicParsing -TimeoutSec 15
    $global:token = ($tokenResp.Content | ConvertFrom-Json).access_token
    Write-Host "  [OK] Token acquired (first 30 chars): $($global:token.Substring(0,30))..." -ForegroundColor Green
} catch {
    Write-Host "  [FAIL] TIDAL Auth server unreachable: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n[2] TIDAL Relay Endpoints" -ForegroundColor Yellow
# Track 411283398 was confirmed WORKING in actual app logs (2026-06-23)
# Track 64975725 (Blinding Lights) returns 403 on these relays — may be geo/track-locked
$TEST_TRACK = "411283398"  # Change this to any TIDAL track ID to test a different track
$relays = @(
    # td.if-it-runs-ship-it.lol uses /api prefix path
    @{ Name = "td.if-it-runs-ship-it.lol (PRIMARY)"; Url = "https://td.if-it-runs-ship-it.lol/api/v1/tracks/$TEST_TRACK/playbackinfo?audioquality=LOSSLESS&playbackmode=STREAM&assetpresentation=FULL&countryCode=US" },
    # tidal-proxy.monochrome.tf does NOT use /api prefix
    @{ Name = "tidal-proxy.monochrome.tf";            Url = "https://tidal-proxy.monochrome.tf/v1/tracks/$TEST_TRACK/playbackinfo?audioquality=LOSSLESS&playbackmode=STREAM&assetpresentation=FULL&countryCode=US" },
    @{ Name = "us-west.monochrome.tf";                Url = "https://us-west.monochrome.tf/v1/tracks/$TEST_TRACK/playbackinfo?audioquality=LOSSLESS&playbackmode=STREAM&assetpresentation=FULL&countryCode=US" },
    @{ Name = "api.monochrome.tf";                    Url = "https://api.monochrome.tf/v1/tracks/$TEST_TRACK/playbackinfo?audioquality=LOSSLESS&playbackmode=STREAM&assetpresentation=FULL&countryCode=US" }
)
$authHeaders = @{ "Authorization" = "Bearer $global:token"; "Accept" = "application/json"; "User-Agent" = "okhttp/5.3.2" }
foreach ($relay in $relays) {
    $r = Test-Url -Label $relay.Name -Url $relay.Url -Headers $authHeaders -Timeout 12
    if ($r.Ok) {
        try {
            $j = $r.Content | ConvertFrom-Json
            $hasManifest = [bool]($j.manifest -or $j.manifestMimeType -or ($j.urls -and $j.urls.Count -gt 0))
            Write-Host "  [OK]       $($relay.Name) : HTTP $($r.Code) hasManifest=$hasManifest" -ForegroundColor Green
        } catch {
            Write-Host "  [OK]       $($relay.Name) : HTTP $($r.Code)" -ForegroundColor Green
        }
    } elseif ($r.Code) {
        $hint = if ($r.Code -eq 403) { " (account banned or free-tier restricted)" } elseif ($r.Code -eq 404) { " (path not found)" } else { "" }
        Write-Host "  [HTTP $($r.Code)]  $($relay.Name)$hint" -ForegroundColor Yellow
    } else {
        Write-Host "  [DOWN]     $($relay.Name)" -ForegroundColor Red
    }
}

# ─── 3. Uptime Workers ───────────────────────────────────────────────────────
Write-Host "`n[3] Uptime Worker Endpoints" -ForegroundColor Yellow
$workers = @(
    "https://tidal-uptime.geeked.wtf",
    "https://tidal-uptime.jiffy-puffs-1j.workers.dev/",
    "https://tidal-uptime.props-76styles.workers.dev/"
)
foreach ($w in $workers) {
    $r = Test-Url -Url $w -Headers @{ "Accept" = "application/json" } -Timeout 10
    if ($r.Ok) {
        try {
            $j = $r.Content | ConvertFrom-Json
            $apiCount = if ($j.api) { @($j.api).Count } else { 0 }
            $streamCount = if ($j.streaming) { @($j.streaming).Count } else { 0 }
            Write-Host "  [OK] $w : $apiCount api + $streamCount streaming mirrors" -ForegroundColor Green
        } catch {
            Write-Host "  [OK] $w : HTTP $($r.Code) (could not parse JSON)" -ForegroundColor Yellow
        }
    } else {
        Write-Host "  [DOWN] $w" -ForegroundColor Red
    }
}

# ─── 4. TIDAL Community Mirrors ──────────────────────────────────────────────
Write-Host "`n[4] TIDAL Community Mirrors (search test)" -ForegroundColor Yellow
$mirrors = @(
    "https://hifi.geeked.wtf",
    "https://eu-central.monochrome.tf",
    "https://us-west.monochrome.tf",
    "https://api.monochrome.tf",
    "https://monochrome-api.samidy.com",
    "https://maus.qqdl.site",
    "https://vogel.qqdl.site",
    "https://katze.qqdl.site",
    "https://hund.qqdl.site",
    "https://wolf.qqdl.site",
    "https://tidal.kinoplus.online"
)
foreach ($m in $mirrors) {
    $searchUrl = "$m/search/?s=Blinding+Lights"
    $r = Test-Url -Url $searchUrl -Headers @{ "Accept" = "application/json"; "User-Agent" = "Mozilla/5.0" } -Timeout 8
    $label = $m.PadRight(45)
    if ($r.Ok) {
        # Check if response is actual JSON with tracks
        try {
            $j = $r.Content | ConvertFrom-Json
            $hasItems = ($j.items -or $j.data -or ($j -is [Array] -and $j.Count -gt 0))
            Write-Host "  [ALIVE] $label HTTP $($r.Code)" -ForegroundColor Green
        } catch {
            Write-Host "  [HTML?] $label HTTP $($r.Code) (check manually)" -ForegroundColor Yellow
        }
    } elseif ($r.Code) {
        Write-Host "  [HTTP $($r.Code)] $label" -ForegroundColor Yellow
    } else {
        Write-Host "  [DOWN]  $label" -ForegroundColor Red
    }
}

# ─── 5. Stream URL Test on alive mirrors ─────────────────────────────────────
Write-Host "`n[5] TIDAL Mirror Stream URL Test (using TEST_TRACK=$TEST_TRACK and 64975725=Blinding Lights)" -ForegroundColor Yellow
Write-Host "  Note: 403 = mirror requires paid TIDAL account for this track. 200 = audio URL available." -ForegroundColor DarkGray
$aliveMirrors = @("https://us-west.monochrome.tf", "https://api.monochrome.tf", "https://monochrome-api.samidy.com")
foreach ($m in $aliveMirrors) {
    foreach ($tid in @($TEST_TRACK, "64975725")) {
        $trackUrl = "$m/track/?id=$tid&quality=LOSSLESS"
        $r = Test-Url -Url $trackUrl -Headers @{ "Accept" = "application/json"; "User-Agent" = "Mozilla/5.0"; "X-Client" = "BiniLossless/1.0" } -Timeout 12
        if ($r.Ok) {
            try {
                $j = $r.Content | ConvertFrom-Json
                $hasUrl = [bool]($j.url -or ($j.data -and $j.data.url) -or $j.manifest)
                Write-Host "  [OK]       $m track/$tid : hasStreamData=$hasUrl" -ForegroundColor Green
            } catch {
                Write-Host "  [OK]       $m track/$tid : HTTP $($r.Code) (non-JSON)" -ForegroundColor Yellow
            }
        } elseif ($r.Code) {
            $hint = if ($r.Code -eq 403) { " BANNED" } else { "" }
            Write-Host "  [HTTP $($r.Code)]$hint $m track/$tid" -ForegroundColor Yellow
        } else {
            Write-Host "  [DOWN]     $m track/$tid" -ForegroundColor Red
        }
    }
}

# ─── 6. Qobuz Proxy ──────────────────────────────────────────────────────────
Write-Host "`n[6] Qobuz Community Proxy (PRIMARY full-song source!)" -ForegroundColor Yellow
$r = Test-Url -Url "https://qobuz.kennyy.com.br/api/get-music?q=Blinding+Lights+Weeknd&offset=0" `
    -Headers @{ "Accept" = "application/json"; "User-Agent" = "Mozilla/5.0" } -Timeout 15
if ($r.Ok) {
    try {
        $j = $r.Content | ConvertFrom-Json
        $tracks = if ($j.data.tracks) { $j.data.tracks } elseif ($j.tracks) { $j.tracks } else { @() }
        Write-Host "  [OK] qobuz.kennyy.com.br : ALIVE - found $($tracks.Count) tracks" -ForegroundColor Green
        if ($tracks.Count -gt 0) {
            $first = $tracks[0]
            Write-Host "  First track: '$($first.title)' id=$($first.id) isrc=$($first.isrc)" -ForegroundColor Cyan
        }
    } catch {
        Write-Host "  [OK] qobuz.kennyy.com.br : HTTP $($r.Code) (parse error: $($_.Exception.Message))" -ForegroundColor Yellow
    }
} elseif ($r.Code) {
    Write-Host "  [HTTP $($r.Code)] qobuz.kennyy.com.br" -ForegroundColor Yellow
} else {
    Write-Host "  [DOWN] qobuz.kennyy.com.br - THIS IS WHY YOU GET 30s PREVIEWS!" -ForegroundColor Red
}

# ─── 7. Deezer Proxy ─────────────────────────────────────────────────────────
Write-Host "`n[7] Deezer Community Proxy (SECONDARY full-song source)" -ForegroundColor Yellow
$deezerUrl = "https://dzr.tabs-vs-spaces.wtf/stream/?isrc=CAUM71900813&format=FLAC"
$r = Test-Url -Url $deezerUrl -Method HEAD -Headers @{ "User-Agent" = "Mozilla/5.0" } -Timeout 12
if ($r.Ok -or $r.Code -eq 405 -or $r.Code -eq 206) {
    Write-Host "  [OK] dzr.tabs-vs-spaces.wtf : ALIVE HTTP $($r.Code)" -ForegroundColor Green
} elseif ($r.Code -eq 404) {
    Write-Host "  [404] dzr.tabs-vs-spaces.wtf : Server alive but ISRC not found (OK)" -ForegroundColor Yellow
} else {
    Write-Host "  [DOWN] dzr.tabs-vs-spaces.wtf" -ForegroundColor Red
}

# ─── 8. Amazon Music Proxies ─────────────────────────────────────────────────
Write-Host "`n[8] Amazon Music Proxies" -ForegroundColor Yellow
# Converter
$r = Test-Url -Url "https://t2a.geeked.wtf/api/search/songs?query=Blinding+Lights+Weeknd" `
    -Headers @{ "Accept" = "application/json" } -Timeout 12
if ($r.Ok) {
    try {
        $j = $r.Content | ConvertFrom-Json
        $cnt = if ($j.data) { @($j.data).Count } else { 0 }
        Write-Host "  [OK] t2a.geeked.wtf (converter) : ALIVE - $cnt results" -ForegroundColor Green
    } catch {
        Write-Host "  [OK] t2a.geeked.wtf : HTTP $($r.Code)" -ForegroundColor Green
    }
} elseif ($r.Code -eq 403) {
    Write-Host "  [403] t2a.geeked.wtf : Rate limited" -ForegroundColor Yellow
} else {
    Write-Host "  [DOWN] t2a.geeked.wtf" -ForegroundColor Red
}

# API (Turnstile auth)
try {
    $r2 = Invoke-WebRequest -Uri "https://amz.geeked.wtf/api/auth/turnstile" `
        -Method POST -ContentType "application/json" -Body '{"cf_turnstile_response":"test-token"}' `
        -UseBasicParsing -TimeoutSec 10
    Write-Host "  [OK] amz.geeked.wtf : HTTP $($r2.StatusCode)" -ForegroundColor Green
} catch {
    $code = $_.Exception.Response.StatusCode.value__
    if ($code -eq 403 -or $code -eq 401) {
        Write-Host "  [OK] amz.geeked.wtf : ALIVE (HTTP $code - token rejected as expected)" -ForegroundColor Green
    } elseif ($code) {
        Write-Host "  [HTTP $code] amz.geeked.wtf" -ForegroundColor Yellow
    } else {
        Write-Host "  [DOWN] amz.geeked.wtf" -ForegroundColor Red
    }
}

# ─── 9. Lyrics + Recommendations ─────────────────────────────────────────────
Write-Host "`n[9] Lyrics & Recommendation Services" -ForegroundColor Yellow
$r = Test-Url -Url "https://lrclib.net/api/get?track_name=Blinding+Lights&artist_name=The+Weeknd" -Timeout 10
Write-Host "  lrclib.net     : $(if ($r.Ok) { '[OK] ALIVE HTTP ' + $r.Code } else { '[DOWN]' })" -ForegroundColor $(if ($r.Ok) { 'Green' } else { 'Red' })

$r = Test-Url -Url "https://api.lyrics.ovh/v1/The%20Weeknd/Blinding%20Lights" -Timeout 10
Write-Host "  lyrics.ovh     : $(if ($r.Ok) { '[OK] ALIVE HTTP ' + $r.Code } else { '[DOWN/HTTP ' + $r.Code + ']' })" -ForegroundColor $(if ($r.Ok) { 'Green' } else { 'Yellow' })

$lastfmUrl = "https://ws.audioscrobbler.com/2.0/?method=track.getSimilar&track=Blinding+Lights&artist=The+Weeknd&limit=3&api_key=b25b959554ed76058ac220b7b2e0a026&format=json"
$r = Test-Url -Url $lastfmUrl -Timeout 10
Write-Host "  Last.fm        : $(if ($r.Ok) { '[OK] ALIVE HTTP ' + $r.Code } else { '[DOWN]' })" -ForegroundColor $(if ($r.Ok) { 'Green' } else { 'Red' })

Write-Host "`n============================================" -ForegroundColor Cyan
Write-Host "  HEALTH CHECK COMPLETE" -ForegroundColor Cyan
Write-Host "============================================`n" -ForegroundColor Cyan
