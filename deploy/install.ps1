$RepoName = "social-portal"
$GithubUser = "icematrix256"
$InstallPath = "$Home\$RepoName"

Write-Host "🚀 Starting Social Portal Setup for Windows..." -ForegroundColor Cyan

# 1. Dependency Check
function Check-Command($cmd) {
    Get-Command $cmd -ErrorAction SilentlyContinue
}

# 2. Setup (Logic can be expanded to use Winget)
if (-not (Check-Command "git")) {
    Write-Host "⚠️ Git is missing. Please install Git for Windows." -ForegroundColor Red
    exit
}

if (-not (Check-Command "node")) {
    Write-Host "⚠️ Node.js is missing. Please install Node.js." -ForegroundColor Red
    exit
}

# 3. Clone or Update
if (Test-Path $InstallPath) {
    Write-Host "📂 Project already exists. Updating..." -ForegroundColor Yellow
    cd $InstallPath
    git pull
} else {
    Write-Host "🚚 Cloning repository..." -ForegroundColor Yellow
    git clone "https://github.com/$GithubUser/$RepoName.git" $InstallPath
    cd $InstallPath
}

# 4. Install Dependencies
Write-Host "🛠️ Installing dependencies (npm install)..." -ForegroundColor Yellow
npm install

# 5. Create Desktop Shortcut
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut("$Home\Desktop\Social Portal.lnk")
$Shortcut.TargetPath = "powershell.exe"
$Shortcut.Arguments = "-NoExit -Command `"cd $InstallPath; npm start`""
$Shortcut.Description = "Start Social Portal"
$Shortcut.IconLocation = "$InstallPath\public\favicon.ico" # Fallback if exists
$Shortcut.Save()

Write-Host "---" -ForegroundColor Green
Write-Host "🎉 Setup Complete!" -ForegroundColor Green
Write-Host "👉 Double-click 'Social Portal' on your Desktop to start the app." -ForegroundColor White
