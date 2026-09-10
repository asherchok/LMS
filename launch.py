#!/usr/bin/env python3
"""Cross-platform launcher for LeetCode Management System.
Works on macOS, Linux, and Windows with Python 3.8+.
"""
import subprocess
import sys
import os
import webbrowser
import time

DIR = os.path.dirname(os.path.abspath(__file__))
VENV = os.path.join(DIR, '.venv')
REQ = os.path.join(DIR, 'requirements.txt')
PORT = 5001


def pip_exe():
    if sys.platform == 'win32':
        return os.path.join(VENV, 'Scripts', 'pip.exe')
    return os.path.join(VENV, 'bin', 'pip')


def python_exe():
    if sys.platform == 'win32':
        return os.path.join(VENV, 'Scripts', 'python.exe')
    return os.path.join(VENV, 'bin', 'python')


def setup():
    if not os.path.exists(VENV):
        print('[LMS] Creating virtual environment...')
        subprocess.check_call([sys.executable, '-m', 'venv', VENV])

    print('[LMS] Installing dependencies...')
    subprocess.check_call(
        [pip_exe(), 'install', '-q', '-r', REQ],
        stdout=subprocess.DEVNULL,
    )


def main():
    setup()
    url = f'http://localhost:{PORT}'
    print(f'[LMS] Starting server at {url}')

    env = os.environ.copy()
    env['FLASK_APP'] = 'app.py'

    proc = subprocess.Popen(
        [python_exe(), os.path.join(DIR, 'app.py')],
        cwd=DIR,
        env=env,
    )

    time.sleep(1.5)
    webbrowser.open(url)

    try:
        proc.wait()
    except KeyboardInterrupt:
        print('\n[LMS] Shutting down...')
        proc.terminate()


if __name__ == '__main__':
    main()
