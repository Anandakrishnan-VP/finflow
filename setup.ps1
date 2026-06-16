$ErrorActionPreference = "Stop"

# Create directories
New-Item -ItemType Directory -Force -Path "plugins" | Out-Null
New-Item -ItemType Directory -Force -Path "nginx/certs" | Out-Null

# Download GDS jar
$gdsUrl = "https://graphdatascience.ninja/neo4j-graph-data-science-2.6.8.jar"
$gdsDest = "plugins/neo4j-graph-data-science-2.6.8.jar"
if (-not (Test-Path $gdsDest)) {
    Write-Host "Downloading Neo4j GDS 2.6.8 jar..."
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $gdsUrl -OutFile $gdsDest
} else {
    Write-Host "Neo4j GDS JAR already exists."
}

# Generate self-signed TLS certs
$certDest = "nginx/certs/server.crt"
$keyDest = "nginx/certs/server.key"

if (-not (Test-Path $certDest) -or -not (Test-Path $keyDest)) {
    Write-Host "Generating self-signed TLS certificates..."
    
    $opensslPath = "openssl"
    if (Get-Command $opensslPath -ErrorAction SilentlyContinue) {
        # Global openssl works
    } elseif (Test-Path "C:\Program Files\Git\usr\bin\openssl.exe") {
        $opensslPath = "C:\Program Files\Git\usr\bin\openssl.exe"
    } else {
        $opensslPath = ""
    }

    if ($opensslPath -ne "") {
        Write-Host "Using OpenSSL at: $opensslPath"
        & $opensslPath req -x509 -nodes -days 365 -newkey rsa:2048 `
            -keyout $keyDest `
            -out $certDest `
            -subj "/C=IN/ST=Karnataka/L=Bengaluru/O=Karnataka CID/OU=Economic Offences/CN=localhost"
    } else {
        Write-Warning "openssl not found. Attempting to generate self-signed certificate using PowerShell..."
        # Fallback to current user cert store (does not require admin privileges)
        $cert = New-SelfSignedCertificate -DnsName "localhost" -CertStoreLocation "cert:\CurrentUser\My"
        
        # Export Certificate
        $certPem = "-----BEGIN CERTIFICATE-----`r`n" + [Convert]::ToBase64String($cert.RawData, [Base64FormattingOptions]::InsertLineBreaks) + "`r`n-----END CERTIFICATE-----"
        Set-Content -Path $certDest -Value $certPem
        
        # Export Private key using .NET
        try {
            $rsa = [System.Security.Cryptography.X509Certificates.RSACertificateExtensions]::GetRSAPrivateKey($cert)
            $keyBytes = $rsa.ExportPkcs8PrivateKey()
            $keyPem = "-----BEGIN PRIVATE KEY-----`r`n" + [Convert]::ToBase64String($keyBytes, [Base64FormattingOptions]::InsertLineBreaks) + "`r`n-----END PRIVATE KEY-----"
            Set-Content -Path $keyDest -Value $keyPem
            Write-Host "Certificate and Key exported successfully using native .NET APIs."
        } catch {
            Write-Error "Could not export private key automatically. Please run this setup script inside Git Bash or install OpenSSL."
        }
    }
} else {
    Write-Host "TLS certificates already exist."
}

Write-Host "Setup complete."
