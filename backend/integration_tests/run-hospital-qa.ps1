param(
    [switch]$SkipBuild,
    [ValidateSet('integration', 'tenant', 'pharmacy')]
    [string]$Suite = 'integration',
    [string]$ResultsDirectory = (Join-Path $env:LOCALAPPDATA 'MedApp/hospital-qa-results')
)

$ErrorActionPreference = 'Stop'
$taskBackend = Split-Path $PSScriptRoot -Parent
$taskImage = 'medapp-hospital-qa:reminders-20260917'
$taskReportName = if ($Suite -eq 'tenant') { 'hms-tenant-postgres.xml' } else { 'hospital-http-postgres.xml' }
if ($Suite -eq 'pharmacy') { $taskReportName = 'pharmacy-http-postgres.xml' }
if (-not $SkipBuild) {
    docker build --file (Join-Path $PSScriptRoot 'Dockerfile.hospital-qa') --tag $taskImage $taskBackend
    if ($LASTEXITCODE -ne 0) { throw 'Hospital QA image build failed.' }
}

$taskSuffix = [guid]::NewGuid().ToString('N').Substring(0, 12)
$taskDatabase = 'medapp-hospital-linux-db-' + $taskSuffix
$taskRunner = 'medapp-hospital-linux-tests-' + $taskSuffix
$taskPassword = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
$taskDatabaseCreated = $false
$taskExit = 1
New-Item -ItemType Directory -Force -Path $ResultsDirectory | Out-Null
$taskResults = (Resolve-Path -LiteralPath $ResultsDirectory).Path
try {
    docker run --detach --rm --name $taskDatabase --cpus 1 --memory 512m --env ('POSTGRES_PASSWORD=' + $taskPassword) postgres:16
    if ($LASTEXITCODE -ne 0) { throw 'Disposable PostgreSQL startup failed.' }
    $taskDatabaseCreated = $true
    $taskDeadline = [DateTime]::UtcNow.AddSeconds(30)
    $taskReady = $false
    do {
        docker exec $taskDatabase pg_isready -U postgres *> $null
        if ($LASTEXITCODE -eq 0) { $taskReady = $true; break }
        Start-Sleep -Milliseconds 500
    } while ([DateTime]::UtcNow -lt $taskDeadline)
    if (-not $taskReady) { throw 'Disposable PostgreSQL did not become ready.' }

    # All HTTP servers and PostgreSQL share this disposable network namespace.
    # No service/database port or host data directory is exposed.
    $taskDockerArguments = @('run', '--rm', '--init', '--name', $taskRunner,
        '--network', ('container:' + $taskDatabase), '--cpus', '2', '--memory', '2g',
        '--mount', ('type=bind,source=' + $taskResults + ',target=/results'),
        '--env', 'HMS_TEST_POSTGRES=1',
        '--env', ('MEDAPP_TEST_POSTGRES_URL=postgresql://postgres:' + $taskPassword + '@127.0.0.1:5432/postgres'))
    if ($Suite -eq 'tenant') {
        $taskDockerArguments += @('--workdir', '/workspace/backend/services/hms_service')
    }
    $taskDockerArguments += $taskImage
    if ($Suite -eq 'tenant') {
        $taskDockerArguments += @('python', '-m', 'pytest', 'tests/test_tenant_postgres.py', '-q', '--tb=short', '--junitxml=/results/hms-tenant-postgres.xml')
    }
    if ($Suite -eq 'pharmacy') {
        $taskDockerArguments += @('python', '-m', 'pytest', 'integration_tests/test_pharmacy_activation.py', '-q', '--tb=short', '--junitxml=/results/pharmacy-http-postgres.xml')
    }
    docker @taskDockerArguments
    $taskExit = $LASTEXITCODE
}
finally {
    if ($taskDatabaseCreated) {
        foreach ($taskContainer in @($taskRunner, $taskDatabase)) {
            $taskFound = docker container ls --all --filter ('name=^/' + $taskContainer + '$') --format '{{.ID}}'
            if ($LASTEXITCODE -eq 0 -and $taskFound) {
                docker rm --force $taskContainer | Out-Null
                if ($LASTEXITCODE -ne 0) { Write-Warning ('Could not remove QA container ' + $taskContainer) }
            }
        }
    }
}
Write-Output ('Hospital QA report: ' + (Join-Path $taskResults $taskReportName))
exit $taskExit
