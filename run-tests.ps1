$body = @{
    model = "web-gemini/gemini-3-fast"
    messages = @(@{role="user"; content="What is 2+2?"})
    newConversation = $true
}
$r = Invoke-RestMethod -Uri "http://localhost:31339/v1/chat/completions" -Method POST -ContentType "application/json" -Body ($body | ConvertTo-Json -Compress)
Write-Host "Test 1: 2+2"
Write-Host "  Response: $($r.choices[0].message.content)"

$body = @{
    model = "web-gemini/gemini-3-fast"
    messages = @(@{role="user"; content="What is 5+3?"})
    newConversation = $true
}
$r = Invoke-RestMethod -Uri "http://localhost:31339/v1/chat/completions" -Method POST -ContentType "application/json" -Body ($body | ConvertTo-Json -Compress)
Write-Host "Test 2: 5+3"
Write-Host "  Response: $($r.choices[0].message.content)"

$body = @{
    model = "web-gemini/gemini-3-fast"
    messages = @(@{role="user"; content="What is 10-4?"})
    newConversation = $true
}
$r = Invoke-RestMethod -Uri "http://localhost:31339/v1/chat/completions" -Method POST -ContentType "application/json" -Body ($body | ConvertTo-Json -Compress)
Write-Host "Test 3: 10-4"
Write-Host "  Response: $($r.choices[0].message.content)"

$body = @{
    model = "web-gemini/gemini-3-fast"
    messages = @(@{role="user"; content="What is 6*6?"})
    newConversation = $true
}
$r = Invoke-RestMethod -Uri "http://localhost:31339/v1/chat/completions" -Method POST -ContentType "application/json" -Body ($body | ConvertTo-Json -Compress)
Write-Host "Test 4: 6*6"
Write-Host "  Response: $($r.choices[0].message.content)"

$body = @{
    model = "web-gemini/gemini-3-fast"
    messages = @(@{role="user"; content="Capital of Japan?"})
    newConversation = $true
}
$r = Invoke-RestMethod -Uri "http://localhost:31339/v1/chat/completions" -Method POST -ContentType "application/json" -Body ($body | ConvertTo-Json -Compress)
Write-Host "Test 5: Capital of Japan"
Write-Host "  Response: $($r.choices[0].message.content)"

$body = @{
    model = "web-gemini/gemini-3-fast"
    messages = @(@{role="user"; content="Capital of Germany?"})
    newConversation = $true
}
$r = Invoke-RestMethod -Uri "http://localhost:31339/v1/chat/completions" -Method POST -ContentType "application/json" -Body ($body | ConvertTo-Json -Compress)
Write-Host "Test 6: Capital of Germany"
Write-Host "  Response: $($r.choices[0].message.content)"

$body = @{
    model = "web-gemini/gemini-3-fast"
    messages = @(@{role="user"; content="What is 100/5?"})
    newConversation = $true
}
$r = Invoke-RestMethod -Uri "http://localhost:31339/v1/chat/completions" -Method POST -ContentType "application/json" -Body ($body | ConvertTo-Json -Compress)
Write-Host "Test 7: 100/5"
Write-Host "  Response: $($r.choices[0].message.content)"

$body = @{
    model = "web-gemini/gemini-3-fast"
    messages = @(@{role="user"; content="What is 15+27?"})
    newConversation = $true
}
$r = Invoke-RestMethod -Uri "http://localhost:31339/v1/chat/completions" -Method POST -ContentType "application/json" -Body ($body | ConvertTo-Json -Compress)
Write-Host "Test 8: 15+27"
Write-Host "  Response: $($r.choices[0].message.content)"

$body = @{
    model = "web-gemini/gemini-3-fast"
    messages = @(@{role="user"; content="What is 9-3?"})
    newConversation = $true
}
$r = Invoke-RestMethod -Uri "http://localhost:31339/v1/chat/completions" -Method POST -ContentType "application/json" -Body ($body | ConvertTo-Json -Compress)
Write-Host "Test 9: 9-3"
Write-Host "  Response: $($r.choices[0].message.content)"

$body = @{
    model = "web-gemini/gemini-3-fast"
    messages = @(@{role="user"; content="What is 3*7?"})
    newConversation = $true
}
$r = Invoke-RestMethod -Uri "http://localhost:31339/v1/chat/completions" -Method POST -ContentType "application/json" -Body ($body | ConvertTo-Json -Compress)
Write-Host "Test 10: 3*7"
Write-Host "  Response: $($r.choices[0].message.content)"

Write-Host "All tests complete!"
