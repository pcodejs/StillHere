"""Compatibility entry point for the original icon command."""
import subprocess
from pathlib import Path
subprocess.run(['node',str(Path(__file__).with_name('icons.mjs'))],check=True,cwd=Path(__file__).resolve().parent.parent)
