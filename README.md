# TourlyAI

A desktop application that uses AI and NLP to analyze reviews — extracting sentiments, topics, categories, and generating intelligent summaries.

![Electron](https://img.shields.io/badge/Electron-40-47848F?logo=electron&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Python](https://img.shields.io/badge/Python-3.11-3776AB?logo=python&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green)

## Features

- **Sentiment Analysis** — BERT-based multilingual sentiment classification
- **Subjectivity Detection** — Classify reviews as subjective or objective
- **Category Classification** — Multi-label tourism category tagging
- **Hierarchical Topic Modeling** — BERTopic-powered topic discovery with LLM enhancement
- **Intelligent Summarization** — LangChain + LLM-generated summaries
- **Interactive Visualizations** — Charts, dashboards, and exportable reports
- **Local LLM Support** — Runs with Ollama (Llama 3.2) for full privacy
- **Cloud LLM Support** — Optional OpenAI API integration

## Architecture

```
┌─────────────────────────────┐
│   Electron (Main Process)   │
│   ├── IPC Handlers          │
│   ├── Python Bridge         │
│   └── Setup Wizard          │
├─────────────────────────────┤
│   React (Renderer Process)  │
│   ├── Dashboard             │
│   ├── Pipeline Controls     │
│   └── Visualization Viewer  │
├─────────────────────────────┤
│   Python Backend             │
│   ├── 7-Phase NLP Pipeline  │
│   ├── HuggingFace Models    │
│   └── Ollama / OpenAI LLM  │
└─────────────────────────────┘
```

## Prerequisites

- **Node.js** 18+ and npm
- **Python** 3.11+ (auto-installed on first run if missing)
- **Ollama** (optional, for local LLM — auto-installed via setup wizard)

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/victorwkey/TourlyAI.git
cd TourlyAI
npm install
```

### 2. Run in development

```bash
npm run start
```

The first run will launch a **setup wizard** that:
1. Checks/installs Python 3.11
2. Creates a virtual environment and installs dependencies
3. Downloads required ML models (~1.5 GB)
4. Optionally installs Ollama + a local LLM model

### 3. Build for production

```bash
# Package the app
npm run package

# Create distributable installer (.exe on Windows)
npm run make
```

The installer will be in `out/make/squirrel.windows/x64/`.

## Cloning to a New Machine

> **Important:** ML models (~1.3 GB) are excluded from git. You must back them up and restore them manually.

### What to save

| Path | Size | In Git? | Action |
|------|------|---------|--------|
| `python/models/` | ~1.3 GB | No | **Back up and restore** |
| `python/data/dataset.csv` | ~28 MB | Partial | Save if custom data |
| `node_modules/` | ~706 MB | No | `npm install` |
| Ollama models (`~/.ollama/`) | 2–6 GB | No | `ollama pull llama3.2:3b` |

### Backup

```bash
cd python
tar -czf models_backup.tar.gz models/
```

### Restore on new machine

```bash
# 1. Clone and restore models
git clone https://github.com/victorwkey/TourlyAI.git
cd TourlyAI
tar -xzf models_backup.tar.gz -C python/

# 2. Install dependencies
npm install

# 3. (Optional) Re-download Ollama model for local LLM
ollama pull llama3.2:3b
```

## Project Structure

```
├── src/                    # Electron + React frontend
│   ├── main.ts             # Electron main process
│   ├── preload.ts          # Context bridge
│   ├── renderer.ts         # React entry point
│   ├── main/               # Main process modules
│   │   ├── ipc/            # IPC handlers
│   │   ├── python/         # Python bridge
│   │   └── setup/          # First-run setup wizard
│   └── renderer/           # React UI
│       ├── components/     # Reusable UI components
│       ├── pages/          # App pages
│       └── stores/         # Zustand state management
├── python/                 # Python NLP backend
│   ├── main.py             # Bridge entry point
│   ├── api_bridge.py       # JSON-RPC bridge
│   ├── core/               # 7-phase analysis pipeline
│   └── config/             # Configuration
├── resources/              # App resources (icons, etc.)
└── forge.config.ts         # Electron Forge config
```

## NLP Pipeline Phases

| Phase | Name | Description | Requires LLM |
|-------|------|-------------|:---:|
| 1 | Basic Processing | Clean and preprocess dataset | No |
| 2 | Sentiment Analysis | BERT multilingual sentiment | No |
| 3 | Subjectivity Analysis | Subjective vs objective classification | No |
| 4 | Category Classification | Multi-label tourism categories | No |
| 5 | Hierarchical Topics | BERTopic + LLM topic modeling | Yes |
| 6 | Intelligent Summary | LangChain summarization | Yes |
| 7 | Visualizations | Charts and dashboard generation | No |

## Tech Stack

**Frontend:** Electron 40, React 19, TypeScript, Tailwind CSS, Radix UI, Recharts, Zustand

**Backend:** Python 3.11, PyTorch, Transformers, BERTopic, LangChain, sentence-transformers

**LLM:** Ollama (local) or OpenAI API (cloud)

## Scripts

| Command | Description |
|---------|-------------|
| `npm run start` | Run in development mode |
| `npm run package` | Package the app |
| `npm run make` | Create platform installer |
| `npm run make:win` | Create Windows installer |
| `npm run lint` | Run ESLint |

## Resetting the Setup

Use this when you want to re-run the setup wizard from scratch, or clean generated data between pipeline runs.

> Stop the app and kill any Python processes before running these commands.

```powershell
# Stop residual Python/Ollama processes
Get-Process python -ErrorAction SilentlyContinue | Stop-Process -Force
Stop-Process -Name "ollama*" -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# Delete Python virtual environment (forces reinstall on next run)
# The venv lives in %APPDATA%\TourlyAI\python-env\ (not inside the project directory)
Remove-Item -Recurse -Force "$env:APPDATA\TourlyAI\python-env" -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force "$env:APPDATA\TourlyAI-dev\python-env" -ErrorAction SilentlyContinue

# Delete the dataset (no reviews will show until a new dataset is uploaded)
Remove-Item -Path "python\data\dataset.csv" -Force -ErrorAction SilentlyContinue

# Delete pipeline-generated data
Remove-Item -Path "python\data\shared\categorias_scores.json" -Force -ErrorAction SilentlyContinue
Remove-Item -Path "python\data\shared\resumenes.json" -Force -ErrorAction SilentlyContinue
Remove-Item -Path "python\data\shared\insights_estrategicos.json" -Force -ErrorAction SilentlyContinue
Remove-Item -Path "python\data\.backups" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path "python\data\visualizaciones" -Recurse -Force -ErrorAction SilentlyContinue

# Delete app state (setup wizard, LLM config, pipeline phase state)
# Production build uses TourlyAI; development build uses TourlyAI-dev
Remove-Item "$env:APPDATA\TourlyAI\setup-state.json" -Force -ErrorAction SilentlyContinue
Remove-Item "$env:APPDATA\TourlyAI\tourlyai-config.json" -Force -ErrorAction SilentlyContinue
Remove-Item -Path "$env:APPDATA\TourlyAI\Local Storage" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path "$env:APPDATA\TourlyAI\Session Storage" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item "$env:APPDATA\TourlyAI-dev\setup-state.json" -Force -ErrorAction SilentlyContinue
Remove-Item "$env:APPDATA\TourlyAI-dev\tourlyai-config.json" -Force -ErrorAction SilentlyContinue
Remove-Item -Path "$env:APPDATA\TourlyAI-dev\Local Storage" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path "$env:APPDATA\TourlyAI-dev\Session Storage" -Recurse -Force -ErrorAction SilentlyContinue

# (Optional) Delete cached HuggingFace models — will re-download on next run (~2.5 GB)
# NOTE: Do NOT delete python\bundled-models\ — those are needed for production builds
Remove-Item -Path "python\models\hf_cache" -Recurse -Force -ErrorAction SilentlyContinue

# (Optional) Uninstall Ollama completely
Remove-Item -Path "$env:LOCALAPPDATA\Programs\Ollama" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path "$env:USERPROFILE\.ollama" -Recurse -Force -ErrorAction SilentlyContinue

# Clean Python cache
Get-ChildItem -Path "python" -Filter "__pycache__" -Recurse -Directory | Remove-Item -Recurse -Force

Write-Host "Reset complete." -ForegroundColor Green
```

> **Note on Ollama:** This project installs Ollama on **Windows native** (`%LOCALAPPDATA%\Programs\Ollama\`). If a previous version installed it inside WSL (`/usr/local/bin/ollama`), remove it from WSL as well before re-running the setup wizard.

## License

[MIT](LICENSE)

## Author

**victorwkey** — [victorwkey@gmail.com](mailto:victorwkey@gmail.com)
