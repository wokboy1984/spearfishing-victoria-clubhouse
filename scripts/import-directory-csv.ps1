param([string]$Root = (Split-Path -Parent $PSScriptRoot))

$businesses = Import-Csv (Join-Path $Root 'data/community-directory-businesses.csv')
$creators = Import-Csv (Join-Path $Root 'data/community-directory-creators.csv')

# Publication holds confirmed during the pre-launch directory review.
$creators = @($creators | Where-Object {
  $_.account_or_channel_name -ne 'Spearfishing Victoria' -and
  -not ($_.account_or_channel_name -eq 'Southern Spearfishing' -and $_.platform -eq 'YouTube')
})

$categoryMap = @{
  'Spearfishing and Freediving Clubs' = 'Clubs'
  'Spearfishing-specific Charters' = 'Spearfishing Charters'
}
$localLogos = @{
  'Salt Sessions Freediving' = '../assets/freediving-schools/salt-sessions-freediving.png'
  'Drifters Freediving' = '../assets/freediving-schools/drifters-freediving.png'
  'Marlon Quinn / Boundless Blue' = '../assets/freediving-schools/marlon-quinn-boundless-blue.png'
  'Simple Dive Melbourne' = '../assets/freediving-schools/simple-dive-melbourne.png'
  'Southern Freedivers' = '../assets/freediving-schools/southern-freedivers.svg'
  'Geelong Freedivers' = '../assets/freediving-schools/geelong-freedivers.webp'
  'Melbourne Freedivers Club' = '../assets/freediving-schools/melbourne-freedivers-club.png'
}
function Get-Slug([string]$Value) {
  $slug = $Value.ToLowerInvariant() -replace '[^a-z0-9]+','-'
  return $slug.Trim('-')
}
function Split-Services([string]$Value) {
  if ([string]::IsNullOrWhiteSpace($Value)) { return @() }
  return @($Value -split ';' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
}
function Sql([AllowNull()][string]$Value) {
  if ([string]::IsNullOrWhiteSpace($Value)) { return 'null' }
  return "'" + $Value.Replace("'", "''") + "'"
}
function SqlArray($Values) {
  if (-not $Values -or $Values.Count -eq 0) { return "'{}'::text[]" }
  return 'array[' + (($Values | ForEach-Object { Sql $_ }) -join ',') + ']::text[]'
}

$items = [System.Collections.Generic.List[object]]::new()
foreach ($row in $businesses) {
  $category = if ($categoryMap.ContainsKey($row.category)) { $categoryMap[$row.category] } else { $row.category }
  $logo = $row.official_logo_url
  $primary = $row.primary_evidence_url
  $secondary = $row.secondary_evidence_url
  $checked = $row.date_checked
  $confidence = $row.confidence
  $notes = $row.research_notes
  if ($row.name -eq 'Marlon Quinn / Boundless Blue' -and $row.confidence -match '^\d{4}-') {
    $logo = $row.primary_evidence_url; $primary = $row.secondary_evidence_url; $secondary = $row.date_checked
    $checked = $row.confidence; $confidence = $row.research_notes; $notes = 'Mornington Peninsula instructor; manually corrected from a shifted CSV row.'
  }
  if ($localLogos.ContainsKey($row.name)) { $logo = $localLogos[$row.name] }
  $items.Add([pscustomobject]@{
    slug = Get-Slug $row.name; name = $row.name; category = $category; categories = @($category); type = $row.listing_type
    region = $row.victorian_region; location = $row.physical_location; serviceArea = $row.service_area
    description = $row.neutral_description; services = Split-Services $row.services_offered
    website = $row.official_website; instagram = $row.instagram_url; youtube = $row.youtube_url
    email = $row.public_contact_email; phone = $row.public_phone_number; logo = $logo
    source = $primary; secondarySource = $secondary; lastUpdated = $checked; confidence = $confidence
    researchNotes = $notes; verifiedOwner = $false; recommendations = 0
  })
}
foreach ($row in $creators) {
  $suffix = if ($row.platform -eq 'YouTube') { 'youtube' } else { 'instagram' }
  $items.Add([pscustomobject]@{
    slug = (Get-Slug $row.account_or_channel_name) + '-' + $suffix; name = $row.account_or_channel_name
    category = $row.category; categories = @($row.category); type = "$($row.platform) creator"; region = $row.optional_victorian_region
    location = $row.optional_victorian_region; serviceArea = ''; description = $row.neutral_description
    services = Split-Services $row.main_topics; website = ''; instagram = $(if ($suffix -eq 'instagram') { $row.profile_url } else { '' })
    youtube = $(if ($suffix -eq 'youtube') { $row.profile_url } else { '' }); email = ''; phone = ''
    logo = $row.profile_image_or_channel_logo_url; source = $row.primary_evidence_url
    secondarySource = $row.secondary_evidence_url; lastUpdated = $row.date_checked; confidence = $row.confidence
    researchNotes = $row.research_notes; verifiedOwner = $false; recommendations = 0
  })
}

# A business or creator can belong to several directory filters while keeping one profile.
$items = @($items | Group-Object name | ForEach-Object {
  $group = @($_.Group)
  $base = @($group | Where-Object { $_.category -notin @('Instagram Accounts','YouTube Channels') } | Select-Object -First 1)
  if (-not $base) { $base = @($group | Select-Object -First 1) }
  $base = $base[0]
  $base.slug = Get-Slug $base.name
  $base.categories = @($group.category | Select-Object -Unique)
  $base.services = @($group.services | ForEach-Object { $_ } | Select-Object -Unique)
  foreach ($property in @('website','instagram','youtube','email','phone','logo','location','serviceArea')) {
    if ([string]::IsNullOrWhiteSpace($base.$property)) {
      $candidate = $group.$property | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -First 1
      if ($candidate) { $base.$property = $candidate }
    }
  }
  $base
})

$json = $items | ConvertTo-Json -Depth 6
$categories = "['Freediving Schools','Clubs','Spearfishing Stores','Spearfishing Charters','YouTube Channels','Instagram Accounts','Underwater Sports']"
$js = "// Generated from data/community-directory-businesses.csv and data/community-directory-creators.csv.`nwindow.SV_DIRECTORY = $json;`nwindow.SV_DIRECTORY_CATEGORIES = $categories;`n"
Set-Content -LiteralPath (Join-Path $Root 'directory/directory-data.js') -Value $js -Encoding utf8

$slugs = $items | ForEach-Object { Sql $_.slug }
$values = foreach ($item in $items) {
  $socialInstagram = if ($item.instagram) { Sql $item.instagram } else { 'null' }
  $socialYoutube = if ($item.youtube) { Sql $item.youtube } else { 'null' }
  '(' + (@(
    (Sql $item.slug),(Sql $item.name),(Sql $item.category),(SqlArray $item.categories),(Sql $item.region),(Sql $item.location),(Sql $item.serviceArea),
    (Sql $item.description),(SqlArray $item.services),(Sql $item.website),$socialInstagram,$socialYoutube,(Sql $item.email),(Sql $item.phone),
    (Sql (($item.logo -replace '^\.\./','/'))),(Sql 'approved'),(Sql $item.lastUpdated)
  ) -join ',') + ')'
}
$seedStart = '-- BEGIN GENERATED DIRECTORY SEED'
$seedEnd = '-- END GENERATED DIRECTORY SEED'
$seed = @"
$seedStart
-- Generated from the reviewed directory CSV files. Unclaimed imported entries are
-- synchronised to this exact set; owner-managed listings are never removed here.
delete from public.directory_listings
where status='approved' and owner_id is null and slug not in ($($slugs -join ','));

insert into public.directory_listings(slug,name,category,categories,region,location,service_area,description,services,website,instagram_url,youtube_url,contact_email,phone,logo_path,status,updated_at) values
$($values -join ",`n")
on conflict(slug) do update set
  name=excluded.name,category=excluded.category,categories=excluded.categories,region=excluded.region,location=excluded.location,
  service_area=excluded.service_area,description=excluded.description,services=excluded.services,
  website=excluded.website,instagram_url=excluded.instagram_url,youtube_url=excluded.youtube_url,
  contact_email=excluded.contact_email,phone=excluded.phone,logo_path=excluded.logo_path,updated_at=excluded.updated_at
where public.directory_listings.owner_id is null;
$seedEnd
"@
Set-Content -LiteralPath (Join-Path $Root 'supabase/directory-seed.generated.sql') -Value $seed -Encoding utf8

$migrationPath = Join-Path $Root 'supabase/migrations/202609280027_community_directory.sql'
$migration = Get-Content -Raw -LiteralPath $migrationPath
$start = $seedStart
$end = 'revoke all on function public.submit_directory_listing'
$startIndex = $migration.IndexOf($start)
$legacyStart = '-- Generated from the reviewed directory CSV files.'
if ($startIndex -lt 0) { $startIndex = $migration.IndexOf($legacyStart) }
$endIndex = $migration.IndexOf($end)
if ($startIndex -lt 0 -or $endIndex -lt 0 -or $endIndex -le $startIndex) { throw 'Could not locate directory seed markers.' }
$migration = $migration.Substring(0,$startIndex) + $seed + "`n" + $migration.Substring($endIndex)
Set-Content -LiteralPath $migrationPath -Value $migration -Encoding utf8

Write-Output "Imported $($businesses.Count) organisations and $($creators.Count) creator profiles."
