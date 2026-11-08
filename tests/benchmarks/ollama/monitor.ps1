param([int]$Seconds = 1200, [string]$OutputFile = 'gpu-samples.csv')
$ErrorActionPreference = 'Stop'
$outputPath = Join-Path $PSScriptRoot "../../../docs/reviews/ollama-benchmark/$OutputFile"
$stopPath = Join-Path $PSScriptRoot '../../../docs/reviews/ollama-benchmark/stop-monitor'
'utc_timestamp,memory_used_mib,gpu_utilization_percent,power_w' | Set-Content -LiteralPath $outputPath -Encoding utf8
$deadline = [DateTime]::UtcNow.AddSeconds($Seconds)
while ([DateTime]::UtcNow -lt $deadline -and -not (Test-Path -LiteralPath $stopPath)) {
  $sample = & nvidia-smi --query-gpu=memory.used,utilization.gpu,power.draw --format=csv,noheader,nounits
  "$([DateTime]::UtcNow.ToString('o')),$sample" | Add-Content -LiteralPath $outputPath -Encoding utf8
  Start-Sleep -Seconds 2
}
