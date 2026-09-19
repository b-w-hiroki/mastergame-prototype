$ErrorActionPreference = 'Stop'

$projectRef = 'zjgkqruiltiqthjhgotk'
$repoRoot = Split-Path -Parent $PSScriptRoot
$adminRoot = Join-Path $repoRoot 'apps\admin'

$keys = npx supabase projects api-keys --project-ref $projectRef -o json 2>$null | ConvertFrom-Json
$service = @($keys | Where-Object { $_.name -eq 'service_role' -or $_.type -eq 'service_role' })[0]
$serviceKey = if ($service.api_key) { $service.api_key } elseif ($service.key) { $service.key } else { $service.value }
if (-not $serviceKey) { throw 'Supabase service role key was not returned by the authenticated CLI.' }

$env:SUPABASE_SERVICE_ROLE_KEY = $serviceKey
Push-Location $adminRoot
try {
  npm run dev
} finally {
  Pop-Location
  Remove-Item Env:SUPABASE_SERVICE_ROLE_KEY -ErrorAction SilentlyContinue
}
