#!/usr/bin/env bash
set -euo pipefail

# Blue local AI setup. Ollama runs on the same machine as Blue by default.
# No cloud AI provider or API key is configured here.

if ! command -v ollama >/dev/null 2>&1; then
  echo 'Ollama is not installed. Install it from https://ollama.com/download'
  exit 1
fi

MODEL="${AI_MODEL:-llama3.2:3b}"

echo "Pulling local model: $MODEL"
ollama pull "$MODEL"

echo
echo "Local AI is ready. Blue should use: http://127.0.0.1:11434/v1"
echo "Set AI_MODEL=$MODEL if you want to make the model explicit."
echo "Keep Ollama bound to localhost/private networking; do not expose port 11434 publicly."
