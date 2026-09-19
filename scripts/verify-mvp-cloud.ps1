$ErrorActionPreference = 'Stop'

$projectRef = 'zjgkqruiltiqthjhgotk'
$baseUrl = "https://$projectRef.supabase.co"
$checks = [System.Collections.Generic.List[string]]::new()

function Pass([string]$name) {
  $checks.Add("PASS $name")
}

$projects = npx supabase projects list -o json 2>$null | ConvertFrom-Json
if (@($projects | Where-Object { $_.id -eq $projectRef }).Count -ne 1) { throw 'Supabase project is unavailable' }
Pass 'cli-auth'

$keys = npx supabase projects api-keys --project-ref $projectRef -o json 2>$null | ConvertFrom-Json
$service = @($keys | Where-Object { $_.name -eq 'service_role' -or $_.type -eq 'service_role' })[0]
$serviceKey = if ($service.api_key) { $service.api_key } elseif ($service.key) { $service.key } else { $service.value }
if (-not $serviceKey) { throw 'Service role key was not returned' }
$anon = @($keys | Where-Object { $_.name -eq 'anon' -or $_.type -eq 'anon' })[0]
$anonKey = if ($anon.api_key) { $anon.api_key } elseif ($anon.key) { $anon.key } else { $anon.value }
if (-not $anonKey) { throw 'Anon key was not returned' }
$headers = @{ apikey = $serviceKey; Authorization = "Bearer $serviceKey"; 'Content-Type' = 'application/json' }

$users = @((Invoke-RestMethod -Uri "$baseUrl/auth/v1/admin/users?per_page=100" -Headers $headers).users)
if ($users.Count -ne 1) { throw "Expected one closed-test user, found $($users.Count)" }
$userId = $users[0].id
Pass 'closed-test-user'

$roles = @(Invoke-RestMethod -Uri "$baseUrl/rest/v1/user_roles?select=role&user_id=eq.$userId&role=in.(admin,superuser)" -Headers $headers)
if ($roles.Count -lt 1) { throw 'The closed-test user has no admin role' }
Pass 'admin-role'

$wallet = @(Invoke-RestMethod -Uri "$baseUrl/rest/v1/point_wallets?select=balance,lifetime_earned,lifetime_spent&user_id=eq.$userId" -Headers $headers)[0]
if ($wallet.balance -ne 0 -or $wallet.lifetime_earned -ne 80000 -or $wallet.lifetime_spent -ne 80000) {
  throw "Unexpected wallet totals: balance=$($wallet.balance), earned=$($wallet.lifetime_earned), spent=$($wallet.lifetime_spent)"
}
Pass 'wallet-totals'

$ledger = @(Invoke-RestMethod -Uri "$baseUrl/rest/v1/point_ledger?select=delta,reason,status&user_id=eq.$userId" -Headers $headers)
$postbackEntries = @($ledger | Where-Object { $_.reason -eq 'postback' -and $_.delta -eq 80000 -and $_.status -eq 'confirmed' })
$exchangeEntries = @($ledger | Where-Object { $_.reason -eq 'exchange' -and $_.delta -eq -80000 -and $_.status -eq 'confirmed' })
if ($postbackEntries.Count -ne 1 -or $exchangeEntries.Count -ne 1) { throw 'Ledger does not contain exactly one grant and one exchange debit' }
Pass 'ledger-idempotency'

$requests = @(Invoke-RestMethod -Uri "$baseUrl/rest/v1/exchange_requests?select=status,code,cost_points&user_id=eq.$userId&order=requested_at.desc&limit=1" -Headers $headers)
if ($requests.Count -ne 1 -or $requests[0].status -ne 'fulfilled' -or -not $requests[0].code -or $requests[0].cost_points -ne 80000) {
  throw 'Latest exchange request is not fulfilled correctly'
}
Pass 'exchange-fulfilled'

$badSignatureBody = @{
  partner = 'test-partner'
  transaction_id = "verify-invalid-$([guid]::NewGuid().ToString('N'))"
  click_id = 'invalid'
  signature = 'invalid'
} | ConvertTo-Json -Compress
try {
  Invoke-WebRequest -Method Post -Uri "$baseUrl/functions/v1/postback" -ContentType 'application/json' -Body $badSignatureBody | Out-Null
  throw 'Invalid signature was unexpectedly accepted'
} catch {
  if ([int]$_.Exception.Response.StatusCode -ne 401) { throw }
}
Pass 'invalid-signature-rejected'

