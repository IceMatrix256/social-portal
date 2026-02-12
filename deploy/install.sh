#!/bin/bash
# Social Portal Universal Installer (Bash/Zsh)
# Inspired by Homebrew & OpenClaw

set -e

REPO_NAME="social-portal"
GITHUB_USER="icematrix256"
INSTALL_PATH="$HOME/$REPO_NAME"

echo "🚀 Starting Social Portal Setup..."

# 1. Detect OS
OS_TYPE=$(uname -s)
IS_TERMUX=0
if [ -d "/data/data/com.termux" ]; then
    IS_TERMUX=1
    echo "📱 Android (Termux) detected."
else
    echo "💻 $OS_TYPE detected."
fi

# 2. Check Dependencies
check_dep() {
    if ! command -v "$1" &> /dev/null; then
        echo "❌ $1 is missing."
        return 1
    fi
    return 0
}

# 3. Install Dependencies
if [ $IS_TERMUX -eq 1 ]; then
    echo "📦 Updating Termux packages..."
    pkg update -y && pkg upgrade -y
    pkg install -y python nodejs git
    if [ ! -d "$HOME/storage" ]; then
        echo "📂 Setting up Termux storage..."
        termux-setup-storage
    fi
else
    # Mac/Linux logic
    if ! check_dep "git"; then echo "Please install git first."; exit 1; fi
    if ! check_dep "node"; then echo "Please install Node.js first."; exit 1; fi
    if ! check_dep "python3"; then echo "Please install Python 3 first."; exit 1; fi
fi

# 4. Clone or Update
if [ -d "$INSTALL_PATH" ]; then
    echo "📂 Project already exists. Updating..."
    cd "$INSTALL_PATH"
    git pull
else
    echo "🚚 Cloning repository..."
    git clone "https://github.com/$GITHUB_USER/$REPO_NAME.git" "$INSTALL_PATH"
    cd "$INSTALL_PATH"
fi

# 5. Setup Project
echo "🛠️ Installing dependencies..."
npm install

# 6. Create Alias
SHELL_RC="$HOME/.bashrc"
if [[ "$SHELL" == */zsh ]]; then SHELL_RC="$HOME/.zshrc"; fi

LAUNCH_COMMAND="alias socialportal='cd $INSTALL_PATH && npm run dev'"
if ! grep -q "socialportal" "$SHELL_RC"; then
    echo "$LAUNCH_COMMAND" >> "$SHELL_RC"
    echo "✅ Alias 'socialportal' added to $SHELL_RC"
fi

echo "---"
echo "🎉 Setup Complete!"
echo "👉 Type 'socialportal' in a NEW terminal to start the app."
