#!/bin/zsh
cd "${0:A:h}"
if ! command -v python3 >/dev/null; then
  echo '需要 Python 3。安装后重新打开这个启动器。'
  read -k 1
  exit 1
fi
exec python3 launch.py --ai