# Exercise the RPC invariants with a disposable user. The user and every
# postback event that can retain its id are removed in finally, so the closed-
# test account and its wallet/ledger remain untouched.
$runId = [guid]::NewGuid().ToString('N')
$testUserId = $null
$testTransactions = [System.Collections.Generic.List[string]]::new()
try {
  $testEmail = "verify-$runId@example.invalid"
  $testPassword = "Test!aA9-$runId"
  $createdUser = Invoke-RestMethod -Method Post -Uri "$baseUrl/auth/v1/admin/users" -Headers $headers -Body (@{
    email = $testEmail
    password = $testPassword
    email_confirm = $true
  } | ConvertTo-Json -Compress)
  $testUserId = $createdUser.id
  if (-not $testUserId) { throw 'Disposable test user was not created' }

  $session = Invoke-RestMethod -Method Post -Uri "$baseUrl/auth/v1/token?grant_type=password" -Headers @{
    apikey = $anonKey
    'Content-Type' = 'application/json'
  } -Body (@{ email = $testEmail; password = $testPassword } | ConvertTo-Json -Compress)
  if (-not $session.access_token) { throw 'Disposable test user could not sign in' }
  $userHeaders = @{ apikey = $anonKey; Authorization = "Bearer $($session.access_token)"; 'Content-Type' = 'application/json' }

  $mission = @(Invoke-RestMethod -Uri "$baseUrl/rest/v1/missions?select=id,reward_points,partner_id&requires_verification=eq.true&is_active=eq.true&limit=1" -Headers $headers)[0]
  if (-not $mission.id -or -not $mission.partner_id) { throw 'No active verified mission is available for RPC tests' }
  $item = @(Invoke-RestMethod -Uri "$baseUrl/rest/v1/exchange_items?select=id,cost_points&is_active=eq.true&cost_points=gt.0&limit=1" -Headers $headers)[0]
  if (-not $item.id) { throw 'No active exchange item is available for RPC tests' }

  function New-TestClick {
    $value = Invoke-RestMethod -Method Post -Uri "$baseUrl/rest/v1/rpc/track_click" -Headers $userHeaders -Body (@{
      p_mission_id = $mission.id
      p_device_fp = "verify-$runId"
      p_ip = $null
      p_ua = 'verify-mvp-cloud'
    } | ConvertTo-Json -Compress)
    if (-not $value) { throw 'track_click returned no click id' }
    return [string]$value
  }

  function Confirm-TestPostback([string]$transactionId, [string]$clickId) {
    $testTransactions.Add($transactionId)
    return Invoke-RestMethod -Method Post -Uri "$baseUrl/rest/v1/rpc/confirm_postback" -Headers $headers -Body (@{
      p_partner_slug = 'test-partner'
      p_transaction_id = $transactionId
      p_click_id = $clickId
      p_reward_override = 1
      p_raw = @{ source = 'verify-mvp-cloud'; run_id = $runId }
    } | ConvertTo-Json -Compress -Depth 4)
  }

  $expiredClick = New-TestClick
  Invoke-RestMethod -Method Patch -Uri "$baseUrl/rest/v1/mission_clicks?click_id=eq.$expiredClick" -Headers $headers -Body (@{
    expires_at = [DateTime]::UtcNow.AddMinutes(-5).ToString('o')
  } | ConvertTo-Json -Compress) | Out-Null
  $expiredResult = Confirm-TestPostback "verify-$runId-expired" $expiredClick
  if ($expiredResult.status -ne 'rejected' -or $expiredResult.reason -ne 'attribution_expired') {
    throw "Expired click was not rejected correctly: $($expiredResult | ConvertTo-Json -Compress)"
  }
  Pass 'expired-click-rejected'

  $frozenClick = New-TestClick
  Invoke-RestMethod -Method Post -Uri "$baseUrl/rest/v1/user_moderation_state" -Headers ($headers + @{ Prefer = 'resolution=merge-duplicates' }) -Body (@{
    user_id = $testUserId
    state = 'frozen'
    reason = 'verify-mvp-cloud'
  } | ConvertTo-Json -Compress) | Out-Null
  $frozenResult = Confirm-TestPostback "verify-$runId-frozen" $frozenClick
  if ($frozenResult.status -ne 'rejected' -or $frozenResult.reason -ne 'user_frozen') {
    throw "Frozen user was not rejected correctly: $($frozenResult | ConvertTo-Json -Compress)"
  }
  Pass 'frozen-user-rejected'

  Invoke-RestMethod -Method Patch -Uri "$baseUrl/rest/v1/user_moderation_state?user_id=eq.$testUserId" -Headers $headers -Body (@{
    state = 'active'
    reason = $null
  } | ConvertTo-Json -Compress) | Out-Null

  try {
    Invoke-RestMethod -Method Post -Uri "$baseUrl/rest/v1/rpc/request_exchange" -Headers $userHeaders -Body (@{
      p_item_id = $item.id
    } | ConvertTo-Json -Compress) | Out-Null
    throw 'Insufficient-points exchange was unexpectedly accepted'
  } catch {
    if ([int]$_.Exception.Response.StatusCode -ne 400 -or $_.ErrorDetails.Message -notmatch 'insufficient points') { throw }
  }
  Pass 'insufficient-exchange-rejected'

  $acceptedClick = New-TestClick
  $acceptedTx = "verify-$runId-accepted"
  $acceptedResult = Confirm-TestPostback $acceptedTx $acceptedClick
  if ($acceptedResult.status -ne 'accepted' -or $acceptedResult.reward -ne 1) {
    throw "Valid postback was not accepted correctly: $($acceptedResult | ConvertTo-Json -Compress)"
  }
  Pass 'postback-rpc-accepted'

  $sameTransactionResult = Confirm-TestPostback $acceptedTx $acceptedClick
  if ($sameTransactionResult.status -ne 'duplicate') {
    throw "Duplicate transaction was not rejected correctly: $($sameTransactionResult | ConvertTo-Json -Compress)"
  }
  $sameClickResult = Confirm-TestPostback "verify-$runId-click-duplicate" $acceptedClick
  if ($sameClickResult.status -ne 'duplicate' -or $sameClickResult.reason -ne 'click_already_converted') {
    throw "Duplicate click was not rejected correctly: $($sameClickResult | ConvertTo-Json -Compress)"
  }
  Pass 'postback-rpc-idempotency'

  $testWallet = @(Invoke-RestMethod -Uri "$baseUrl/rest/v1/point_wallets?select=balance,lifetime_earned,lifetime_spent&user_id=eq.$testUserId" -Headers $headers)[0]
  $testLedger = @(Invoke-RestMethod -Uri "$baseUrl/rest/v1/point_ledger?select=delta,reason,status&user_id=eq.$testUserId" -Headers $headers)
  if ($testWallet.balance -ne 1 -or $testWallet.lifetime_earned -ne 1 -or $testWallet.lifetime_spent -ne 0) {
    throw 'Disposable wallet totals do not match the accepted postback'
  }
  if (@($testLedger | Where-Object { $_.reason -eq 'postback' -and $_.delta -eq 1 -and $_.status -eq 'confirmed' }).Count -ne 1) {
    throw 'Disposable ledger does not contain exactly one accepted postback'
  }
  Pass 'db-rpc-consistency'
} finally {
  foreach ($transactionId in @($testTransactions | Select-Object -Unique)) {
    $encodedTransaction = [Uri]::EscapeDataString($transactionId)
    try { Invoke-RestMethod -Method Delete -Uri "$baseUrl/rest/v1/postback_events?transaction_id=eq.$encodedTransaction" -Headers $headers | Out-Null } catch { }
  }
  if ($testUserId) {
    try { Invoke-RestMethod -Method Delete -Uri "$baseUrl/auth/v1/admin/users/$testUserId" -Headers $headers | Out-Null } catch { }
  }
}

$usersAfterCleanup = @((Invoke-RestMethod -Uri "$baseUrl/auth/v1/admin/users?per_page=100" -Headers $headers).users)
if ($usersAfterCleanup.Count -ne 1 -or $usersAfterCleanup[0].id -ne $userId) {
  throw 'Disposable test user cleanup did not restore the closed-test user set'
}
Pass 'disposable-user-cleanup'

$previousErrorPreference = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
$migrationOutput = npx supabase db push --dry-run 2>$null
$ErrorActionPreference = $previousErrorPreference
$migration = $migrationOutput | Select-Object -Last 1 | ConvertFrom-Json
if (-not $migration.upToDate) { throw 'Remote migrations are not up to date' }
Pass 'migrations-current'

$checks | ForEach-Object { Write-Output $_ }
Write-Output "MVP cloud verification passed ($($checks.Count) checks)."
